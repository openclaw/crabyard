---
title: Overview
layout: default
permalink: /
description: "Crabyard.ai is a Cloudflare Worker control plane for OpenClaw Codex cards and run attempts."
---

## Try it

Link your SSH key once, then use Crabyard from the terminal or the app.

```bash
# Link your current SSH key to GitHub-backed Crabyard access.
ssh link@ssh.crabyard.ai

# Inspect your identity and active Codex sessions.
ssh ssh.crabyard.ai whoami
ssh ssh.crabyard.ai list

# Create or attach to an interactive Codex session.
ssh ssh.crabyard.ai new "fix the failing check"
ssh ssh.crabyard.ai attach <session-id>
```

The web app at [crabyard.ai/app](https://crabyard.ai/app/) exposes the same control plane: GitHub OAuth, repo-gated cards, runtime policy, live session tiles, and admin allowlists.

## What Crabyard Does

- **SSH-first onboarding.** Connect through `ssh link@ssh.crabyard.ai`, complete GitHub sign-in, then use linked-key auth.
- **Codex session control.** Create, attach, share, and clean up interactive Codex sessions backed by Ghostty WASM tiles.
- **Repo-gated cards.** Prompt cards and GitHub issue/PR previews stay scoped to enabled OpenClaw repos.
- **Runtime policy.** Crabyard records runtime selection, capabilities, heartbeat, stall state, and operator intent.
- **Admin guardrails.** User/team allowlists, repo allowlists, roles, caps, and `CRABYARD.md` workflow evaluation live in the dashboard.
- **Generated docs.** The spec, API pages, and architecture notes are built into a searchable documentation shell.

## What Works Today

- GitHub OAuth plus bootstrap login.
- User/team allowlists and repo allowlists.
- Empty-by-default board backed by D1.
- Cards from prompts or `#number` issue/PR previews across enabled repos.
- Optional title generation from prompt.
- Durable run attempts with heartbeat, stall handling, operator, runtime reason, and capabilities.
- Ghostty WASM fullscreen session grid with D1 event replay, live multiplex PTY attach, and text fallback.
- Card diff metadata and compact patch view.
- Owner workflow evaluation for repo `CRABYARD.md`.
- Worker-served docs at `/docs/` and generated docs at `docs.crabyard.ai`.

## Not Wired Yet

- Real Container/Crabbox lease creation.
- R2 artifact/terminal archival.
- Durable Object WebSocket fanout.
- Direct merge execution and ClawSweeper handoff.

## Pick Your Path

- **Trying it.** [Quickstart](/quickstart/) covers login, access, repo setup, cards, and attach.
- **Understanding the system.** [Architecture](/architecture/) explains the Worker, D1/Kysely, runtime descriptors, and workflow config.
- **Operating cards.** [Cards](/cards/) and [Runs](/runs/) cover task state, attempts, terminal attach, and replay.
- **Managing access.** [Admin](/admin/) covers users, teams, repos, roles, caps, and policy defaults.
- **Building against it.** [API Reference](/api/) lists REST and internal SSH gateway endpoints.
- **Reading the roadmap.** [Complete Spec](/spec/) tracks product decisions and planned integrations.

## Core Concepts

### Cards

Cards represent task intent and policy:

- Prompt, issue, or PR source.
- Enabled repo target.
- Runtime preference: `auto`, `container`, `crabbox`.
- Merge policy: repo default, `open_pr`, `merge_when_green`, `fix_until_green_and_merge`.
- Lane: Todo, Running, Human Review, Done.
- Logs, changes, and active run attempt.

### Runs

When a card enters Running, Crabyard creates a `run_attempts` row, selects a runtime descriptor, records the selection reason and capabilities, and starts heartbeat/stall tracking. Current output is event-log backed; live external execution is the next adapter binding.

### Repo Workflows

Owners can evaluate `CRABYARD.md` for enabled repos. Valid workflow config can set runtime and merge defaults for new cards and future scheduler policy.

### Roles

- **Owner**: manage allowlists, repos, caps, retention, workflow evaluations.
- **Maintainer**: create cards, start runs, attach, watch, take over capable active runs.
- **Viewer**: view board and attach/watch read-only surfaces.

## Tech Stack

- TypeScript + pnpm
- Cloudflare Workers
- Cloudflare D1
- Kysely
- GitHub OAuth/API
- Ghostty WebAssembly
- `tsgo`, `oxlint`, `oxfmt`

## Status

MVP deployed. The control-plane data model is real; the external runtime execution path is intentionally still explicit adapter work.
