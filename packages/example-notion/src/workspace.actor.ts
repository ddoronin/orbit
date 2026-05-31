import { Actor, Handle, OrbitActor } from "@orbitstack/app";
import type { MemberRole, PageSummary, WorkspaceState } from "./types.js";

@Actor("Workspace")
export class WorkspaceActor extends OrbitActor<WorkspaceState> {
  initialState(): WorkspaceState {
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

  // The caller-supplied id is also what we use to look the workspace up later,
  // so the actor must store that name rather than `ctx.actorId` (which is the
  // hashed Durable Object id and would not round-trip through `idFromName`).
  @Handle("workspace.create")
  async create(p: {
    workspaceId: string;
    name: string;
    ownerId: string;
  }): Promise<WorkspaceState> {
    if (this.state.workspaceId)
      throw new Error("Workspace already initialized");
    return this.initializeWorkspace(p);
  }

  @Handle("workspace.ensureInitialized")
  async ensureInitialized(p: {
    workspaceId: string;
    name: string;
    ownerId: string;
  }): Promise<WorkspaceState> {
    if (this.state.workspaceId) return this.state;
    return this.initializeWorkspace(p);
  }

  @Handle("workspace.ensureMember")
  async ensureMember(p: {
    userId: string;
    role?: Exclude<MemberRole, "owner">;
  }): Promise<WorkspaceState> {
    if (!this.state.workspaceId) throw new Error("Workspace not initialized");
    if (!this.state.members[p.userId]) {
      this.updateState((s) => {
        s.members[p.userId] = p.role ?? "editor";
      });
    }
    return this.state;
  }

  private initializeWorkspace(p: {
    workspaceId: string;
    name: string;
    ownerId: string;
  }): WorkspaceState {
    this.updateState((s) => {
      s.workspaceId = p.workspaceId;
      s.name = p.name;
      s.ownerId = p.ownerId;
      s.members = { [p.ownerId]: "owner" };
      s.createdAt = Date.now();
    });
    return this.state;
  }

  @Handle("workspace.invite")
  async invite(p: {
    inviterId: string;
    userId: string;
    role: Exclude<MemberRole, "owner">;
  }): Promise<void> {
    this.assertRole(p.inviterId, ["owner", "editor"]);
    this.updateState((s) => {
      s.members[p.userId] = p.role;
    });
  }

  @Handle("workspace.createPage")
  async createPage(p: {
    authorId: string;
    pageId: string;
    title: string;
    parentPageId?: string | null;
  }): Promise<PageSummary> {
    this.assertRole(p.authorId, ["owner", "editor"]);
    const summary: PageSummary = {
      pageId: p.pageId,
      title: p.title,
      icon: null,
      updatedAt: Date.now(),
      parentPageId: p.parentPageId ?? null,
    };
    this.updateState((s) => {
      s.pages[p.pageId] = summary;
      if (!p.parentPageId) s.rootPageIds.push(p.pageId);
    });
    return summary;
  }

  @Handle("workspace.updatePageSummary")
  async updatePageSummary(p: {
    pageId: string;
    title?: string;
    icon?: string | null;
    updatedAt: number;
  }): Promise<void> {
    if (!this.state.pages[p.pageId]) return;
    this.updateState((s) => {
      const page = s.pages[p.pageId];
      if (p.title !== undefined) page.title = p.title;
      if (p.icon !== undefined) page.icon = p.icon;
      page.updatedAt = p.updatedAt;
    });
  }

  @Handle("workspace.listPages")
  async listPages(q: { parentPageId?: string | null }): Promise<PageSummary[]> {
    const parent = q.parentPageId ?? null;
    return Object.values(this.state.pages)
      .filter((p) => p.parentPageId === parent)
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }

  private assertRole(userId: string, allowed: MemberRole[]): void {
    const role = this.state.members[userId];
    if (!role || !allowed.includes(role)) {
      throw new Error(`User ${userId} lacks required role`);
    }
  }
}
