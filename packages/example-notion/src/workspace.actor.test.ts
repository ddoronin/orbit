import { describe, it, expect } from "vitest";
import { createTestActor } from "@orbit/testing";
import { WorkspaceActor } from "./workspace.actor.js";
import type { WorkspaceState } from "./types.js";

async function freshWorkspace(ownerId = "u-owner") {
  const handle = await createTestActor(WorkspaceActor);
  await handle.call<WorkspaceState>("workspace.create", {
    workspaceId: "ws-1",
    name: "Acme",
    ownerId,
  });
  return handle;
}

describe("WorkspaceActor", () => {
  it("initialState() returns an empty workspace shell", async () => {
    const handle = await createTestActor(WorkspaceActor);
    expect(handle.state.workspaceId).toBe("");
    expect(handle.state.members).toEqual({});
  });

  it("workspace.create initializes name + owner + members", async () => {
    const handle = await createTestActor(WorkspaceActor);
    const ws = await handle.call<WorkspaceState>("workspace.create", {
      workspaceId: "ws-1",
      name: "Notion",
      ownerId: "u1",
    });
    expect(ws.workspaceId).toBe("ws-1");
    expect(ws.name).toBe("Notion");
    expect(ws.ownerId).toBe("u1");
    expect(ws.members.u1).toBe("owner");
    expect(ws.createdAt).toBeGreaterThan(0);
  });

  it("workspace.create refuses a second init", async () => {
    const handle = await freshWorkspace();
    await expect(
      handle.call("workspace.create", {
        workspaceId: "ws-2",
        name: "X",
        ownerId: "u2",
      }),
    ).rejects.toThrow("already initialized");
  });

  it("workspace.ensureInitialized reuses the existing workspace", async () => {
    const handle = await freshWorkspace("u-owner");
    const ws = await handle.call<WorkspaceState>(
      "workspace.ensureInitialized",
      {
        workspaceId: "ws-2",
        name: "Other",
        ownerId: "u-other",
      },
    );
    expect(ws.workspaceId).toBe("ws-1");
    expect(ws.name).toBe("Acme");
    expect(ws.ownerId).toBe("u-owner");
  });

  it("workspace.ensureMember adds missing users as editors", async () => {
    const handle = await freshWorkspace("u-owner");
    const ws = await handle.call<WorkspaceState>("workspace.ensureMember", {
      userId: "u-bob",
    });
    expect(ws.members["u-bob"]).toBe("editor");
    expect(ws.members["u-owner"]).toBe("owner");
  });

  it("workspace.invite adds a member with the given role", async () => {
    const handle = await freshWorkspace("u-owner");
    await handle.call("workspace.invite", {
      inviterId: "u-owner",
      userId: "u-bob",
      role: "editor",
    });
    expect(handle.state.members["u-bob"]).toBe("editor");
  });

  it("workspace.invite rejects non-owner/editor invitations", async () => {
    const handle = await freshWorkspace("u-owner");
    await handle.call("workspace.invite", {
      inviterId: "u-owner",
      userId: "u-vw",
      role: "viewer",
    });
    await expect(
      handle.call("workspace.invite", {
        inviterId: "u-vw",
        userId: "u-x",
        role: "editor",
      }),
    ).rejects.toThrow(/lacks required role/);
  });

  it("workspace.createPage adds page and tracks as root by default", async () => {
    const handle = await freshWorkspace("u-owner");
    const summary = await handle.call("workspace.createPage", {
      authorId: "u-owner",
      pageId: "p-1",
      title: "Hello",
    });
    expect(summary).toMatchObject({
      pageId: "p-1",
      title: "Hello",
      parentPageId: null,
    });
    expect(handle.state.rootPageIds).toContain("p-1");
  });

  it("workspace.createPage records parent and does not duplicate in rootPageIds", async () => {
    const handle = await freshWorkspace();
    await handle.call("workspace.createPage", {
      authorId: "u-owner",
      pageId: "parent",
      title: "P",
    });
    await handle.call("workspace.createPage", {
      authorId: "u-owner",
      pageId: "child",
      title: "C",
      parentPageId: "parent",
    });
    expect(handle.state.rootPageIds).toEqual(["parent"]);
    expect(handle.state.pages["child"].parentPageId).toBe("parent");
  });

  it("workspace.createPage requires owner/editor role", async () => {
    const handle = await freshWorkspace();
    await handle.call("workspace.invite", {
      inviterId: "u-owner",
      userId: "u-vw",
      role: "viewer",
    });
    await expect(
      handle.call("workspace.createPage", {
        authorId: "u-vw",
        pageId: "p",
        title: "X",
      }),
    ).rejects.toThrow(/lacks required role/);
  });

  it("workspace.updatePageSummary patches title/icon/updatedAt", async () => {
    const handle = await freshWorkspace();
    await handle.call("workspace.createPage", {
      authorId: "u-owner",
      pageId: "p",
      title: "Old",
    });
    await handle.call("workspace.updatePageSummary", {
      pageId: "p",
      title: "New",
      icon: "📝",
      updatedAt: 12345,
    });
    expect(handle.state.pages["p"].title).toBe("New");
    expect(handle.state.pages["p"].icon).toBe("📝");
    expect(handle.state.pages["p"].updatedAt).toBe(12345);
  });

  it("workspace.updatePageSummary is a no-op for unknown pages", async () => {
    const handle = await freshWorkspace();
    await handle.call("workspace.updatePageSummary", {
      pageId: "nope",
      updatedAt: 1,
    });
    expect(handle.state.pages["nope"]).toBeUndefined();
  });

  it("workspace.listPages filters by parent and orders by updatedAt desc", async () => {
    const handle = await freshWorkspace();
    await handle.call("workspace.createPage", {
      authorId: "u-owner",
      pageId: "a",
      title: "A",
    });
    await handle.call("workspace.createPage", {
      authorId: "u-owner",
      pageId: "b",
      title: "B",
    });
    await handle.call("workspace.createPage", {
      authorId: "u-owner",
      pageId: "c",
      title: "C",
      parentPageId: "a",
    });
    // Force a's updatedAt to be older than b's so ordering is deterministic
    (handle.instance as any).state.pages["a"].updatedAt = 1;
    (handle.instance as any).state.pages["b"].updatedAt = 2;

    const roots = await handle.call("workspace.listPages", {
      parentPageId: null,
    });
    expect((roots as any[]).map((p) => p.pageId)).toEqual(["b", "a"]);
    const children = await handle.call("workspace.listPages", {
      parentPageId: "a",
    });
    expect((children as any[]).map((p) => p.pageId)).toEqual(["c"]);
  });
});
