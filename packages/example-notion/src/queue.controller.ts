import {
  Resource,
  Post,
  Body,
  Inject,
  ENV_TOKEN,
  BadRequestException,
  InternalServerErrorException,
} from "@orbit/app";
import { QueueProducer } from "@orbit/queues";
import type { LoginAuditEvent } from "./types.js";

@Resource("/queue")
export class QueueExampleController {
  constructor(
    @Inject(ENV_TOKEN)
    private env: { ORBIT_NOTION_AUDIT_QUEUE?: unknown },
  ) {}

  @Post("/login-events")
  async enqueueLogin(
    @Body() body: { userId?: string; displayName?: string },
  ): Promise<{ queued: true; event: LoginAuditEvent }> {
    const displayName = (body.displayName ?? "").trim();
    if (!displayName) {
      throw new BadRequestException("displayName is required");
    }

    const event: LoginAuditEvent = {
      id: crypto.randomUUID(),
      userId:
        (
          body.userId ?? displayName.toLowerCase().replace(/[^a-z0-9]+/g, "-")
        ).replace(/^-+|-+$/g, "") || crypto.randomUUID(),
      displayName,
      createdAt: Date.now(),
    };

    const queue = this.requireQueue();
    await new QueueProducer<LoginAuditEvent>(queue).send(event);

    return { queued: true, event };
  }

  private requireQueue(): {
    send: (body: LoginAuditEvent, options?: unknown) => Promise<void>;
  } {
    const queue = this.env.ORBIT_NOTION_AUDIT_QUEUE as
      | { send: (body: LoginAuditEvent, options?: unknown) => Promise<void> }
      | undefined;
    if (!queue || typeof queue.send !== "function") {
      throw new InternalServerErrorException(
        "No Queue binding configured for ORBIT_NOTION_AUDIT_QUEUE",
      );
    }
    return queue;
  }
}
