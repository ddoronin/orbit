import { Actor, Handle, OnAlarm, OrbitActor } from "@orbit/app";
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
    const block: Block = {
      id: p.blockId,
      type: p.type,
      text: p.text ?? "",
      children: [],
    };
    this.bumpVersion((s) => {
      s.blocks[block.id] = block;
      const siblings = p.parentBlockId
        ? s.blocks[p.parentBlockId].children
        : s.rootBlockIds;
      const at = p.afterBlockId
        ? siblings.indexOf(p.afterBlockId) + 1
        : siblings.length;
      siblings.splice(at, 0, block.id);
    });
    this.broadcast("page.block.inserted", {
      block,
      version: this.state.version,
    });
    return block;
  }

  @Handle("page.block.update")
  async updateBlock(p: {
    blockId: string;
    text?: string;
    type?: BlockType;
    checked?: boolean;
    language?: string;
  }): Promise<Block> {
    if (!this.state.blocks[p.blockId])
      throw new Error(`Block ${p.blockId} not found`);
    this.bumpVersion((s) => {
      const b = s.blocks[p.blockId];
      if (p.text !== undefined) b.text = p.text;
      if (p.type !== undefined) b.type = p.type;
      if (p.checked !== undefined) b.checked = p.checked;
      if (p.language !== undefined) b.language = p.language;
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
