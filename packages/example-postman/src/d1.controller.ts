import {
  Resource,
  Get,
  Query,
  Inject,
  D1_TOKEN,
  InternalServerErrorException,
  bearer,
} from "@orbitstack/app";
import type { HistoryEntry } from "./types.js";
import { ensureHistorySchema } from "./d1-schema.js";

@Resource("/d1", { guards: [bearer("ORBIT_POSTMAN_SESSIONS")] })
export class D1Controller {
  constructor(@Inject(D1_TOKEN) private db: D1Database | undefined) {}

  @Get("/history")
  async listHistory(
    @Query("collectionId") collectionId: string | undefined,
    @Query("requestId") requestId: string | undefined,
    @Query("limit") limitQuery: string | undefined,
  ): Promise<{ entries: HistoryEntry[] }> {
    const db = this.requireDb();
    await ensureHistorySchema(db);
    const limit = clampLimit(limitQuery);

    let sql =
      "SELECT id, workspace_id, collection_id, request_id, method, url, status, duration_ms, response_headers, response_body, created_at FROM postman_request_history";
    const bindings: Array<string | number> = [];
    const where: string[] = [];

    if (collectionId) {
      where.push("collection_id = ?");
      bindings.push(collectionId);
    }
    if (requestId) {
      where.push("request_id = ?");
      bindings.push(requestId);
    }

    if (where.length > 0) {
      sql += ` WHERE ${where.join(" AND ")}`;
    }

    sql += " ORDER BY created_at DESC LIMIT ?";
    bindings.push(limit);

    const result = await db
      .prepare(sql)
      .bind(...bindings)
      .all<{
        id: string;
        workspace_id: string;
        collection_id: string;
        request_id: string;
        method: HistoryEntry["method"];
        url: string;
        status: number;
        duration_ms: number;
        response_headers: string;
        response_body: string;
        created_at: number;
      }>();

    return {
      entries: (result.results ?? []).map((row) => ({
        id: row.id,
        workspaceId: row.workspace_id,
        collectionId: row.collection_id,
        requestId: row.request_id,
        method: row.method,
        url: row.url,
        status: row.status,
        durationMs: row.duration_ms,
        responseHeaders: safeParseHeaders(row.response_headers),
        responseBody: row.response_body,
        createdAt: row.created_at,
      })),
    };
  }

  private requireDb(): D1Database {
    if (!this.db) {
      throw new InternalServerErrorException(
        "No D1 binding configured for ORBIT_POSTMAN_DB",
      );
    }
    return this.db;
  }
}

function clampLimit(limitQuery: string | undefined): number {
  const value = Number(limitQuery ?? "20");
  if (!Number.isFinite(value)) return 20;
  return Math.min(Math.max(Math.trunc(value), 1), 200);
}

function safeParseHeaders(raw: string): Record<string, string> {
  try {
    const parsed = JSON.parse(raw) as Record<string, string>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}
