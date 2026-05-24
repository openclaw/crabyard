CREATE TABLE IF NOT EXISTS repo_workflows (
  repo TEXT PRIMARY KEY,
  status TEXT NOT NULL,
  source_path TEXT NOT NULL DEFAULT 'CRABBOX.md',
  source_sha TEXT,
  config_json TEXT NOT NULL DEFAULT '{}',
  prompt TEXT NOT NULL DEFAULT '',
  error TEXT,
  evaluated_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (repo) REFERENCES repos(repo)
);

CREATE INDEX IF NOT EXISTS idx_repo_workflows_status ON repo_workflows(status);
