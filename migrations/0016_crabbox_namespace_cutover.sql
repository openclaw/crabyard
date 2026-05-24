DELETE FROM sessions;

INSERT OR IGNORE INTO repos (repo, enabled, created_at, updated_at)
SELECT
  'openclaw/crabfleet',
  enabled,
  created_at,
  unixepoch() * 1000
FROM repos
WHERE repo = 'openclaw/' || 'crab' || 'yard';

UPDATE cards
SET repo = 'openclaw/crabfleet'
WHERE repo = 'openclaw/' || 'crab' || 'yard';

INSERT OR IGNORE INTO repo_workflows (
  repo,
  status,
  source_path,
  source_sha,
  config_json,
  prompt,
  error,
  evaluated_at,
  updated_at
)
SELECT
  'openclaw/crabfleet',
  status,
  'CRABBOX.md',
  source_sha,
  config_json,
  prompt,
  error,
  evaluated_at,
  unixepoch() * 1000
FROM repo_workflows
WHERE repo = 'openclaw/' || 'crab' || 'yard';

DELETE FROM repo_workflows WHERE repo = 'openclaw/' || 'crab' || 'yard';
DELETE FROM repos WHERE repo = 'openclaw/' || 'crab' || 'yard';

UPDATE ssh_keys
SET
  github_token_ciphertext = NULL,
  revoked_at = unixepoch() * 1000
WHERE revoked_at IS NULL;

UPDATE interactive_sessions
SET
  status = 'expired',
  lease_id = NULL,
  attach_url = NULL,
  vnc_url = NULL,
  share_mode = 'private',
  share_token_hash = NULL,
  share_token_preview = NULL,
  control_requested_by = NULL,
  control_requested_at = NULL,
  controller = NULL,
  control_granted_at = NULL,
  control_expires_at = NULL,
  stopped_at = unixepoch() * 1000,
  updated_at = unixepoch() * 1000,
  last_event = 'Crabbox namespace cutover expired this workspace; create a new crabbox'
WHERE status NOT IN ('stopped', 'expired', 'failed');

UPDATE repo_workflows
SET
  source_path = 'CRABBOX.md',
  updated_at = unixepoch() * 1000
WHERE source_path = 'CRAB' || 'YARD.md';
