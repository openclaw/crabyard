INSERT OR IGNORE INTO allow_entries (value, role, created_at, updated_at)
SELECT '@openclaw/maintainer', role, created_at, unixepoch() * 1000
FROM allow_entries
WHERE value = '@openclaw/maintainers';

DELETE FROM allow_entries
WHERE value = '@openclaw/maintainers';
