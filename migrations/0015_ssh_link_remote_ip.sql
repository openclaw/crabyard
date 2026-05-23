ALTER TABLE ssh_link_codes ADD COLUMN remote_ip TEXT;

CREATE INDEX IF NOT EXISTS idx_ssh_link_codes_remote_ip
  ON ssh_link_codes(remote_ip, created_at);
