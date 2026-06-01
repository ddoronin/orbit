import { describe, it, expect } from "vitest";
import { createTestActor } from "@orbitstack/testing";
import { CollectionActor } from "./collection.actor.js";
import type { CollectionState, RequestDraft } from "./types.js";

async function freshCollection() {
  const handle = await createTestActor(CollectionActor);
  await handle.call<CollectionState>("collection.init", {
    collectionId: "col-1",
    workspaceId: "ws-1",
    name: "Demo",
  });
  return handle;
}

describe("CollectionActor", () => {
  it("creates folders and nested requests", async () => {
    const handle = await freshCollection();

    const folder = await handle.call("collection.createFolder", {
      folderId: "f-1",
      name: "Users",
    });

    const request = await handle.call<RequestDraft>(
      "collection.createRequest",
      {
        requestId: "r-1",
        name: "Get users",
        method: "GET",
        url: "https://api.test/users",
        folderId: folder.folderId,
      },
    );

    expect(handle.state.rootFolderIds).toEqual(["f-1"]);
    expect(handle.state.folders["f-1"].requestIds).toEqual(["r-1"]);
    expect(request.folderId).toBe("f-1");
  });

  it("saves response examples on a request", async () => {
    const handle = await freshCollection();

    await handle.call("collection.createRequest", {
      requestId: "r-1",
      name: "Get users",
      method: "GET",
      url: "https://api.test/users",
    });

    const example = await handle.call("collection.saveExample", {
      requestId: "r-1",
      exampleId: "e-1",
      name: "200 OK",
      status: 200,
      headers: { "content-type": "application/json" },
      bodyText: '{"ok":true}',
      durationMs: 42,
    });

    expect(example.status).toBe(200);
    expect(handle.state.requests["r-1"].examples).toHaveLength(1);
  });
});
