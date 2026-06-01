import { describe, expect, it, vi, afterEach } from "vitest";
import { ExecuteController } from "./execute.controller.js";
import type { CollectionState, WorkspaceState } from "./types.js";

function createCollectionState(): CollectionState {
  return {
    collectionId: "col-1",
    workspaceId: "ws-1",
    name: "Demo",
    folders: {},
    requests: {
      "req-1": {
        requestId: "req-1",
        name: "Get users",
        method: "GET",
        url: "{{baseUrl}}/users",
        folderId: null,
        headers: [
          {
            id: "h1",
            key: "x-token",
            value: "{{token}}",
            enabled: true,
          },
        ],
        query: [
          {
            id: "q1",
            key: "q",
            value: "{{queryValue}}",
            enabled: true,
          },
        ],
        body: { mode: "none" },
        auth: { type: "bearer", token: "{{token}}" },
        examples: [],
        createdAt: 1,
        updatedAt: 1,
      },
    },
    rootFolderIds: [],
    rootRequestIds: ["req-1"],
    createdAt: 1,
    updatedAt: 1,
  };
}

function createWorkspaceState(): WorkspaceState {
  return {
    workspaceId: "ws-1",
    name: "Demo",
    ownerId: "u-1",
    members: { "u-1": "owner" },
    collections: {},
    rootCollectionIds: [],
    environmentVariables: {
      baseUrl: "https://api.example.com",
      token: "abc123",
      queryValue: "orbit",
    },
    createdAt: 1,
  };
}

function makeMockD1() {
  const writes: unknown[][] = [];

  const db: D1Database = {
    prepare(_sql: string) {
      let bindings: unknown[] = [];
      return {
        bind(...values: unknown[]) {
          bindings = values;
          return this;
        },
        async run() {
          writes.push(bindings);
          return { success: true, meta: {} } as D1Result;
        },
      } as D1PreparedStatement;
    },
    async batch() {
      return [];
    },
  } as D1Database;

  return { db, writes };
}

describe("ExecuteController", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("resolves environment variables, applies auth, and writes history", async () => {
    const collection = createCollectionState();
    const workspace = createWorkspaceState();
    const { db, writes } = makeMockD1();

    const actors = {
      ref: vi.fn((actor: unknown) => {
        const actorName = (actor as { name?: string })?.name;
        if (actorName === "CollectionActor") {
          return {
            snapshot: vi.fn(async () => collection),
          };
        }

        return {
          snapshot: vi.fn(async () => workspace),
        };
      }),
    };

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    const controller = new ExecuteController(actors as any, db);

    const result = await controller.execute(
      "col-1",
      "req-1",
      {},
      { userId: "u-1", displayName: "Alice" },
    );

    expect("error" in result).toBe(false);
    if ("error" in result) return;

    expect(result.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    const [calledUrl, calledInit] = fetchSpy.mock.calls[0];
    expect(String(calledUrl)).toBe("https://api.example.com/users?q=orbit");
    expect((calledInit?.headers as Headers).get("authorization")).toBe(
      "Bearer abc123",
    );
    expect((calledInit?.headers as Headers).get("x-token")).toBe("abc123");

    expect(writes).toHaveLength(1);
    expect(writes[0][2]).toBe("col-1");
    expect(writes[0][3]).toBe("req-1");
  });
});
