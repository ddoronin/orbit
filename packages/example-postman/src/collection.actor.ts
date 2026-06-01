import { Actor, Handle, OrbitActor } from "@orbitstack/app";
import type {
  CollectionState,
  FolderNode,
  RequestDraft,
  ResponseExample,
} from "./types.js";

@Actor("Collection")
export class CollectionActor extends OrbitActor<CollectionState> {
  initialState(): CollectionState {
    return {
      collectionId: "",
      workspaceId: "",
      name: "",
      folders: {},
      requests: {},
      rootFolderIds: [],
      rootRequestIds: [],
      createdAt: 0,
      updatedAt: 0,
    };
  }

  @Handle("collection.init")
  async init(p: {
    collectionId: string;
    workspaceId: string;
    name: string;
  }): Promise<CollectionState> {
    if (this.state.collectionId) return this.state;
    const now = Date.now();
    this.updateState((s) => {
      s.collectionId = p.collectionId;
      s.workspaceId = p.workspaceId;
      s.name = p.name;
      s.createdAt = now;
      s.updatedAt = now;
    });
    return this.state;
  }

  @Handle("collection.rename")
  async rename(p: { name: string }): Promise<void> {
    this.updateState((s) => {
      s.name = p.name;
      s.updatedAt = Date.now();
    });
  }

  @Handle("collection.createFolder")
  async createFolder(p: {
    folderId: string;
    name: string;
    parentFolderId?: string | null;
  }): Promise<FolderNode> {
    const parentFolderId = p.parentFolderId ?? null;
    if (parentFolderId && !this.state.folders[parentFolderId]) {
      throw new Error(`Folder ${parentFolderId} not found`);
    }

    const now = Date.now();
    const folder: FolderNode = {
      folderId: p.folderId,
      name: p.name,
      parentFolderId,
      folderIds: [],
      requestIds: [],
      createdAt: now,
      updatedAt: now,
    };

    this.updateState((s) => {
      s.folders[p.folderId] = folder;
      const list = this.getFolderList(s, parentFolderId);
      list.push(p.folderId);
      s.updatedAt = now;
    });

    return folder;
  }

  @Handle("collection.renameFolder")
  async renameFolder(p: {
    folderId: string;
    name: string;
  }): Promise<FolderNode> {
    const folder = this.state.folders[p.folderId];
    if (!folder) throw new Error(`Folder ${p.folderId} not found`);

    let updated: FolderNode | null = null;
    this.updateState((s) => {
      const next = s.folders[p.folderId];
      next.name = p.name;
      next.updatedAt = Date.now();
      s.updatedAt = next.updatedAt;
      updated = { ...next };
    });

    if (!updated) throw new Error("Folder update failed");
    return updated;
  }

  @Handle("collection.deleteFolder")
  async deleteFolder(p: { folderId: string }): Promise<void> {
    if (!this.state.folders[p.folderId]) return;

    const folderIds: string[] = [];
    const requestIds: string[] = [];
    this.collectFolderSubtree(this.state, p.folderId, folderIds, requestIds);

    this.updateState((s) => {
      const root = s.folders[p.folderId];
      const siblings = this.getFolderList(s, root.parentFolderId);
      const index = siblings.indexOf(p.folderId);
      if (index >= 0) siblings.splice(index, 1);

      for (const requestId of requestIds) {
        delete s.requests[requestId];
      }
      for (const folderId of folderIds.reverse()) {
        delete s.folders[folderId];
      }
      s.updatedAt = Date.now();
    });
  }

  @Handle("collection.createRequest")
  async createRequest(p: {
    requestId: string;
    name: string;
    method: RequestDraft["method"];
    url: string;
    folderId?: string | null;
  }): Promise<RequestDraft> {
    const folderId = p.folderId ?? null;
    if (folderId && !this.state.folders[folderId]) {
      throw new Error(`Folder ${folderId} not found`);
    }

    const now = Date.now();
    const request: RequestDraft = {
      requestId: p.requestId,
      name: p.name,
      method: p.method,
      url: p.url,
      folderId,
      headers: [],
      query: [],
      body: { mode: "none" },
      auth: { type: "none" },
      examples: [],
      createdAt: now,
      updatedAt: now,
    };

    this.updateState((s) => {
      s.requests[p.requestId] = request;
      const list = this.getRequestList(s, folderId);
      list.push(p.requestId);
      s.updatedAt = now;
    });

    return request;
  }

  @Handle("collection.updateRequest")
  async updateRequest(p: {
    requestId: string;
    name?: string;
    method?: RequestDraft["method"];
    url?: string;
    headers?: RequestDraft["headers"];
    query?: RequestDraft["query"];
    body?: RequestDraft["body"];
    auth?: RequestDraft["auth"];
    preRequestScript?: string;
    testScript?: string;
  }): Promise<RequestDraft> {
    if (!this.state.requests[p.requestId]) {
      throw new Error(`Request ${p.requestId} not found`);
    }

    let updated: RequestDraft | null = null;
    this.updateState((s) => {
      const next = s.requests[p.requestId];
      if (p.name !== undefined) next.name = p.name;
      if (p.method !== undefined) next.method = p.method;
      if (p.url !== undefined) next.url = p.url;
      if (p.headers !== undefined) next.headers = p.headers;
      if (p.query !== undefined) next.query = p.query;
      if (p.body !== undefined) next.body = p.body;
      if (p.auth !== undefined) next.auth = p.auth;
      if (p.preRequestScript !== undefined) {
        next.preRequestScript = p.preRequestScript;
      }
      if (p.testScript !== undefined) {
        next.testScript = p.testScript;
      }
      next.updatedAt = Date.now();
      s.updatedAt = next.updatedAt;
      updated = JSON.parse(JSON.stringify(next)) as RequestDraft;
    });

    if (!updated) throw new Error("Request update failed");
    return updated;
  }

  @Handle("collection.moveRequest")
  async moveRequest(p: {
    requestId: string;
    folderId?: string | null;
    afterRequestId?: string | null;
  }): Promise<RequestDraft> {
    const request = this.state.requests[p.requestId];
    if (!request) throw new Error(`Request ${p.requestId} not found`);

    const targetFolderId = p.folderId ?? null;
    if (targetFolderId && !this.state.folders[targetFolderId]) {
      throw new Error(`Folder ${targetFolderId} not found`);
    }

    let moved: RequestDraft | null = null;
    this.updateState((s) => {
      const current = s.requests[p.requestId];
      const prevList = this.getRequestList(s, current.folderId);
      const prevIndex = prevList.indexOf(current.requestId);
      if (prevIndex >= 0) prevList.splice(prevIndex, 1);

      const nextList = this.getRequestList(s, targetFolderId);
      const after = p.afterRequestId ?? null;
      const nextIndex =
        after && nextList.includes(after)
          ? nextList.indexOf(after) + 1
          : nextList.length;
      nextList.splice(nextIndex, 0, current.requestId);

      current.folderId = targetFolderId;
      current.updatedAt = Date.now();
      s.updatedAt = current.updatedAt;
      moved = JSON.parse(JSON.stringify(current)) as RequestDraft;
    });

    if (!moved) throw new Error("Request move failed");
    return moved;
  }

  @Handle("collection.deleteRequest")
  async deleteRequest(p: { requestId: string }): Promise<void> {
    if (!this.state.requests[p.requestId]) return;

    this.updateState((s) => {
      const request = s.requests[p.requestId];
      const list = this.getRequestList(s, request.folderId);
      const index = list.indexOf(p.requestId);
      if (index >= 0) list.splice(index, 1);
      delete s.requests[p.requestId];
      s.updatedAt = Date.now();
    });
  }

  @Handle("collection.saveExample")
  async saveExample(p: {
    requestId: string;
    exampleId: string;
    name: string;
    status: number;
    headers: Record<string, string>;
    bodyText: string;
    durationMs: number;
  }): Promise<ResponseExample> {
    const request = this.state.requests[p.requestId];
    if (!request) throw new Error(`Request ${p.requestId} not found`);

    const example: ResponseExample = {
      exampleId: p.exampleId,
      name: p.name,
      status: p.status,
      headers: p.headers,
      bodyText: p.bodyText,
      durationMs: p.durationMs,
      createdAt: Date.now(),
    };

    this.updateState((s) => {
      s.requests[p.requestId].examples.unshift(example);
      s.requests[p.requestId].updatedAt = Date.now();
      s.updatedAt = Date.now();
    });

    return example;
  }

  @Handle("collection.listExamples")
  async listExamples(p: { requestId: string }): Promise<ResponseExample[]> {
    const request = this.state.requests[p.requestId];
    if (!request) throw new Error(`Request ${p.requestId} not found`);
    return request.examples;
  }

  @Handle("collection.replaceSnapshot")
  async replaceSnapshot(p: {
    snapshot: CollectionState;
  }): Promise<CollectionState> {
    this.setState(p.snapshot);
    return this.state;
  }

  @Handle("collection.export")
  async export(): Promise<CollectionState> {
    return this.state;
  }

  private getFolderList(
    state: CollectionState,
    parentFolderId: string | null,
  ): string[] {
    if (!parentFolderId) return state.rootFolderIds;
    const folder = state.folders[parentFolderId];
    if (!folder) throw new Error(`Folder ${parentFolderId} not found`);
    return folder.folderIds;
  }

  private getRequestList(
    state: CollectionState,
    folderId: string | null,
  ): string[] {
    if (!folderId) return state.rootRequestIds;
    const folder = state.folders[folderId];
    if (!folder) throw new Error(`Folder ${folderId} not found`);
    return folder.requestIds;
  }

  private collectFolderSubtree(
    state: CollectionState,
    folderId: string,
    folderIds: string[],
    requestIds: string[],
  ): void {
    const folder = state.folders[folderId];
    if (!folder) return;
    folderIds.push(folderId);
    requestIds.push(...folder.requestIds);
    for (const childId of folder.folderIds) {
      this.collectFolderSubtree(state, childId, folderIds, requestIds);
    }
  }
}
