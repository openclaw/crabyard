ALTER TABLE cards ADD COLUMN active_run_id TEXT;

CREATE TABLE IF NOT EXISTS run_attempts (
  id TEXT PRIMARY KEY,
  card_id TEXT NOT NULL,
  attempt INTEGER NOT NULL,
  runtime TEXT NOT NULL,
  status TEXT NOT NULL,
  control_intent TEXT,
  lease_id TEXT,
  attach_url TEXT,
  vnc_url TEXT,
  operator TEXT,
  last_heartbeat_at INTEGER NOT NULL,
  started_at INTEGER,
  ended_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  error TEXT,
  FOREIGN KEY (card_id) REFERENCES cards(id),
  UNIQUE (card_id, attempt)
);

CREATE INDEX IF NOT EXISTS idx_run_attempts_card_id ON run_attempts(card_id);
CREATE INDEX IF NOT EXISTS idx_run_attempts_status ON run_attempts(status);
CREATE INDEX IF NOT EXISTS idx_run_attempts_heartbeat ON run_attempts(last_heartbeat_at);

INSERT OR IGNORE INTO run_attempts (
  id,
  card_id,
  attempt,
  runtime,
  status,
  control_intent,
  lease_id,
  attach_url,
  vnc_url,
  operator,
  last_heartbeat_at,
  started_at,
  ended_at,
  created_at,
  updated_at,
  error
)
SELECT
  id || '-R1',
  id,
  1,
  CASE
    WHEN runtime = 'crabbox' THEN 'crabbox'
    ELSE 'container'
  END,
  'running',
  NULL,
  NULL,
  NULL,
  NULL,
  NULL,
  COALESCE(updated_at, started_at, created_at),
  COALESCE(started_at, updated_at, created_at),
  NULL,
  created_at,
  updated_at,
  NULL
FROM cards
WHERE lane = 'Running';

UPDATE cards
SET active_run_id = id || '-R1'
WHERE lane = 'Running'
  AND active_run_id IS NULL;
