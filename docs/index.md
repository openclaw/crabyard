---
title: Overview
layout: default
permalink: /
description: "Crabyard.ai is a Cloudflare-native control plane for running OpenClaw Codex sessions in cloud workspaces."
---

# Crabyard.ai Documentation

**Cloudflare-native control plane for OpenClaw Codex runs.**

Crabyard gives OpenClaw maintainers a Linear-like board where each card represents a coding task, live Codex session, and durable execution history.

## What You Can Do

- Create cards from prompts, GitHub issues, or PRs
- Watch autonomous Codex sessions in real-time
- Attach to live terminal sessions
- Take over manual control when needed
- Track runs through Todo, Running, Human Review, Done
- Manage access with user/team/repo allowlists
- Review 30-day retained logs and terminal replays
- Direct merge or ClawSweeper handoff

## Quick Links

- **[Quickstart](/quickstart/)** – Bootstrap admin, create first card, watch a run
- **[Architecture](/architecture/)** – Cloudflare Workers, D1, R2, Durable Objects
- **[Cards](/cards/)** – Card lifecycle, policies, sources
- **[Runs](/runs/)** – Runtime selection, execution, logs
- **[Admin](/admin/)** – Access control, allowlists, policies
- **[API Reference](/api/)** – REST endpoints and WebSockets
- **[Complete Spec](/spec/)** – Full product specification

## Core Concepts

### Cards

Cards are the primary object. Each card represents:

- A coding task (from prompt, issue, or PR)
- Current state/lane (Todo, Running, Human Review, Done)
- Runtime preference (auto, container, crabbox)
- Merge policy (open_pr, merge_when_green, fix_until_green_and_merge)
- Complete run history and logs

### Runs

When a card enters Running:

- Scheduler claims capacity (default cap: 20 concurrent)
- Runtime selected (Cloudflare Container or Crabbox)
- Codex starts in CLI or app-server mode
- Logs stream to browser via WebSockets and persist to R2
- Result: PR opened, merged, or escalated to human review

### Roles

- **Owner** – Manage allowlists, repos, caps, merge policy
- **Maintainer** – Create cards, start/stop runs, take over sessions
- **Viewer** – Watch board, view logs, read-only attach

### Access Control

- Users must be in OpenClaw GitHub org
- Users must be allowlisted (by login or team)
- Repos must be allowlisted
- Direct merge requires maintainer role + policy approval

## Architecture

```
┌─────────────────┐
│  Browser UI     │
│  (app.html)     │
└────────┬────────┘
         │ HTTPS + WebSocket
┌────────▼────────┐
│ Cloudflare      │
│ Worker          │◄──── GitHub OAuth
│ (src/index.ts)  │
└────┬───┬───┬────┘
     │   │   │
     │   │   └──────► R2 (logs, artifacts)
     │   │
     │   └──────────► D1 (cards, users, events)
     │
     └──────────────► Durable Objects
                      (BoardDO, RunDO)
```

## Tech Stack

- **TypeScript** + pnpm
- **Cloudflare Workers** – API and orchestration
- **Cloudflare D1** – SQLite persistence
- **Cloudflare R2** – Log storage
- **Cloudflare Durable Objects** – Live session state
- **Kysely** – Type-safe SQL queries
- **GitHub OAuth** – Authentication
- **Codex** – AI coding agent runtime

## Status

Active MVP deployment.

✅ Completed:

- Auth (GitHub OAuth + bootstrap token)
- Board UI with lanes
- Card CRUD
- Admin allowlists and policies
- D1 + R2 persistence
- Session management
- Run event logging

🚧 In progress:

- Cloudflare Container runtime
- Codex app-server integration
- Terminal attach via Ghostty WASM
- VNC support for Crabbox

## Get Started

1. [Read the Quickstart](/quickstart/) to bootstrap your first admin session
2. [Review Architecture](/architecture/) to understand the system design
3. [Learn about Cards](/cards/) to create your first coding task
4. [Explore Admin controls](/admin/) to configure access and policies

## Support

For OpenClaw org members: use #crabyard in Discord or file issues in the private repo.

## License

MIT License. Not affiliated with Cloudflare, GitHub, or Anthropic.
