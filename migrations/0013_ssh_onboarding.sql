CREATE TABLE IF NOT EXISTS ssh_keys (
  fingerprint TEXT PRIMARY KEY,
  subject TEXT NOT NULL,
  public_key TEXT NOT NULL,
  label TEXT,
  created_at INTEGER NOT NULL,
  last_used_at INTEGER NOT NULL,
  revoked_at INTEGER,
  FOREIGN KEY (subject) REFERENCES users(subject)
);

CREATE INDEX IF NOT EXISTS idx_ssh_keys_subject ON ssh_keys(subject);

CREATE TABLE IF NOT EXISTS ssh_link_codes (
  code_hash TEXT PRIMARY KEY,
  fingerprint TEXT NOT NULL,
  public_key TEXT NOT NULL,
  label TEXT,
  expires_at INTEGER NOT NULL,
  consumed_at INTEGER,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ssh_link_codes_fingerprint
  ON ssh_link_codes(fingerprint, expires_at);
