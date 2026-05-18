---
title: Runs
layout: default
permalink: /runs/
description: "Runtime execution, logs, attach/takeover, and debugging for Codex runs."
---

# Runs

A run is a durable attempt to execute a card. Today Crabyard records attempts, heartbeats, runtime selection evidence, operator intent, and event logs in D1. External Container/Crabbox execution and live PTY transport are the next adapter binding step.

## Run Lifecycle

Current statuses:

```text
queued -> leasing -> running -> review | completed | failed | stalled | canceled
```

The MVP creates a `queued` run attempt when a card is claimed and pulses it to `running` on activity. Moving the card to Human Review or Done finishes the active run as `review` or `completed`; moving away from a running card cancels it.

## Claiming

When a maintainer starts or advances a card into Running, the Worker:

1. Reconciles stale active runs.
2. Verifies the repo allowlist.
3. Checks the configured concurrent cap, default `20`.
4. Refreshes cached repo workflow config if needed.
5. Selects runtime descriptor.
6. Inserts a `run_attempts` row.
7. Records scheduler and runtime evidence events.

If the cap is reached, the card stays queued and receives a capacity event.

## Runtime Selection

Selection order:

1. Explicit card runtime `container` or `crabbox`.
2. Prompt cues `vnc`, `manual`, `takeover`, `gpu`, `perf`, or `performance` route to Crabbox.
3. Valid repo `CRABYARD.md` runtime default.
4. Default Container runtime.

Each selected runtime stores:

- `selectionReason`
- `capabilities.terminal`
- `capabilities.takeover`
- `capabilities.vnc`
- `capabilities.desktop`
- `capabilities.logs`
- `capabilities.artifacts`

The UI labels sessions from capabilities, and the API rejects takeover unless the active run advertises takeover.

## Repo Workflow Defaults

Owners can evaluate `CRABYARD.md` in Admin.

```yaml
---
runtime:
  default: auto
merge:
  default_policy: open_pr
---
```

Supported runtime values are `auto`, `container`, and `crabbox`. Supported merge policies are `open_pr`, `merge_when_green`, and `fix_until_green_and_merge`. `stall_ms`, `cap`, `prompt_prefix`, and the Markdown body are parsed/stored for future policy work, but only runtime and merge defaults are effective today. Invalid files are visible in Admin and ignored for defaults.

## Heartbeats and Stalls

Active statuses are `queued`, `leasing`, and `running`. A run stalls when its heartbeat is older than the configured threshold, default 5 minutes. Reconciliation marks the run `stalled`, sets `endedAt`, stores `heartbeat timeout`, moves the card to Human Review, and logs the event.

Manual `stall` marks the card Human Review and preserves the active run record with the supplied reason.

## Terminal Grid

Attach opens a fullscreen Ghostty WASM grid. Current behavior:

- Shows one or more Codex session tiles.
- Includes standalone interactive Codex CLI sessions created from New session.
- Uses the local `ghostty-web` bundle served by the Worker.
- Streams live PTY bytes through `/api/interactive-sessions/:id/pty` when a bridge is configured.
- Replays D1 event logs into the terminal surface while a live PTY is unavailable.
- Falls back to a text terminal if Ghostty cannot initialize.
- Supports focused fullscreen card view.
- Supports focused share URLs with public read-only event scrollback and owner-approved writable control requests for signed-in viewers.

The Take over action records `controlIntent = "takeover"` and operator only for active runs with takeover capability.

## Interactive CLI Sessions

Maintainers can create a standalone Codex CLI session without making a board card. The Worker stores the requested repo, branch, runtime, command, owner, attach/VNC URLs, status, and event log in D1. The default runtime is `crabbox` so a provision adapter can return both terminal and VNC attach URLs.

If `CRABYARD_INTERACTIVE_PROVISION_URL` is not set, new sessions stay `pending_adapter` and remain visible in the Ghostty grid. If it is set, Crabyard posts the session request to that endpoint with optional bearer auth from `CRABYARD_INTERACTIVE_PROVISION_TOKEN`; the response can set `status`, `leaseId`, `attachUrl`, `vncUrl`, and `message`.

Crabyard also ships a built-in provision hook at `/api/provision/interactive`. Point `CRABYARD_INTERACTIVE_PROVISION_URL` at that route to use Worker-side backend selection. Set `CRABYARD_INTERACTIVE_PROVISION_TOKEN` for backend-enabled deployments; the route fails closed without it when a backend is configured. The route delegates to `CRABYARD_RUNTIME_PROVISION_URL` when set, creates a Cloudflare Container sandbox for `container` sessions through `CRABYARD_CLOUDFLARE_RUNNER_URL` when configured, or creates a ClawFleet OpenClaw instance for `crabbox` sessions through `CRABYARD_CLAWFLEET_URL`; without a matching backend it returns `pending_adapter` with a clear setup message.

Cloudflare runner configuration:

- `CRABYARD_CLOUDFLARE_RUNNER_URL`: Crabbox Cloudflare container runner base URL.
- `CRABYARD_CLOUDFLARE_RUNNER_TOKEN`: runner bearer token.
- `CRABYARD_CLOUDFLARE_RUNNER_INSTANCE_TYPE`: `lite`, `basic`, `standard-1`, `standard-2`, `standard-3`, or `standard-4`; default `standard-4`.
- `CRABYARD_CLOUDFLARE_RUNNER_WORKDIR`: base workspace path; default `/workspace/crabyard`.
- `CRABYARD_CLOUDFLARE_RUNNER_TTL_SECONDS`: default `14400`.
- `CRABYARD_CLOUDFLARE_RUNNER_IDLE_SECONDS`: default `1800`.
- `CRABYARD_PTY_BRIDGE_URL`: optional explicit PTY bridge WebSocket URL/template. Templates support `{id}`, `{leaseId}`, `{repo}`, `{branch}`, and `{runtime}`.
- `CRABYARD_PTY_BRIDGE_TOKEN`: optional bearer token sent only from Crabyard to the bridge.

Runner PTY contract:

- Crabyard accepts the browser WebSocket on `/api/interactive-sessions/:id/pty`.
- Crabyard connects upstream to the configured bridge with `Upgrade: websocket`.
- Browser-to-runner messages are terminal input bytes.
- Runner-to-browser messages are terminal output bytes.
- The bridge receives `x-crabyard-session`, `x-crabyard-repo`, and `x-crabyard-runtime` headers plus session query parameters.

Session sharing:

- `Share` creates a public read-only URL at `/app/sessions/:id?token=...`.
- The share token is stored as a hash; generating a new link rotates the old one.
- Public viewers can scroll the persisted session event buffer without signing in.
- Writable PTY access still requires a signed-in allowlisted viewer and owner/maintainer approval.

## Run APIs

Start or pulse:

```bash
POST /api/cards/:id/actions
{"action":"start"}
```

Attach:

```bash
POST /api/cards/:id/actions
{"action":"attach"}
```

Take over:

```bash
POST /api/cards/:id/actions
{"action":"takeover"}
```

Requires maintainer role, active run, and `capabilities.takeover = true`.

History:

```bash
GET /api/cards/:id/runs
```

Returns all attempts for the card, newest first.

## Test Stack

- `pnpm run check`: asset generation, `tsgo --noEmit`, `oxlint`, `oxfmt --check`.
- SQLite migration smoke with migrations applied in order.
- `codex-review` per feature until no accepted/actionable findings remain.
- Browser/live smoke after deploy for `/app`, `/docs/`, auth surface, and docs subdomain.
