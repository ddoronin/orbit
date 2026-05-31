import { Actor, Handle, OnAlarm, OrbitActor } from "@orbit/app";
import { orderKeyAfter, orderKeyBetween } from "./ordering.js";
import type { Block, BlockType, PageState, PresenceEntry } from "./types.js";

const PRESENCE_TTL_MS = 30_000;
const PRESENCE_SWEEP_INTERVAL_MS = 15_000;

@Actor("Page")
export class PageActor extends OrbitActor<PageState> {
  initialState(): PageState {
    return {
      pageId: "",
      workspaceId: null,
      title: "Untitled",
      icon: null,
      blocks: {},
      rootBlockIds: [],
      version: 0,
      createdAt: 0,
      updatedAt: 0,
      presence: {},
    };
  }

  async onActivate(): Promise<void> {
    if (Object.keys(this.state.presence).length > 0) {
      await this.setAlarm(Date.now() + PRESENCE_SWEEP_INTERVAL_MS);
    }
  }

  @Handle("page.init")
  async init(p: {
    pageId: string;
    workspaceId: string;
    title: string;
  }): Promise<PageState> {
    if (this.state.pageId) return this.state;
    const now = Date.now();
    this.updateState((s) => {
      s.pageId = p.pageId;
      s.workspaceId = p.workspaceId;
      s.title = p.title;
      s.createdAt = now;
      s.updatedAt = now;
    });
    return this.state;
  }

  @Handle("page.title.set")
  async setTitle(p: { title: string; icon?: string | null }): Promise<void> {
    this.bumpVersion((s) => {
      s.title = p.title;
      if (p.icon !== undefined) s.icon = p.icon;
    });
    this.broadcast("page.title.changed", {
      title: p.title,
      icon: p.icon ?? this.state.icon,
      version: this.state.version,
    });
  }

  @Handle("page.block.insert")
  async insertBlock(p: {
    blockId: string;
    type: BlockType;
    text?: string;
    parentBlockId?: string | null;
    afterBlockId?: string | null;
  }): Promise<Block> {
    let effectiveAfterBlockId: string | null = null;
    let block: Block | null = null;
    this.bumpVersion((s) => {
      const parentId = p.parentBlockId ?? null;
      const siblings = this.getSiblings(s, parentId);
      const insert = this.resolveInsertion(siblings, p.afterBlockId ?? null);
      effectiveAfterBlockId = insert.effectiveAfterBlockId;
      const order = this.computeOrderKey(s, siblings, insert.index);

      block = {
        id: p.blockId,
        type: p.type,
        text: p.text ?? "",
        parentId,
        order,
        children: [],
      };

      s.blocks[block.id] = block;
      siblings.splice(insert.index, 0, block.id);
    });
    if (!block) {
      throw new Error("Failed to create block");
    }
    this.broadcast("page.block.inserted", {
      block,
      parentBlockId: p.parentBlockId ?? null,
      afterBlockId: effectiveAfterBlockId,
      version: this.state.version,
    });
    return block;
  }

  @Handle("page.block.move")
  async moveBlock(p: {
    blockId: string;
    parentBlockId?: string | null;
    afterBlockId?: string | null;
  }): Promise<Block> {
    if (!this.state.blocks[p.blockId]) {
      throw new Error(`Block ${p.blockId} not found`);
    }

    if (p.parentBlockId && !this.state.blocks[p.parentBlockId]) {
      throw new Error(`Parent block ${p.parentBlockId} not found`);
    }

    if (
      p.parentBlockId &&
      this.isDescendant(this.state, p.parentBlockId, p.blockId)
    ) {
      throw new Error("Cannot move a block into its own subtree");
    }

    let moved: Block | null = null;
    let effectiveAfterBlockId: string | null = null;
    const parentBlockId = p.parentBlockId ?? null;
    this.bumpVersion((s) => {
      const block = s.blocks[p.blockId];
      this.detach(s, block.id);

      const siblings = this.getSiblings(s, parentBlockId);
      const insert = this.resolveInsertion(siblings, p.afterBlockId ?? null);
      effectiveAfterBlockId = insert.effectiveAfterBlockId;
      const order = this.computeOrderKey(s, siblings, insert.index);

      block.parentId = parentBlockId;
      block.order = order;
      siblings.splice(insert.index, 0, block.id);
      moved = { ...block };
    });

    if (!moved) {
      throw new Error("Failed to move block");
    }

    this.broadcast("page.block.moved", {
      block: moved,
      parentBlockId,
      afterBlockId: effectiveAfterBlockId,
      version: this.state.version,
    });
    return moved;
  }

  @Handle("page.block.duplicate")
  async duplicateBlock(p: {
    blockId: string;
    afterBlockId?: string | null;
  }): Promise<Block> {
    const source = this.state.blocks[p.blockId];
    if (!source) throw new Error(`Block ${p.blockId} not found`);

    const sourceIds: string[] = [];
    this.collectSubtree(this.state, source.id, sourceIds);

    const idMap = new Map<string, string>();
    for (const id of sourceIds) {
      idMap.set(id, crypto.randomUUID());
    }

    let duplicatedRootId: string | null = null;
    let duplicatedRootParentId: string | null = null;
    let payloadBlocks: Block[] = [];
    let effectiveAfterBlockId: string | null = null;
    this.bumpVersion((s) => {
      const clones: Record<string, Block> = {};

      for (const oldId of sourceIds) {
        const oldBlock = s.blocks[oldId];
        const cloneId = idMap.get(oldId)!;
        clones[oldId] = {
          id: cloneId,
          type: oldBlock.type,
          text: oldBlock.text,
          checked: oldBlock.checked,
          language: oldBlock.language,
          color: oldBlock.color,
          backgroundColor: oldBlock.backgroundColor,
          parentId: null,
          order: "",
          archived: false,
          children: [],
        };
      }

      for (const oldId of sourceIds) {
        const oldBlock = s.blocks[oldId];
        const clone = clones[oldId];
        clone.children = oldBlock.children
          .map((childId) => idMap.get(childId))
          .filter((v): v is string => Boolean(v));

        const cloneParentOldId = oldBlock.parentId;
        if (cloneParentOldId && clones[cloneParentOldId]) {
          clone.parentId = clones[cloneParentOldId].id;
        }
      }

      const parentId = source.parentId ?? null;
      const siblings = this.getSiblings(s, parentId);
      const preferredAfter = p.afterBlockId ?? source.id;
      const insert = this.resolveInsertion(siblings, preferredAfter);
      effectiveAfterBlockId = insert.effectiveAfterBlockId;

      const sourceClone = clones[source.id];
      sourceClone.parentId = parentId;
      sourceClone.order = this.computeOrderKey(s, siblings, insert.index);
      siblings.splice(insert.index, 0, sourceClone.id);

      this.assignChildOrderKeys(s, clones, source.id);

      for (const oldId of sourceIds) {
        const clone = clones[oldId];
        s.blocks[clone.id] = clone;
      }

      duplicatedRootId = sourceClone.id;
      duplicatedRootParentId = sourceClone.parentId;
      payloadBlocks = sourceIds.map((oldId) => ({ ...clones[oldId] }));
    });

    if (!duplicatedRootId) {
      throw new Error("Failed to duplicate block");
    }

    this.broadcast("page.block.duplicated", {
      rootBlockId: duplicatedRootId,
      parentBlockId: duplicatedRootParentId,
      afterBlockId: effectiveAfterBlockId,
      blocks: payloadBlocks,
      version: this.state.version,
    });
    return this.state.blocks[duplicatedRootId];
  }

  @Handle("page.block.archive")
  async archiveBlock(p: {
    blockId: string;
    archived?: boolean;
  }): Promise<void> {
    const target = this.state.blocks[p.blockId];
    if (!target) return;

    const shouldArchive = p.archived ?? true;
    if (!shouldArchive) {
      throw new Error("Unarchive is not implemented yet");
    }

    const affectedIds: string[] = [];
    this.bumpVersion((s) => {
      this.detach(s, p.blockId);
      this.collectSubtree(s, p.blockId, affectedIds);
      for (const id of affectedIds) {
        s.blocks[id].archived = true;
      }
    });

    this.broadcast("page.block.archived", {
      blockId: p.blockId,
      archived: true,
      affectedIds,
      version: this.state.version,
    });
  }

  @Handle("page.block.update")
  async updateBlock(p: {
    blockId: string;
    text?: string;
    type?: BlockType;
    checked?: boolean;
    language?: string;
    color?: string | null;
    backgroundColor?: string | null;
  }): Promise<Block> {
    if (!this.state.blocks[p.blockId])
      throw new Error(`Block ${p.blockId} not found`);
    this.bumpVersion((s) => {
      const b = s.blocks[p.blockId];
      if (p.text !== undefined) b.text = p.text;
      if (p.type !== undefined) b.type = p.type;
      if (p.checked !== undefined) b.checked = p.checked;
      if (p.language !== undefined) b.language = p.language;
      if (p.color !== undefined) b.color = p.color;
      if (p.backgroundColor !== undefined)
        b.backgroundColor = p.backgroundColor;
    });
    const updated = this.state.blocks[p.blockId];
    this.broadcast("page.block.updated", {
      block: updated,
      version: this.state.version,
    });
    return updated;
  }

  @Handle("page.block.delete")
  async deleteBlock(p: { blockId: string }): Promise<void> {
    if (!this.state.blocks[p.blockId]) return;
    const removed: string[] = [];
    this.bumpVersion((s) => {
      this.detach(s, p.blockId);
      this.collectSubtree(s, p.blockId, removed);
      for (const id of removed) delete s.blocks[id];
    });
    this.broadcast("page.block.deleted", {
      blockId: p.blockId,
      removedIds: removed,
      version: this.state.version,
    });
  }

  @Handle("page.presence.update")
  async updatePresence(p: {
    userId: string;
    displayName: string;
    color: string;
    cursorBlockId?: string | null;
    cursorOffset?: number | null;
    selectionStartOffset?: number | null;
    selectionEndOffset?: number | null;
  }): Promise<PresenceEntry[]> {
    const entry: PresenceEntry = {
      userId: p.userId,
      displayName: p.displayName,
      color: p.color,
      cursorBlockId: p.cursorBlockId ?? null,
      cursorOffset: p.cursorOffset ?? null,
      selectionStartOffset: p.selectionStartOffset ?? null,
      selectionEndOffset: p.selectionEndOffset ?? null,
      lastSeen: Date.now(),
    };
    this.updateState((s) => {
      s.presence[p.userId] = entry;
    });
    this.broadcast("page.presence.changed", { entry });
    await this.setAlarm(Date.now() + PRESENCE_SWEEP_INTERVAL_MS);
    return Object.values(this.state.presence);
  }

  @OnAlarm()
  async sweepPresence(): Promise<void> {
    const cutoff = Date.now() - PRESENCE_TTL_MS;
    const expired: string[] = [];
    this.updateState((s) => {
      for (const [userId, e] of Object.entries(s.presence)) {
        if (e.lastSeen < cutoff) {
          expired.push(userId);
          delete s.presence[userId];
        }
      }
    });
    for (const userId of expired) {
      this.broadcast("page.presence.left", { userId });
    }
    if (Object.keys(this.state.presence).length > 0) {
      await this.setAlarm(Date.now() + PRESENCE_SWEEP_INTERVAL_MS);
    }
  }

  private bumpVersion(mutator: (s: PageState) => void): void {
    this.updateState((s) => {
      mutator(s);
      s.version += 1;
      s.updatedAt = Date.now();
    });
  }

  private getSiblings(s: PageState, parentId: string | null): string[] {
    if (!parentId) return s.rootBlockIds;
    const parent = s.blocks[parentId];
    if (!parent) throw new Error(`Parent block ${parentId} not found`);
    return parent.children;
  }

  private resolveInsertion(
    siblings: string[],
    afterBlockId: string | null,
  ): { index: number; effectiveAfterBlockId: string | null } {
    const afterIdx = afterBlockId ? siblings.indexOf(afterBlockId) : -1;
    if (afterIdx >= 0) {
      return {
        index: afterIdx + 1,
        effectiveAfterBlockId: afterBlockId,
      };
    }

    return {
      index: siblings.length,
      effectiveAfterBlockId: null,
    };
  }

  private computeOrderKey(
    s: PageState,
    siblings: string[],
    insertAt: number,
  ): string {
    const beforeId = insertAt > 0 ? siblings[insertAt - 1] : null;
    const afterId = insertAt < siblings.length ? siblings[insertAt] : null;
    const before = beforeId ? (s.blocks[beforeId]?.order ?? null) : null;
    const after = afterId ? (s.blocks[afterId]?.order ?? null) : null;
    return orderKeyBetween(before, after);
  }

  private assignChildOrderKeys(
    s: PageState,
    clones: Record<string, Block>,
    oldRootId: string,
  ): void {
    const stack: string[] = [oldRootId];
    while (stack.length > 0) {
      const oldParentId = stack.pop()!;
      const oldParent = s.blocks[oldParentId];
      const cloneParent = clones[oldParentId];

      let prevOrder: string | null = null;
      for (const oldChildId of oldParent.children) {
        if (!clones[oldChildId]) continue;
        const childClone = clones[oldChildId];
        childClone.parentId = cloneParent.id;
        childClone.order = orderKeyAfter(prevOrder);
        prevOrder = childClone.order;
        stack.push(oldChildId);
      }
    }
  }

  private isDescendant(
    s: PageState,
    possibleDescendantId: string,
    possibleAncestorId: string,
  ): boolean {
    let cursor: string | null = possibleDescendantId;
    while (cursor) {
      if (cursor === possibleAncestorId) return true;
      cursor = s.blocks[cursor]?.parentId ?? null;
    }
    return false;
  }

  private detach(s: PageState, id: string): void {
    const rootIdx = s.rootBlockIds.indexOf(id);
    if (rootIdx >= 0) {
      s.rootBlockIds.splice(rootIdx, 1);
      return;
    }
    for (const block of Object.values(s.blocks)) {
      const idx = block.children.indexOf(id);
      if (idx >= 0) {
        block.children.splice(idx, 1);
        return;
      }
    }
  }

  private collectSubtree(s: PageState, id: string, out: string[]): void {
    const b = s.blocks[id];
    if (!b) return;
    out.push(id);
    for (const c of b.children) this.collectSubtree(s, c, out);
  }
}
