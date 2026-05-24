---
title: Architecture
layout: default
permalink: /architecture/
description: "System design, data model, and runtime architecture for Crabfleet."
---

# Architecture

Crabfleet is a Cloudflare Worker backed by D1. The deployed Worker is the control plane: auth, repo gates, crabboxes, cards, run attempts, workflow evaluation, issue/PR lookup, docs, the Ghostty WASM attach grid, and the same-origin PTY WebSocket proxy all run there today.

Crabbox PTY/VNC links, R2 archival, Durable Object fanout, Discord/OpenClaw orchestration, and merge automation are represented by adapter metadata and product docs; backend bindings are explicit deployment work.

## System Overview

```
Browser app
  | HTTPS
  v
Cloudflare Worker
  - app/docs/static assets
  - REST API
  - GitHub OAuth + repo/issue/PR lookup
  - runtime selection policy
  |
  +-- D1: users, sessions, repos, cards, events, run_attempts, repo_workflows
  +-- GitHub API: OAuth, org/team membership, CRABBOX.md, issue/PR previews
  +-- Ghostty WASM: terminal grid asset served by Worker
```

## Core Components

### Worker

`src/index.ts` handles the app shell, docs routes, auth, API routes, Kysely D1 queries, GitHub calls, and generated asset serving. The Worker intentionally stores runtime lease fields as data, but it does not fabricate external execution.

### D1 + Kysely

Structured persistence uses D1 through a small Kysely dialect.

- `settings`: org config such as cap, retention, and merge policy.
- `allow_entries`: user/team allowlist with roles.
- `repos`: enabled repositories.
- `users`: GitHub users and cached team membership.
- `sessions`: hashed session tokens.
- `cards`: task metadata, prompt, repo, lane, policy, diff summary, active run id.
- `run_attempts`: durable attempt state, heartbeat, runtime, lease fields, operator, selection reason, and runtime capabilities.
- `repo_workflows`: last `CRABBOX.md` evaluation per repo, including status, source SHA, parsed config, prompt guidance, and error.
- `events`: card/run event log.
- `audit_events`: admin action log.

## Runtime Adapter Contract

When a card is claimed, Crabfleet records a runtime descriptor:

- `runtime`: `container` or `crabbox`
- `reason`: card override, repo workflow default, prompt-required desktop/manual/perf capability, or product default
- `capabilities`: terminal, takeover, VNC, desktop, logs, artifacts

The UI and API both use capabilities. Takeover is visible and accepted only for an active run whose descriptor advertises takeover.

Current selection order:

1. Explicit card runtime `container` or `crabbox`
2. Hard prompt cues: `vnc`, `manual`, `takeover`, `gpu`, `perf`, `performance` route to Crabbox
3. Valid repo `CRABBOX.md` runtime default
4. Product default: Crabbox

## Repo Workflow Config

Owners can evaluate `CRABBOX.md` for an allowlisted repo. The Worker fetches it from GitHub, decodes UTF-8 base64 content, parses simple frontmatter, stores status/errors in D1, and applies only valid `ok` configs.

For private repos, workflow refresh requires a deployment `GITHUB_TOKEN` with contents access. The Worker does not use the logged-in user's OAuth token for this fetch.

```yaml
---
runtime:
  default: auto
merge:
  default_policy: open_pr
---
```

Only runtime and merge defaults are effective today. `stall_ms`, `cap`, `prompt_prefix`, and the Markdown body are parsed/stored for future policy work. Invalid runtime or merge values are stored as `invalid` and do not affect card defaults.

## Data Model

### Card

```typescript
{
  id: string
  title: string
  prompt: string
  repo: string
  source: "Prompt" | "Issue" | "PR"
  runtime: "auto" | "container" | "crabbox"
  policy: "open_pr" | "merge_when_green" | "fix_until_green_and_merge"
  lane: "Todo" | "Running" | "Human Review" | "Done"
  owner: string
  startedAt: number | null
  createdAt: number
  logs: string[]
  changes: CardChanges
  run: RunAttempt | null
}
```

### RunAttempt

```typescript
{
  id: string;
  cardId: string;
  attempt: number;
  runtime: string;
  status: "queued" |
    "leasing" |
    "running" |
    "review" |
    "completed" |
    "failed" |
    "stalled" |
    "canceled";
  controlIntent: string | null;
  leaseId: string | null;
  attachUrl: string | null;
  vncUrl: string | null;
  selectionReason: string | null;
  capabilities: RuntimeCapabilities;
  operator: string | null;
  lastHeartbeatAt: number;
  startedAt: number | null;
  endedAt: number | null;
  error: string | null;
}
```

## Auth Flow

GitHub OAuth uses `read:user read:org repo`, verifies active org membership, maps teams to `@org/team`, checks the allowlist, and creates a short-lived D1-backed session with an encrypted OAuth token for runtime GitHub CLI access. Bootstrap token login creates an owner session for setup/recovery.

## Planned Integrations

- Cloudflare Container lease binding for autonomous Codex runs.
- Crabbox lease binding for VNC/manual/heavy sessions.
- Runner-side PTY/app-server process hosting behind the Ghostty grid.
- R2 terminal/artifact archival with retention cleanup.
- Durable Object fanout for lower-latency live streams.
- Merge automation handoff once runtime output and PR state are real.
