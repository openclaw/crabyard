---
title: API Reference
layout: default
permalink: /api/
description: "REST API reference for Crabyard."
---

# API Reference

Crabyard exposes a same-origin REST API from the Worker. There are no live WebSocket APIs in the deployed MVP yet.

## Auth

Session cookie: `crabyard_session`

- GitHub OAuth: `/login/github`
- Bootstrap token: `POST /api/login/token`
- Logout: `POST /api/logout`

GitHub sessions last 15 minutes. Bootstrap sessions last 1 hour. API JSON responses use `cache-control: no-store`.

## Public Endpoints

### GET /healthz

Returns:

```text
ok
```

### GET /api/auth

Returns available login methods without requiring a session.

```json
{
  "auth": {
    "github": true,
    "token": true
  }
}
```

### POST /api/login/token

```json
{
  "token": "bootstrap-token"
}
```

Returns the bootstrap owner user and sets `crabyard_session`.

### GET /login/github

Starts GitHub OAuth with `read:user read:org`.

### GET /auth/github/callback

Completes OAuth, verifies active org membership, applies the allowlist, stores the user, and redirects to `/app`.

## Session Endpoints

### POST /api/logout

Deletes the session and clears the cookie.

### GET /api/session

Returns current user and enabled auth methods.

### GET /api/state

Returns app state:

```json
{
  "user": {},
  "auth": {},
  "org": "OpenClaw",
  "cap": 20,
  "retention": "30",
  "merge": "guarded",
  "allow": [],
  "repos": ["openclaw/openclaw", "openclaw/crabyard"],
  "workflows": [],
  "cards": []
}
```

Owner-only fields:

- `allow`
- `workflows`

Every card may include:

- `changes`: changed file summary; list responses omit diff patches
- `run`: active run attempt, including `selectionReason` and `capabilities`
- `logs`: last 80 events

## GitHub Lookup

### GET /api/github/refs?number=76552

Maintainer+. Searches enabled repos for issue/PR number matches.

```json
{
  "matches": [
    {
      "repo": "openclaw/openclaw",
      "number": 76552,
      "title": "Fix runtime policy",
      "source": "Issue",
      "state": "open",
      "url": "https://github.com/openclaw/openclaw/issues/76552",
      "author": "octocat",
      "updatedAt": "2026-05-17T10:00:00Z",
      "body": "..."
    }
  ]
}
```

With `GITHUB_TOKEN`, lookup runs across all enabled repos. Without it, lookup falls back to the preferred repo.

## Cards

### POST /api/cards

Maintainer+. Creates a card.

```json
{
  "prompt": "Implement allowlisted admin workflow",
  "repo": "openclaw/openclaw",
  "source": "Prompt",
  "runtime": "auto",
  "policy": ""
}
```

Fields:

- `prompt`: required, max 4000 chars.
- `repo`: required, enabled repo.
- `title`: optional, max 140 chars; derived from prompt if blank.
- `source`: optional `Prompt`, `Issue`, or `PR`.
- `runtime`: optional `auto`, `container`, or `crabbox`.
- `policy`: optional. Blank, `default`, or `repo_default` uses a valid repo workflow policy, then `open_pr`.

Invalid explicit merge policies return `400`.

### POST /api/cards/:id/actions

Actions:

- `start`: maintainer, claim run or pulse active run.
- `pulse`: maintainer, same as start for active runs.
- `advance`: maintainer, move to next lane.
- `attach`: viewer, fetch current card/logs.
- `watch`: viewer, record watch event.
- `takeover`: maintainer, requires active run and `capabilities.takeover`.
- `stall`: maintainer, mark active run stalled and move to Human Review.

Response:

```json
{
  "card": {}
}
```

Takeover errors:

- `400 no active run to take over`
- `400 runtime does not support takeover`

### GET /api/cards/:id/runs

Returns all run attempts for a card, newest first.

```json
{
  "runs": [
    {
      "id": "CY-101-R1",
      "cardId": "CY-101",
      "attempt": 1,
      "runtime": "container",
      "status": "running",
      "controlIntent": null,
      "leaseId": null,
      "attachUrl": null,
      "vncUrl": null,
      "selectionReason": "default container runtime",
      "capabilities": {
        "terminal": true,
        "takeover": false,
        "vnc": false,
        "desktop": false,
        "logs": true,
        "artifacts": true
      },
      "operator": null,
      "lastHeartbeatAt": 1779000000000,
      "startedAt": 1779000000000,
      "endedAt": null,
      "createdAt": 1779000000000,
      "updatedAt": 1779000000000,
      "error": null
    }
  ]
}
```

## Admin

Owner role required.

### POST /api/admin/allow

```json
{
  "value": "@openclaw/maintainer",
  "role": "maintainer"
}
```

Values can be `@login`, `@org/team`, or email. Returns full state.

### DELETE /api/admin/allow/:value

Removes an allowlist entry. `:value` is URL encoded.

### POST /api/admin/repos

```json
{
  "repo": "openclaw/openclaw"
}
```

Enables a repo. Returns full state.

### DELETE /api/admin/repos/:repo

Disables a repo by setting `enabled = 0`.

### PUT /api/admin/policy

```json
{
  "cap": 20,
  "retention": "30",
  "merge": "guarded"
}
```

Fields:

- `cap`: 1-200.
- `retention`: `14`, `30`, or `60`.
- `merge`: `guarded`, `disabled`, or `maintainers`.

### POST /api/admin/workflows/evaluate

Fetches and evaluates `CRABYARD.md` for an enabled repo. Private repos require deployment `GITHUB_TOKEN` access; the logged-in user's OAuth token is not used for this fetch.

```json
{
  "repo": "openclaw/openclaw"
}
```

Returns full state. Owner state includes workflow summaries with:

- `repo`
- `status`: `ok`, `missing`, `invalid`, or `error`
- `sourcePath`
- `sourceSha`
- `config`
- `error`
- `evaluatedAt`
- `updatedAt`

The stored prompt body is not returned in state summaries.

## Static Routes

- `/` and `/app`: app shell.
- `/docs`, `/docs/`, `/docs/spec`, `/docs/spec/`: generated docs page, or Markdown when `Accept` includes `text/markdown`.
- `/docs/spec.md`: Markdown spec.
- `/crabyard-logo.png`: logo.
- `/vendor/ghostty-web.js`: local Ghostty WASM bundle.

## Error Shape

```json
{
  "error": "message"
}
```

Common statuses:

- `400`: invalid input or unsupported action.
- `401`: missing/expired session.
- `403`: insufficient role, repo blocked, or no longer allowlisted.
- `404`: missing card or route.
- `503`: GitHub dependency unavailable or rate limited.
