---
title: Runs
layout: default
permalink: /runs/
description: "Runtime execution, logs, attach/takeover, and debugging for Codex runs."
---

# Runs

A run is the execution instance of a card. When a card moves to Running, a run begins.

## Run Lifecycle

### States

```
Queued
  ↓
Leasing (acquire runtime)
  ↓
Bootstrapping (clone repo, install deps)
  ↓
Running (Codex active)
  ↓
[branches based on outcome]
  ├→ Succeeded (PR opened or task complete)
  ├→ Failed (unrecoverable error)
  ├→ Stalled (no heartbeat, timeout)
  └→ Waiting (human review needed)
```

### Typical Flow

1. **Card enters Todo**
   - User creates card or scheduler queues it
   - Card waits for capacity

2. **Scheduler claims card**
   - Checks: capacity available, repo allowlisted
   - Selects runtime (Container or Crabbox)
   - Card moves to Running

3. **Runtime bootstraps**
   - Allocate Container or Crabbox lease
   - Clone repo
   - Install dependencies (npm/pnpm/cargo/etc.)
   - Start Codex in CLI or app-server mode

4. **Codex executes**
   - Reads prompt and repo context
   - Makes changes
   - Runs tests/validation
   - Creates branch and PR

5. **Run completes**
   - Success: PR opened, card → Human Review or Done
   - Failure: Error logged, card → Failed
   - Stalled: No heartbeat, card → Stalled

## Runtime Options

### Cloudflare Containers

Lightweight, fast startup, ideal for autonomous runs.

**Specs:**

- vCPU: 1-2 cores
- RAM: 2-4GB
- Storage: Ephemeral (10-20GB)
- Network: Full internet access

**Includes:**

- Codex CLI
- Git + GitHub CLI
- Node + pnpm
- Python + pip
- Common build tools (make, gcc, etc.)

**Limitations:**

- No VNC/GUI
- No Docker-in-Docker (use Crabbox)
- Max runtime: 30-60min (configurable)
- Ephemeral filesystem (logs persist to R2)

**Best for:**

- Autonomous app-server runs
- Standard web/Node/Python projects
- Fast turnaround tasks
- No manual debugging needed

### Crabbox

Full VM leases, heavier but more capable.

**Specs:**

- vCPU: 4-8 cores
- RAM: 8-16GB
- Storage: 50-100GB
- GPU: Optional (for ML tasks)

**Includes:**

- Full desktop environment
- VNC/noVNC access
- Docker
- Native compilation tools
- SSH access

**Limitations:**

- Slower startup (~2-5min)
- Higher cost
- Manual cleanup required

**Best for:**

- Manual CLI sessions
- VNC/GUI debugging
- Docker builds
- Native compilation (Rust, C++, etc.)
- Browser/E2E testing
- Tasks requiring custom system deps

### Runtime Selection Logic

Scheduler auto-selects based on card policy and requirements:

1. **VNC required?**
   - Always Crabbox

2. **Manual CLI takeover first?**
   - Prefer Crabbox (unless container PTY enabled)

3. **Job fits container limits?**
   - Yes + standard deps → Container
   - No → Crabbox

4. **System dependencies?**
   - Standard (Node, Python, Git) → Container
   - Custom (Docker, GPU, native tools) → Crabbox

5. **Org cap reached?**
   - Queue in Todo

Override via card `runtime` field: `auto`, `container`, `crabbox`.

## Logs and Events

### Event Stream

Run events logged to D1 + R2:

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

UI shows last 80 events. Full history in R2.

### Log Files

R2 layout per run:

```
orgs/openclaw/runs/CY-101/
  ├── events.ndjson          # Lifecycle events
  ├── terminal.raw           # PTY byte stream (for replay)
  ├── terminal.ndjson        # Timestamped terminal chunks
  ├── app-server.ndjson      # JSON-RPC messages (Codex app-server)
  ├── summary.json           # Final status, PR links, artifacts
  └── artifacts/
       ├── screenshot-001.png
       └── diff.patch
```

### Log Retention

Default: 30 days (configurable: 14, 30, 60)

After expiry:

- R2 logs deleted
- D1 keeps minimal summary (card ID, timestamps, final state)
- Terminal replay unavailable

## Terminal Access

### Watch Mode

Read-only live stream.

**How to use:**

1. Click "Attach" on Running card
2. Terminal drawer opens
3. Click "Watch" to stream logs

**What you see:**

- Real-time terminal output
- Scrollback buffer (last 10K lines)
- Elapsed timer

**Permissions:**

- Any role (viewer, maintainer, owner)

### Takeover Mode

Full control of Codex session.

**How to use:**

1. Click "Attach" on Running card
2. Click "Take over" (requires maintainer+)
3. Type commands, interact with Codex

**What you can do:**

- Type in Codex CLI
- Steer app-server turns
- Pause/resume autonomous execution
- Manually create PRs, run tests, etc.

**Permissions:**

- Maintainer or owner role

**Audit trail:**

- Takeover recorded in event log
- Operator login and timestamp logged

### PTY Rendering

Terminal sessions render in a fullscreen Ghostty WebAssembly grid:

- Full xterm.js compatibility
- Color support, 256-color mode
- Scrollback buffer
- Copy/paste
- Resize events

Current MVP: Ghostty renders replayed attach logs; live PTY byte transport is the next runtime integration step.

## Heartbeat and Stall Detection

### Heartbeat Sources

Run considered "alive" if any of these occur within last N minutes:

- Terminal output (PTY data)
- App-server notification (JSON-RPC event)
- Runtime heartbeat ping
- Crabbox lease heartbeat
- Container health probe

Default stall threshold: 5 minutes (no activity)

### Stall Handling

When no heartbeat detected:

1. Mark run as "stalled"
2. Attempt graceful interrupt (SIGINT)
3. Wait 30s for cleanup
4. Force terminate (SIGKILL)
5. Preserve workspace if Crabbox
6. Log final events
7. Move card to Stalled lane

**Retry policy:**

- Manual retry: move card Todo → Running
- Stalled runs do not auto-retry (prevent loops)

## Merge Automation

### Direct Merge

When merge policy allows:

1. **Refresh PR state from GitHub**
   - Fetch PR head SHA, base branch, checks, reviews

2. **Verify guardrails**
   - Repo allowlisted
   - User/org policy allows direct merge
   - Exact head SHA matches reviewed SHA
   - All required checks green
   - Branch up to date or merge queue accepted
   - No active takeover
   - No unresolved required review state

3. **Perform merge**
   - Merge via GitHub API (fast-forward or merge commit)
   - Record audit event

4. **Update card**
   - Move to Done
   - Log merge commit SHA

**Blocked scenarios:**

- Any required check failing → Wait
- Branch out of date → Rebase or wait for merge queue
- Unresolved reviews → Wait
- Takeover active → Block until resumed

### ClawSweeper Handoff

For review/fix loops:

1. Run completes, opens PR
2. Crabyard sends handoff intent to ClawSweeper
3. ClawSweeper takes over:
   - Review loop
   - Fix CI failures
   - Rebase if needed
   - Merge when clean

Preferred for `fix_until_green_and_merge` policy.

## Performance Metrics

### Typical Runtimes

| Job Type                    | Container | Crabbox  |
| --------------------------- | --------- | -------- |
| Bootstrap (clone + install) | 30-60s    | 2-5min   |
| Simple prompt (1-2 files)   | 2-5min    | 3-7min   |
| Medium task (5-10 files)    | 5-15min   | 7-20min  |
| Heavy build (tests + lint)  | 10-30min  | 15-45min |

### Concurrency

Default cap: 20 concurrent runs

**Planning:**

- 10 users × 2 cards each = 20 cap
- Or 5 heavy jobs + 15 light jobs
- Adjust in Admin → Policy (1-200)

**Scaling:**

- Cloudflare Workers auto-scale
- D1/R2 scale independently
- Bottleneck: Crabbox provider capacity

## Debugging Runs

### Common Issues

**Run stuck in Leasing:**

- Crabbox provider at capacity
- Check Crabbox status page
- Retry with `container` runtime

**Run stuck in Bootstrapping:**

- Repo clone failed (auth, size)
- Dependency install failed (network, registry down)
- Check logs for error details

**Run stalled during execution:**

- Codex waiting for input (prompt ambiguous)
- Codex in infinite loop (rare)
- Take over and manually steer

**PR not created:**

- Codex determined no changes needed
- Git push failed (auth, branch protection)
- Check full logs in R2

### Debugging Workflow

1. **Check live logs**
   - Attach to Running card
   - Watch terminal output
   - Look for errors or stalls

2. **Review event timeline**
   - Identify where run stopped
   - Check for error messages

3. **Take over session**
   - Gain manual control
   - Run commands manually
   - Steer Codex back on track

4. **Inspect workspace (Crabbox only)**
   - SSH into Crabbox lease
   - Inspect filesystem, logs, build artifacts
   - Run tests manually

5. **Preserve for analysis**
   - Click "Mark stalled" to preserve workspace
   - Prevents auto-cleanup
   - Manual SSH access available

## API Reference

### Start Run

```bash
POST /api/cards/:id/actions
{
  "action": "start"
}
```

### Attach to Run

```bash
POST /api/cards/:id/actions
{
  "action": "attach"
}
```

Returns full card with `logs` array (last 80 events).

### Watch Run (WebSocket)

```bash
GET /ws/run/:id
```

Streams:

```json
{"type": "event", "message": "...", "timestamp": 1234567890}
{"type": "state_changed", "state": "Running"}
{"type": "heartbeat", "elapsed": 45000}
```

### Take Over

```bash
POST /api/cards/:id/actions
{
  "action": "takeover"
}
```

Requires maintainer+ role. Records operator in audit log.

### Mark Stalled

```bash
POST /api/cards/:id/actions
{
  "action": "stall"
}
```

Moves card to Human Review, preserves workspace.

## Best Practices

### Prompt Design

**Be specific:**

- Include exact file paths
- Reference existing patterns
- Set clear success criteria

**Provide context:**

- "Read AGENTS.md first"
- "Follow existing test patterns in src/"
- "Use pnpm, not npm"

**Set boundaries:**

- "Keep changes to src/api/ only"
- "Do not modify database schema"
- "Open PR, do not merge"

### Runtime Selection

**Use `auto` unless:**

- You need to debug via VNC → `crabbox`
- You need fastest turnaround → `container`
- Job requires Docker builds → `crabbox`

### Monitoring

**Check "Live" view:**

- Running count should match expected load
- Stalled runs indicate problems

**Review logs regularly:**

- Catch errors early
- Adjust prompts based on common failures

**Take over when needed:**

- If Codex seems stuck, intervene
- Better to steer than wait for stall

### Merge Safety

**Start conservative:**

- Use `open_pr` for new repos
- Manually review first few PRs

**Escalate gradually:**

- Move to `merge_when_green` after trust established
- Use `fix_until_green_and_merge` only for well-known tasks

**Monitor merged PRs:**

- Review quality of auto-merged changes
- Roll back policy if quality drops

## Next Steps

- [Cards](/cards/) – Card lifecycle and policies
- [Admin](/admin/) – Access control and runtime caps
- [API Reference](/api/) – Complete REST and WebSocket API docs
