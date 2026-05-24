CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS allow_entries (
  value TEXT PRIMARY KEY,
  role TEXT NOT NULL DEFAULT 'maintainer',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS repos (
  repo TEXT PRIMARY KEY,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  subject TEXT PRIMARY KEY,
  login TEXT,
  email TEXT,
  name TEXT,
  role TEXT NOT NULL DEFAULT 'viewer',
  allowed INTEGER NOT NULL DEFAULT 0,
  teams TEXT NOT NULL DEFAULT '[]',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  subject TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (subject) REFERENCES users(subject)
);

CREATE TABLE IF NOT EXISTS cards (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  prompt TEXT NOT NULL,
  repo TEXT NOT NULL,
  source TEXT NOT NULL,
  runtime TEXT NOT NULL,
  policy TEXT NOT NULL,
  lane TEXT NOT NULL,
  owner TEXT NOT NULL,
  started_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  last_event TEXT
);

CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  card_id TEXT NOT NULL,
  actor TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (card_id) REFERENCES cards(id)
);

CREATE TABLE IF NOT EXISTS audit_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

INSERT OR IGNORE INTO settings (key, value) VALUES
  ('org', 'OpenClaw'),
  ('github_org', 'openclaw'),
  ('cap', '20'),
  ('retention', '30'),
  ('merge', 'guarded');

INSERT OR IGNORE INTO allow_entries (value, role, created_at, updated_at) VALUES
  ('@steipete', 'owner', unixepoch() * 1000, unixepoch() * 1000),
  ('@openclaw/maintainer', 'maintainer', unixepoch() * 1000, unixepoch() * 1000);

INSERT OR IGNORE INTO repos (repo, enabled, created_at, updated_at) VALUES
  ('openclaw/crabfleet', 1, unixepoch() * 1000, unixepoch() * 1000),
  ('openclaw/clawsweeper', 1, unixepoch() * 1000, unixepoch() * 1000),
  ('openclaw/crabbox', 1, unixepoch() * 1000, unixepoch() * 1000);

INSERT OR IGNORE INTO cards
  (id, title, prompt, repo, source, runtime, policy, lane, owner, started_at, created_at, updated_at, last_event)
VALUES
  (
    'CY-101',
    'Wire admin allowlists',
    'Build admin editing for users, teams, repos, runtime caps, and merge policy.',
    'openclaw/crabfleet',
    'Prompt',
    'container',
    'open_pr',
    'Todo',
    'system',
    NULL,
    unixepoch() * 1000 - 2580000,
    unixepoch() * 1000 - 2580000,
    'repo gate pending'
  ),
  (
    'CY-102',
    'Crabbox manual attach path',
    'Expose watch and takeover affordances for a Codex CLI session with VNC eligibility.',
    'openclaw/crabbox',
    'Issue',
    'crabbox',
    'fix_until_green_and_merge',
    'Running',
    'system',
    unixepoch() * 1000 - 540000,
    unixepoch() * 1000 - 540000,
    unixepoch() * 1000 - 540000,
    'streaming terminal'
  ),
  (
    'CY-103',
    'Review stale PR recovery',
    'Validate required checks and route merge through guarded policy.',
    'openclaw/clawsweeper',
    'PR',
    'auto',
    'merge_when_green',
    'Human Review',
    'system',
    NULL,
    unixepoch() * 1000 - 7200000,
    unixepoch() * 1000 - 7200000,
    'waiting for maintainer'
  );

INSERT OR IGNORE INTO events (card_id, actor, message, created_at) VALUES
  ('CY-101', 'system', 'queued card CY-101', unixepoch() * 1000 - 2580000),
  ('CY-101', 'system', 'repo gate pending', unixepoch() * 1000 - 2520000),
  ('CY-102', 'system', 'lease acquired', unixepoch() * 1000 - 540000),
  ('CY-102', 'system', 'codex cli attached', unixepoch() * 1000 - 480000),
  ('CY-102', 'system', 'heartbeat ok', unixepoch() * 1000 - 420000),
  ('CY-102', 'system', 'streaming terminal', unixepoch() * 1000 - 360000),
  ('CY-103', 'system', 'checks green', unixepoch() * 1000 - 7200000),
  ('CY-103', 'system', 'head sha locked', unixepoch() * 1000 - 7140000),
  ('CY-103', 'system', 'waiting for maintainer', unixepoch() * 1000 - 7080000);
