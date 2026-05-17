ALTER TABLE run_attempts ADD COLUMN selection_reason TEXT;
ALTER TABLE run_attempts ADD COLUMN capabilities_json TEXT NOT NULL DEFAULT '{}';
