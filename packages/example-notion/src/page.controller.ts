import {
  Resource, Get, Post, Patch, Delete, Body, Param, Auth,
  Inject, ActorRegistry, ACTOR_REGISTRY_TOKEN,
  NotFoundException, ForbiddenException, bearer,
} from '@orbit/app';
import { PageActor } from './page.actor.js';
import { WorkspaceActor } from './workspace.actor.js';
import type { Block, BlockType, PageState, Session, WorkspaceState } from './types.js';

@Resource('/pages', { guards: [bearer('SESSIONS')] })
export class PageController {
  constructor(@Inject(ACTOR_REGISTRY_TOKEN) private actors: ActorRegistry) {}

  @Post('/')
  async create(
    @Body() body: { workspaceId: string; title: string; parentPageId?: string | null },
    @Auth() me: Session,
  ): Promise<PageState> {
    await this.assertEditor(body.workspaceId, me.userId);
    const summary = await this.actors.ref(WorkspaceActor, body.workspaceId).call('workspace.createPage', {
      authorId: me.userId,
      pageId: crypto.randomUUID(),
      title: body.title,
      parentPageId: body.parentPageId ?? null,
    });
    return this.actors.ref(PageActor, summary.pageId).call('page.init', {
      pageId: summary.pageId,
      workspaceId: body.workspaceId,
      title: body.title,
    });
  }

  @Get('/:id')
  async show(@Param('id') id: string, @Auth() me: Session): Promise<PageState> {
    const page = await this.actors.ref(PageActor, id).snapshot<PageState>();
    if (!page.pageId) throw new NotFoundException(`Page ${id}`);
    if (page.workspaceId) await this.assertMember(page.workspaceId, me.userId);
    return page;
  }

  @Patch('/:id')
  async setTitle(
    @Param('id') id: string,
    @Body() body: { title: string; icon?: string | null },
    @Auth() me: Session,
  ): Promise<void> {
    const page = await this.show(id, me);
    if (page.workspaceId) await this.assertEditor(page.workspaceId, me.userId);
    await this.actors.ref(PageActor, id).cast('page.title.set', body);
    if (page.workspaceId) {
      await this.actors.ref(WorkspaceActor, page.workspaceId).cast('workspace.updatePageSummary', {
        pageId: id,
        title: body.title,
        icon: body.icon,
        updatedAt: Date.now(),
      });
    }
  }

  @Post('/:id/blocks')
  async insertBlock(
    @Param('id') id: string,
    @Body() body: {
      type: BlockType;
      text?: string;
      parentBlockId?: string | null;
      afterBlockId?: string | null;
    },
    @Auth() me: Session,
  ): Promise<Block> {
    const page = await this.show(id, me);
    if (page.workspaceId) await this.assertEditor(page.workspaceId, me.userId);
    return this.actors.ref(PageActor, id).call('page.block.insert', {
      blockId: crypto.randomUUID(),
      ...body,
    });
  }

  @Patch('/:id/blocks/:blockId')
  async updateBlock(
    @Param('id') id: string,
    @Param('blockId') blockId: string,
    @Body() body: { text?: string; type?: BlockType; checked?: boolean; language?: string },
    @Auth() me: Session,
  ): Promise<Block> {
    const page = await this.show(id, me);
    if (page.workspaceId) await this.assertEditor(page.workspaceId, me.userId);
    return this.actors.ref(PageActor, id).call('page.block.update', { blockId, ...body });
  }

  @Delete('/:id/blocks/:blockId')
  async deleteBlock(
    @Param('id') id: string,
    @Param('blockId') blockId: string,
    @Auth() me: Session,
  ): Promise<void> {
    const page = await this.show(id, me);
    if (page.workspaceId) await this.assertEditor(page.workspaceId, me.userId);
    await this.actors.ref(PageActor, id).cast('page.block.delete', { blockId });
  }

  private async assertMember(workspaceId: string, userId: string): Promise<void> {
    const ws = await this.actors.ref(WorkspaceActor, workspaceId).snapshot<WorkspaceState>();
    if (!ws.members[userId]) throw new ForbiddenException();
  }

  private async assertEditor(workspaceId: string, userId: string): Promise<void> {
    const ws = await this.actors.ref(WorkspaceActor, workspaceId).snapshot<WorkspaceState>();
    const role = ws.members[userId];
    if (role !== 'owner' && role !== 'editor') throw new ForbiddenException();
  }
}
