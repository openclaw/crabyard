# Changelog

## Unreleased

- Add an editable, persisted Codex session grid with column density, compact mode, drag reorder, and per-tile sizing.
- Add browser clipboard copy/paste controls for live Codex terminals, including image/file paste into Cloudflare Sandbox workspaces.
- Add a multiplexed binary terminal WebSocket protocol for Codex session grids and shared viewers.
- Add read-only Codex session share links with owner-approved terminal control requests.
- Install bubblewrap and default interactive Codex sessions to yolo mode with a clean PTY buffer.
- Keep Escape routed to focused Codex terminals instead of closing the session drawer.
- Enable the experimental Codex goals feature in provisioned interactive sessions.
- Fix interactive Codex session provisioning to show the terminal immediately and stream live PTY bytes into Ghostty.
- Add a Cloudflare container runner backend for standalone interactive session provisioning.
- Add a built-in interactive provision endpoint with generic runtime and ClawFleet adapter backends.
- Add standalone interactive Codex CLI sessions with Ghostty grid attach and an external runtime provision hook.
- Document the real deployed control-plane status, runtime adapter boundary, workflow config, and test stack.
- Close open side drawers with Escape.
- Preserve completed run attempt status when operators mark stale cards stalled.
- Add runtime adapter descriptors with persisted selection reasons and capability-gated takeover.
- Add repo `CRABYARD.md` workflow evaluation for runtime and merge defaults.
- Add durable D1 run attempts with heartbeat, stall handling, run history, and active-run state.
- Vendor local app icons and remove external icon runtime dependency.
- Serve `/docs/` from the Worker documentation page.
- Switch the Worker typecheck/build path from `tsc` to `tsgo`.
- Fix the default OpenClaw maintainer team allowlist slug.
- Add a fullscreen Ghostty WASM Codex session grid for attach/watch/takeover workflows.
- Add a persistent light/dark mode toggle to the app rail.
- Make new card titles optional and derive blank titles from the prompt.
- Add `#number` issue/PR previews across enabled OpenClaw repos and default new cards to `openclaw/openclaw`.
- Add card-level diff metadata, tile previews, and run-drawer patch rendering for changed files.
- Add GitHub Pages documentation for docs.crabyard.ai.
- Clear seeded and smoke-test cards from production boards.
- Add Crabyard logo branding to the app and hide unavailable GitHub OAuth login.
- Migrate Worker persistence to a typed Kysely D1 query layer.
- Add D1-backed authentication, sessions, admin APIs, card persistence, and run event logging for the deployed Worker.
- Add initial Crabyard web app shell with board, card creation, admin allowlists/repos/policy controls, run logs, attach/watch/takeover actions, and deployed spec routes.
