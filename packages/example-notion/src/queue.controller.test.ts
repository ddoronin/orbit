import { describe, expect, it, vi } from "vitest";

import worker from "./index.js";

function makeMockD1Database() {
  const rows: Array<{
    id: string;
    user_id: string;
    display_name: string;
    created_at: number;
  }> = [];

  const db: D1Database = {
    prepare(sql: string) {
      let bindings: unknown[] = [];

      return {
        bind(...values: unknown[]) {
          bindings = values;
          return this;
        },
        async run() {
          if (sql.startsWith("INSERT INTO notion_login_events")) {
            rows.push({
              id: String(bindings[0]),
              user_id: String(bindings[1]),
              display_name: String(bindings[2]),
              created_at: Number(bindings[3]),
            });
          }
          return { success: true, meta: { changes: 1 } } as D1Result;
        },
        async all<T = unknown>() {
          if (
            sql.startsWith(
              "SELECT id, user_id, display_name, created_at FROM notion_login_events",
            )
          ) {
            const results = [...rows]
              .sort((a, b) => b.created_at - a.created_at)
              .slice(0, 20);
            return {
              results: results as T[],
              success: true,
              meta: {},
            } as D1Result<T>;
          }
          return { results: [] as T[], success: true, meta: {} } as D1Result<T>;
        },
        async first<T = unknown>() {
          const sorted = [...rows].sort((a, b) => b.created_at - a.created_at);
          return (sorted[0] as T | undefined) ?? null;
        },
      } as D1PreparedStatement;
    },
    async batch<T = unknown>(_statements: D1PreparedStatement[]) {
      return [] as D1Result<T>[];
    },
    async exec(_query: string) {
      return { count: 0, duration: 0 } as D1ExecResult;
    },
    dump() {
      return "";
    },
  };

  return { db, rows };
}

function makeMockQueue() {
  const sent: Array<{ body: unknown; options?: unknown }> = [];
  const queue = {
    async send(body: unknown, options?: unknown) {
      sent.push({ body, options });
    },
    async sendBatch(messages: Iterable<{ body: unknown }>) {
      for (const message of messages) {
        sent.push({ body: message.body, options: message });
      }
    },
  };
  return { queue, sent };
}

function makeBatch(queue: string, messages: unknown[]): MessageBatch<unknown> {
  return {
    queue,
    messages: messages.map((body, index) => ({
      id: `msg-${index}`,
      body,
      timestamp: new Date(),
      attempts: 1,
      ack: vi.fn(),
      retry: vi.fn(),
    })),
  } as unknown as MessageBatch<unknown>;
}

describe("QueueExampleController", () => {
  it("enqueues login events via HTTP and persists them via worker.queue", async () => {
    const { db } = makeMockD1Database();
    const { queue, sent } = makeMockQueue();
    const env = {
      ORBIT_NOTION_DB: db,
      ORBIT_NOTION_AUDIT_QUEUE: queue,
    } as any;

    const enqueue = await worker.fetch(
      new Request("https://example.local/queue/login-events", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userId: "u-bob", displayName: "Bob" }),
      }),
      env,
      {} as ExecutionContext,
    );

    expect(enqueue.status).toBe(200);
    const queued = (await enqueue.json()) as {
      queued: true;
      event: {
        id: string;
        userId: string;
        displayName: string;
        createdAt: number;
      };
    };
    expect(queued.queued).toBe(true);
    expect(queued.event.userId).toBe("u-bob");
    expect(sent).toHaveLength(1);

    expect(worker.queue).toBeTypeOf("function");
    await worker.queue!(
      makeBatch(
        "orbit-notion-audit-logins",
        sent.map((message) => message.body),
      ),
      env,
      {} as ExecutionContext,
    );

    const list = await worker.fetch(
      new Request("https://example.local/d1/login-events"),
      env,
      {} as ExecutionContext,
    );

    expect(list.status).toBe(200);
    const payload = (await list.json()) as {
      events: Array<{ id: string; userId: string; displayName: string }>;
    };
    expect(payload.events).toHaveLength(1);
    expect(payload.events[0]).toMatchObject({
      id: queued.event.id,
      userId: "u-bob",
      displayName: "Bob",
    });
  });

  it("returns validation error when displayName is missing", async () => {
    const { db } = makeMockD1Database();
    const { queue } = makeMockQueue();
    const env = {
      ORBIT_NOTION_DB: db,
      ORBIT_NOTION_AUDIT_QUEUE: queue,
    } as any;

    const enqueue = await worker.fetch(
      new Request("https://example.local/queue/login-events", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userId: "u-bob" }),
      }),
      env,
      {} as ExecutionContext,
    );

    expect(enqueue.status).toBe(400);
  });
});
