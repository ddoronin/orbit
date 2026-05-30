import { describe, expect, it, vi } from "vitest";
import { PageController } from "./page.controller.js";
import {
  SHARED_WORKSPACE_ID,
  SHARED_WORKSPACE_NAME,
  type PageState,
  type Session,
  type WorkspaceState,
} from "./types.js";

function sharedWorkspaceState(): WorkspaceState {
  return {
    workspaceId: SHARED_WORKSPACE_ID,
    name: SHARED_WORKSPACE_NAME,
    ownerId: "u-alice",
    members: { "u-alice": "owner" },
    pages: {},
    rootPageIds: [],
    createdAt: 1,
  };
}

function pageState(pageId: string, title: string): PageState {
  return {
    pageId,
    workspaceId: SHARED_WORKSPACE_ID,
    title,
    icon: null,
    blocks: {},
    rootBlockIds: [],
    version: 0,
    createdAt: 1,
    updatedAt: 1,
    presence: {},
  };
}

describe("PageController", () => {
  it("lets any authenticated user create pages in the shared workspace", async () => {
    const workspace = sharedWorkspaceState();
    const workspaceRef = {
      call: vi.fn(async (type: string, payload: any) => {
        if (type === "workspace.ensureInitialized")
          return structuredClone(workspace);
        if (type === "workspace.ensureMember") {
          if (!workspace.members[payload.userId])
            workspace.members[payload.userId] = payload.role ?? "editor";
          return structuredClone(workspace);
        }
        if (type === "workspace.createPage") {
          return {
            pageId: "p-1",
            title: payload.title,
            icon: null,
            updatedAt: 1,
            parentPageId: payload.parentPageId ?? null,
          };
        }
        throw new Error(`Unexpected message: ${type}`);
      }),
      snapshot: vi.fn(async () => structuredClone(workspace)),
      cast: vi.fn(async () => undefined),
    };
    const pageRef = {
      call: vi.fn(async (type: string, payload: any) => {
        if (type !== "page.init")
          throw new Error(`Unexpected message: ${type}`);
        return pageState(payload.pageId, payload.title);
      }),
      snapshot: vi.fn(async () => pageState("p-1", "Shared doc")),
      cast: vi.fn(async () => undefined),
    };
    const actors = {
      ref: vi.fn((_actor: unknown, id: string) => {
        if (id === SHARED_WORKSPACE_ID) return workspaceRef;
        if (id === "p-1") return pageRef;
        throw new Error(`Unexpected actor id: ${id}`);
      }),
    };
    const controller = new PageController(actors as any);
    const bob: Session = { userId: "u-bob", displayName: "Bob" };

    const page = await controller.create(
      { workspaceId: SHARED_WORKSPACE_ID, title: "Shared doc" },
      bob,
    );

    expect(page.workspaceId).toBe(SHARED_WORKSPACE_ID);
    expect(workspace.members["u-bob"]).toBe("editor");
    expect(workspaceRef.call).toHaveBeenCalledWith(
      "workspace.createPage",
      expect.objectContaining({
        authorId: "u-bob",
        title: "Shared doc",
      }),
    );
  });
});
