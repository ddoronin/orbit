import { describe, expect, it } from "vitest";

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
          if (sql.startsWith("SELECT id, user_id, display_name, created_at FROM notion_login_events")) {
            const results = [...rows]
              .sort((a, b) => b.created_at - a.created_at)
              .slice(0, 20);
            return { results: results as T[], success: true, meta: {} } as D1Result<T>;
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

describe("D1ExampleController", () => {
  it("records and lists login audit events via worker routes", async () => {
    const { db } = makeMockD1Database();
    const env = { ORBIT_NOTION_DB: db } as any;

    const create = await worker.fetch(
      new Request("https://example.local/d1/login-events", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userId: "u-alice", displayName: "Alice" }),
      }),
      env,
      {} as ExecutionContext,
    );

    expect(create.status).toBe(200);
    const created = (await create.json()) as {
      id: string;
      userId: string;
      displayName: string;
      createdAt: number;
    };
    expect(created.userId).toBe("u-alice");
    expect(created.displayName).toBe("Alice");

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
      id: created.id,
      userId: "u-alice",
      displayName: "Alice",
    });
  });

  it("returns validation error when displayName is missing", async () => {
    const { db } = makeMockD1Database();
    const env = { ORBIT_NOTION_DB: db } as any;

    const create = await worker.fetch(
      new Request("https://example.local/d1/login-events", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userId: "u-alice" }),
      }),
      env,
      {} as ExecutionContext,
    );

    expect(create.status).toBe(400);
  });
});
