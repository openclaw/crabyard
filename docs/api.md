---
title: API Reference
layout: default
permalink: /api/
description: "Complete REST and WebSocket API reference for Crabyard."
---

# API Reference

Crabyard provides REST APIs for state management and WebSocket streams for real-time updates.

## Authentication

All API requests require authentication via session cookie.

**Cookie name:** `crabyard_session`

**Set via:**

- GitHub OAuth flow (`/login/github`)
- Bootstrap token login (`/api/login/token`)

**Attributes:**

- HttpOnly
- Secure
- SameSite=Lax
- Path=/

**Expiry:**

- GitHub OAuth: 15 minutes
- Bootstrap: 1 hour (no refresh)

## REST Endpoints

### GET /healthz

Health check endpoint.

**Response:**

```
ok
```

**Status:** 200 OK

**Use case:** Monitoring, deployment verification

### GET /api/auth

Fetch available auth methods.

**Auth:** None required

**Response:**

```json
{
  "auth": {
    "github": true,
    "token": true
  }
}
```

**Fields:**

- `github` – GitHub OAuth enabled
- `token` – Bootstrap token enabled

### POST /api/login/token

Log in with bootstrap token.

**Auth:** None required

**Request:**

```json
{
  "token": "bootstrap-token-value"
}
```

**Response:**

```json
{
  "user": {
    "subject": "bootstrap:abc123...",
    "login": "bootstrap",
    "email": null,
    "name": "Bootstrap Admin",
    "role": "owner",
    "allowed": true,
    "teams": []
  },
  "auth": {
    "github": true,
    "token": true
  }
}
```

**Headers:**

```
set-cookie: crabyard_session=...; HttpOnly; Secure; ...
```

**Errors:**

- 401 Unauthorized – Invalid token

### GET /login/github

Initiate GitHub OAuth flow.

**Auth:** None required

**Response:** 302 redirect to `github.com/login/oauth/authorize`

**Query params (set by Crabyard):**

- `client_id` – GitHub OAuth app ID
- `redirect_uri` – `https://crabyard.openclaw.ai/auth/github/callback`
- `scope` – `read:user read:org`
- `state` – CSRF token

### GET /auth/github/callback

GitHub OAuth callback.

**Auth:** OAuth state cookie

**Query params (from GitHub):**

- `code` – OAuth authorization code
- `state` – CSRF token (must match cookie)

**Response:** 302 redirect to `/app`

**Headers:**

```
set-cookie: crabyard_session=...; HttpOnly; Secure; ...
```

**Errors:**

- 400 Bad Request – Invalid state
- 401 Unauthorized – Token exchange failed
- 403 Forbidden – User not in org or allowlist

### POST /api/logout

End current session.

**Auth:** Session cookie

**Response:**

```json
{
  "ok": true
}
```

**Headers:**

```
set-cookie: crabyard_session=; Max-Age=0
```

### GET /api/session

Fetch current user info.

**Auth:** Session cookie

**Response:**

```json
{
  "user": {
    "subject": "github:12345",
    "login": "steipete",
    "email": "peter@steipete.me",
    "name": "Peter Steinberger",
    "role": "owner",
    "allowed": true,
    "teams": ["@openclaw/core", "@openclaw/maintainers"]
  },
  "auth": {
    "github": true,
    "token": true
  }
}
```

**Errors:**

- 401 Unauthorized – Session expired or invalid

### GET /api/state

Fetch full app state (cards, allowlists, repos, policies).

**Auth:** Session cookie (any role)

**Response:**

```json
{
  "user": {...},
  "auth": {...},
  "org": "OpenClaw",
  "cap": 20,
  "retention": "30",
  "merge": "guarded",
  "allow": [
    {"value": "@steipete", "role": "owner"},
    {"value": "@openclaw/maintainers", "role": "maintainer"}
  ],
  "repos": ["openclaw/crabyard", "openclaw/codex"],
  "cards": [
    {
      "id": "CY-101",
      "title": "Add health check endpoint",
      "prompt": "Add a new /healthz endpoint...",
      "repo": "openclaw/crabyard",
      "source": "Prompt",
      "runtime": "auto",
      "policy": "open_pr",
      "lane": "Running",
      "owner": "steipete",
      "startedAt": 1736700000000,
      "createdAt": 1736699900000,
      "logs": [
        "14:32:01 card created",
        "14:32:15 scheduler claimed openclaw/crabyard",
        ...
      ]
    },
    ...
  ]
}
```

**Notes:**

- `allow` field only included for owner role
- `cards` includes all cards across all lanes
- `logs` is last 80 events per card

### POST /api/cards

Create a new card.

**Auth:** Maintainer+

**Request:**

```json
{
  "title": "Add health check endpoint",
  "prompt": "Add a new /healthz endpoint that returns 200 OK with basic system status",
  "repo": "openclaw/crabyard",
  "source": "Prompt",
  "runtime": "auto",
  "policy": "open_pr"
}
```

**Fields:**

- `title` (required, max 140 chars)
- `prompt` (required, max 4000 chars)
- `repo` (required, must be allowlisted, format: `owner/repo`)
- `source` (optional, one of: `Prompt`, `Issue`, `PR`, default: `Prompt`)
- `runtime` (optional, one of: `auto`, `container`, `crabbox`, default: `auto`)
- `policy` (optional, one of: `open_pr`, `merge_when_green`, `fix_until_green_and_merge`, default: `open_pr`)

**Response:**

```json
{
  "card": {
    "id": "CY-102",
    "title": "Add health check endpoint",
    "prompt": "Add a new /healthz endpoint...",
    "repo": "openclaw/crabyard",
    "source": "Prompt",
    "runtime": "auto",
    "policy": "open_pr",
    "lane": "Todo",
    "owner": "steipete",
    "startedAt": null,
    "createdAt": 1736700000000,
    "logs": ["14:32:01 card created", "14:32:01 repo allowlist ok"]
  }
}
```

**Status:** 201 Created

**Errors:**

- 400 Bad Request – Missing required fields
- 403 Forbidden – Repo not allowlisted

### POST /api/cards/:id/actions

Perform action on card.

**Auth:** Viewer+ (read-only actions), Maintainer+ (control actions)

**Request:**

```json
{
  "action": "start"
}
```

**Actions:**

| Action     | Role        | Effect                                                 |
| ---------- | ----------- | ------------------------------------------------------ |
| `start`    | Maintainer+ | Start run (Todo → Running) or pulse heartbeat          |
| `pulse`    | Maintainer+ | Same as `start` (alias)                                |
| `advance`  | Maintainer+ | Move to next lane in sequence                          |
| `attach`   | Viewer+     | Fetch card with logs (read-only)                       |
| `watch`    | Viewer+     | Subscribe to WebSocket (read-only)                     |
| `takeover` | Maintainer+ | Grant manual control, record operator                  |
| `stall`    | Maintainer+ | Mark stalled, move to Human Review, preserve workspace |

**Response:**

```json
{
  "card": {
    "id": "CY-101",
    "title": "...",
    "logs": [...],
    ...
  }
}
```

Returns updated card state.

**Errors:**

- 400 Bad Request – Unknown action
- 403 Forbidden – Insufficient role
- 404 Not Found – Card not found

## Admin Endpoints

All admin endpoints require owner role.

### POST /api/admin/allow

Add user or team to allowlist.

**Auth:** Owner

**Request:**

```json
{
  "value": "@steipete",
  "role": "maintainer"
}
```

**Fields:**

- `value` (required, format: `@login` or `@org/team`)
- `role` (required, one of: `viewer`, `maintainer`, `owner`)

**Response:**
Full state object (same as `GET /api/state`)

**Status:** 201 Created

**Errors:**

- 400 Bad Request – Invalid value or role
- 403 Forbidden – Not owner

### DELETE /api/admin/allow/:value

Remove user or team from allowlist.

**Auth:** Owner

**Params:**

- `:value` – URL-encoded allowlist entry (e.g., `%40steipete`)

**Response:**
Full state object

**Errors:**

- 403 Forbidden – Not owner
- 404 Not Found – Value not in allowlist

### POST /api/admin/repos

Add repo to allowlist.

**Auth:** Owner

**Request:**

```json
{
  "repo": "openclaw/crabyard"
}
```

**Fields:**

- `repo` (required, format: `owner/repo`)

**Response:**
Full state object

**Status:** 201 Created

### DELETE /api/admin/repos/:repo

Remove repo from allowlist (sets `enabled=0`).

**Auth:** Owner

**Params:**

- `:repo` – URL-encoded repo name (e.g., `openclaw%2Fcrabyard`)

**Response:**
Full state object

### PUT /api/admin/policy

Update org policies.

**Auth:** Owner

**Request:**

```json
{
  "cap": 30,
  "retention": "60",
  "merge": "disabled"
}
```

**Fields (all optional):**

- `cap` (number, 1-200, default: 20)
- `retention` (string, one of: `"14"`, `"30"`, `"60"`, default: `"30"`)
- `merge` (string, one of: `"guarded"`, `"disabled"`, `"maintainers"`, default: `"guarded"`)

Omitted fields unchanged.

**Response:**
Full state object

## WebSocket Streams

### /ws/board/:board_id

Real-time board updates (future).

**Auth:** Session cookie (any role)

**Events:**

```json
{"type": "card_created", "card": {...}}
{"type": "card_updated", "card": {...}}
{"type": "lane_changed", "cardId": "CY-101", "lane": "Running"}
{"type": "metrics_updated", "active": 3, "queue": 5, "review": 2}
```

**Not yet implemented** – Planned for future release.

### /ws/run/:id

Live run events and terminal stream (future).

**Auth:** Session cookie (viewer+ for watch, maintainer+ for takeover)

**Events:**

```json
{"type": "event", "message": "scheduler claimed openclaw/crabyard", "timestamp": 1234567890}
{"type": "state_changed", "state": "Running"}
{"type": "heartbeat", "elapsed": 45000}
{"type": "terminal_data", "data": "base64-encoded-pty-bytes"}
{"type": "terminal_resize", "cols": 120, "rows": 40}
```

**Not yet implemented** – Planned for future release.

## Static Routes

### GET /

Main app shell.

**Response:** HTML (app.html)

**Content-Type:** text/html

### GET /app

Alias for `/`.

### GET /docs/spec

Product spec document (HTML or Markdown).

**Response:** HTML by default

**Accept header:**

- `text/markdown` → Returns Markdown
- `text/html` or `*/*` → Returns HTML

### GET /docs/spec.md

Product spec in Markdown format.

**Response:** Markdown

**Content-Type:** text/markdown

## Error Responses

All errors return JSON:

```json
{
  "error": "error message"
}
```

**Common status codes:**

| Code | Meaning                                                    |
| ---- | ---------------------------------------------------------- |
| 400  | Bad Request – Invalid input                                |
| 401  | Unauthorized – Session expired or missing                  |
| 403  | Forbidden – Insufficient permissions                       |
| 404  | Not Found – Resource not found                             |
| 500  | Internal Server Error – Unexpected failure                 |
| 503  | Service Unavailable – Dependency down (GitHub OAuth, etc.) |

## Rate Limits

No explicit rate limits (yet).

Cloudflare Workers auto-scale but may throttle abusive traffic.

**Best practices:**

- Batch card creation instead of rapid sequential requests
- Use WebSockets for live updates (when available)
- Poll `/api/state` at most once per 5 seconds

## CORS

Same-origin only. No CORS headers.

All browser API requests must originate from `https://crabyard.openclaw.ai`.

## Headers

**All responses include:**

```
x-content-type-options: nosniff
referrer-policy: no-referrer
cache-control: no-store (API) or public, max-age=300 (static)
```

## Examples

### Create Card and Start Run

```bash
# Log in (get session cookie)
curl -X POST https://crabyard.openclaw.ai/api/login/token \
  -H "Content-Type: application/json" \
  -d '{"token": "your-bootstrap-token"}' \
  -c cookies.txt

# Create card
curl -X POST https://crabyard.openclaw.ai/api/cards \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{
    "title": "Add health check",
    "prompt": "Add /healthz endpoint",
    "repo": "openclaw/crabyard",
    "runtime": "auto",
    "policy": "open_pr"
  }'

# Start run
curl -X POST https://crabyard.openclaw.ai/api/cards/CY-102/actions \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{"action": "start"}'

# Watch logs (attach)
curl -X POST https://crabyard.openclaw.ai/api/cards/CY-102/actions \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{"action": "attach"}'
```

### Manage Allowlist

```bash
# Add user
curl -X POST https://crabyard.openclaw.ai/api/admin/allow \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{"value": "@jane", "role": "maintainer"}'

# Add team
curl -X POST https://crabyard.openclaw.ai/api/admin/allow \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{"value": "@openclaw/core", "role": "owner"}'

# Remove user
curl -X DELETE 'https://crabyard.openclaw.ai/api/admin/allow/%40jane' \
  -b cookies.txt

# Add repo
curl -X POST https://crabyard.openclaw.ai/api/admin/repos \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{"repo": "openclaw/codex"}'

# Update policy
curl -X PUT https://crabyard.openclaw.ai/api/admin/policy \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{"cap": 30, "retention": "60", "merge": "guarded"}'
```

## TypeScript Client

Example TypeScript client (unofficial):

```typescript
class CrabyardClient {
  constructor(private baseUrl = "https://crabyard.openclaw.ai") {}

  async login(token: string) {
    const res = await fetch(`${this.baseUrl}/api/login/token`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token }),
      credentials: "include",
    });
    return res.json();
  }

  async getState() {
    const res = await fetch(`${this.baseUrl}/api/state`, {
      credentials: "include",
    });
    return res.json();
  }

  async createCard(card: {
    title: string;
    prompt: string;
    repo: string;
    source?: string;
    runtime?: string;
    policy?: string;
  }) {
    const res = await fetch(`${this.baseUrl}/api/cards`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(card),
      credentials: "include",
    });
    return res.json();
  }

  async cardAction(id: string, action: string) {
    const res = await fetch(`${this.baseUrl}/api/cards/${id}/actions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action }),
      credentials: "include",
    });
    return res.json();
  }

  async addAllow(value: string, role: string) {
    const res = await fetch(`${this.baseUrl}/api/admin/allow`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ value, role }),
      credentials: "include",
    });
    return res.json();
  }
}
```

## Next Steps

- [Quickstart](/quickstart/) – Bootstrap admin and create first card
- [Cards](/cards/) – Card lifecycle and policies
- [Runs](/runs/) – Runtime execution and logs
- [Admin](/admin/) – Access control and policies
- [Architecture](/architecture/) – System design and data model
