CREATE TABLE IF NOT EXISTS interactive_session_log_archives (
  session_id TEXT PRIMARY KEY,
  event_count INTEGER NOT NULL DEFAULT 0,
  events_key TEXT,
  transcript_key TEXT,
  summary_key TEXT,
  archived_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (session_id) REFERENCES interactive_sessions(id)
);

CREATE INDEX IF NOT EXISTS idx_interactive_session_log_archives_updated
  ON interactive_session_log_archives(updated_at);
