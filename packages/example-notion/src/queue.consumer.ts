import { Inject, D1_TOKEN, InternalServerErrorException } from "@orbit/app";
import { OrbitConsumer, QueueConsumer, type QueueMessage } from "@orbit/queues";

import type { LoginAuditEvent } from "./types.js";

@QueueConsumer("orbit-notion-audit-logins")
export class LoginAuditQueueConsumer extends OrbitConsumer<LoginAuditEvent> {
  constructor(@Inject(D1_TOKEN) private db: D1Database | undefined) {
    super();
  }

  async handle(message: QueueMessage<LoginAuditEvent>): Promise<void> {
    const event = message.body;
    await this.requireDb()
      .prepare(
        "INSERT INTO notion_login_events (id, user_id, display_name, created_at) VALUES (?, ?, ?, ?)",
      )
      .bind(event.id, event.userId, event.displayName, event.createdAt)
      .run();
  }

  private requireDb(): D1Database {
    if (!this.db) {
      throw new InternalServerErrorException(
        "No D1 binding configured for ORBIT_NOTION_DB",
      );
    }
    return this.db;
  }
}
