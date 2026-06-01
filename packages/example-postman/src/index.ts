import { OrbitApp, createWorker } from "@orbitstack/app";
import { AuthController } from "./auth.controller.js";
import { WorkspaceController } from "./workspace.controller.js";
import { CollectionController } from "./collection.controller.js";
import { ExecuteController } from "./execute.controller.js";
import { D1Controller } from "./d1.controller.js";
import { WorkspaceActor } from "./workspace.actor.js";
import { CollectionActor } from "./collection.actor.js";

@OrbitApp({
  actors: [WorkspaceActor, CollectionActor],
  controllers: [
    AuthController,
    WorkspaceController,
    CollectionController,
    ExecuteController,
    D1Controller,
  ],
  bindings: {
    KV: "ORBIT_POSTMAN_SESSIONS",
    D1: "ORBIT_POSTMAN_DB",
  },
})
export class PostmanApp {}

const worker = createWorker(PostmanApp);

export default worker;
export const { Workspace, Collection } = worker;

export type * from "./types.js";
