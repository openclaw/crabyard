---
title: Quickstart
layout: default
permalink: /quickstart/
description: "Five minutes from deployment to your first Crabyard card and live Codex run."
---

# Quickstart

Get from zero to running your first Codex card in 5 minutes.

## Prerequisites

- OpenClaw GitHub org membership
- Bootstrap token (from deployment secrets)
- Access to https://crabyard.openclaw.ai/app/

## 1. Bootstrap Admin Login

Visit https://crabyard.openclaw.ai/app/ and log in with the bootstrap token.

1. Open https://crabyard.openclaw.ai/app/ in your browser
2. You'll see a login screen with two options:
   - **Continue with GitHub** (if OAuth is configured)
   - **Bootstrap token** (always available)
3. Paste your `CRABYARD_BOOTSTRAP_TOKEN` into the token field
4. Click "Use token"

You're now logged in as bootstrap admin with owner role.

> **Note:** Bootstrap sessions are short-lived (1 hour). Set up GitHub OAuth and add your GitHub user to the allowlist for persistent sessions.

## 2. Add Your GitHub User

Now that you're admin, add yourself to the allowlist:

1. Click the **Admin** button
2. In "Users and teams" section:
   - Enter your GitHub username (e.g., `@steipete`)
   - Select role: **Owner**
   - Click **Add**

Your GitHub user is now allowlisted. Next time you can log in via GitHub OAuth.

## 3. Add a Repo

Enable a repo for Codex runs:

1. Still in Admin panel, go to "Repos" section
2. Enter a repo in `owner/repo` format (e.g., `openclaw/crabyard`)
3. Click **Add**

Only allowlisted repos can be used for cards.

## 4. Create Your First Card

Return to the board and create a card:

1. Click the **Board** button to exit admin
2. Click **New card** (primary button in toolbar)
3. Fill in the card form:
   - **Source:** Prompt
   - **Repo:** Select the repo you just added
   - **Title:** "Add health check endpoint"
   - **Prompt:** "Add a new /healthz endpoint that returns 200 OK with basic system status"
   - **Runtime:** auto
   - **Merge policy:** open_pr
4. Click **Create**

Your card appears in the **Todo** lane.

## 5. Start a Run

Click the card to see actions, then start it:

1. Find your card in the Todo lane
2. Click **Start** button
3. Card moves to **Running** lane
4. Watch live logs appear in real-time

The scheduler will:

- Check capacity (default cap: 20 concurrent runs)
- Select runtime (Container or Crabbox)
- Clone the repo
- Start Codex with your prompt
- Stream logs to browser and R2

## 6. Watch Live Logs

View detailed logs and session info:

1. Click **Attach** on your running card
2. Terminal drawer opens showing live output
3. Session panel shows:
   - Repo, runtime, policy
   - Current state
   - VNC availability (Crabbox only)
4. Click **Watch** to stream logs
5. Click **Take over** to gain manual control (maintainer+)

Logs persist for 30 days in R2.

## 7. Review Results

When the run completes:

1. Card moves to **Human Review** or **Done**
2. Check the logs for PR link
3. Review the PR on GitHub
4. Merge manually or let Crabyard handle it (based on policy)

## Next Steps

### Configure GitHub OAuth

For production use, set up GitHub OAuth:

1. Create a GitHub OAuth app in your org
2. Set callback URL: `https://crabyard.openclaw.ai/auth/github/callback`
3. Add secrets to Cloudflare Worker:
   - `GITHUB_CLIENT_ID`
   - `GITHUB_CLIENT_SECRET`
4. Redeploy worker

Now users can log in with GitHub instead of bootstrap token.

### Add Team Allowlists

Instead of individual users, add entire teams:

1. Admin → Users and teams
2. Enter team as `@org/team` (e.g., `@openclaw/maintainer`)
3. Select role: Maintainer
4. All team members inherit access

### Adjust Policies

Configure org-wide defaults:

1. Admin → Policy section
2. Set **Concurrent cap** (default: 20)
3. Set **Direct merge** (guarded, disabled, or maintainers)
4. Set **Log retention** (14, 30, or 60 days)
5. Click **Save policy**

### Create Cards from Issues

Instead of freeform prompts:

1. Click **New card**
2. Change source to **Issue**
3. Search for an issue by number or URL
4. Card inherits issue title, body, and repo

### Create Cards from PRs

For review and fix tasks:

1. Click **New card**
2. Change source to **PR**
3. Search for a PR by number or URL
4. Codex can review, fix tests, rebase, or merge

## Troubleshooting

### "Capacity blocked at cap"

You've hit the concurrent run limit.

- Wait for a run to finish
- Or increase cap in Admin → Policy
- Default cap: 20 concurrent runs

### "Repo blocked by allowlist"

The repo hasn't been added.

- Admin → Repos → Add the repo
- Format: `owner/repo`

### "User is not in the Crabyard allowlist"

Your GitHub user isn't allowlisted.

- Admin → Users and teams
- Add your `@login` or your team `@org/team`

### Bootstrap token expired

Bootstrap sessions last 1 hour.

- Re-enter token to start a new session
- Or log in via GitHub OAuth if configured

## Tips

- **Search cards:** Use the search bar to filter by title, repo, or ID
- **Filter views:**
  - All – Show all cards
  - Mine – Show your cards only
  - Live – Show running cards only

## Learn More

- [Architecture](/architecture/) – How Crabyard works
- [Cards](/cards/) – Card lifecycle and policies
- [Runs](/runs/) – Runtime selection and execution
- [Admin](/admin/) – Access control deep dive
- [API Reference](/api/) – REST and WebSocket APIs
