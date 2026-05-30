import { describe, expect, it, vi } from "vitest";
import { WorkspaceController } from "./workspace.controller.js";
import {
  SHARED_WORKSPACE_ID,
  SHARED_WORKSPACE_NAME,
  type Session,
  type WorkspaceState,
} from "./types.js";

function emptyWorkspace(): WorkspaceState {
  return {
    workspaceId: "",
    name: "",
    ownerId: "",
    members: {},
    pages: {},
    rootPageIds: [],
    createdAt: 0,
  };
}

function createWorkspaceRegistry(initialState = emptyWorkspace()) {
  const state = structuredClone(initialState);
  const sharedRef = {
    call: vi.fn(async (type: string, payload: any) => {
      if (type === "workspace.ensureInitialized") {
        if (!state.workspaceId) {
          state.workspaceId = payload.workspaceId;
          state.name = payload.name;
          state.ownerId = payload.ownerId;
          state.members = { [payload.ownerId]: "owner" };
          state.createdAt = 1;
        }
        return structuredClone(state);
      }
      if (type === "workspace.ensureMember") {
        if (!state.members[payload.userId])
          state.members[payload.userId] = payload.role ?? "editor";
        return structuredClone(state);
      }
      throw new Error(`Unexpected message: ${type}`);
    }),
    snapshot: vi.fn(async () => structuredClone(state)),
  };

  return {
    actors: {
      ref: vi.fn((_actor: unknown, id: string) => {
        if (id !== SHARED_WORKSPACE_ID)
          throw new Error(`Unexpected actor id: ${id}`);
        return sharedRef;
      }),
    },
    sharedRef,
    state,
  };
}

describe("WorkspaceController", () => {
  it("returns one shared workspace for all users", async () => {
    const { actors, state } = createWorkspaceRegistry();
    const controller = new WorkspaceController(actors as any);
    const alice: Session = { userId: "u-alice", displayName: "Alice" };
    const bob: Session = { userId: "u-bob", displayName: "Bob" };

    const first = await controller.create({ name: "Alice's workspace" }, alice);
    const second = await controller.create({ name: "Bob's workspace" }, bob);

    expect(first.workspaceId).toBe(SHARED_WORKSPACE_ID);
    expect(second.workspaceId).toBe(SHARED_WORKSPACE_ID);
    expect(second.name).toBe(SHARED_WORKSPACE_NAME);
    expect(state.ownerId).toBe("u-alice");
    expect(state.members).toEqual({
      "u-alice": "owner",
      "u-bob": "editor",
    });
  });

  it("auto-enrolls any authenticated user into the shared workspace", async () => {
    const initialState: WorkspaceState = {
      workspaceId: SHARED_WORKSPACE_ID,
      name: SHARED_WORKSPACE_NAME,
      ownerId: "u-alice",
      members: { "u-alice": "owner" },
      pages: {},
      rootPageIds: [],
      createdAt: 1,
    };
    const { actors } = createWorkspaceRegistry(initialState);
    const controller = new WorkspaceController(actors as any);

    const ws = await controller.show(SHARED_WORKSPACE_ID, {
      userId: "u-bob",
      displayName: "Bob",
    });

    expect(ws.members["u-bob"]).toBe("editor");
  });
});
