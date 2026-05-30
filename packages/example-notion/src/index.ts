import { OrbitApp, createWorker, bearer } from "@orbit/app";
import { WorkspaceActor } from "./workspace.actor.js";
import { PageActor } from "./page.actor.js";
import { WorkspaceController } from "./workspace.controller.js";
import { PageController } from "./page.controller.js";
import { AuthController } from "./auth.controller.js";

@OrbitApp({
  actors: [WorkspaceActor, PageActor],
  controllers: [AuthController, WorkspaceController, PageController],
  channels: [
    {
      url: "/pages/:id/socket",
      actor: PageActor,
      idParam: "id",
      guards: [bearer("ORBIT_NOTION_SESSIONS")],
    },
  ],
  bindings: { KV: "ORBIT_NOTION_SESSIONS" },
})
export class NotionApp {}

const worker = createWorker(NotionApp);
export default worker;
export const { Workspace, Page } = worker;

export type * from "./types.js";
