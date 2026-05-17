---
title: Architecture
layout: default
permalink: /architecture/
description: "System design, data model, and runtime architecture for Crabyard.ai."
---

# Architecture

Crabyard is built entirely on Cloudflare's edge platform for global low-latency operation.

## System Overview

```
┌──────────────────────────────────────────────────┐
│  Browser                                         │
│  ┌────────────┐     ┌──────────────┐            │
│  │  Board UI  │     │  Terminal    │            │
│  │  (HTML/JS) │     │  (Ghostty)   │            │
│  └─────┬──────┘     └──────┬───────┘            │
└────────┼───────────────────┼────────────────────┘
         │ HTTPS              │ WebSocket
         │                    │
┌────────▼────────────────────▼────────────────────┐
│  Cloudflare Worker                               │
│  ┌──────────────────────────────────────┐        │
│  │  API Routes                          │        │
│  │  /api/state, /api/cards, /api/admin │        │
│  └──────┬───────────────────────────────┘        │
│         │                                         │
│  ┌──────▼──────┐  ┌───────────┐  ┌─────────┐    │
│  │  Auth       │  │  GitHub   │  │  Codex  │    │
│  │  (OAuth +   │  │  OAuth +  │  │  Runtime│    │
│  │  Bootstrap) │  │  API      │  │  Bridge │    │
│  └─────────────┘  └───────────┘  └─────────┘    │
└───────┬──────┬──────────┬──────────┬─────────────┘
        │      │          │          │
   ┌────▼──┐ ┌▼────┐ ┌───▼─────┐ ┌──▼──────────┐
   │  D1   │ │ R2  │ │ Durable │ │ Containers/ │
   │       │ │     │ │ Objects │ │ Crabbox     │
   └───────┘ └─────┘ └─────────┘ └─────────────┘
```

## Core Components

### Cloudflare Worker

Single Worker handles all HTTP/WebSocket traffic:

- **API routes:** REST endpoints for cards, admin, state
- **Auth handlers:** GitHub OAuth flow, bootstrap token validation
- **Session management:** Cookie-based auth with D1 persistence
- **Static serving:** Serves app.html and spec routes
- **WebSocket proxy:** Forwards to Durable Objects for live streams

Entry point: `src/index.ts`

### D1 Database

SQLite-based persistence for all structured data:

**Tables:**

- `settings` – Org-wide config (cap, retention, merge policy)
- `allow_entries` – User/team allowlist with roles
- `repos` – Allowlisted repositories
- `users` – GitHub users, cached membership, roles
- `sessions` – Auth sessions (token hash, expiry)
- `cards` – Card metadata (title, prompt, repo, lane, policy)
- `events` – Run event log (card_id, actor, message, timestamp)
- `audit_events` – Admin action log

Query layer: Kysely for type-safe SQL

### R2 Storage

Object storage for large/historical data:

**Bucket layout:**

```
orgs/{org}/runs/{run_id}/
  ├── events.ndjson          # Normalized lifecycle events
  ├── terminal.raw           # PTY byte stream for replay
  ├── terminal.ndjson        # Timestamped chunks
  ├── app-server.ndjson      # JSON-RPC messages (secrets redacted)
  ├── summary.json           # Final status, PR links, artifacts
  └── artifacts/{name}       # Screenshots, diffs, etc.
```

Retention: 30-day lifecycle policy deletes expired logs.

### Durable Objects

Stateful coordination for live sessions:

**BoardDO:**

- Per-org or per-repo board state
- Card ordering and lane management
- WebSocket fanout for real-time board updates
- Active run tracking

**RunDO:**

- Per-run live state
- WebSocket fanout for terminal/logs
- Heartbeat tracking
- Stall detection
- Event stream to D1 + R2
- PTY bridge or app-server proxy

## Data Model

### Card

Primary object representing a coding task.

```typescript
{
  id: string              // CY-101
  title: string
  prompt: string
  repo: string            // owner/repo
  source: string          // Prompt | Issue | PR
  runtime: string         // auto | container | crabbox
  policy: string          // open_pr | merge_when_green | fix_until_green_and_merge
  lane: string            // Todo | Running | Human Review | Done
  owner: string           // GitHub login
  startedAt: number | null
  createdAt: number
  logs: string[]          // Last 80 events for UI
}
```

### User

GitHub-authenticated user with role.

```typescript
{
  subject: string         // github:12345 or bootstrap:abc...
  login: string | null    // @steipete
  email: string | null
  name: string | null
  role: Role              // viewer | maintainer | owner
  allowed: boolean
  teams: string[]         // [@openclaw/maintainer, ...]
}
```

### Run Lifecycle

```
Queued
  ↓
Leasing (acquire Container or Crabbox)
  ↓
Bootstrapping (clone repo, install deps)
  ↓
Running (Codex active)
  ↓
Waiting (human review or CI)
  ↓
[branch] ─→ Succeeded / Failed / Stalled
  ↓
Done
```

## Runtime Options

### Cloudflare Containers

Lightweight, fast startup for most jobs.

**Expectations:**

- Image includes: Codex CLI, Git, GitHub CLI, Node/pnpm, common tools
- Container runs app-server or PTY bridge on authenticated local port
- Worker talks to container via service binding
- Ephemeral filesystem; durable state in R2/D1

**Use cases:**

- Autonomous Codex app-server runs
- Short-lived tasks (<30 min)
- No VNC required
- Standard dependency trees

### Crabbox

Full VM leases for heavy jobs and manual debugging.

**Expectations:**

- Crabbox owns provider credentials, SSH, VNC, lifecycle
- Crabyard requests lease via Crabbox API
- Worker stores lease ID, uses Crabbox attach/VNC affordances
- Long-running sessions
- VNC available for desktop debugging

**Use cases:**

- Manual CLI sessions requiring full terminal
- VNC/GUI debugging
- Heavy build jobs (Docker, native compilation)
- Testing against real browsers/desktop apps
- Jobs requiring custom system dependencies

### Runtime Selection

Scheduler auto-selects based on:

1. **VNC required?** → Crabbox
2. **Manual CLI takeover first?** → Crabbox (unless policy allows container PTY)
3. **Job fits container limits?** → Container
4. **Unsupported system deps?** → Crabbox
5. **Org cap reached?** → Queue card

## Auth Flow

### GitHub OAuth

Standard OAuth 2.0 flow for org members.

```
User clicks "Continue with GitHub"
  ↓
Redirect to github.com/login/oauth/authorize
  ↓
GitHub redirects to /auth/github/callback?code=...
  ↓
Worker exchanges code for access token
  ↓
Worker fetches user profile, org membership, teams
  ↓
Worker checks allowlist (direct user or team match)
  ↓
Worker creates session, sets cookie
  ↓
Redirect to /app
```

Sessions last 15 minutes; users re-login after expiry.

### Bootstrap Token

Break-glass admin access for setup and recovery.

```
User enters CRABYARD_BOOTSTRAP_TOKEN
  ↓
Worker hashes token, compares to env secret
  ↓
Worker creates special bootstrap:* subject
  ↓
Worker upserts bootstrap user with owner role
  ↓
Worker creates 1-hour session
```

Bootstrap sessions are short-lived and re-validate token on each request.

## WebSocket Streams

### Board Stream

`/ws/board/:board_id`

Real-time board updates:

```json
{"type": "card_created", "card": {...}}
{"type": "card_updated", "card": {...}}
{"type": "lane_changed", "cardId": "CY-101", "lane": "Running"}
{"type": "metrics_updated", "active": 3, "queue": 5}
```

### Run Stream

`/ws/run/:run_id`

Live run events and logs:

```json
{"type": "event", "message": "scheduler claimed openclaw/crabyard", "timestamp": 1234567890}
{"type": "state_changed", "state": "Running"}
{"type": "heartbeat", "elapsed": 45000}
```

### Terminal Stream

`/ws/terminal/:run_id`

Raw PTY output for terminal rendering:

```json
{"type": "data", "data": "base64-encoded-pty-bytes"}
{"type": "resize", "cols": 120, "rows": 40}
```

## Scaling Characteristics

### Horizontal Scaling

Cloudflare Workers auto-scale globally:

- Workers deploy to 300+ edge locations
- D1 replicates read-only to all regions
- R2 is globally distributed
- Durable Objects scale per card/run (isolated state)

### Capacity Limits

**Default caps:**

- 20 concurrent runs per org (configurable)
- 30-day log retention
- 80 events per card in UI (full history in R2)
- 4MB R2 object soft limit per log file

**D1 limits:**

- 500MB database size (per region primary)
- 10GB/day write throughput
- 500ms p99 query latency

**R2 limits:**

- Unlimited storage (pay per GB)
- 1000 req/sec per bucket (higher available)
- No egress fees

### Performance Targets

- Board load: <500ms p99
- Card creation: <200ms p99
- WebSocket connect: <100ms p99
- Terminal latency: <50ms p95
- Log replay: <1s for 30min session

## Security Model

### Authentication

- GitHub OAuth sessions: 15min
- Bootstrap sessions: 1hr, single-use tokens
- Session tokens stored as SHA-256 hash in D1
- Cookies: HttpOnly, Secure, SameSite=Lax

### Authorization

Role hierarchy:

```
owner > maintainer > viewer
```

Access matrix:

| Action           | Viewer | Maintainer | Owner |
| ---------------- | ------ | ---------- | ----- |
| View board       | ✓      | ✓          | ✓     |
| Watch runs       | ✓      | ✓          | ✓     |
| Create cards     | -      | ✓          | ✓     |
| Start/stop runs  | -      | ✓          | ✓     |
| Take over        | -      | ✓          | ✓     |
| Admin allowlists | -      | -          | ✓     |
| Admin policy     | -      | -          | ✓     |
| Direct merge\*   | -      | ✓          | ✓     |

\* _If merge policy allows maintainers_

### Secrets Management

- Secrets stored in Cloudflare Worker environment
- Never logged to R2 or D1
- Never exposed to browser clients
- Scoped per runtime (container/Crabbox only gets what it needs)
- Audit log records secret usage (redacted values)

## Observability

### Metrics (Dashboard)

- Active Codex count
- Queue count
- Runs by state
- Average runtime
- Stall count
- R2 retention backlog

### Logs

- Worker logs → Cloudflare Logs
- Run events → D1 + R2
- Terminal output → R2 raw + ndjson
- Audit events → D1

### Traces

Per-run timeline in event log:

```
14:32:01 card created
14:32:01 repo allowlist ok
14:32:15 scheduler claimed openclaw/crabyard
14:32:15 runtime=auto policy=open_pr
14:32:16 container allocated
14:32:18 repo checkout complete
14:32:20 codex started
14:32:45 branch created: cy-101-add-health-check
14:35:12 PR opened: #456
14:35:12 moved to Human Review
```

## Deployment

### Build Process

```bash
# Generate assets (app.html, spec.html, logo embeddings)
pnpm build

# Type check
pnpm check

# Deploy to Cloudflare
wrangler deploy
```

Build outputs:

- `src/generated.ts` – Embedded HTML, SVG, base64-encoded assets
- `dist/` – Wrangler build artifacts

### Migration Flow

```bash
# Apply D1 migrations (local)
wrangler d1 migrations apply crabyard-ai --local

# Apply D1 migrations (production)
wrangler d1 migrations apply crabyard-ai --remote
```

Migrations live in `migrations/` as timestamped SQL files.

### Environment

Cloudflare Worker bindings (wrangler.jsonc):

```jsonc
{
  "vars": {
    "GITHUB_ORG": "openclaw",
  },
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "crabyard-ai",
      "database_id": "...",
    },
  ],
  "r2_buckets": [
    {
      "binding": "LOGS",
      "bucket_name": "crabyard-logs",
    },
  ],
}
```

Secrets (Cloudflare dashboard or `wrangler secret put`):

- `CRABYARD_BOOTSTRAP_TOKEN`
- `GITHUB_CLIENT_ID`
- `GITHUB_CLIENT_SECRET`

## Future Extensions

Planned but not yet implemented:

- **Durable Objects for Board/Run** – Currently mocked in Worker
- **Cloudflare Containers integration** – Codex runtime adapter
- **Ghostty WASM terminal** – Browser-based PTY rendering
- **VNC proxy** – Crabbox desktop access
- **ClawSweeper handoff** – Merge safety loop integration
- **Workflow file support** – `CRABYARD.md` repo config
- **R2 lifecycle policy** – Automated 30-day retention cleanup

See [the spec](/spec/) for complete roadmap.
