import { Actor, Handle, OrbitActor, type ActorContext } from '@orbit/app';
import type { MemberRole, PageSummary, WorkspaceState } from './types.js';

@Actor('Workspace')
export class WorkspaceActor extends OrbitActor<WorkspaceState> {
  initialState(): WorkspaceState {
    return {
      workspaceId: '',
      name: '',
      ownerId: '',
      members: {},
      pages: {},
      rootPageIds: [],
      createdAt: 0,
    };
  }

  @Handle('workspace.create')
  async create(
    p: { name: string; ownerId: string },
    ctx: ActorContext,
  ): Promise<WorkspaceState> {
    if (this.state.workspaceId) throw new Error('Workspace already initialized');
    this.updateState((s) => {
      s.workspaceId = ctx.actorId;
      s.name = p.name;
      s.ownerId = p.ownerId;
      s.members = { [p.ownerId]: 'owner' };
      s.createdAt = Date.now();
    });
    return this.state;
  }

  @Handle('workspace.invite')
  async invite(p: {
    inviterId: string;
    userId: string;
    role: Exclude<MemberRole, 'owner'>;
  }): Promise<void> {
    this.assertRole(p.inviterId, ['owner', 'editor']);
    this.updateState((s) => {
      s.members[p.userId] = p.role;
    });
  }

  @Handle('workspace.createPage')
  async createPage(p: {
    authorId: string;
    pageId: string;
    title: string;
    parentPageId?: string | null;
  }): Promise<PageSummary> {
    this.assertRole(p.authorId, ['owner', 'editor']);
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

  @Handle('workspace.updatePageSummary')
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

  @Handle('workspace.listPages')
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
