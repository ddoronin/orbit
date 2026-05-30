import {
  Resource, Get, Post, Body, Param, Query, Auth,
  Inject, ActorRegistry, ACTOR_REGISTRY_TOKEN,
  NotFoundException, bearer,
} from '@orbit/app';
import { WorkspaceActor } from './workspace.actor.js';
import type { MemberRole, PageSummary, Session, WorkspaceState } from './types.js';

@Resource('/workspaces', { guards: [bearer('SESSIONS')] })
export class WorkspaceController {
  constructor(@Inject(ACTOR_REGISTRY_TOKEN) private actors: ActorRegistry) {}

  @Post('/')
  async create(@Body() body: { name: string }, @Auth() me: Session): Promise<WorkspaceState> {
    const id = crypto.randomUUID();
    return this.actors.ref(WorkspaceActor, id).call('workspace.create', {
      name: body.name,
      ownerId: me.userId,
    });
  }

  @Get('/:id')
  async show(@Param('id') id: string, @Auth() me: Session): Promise<WorkspaceState> {
    const ws = await this.actors.ref(WorkspaceActor, id).snapshot<WorkspaceState>();
    if (!ws.workspaceId) throw new NotFoundException(`Workspace ${id}`);
    assertMember(ws, me.userId);
    return ws;
  }

  @Get('/:id/pages')
  async listPages(
    @Param('id') id: string,
    @Query('parentPageId') parent: string | undefined,
    @Auth() me: Session,
  ): Promise<PageSummary[]> {
    await this.show(id, me);
    return this.actors.ref(WorkspaceActor, id).call('workspace.listPages', {
      parentPageId: parent ?? null,
    });
  }

  @Post('/:id/pages')
  async createPage(
    @Param('id') id: string,
    @Body() body: { title: string; parentPageId?: string | null },
    @Auth() me: Session,
  ): Promise<PageSummary> {
    await this.show(id, me);
    return this.actors.ref(WorkspaceActor, id).call('workspace.createPage', {
      authorId: me.userId,
      pageId: crypto.randomUUID(),
      title: body.title,
      parentPageId: body.parentPageId ?? null,
    });
  }

  @Post('/:id/invitations')
  async invite(
    @Param('id') id: string,
    @Body() body: { userId: string; role: Exclude<MemberRole, 'owner'> },
    @Auth() me: Session,
  ): Promise<void> {
    await this.actors.ref(WorkspaceActor, id).call('workspace.invite', {
      inviterId: me.userId,
      userId: body.userId,
      role: body.role,
    });
  }
}

function assertMember(ws: WorkspaceState, userId: string): void {
  if (!ws.members[userId]) throw new NotFoundException(`Workspace ${ws.workspaceId}`);
}
