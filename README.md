# 🕹️ [Crabyard](https://github.com/openclaw/crabyard)

**Mission control for Agent runs.**

Crabyard gives OpenClaw maintainers a Linear-like board where each card represents a coding task, live Codex session, and durable execution history.

## What It Does

- **Board-based workflow.** Create cards from prompts, GitHub issues, or PRs. Track them through Todo, Running, Human Review, and Done lanes.
- **Issue/PR lookup.** Type `#123` in search to preview matching GitHub issues or PRs across enabled OpenClaw repos and create a card from the match.
- **Codex run control.** Start durable run attempts, track heartbeats, watch the Ghostty WASM session grid, and take over only when the selected runtime advertises that capability.
- **Interactive CLI sessions.** Start a standalone Codex CLI workspace for manual cloud work and attach it in the same fullscreen Ghostty grid.
- **Diff previews.** Card tiles show changed files and totals; the run drawer shows a compact Codiff-style patch view.
- **Multi-runtime policy.** Auto-select between the Container and Crabbox adapter surfaces based on card overrides, repo workflow defaults, and task requirements.
- **Allowlist controls.** Restrict access to OpenClaw org members and specific repos through admin-managed allowlists.
- **Session logs.** D1-backed card/run event history with a 30-day product retention setting.
- **Repo workflow config.** Owners can evaluate `CRABYARD.md` per repo and use it for runtime and merge defaults.

## Architecture

- **Cloudflare Workers** for the app, API, auth, GitHub lookup, and docs routes.
- **D1 + Kysely** for typed persistence: users, sessions, allowlists, repos, cards, events, run attempts, interactive sessions, diffs, and repo workflow evaluations.
- **Ghostty WebAssembly** for the fullscreen attach grid and run log replay.
- **Cloudflare Sandbox containers** for standalone interactive Codex CLI workspaces with live PTY attach.
- **Runtime adapter descriptors** for Container and Crabbox selection, capability display, interactive provision handoff, and guarded takeover.
- **Provision endpoint** at `/api/provision/interactive` that can use the built-in Sandbox backend or delegate to a generic runtime adapter or ClawFleet.
- **GitHub API** for OAuth, org/team membership, and issue/PR previews across enabled repos.

Autonomous card execution, Crabbox VNC transport, R2 archival, Durable Object fanout, and merge automation are adapter targets, not faked in the current Worker.

## Quick Start

### 1. Bootstrap Admin Login

Get the bootstrap token from your deployment secrets and use it to log in:

```bash
# Visit https://crabyard.openclaw.ai/app/
# Use bootstrap token for initial admin setup
# If GitHub auto-login is active, use https://crabyard.openclaw.ai/app?auth=token
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

- Running cards show D1 event logs and heartbeat state
- Click "Attach" to open the fullscreen Ghostty WASM session grid
- Click "Take over" only when the active run advertises takeover support
- Click "Watch" for read-only stream

### 5. Start Interactive CLI

- Click "New session" to request a standalone Codex CLI workspace
- Default runtime is Crabbox so VNC can be attached when the provision adapter returns a URL
- Without `CRABYARD_INTERACTIVE_PROVISION_URL`, sessions are stored as `pending_adapter` and still visible in the grid

## Features

### Board Management

- Kanban-style lanes: Todo, Running, Human Review, Done
- Card filtering: all, mine, live
- Search cards by title, repo, or ID
- Real-time updates via WebSockets

### Card Policies

- **Runtime:** `auto`, `container`, `crabbox`
- **Merge policy:** repo default, `open_pr`, `merge_when_green`, `fix_until_green_and_merge`
- **Source types:** Prompt, Issue, PR

Repo defaults can come from a `CRABYARD.md` file:

```yaml
---
runtime:
  default: auto
merge:
  default_policy: open_pr
---
```

`stall_ms`, `cap`, `prompt_prefix`, and the Markdown body are parsed/stored for future policy work, but only runtime and merge defaults are effective today.

### Admin Controls

- User and team allowlists with role-based access
- Repo allowlists
- Manual `CRABYARD.md` evaluation with status/error visibility
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

Pushes to `main` run `.github/workflows/deploy-worker.yml`, which checks, tests, builds,
applies remote D1 migrations, and deploys the Worker. Configure the repository secret
`CLOUDFLARE_API_TOKEN` with permissions for Workers deploys and D1 migrations.

Manual deploy is still available:

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
- `GITHUB_TOKEN` – GitHub token for all enabled repo issue/PR previews and private repo `CRABYARD.md` refreshes (optional; public/default repo paths work without it)
- `CRABYARD_TOKEN_ENCRYPTION_KEY` – Optional encryption key for per-session GitHub OAuth tokens; defaults to `GITHUB_CLIENT_SECRET`
- `CRABYARD_INTERACTIVE_PROVISION_URL` – Optional adapter endpoint for standalone Codex CLI workspaces
- `CRABYARD_INTERACTIVE_PROVISION_TOKEN` – Optional bearer token sent to the interactive provision endpoint; required when backend URLs below are configured
- `CRABYARD_RUNTIME_PROVISION_URL` – Optional generic backend URL used by `/api/provision/interactive`
- `CRABYARD_RUNTIME_PROVISION_TOKEN` – Optional bearer token sent to the generic runtime backend
- `CRABYARD_CLOUDFLARE_RUNNER_URL` – Optional Crabbox Cloudflare container runner URL used by `/api/provision/interactive`
- `CRABYARD_CLOUDFLARE_RUNNER_TOKEN` – Optional bearer token sent to the Cloudflare runner
- `CRABYARD_CLOUDFLARE_RUNNER_INSTANCE_TYPE` – Optional runner instance type, default `standard-4`
- `CRABYARD_CLOUDFLARE_RUNNER_WORKDIR` – Optional base workdir for provisioned sandboxes, default `/workspace/crabyard`
- `CRABYARD_CLOUDFLARE_RUNNER_TTL_SECONDS` – Optional sandbox TTL, default `14400`
- `CRABYARD_CLOUDFLARE_RUNNER_IDLE_SECONDS` – Optional idle timeout, default `1800`
- `CRABYARD_PTY_BRIDGE_URL` – Optional WebSocket PTY bridge URL/template for live Ghostty attach; supports `{id}`, `{leaseId}`, `{repo}`, `{branch}`, and `{runtime}`
- `CRABYARD_PTY_BRIDGE_TOKEN` – Optional bearer token sent from Crabyard to the PTY bridge
- `CRABYARD_CLAWFLEET_URL` – Optional ClawFleet dashboard/API URL used by `/api/provision/interactive` for `crabbox` sessions
- `CRABYARD_CLAWFLEET_TOKEN` – Optional bearer token sent to ClawFleet
- `CRABYARD_CLAWFLEET_PUBLIC_URL` – Optional public ClawFleet URL used when building attach/VNC links
- `OPENAI_API_KEY` – Required for built-in Cloudflare Sandbox Codex CLI sessions; passed only into the sandbox session environment

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

### Test Stack

- `tsgo --noEmit` through `pnpm build`
- `oxlint` for linting
- `oxfmt --check` for formatting
- SQLite migration smoke checks for D1 schema compatibility
- `codex-review` before feature commits
- Browser/live smoke checks after deploy

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
│   ├── app.html          # Single-page app shell and styles
│   ├── app/              # Preact app modules
│   ├── generated.ts      # Build-time generated assets
├── migrations/           # D1 database migrations
├── scripts/              # Build scripts
│   └── generate-assets.mjs
├── vite.config.mjs       # Preact/Vite app bundle config
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

Current phase: MVP deployed with auth, board UI, admin controls, card management, Kysely-backed D1 persistence, durable run attempts, repo workflow evaluation, card diffs, Ghostty WASM terminal grid, authenticated PTY WebSocket proxying, and first-party Cloudflare Sandbox Codex CLI sessions.

Next: bind autonomous card execution and merge automation to the same runtime layer.

## License

MIT License. See [LICENSE](LICENSE) for details.

## Not Affiliated

Crabyard is an OpenClaw project, not affiliated with Cloudflare, GitHub, or Anthropic.

## Contributing

This is currently an internal OpenClaw tool. External contributions are not accepted at this time.

## Support

For OpenClaw org members: use #crabyard in Discord or open an issue in the private repo.
