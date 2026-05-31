CREATE TABLE IF NOT EXISTS notion_login_events (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  display_name TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_notion_login_events_created_at
  ON notion_login_events (created_at DESC);
