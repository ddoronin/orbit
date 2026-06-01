// Idempotent schema init for the postman_request_history table.
// Runs once per worker isolate to avoid requiring `wrangler d1 migrations apply`
// before the demo works.

const ready = new WeakMap<D1Database, Promise<void>>();

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS postman_request_history (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL,
    collection_id TEXT NOT NULL,
    request_id TEXT NOT NULL,
    method TEXT NOT NULL,
    url TEXT NOT NULL,
    status INTEGER NOT NULL,
    duration_ms INTEGER NOT NULL,
    response_headers TEXT NOT NULL,
    response_body TEXT NOT NULL,
    created_at INTEGER NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_postman_history_collection_request_created
    ON postman_request_history(collection_id, request_id, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_postman_history_workspace_created
    ON postman_request_history(workspace_id, created_at DESC)`,
];

export function ensureHistorySchema(db: D1Database): Promise<void> {
  const cached = ready.get(db);
  if (cached) return cached;
  const p = db.batch(SCHEMA.map((sql) => db.prepare(sql))).then(() => undefined);
  ready.set(db, p);
  return p;
}
