import {
  Resource,
  Post,
  Get,
  Body,
  Inject,
  D1_TOKEN,
  BadRequestException,
  InternalServerErrorException,
} from "@orbit/app";
import type { LoginAuditEvent } from "./types.js";

@Resource("/d1")
export class D1ExampleController {
  constructor(@Inject(D1_TOKEN) private db: D1Database | undefined) {}

  @Post("/login-events")
  async recordLogin(
    @Body() body: { userId?: string; displayName?: string },
  ): Promise<LoginAuditEvent> {
    const displayName = (body.displayName ?? "").trim();
    if (!displayName) {
      throw new BadRequestException("displayName is required");
    }

    const event: LoginAuditEvent = {
      id: crypto.randomUUID(),
      userId: (body.userId ?? displayName.toLowerCase().replace(/[^a-z0-9]+/g, "-")).replace(
        /^-+|-+$/g,
        "",
      ) || crypto.randomUUID(),
      displayName,
      createdAt: Date.now(),
    };

    const db = this.requireDb();
    await db
      .prepare(
        "INSERT INTO notion_login_events (id, user_id, display_name, created_at) VALUES (?, ?, ?, ?)",
      )
      .bind(event.id, event.userId, event.displayName, event.createdAt)
      .run();

    return event;
  }

  @Get("/login-events")
  async listRecent(): Promise<{ events: LoginAuditEvent[] }> {
    const db = this.requireDb();
    const result = await db
      .prepare(
        "SELECT id, user_id, display_name, created_at FROM notion_login_events ORDER BY created_at DESC LIMIT 20",
      )
      .all<{
        id: string;
        user_id: string;
        display_name: string;
        created_at: number;
      }>();

    return {
      events: (result.results ?? []).map((row) => ({
        id: row.id,
        userId: row.user_id,
        displayName: row.display_name,
        createdAt: row.created_at,
      })),
    };
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
