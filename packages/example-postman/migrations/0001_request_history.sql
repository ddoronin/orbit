CREATE TABLE IF NOT EXISTS postman_request_history (
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
);

CREATE INDEX IF NOT EXISTS idx_postman_history_collection_request_created
  ON postman_request_history(collection_id, request_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_postman_history_workspace_created
  ON postman_request_history(workspace_id, created_at DESC);
