import {
  OrbitApp,
  OrbitFactory,
  createWorker,
  bearer,
  D1_TOKEN,
} from "@orbit/app";
import { createQueueHandler } from "@orbit/queues";
import { WorkspaceActor } from "./workspace.actor.js";
import { PageActor } from "./page.actor.js";
import { WorkspaceController } from "./workspace.controller.js";
import { PageController } from "./page.controller.js";
import { AuthController } from "./auth.controller.js";
import { D1ExampleController } from "./d1.controller.js";
import { QueueExampleController } from "./queue.controller.js";
import { LoginAuditQueueConsumer } from "./queue.consumer.js";

@OrbitApp({
  actors: [WorkspaceActor, PageActor],
  controllers: [
    AuthController,
    WorkspaceController,
    PageController,
    D1ExampleController,
    QueueExampleController,
  ],
  providers: [LoginAuditQueueConsumer],
  channels: [
    {
      url: "/pages/:id/socket",
      actor: PageActor,
      idParam: "id",
      guards: [bearer("ORBIT_NOTION_SESSIONS")],
    },
  ],
  bindings: {
    KV: "ORBIT_NOTION_SESSIONS",
    D1: "ORBIT_NOTION_DB",
    Queue: { loginAudit: "ORBIT_NOTION_AUDIT_QUEUE" },
  },
})
export class NotionApp {}

const httpWorker = createWorker(NotionApp);
const queueRuntime = OrbitFactory.create(NotionApp, {
  registerEnvBindings: (container, env) => {
    if (env.ORBIT_NOTION_DB) {
      container.registerValue(D1_TOKEN, env.ORBIT_NOTION_DB);
    }
  },
  queueHandler: createQueueHandler({ consumers: [LoginAuditQueueConsumer] }),
});

const worker = Object.assign(httpWorker, {
  queue: queueRuntime.queue?.bind(queueRuntime),
});

export default worker;
export const { Workspace, Page } = worker;

export type * from "./types.js";
