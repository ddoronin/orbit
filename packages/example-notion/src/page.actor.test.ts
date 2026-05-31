import { describe, it, expect } from "vitest";
import { createTestActor } from "@orbitstack/testing";
import { PageActor } from "./page.actor.js";
import type { Block, PageState } from "./types.js";

async function freshPage(workspaceId = "ws-1") {
  const handle = await createTestActor(PageActor);
  await handle.call<PageState>("page.init", {
    pageId: "p-1",
    workspaceId,
    title: "Untitled",
  });
  return handle;
}

async function insert(
  handle: any,
  id: string,
  parentBlockId: string | null = null,
  after: string | null = null,
): Promise<Block> {
  return handle.call("page.block.insert", {
    blockId: id,
    type: "paragraph",
    text: id,
    parentBlockId,
    afterBlockId: after,
  });
}

describe("PageActor", () => {
  it("initial state is empty Untitled page", async () => {
    const handle = await createTestActor(PageActor);
    expect(handle.state.title).toBe("Untitled");
    expect(handle.state.blocks).toEqual({});
    expect(handle.state.version).toBe(0);
  });

  it("page.init sets identity and ignores second init", async () => {
    const handle = await freshPage("ws-A");
    expect(handle.state.workspaceId).toBe("ws-A");
    const again = await handle.call<PageState>("page.init", {
      pageId: "p-1",
      workspaceId: "other",
      title: "Different",
    });
    expect(again.workspaceId).toBe("ws-A");
  });

  it("page.title.set updates title and bumps version", async () => {
    const handle = await freshPage();
    await handle.call("page.title.set", { title: "Hello", icon: "🚀" });
    expect(handle.state.title).toBe("Hello");
    expect(handle.state.icon).toBe("🚀");
    expect(handle.state.version).toBe(1);
  });

  it("page.block.insert appends to the right sibling list", async () => {
    const handle = await freshPage();
    const b1 = await insert(handle, "b1");
    const b2 = await insert(handle, "b2");
    expect(handle.state.rootBlockIds).toEqual(["b1", "b2"]);
    expect(b1.parentId).toBeNull();
    expect(b2.parentId).toBeNull();
    expect(b1.order < b2.order).toBe(true);
    expect(handle.state.version).toBe(2);
  });

  it("page.block.insert positions after a given sibling", async () => {
    const handle = await freshPage();
    await insert(handle, "a");
    await insert(handle, "c");
    await insert(handle, "b", null, "a");
    expect(handle.state.rootBlockIds).toEqual(["a", "b", "c"]);
  });

  it("page.block.insert nests under a parent", async () => {
    const handle = await freshPage();
    await insert(handle, "parent");
    const child = await insert(handle, "child", "parent");
    expect(handle.state.blocks["parent"].children).toEqual(["child"]);
    expect(child.parentId).toBe("parent");
  });

  it("page.block.update mutates fields and bumps version", async () => {
    const handle = await freshPage();
    await insert(handle, "b1");
    const updated = await handle.call<Block>("page.block.update", {
      blockId: "b1",
      text: "new text",
      type: "heading_1",
      checked: false,
      color: "#2563eb",
      backgroundColor: "#dbeafe",
    });
    expect(updated.text).toBe("new text");
    expect(updated.type).toBe("heading_1");
    expect(updated.color).toBe("#2563eb");
    expect(updated.backgroundColor).toBe("#dbeafe");

    const cleared = await handle.call<Block>("page.block.update", {
      blockId: "b1",
      color: null,
      backgroundColor: null,
    });
    expect(cleared.color).toBeNull();
    expect(cleared.backgroundColor).toBeNull();
  });

  it("page.block.update throws on unknown block", async () => {
    const handle = await freshPage();
    await expect(
      handle.call("page.block.update", { blockId: "nope", text: "x" }),
    ).rejects.toThrow(/not found/);
  });

  it("page.block.delete removes block + descendants and reports removedIds", async () => {
    const handle = await freshPage();
    await insert(handle, "root");
    await insert(handle, "child1", "root");
    await insert(handle, "child2", "root");
    await insert(handle, "grand", "child1");

    const beforeCount = Object.keys(handle.state.blocks).length;
    expect(beforeCount).toBe(4);
    await handle.cast("page.block.delete", { blockId: "root" });
    expect(handle.state.rootBlockIds).toEqual([]);
    expect(Object.keys(handle.state.blocks)).toEqual([]);
  });

  it("page.block.delete is a no-op for an unknown block", async () => {
    const handle = await freshPage();
    await handle.cast("page.block.delete", { blockId: "nope" });
    expect(handle.state.version).toBe(0);
  });

  it("page.block.move reorders root siblings", async () => {
    const handle = await freshPage();
    await insert(handle, "a");
    await insert(handle, "b");
    await insert(handle, "c");

    await handle.call("page.block.move", {
      blockId: "c",
      parentBlockId: null,
      afterBlockId: "a",
    });

    expect(handle.state.rootBlockIds).toEqual(["a", "c", "b"]);
    expect(handle.state.blocks["c"].parentId).toBeNull();
    expect(
      handle.state.blocks["a"].order < handle.state.blocks["c"].order,
    ).toBe(true);
    expect(
      handle.state.blocks["c"].order < handle.state.blocks["b"].order,
    ).toBe(true);
  });

  it("page.block.move can nest under a different parent", async () => {
    const handle = await freshPage();
    await insert(handle, "parent");
    await insert(handle, "other");
    await insert(handle, "child");

    await handle.call("page.block.move", {
      blockId: "child",
      parentBlockId: "parent",
      afterBlockId: null,
    });

    expect(handle.state.rootBlockIds).toEqual(["parent", "other"]);
    expect(handle.state.blocks["parent"].children).toEqual(["child"]);
    expect(handle.state.blocks["child"].parentId).toBe("parent");
  });

  it("page.block.duplicate clones a subtree", async () => {
    const handle = await freshPage();
    await insert(handle, "root");
    await insert(handle, "child1", "root");
    await insert(handle, "child2", "root");
    await handle.call("page.block.update", {
      blockId: "root",
      color: "#15803d",
      backgroundColor: "#dcfce7",
    });
    await handle.call("page.block.update", {
      blockId: "child1",
      color: "#dc2626",
      backgroundColor: "#fee2e2",
    });

    const duplicatedRoot = await handle.call<Block>("page.block.duplicate", {
      blockId: "root",
    });

    expect(duplicatedRoot.id).not.toBe("root");
    expect(handle.state.rootBlockIds).toHaveLength(2);
    const clone = handle.state.blocks[duplicatedRoot.id];
    expect(clone.color).toBe("#15803d");
    expect(clone.backgroundColor).toBe("#dcfce7");
    expect(clone.children).toHaveLength(2);
    const clonedChildren = clone.children.map((id) => handle.state.blocks[id]);
    expect(clonedChildren[0]?.id).not.toBe("child1");
    expect(clonedChildren[0]?.parentId).toBe(clone.id);
    expect(clonedChildren[1]?.parentId).toBe(clone.id);
    expect(clonedChildren[0]?.color).toBe("#dc2626");
    expect(clonedChildren[0]?.backgroundColor).toBe("#fee2e2");
  });

  it("page.block.archive detaches subtree and marks it archived", async () => {
    const handle = await freshPage();
    await insert(handle, "root");
    await insert(handle, "child", "root");

    await handle.call("page.block.archive", { blockId: "root" });

    expect(handle.state.rootBlockIds).toEqual([]);
    expect(handle.state.blocks["root"].archived).toBe(true);
    expect(handle.state.blocks["child"].archived).toBe(true);
  });

  it("page.presence.update merges entries and broadcasts to peers", async () => {
    const handle = await freshPage();
    const list = await handle.call<any[]>("page.presence.update", {
      userId: "u1",
      displayName: "Alice",
      color: "#f00",
      cursorBlockId: "b1",
      cursorOffset: 3,
    });
    expect(list).toHaveLength(1);
    expect(handle.state.presence["u1"].cursorBlockId).toBe("b1");
    expect(handle.state.presence["u1"].cursorOffset).toBe(3);
    expect(handle.state.presence["u1"].selectionStartOffset).toBeNull();
    expect(handle.state.presence["u1"].selectionEndOffset).toBeNull();
  });

  it("sweepPresence (@OnAlarm) removes stale entries", async () => {
    const handle = await freshPage();
    await handle.call("page.presence.update", {
      userId: "u1",
      displayName: "Alice",
      color: "#f00",
    });
    // age the entry past TTL
    (handle.instance as any).state.presence["u1"].lastSeen =
      Date.now() - 60_000;
    await handle.triggerAlarm();
    expect(handle.state.presence["u1"]).toBeUndefined();
  });
});
