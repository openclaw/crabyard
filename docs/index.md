---
title: Overview
layout: default
permalink: /
description: "Crabyard.ai is a Cloudflare Worker control plane for OpenClaw Codex cards and run attempts."
---

# Crabyard.ai Documentation

Crabyard is an OpenClaw control plane for Codex work: prompt cards, repo gates, durable run attempts, issue/PR previews, workflow policy, and attachable Ghostty WASM session views.

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
- Worker-served docs at `/docs/` and GitHub Pages docs at `docs.crabyard.ai`.

## Not Wired Yet

- Real Container/Crabbox lease creation.
- R2 artifact/terminal archival.
- Durable Object WebSocket fanout.
- Direct merge execution and ClawSweeper handoff.

## Quick Links

- **[Quickstart](/quickstart/)** – Bootstrap admin, create a card, start a recorded run attempt
- **[Architecture](/architecture/)** – Worker, D1/Kysely, runtime descriptors, workflow config
- **[Cards](/cards/)** – Card lifecycle, policies, sources
- **[Runs](/runs/)** – Run attempts, runtime selection, Ghostty grid
- **[Admin](/admin/)** – Access control, allowlists, policies
- **[API Reference](/api/)** – REST endpoints
- **[Complete Spec](/spec/)** – Product specification and planned integrations

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
