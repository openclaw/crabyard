ALTER TABLE interactive_sessions ADD COLUMN share_mode TEXT NOT NULL DEFAULT 'private';
ALTER TABLE interactive_sessions ADD COLUMN share_token_hash TEXT;
ALTER TABLE interactive_sessions ADD COLUMN share_token_preview TEXT;
ALTER TABLE interactive_sessions ADD COLUMN control_requested_by TEXT;
ALTER TABLE interactive_sessions ADD COLUMN control_requested_at INTEGER;
ALTER TABLE interactive_sessions ADD COLUMN controller TEXT;
ALTER TABLE interactive_sessions ADD COLUMN control_granted_at INTEGER;
ALTER TABLE interactive_sessions ADD COLUMN control_expires_at INTEGER;

CREATE INDEX IF NOT EXISTS idx_interactive_sessions_share_token
  ON interactive_sessions(share_token_hash);
