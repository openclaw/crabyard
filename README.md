# Crabyard.ai

**Cloudflare-native control plane for OpenClaw Codex runs.**

Crabyard gives OpenClaw maintainers a Linear-like board where each card represents a coding task, live Codex session, and durable execution history.

## What It Does

- **Board-based workflow.** Create cards from prompts, GitHub issues, or PRs. Track them through Todo, Running, Human Review, and Done lanes.
- **Issue/PR lookup.** Type `#123` in search to preview matching GitHub issues or PRs across enabled OpenClaw repos and create a card from the match.
- **Live Codex runs.** Watch autonomous sessions, attach to terminals, take over when needed.
- **Diff previews.** Card tiles show changed files and totals; the run drawer shows a compact Codiff-style patch view.
- **Multi-runtime support.** Auto-select between Cloudflare Containers and Crabbox based on job requirements.
- **Allowlist controls.** Restrict access to OpenClaw org members and specific repos through admin-managed allowlists.
- **Session logs.** 30-day retention of run events, terminal replay, and artifacts in R2.
- **Merge automation.** Direct merge with guardrails or handoff to ClawSweeper for review loops.

## Architecture

- **Cloudflare Workers** for API and orchestration
- **D1** for persistent state (cards, users, events, sessions)
- **R2** for logs and artifacts
- **Durable Objects** for live session state and WebSocket fanout
- **Cloudflare Containers** for lightweight Codex runs
- **Crabbox** integration for VNC, manual CLI, and heavy jobs

## Quick Start

### 1. Bootstrap Admin Login

Get the bootstrap token from your deployment secrets and use it to log in:

```bash
# Visit https://crabyard.openclaw.ai/app/
# Use bootstrap token for initial admin setup
```

### 2. Configure Access

Add users/teams to the allowlist and enable repos:

- Navigate to Admin panel
- Add GitHub users (`@login`) or teams (`@org/team`)
- Assign roles: owner, maintainer, or viewer
- Add allowed repos (`owner/repo`)

### 3. Create Cards

- **From prompt:** New card → enter prompt, select repo; title is optional
- **From issue:** Search GitHub issues → create card
- **From PR:** Search GitHub PRs → create card for review/fix

### 4. Watch Runs

- Running cards show live logs
- Click "Attach" to view terminal output
- Click "Take over" to control the Codex session
- Click "Watch" for read-only stream

## Features

### Board Management

- Kanban-style lanes: Todo, Running, Human Review, Done
- Card filtering: all, mine, live
- Search cards by title, repo, or ID
- Real-time updates via WebSockets

### Card Policies

- **Runtime:** `auto`, `container`, `crabbox`
- **Merge policy:** `open_pr`, `merge_when_green`, `fix_until_green_and_merge`
- **Source types:** Prompt, Issue, PR

### Admin Controls

- User and team allowlists with role-based access
- Repo allowlists
- Concurrent run caps (default: 20)
- Log retention (14, 30, 60 days)
- Direct merge permissions (guarded, maintainers, disabled)

### Auth

- GitHub OAuth for org members
- Bootstrap token for admin setup and recovery
- Short-lived sessions with automatic refresh
- Role-based access control (owner, maintainer, viewer)

## Deployment

### Prerequisites

- Cloudflare account
- `crabyard.openclaw.ai` route in Cloudflare
- GitHub OAuth app (optional but recommended)
- Bootstrap token secret

### Deploy

```bash
# Build assets
pnpm build

# Apply migrations
wrangler d1 migrations apply crabyard-ai --remote

# Deploy to Cloudflare
wrangler deploy
```

### Environment Variables

Configure these in Cloudflare Workers dashboard:

- `CRABYARD_BOOTSTRAP_TOKEN` – Admin bootstrap token (required)
- `GITHUB_CLIENT_ID` – GitHub OAuth app client ID (optional)
- `GITHUB_CLIENT_SECRET` – GitHub OAuth app secret (optional)
- `GITHUB_ORG` – GitHub org for membership check (default: `openclaw`)
- `GITHUB_TOKEN` – GitHub token for all enabled repo issue/PR previews (optional; falls back to default repo only)

### Verify Deployment

```bash
curl -I https://crabyard.openclaw.ai/healthz
# Should return: 200 OK

curl https://crabyard.openclaw.ai/docs/spec
# Should return: HTML spec document
```

## Development

### Setup

```bash
# Install dependencies
pnpm install

# Build assets
pnpm build

# Run type checks
pnpm check

# Run linter
pnpm lint

# Format code
pnpm format
```

### Local Development

```bash
# Start local dev server with D1
wrangler dev

# Apply migrations locally
wrangler d1 migrations apply crabyard-ai --local
```

### Project Structure

```
crabyard/
├── src/
│   ├── index.ts          # Worker entry point, API routes, auth handlers
│   ├── app.html          # Single-page app shell
│   ├── generated.ts      # Build-time generated assets
├── migrations/           # D1 database migrations
├── scripts/              # Build scripts
│   └── generate-assets.mjs
├── docs/                 # Documentation (GitHub Pages)
│   ├── CNAME             # docs.crabyard.ai custom domain
│   └── spec.md           # Product spec
└── wrangler.jsonc       # Cloudflare Worker config
```

## Documentation

Full documentation available at [docs.crabyard.ai](https://docs.crabyard.ai):

- [Quickstart](https://docs.crabyard.ai/quickstart) – Get started in 5 minutes
- [Architecture](https://docs.crabyard.ai/architecture) – System design and data model
- [Cards](https://docs.crabyard.ai/cards) – Card lifecycle and policies
- [Runs](https://docs.crabyard.ai/runs) – Runtime selection and execution
- [Admin](https://docs.crabyard.ai/admin) – Access control and policies
- [API](https://docs.crabyard.ai/api) – REST and WebSocket APIs
- [Spec](https://docs.crabyard.ai/spec) – Complete product specification

## Security

- All state-changing operations require authentication
- Repo operations require allowlist membership
- Direct merge requires maintainer role and policy approval
- Runtime tokens are scoped and short-lived
- Secrets never logged or stored in D1/R2
- Audit events for all admin and merge operations

## Status

Active development. See [CHANGELOG.md](CHANGELOG.md) for recent updates.

Current phase: MVP deployed with auth, board UI, admin controls, card management, and D1/R2 persistence.

Next: Cloudflare Container runtime, Codex app-server integration, terminal attach via Ghostty WASM.

## License

MIT License. See [LICENSE](LICENSE) for details.

## Not Affiliated

Crabyard is an OpenClaw project, not affiliated with Cloudflare, GitHub, or Anthropic.

## Contributing

This is currently an internal OpenClaw tool. External contributions are not accepted at this time.

## Support

For OpenClaw org members: use #crabyard in Discord or open an issue in the private repo.
