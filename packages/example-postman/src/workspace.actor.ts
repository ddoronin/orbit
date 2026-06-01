import { Actor, Handle, OrbitActor } from "@orbitstack/app";
import type { CollectionSummary, MemberRole, WorkspaceState } from "./types.js";

@Actor("Workspace")
export class WorkspaceActor extends OrbitActor<WorkspaceState> {
  initialState(): WorkspaceState {
    return {
      workspaceId: "",
      name: "",
      ownerId: "",
      members: {},
      collections: {},
      rootCollectionIds: [],
      environmentVariables: {},
      createdAt: 0,
    };
  }

  @Handle("workspace.ensureInitialized")
  async ensureInitialized(p: {
    workspaceId: string;
    name: string;
    ownerId: string;
  }): Promise<WorkspaceState> {
    if (this.state.workspaceId) return this.state;
    this.updateState((s) => {
      s.workspaceId = p.workspaceId;
      s.name = p.name;
      s.ownerId = p.ownerId;
      s.members = { [p.ownerId]: "owner" };
      s.createdAt = Date.now();
    });
    return this.state;
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

  @Handle("workspace.listCollections")
  async listCollections(): Promise<CollectionSummary[]> {
    return this.state.rootCollectionIds
      .map((id) => this.state.collections[id])
      .filter((v): v is CollectionSummary => Boolean(v));
  }

  @Handle("workspace.createCollectionSummary")
  async createCollectionSummary(p: {
    authorId: string;
    collectionId: string;
    name: string;
  }): Promise<CollectionSummary> {
    this.assertRole(p.authorId, ["owner", "editor"]);
    const summary: CollectionSummary = {
      collectionId: p.collectionId,
      name: p.name,
      updatedAt: Date.now(),
    };

    this.updateState((s) => {
      s.collections[p.collectionId] = summary;
      s.rootCollectionIds.push(p.collectionId);
    });

    return summary;
  }

  @Handle("workspace.updateCollectionSummary")
  async updateCollectionSummary(p: {
    authorId: string;
    collectionId: string;
    name?: string;
  }): Promise<void> {
    this.assertRole(p.authorId, ["owner", "editor"]);
    if (!this.state.collections[p.collectionId]) return;

    this.updateState((s) => {
      const summary = s.collections[p.collectionId];
      if (p.name !== undefined) summary.name = p.name;
      summary.updatedAt = Date.now();
    });
  }

  @Handle("workspace.deleteCollectionSummary")
  async deleteCollectionSummary(p: {
    authorId: string;
    collectionId: string;
  }): Promise<void> {
    this.assertRole(p.authorId, ["owner", "editor"]);

    this.updateState((s) => {
      delete s.collections[p.collectionId];
      s.rootCollectionIds = s.rootCollectionIds.filter(
        (id) => id !== p.collectionId,
      );
    });
  }

  @Handle("workspace.upsertEnvironmentVariable")
  async upsertEnvironmentVariable(p: {
    authorId: string;
    key: string;
    value: string;
  }): Promise<Record<string, string>> {
    this.assertRole(p.authorId, ["owner", "editor"]);
    this.updateState((s) => {
      s.environmentVariables[p.key] = p.value;
    });
    return this.state.environmentVariables;
  }

  @Handle("workspace.deleteEnvironmentVariable")
  async deleteEnvironmentVariable(p: {
    authorId: string;
    key: string;
  }): Promise<Record<string, string>> {
    this.assertRole(p.authorId, ["owner", "editor"]);
    this.updateState((s) => {
      delete s.environmentVariables[p.key];
    });
    return this.state.environmentVariables;
  }

  @Handle("workspace.getEnvironmentVariables")
  async getEnvironmentVariables(): Promise<Record<string, string>> {
    return this.state.environmentVariables;
  }

  private assertRole(userId: string, allowed: MemberRole[]): void {
    const role = this.state.members[userId];
    if (!role || !allowed.includes(role)) {
      throw new Error(`User ${userId} lacks required role`);
    }
  }
}
