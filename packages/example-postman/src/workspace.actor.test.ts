import { describe, it, expect } from "vitest";
import { createTestActor } from "@orbitstack/testing";
import { WorkspaceActor } from "./workspace.actor.js";
import type { WorkspaceState } from "./types.js";

describe("WorkspaceActor", () => {
  it("initializes and tracks collection summaries", async () => {
    const handle = await createTestActor(WorkspaceActor);

    await handle.call<WorkspaceState>("workspace.ensureInitialized", {
      workspaceId: "ws-1",
      name: "API Lab",
      ownerId: "owner-1",
    });

    await handle.call("workspace.ensureMember", {
      userId: "editor-1",
      role: "editor",
    });

    const summary = await handle.call("workspace.createCollectionSummary", {
      authorId: "editor-1",
      collectionId: "col-1",
      name: "Collection A",
    });

    expect(summary.collectionId).toBe("col-1");
    expect(handle.state.rootCollectionIds).toEqual(["col-1"]);
  });

  it("stores environment variables", async () => {
    const handle = await createTestActor(WorkspaceActor);

    await handle.call("workspace.ensureInitialized", {
      workspaceId: "ws-1",
      name: "API Lab",
      ownerId: "owner-1",
    });

    const env = await handle.call<Record<string, string>>(
      "workspace.upsertEnvironmentVariable",
      {
        authorId: "owner-1",
        key: "baseUrl",
        value: "https://httpbin.org",
      },
    );

    expect(env.baseUrl).toBe("https://httpbin.org");
  });
});
