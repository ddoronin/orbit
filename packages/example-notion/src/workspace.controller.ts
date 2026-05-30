import {
  Resource,
  Get,
  Post,
  Body,
  Param,
  Query,
  Auth,
  Inject,
  ActorRegistry,
  ACTOR_REGISTRY_TOKEN,
  NotFoundException,
  bearer,
} from "@orbit/app";
import { WorkspaceActor } from "./workspace.actor.js";
import {
  SHARED_WORKSPACE_ID,
  SHARED_WORKSPACE_NAME,
  type MemberRole,
  type PageSummary,
  type Session,
  type WorkspaceState,
} from "./types.js";

@Resource("/workspaces", { guards: [bearer("SESSIONS")] })
export class WorkspaceController {
  constructor(@Inject(ACTOR_REGISTRY_TOKEN) private actors: ActorRegistry) {}

  @Post("/")
  async create(
    @Body() _body: { name: string },
    @Auth() me: Session,
  ): Promise<WorkspaceState> {
    return this.ensureSharedWorkspace(me);
  }

  @Get("/:id")
  async show(
    @Param("id") id: string,
    @Auth() me: Session,
  ): Promise<WorkspaceState> {
    if (id === SHARED_WORKSPACE_ID) return this.ensureSharedWorkspace(me);
    const ws = await this.actors
      .ref(WorkspaceActor, id)
      .snapshot<WorkspaceState>();
    if (!ws.workspaceId) throw new NotFoundException(`Workspace ${id}`);
    assertMember(ws, me.userId);
    return ws;
  }

  @Get("/:id/pages")
  async listPages(
    @Param("id") id: string,
    @Query("parentPageId") parent: string | undefined,
    @Auth() me: Session,
  ): Promise<PageSummary[]> {
    await this.show(id, me);
    return this.actors.ref(WorkspaceActor, id).call("workspace.listPages", {
      parentPageId: parent ?? null,
    });
  }

  @Post("/:id/pages")
  async createPage(
    @Param("id") id: string,
    @Body() body: { title: string; parentPageId?: string | null },
    @Auth() me: Session,
  ): Promise<PageSummary> {
    await this.show(id, me);
    return this.actors.ref(WorkspaceActor, id).call("workspace.createPage", {
      authorId: me.userId,
      pageId: crypto.randomUUID(),
      title: body.title,
      parentPageId: body.parentPageId ?? null,
    });
  }

  @Post("/:id/invitations")
  async invite(
    @Param("id") id: string,
    @Body() body: { userId: string; role: Exclude<MemberRole, "owner"> },
    @Auth() me: Session,
  ): Promise<void> {
    await this.show(id, me);
    await this.actors.ref(WorkspaceActor, id).call("workspace.invite", {
      inviterId: me.userId,
      userId: body.userId,
      role: body.role,
    });
  }

  private async ensureSharedWorkspace(me: Session): Promise<WorkspaceState> {
    const ref = this.actors.ref(WorkspaceActor, SHARED_WORKSPACE_ID);
    await ref.call("workspace.ensureInitialized", {
      workspaceId: SHARED_WORKSPACE_ID,
      name: SHARED_WORKSPACE_NAME,
      ownerId: me.userId,
    });
    return ref.call("workspace.ensureMember", {
      userId: me.userId,
      role: "editor",
    });
  }
}

function assertMember(ws: WorkspaceState, userId: string): void {
  if (!ws.members[userId])
    throw new NotFoundException(`Workspace ${ws.workspaceId}`);
}
