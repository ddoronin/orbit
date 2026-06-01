import { describe, expect, it, vi, afterEach } from "vitest";
import { WorkspaceController } from "./workspace.controller.js";
import type { CollectionState, WorkspaceState } from "./types.js";

function workspaceState(): WorkspaceState {
  return {
    workspaceId: "ws-1",
    name: "Workspace",
    ownerId: "u-1",
    members: { "u-1": "owner" },
    collections: {
      "col-1": {
        collectionId: "col-1",
        name: "Existing",
        updatedAt: 1,
      },
    },
    rootCollectionIds: ["col-1"],
    environmentVariables: { baseUrl: "https://api.example.com" },
    createdAt: 1,
  };
}

function collectionSnapshot(collectionId: string): CollectionState {
  return {
    collectionId,
    workspaceId: "ws-1",
    name: `Collection ${collectionId}`,
    folders: {},
    requests: {},
    rootFolderIds: [],
    rootRequestIds: [],
    createdAt: 1,
    updatedAt: 1,
  };
}

describe("WorkspaceController", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("exports workspace payload with collection snapshots", async () => {
    const ws = workspaceState();

    const actors = {
      ref: vi.fn((_actor: unknown, id: string) => {
        if (id === "ws-1") {
          return {
            snapshot: vi.fn(async () => ws),
            call: vi.fn(async (type: string) => {
              if (type === "workspace.listCollections") {
                return [ws.collections["col-1"]];
              }
              throw new Error(`Unexpected workspace call: ${type}`);
            }),
          };
        }

        return {
          call: vi.fn(async (type: string) => {
            if (type === "collection.export") {
              return collectionSnapshot(id);
            }
            throw new Error(`Unexpected collection call: ${type}`);
          }),
        };
      }),
    };

    const controller = new WorkspaceController(actors as any);

    const payload = await controller.exportWorkspace("ws-1", {
      userId: "u-1",
      displayName: "Alice",
    });

    expect(payload.workspaceId).toBe("ws-1");
    expect(payload.collections).toHaveLength(1);
    expect(payload.collections[0].collectionId).toBe("col-1");
    expect(payload.environmentVariables.baseUrl).toBe(
      "https://api.example.com",
    );
  });

  it("imports collections and env vars into workspace", async () => {
    const ws = workspaceState();
    const createCollectionSummaryCalls: Array<Record<string, unknown>> = [];
    const replaceSnapshotCalls: Array<Record<string, unknown>> = [];
    const upsertEnvCalls: Array<Record<string, unknown>> = [];

    const uuidSpy = vi
      .spyOn(crypto, "randomUUID")
      .mockReturnValueOnce("import-col-1")
      .mockReturnValueOnce("import-col-2");

    const actors = {
      ref: vi.fn((_actor: unknown, id: string) => {
        if (id === "ws-1") {
          return {
            snapshot: vi.fn(async () => ws),
            call: vi.fn(
              async (type: string, payload: Record<string, unknown>) => {
                if (type === "workspace.createCollectionSummary") {
                  createCollectionSummaryCalls.push(payload);
                  return undefined;
                }
                if (type === "workspace.upsertEnvironmentVariable") {
                  upsertEnvCalls.push(payload);
                  return undefined;
                }
                throw new Error(`Unexpected workspace call: ${type}`);
              },
            ),
          };
        }

        return {
          call: vi.fn(
            async (type: string, payload: Record<string, unknown>) => {
              if (type === "collection.replaceSnapshot") {
                replaceSnapshotCalls.push(payload);
                return payload.snapshot;
              }
              throw new Error(`Unexpected collection call: ${type}`);
            },
          ),
        };
      }),
    };

    const controller = new WorkspaceController(actors as any);

    const result = await controller.importWorkspace(
      "ws-1",
      {
        collections: [collectionSnapshot("c-a"), collectionSnapshot("c-b")],
        environmentVariables: { token: "abc", region: "us" },
      },
      { userId: "u-1", displayName: "Alice" },
    );

    expect(result.imported).toBe(2);
    expect(createCollectionSummaryCalls).toHaveLength(2);
    expect(replaceSnapshotCalls).toHaveLength(2);
    expect(upsertEnvCalls).toHaveLength(2);
    expect(uuidSpy).toHaveBeenCalledTimes(2);

    const firstSnapshot = replaceSnapshotCalls[0].snapshot as CollectionState;
    expect(firstSnapshot.collectionId).toBe("import-col-1");
    expect(firstSnapshot.workspaceId).toBe("ws-1");
  });
});
