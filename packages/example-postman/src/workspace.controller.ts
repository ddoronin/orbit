import {
  Resource,
  Get,
  Post,
  Delete,
  Put,
  Body,
  Param,
  Auth,
  Inject,
  ActorRegistry,
  ACTOR_REGISTRY_TOKEN,
  NotFoundException,
  ForbiddenException,
  bearer,
} from "@orbitstack/app";
import { WorkspaceActor } from "./workspace.actor.js";
import { CollectionActor } from "./collection.actor.js";
import {
  SHARED_WORKSPACE_ID,
  SHARED_WORKSPACE_NAME,
  type CollectionState,
  type CollectionSummary,
  type MemberRole,
  type Session,
  type WorkspaceExport,
  type WorkspaceState,
} from "./types.js";

@Resource("/workspaces", { guards: [bearer("ORBIT_POSTMAN_SESSIONS")] })
export class WorkspaceController {
  constructor(@Inject(ACTOR_REGISTRY_TOKEN) private actors: ActorRegistry) {}

  @Post("/")
  async create(
    @Body() _body: { name?: string },
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

  @Get("/:id/collections")
  async listCollections(
    @Param("id") id: string,
    @Auth() me: Session,
  ): Promise<CollectionSummary[]> {
    await this.show(id, me);
    return this.actors
      .ref(WorkspaceActor, id)
      .call("workspace.listCollections", {});
  }

  @Post("/:id/collections")
  async createCollection(
    @Param("id") id: string,
    @Body() body: { name: string },
    @Auth() me: Session,
  ): Promise<CollectionState> {
    const ws = await this.show(id, me);
    assertEditor(ws, me.userId);

    const collectionId = crypto.randomUUID();
    await this.actors
      .ref(WorkspaceActor, id)
      .call("workspace.createCollectionSummary", {
        authorId: me.userId,
        collectionId,
        name: body.name || "New Collection",
      });

    return this.actors
      .ref(CollectionActor, collectionId)
      .call("collection.init", {
        collectionId,
        workspaceId: id,
        name: body.name || "New Collection",
      });
  }

  @Delete("/:id/collections/:collectionId")
  async deleteCollection(
    @Param("id") id: string,
    @Param("collectionId") collectionId: string,
    @Auth() me: Session,
  ): Promise<void> {
    const ws = await this.show(id, me);
    assertEditor(ws, me.userId);
    await this.actors
      .ref(WorkspaceActor, id)
      .cast("workspace.deleteCollectionSummary", {
        authorId: me.userId,
        collectionId,
      });
  }

  @Get("/:id/environments")
  async listEnvironmentVariables(
    @Param("id") id: string,
    @Auth() me: Session,
  ): Promise<Record<string, string>> {
    await this.show(id, me);
    return this.actors
      .ref(WorkspaceActor, id)
      .call("workspace.getEnvironmentVariables", {});
  }

  @Put("/:id/environments/:key")
  async upsertEnvironmentVariable(
    @Param("id") id: string,
    @Param("key") key: string,
    @Body() body: { value: string },
    @Auth() me: Session,
  ): Promise<Record<string, string>> {
    const ws = await this.show(id, me);
    assertEditor(ws, me.userId);
    return this.actors
      .ref(WorkspaceActor, id)
      .call("workspace.upsertEnvironmentVariable", {
        authorId: me.userId,
        key,
        value: body.value ?? "",
      });
  }

  @Delete("/:id/environments/:key")
  async deleteEnvironmentVariable(
    @Param("id") id: string,
    @Param("key") key: string,
    @Auth() me: Session,
  ): Promise<Record<string, string>> {
    const ws = await this.show(id, me);
    assertEditor(ws, me.userId);
    return this.actors
      .ref(WorkspaceActor, id)
      .call("workspace.deleteEnvironmentVariable", {
        authorId: me.userId,
        key,
      });
  }

  @Get("/:id/export")
  async exportWorkspace(
    @Param("id") id: string,
    @Auth() me: Session,
  ): Promise<WorkspaceExport> {
    const ws = await this.show(id, me);
    const collections = await this.actors
      .ref(WorkspaceActor, id)
      .call<CollectionSummary[]>("workspace.listCollections", {});

    const snapshots = await Promise.all(
      collections.map((summary) =>
        this.actors
          .ref(CollectionActor, summary.collectionId)
          .call("collection.export", {}),
      ),
    );

    return {
      workspaceId: ws.workspaceId,
      name: ws.name,
      environmentVariables: ws.environmentVariables,
      collections: snapshots,
    };
  }

  @Post("/:id/import")
  async importWorkspace(
    @Param("id") id: string,
    @Body()
    body: {
      collections?: CollectionState[];
      environmentVariables?: Record<string, string>;
    },
    @Auth() me: Session,
  ): Promise<{ imported: number }> {
    const ws = await this.show(id, me);
    assertEditor(ws, me.userId);

    const incoming = body.collections ?? [];
    let imported = 0;

    for (const snapshot of incoming) {
      const collectionId = crypto.randomUUID();
      const nextSnapshot: CollectionState = {
        ...snapshot,
        collectionId,
        workspaceId: id,
        updatedAt: Date.now(),
      };

      await this.actors
        .ref(CollectionActor, collectionId)
        .call("collection.replaceSnapshot", {
          snapshot: nextSnapshot,
        });

      await this.actors
        .ref(WorkspaceActor, id)
        .call("workspace.createCollectionSummary", {
          authorId: me.userId,
          collectionId,
          name: nextSnapshot.name || "Imported Collection",
        });
      imported += 1;
    }

    if (body.environmentVariables) {
      for (const [key, value] of Object.entries(body.environmentVariables)) {
        await this.actors
          .ref(WorkspaceActor, id)
          .call("workspace.upsertEnvironmentVariable", {
            authorId: me.userId,
            key,
            value,
          });
      }
    }

    return { imported };
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
  if (!ws.members[userId]) {
    throw new NotFoundException(`Workspace ${ws.workspaceId}`);
  }
}

function assertEditor(ws: WorkspaceState, userId: string): void {
  const role = ws.members[userId] as MemberRole | undefined;
  if (!role || role === "viewer") {
    throw new ForbiddenException("Editor role required");
  }
}
