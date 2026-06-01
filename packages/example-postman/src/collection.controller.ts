import {
  Resource,
  Get,
  Post,
  Patch,
  Delete,
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
import { CollectionActor } from "./collection.actor.js";
import { WorkspaceActor } from "./workspace.actor.js";
import type {
  CollectionState,
  FolderNode,
  MemberRole,
  RequestDraft,
  ResponseExample,
  Session,
  WorkspaceState,
} from "./types.js";

@Resource("/collections", { guards: [bearer("ORBIT_POSTMAN_SESSIONS")] })
export class CollectionController {
  constructor(@Inject(ACTOR_REGISTRY_TOKEN) private actors: ActorRegistry) {}

  @Get("/:id")
  async show(
    @Param("id") id: string,
    @Auth() me: Session,
  ): Promise<CollectionState> {
    const collection = await this.actors
      .ref(CollectionActor, id)
      .snapshot<CollectionState>();
    if (!collection.collectionId)
      throw new NotFoundException(`Collection ${id}`);

    const ws = await this.actors
      .ref(WorkspaceActor, collection.workspaceId)
      .snapshot<WorkspaceState>();
    assertMember(ws, me.userId);

    return collection;
  }

  @Patch("/:id")
  async rename(
    @Param("id") id: string,
    @Body() body: { name: string },
    @Auth() me: Session,
  ): Promise<CollectionState> {
    const collection = await this.show(id, me);
    const ws = await this.actors
      .ref(WorkspaceActor, collection.workspaceId)
      .snapshot<WorkspaceState>();
    assertEditor(ws, me.userId);

    await this.actors.ref(CollectionActor, id).cast("collection.rename", {
      name: body.name,
    });

    await this.actors
      .ref(WorkspaceActor, ws.workspaceId)
      .cast("workspace.updateCollectionSummary", {
        authorId: me.userId,
        collectionId: id,
        name: body.name,
      });

    return this.show(id, me);
  }

  @Post("/:id/folders")
  async createFolder(
    @Param("id") id: string,
    @Body() body: { name: string; parentFolderId?: string | null },
    @Auth() me: Session,
  ): Promise<FolderNode> {
    const collection = await this.show(id, me);
    const ws = await this.actors
      .ref(WorkspaceActor, collection.workspaceId)
      .snapshot<WorkspaceState>();
    assertEditor(ws, me.userId);

    return this.actors
      .ref(CollectionActor, id)
      .call("collection.createFolder", {
        folderId: crypto.randomUUID(),
        name: body.name || "New Folder",
        parentFolderId: body.parentFolderId ?? null,
      });
  }

  @Patch("/:id/folders/:folderId")
  async renameFolder(
    @Param("id") id: string,
    @Param("folderId") folderId: string,
    @Body() body: { name: string },
    @Auth() me: Session,
  ): Promise<FolderNode> {
    const collection = await this.show(id, me);
    const ws = await this.actors
      .ref(WorkspaceActor, collection.workspaceId)
      .snapshot<WorkspaceState>();
    assertEditor(ws, me.userId);

    return this.actors
      .ref(CollectionActor, id)
      .call("collection.renameFolder", {
        folderId,
        name: body.name,
      });
  }

  @Delete("/:id/folders/:folderId")
  async deleteFolder(
    @Param("id") id: string,
    @Param("folderId") folderId: string,
    @Auth() me: Session,
  ): Promise<void> {
    const collection = await this.show(id, me);
    const ws = await this.actors
      .ref(WorkspaceActor, collection.workspaceId)
      .snapshot<WorkspaceState>();
    assertEditor(ws, me.userId);

    await this.actors.ref(CollectionActor, id).cast("collection.deleteFolder", {
      folderId,
    });
  }

  @Post("/:id/requests")
  async createRequest(
    @Param("id") id: string,
    @Body()
    body: {
      name: string;
      method: RequestDraft["method"];
      url: string;
      folderId?: string | null;
    },
    @Auth() me: Session,
  ): Promise<RequestDraft> {
    const collection = await this.show(id, me);
    const ws = await this.actors
      .ref(WorkspaceActor, collection.workspaceId)
      .snapshot<WorkspaceState>();
    assertEditor(ws, me.userId);

    return this.actors
      .ref(CollectionActor, id)
      .call("collection.createRequest", {
        requestId: crypto.randomUUID(),
        name: body.name || "New Request",
        method: body.method || "GET",
        url: body.url || "https://httpbin.org/get",
        folderId: body.folderId ?? null,
      });
  }

  @Patch("/:id/requests/:requestId")
  async updateRequest(
    @Param("id") id: string,
    @Param("requestId") requestId: string,
    @Body()
    body: {
      name?: string;
      method?: RequestDraft["method"];
      url?: string;
      headers?: RequestDraft["headers"];
      query?: RequestDraft["query"];
      body?: RequestDraft["body"];
      auth?: RequestDraft["auth"];
      preRequestScript?: string;
      testScript?: string;
    },
    @Auth() me: Session,
  ): Promise<RequestDraft> {
    const collection = await this.show(id, me);
    const ws = await this.actors
      .ref(WorkspaceActor, collection.workspaceId)
      .snapshot<WorkspaceState>();
    assertEditor(ws, me.userId);

    return this.actors
      .ref(CollectionActor, id)
      .call("collection.updateRequest", {
        requestId,
        ...body,
      });
  }

  @Post("/:id/requests/:requestId/move")
  async moveRequest(
    @Param("id") id: string,
    @Param("requestId") requestId: string,
    @Body() body: { folderId?: string | null; afterRequestId?: string | null },
    @Auth() me: Session,
  ): Promise<RequestDraft> {
    const collection = await this.show(id, me);
    const ws = await this.actors
      .ref(WorkspaceActor, collection.workspaceId)
      .snapshot<WorkspaceState>();
    assertEditor(ws, me.userId);

    return this.actors.ref(CollectionActor, id).call("collection.moveRequest", {
      requestId,
      folderId: body.folderId ?? null,
      afterRequestId: body.afterRequestId ?? null,
    });
  }

  @Delete("/:id/requests/:requestId")
  async deleteRequest(
    @Param("id") id: string,
    @Param("requestId") requestId: string,
    @Auth() me: Session,
  ): Promise<void> {
    const collection = await this.show(id, me);
    const ws = await this.actors
      .ref(WorkspaceActor, collection.workspaceId)
      .snapshot<WorkspaceState>();
    assertEditor(ws, me.userId);

    await this.actors
      .ref(CollectionActor, id)
      .cast("collection.deleteRequest", {
        requestId,
      });
  }

  @Post("/:id/requests/:requestId/examples")
  async saveExample(
    @Param("id") id: string,
    @Param("requestId") requestId: string,
    @Body()
    body: {
      name: string;
      status: number;
      headers: Record<string, string>;
      bodyText: string;
      durationMs: number;
    },
    @Auth() me: Session,
  ): Promise<ResponseExample> {
    const collection = await this.show(id, me);
    const ws = await this.actors
      .ref(WorkspaceActor, collection.workspaceId)
      .snapshot<WorkspaceState>();
    assertEditor(ws, me.userId);

    return this.actors.ref(CollectionActor, id).call("collection.saveExample", {
      requestId,
      exampleId: crypto.randomUUID(),
      name: body.name || "Example",
      status: body.status,
      headers: body.headers,
      bodyText: body.bodyText,
      durationMs: body.durationMs,
    });
  }

  @Get("/:id/requests/:requestId/examples")
  async listExamples(
    @Param("id") id: string,
    @Param("requestId") requestId: string,
    @Auth() me: Session,
  ): Promise<ResponseExample[]> {
    await this.show(id, me);
    return this.actors
      .ref(CollectionActor, id)
      .call("collection.listExamples", {
        requestId,
      });
  }

  @Get("/:id/export")
  async exportCollection(
    @Param("id") id: string,
    @Auth() me: Session,
  ): Promise<CollectionState> {
    await this.show(id, me);
    return this.actors.ref(CollectionActor, id).call("collection.export", {});
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
