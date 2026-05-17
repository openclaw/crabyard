# Changelog

## Unreleased

- Make new card titles optional and derive blank titles from the prompt.
- Add `#number` issue/PR previews across enabled OpenClaw repos and default new cards to `openclaw/openclaw`.
- Add card-level diff metadata, tile previews, and run-drawer patch rendering for changed files.
- Add GitHub Pages documentation for docs.crabyard.ai.
- Clear seeded and smoke-test cards from production boards.
- Add Crabyard logo branding to the app and hide unavailable GitHub OAuth login.
- Migrate Worker persistence to a typed Kysely D1 query layer.
- Add D1-backed authentication, sessions, admin APIs, card persistence, and run event logging for the deployed Worker.
- Add initial Crabyard web app shell with board, card creation, admin allowlists/repos/policy controls, run logs, attach/watch/takeover actions, and deployed spec routes.
