---
title: Cards
layout: default
permalink: /cards/
description: "Card lifecycle, policies, and source types in Crabyard."
---

# Cards

Cards are the primary object in Crabyard. Each card represents a coding task, its execution history, and current state.

## Card Anatomy

```typescript
{
  id: "CY-101",
  title: "Add health check endpoint",
  prompt: "Add a new /healthz endpoint that returns 200 OK with basic system status",
  repo: "openclaw/crabyard",
  source: "Prompt",
  runtime: "auto",
  policy: "open_pr",
  lane: "Running",
  owner: "steipete",
  startedAt: 1736700000000,
  createdAt: 1736699900000,
  changes: {
    files: [
      { path: "src/index.ts", status: "modified", additions: 18, deletions: 5 }
    ],
    patch: "diff --git ...",
    totals: { files: 1, additions: 18, deletions: 5 }
  },
  logs: [
    "14:32:01 card created",
    "14:32:01 repo allowlist ok",
    "14:32:15 scheduler claimed openclaw/crabyard",
    ...
  ]
}
```

Cards stay empty until a run reports changes. Once diff metadata exists, the tile shows Codiff-style file badges, status, and `+/-` totals. The run drawer keeps the terminal log visible and adds a compact patch view for review.

## Card Sources

Type an issue or PR number such as `#76552` in the board search to preview matching GitHub issues/PRs across enabled OpenClaw repos. If the same number exists in multiple repos, each match appears separately and can be turned into a card.

### Prompt

Freeform coding task.

**When to use:**

- Quick one-off tasks
- Exploratory coding
- No existing issue/PR to track

**Required fields:**

- Title
- Prompt (up to 4000 chars)
- Repo selection

**Example:**

```
Title: Add health check endpoint
Prompt: Add a new /healthz endpoint that returns 200 OK with
        basic system status including uptime and version.
Repo: openclaw/crabyard
```

### Issue

Task derived from GitHub issue.

**When to use:**

- Existing issue needs implementation
- Track work against issue timeline
- Auto-close issue on merge

**Card inherits:**

- Issue title
- Issue body (appended to prompt)
- Repo from issue URL
- Issue number reference

**Example:**

```
Source: Issue
Issue: openclaw/crabyard#42
Title: Add /healthz endpoint (from issue)
Prompt: (issue body) + custom instructions
```

### PR

Review, fix, or rebase existing PR.

**When to use:**

- PR needs fixes before merge
- CI failing, needs repair
- Rebase required
- Code review suggests changes

**Card inherits:**

- PR title
- PR number and head SHA
- Base branch
- Repo from PR URL

**Example:**

```
Source: PR
PR: openclaw/crabyard#123
Task: Fix failing tests, rebase on main
```

## Card Lifecycle

### Lane Progression

```
Todo
  ↓ (scheduler claims when capacity available)
Running
  ↓ (Codex completes or stalls)
Human Review
  ↓ (human approves or merges)
Done
```

**Alternate lanes:**

- **Rework** – Needs fixes before retry
- **Canceled** – Manually canceled
- **Failed** – Unrecoverable error

### State Transitions

**Todo → Running:**

- Triggered by: Scheduler auto-claim or manual "Start" click
- Prerequisites: Capacity available, repo allowlisted
- Effects: Allocates runtime, starts Codex

**Running → Human Review:**

- Triggered by: Codex completes, opens PR, awaits review
- Effects: Preserves workspace, waits for human action

**Running → Done:**

- Triggered by: Direct merge policy + all checks green
- Effects: Merges PR, archives workspace

**Running → Stalled:**

- Triggered by: No heartbeat for N minutes
- Effects: Graceful interrupt, preserve logs

**Human Review → Done:**

- Triggered by: Human clicks "Move" or direct merge succeeds
- Effects: Archives card

### Manual Actions

**Start:**

- Moves Todo → Running (claims capacity)
- Or pulses heartbeat if already Running

**Advance:**

- Moves to next lane in sequence
- Todo → Running → Human Review → Done → Todo (loops)

**Attach:**

- Opens terminal drawer
- Shows live logs
- Read-only by default

**Watch:**

- Subscribes to live WebSocket stream
- Terminal output rendered in real-time

**Take over:**

- Grants manual control of Codex session
- Pauses autonomous loop
- Records operator and timestamp

**Mark stalled:**

- Manually marks run as stalled
- Preserves workspace for debugging

## Card Policies

### Runtime Mode

Selects execution environment.

**Options:**

- `auto` – Scheduler chooses based on job requirements
- `container` – Force Cloudflare Container
- `crabbox` – Force Crabbox VM

**Auto selection logic:**

1. VNC required? → Crabbox
2. Manual CLI first? → Crabbox
3. Job fits container? → Container
4. System deps unsupported? → Crabbox

**When to override:**

- Force `container` for fast, autonomous runs
- Force `crabbox` for debugging, VNC, or heavy builds

### Merge Policy

Determines how Codex handles PR creation and merging.

**open_pr:**

- Opens PR, stops
- Human reviews and merges manually
- Safest option

**merge_when_green:**

- Opens PR
- If all checks pass and branch is up to date, auto-merge
- No fix retries

**fix_until_green_and_merge:**

- Opens PR
- Retries CI failures
- Rebases if needed
- Merges when clean
- Most autonomous (use with caution)

**Policy gates:**

- Repo must allow direct merge
- Org policy must allow maintainer merge
- User must have maintainer+ role
- All required checks must be green
- Branch must be up to date

**Recommended:**

- Start with `open_pr` for new repos
- Use `merge_when_green` for stable, well-tested codebases
- Reserve `fix_until_green_and_merge` for trusted tasks only

## Card Metadata

### Owner

GitHub login of the user who created the card.

Used for:

- "Mine" filter
- Audit trail
- Notifications (future)

### Started At

Timestamp when card entered Running.

Used for:

- Elapsed timer display
- Average runtime metrics
- Timeout detection

### Created At

Timestamp when card was created.

Used for:

- Card ordering (newest first by default)
- Age calculations

### Last Event

Most recent event message.

Shown on card preview in board view.

Examples:

- "card created"
- "scheduler claimed openclaw/crabyard"
- "PR opened: #456"
- "stalled; workspace preserved"

## Card Logs

### Event History

Last 80 events per card shown in UI:

```
14:32:01 card created
14:32:01 repo allowlist ok
14:32:15 scheduler claimed openclaw/crabyard
14:32:15 runtime=auto policy=open_pr
14:32:16 container allocated
14:32:18 repo checkout complete
14:32:20 codex started
14:35:12 PR opened: #456
14:35:12 moved to Human Review
```

Full history (unlimited) stored in R2.

### Log Retention

Default: 30 days

After retention expires:

- R2 logs/artifacts deleted
- D1 keeps minimal run summary
- Card still visible in board with basic metadata

Configurable in Admin → Policy (14, 30, or 60 days).

## Card Filtering

### All

Shows all cards in all lanes.

Default view.

### Mine

Shows only cards you created.

Filters by `owner` field matching your login.

### Live

Shows only Running cards.

Useful for monitoring active sessions.

### Search

Text search across:

- Card ID (e.g., "CY-101")
- Title
- Repo
- Runtime
- Policy

Example: "openclaw health" → matches cards with "openclaw" in repo and "health" in title.

## Card Limits

### Per-Org Caps

**Concurrent runs:**

- Default: 20
- Configurable: 1–200
- When cap reached, new cards queue in Todo
- Scheduler claims as capacity frees

**Card creation:**

- No hard limit
- Todo queue can grow unbounded
- Cards in other lanes don't count toward cap

### Per-Card Limits

**Prompt length:**

- 4000 characters max
- Truncated if exceeded

**Title length:**

- 140 characters max

**Run attempts:**

- No hard retry limit (policy-dependent)
- Manual retry by moving Done → Todo

**Log size:**

- 4MB soft limit per R2 log file
- Large outputs chunked into multiple files

## Working with Cards

### Creating Cards

**Via UI:**

1. Click "New card"
2. Fill form (source, repo, prompt, optional title, runtime, policy)
3. Click "Create"

**Via API:**

```bash
curl -X POST https://crabyard.openclaw.ai/api/cards \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Add health check",
    "prompt": "Add /healthz endpoint",
    "repo": "openclaw/crabyard",
    "source": "Prompt",
    "runtime": "auto",
    "policy": "open_pr"
  }'
```

### Starting Cards

**Auto-start:**

- Scheduler auto-claims Todo cards when capacity available
- FIFO by default (oldest first)

**Manual start:**

1. Find card in Todo lane
2. Click "Start"
3. Card transitions to Running if capacity available

### Monitoring Cards

**Board view:**

- All cards shown in lanes
- Color-coded by state
- Live timer on Running cards

**Detail view:**

1. Click card
2. Terminal drawer shows logs
3. Session panel shows runtime, policy, state

**WebSocket stream:**

- Subscribe to `/ws/run/:id`
- Receive real-time events

### Debugging Cards

**Attach to logs:**

1. Click "Attach" on Running card
2. View live terminal output
3. Scroll through history

**Take over session:**

1. Click "Take over" (maintainer+)
2. Gain manual control of Codex
3. Type commands, steer execution
4. Click "Watch" to resume autonomous mode

**Preserve workspace:**

1. Click "Mark stalled" if stuck
2. Workspace preserved for manual SSH/inspection
3. Crabbox runs support SSH access

## Best Practices

### Prompt Engineering

**Be specific:**

```
❌ "Fix tests"
✅ "Fix failing test_health_check in src/api.test.ts by updating mock response"
```

**Reference context:**

```
✅ "Read AGENTS.md first. Add /healthz endpoint following existing route patterns."
```

**Set boundaries:**

```
✅ "Keep changes scoped to src/api/. Do not modify database schema."
```

### Runtime Selection

**Use `auto` unless:**

- You need VNC/GUI debugging → `crabbox`
- You need fast, autonomous execution → `container`
- Job requires Docker/native compilation → `crabbox`

### Merge Policy

**Start conservative:**

- New repo? → `open_pr`
- Established workflow? → `merge_when_green`
- Fully trusted task? → `fix_until_green_and_merge`

**Review before escalating:**

- Test `open_pr` first
- Graduate to `merge_when_green` after observing PR quality
- Use `fix_until_green_and_merge` sparingly

### Monitoring

**Check "Live" view regularly:**

- Running count should match expected load
- Stalled cards indicate issues
- Long-running cards may need intervention

**Review logs:**

- Attach to Running cards periodically
- Check for error patterns
- Take over if Codex seems stuck

**Audit merged PRs:**

- Review PRs merged via `merge_when_green`
- Ensure quality matches standards
- Adjust policy if needed

## Troubleshooting

### Card Stuck in Todo

**Cause:** Capacity cap reached

**Solution:**

- Wait for Running cards to finish
- Or increase cap in Admin → Policy

### Card Stalled

**Cause:** No heartbeat for N minutes (no output/events)

**Solution:**

- Check logs for last activity
- Manual retry: click "Move" to Todo, then "Start"
- If persistent, force `crabbox` runtime

### PR Not Created

**Cause:** Codex completed but no PR link in logs

**Solution:**

- Check full logs in R2
- Codex may have determined no changes needed
- Or error during git push (check auth/permissions)

### Direct Merge Blocked

**Cause:** Policy or checks prevent auto-merge

**Solution:**

- Verify org policy allows direct merge (Admin → Policy)
- Check all required CI checks passed
- Ensure branch is up to date
- User has maintainer+ role

## API Reference

See [API Documentation](/api/) for complete endpoint reference.

**Key endpoints:**

- `POST /api/cards` – Create card
- `GET /api/state` – Fetch all cards
- `POST /api/cards/:id/actions` – Start, attach, advance, etc.
- `GET /ws/run/:id` – Live WebSocket stream

## Next Steps

- [Runs](/runs/) – Runtime execution and logs
- [Admin](/admin/) – Access control and policies
- [API Reference](/api/) – REST and WebSocket APIs
