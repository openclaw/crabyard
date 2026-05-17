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
- Uses the local `ghostty-web` bundle served by the Worker.
- Replays D1 event logs into the terminal surface.
- Falls back to a text terminal if Ghostty cannot initialize.
- Supports focused fullscreen card view.

Live PTY byte streaming and interactive stdin are not wired yet. The Take over action records `controlIntent = "takeover"` and operator only for active runs with takeover capability.

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
