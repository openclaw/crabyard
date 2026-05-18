import {
  Kysely,
  SqliteAdapter,
  SqliteIntrospector,
  SqliteQueryCompiler,
  sql,
  type CompiledQuery,
  type DatabaseConnection,
  type DatabaseIntrospector,
  type Dialect,
  type Driver,
  type Generated,
  type QueryResult,
} from "kysely";
import { getSandbox, type Sandbox as CloudflareSandbox } from "@cloudflare/sandbox";
import {
  TerminalMessageType,
  decodeTerminalFrame,
  decodeResizePayload,
  decodeSubscribePayload,
  encodeJsonPayload,
  encodeTerminalFrame,
} from "./terminal-protocol";
import {
  APP_HTML,
  GHOSTTY_BROWSER_EXTERNAL_JS,
  GHOSTTY_WEB_JS,
  LOGO_PNG_BASE64,
  SPEC_HTML,
  SPEC_MARKDOWN,
} from "./generated";

type Role = "viewer" | "maintainer" | "owner";

const defaultInteractiveCommand = "codex --dangerously-bypass-approvals-and-sandbox";

type RuntimeEnv = Env & {
  DB: D1Database;
  SANDBOX?: DurableObjectNamespace<CloudflareSandbox>;
  CRABYARD_BOOTSTRAP_TOKEN?: string;
  GITHUB_CLIENT_ID?: string;
  GITHUB_CLIENT_SECRET?: string;
  GITHUB_TOKEN?: string;
  GITHUB_ORG?: string;
  CRABYARD_INTERACTIVE_PROVISION_URL?: string;
  CRABYARD_INTERACTIVE_PROVISION_TOKEN?: string;
  CRABYARD_RUNTIME_PROVISION_URL?: string;
  CRABYARD_RUNTIME_PROVISION_TOKEN?: string;
  CRABYARD_CLOUDFLARE_RUNNER_URL?: string;
  CRABYARD_CLOUDFLARE_RUNNER_TOKEN?: string;
  CRABYARD_CLOUDFLARE_RUNNER_INSTANCE_TYPE?: string;
  CRABYARD_CLOUDFLARE_RUNNER_WORKDIR?: string;
  CRABYARD_CLOUDFLARE_RUNNER_TTL_SECONDS?: string;
  CRABYARD_CLOUDFLARE_RUNNER_IDLE_SECONDS?: string;
  CRABYARD_PTY_BRIDGE_URL?: string;
  CRABYARD_PTY_BRIDGE_TOKEN?: string;
  CRABYARD_CLAWFLEET_URL?: string;
  CRABYARD_CLAWFLEET_TOKEN?: string;
  CRABYARD_CLAWFLEET_PUBLIC_URL?: string;
  OPENAI_API_KEY?: string;
  OPENAI_BASE_URL?: string;
  OPENAI_ORG_ID?: string;
};

export { Sandbox } from "@cloudflare/sandbox";

type User = {
  subject: string;
  login: string | null;
  email: string | null;
  name: string | null;
  role: Role;
  allowed: boolean;
  teams: string[];
};

type GitHubProfile = {
  id: number;
  login: string;
  email: string | null;
  name: string | null;
};

type GitHubIssuePayload = {
  number: number;
  title: string;
  state: string;
  html_url: string;
  body: string | null;
  user: { login: string } | null;
  updated_at: string;
  pull_request?: unknown;
};

type GitHubGraphqlRefPayload = {
  __typename: "Issue" | "PullRequest";
  number: number;
  title: string;
  state: string;
  url: string;
  body: string | null;
  author: { login: string } | null;
  updatedAt: string;
};

type GitHubReference = {
  repo: string;
  number: number;
  title: string;
  source: "Issue" | "PR";
  state: string;
  url: string;
  author: string | null;
  updatedAt: string;
  body: string;
};

type GitHubContentPayload = {
  content?: string;
  encoding?: string;
  sha?: string;
};

type WorkflowStatus = "ok" | "missing" | "invalid" | "error";

type WorkflowConfig = {
  runtime?: string;
  policy?: string;
  stallMs?: number;
  cap?: number;
  promptPrefix?: string;
};

type RuntimeCapabilities = {
  terminal: boolean;
  takeover: boolean;
  vnc: boolean;
  desktop: boolean;
  logs: boolean;
  artifacts: boolean;
};

type RuntimeDescriptor = {
  runtime: "container" | "crabbox";
  reason: string;
  capabilities: RuntimeCapabilities;
};

type RepoWorkflow = {
  repo: string;
  status: WorkflowStatus;
  sourcePath: string;
  sourceSha: string | null;
  config: WorkflowConfig;
  prompt: string;
  error: string | null;
  evaluatedAt: number;
  updatedAt: number;
};

type Card = {
  id: string;
  title: string;
  prompt: string;
  repo: string;
  source: string;
  runtime: string;
  policy: string;
  lane: string;
  owner: string;
  startedAt: number | null;
  createdAt: number;
  logs: string[];
  changes: CardChanges;
  run: RunAttempt | null;
};

type DiffFileStatus = "added" | "deleted" | "modified" | "renamed";

type RunStatus =
  | "queued"
  | "leasing"
  | "running"
  | "review"
  | "completed"
  | "failed"
  | "stalled"
  | "canceled";

type RunAttempt = {
  id: string;
  cardId: string;
  attempt: number;
  runtime: string;
  status: RunStatus;
  controlIntent: string | null;
  leaseId: string | null;
  attachUrl: string | null;
  vncUrl: string | null;
  selectionReason: string | null;
  capabilities: RuntimeCapabilities;
  operator: string | null;
  lastHeartbeatAt: number;
  startedAt: number | null;
  endedAt: number | null;
  createdAt: number;
  updatedAt: number;
  error: string | null;
};

type InteractiveSessionStatus =
  | "provisioning"
  | "pending_adapter"
  | "ready"
  | "attached"
  | "detached"
  | "stopped"
  | "expired"
  | "failed";

type InteractiveSession = {
  id: string;
  repo: string;
  branch: string;
  runtime: "crabbox" | "container";
  command: string;
  prompt: string;
  owner: string;
  status: InteractiveSessionStatus;
  leaseId: string | null;
  attachUrl: string | null;
  vncUrl: string | null;
  lastEvent: string;
  createdAt: number;
  updatedAt: number;
  lastSeenAt: number;
  stoppedAt: number | null;
  shareMode: "private" | "link_read";
  shareTokenPreview: string | null;
  controlRequestedBy: string | null;
  controlRequestedAt: number | null;
  controller: string | null;
  controlGrantedAt: number | null;
  controlExpiresAt: number | null;
  canControl?: boolean;
  canManage?: boolean;
  canRequestControl?: boolean;
  sharedReadOnly?: boolean;
  logs: string[];
};

type InteractiveProvisionRequest = {
  id: string;
  repo: string;
  branch: string;
  runtime: "crabbox" | "container";
  command: string;
  prompt: string;
  owner: string;
};

type InteractiveProvisionResult = {
  status: InteractiveSessionStatus;
  leaseId: string | null;
  attachUrl: string | null;
  vncUrl: string | null;
  message: string;
};

type InteractiveTerminalTarget = {
  url: string;
  authorization: string | null;
};

type TerminalHubSubscription = {
  session: InteractiveSession;
  upstream: WebSocket;
  canView: () => Promise<boolean>;
  canInput: () => Promise<boolean>;
  viewCheck: ReturnType<typeof setInterval> | null;
  cols: number;
  rows: number;
};

type PendingTerminalSubscription = {
  unsubscribeRequested: boolean;
};

type TerminalUpstream = {
  socket: WebSocket;
  markConnected: () => Promise<void>;
};

type ClawFleetInstancePayload = {
  name?: string;
  status?: string;
  novnc_port?: number;
  gateway_port?: number;
};

type CloudflareSandboxPayload = {
  id?: string;
  state?: string;
  workdir?: string;
  instanceType?: string;
  labels?: Record<string, string>;
};

type ChangedFile = {
  path: string;
  oldPath?: string;
  status: DiffFileStatus;
  additions: number;
  deletions: number;
};

type CardChanges = {
  files: ChangedFile[];
  patch: string;
  totals: {
    additions: number;
    deletions: number;
    files: number;
  };
};

type SettingsTable = {
  key: string;
  value: string;
};

type AllowEntryTable = {
  value: string;
  role: Role;
  created_at: number;
  updated_at: number;
};

type RepoTable = {
  repo: string;
  enabled: number;
  created_at: number;
  updated_at: number;
};

type UserTable = {
  subject: string;
  login: string | null;
  email: string | null;
  name: string | null;
  role: Role;
  allowed: number;
  teams: string;
  created_at: number;
  updated_at: number;
  last_seen_at: number;
};

type SessionTable = {
  token_hash: string;
  subject: string;
  expires_at: number;
  created_at: number;
};

type CardTable = {
  id: string;
  title: string;
  prompt: string;
  repo: string;
  source: string;
  runtime: string;
  policy: string;
  lane: string;
  owner: string;
  started_at: number | null;
  created_at: number;
  updated_at: number;
  last_event: string | null;
  changed_files: string;
  diff_patch: string;
  active_run_id: string | null;
};

type RunAttemptTable = {
  id: string;
  card_id: string;
  attempt: number;
  runtime: string;
  status: RunStatus;
  control_intent: string | null;
  lease_id: string | null;
  attach_url: string | null;
  vnc_url: string | null;
  selection_reason: string | null;
  capabilities_json: string;
  operator: string | null;
  last_heartbeat_at: number;
  started_at: number | null;
  ended_at: number | null;
  created_at: number;
  updated_at: number;
  error: string | null;
};

type InteractiveSessionTable = {
  id: string;
  repo: string;
  branch: string;
  runtime: "crabbox" | "container";
  command: string;
  prompt: string;
  owner: string;
  status: InteractiveSessionStatus;
  lease_id: string | null;
  attach_url: string | null;
  vnc_url: string | null;
  last_event: string;
  created_at: number;
  updated_at: number;
  last_seen_at: number;
  stopped_at: number | null;
  share_mode: "private" | "link_read";
  share_token_hash: string | null;
  share_token_preview: string | null;
  control_requested_by: string | null;
  control_requested_at: number | null;
  controller: string | null;
  control_granted_at: number | null;
  control_expires_at: number | null;
};

type RepoWorkflowTable = {
  repo: string;
  status: WorkflowStatus;
  source_path: string;
  source_sha: string | null;
  config_json: string;
  prompt: string;
  error: string | null;
  evaluated_at: number;
  updated_at: number;
};

type EventTable = {
  id: Generated<number>;
  card_id: string;
  actor: string;
  message: string;
  created_at: number;
};

type InteractiveSessionEventTable = {
  id: Generated<number>;
  session_id: string;
  actor: string;
  message: string;
  created_at: number;
};

type AuditEventTable = {
  id: Generated<number>;
  actor: string;
  message: string;
  created_at: number;
};

type Database = {
  settings: SettingsTable;
  allow_entries: AllowEntryTable;
  repos: RepoTable;
  users: UserTable;
  sessions: SessionTable;
  cards: CardTable;
  run_attempts: RunAttemptTable;
  interactive_sessions: InteractiveSessionTable;
  interactive_session_events: InteractiveSessionEventTable;
  repo_workflows: RepoWorkflowTable;
  events: EventTable;
  audit_events: AuditEventTable;
};

type CompilableQuery = {
  compile(): CompiledQuery;
};

const encoder = new TextEncoder();
const sessionCookie = "crabyard_session";
const oauthStateCookie = "crabyard_oauth_state";
const bootstrapSessionSeconds = 60 * 60;
const githubSessionSeconds = 60 * 15;
const terminalClipboardMaxBytes = 10 * 1024 * 1024;
const lanes = ["Todo", "Running", "Human Review", "Done"];
const preferredRepo = "openclaw/openclaw";
const sandboxLeasePrefix = "sandbox:";
const activeRunStatuses: readonly RunStatus[] = ["queued", "leasing", "running"];
const interactiveSessionStatuses: readonly InteractiveSessionStatus[] = [
  "provisioning",
  "pending_adapter",
  "ready",
  "attached",
  "detached",
  "stopped",
  "expired",
  "failed",
];
const runtimeOptions = ["auto", "container", "crabbox"] as const;
const mergePolicyOptions = ["open_pr", "merge_when_green", "fix_until_green_and_merge"] as const;
const defaultStallMs = 5 * 60 * 1000;
const workflowCacheMs = 60 * 60 * 1000;
const containerCapabilities: RuntimeCapabilities = {
  terminal: true,
  takeover: false,
  vnc: false,
  desktop: false,
  logs: true,
  artifacts: true,
};
const crabboxCapabilities: RuntimeCapabilities = {
  terminal: true,
  takeover: true,
  vnc: true,
  desktop: true,
  logs: true,
  artifacts: true,
};

class D1Dialect implements Dialect {
  constructor(private readonly d1: D1Database) {}

  createDriver(): Driver {
    return new D1Driver(this.d1);
  }

  createQueryCompiler(): SqliteQueryCompiler {
    return new SqliteQueryCompiler();
  }

  createAdapter(): SqliteAdapter {
    return new SqliteAdapter();
  }

  createIntrospector(db: Kysely<unknown>): DatabaseIntrospector {
    return new SqliteIntrospector(db);
  }
}

class D1Driver implements Driver {
  private readonly connection: D1Connection;

  constructor(d1: D1Database) {
    this.connection = new D1Connection(d1);
  }

  async init(): Promise<void> {}

  async acquireConnection(): Promise<DatabaseConnection> {
    return this.connection;
  }

  async beginTransaction(): Promise<void> {
    throw new Error("D1 batch transactions are not exposed through this Kysely dialect");
  }

  async commitTransaction(): Promise<void> {}

  async rollbackTransaction(): Promise<void> {}

  async releaseConnection(): Promise<void> {}

  async destroy(): Promise<void> {}
}

class D1Connection implements DatabaseConnection {
  constructor(private readonly d1: D1Database) {}

  async executeQuery<R>(compiledQuery: CompiledQuery): Promise<QueryResult<R>> {
    const statement = this.d1.prepare(compiledQuery.sql).bind(...compiledQuery.parameters);
    if (isReadQuery(compiledQuery.sql)) {
      const result = await statement.all<R>();
      return { rows: result.results ?? [] };
    }

    const result = await statement.run();
    const changes = result.meta.changes;
    const lastRowId = result.meta.last_row_id;
    const queryResult: QueryResult<R> = { rows: [] };
    if (typeof changes === "number") {
      Object.assign(queryResult, { numAffectedRows: BigInt(changes) });
    }
    if (typeof lastRowId === "number") {
      Object.assign(queryResult, { insertId: BigInt(lastRowId) });
    }
    return queryResult;
  }

  async *streamQuery<R>(compiledQuery: CompiledQuery): AsyncIterableIterator<QueryResult<R>> {
    yield await this.executeQuery<R>(compiledQuery);
  }
}

function database(env: RuntimeEnv): Kysely<Database> {
  return new Kysely<Database>({ dialect: new D1Dialect(env.DB) });
}

async function executeBatch(env: RuntimeEnv, queries: readonly CompilableQuery[]): Promise<void> {
  await env.DB.batch(
    queries.map((query) => {
      const compiled = query.compile();
      return env.DB.prepare(compiled.sql).bind(...compiled.parameters);
    }),
  );
}

function isReadQuery(sqlText: string): boolean {
  return /^(?:select|with|pragma)\b/i.test(sqlText.trim());
}

export default {
  async fetch(request: Request, env: RuntimeEnv): Promise<Response> {
    const url = new URL(request.url);

    try {
      if (url.pathname === "/healthz") {
        return text("ok\n", "text/plain; charset=utf-8");
      }

      if (url.pathname === "/crabyard-logo.png") {
        return new Response(base64Bytes(LOGO_PNG_BASE64), {
          headers: {
            ...securityHeaders("image/png"),
            "cache-control": "public, max-age=86400",
          },
        });
      }

      if (url.pathname === "/vendor/ghostty-web.js") {
        return text(GHOSTTY_WEB_JS, "text/javascript; charset=utf-8");
      }

      if (url.pathname === "/vendor/__vite-browser-external-2447137e.js") {
        return text(GHOSTTY_BROWSER_EXTERNAL_JS, "text/javascript; charset=utf-8");
      }

      if (url.pathname === "/docs/spec.md") {
        return text(SPEC_MARKDOWN, "text/markdown; charset=utf-8");
      }

      if (
        url.pathname === "/docs" ||
        url.pathname === "/docs/" ||
        url.pathname === "/docs/spec" ||
        url.pathname === "/docs/spec/"
      ) {
        if (wantsMarkdown(request)) {
          return text(SPEC_MARKDOWN, "text/markdown; charset=utf-8", { vary: "Accept" });
        }

        return text(SPEC_HTML, "text/html; charset=utf-8", { vary: "Accept" });
      }

      if (url.pathname === "/login/github") {
        return await githubLogin(request, env);
      }

      if (url.pathname === "/auth/github/callback") {
        return await githubCallback(request, env);
      }

      if (url.pathname.startsWith("/api/")) {
        return await api(request, env);
      }

      if (
        url.pathname === "/" ||
        url.pathname === "/app" ||
        url.pathname === "/app/" ||
        url.pathname.startsWith("/app/sessions/")
      ) {
        return text(APP_HTML, "text/html; charset=utf-8", { vary: "Accept" });
      }

      return new Response("Not found\n", {
        status: 404,
        headers: securityHeaders("text/plain; charset=utf-8"),
      });
    } catch (error) {
      const hasStatus = typeof error === "object" && error && "status" in error;
      const status = hasStatus ? Number(error.status) : 500;
      const message = hasStatus && error instanceof Error ? error.message : "internal error";
      return json({ error: message }, { status: Number.isFinite(status) ? status : 500 });
    }
  },
} satisfies ExportedHandler<RuntimeEnv>;

async function api(request: Request, env: RuntimeEnv): Promise<Response> {
  const url = new URL(request.url);

  if (request.method === "POST" && url.pathname === "/api/login/token") {
    return tokenLogin(request, env);
  }

  if (request.method === "POST" && url.pathname === "/api/logout") {
    return logout(request, env);
  }

  if (request.method === "GET" && url.pathname === "/api/auth") {
    return json({ auth: authMethods(env) });
  }

  if (request.method === "POST" && url.pathname === "/api/provision/interactive") {
    return json(await provisionInteractiveEndpoint(request, env));
  }

  const sharedSessionMatch = url.pathname.match(/^\/api\/shared-sessions\/([^/]+)$/);
  if (request.method === "GET" && sharedSessionMatch) {
    return json(
      await readSharedInteractiveSession(
        env,
        decodeURIComponent(sharedSessionMatch[1] ?? ""),
        url.searchParams.get("token") ?? "",
      ),
    );
  }

  if (request.method === "GET" && url.pathname === "/api/terminal/ws") {
    return interactiveTerminalHub(request, env, await optionalUser(request, env));
  }

  const user = await requireUser(request, env);

  if (request.method === "GET" && url.pathname === "/api/session") {
    return json({ user, auth: authMethods(env) });
  }

  if (request.method === "GET" && url.pathname === "/api/state") {
    return json(await readState(env, user));
  }

  if (request.method === "GET" && url.pathname === "/api/github/refs") {
    requireRole(user, "maintainer");
    return json(await searchGitHubRefs(request, env));
  }

  if (request.method === "POST" && url.pathname === "/api/interactive-sessions") {
    requireRole(user, "maintainer");
    return json(await createInteractiveSession(request, env, user), { status: 201 });
  }

  const interactiveSessionReadMatch = url.pathname.match(/^\/api\/interactive-sessions\/([^/]+)$/);
  if (request.method === "GET" && interactiveSessionReadMatch) {
    requireRole(user, "viewer");
    const session = await readInteractiveSession(
      env,
      decodeURIComponent(interactiveSessionReadMatch[1] ?? ""),
    );
    if (!session) throw notFound("interactive session not found");
    return json({ session: decorateInteractiveSession(session, user, env) });
  }

  const interactiveSessionMatch = url.pathname.match(
    /^\/api\/interactive-sessions\/([^/]+)\/actions$/,
  );
  if (request.method === "POST" && interactiveSessionMatch) {
    const body = await readJson<{ action?: string }>(request);
    const action = body.action ?? "";
    requireRole(user, "viewer");
    return json(
      await mutateInteractiveSession(
        request,
        env,
        user,
        decodeURIComponent(interactiveSessionMatch[1] ?? ""),
        action,
      ),
    );
  }

  const interactivePtyMatch = url.pathname.match(/^\/api\/interactive-sessions\/([^/]+)\/pty$/);
  if (request.method === "GET" && interactivePtyMatch) {
    requireRole(user, "viewer");
    return interactiveSessionPty(
      request,
      env,
      user,
      decodeURIComponent(interactivePtyMatch[1] ?? ""),
    );
  }

  const interactiveClipboardMatch = url.pathname.match(
    /^\/api\/interactive-sessions\/([^/]+)\/clipboard$/,
  );
  if (request.method === "POST" && interactiveClipboardMatch) {
    requireRole(user, "viewer");
    return json(
      await uploadInteractiveSessionClipboard(
        request,
        env,
        user,
        decodeURIComponent(interactiveClipboardMatch[1] ?? ""),
      ),
      { status: 201 },
    );
  }

  if (request.method === "POST" && url.pathname === "/api/cards") {
    requireRole(user, "maintainer");
    return json(await createCard(request, env, user), { status: 201 });
  }

  const runsMatch = url.pathname.match(/^\/api\/cards\/([^/]+)\/runs$/);
  if (request.method === "GET" && runsMatch) {
    const cardId = decodeURIComponent(runsMatch[1] ?? "");
    const card = await readCard(env, cardId);
    if (!card) throw notFound("card not found");
    return json({ runs: await readRunsForCard(env, cardId) });
  }

  if (request.method === "PUT" && url.pathname === "/api/admin/policy") {
    requireRole(user, "owner");
    return json(await updatePolicy(request, env, user));
  }

  if (request.method === "POST" && url.pathname === "/api/admin/workflows/evaluate") {
    requireRole(user, "owner");
    return json(await evaluateWorkflow(request, env, user));
  }

  const actionMatch = url.pathname.match(/^\/api\/cards\/([^/]+)\/actions$/);
  if (request.method === "POST" && actionMatch) {
    const body = await readJson<{ action?: string }>(request);
    const action = body.action ?? "";
    requireRole(user, action === "attach" || action === "watch" ? "viewer" : "maintainer");
    return json(await mutateCard(env, user, decodeURIComponent(actionMatch[1] ?? ""), action));
  }

  if (request.method === "POST" && url.pathname === "/api/admin/allow") {
    requireRole(user, "owner");
    return json(await addAllowEntry(request, env, user), { status: 201 });
  }

  const allowMatch = url.pathname.match(/^\/api\/admin\/allow\/(.+)$/);
  if (request.method === "DELETE" && allowMatch) {
    requireRole(user, "owner");
    return json(await removeAllowEntry(env, user, decodeURIComponent(allowMatch[1] ?? "")));
  }

  if (request.method === "POST" && url.pathname === "/api/admin/repos") {
    requireRole(user, "owner");
    return json(await addRepo(request, env, user), { status: 201 });
  }

  const repoMatch = url.pathname.match(/^\/api\/admin\/repos\/(.+)$/);
  if (request.method === "DELETE" && repoMatch) {
    requireRole(user, "owner");
    return json(await removeRepo(env, user, decodeURIComponent(repoMatch[1] ?? "")));
  }

  return json({ error: "not found" }, { status: 404 });
}

async function tokenLogin(request: Request, env: RuntimeEnv): Promise<Response> {
  const { token } = await readJson<{ token?: string }>(request);
  if (!env.CRABYARD_BOOTSTRAP_TOKEN || token !== env.CRABYARD_BOOTSTRAP_TOKEN) {
    return json({ error: "invalid token" }, { status: 401 });
  }

  const now = Date.now();
  const subject = await bootstrapSubject(env);
  const user: User = {
    subject,
    login: "bootstrap",
    email: null,
    name: "Bootstrap Admin",
    role: "owner",
    allowed: true,
    teams: [],
  };
  await upsertUser(env, user, now);
  const cookieHeader = await createSession(env, user.subject, now);
  return json({ user, auth: authMethods(env) }, { headers: { "set-cookie": cookieHeader } });
}

async function githubLogin(request: Request, env: RuntimeEnv): Promise<Response> {
  if (!env.GITHUB_CLIENT_ID || !env.GITHUB_CLIENT_SECRET) {
    return text("GitHub OAuth is not configured.\n", "text/plain; charset=utf-8", {}, 503);
  }

  const url = new URL(request.url);
  const redirectUri = `${url.origin}/auth/github/callback`;
  const state = crypto.randomUUID();
  const target = new URL("https://github.com/login/oauth/authorize");
  target.searchParams.set("client_id", env.GITHUB_CLIENT_ID);
  target.searchParams.set("redirect_uri", redirectUri);
  target.searchParams.set("scope", "read:user read:org");
  target.searchParams.set("state", state);

  return redirect(target.toString(), {
    "set-cookie": cookie(oauthStateCookie, state, 600),
  });
}

async function githubCallback(request: Request, env: RuntimeEnv): Promise<Response> {
  if (!env.GITHUB_CLIENT_ID || !env.GITHUB_CLIENT_SECRET) {
    return text("GitHub OAuth is not configured.\n", "text/plain; charset=utf-8", {}, 503);
  }

  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state || state !== cookies(request).get(oauthStateCookie)) {
    return text("Invalid OAuth state.\n", "text/plain; charset=utf-8", {}, 400);
  }

  const redirectUri = `${url.origin}/auth/github/callback`;
  const tokenResponse = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      "user-agent": "crabyard-ai",
    },
    body: JSON.stringify({
      client_id: env.GITHUB_CLIENT_ID,
      client_secret: env.GITHUB_CLIENT_SECRET,
      code,
      redirect_uri: redirectUri,
      state,
    }),
  });
  const tokenBody = await tokenResponse.json<{ access_token?: string; error?: string }>();
  if (!tokenBody.access_token) {
    return text(
      tokenBody.error ?? "OAuth token exchange failed.\n",
      "text/plain; charset=utf-8",
      {},
      401,
    );
  }

  const freshUser = await refreshGitHubUser(env, tokenBody.access_token).catch(() => {
    throw serviceUnavailable("GitHub membership refresh failed; retry later");
  });
  if (!freshUser) {
    return text(
      "GitHub user is not an active OpenClaw org member.\n",
      "text/plain; charset=utf-8",
      {},
      403,
    );
  }
  const authorized = await authorize(env, freshUser);
  if (!authorized.allowed) {
    return text(
      "GitHub user is not in the Crabyard allowlist.\n",
      "text/plain; charset=utf-8",
      {},
      403,
    );
  }

  const now = Date.now();
  await upsertUser(env, authorized, now);
  const session = await createSession(env, authorized.subject, now, githubSessionSeconds);
  return redirect("/app", { "set-cookie": session });
}

async function logout(request: Request, env: RuntimeEnv): Promise<Response> {
  const token = cookies(request).get(sessionCookie);
  if (token) {
    await database(env)
      .deleteFrom("sessions")
      .where("token_hash", "=", await sha256(token))
      .execute();
  }
  return json({ ok: true }, { headers: { "set-cookie": cookie(sessionCookie, "", 0) } });
}

async function requireUser(request: Request, env: RuntimeEnv): Promise<User> {
  const token = cookies(request).get(sessionCookie);
  if (!token) throw unauthorized();
  const tokenHash = await sha256(token);
  const db = database(env);
  const row = await db
    .selectFrom("sessions as s")
    .innerJoin("users as u", "u.subject", "s.subject")
    .select(["u.subject", "u.login", "u.email", "u.name", "u.role", "u.allowed", "u.teams"])
    .where("s.token_hash", "=", tokenHash)
    .where("s.expires_at", ">", Date.now())
    .executeTakeFirst();
  if (!row) throw unauthorized();

  const user = {
    subject: row.subject,
    login: row.login,
    email: row.email,
    name: row.name,
    role: row.role,
    allowed: row.allowed === 1,
    teams: parseJson(row.teams, []),
  };

  if (user.subject.startsWith("bootstrap:")) {
    if (!env.CRABYARD_BOOTSTRAP_TOKEN || user.subject !== (await bootstrapSubject(env))) {
      await db.deleteFrom("sessions").where("token_hash", "=", tokenHash).execute();
      throw unauthorized();
    }
    return user;
  }

  if (!user.subject.startsWith("github:")) return user;

  const authorized = await authorize(env, user);
  if (!authorized.allowed) {
    await db.deleteFrom("sessions").where("token_hash", "=", tokenHash).execute();
    throw forbidden("user is no longer allowlisted");
  }
  if (authorized.role !== user.role || authorized.allowed !== user.allowed) {
    await upsertUser(env, authorized, Date.now());
  }
  return authorized;
}

async function optionalUser(request: Request, env: RuntimeEnv): Promise<User | null> {
  try {
    return await requireUser(request, env);
  } catch (error) {
    const status =
      typeof error === "object" && error && "status" in error ? Number(error.status) : 0;
    const url = new URL(request.url);
    if (
      status === 401 ||
      (status === 403 && url.pathname === "/api/terminal/ws" && url.searchParams.has("token"))
    ) {
      return null;
    }
    throw error;
  }
}

async function readState(env: RuntimeEnv, user: User): Promise<Record<string, unknown>> {
  await reconcileStalledRuns(env, Date.now());
  const db = database(env);
  const [settings, allow, repos, cards, interactiveSessions, workflows] = await Promise.all([
    readSettings(env),
    user.role === "owner"
      ? db.selectFrom("allow_entries").select(["value", "role"]).orderBy("value").execute()
      : Promise.resolve([]),
    db.selectFrom("repos").select("repo").where("enabled", "=", 1).orderBy("repo").execute(),
    readCards(env),
    readInteractiveSessions(env, user),
    user.role === "owner" ? readWorkflowSummaries(env) : Promise.resolve([]),
  ]);
  const repoNames = sortRepos(repos.map((row) => row.repo));

  return {
    user,
    auth: authMethods(env),
    org: settings.org ?? "OpenClaw",
    cap: numberSetting(settings.cap, 20),
    retention: settings.retention ?? "30",
    merge: settings.merge ?? "guarded",
    allow,
    repos: repoNames,
    workflows,
    cards,
    interactiveSessions,
  };
}

async function createInteractiveSession(
  request: Request,
  env: RuntimeEnv,
  user: User,
): Promise<{ session: InteractiveSession }> {
  const body = await readJson<{
    repo?: string;
    branch?: string;
    runtime?: string;
    command?: string;
    prompt?: string;
  }>(request);
  const repo = normalizeRepo(body.repo);
  if (!repo) throw badRequest("repo is required");
  await requireRepo(env, repo);
  const branch = clean(body.branch, 120) || "main";
  const runtime = oneOf(body.runtime, ["crabbox", "container"], "crabbox") as
    | "crabbox"
    | "container";
  const command = clean(body.command, 240) || defaultInteractiveCommand;
  const prompt = clean(body.prompt, 4000);
  const owner = actor(user);
  const now = Date.now();
  const db = database(env);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const id = await nextInteractiveSessionId(env);
    try {
      await db
        .insertInto("interactive_sessions")
        .values({
          id,
          repo,
          branch,
          runtime,
          command,
          prompt,
          owner,
          status: "provisioning",
          lease_id: null,
          attach_url: null,
          vnc_url: null,
          last_event: "interactive workspace requested",
          created_at: now,
          updated_at: now,
          last_seen_at: now,
          stopped_at: null,
          share_mode: "private",
          share_token_hash: null,
          share_token_preview: null,
          control_requested_by: null,
          control_requested_at: null,
          controller: null,
          control_granted_at: null,
          control_expires_at: null,
        })
        .execute();
      await appendInteractiveSessionEvent(env, id, user, "interactive workspace requested", now);
      const provisioned = await provisionInteractiveSession(env, {
        id,
        repo,
        branch,
        runtime,
        command,
        prompt,
        owner,
      });
      if (provisioned) {
        await db
          .updateTable("interactive_sessions")
          .set({
            status: provisioned.status,
            lease_id: provisioned.leaseId,
            attach_url: provisioned.attachUrl,
            vnc_url: provisioned.vncUrl,
            last_event: provisioned.message,
            updated_at: now + 1,
          })
          .where("id", "=", id)
          .execute();
        await appendInteractiveSessionEvent(env, id, user, provisioned.message, now + 1);
      } else {
        await db
          .updateTable("interactive_sessions")
          .set({
            status: "pending_adapter",
            last_event: "waiting for interactive runtime adapter",
            updated_at: now + 1,
          })
          .where("id", "=", id)
          .execute();
        await appendInteractiveSessionEvent(
          env,
          id,
          user,
          "waiting for interactive runtime adapter",
          now + 1,
        );
      }
      await audit(
        env,
        user,
        `interactive session created ${id} repo=${repo} runtime=${runtime}`,
        now,
      );
      return {
        session: decorateInteractiveSession(
          (await readInteractiveSession(env, id)) as InteractiveSession,
          user,
          env,
        ),
      };
    } catch (error) {
      if (!isConstraintError(error) || attempt === 2) throw error;
    }
  }
  throw new Error("failed to allocate interactive session id");
}

async function mutateInteractiveSession(
  request: Request,
  env: RuntimeEnv,
  user: User,
  id: string,
  action: string,
): Promise<{ session: InteractiveSession; shareUrl?: string }> {
  const session = await readInteractiveSession(env, id);
  if (!session) throw notFound("interactive session not found");
  const now = Date.now();
  const userActor = actor(user);
  const canManage = canManageInteractiveSession(user, session);
  if (action === "attach") {
    if (!canControlInteractiveSession(user, session, now, canGrantDelegatedControl(env, session))) {
      throw forbidden("terminal control has not been granted");
    }
    if (["expired", "failed", "stopped"].includes(session.status)) {
      throw badRequest(`session is ${session.status}`);
    }
    const nextStatus =
      session.status === "ready" || session.status === "detached" ? "attached" : session.status;
    const message =
      session.status === "pending_adapter"
        ? "attach requested; runtime adapter pending"
        : session.status === "provisioning"
          ? "attach requested; workspace provisioning"
          : "interactive terminal attached";
    await database(env)
      .updateTable("interactive_sessions")
      .set({
        status: nextStatus,
        last_seen_at: now,
        updated_at: now,
        last_event: message,
      })
      .where("id", "=", id)
      .where("status", "!=", "stopped")
      .execute();
    await appendInteractiveSessionEvent(env, id, user, message, now);
    return {
      session: decorateInteractiveSession(
        (await readInteractiveSession(env, id)) as InteractiveSession,
        user,
        env,
      ),
    };
  }

  if (action === "share_link") {
    if (!canManage) throw forbidden("only the session owner or maintainer can share");
    const token = shareToken();
    const tokenHash = await sha256(token);
    const preview = token.slice(0, 8);
    await database(env)
      .updateTable("interactive_sessions")
      .set({
        share_mode: "link_read",
        share_token_hash: tokenHash,
        share_token_preview: preview,
        updated_at: now,
        last_event: "read-only share link enabled",
      })
      .where("id", "=", id)
      .execute();
    await appendInteractiveSessionEvent(env, id, user, "read-only share link enabled", now);
    await audit(env, user, `interactive session share enabled ${id}`, now);
    return {
      session: decorateInteractiveSession(
        (await readInteractiveSession(env, id)) as InteractiveSession,
        user,
        env,
      ),
      shareUrl: shareUrl(request, id, token),
    };
  }

  if (action === "disable_share") {
    if (!canManage) throw forbidden("only the session owner or maintainer can disable sharing");
    await database(env)
      .updateTable("interactive_sessions")
      .set({
        share_mode: "private",
        share_token_hash: null,
        share_token_preview: null,
        control_requested_by: null,
        control_requested_at: null,
        controller: null,
        control_granted_at: null,
        control_expires_at: null,
        updated_at: now,
        last_event: "session sharing disabled",
      })
      .where("id", "=", id)
      .execute();
    await appendInteractiveSessionEvent(env, id, user, "session sharing disabled", now);
    await audit(env, user, `interactive session share disabled ${id}`, now);
    return {
      session: decorateInteractiveSession(
        (await readInteractiveSession(env, id)) as InteractiveSession,
        user,
        env,
      ),
    };
  }

  if (action === "request_control") {
    if (!canGrantDelegatedControl(env, session)) {
      throw badRequest("delegated terminal control requires a revocable PTY bridge");
    }
    if (canControlInteractiveSession(user, session, now, canGrantDelegatedControl(env, session))) {
      return { session: decorateInteractiveSession(session, user, env) };
    }
    if (["expired", "failed", "stopped"].includes(session.status)) {
      throw badRequest(`session is ${session.status}`);
    }
    await database(env)
      .updateTable("interactive_sessions")
      .set({
        control_requested_by: userActor,
        control_requested_at: now,
        updated_at: now,
        last_event: `${userActor} requested terminal control`,
      })
      .where("id", "=", id)
      .execute();
    await appendInteractiveSessionEvent(
      env,
      id,
      user,
      `${userActor} requested terminal control`,
      now,
    );
    return {
      session: decorateInteractiveSession(
        (await readInteractiveSession(env, id)) as InteractiveSession,
        user,
        env,
      ),
    };
  }

  if (action === "approve_control") {
    if (!canManage) throw forbidden("only the session owner or maintainer can approve control");
    if (!session.controlRequestedBy) throw badRequest("no pending control request");
    if (!canGrantDelegatedControl(env, session)) {
      throw badRequest("delegated terminal control requires a revocable PTY bridge");
    }
    const expires = now + 30 * 60 * 1000;
    await database(env)
      .updateTable("interactive_sessions")
      .set({
        controller: session.controlRequestedBy,
        control_granted_at: now,
        control_expires_at: expires,
        control_requested_by: null,
        control_requested_at: null,
        updated_at: now,
        last_event: `control granted to ${session.controlRequestedBy}`,
      })
      .where("id", "=", id)
      .execute();
    await appendInteractiveSessionEvent(
      env,
      id,
      user,
      `control granted to ${session.controlRequestedBy}`,
      now,
    );
    await audit(
      env,
      user,
      `interactive session control granted ${id} to ${session.controlRequestedBy}`,
      now,
    );
    return {
      session: decorateInteractiveSession(
        (await readInteractiveSession(env, id)) as InteractiveSession,
        user,
        env,
      ),
    };
  }

  if (action === "deny_control") {
    if (!canManage) throw forbidden("only the session owner or maintainer can deny control");
    const requester = session.controlRequestedBy;
    await database(env)
      .updateTable("interactive_sessions")
      .set({
        control_requested_by: null,
        control_requested_at: null,
        updated_at: now,
        last_event: requester
          ? `control request denied for ${requester}`
          : "control request denied",
      })
      .where("id", "=", id)
      .execute();
    await appendInteractiveSessionEvent(
      env,
      id,
      user,
      requester ? `control request denied for ${requester}` : "control request denied",
      now,
    );
    return {
      session: decorateInteractiveSession(
        (await readInteractiveSession(env, id)) as InteractiveSession,
        user,
        env,
      ),
    };
  }

  if (action === "revoke_control") {
    if (!canManage) throw forbidden("only the session owner or maintainer can revoke control");
    await database(env)
      .updateTable("interactive_sessions")
      .set({
        controller: null,
        control_granted_at: null,
        control_expires_at: null,
        updated_at: now,
        last_event: "terminal control revoked",
      })
      .where("id", "=", id)
      .execute();
    await appendInteractiveSessionEvent(env, id, user, "terminal control revoked", now);
    await audit(env, user, `interactive session control revoked ${id}`, now);
    return {
      session: decorateInteractiveSession(
        (await readInteractiveSession(env, id)) as InteractiveSession,
        user,
        env,
      ),
    };
  }

  if (action === "stop") {
    if (!canManage) throw forbidden("only the session owner or maintainer can stop");
    await database(env)
      .updateTable("interactive_sessions")
      .set({
        status: "stopped",
        stopped_at: now,
        controller: null,
        control_requested_by: null,
        control_requested_at: null,
        updated_at: now,
        last_event: "interactive workspace stopped",
      })
      .where("id", "=", id)
      .where("status", "!=", "stopped")
      .execute();
    await appendInteractiveSessionEvent(env, id, user, "interactive workspace stopped", now);
    await audit(env, user, `interactive session stopped ${id}`, now);
    return {
      session: decorateInteractiveSession(
        (await readInteractiveSession(env, id)) as InteractiveSession,
        user,
        env,
      ),
    };
  }

  throw badRequest("unknown action");
}

async function interactiveTerminalHub(
  request: Request,
  env: RuntimeEnv,
  user: User | null,
): Promise<Response> {
  if (request.headers.get("upgrade")?.toLowerCase() !== "websocket") {
    throw badRequest("websocket upgrade required");
  }
  if (!user && !(await canOpenAnonymousTerminalHub(request, env))) {
    throw unauthorized();
  }

  const pair = new WebSocketPair();
  const client = pair[0];
  const server = pair[1];
  const subscriptions = new Map<string, TerminalHubSubscription>();
  const pendingSubscriptions = new Map<string, PendingTerminalSubscription>();
  let queue = Promise.resolve();
  let hubClosed = false;

  server.accept();
  sendTerminalJson(server, TerminalMessageType.Welcome, "", {
    ok: true,
    version: 1,
    multiplex: true,
  });

  const closeSubscription = (id: string, code = 1000, reason = "unsubscribed") => {
    const subscription = subscriptions.get(id);
    if (!subscription) return;
    subscriptions.delete(id);
    if (subscription.viewCheck !== null) clearInterval(subscription.viewCheck);
    if (subscription.upstream.readyState < WebSocket.CLOSING) {
      subscription.upstream.close(code, reason);
    }
  };

  const closeAll = (code = 1000, reason = "client closed") => {
    for (const id of subscriptions.keys()) closeSubscription(id, code, reason);
  };

  server.addEventListener("message", (event) => {
    queue = queue
      .catch(() => undefined)
      .then(async () => {
        const data = await webSocketMessageData(event.data);
        const bytes =
          typeof data === "string" ? encoder.encode(data) : new Uint8Array(data.slice(0));
        const frame = decodeTerminalFrame(bytes);
        if (!frame) {
          sendTerminalJson(server, TerminalMessageType.Error, "", { error: "invalid frame" });
          return;
        }
        if (frame.type === TerminalMessageType.Hello) {
          sendTerminalJson(server, TerminalMessageType.Welcome, "", {
            ok: true,
            version: 1,
            multiplex: true,
          });
          return;
        }
        if (frame.type === TerminalMessageType.Ping) {
          sendTerminalFrame(server, TerminalMessageType.Pong, frame.sessionId, frame.payload);
          return;
        }
        if (frame.type === TerminalMessageType.Subscribe) {
          if (frame.sessionId) {
            const existingPending = pendingSubscriptions.get(frame.sessionId);
            if (existingPending && !existingPending.unsubscribeRequested) {
              sendTerminalJson(server, TerminalMessageType.Event, frame.sessionId, {
                type: "subscribing",
              });
              return;
            }
          }
          const pending = { unsubscribeRequested: false };
          if (frame.sessionId) pendingSubscriptions.set(frame.sessionId, pending);
          void subscribeTerminalHubSession(
            request,
            env,
            user,
            server,
            subscriptions,
            frame,
            () => !hubClosed && !pending.unsubscribeRequested,
          ).finally(() => {
            if (frame.sessionId && pendingSubscriptions.get(frame.sessionId) === pending) {
              pendingSubscriptions.delete(frame.sessionId);
            }
          });
          return;
        }
        if (frame.type === TerminalMessageType.Unsubscribe) {
          const pending = pendingSubscriptions.get(frame.sessionId);
          if (pending) {
            pending.unsubscribeRequested = true;
            return;
          }
          closeSubscription(frame.sessionId);
          return;
        }

        if (pendingSubscriptions.has(frame.sessionId)) {
          sendTerminalJson(server, TerminalMessageType.Event, frame.sessionId, {
            type: "subscribing",
          });
          return;
        }

        const subscription = subscriptions.get(frame.sessionId);
        if (!subscription) {
          sendTerminalJson(server, TerminalMessageType.Error, frame.sessionId, {
            error: "session is not subscribed",
          });
          return;
        }
        if (frame.type === TerminalMessageType.Input || frame.type === TerminalMessageType.Key) {
          if (!(await subscription.canInput())) {
            sendTerminalJson(server, TerminalMessageType.ControlRevoked, frame.sessionId, {
              error: "terminal control has not been granted",
            });
            return;
          }
          if (subscription.upstream.readyState === WebSocket.OPEN) {
            subscription.upstream.send(frame.payload);
          }
          return;
        }
        if (frame.type === TerminalMessageType.Resize) {
          const size = decodeResizePayload(frame.payload);
          if (!(await subscription.canInput())) {
            sendTerminalJson(server, TerminalMessageType.ControlRevoked, frame.sessionId, {
              error: "terminal control has not been granted",
            });
            return;
          }
          if (size) {
            subscription.cols = size.cols;
            subscription.rows = size.rows;
            if (subscription.upstream.readyState === WebSocket.OPEN) {
              subscription.upstream.send(JSON.stringify({ type: "resize", ...size }));
            }
          }
          sendTerminalJson(server, TerminalMessageType.Event, frame.sessionId, {
            type: "resize",
            cols: size?.cols ?? null,
            rows: size?.rows ?? null,
          });
          return;
        }
        if (frame.type === TerminalMessageType.Stop) {
          closeSubscription(frame.sessionId, 1000, "stopped by client");
        }
      });
  });

  server.addEventListener("close", () => {
    hubClosed = true;
    closeAll();
  });
  server.addEventListener("error", () => {
    hubClosed = true;
    closeAll(1011, "client error");
  });

  return new Response(null, { status: 101, webSocket: client });
}

async function writeTerminalClipboardFile(
  env: RuntimeEnv,
  user: User,
  session: InteractiveSession,
  bytes: Uint8Array,
  rawName: unknown,
  rawMediaType: unknown,
): Promise<{ path: string; name: string; mediaType: string; byteCount: number }> {
  if (!session.leaseId?.startsWith(sandboxLeasePrefix) || !env.SANDBOX) {
    throw serviceUnavailable("clipboard file paste requires a Cloudflare Sandbox session");
  }
  if (!bytes.byteLength || bytes.byteLength > terminalClipboardMaxBytes) {
    throw badRequest(
      `clipboard file exceeds ${Math.floor(terminalClipboardMaxBytes / 1024 / 1024)} MiB`,
    );
  }
  const mediaType = clean(rawMediaType || "application/octet-stream", 120);
  const name = safeClipboardFilename(rawName, mediaType);
  const sandboxId =
    session.leaseId.slice(sandboxLeasePrefix.length) || sandboxIdForSession(session.id);
  const sandbox = getSandbox(env.SANDBOX, sandboxId);
  const directory = `${sandboxWorkdir(session.id)}/.crabyard/clipboard`;
  const path = `${directory}/${Date.now()}-${crypto.randomUUID().slice(0, 8)}-${name}`;
  await sandbox.mkdir(directory, { recursive: true });
  await sandbox.writeFile(path, base64FromBytes(bytes), { encoding: "base64" });
  await appendInteractiveSessionEvent(
    env,
    session.id,
    user,
    `Clipboard file pasted: ${path}`,
    Date.now(),
  );
  return { path, name, mediaType, byteCount: bytes.byteLength };
}

async function subscribeTerminalHubSession(
  request: Request,
  env: RuntimeEnv,
  user: User | null,
  client: WebSocket,
  subscriptions: Map<string, TerminalHubSubscription>,
  frame: { sessionId: string; payload: Uint8Array },
  isHubOpen: () => boolean,
): Promise<void> {
  const id = frame.sessionId;
  if (!id) {
    sendTerminalJson(client, TerminalMessageType.Error, "", { error: "session id required" });
    return;
  }
  const subscription = decodeSubscribePayload(frame.payload);
  if (!subscription) {
    sendTerminalJson(client, TerminalMessageType.Error, id, { error: "invalid subscribe payload" });
    return;
  }
  if (subscriptions.has(id)) {
    sendTerminalJson(client, TerminalMessageType.Event, id, { type: "subscribed" });
    return;
  }

  if (!user && !(await canViewSharedTerminalRequest(request, env, id))) {
    sendTerminalJson(client, TerminalMessageType.Error, id, { error: "unauthorized" });
    return;
  }

  const session = await readInteractiveSession(env, id);
  if (!session) {
    sendTerminalJson(client, TerminalMessageType.Error, id, {
      error: "interactive session not found",
    });
    return;
  }
  if (["expired", "failed", "stopped"].includes(session.status)) {
    sendTerminalJson(client, TerminalMessageType.Error, id, {
      error: `session is ${session.status}`,
    });
    return;
  }
  if (!(await canViewTerminalSession(request, env, user, session))) {
    sendTerminalJson(client, TerminalMessageType.Error, id, { error: "unauthorized" });
    return;
  }

  try {
    const canInput = terminalInputGrant(env, user, session);
    const canInputNow = await canInput();
    const canView = terminalViewGrant(request, env, user, session);
    const cols = canInputNow ? terminalDimension(subscription.cols, 120) : 120;
    const rows = canInputNow ? terminalDimension(subscription.rows, 34) : 34;
    const upstreamConnection = await openInteractiveTerminalUpstream(
      request,
      env,
      user,
      session,
      cols,
      rows,
    );
    const upstream = upstreamConnection.socket;
    if (!isHubOpen() || client.readyState !== WebSocket.OPEN) {
      if (upstream.readyState < WebSocket.CLOSING) upstream.close(1000, "client closed");
      return;
    }
    let viewGranted = true;
    let viewCheck: ReturnType<typeof setInterval> | null = null;
    const revokeView = () => {
      if (!viewGranted) return;
      viewGranted = false;
      subscriptions.delete(id);
      if (viewCheck !== null) clearInterval(viewCheck);
      if (upstream.readyState === WebSocket.OPEN) upstream.close(1008, "share revoked");
      sendTerminalJson(client, TerminalMessageType.Error, id, {
        error: "terminal share revoked",
      });
    };
    viewCheck = setInterval(() => {
      void canView()
        .then((allowed) => {
          if (!allowed) revokeView();
        })
        .catch(() => revokeView());
    }, 5000);
    subscriptions.set(id, { session, upstream, canView, canInput, viewCheck, cols, rows });
    let outputQueue = Promise.resolve();
    sendTerminalJson(client, TerminalMessageType.Event, id, {
      type: "subscribed",
      canInput: canInputNow,
    });
    upstream.addEventListener("message", (event) => {
      const raw = event.data;
      outputQueue = outputQueue
        .catch(() => undefined)
        .then(async () => {
          const data = await webSocketMessageData(raw);
          if (client.readyState !== WebSocket.OPEN) return;
          if (!viewGranted) return;
          if (typeof data === "string") {
            const parsed = parseTerminalControlMessage(data);
            if (parsed) {
              sendTerminalJson(client, TerminalMessageType.Event, id, parsed);
              return;
            }
            sendTerminalFrame(client, TerminalMessageType.Output, id, encoder.encode(data));
            return;
          }
          sendTerminalFrame(client, TerminalMessageType.Output, id, new Uint8Array(data));
        });
    });
    upstream.addEventListener("close", (event) => {
      subscriptions.delete(id);
      if (viewCheck !== null) clearInterval(viewCheck);
      if (client.readyState === WebSocket.OPEN) {
        sendTerminalJson(client, TerminalMessageType.Event, id, {
          type: "closed",
          code: event.code,
          reason: event.reason,
        });
      }
    });
    upstream.addEventListener("error", () => {
      subscriptions.delete(id);
      if (viewCheck !== null) clearInterval(viewCheck);
      sendTerminalJson(client, TerminalMessageType.Error, id, { error: "upstream terminal error" });
    });
    void upstreamConnection.markConnected().catch(() => {
      sendTerminalJson(client, TerminalMessageType.Event, id, {
        type: "warning",
        message: "terminal connection state update failed",
      });
    });
  } catch (error) {
    sendTerminalJson(client, TerminalMessageType.Error, id, {
      error: error instanceof Error ? clean(error.message, 200) : "terminal connection failed",
    });
  }
}

async function openInteractiveTerminalUpstream(
  request: Request,
  env: RuntimeEnv,
  user: User | null,
  session: InteractiveSession,
  cols: number,
  rows: number,
): Promise<TerminalUpstream> {
  const now = Date.now();
  if (session.leaseId?.startsWith(sandboxLeasePrefix) && env.SANDBOX) {
    const sandboxId =
      session.leaseId?.slice(sandboxLeasePrefix.length) || sandboxIdForSession(session.id);
    const sandbox = getSandbox(env.SANDBOX, sandboxId);
    const terminalSession = await sandbox.getSession(sandboxTerminalSessionId(session.id));
    const upstreamResponse = await terminalSession.terminal(request, {
      cols,
      rows,
      shell: sandboxStartupScriptPath(session),
    });
    const upstream = upstreamResponse.webSocket;
    if (!upstream || upstreamResponse.status !== 101) {
      throw serviceUnavailable(`Cloudflare Sandbox terminal HTTP ${upstreamResponse.status}`);
    }
    upstream.accept();
    return {
      socket: upstream,
      markConnected: () =>
        markInteractiveTerminalConnected(
          env,
          user,
          session.id,
          now,
          "Cloudflare Sandbox terminal connected",
        ),
    };
  }

  const target = interactiveTerminalTarget(env, session);
  if (!target) throw serviceUnavailable("PTY bridge is not configured for this session");
  const upstreamResponse = await fetch(
    addQuery(target.url, { cols: String(cols), rows: String(rows) }),
    {
      headers: interactiveTerminalHeaders(session, target.authorization),
    },
  );
  const upstream = upstreamResponse.webSocket;
  if (!upstream || upstreamResponse.status !== 101) {
    throw serviceUnavailable(`PTY bridge HTTP ${upstreamResponse.status}`);
  }
  upstream.accept();
  return {
    socket: upstream,
    markConnected: () =>
      markInteractiveTerminalConnected(env, user, session.id, now, "PTY terminal connected"),
  };
}

async function markInteractiveTerminalConnected(
  env: RuntimeEnv,
  user: User | null,
  id: string,
  now: number,
  message: string,
): Promise<void> {
  await database(env)
    .updateTable("interactive_sessions")
    .set({
      status: "attached",
      last_seen_at: now,
      updated_at: now,
      last_event: message,
    })
    .where("id", "=", id)
    .where("status", "in", ["ready", "attached", "detached"])
    .execute();
  if (user) await appendInteractiveSessionEvent(env, id, user, message, now);
}

async function uploadInteractiveSessionClipboard(
  request: Request,
  env: RuntimeEnv,
  user: User,
  id: string,
): Promise<{ path: string; name: string; mediaType: string; byteCount: number }> {
  if (!(await canControlInteractiveSessionById(env, user, id))) {
    throw forbidden("terminal control has not been granted");
  }
  const session = await readInteractiveSession(env, id);
  if (!session) throw notFound("interactive session not found");
  if (["expired", "failed", "stopped"].includes(session.status)) {
    throw badRequest(`session is ${session.status}`);
  }
  const bytes = await readClipboardUploadBytes(request);
  return writeTerminalClipboardFile(
    env,
    user,
    session,
    bytes,
    decodeHeaderValue(request.headers.get("x-clipboard-name")),
    request.headers.get("content-type") || "application/octet-stream",
  );
}

async function readClipboardUploadBytes(request: Request): Promise<Uint8Array> {
  const contentLength = Number(request.headers.get("content-length") || "0");
  if (Number.isFinite(contentLength) && contentLength > terminalClipboardMaxBytes) {
    throw badRequest(
      `clipboard file exceeds ${Math.floor(terminalClipboardMaxBytes / 1024 / 1024)} MiB`,
    );
  }
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (!bytes.byteLength) throw badRequest("clipboard file is empty");
  if (bytes.byteLength > terminalClipboardMaxBytes) {
    throw badRequest(
      `clipboard file exceeds ${Math.floor(terminalClipboardMaxBytes / 1024 / 1024)} MiB`,
    );
  }
  return bytes;
}

function terminalInputGrant(
  env: RuntimeEnv,
  user: User | null,
  session: InteractiveSession,
): () => Promise<boolean> {
  if (!user) return async () => false;
  if (canManageInteractiveSession(user, session)) return async () => true;
  return () => canControlInteractiveSessionById(env, user, session.id);
}

function terminalViewGrant(
  request: Request,
  env: RuntimeEnv,
  user: User | null,
  session: InteractiveSession,
): () => Promise<boolean> {
  return async () =>
    Boolean(user && (await canControlInteractiveSessionById(env, user, session.id))) ||
    (await canViewSharedTerminalRequest(request, env, session.id));
}

async function canViewSharedTerminalRequest(
  request: Request,
  env: RuntimeEnv,
  id: string,
): Promise<boolean> {
  const url = new URL(request.url);
  const shareSession = url.searchParams.get("shareSession") ?? "";
  const token = url.searchParams.get("token") ?? "";
  return (!shareSession || shareSession === id) && (await isSharedSessionToken(env, id, token));
}

async function canOpenAnonymousTerminalHub(request: Request, env: RuntimeEnv): Promise<boolean> {
  const url = new URL(request.url);
  const shareSession = url.searchParams.get("shareSession") ?? "";
  const token = url.searchParams.get("token") ?? "";
  return Boolean(shareSession && token && (await isSharedSessionToken(env, shareSession, token)));
}

async function canViewTerminalSession(
  request: Request,
  env: RuntimeEnv,
  user: User | null,
  session: InteractiveSession,
): Promise<boolean> {
  if (user) {
    requireRole(user, "viewer");
    if (await canControlInteractiveSessionById(env, user, session.id)) return true;
  }
  return canViewSharedTerminalRequest(request, env, session.id);
}

async function isSharedSessionToken(env: RuntimeEnv, id: string, token: string): Promise<boolean> {
  if (!token) return false;
  const row = await database(env)
    .selectFrom("interactive_sessions")
    .select(["share_token_hash", "share_mode", "status"])
    .where("id", "=", id)
    .where("share_mode", "=", "link_read")
    .executeTakeFirst();
  return Boolean(
    row?.share_token_hash &&
    !["expired", "failed", "stopped"].includes(row.status) &&
    (await sha256(token)) === row.share_token_hash,
  );
}

function sendTerminalFrame(
  socket: WebSocket,
  type: TerminalMessageType,
  sessionId: string,
  payload?: Uint8Array,
): void {
  if (socket.readyState === WebSocket.OPEN) {
    socket.send(
      payload
        ? encodeTerminalFrame({ type, sessionId, payload })
        : encodeTerminalFrame({ type, sessionId }),
    );
  }
}

function sendTerminalJson(
  socket: WebSocket,
  type: TerminalMessageType,
  sessionId: string,
  payload: unknown,
): void {
  sendTerminalFrame(socket, type, sessionId, encodeJsonPayload(payload));
}

function parseTerminalControlMessage(data: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(data) as Record<string, unknown>;
    return typeof parsed.type === "string" ? parsed : null;
  } catch {
    return null;
  }
}

async function interactiveSessionPty(
  request: Request,
  env: RuntimeEnv,
  user: User,
  id: string,
): Promise<Response> {
  if (request.headers.get("upgrade")?.toLowerCase() !== "websocket") {
    throw badRequest("websocket upgrade required");
  }

  const session = await readInteractiveSession(env, id);
  if (!session) throw notFound("interactive session not found");
  if (["expired", "failed", "stopped"].includes(session.status)) {
    throw badRequest(`session is ${session.status}`);
  }
  if (
    !canControlInteractiveSession(user, session, Date.now(), canGrantDelegatedControl(env, session))
  ) {
    throw forbidden("terminal control has not been granted");
  }
  const canManage = canManageInteractiveSession(user, session);

  if (session.leaseId?.startsWith(sandboxLeasePrefix) && env.SANDBOX) {
    return interactiveSandboxTerminal(
      request,
      env,
      user,
      session,
      canManage ? undefined : () => canControlInteractiveSessionById(env, user, id),
    );
  }

  const target = interactiveTerminalTarget(env, session);
  if (!target) throw serviceUnavailable("PTY bridge is not configured for this session");

  const pair = new WebSocketPair();
  const client = pair[0];
  const server = pair[1];
  let upstreamResponse: Response;
  try {
    upstreamResponse = await fetch(target.url, {
      headers: interactiveTerminalHeaders(session, target.authorization),
    });
  } catch (error) {
    server.accept();
    server.close(1011, `PTY bridge failed: ${clean(String(error), 120)}`);
    return new Response(null, { status: 101, webSocket: client });
  }
  const upstream = upstreamResponse.webSocket;
  if (!upstream || upstreamResponse.status !== 101) {
    server.accept();
    server.close(1011, `PTY bridge HTTP ${upstreamResponse.status}`);
    return new Response(null, { status: 101, webSocket: client });
  }

  server.accept();
  upstream.accept();
  bridgeWebSockets(
    server,
    upstream,
    canManage ? undefined : () => canControlInteractiveSessionById(env, user, id),
  );

  const now = Date.now();
  await database(env)
    .updateTable("interactive_sessions")
    .set({
      status:
        session.status === "ready" || session.status === "detached" ? "attached" : session.status,
      last_seen_at: now,
      updated_at: now,
      last_event: "PTY terminal connected",
    })
    .where("id", "=", id)
    .where("status", "!=", "stopped")
    .execute();
  await appendInteractiveSessionEvent(env, id, user, "PTY terminal connected", now);

  return new Response(null, { status: 101, webSocket: client });
}

async function interactiveSandboxTerminal(
  request: Request,
  env: RuntimeEnv,
  user: User,
  session: InteractiveSession,
  canSendLeft?: () => Promise<boolean>,
): Promise<Response> {
  if (!env.SANDBOX) throw serviceUnavailable("Sandbox binding is not configured");
  const sandboxId =
    session.leaseId?.slice(sandboxLeasePrefix.length) || sandboxIdForSession(session.id);
  const sandbox = getSandbox(env.SANDBOX, sandboxId);
  const terminalSession = await sandbox.getSession(sandboxTerminalSessionId(session.id));
  const now = Date.now();
  await database(env)
    .updateTable("interactive_sessions")
    .set({
      status:
        session.status === "ready" || session.status === "detached" ? "attached" : session.status,
      last_seen_at: now,
      updated_at: now,
      last_event: "Cloudflare Sandbox terminal connected",
    })
    .where("id", "=", session.id)
    .where("status", "!=", "stopped")
    .execute();
  await appendInteractiveSessionEvent(
    env,
    session.id,
    user,
    "Cloudflare Sandbox terminal connected",
    now,
  );
  const upstreamResponse = await terminalSession.terminal(request, {
    cols: terminalSize(request, "cols", 120),
    rows: terminalSize(request, "rows", 34),
    shell: sandboxStartupScriptPath(session),
  });
  const upstream = upstreamResponse.webSocket;
  if (!upstream || upstreamResponse.status !== 101) return upstreamResponse;

  const pair = new WebSocketPair();
  const client = pair[0];
  const server = pair[1];
  server.accept();
  upstream.accept();
  bridgeWebSockets(server, upstream, canSendLeft);
  return new Response(null, { status: 101, webSocket: client });
}

function interactiveTerminalTarget(
  env: RuntimeEnv,
  session: InteractiveSession,
): InteractiveTerminalTarget | null {
  if (env.CRABYARD_PTY_BRIDGE_URL) {
    const url = interactiveBridgeUrl(env.CRABYARD_PTY_BRIDGE_URL, session);
    if (!url) return null;
    return {
      url,
      authorization: bearer(env.CRABYARD_PTY_BRIDGE_TOKEN),
    };
  }

  if (session.attachUrl && /^wss?:\/\//i.test(session.attachUrl)) {
    return { url: session.attachUrl, authorization: null };
  }

  if (session.leaseId?.startsWith("cloudflare:") && env.CRABYARD_CLOUDFLARE_RUNNER_URL) {
    const sandboxId = session.leaseId.slice("cloudflare:".length);
    const url = addQuery(
      joinUrl(
        env.CRABYARD_CLOUDFLARE_RUNNER_URL,
        `/v1/sandboxes/${encodeURIComponent(sandboxId)}/pty`,
      ),
      terminalQuery(session),
    );
    if (!url) return null;
    return {
      url,
      authorization: bearer(env.CRABYARD_CLOUDFLARE_RUNNER_TOKEN),
    };
  }

  return null;
}

function interactiveBridgeUrl(base: string, session: InteractiveSession): string {
  const replacements: Record<string, string> = {
    id: session.id,
    leaseId: session.leaseId ?? "",
    repo: session.repo,
    branch: session.branch,
    runtime: session.runtime,
  };
  let url = base;
  for (const [key, value] of Object.entries(replacements)) {
    url = url.replaceAll(`{${key}}`, encodeURIComponent(value));
  }
  return addQuery(httpToWebSocketUrl(url), terminalQuery(session));
}

function terminalQuery(session: InteractiveSession): Record<string, string> {
  return {
    sessionId: session.id,
    leaseId: session.leaseId ?? "",
    repo: session.repo,
    branch: session.branch,
    runtime: session.runtime,
    command: session.command,
  };
}

function interactiveTerminalHeaders(
  session: InteractiveSession,
  authorization: string | null,
): Headers {
  const headers = new Headers({
    upgrade: "websocket",
    "x-crabyard-session": session.id,
    "x-crabyard-repo": session.repo,
    "x-crabyard-runtime": session.runtime,
  });
  if (authorization) headers.set("authorization", authorization);
  return headers;
}

function bridgeWebSockets(
  left: WebSocket,
  right: WebSocket,
  canSendLeft?: () => Promise<boolean>,
): void {
  let leftInputQueue = Promise.resolve();
  let rightOutputQueue = Promise.resolve();
  let controlCheckTimer: ReturnType<typeof setInterval> | undefined;
  let controlCheckInFlight: Promise<void> | undefined;
  let leftCanSend = true;
  const stopControlCheck = () => {
    if (controlCheckTimer !== undefined) clearInterval(controlCheckTimer);
    controlCheckTimer = undefined;
  };
  const verifyControl = async () => {
    const canSend = canSendLeft ? await canSendLeft().catch(() => false) : true;
    leftCanSend = canSend;
    if (!canSend) {
      stopControlCheck();
      closePair(left, right, 1008, "terminal control revoked");
      return false;
    }
    return true;
  };
  const scheduleControlCheck = () => {
    if (controlCheckInFlight) return;
    controlCheckInFlight = verifyControl()
      .then(() => undefined)
      .finally(() => {
        controlCheckInFlight = undefined;
      });
  };
  if (canSendLeft) {
    controlCheckTimer = setInterval(() => {
      scheduleControlCheck();
    }, 5000);
    scheduleControlCheck();
  }
  left.addEventListener("message", (event) => {
    const data = event.data;
    leftInputQueue = leftInputQueue
      .catch(() => undefined)
      .then(async () => {
        if (left.readyState !== WebSocket.OPEN || right.readyState !== WebSocket.OPEN) return;
        if (!leftCanSend || !(await verifyControl())) {
          closePair(left, right, 1008, "terminal control revoked");
          return;
        }
        right.send(await webSocketMessageData(data));
      });
  });
  right.addEventListener("message", (event) => {
    const data = event.data;
    rightOutputQueue = rightOutputQueue
      .catch(() => undefined)
      .then(async () => {
        if (left.readyState !== WebSocket.OPEN || right.readyState !== WebSocket.OPEN) return;
        left.send(await webSocketMessageData(data));
      });
  });
  left.addEventListener("close", (event) => {
    stopControlCheck();
    closePeer(event, right);
  });
  right.addEventListener("close", (event) => {
    stopControlCheck();
    closePeer(event, left);
  });
  left.addEventListener("error", () => {
    stopControlCheck();
    closePair(left, right, 1011, "peer error");
  });
  right.addEventListener("error", () => {
    stopControlCheck();
    closePair(right, left, 1011, "peer error");
  });
}

async function webSocketMessageData(data: unknown): Promise<string | ArrayBuffer> {
  if (typeof data === "string" || data instanceof ArrayBuffer) return data;
  if (data instanceof Uint8Array) {
    return new Uint8Array(data).buffer;
  }
  if (data instanceof Blob) return await data.arrayBuffer();
  if (
    data &&
    typeof data === "object" &&
    "arrayBuffer" in data &&
    typeof data.arrayBuffer === "function"
  ) {
    return await data.arrayBuffer();
  }
  return String(data);
}

function closePeer(event: CloseEvent, to: WebSocket): void {
  if (to.readyState === WebSocket.OPEN || to.readyState === WebSocket.CONNECTING) {
    to.close(event.code || 1000, event.reason || "peer closed");
  }
}

function closePair(left: WebSocket, right: WebSocket, code: number, reason: string): void {
  if (left.readyState === WebSocket.OPEN || left.readyState === WebSocket.CONNECTING) {
    left.close(code, reason);
  }
  if (right.readyState === WebSocket.OPEN || right.readyState === WebSocket.CONNECTING) {
    right.close(code, reason);
  }
}

async function provisionInteractiveSession(
  env: RuntimeEnv,
  session: InteractiveProvisionRequest,
): Promise<InteractiveProvisionResult | null> {
  if (env.SANDBOX) return provisionWithSandbox(env, session);
  if (!env.CRABYARD_INTERACTIVE_PROVISION_URL) return null;
  let response: Response;
  try {
    const headers = new Headers({ "content-type": "application/json" });
    if (env.CRABYARD_INTERACTIVE_PROVISION_TOKEN) {
      headers.set("authorization", `Bearer ${env.CRABYARD_INTERACTIVE_PROVISION_TOKEN}`);
    }
    response = await fetch(env.CRABYARD_INTERACTIVE_PROVISION_URL, {
      method: "POST",
      headers,
      body: JSON.stringify(session),
    });
  } catch (error) {
    return {
      status: "failed",
      leaseId: null,
      attachUrl: null,
      vncUrl: null,
      message: `interactive provision failed: ${clean(String(error), 240)}`,
    };
  }
  if (!response.ok) {
    return {
      status: "failed",
      leaseId: null,
      attachUrl: null,
      vncUrl: null,
      message: `interactive provision failed: HTTP ${response.status}`,
    };
  }
  const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  const status = optionalOneOf(body.status, interactiveSessionStatuses);
  if (!status) {
    return {
      status: "failed",
      leaseId: null,
      attachUrl: null,
      vncUrl: null,
      message: "interactive provision failed: invalid adapter response",
    };
  }
  return {
    status,
    leaseId: clean(body.leaseId ?? body.lease_id, 240) || null,
    attachUrl: clean(body.attachUrl ?? body.attach_url, 1000) || null,
    vncUrl: clean(body.vncUrl ?? body.vnc_url, 1000) || null,
    message: clean(body.message, 500) || `interactive workspace ${status}`,
  };
}

async function provisionInteractiveEndpoint(
  request: Request,
  env: RuntimeEnv,
): Promise<InteractiveProvisionResult> {
  authorizeProvisionEndpoint(request, env);
  const session = await readJson<Partial<InteractiveProvisionRequest>>(request);
  const id = clean(session.id, 120);
  const repo = normalizeRepo(session.repo);
  const branch = clean(session.branch, 120) || "main";
  const runtime = oneOf(session.runtime, ["crabbox", "container"], "crabbox") as
    | "crabbox"
    | "container";
  const command = clean(session.command, 240) || defaultInteractiveCommand;
  const prompt = clean(session.prompt, 4000);
  const owner = clean(session.owner, 240);
  if (!id || !repo || !owner) {
    return failedProvision("interactive provision failed: invalid session request");
  }

  const payload = { id, repo, branch, runtime, command, prompt, owner };
  if (env.SANDBOX) {
    return provisionWithSandbox(env, payload);
  }
  if (env.CRABYARD_RUNTIME_PROVISION_URL) {
    return forwardRuntimeProvision(env, payload);
  }
  if (payload.runtime === "container" && env.CRABYARD_CLOUDFLARE_RUNNER_URL) {
    return provisionWithCloudflareRunner(env, payload);
  }
  if (env.CRABYARD_CLAWFLEET_URL) {
    return provisionWithClawFleet(env, payload);
  }
  return {
    status: "pending_adapter",
    leaseId: null,
    attachUrl: null,
    vncUrl: null,
    message: "provision route live; runtime backend not configured",
  };
}

function authorizeProvisionEndpoint(request: Request, env: RuntimeEnv): void {
  const hasBackend = Boolean(
    env.SANDBOX ||
    env.CRABYARD_RUNTIME_PROVISION_URL ||
    env.CRABYARD_CLOUDFLARE_RUNNER_URL ||
    env.CRABYARD_CLAWFLEET_URL,
  );
  if (!env.CRABYARD_INTERACTIVE_PROVISION_TOKEN) {
    if (hasBackend) {
      throw serviceUnavailable("interactive provision token is not configured");
    }
    return;
  }
  const expected = `Bearer ${env.CRABYARD_INTERACTIVE_PROVISION_TOKEN}`;
  if (request.headers.get("authorization") !== expected) throw unauthorized();
}

async function provisionWithSandbox(
  env: RuntimeEnv,
  session: InteractiveProvisionRequest,
): Promise<InteractiveProvisionResult> {
  if (!env.SANDBOX) {
    return failedProvision("Cloudflare Sandbox binding is not configured");
  }
  if (!env.OPENAI_API_KEY) {
    return failedProvision("OPENAI_API_KEY is not configured for Cloudflare Sandbox Codex");
  }

  const sandboxId = sandboxIdForSession(session.id);
  const workdir = sandboxWorkdir(session.id);
  const terminalSessionId = sandboxTerminalSessionId(session.id);
  const sandbox = getSandbox(env.SANDBOX, sandboxId);
  try {
    await sandbox.mkdir(workdir, { recursive: true });
    await prepareSandboxWorkspace(sandbox, session, workdir);
    await writeSandboxStartupScript(sandbox, session, workdir);
    await sandbox.createSession({
      id: terminalSessionId,
      cwd: workdir,
      env: sandboxSessionEnv(env, session),
      commandTimeoutMs: 60 * 60 * 1000,
    });
  } catch (error) {
    const message = clean(error instanceof Error ? error.message : String(error), 240);
    return failedProvision(`Cloudflare Sandbox provision failed: ${message}`);
  }

  return {
    status: "ready",
    leaseId: `${sandboxLeasePrefix}${sandboxId}`,
    attachUrl: `/api/interactive-sessions/${encodeURIComponent(session.id)}/pty`,
    vncUrl: null,
    message: `Cloudflare Sandbox ready for ${session.repo}`,
  };
}

async function prepareSandboxWorkspace(
  sandbox: ReturnType<typeof getSandbox>,
  session: InteractiveProvisionRequest,
  workdir: string,
): Promise<void> {
  const repoUrl = `https://github.com/${session.repo}.git`;
  const quotedRepoUrl = shellQuote(repoUrl);
  const quotedBranch = shellQuote(session.branch);
  const quotedWorkdir = shellQuote(workdir);
  const quotedPrompt = shellQuote(session.prompt);
  await sandbox.exec(
    [
      "set -eu",
      `mkdir -p ${quotedWorkdir}`,
      `if [ ! -d ${quotedWorkdir}/.git ]; then`,
      `  tmp="${workdir}.clone.$$"`,
      `  rm -rf "$tmp"`,
      `  git clone --depth 1 --branch ${quotedBranch} ${quotedRepoUrl} "$tmp" || git clone --depth 1 ${quotedRepoUrl} "$tmp"`,
      `  cp -a "$tmp"/. ${quotedWorkdir}/`,
      `  rm -rf "$tmp"`,
      "fi",
      `cd ${quotedWorkdir}`,
      "git remote set-url origin " + quotedRepoUrl + " || true",
      "git fetch --depth 1 origin " + quotedBranch + " || true",
      "git checkout " + quotedBranch + " || true",
      "git pull --ff-only origin " + quotedBranch + " || true",
      quotedPrompt
        ? `printf '%s\n' ${quotedPrompt} > .crabyard-initial-prompt.txt`
        : "rm -f .crabyard-initial-prompt.txt",
    ].join("\n"),
    { timeout: 120_000 },
  );
}

async function writeSandboxStartupScript(
  sandbox: ReturnType<typeof getSandbox>,
  session: InteractiveProvisionRequest,
  workdir: string,
): Promise<void> {
  const scriptPath = sandboxStartupScriptPath(session);
  const script = `#!/usr/bin/env bash
set -e
export TERM="\${TERM:-xterm-256color}"
export COLORTERM="\${COLORTERM:-truecolor}"
export CRABYARD_SESSION_ID=${shellQuote(session.id)}
export CRABYARD_REPO=${shellQuote(session.repo)}
export CRABYARD_BRANCH=${shellQuote(session.branch)}
export CRABYARD_RUNTIME=${shellQuote(session.runtime)}
cd ${shellQuote(workdir)}
printf '\\033[1;36mCrabyard %s\\033[0m %s on %s\\n' "$CRABYARD_SESSION_ID" "$CRABYARD_REPO" "$CRABYARD_BRANCH"
if [ -s .crabyard-initial-prompt.txt ]; then
  printf '\\033[2mInitial prompt is saved in .crabyard-initial-prompt.txt\\033[0m\\n'
fi
if [ -n "\${OPENAI_API_KEY:-}" ]; then
  mkdir -p "$HOME/.codex"
  cat > "$HOME/.codex/config.toml" <<'EOF'
forced_login_method = "api"
preferred_auth_method = "apikey"
approval_policy = "never"
sandbox_mode = "danger-full-access"

[features]
goals = true

[projects.${JSON.stringify(workdir)}]
trust_level = "trusted"
EOF
  printf '%s' "$OPENAI_API_KEY" | codex login --with-api-key >/dev/null 2>&1 || true
else
  printf 'OPENAI_API_KEY is not configured for this session.\\n'
fi
printf '\\033[2J\\033[H'
if command -v ${shellFirstWord(session.command)} >/dev/null 2>&1; then
  exec ${session.command}
fi
if command -v codex >/dev/null 2>&1; then
  exec ${defaultInteractiveCommand}
fi
printf 'Codex CLI is not installed in this image. Opening bash.\\n'
exec /bin/bash -l
`;
  await sandbox.writeFile(scriptPath, script);
  await sandbox.exec(`chmod +x ${shellQuote(scriptPath)}`, { timeout: 10_000 });
}

function sandboxSessionEnv(
  env: RuntimeEnv,
  session: InteractiveProvisionRequest,
): Record<string, string | undefined> {
  return {
    CRABYARD_SESSION_ID: session.id,
    CRABYARD_REPO: session.repo,
    CRABYARD_BRANCH: session.branch,
    CRABYARD_RUNTIME: session.runtime,
    OPENAI_API_KEY: env.OPENAI_API_KEY,
    OPENAI_BASE_URL: env.OPENAI_BASE_URL,
    OPENAI_ORG_ID: env.OPENAI_ORG_ID,
  };
}

async function forwardRuntimeProvision(
  env: RuntimeEnv,
  session: InteractiveProvisionRequest,
): Promise<InteractiveProvisionResult> {
  let response: Response;
  try {
    const headers = new Headers({ "content-type": "application/json" });
    if (env.CRABYARD_RUNTIME_PROVISION_TOKEN) {
      headers.set("authorization", `Bearer ${env.CRABYARD_RUNTIME_PROVISION_TOKEN}`);
    }
    response = await fetch(env.CRABYARD_RUNTIME_PROVISION_URL as string, {
      method: "POST",
      headers,
      body: JSON.stringify(session),
    });
  } catch (error) {
    return failedProvision(`interactive provision failed: ${clean(String(error), 240)}`);
  }
  if (!response.ok) {
    return failedProvision(`interactive provision failed: runtime HTTP ${response.status}`);
  }
  return provisionResultFromBody(
    (await response.json().catch(() => ({}))) as Record<string, unknown>,
    "interactive provision failed: invalid runtime response",
  );
}

async function provisionWithCloudflareRunner(
  env: RuntimeEnv,
  session: InteractiveProvisionRequest,
): Promise<InteractiveProvisionResult> {
  if (!env.CRABYARD_CLOUDFLARE_RUNNER_TOKEN) {
    return failedProvision("cloudflare runner token is not configured");
  }

  const runnerUrl = env.CRABYARD_CLOUDFLARE_RUNNER_URL as string;
  const sandboxId = clean(`crabyard-${session.id}`.toLowerCase().replace(/[^a-z0-9_-]/g, "-"), 64);
  const workdir = cloudflareRunnerWorkdir(env, session);
  const instanceType = cloudflareRunnerInstanceType(env);
  let response: Response;
  try {
    response = await fetch(joinUrl(runnerUrl, "/v1/sandboxes"), {
      method: "POST",
      headers: {
        authorization: `Bearer ${env.CRABYARD_CLOUDFLARE_RUNNER_TOKEN}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        id: sandboxId,
        leaseId: sandboxId,
        repo: session.repo,
        branch: session.branch,
        workdir,
        instanceType,
        ttlSeconds: clampedSeconds(env.CRABYARD_CLOUDFLARE_RUNNER_TTL_SECONDS, 14_400),
        idleTimeoutSeconds: clampedSeconds(env.CRABYARD_CLOUDFLARE_RUNNER_IDLE_SECONDS, 1_800),
        labels: {
          app: "crabyard",
          session: session.id,
          repo: session.repo,
          branch: session.branch,
          owner: session.owner,
          runtime: session.runtime,
          command: session.command,
        },
      }),
    });
  } catch (error) {
    return failedProvision(`cloudflare runner provision failed: ${clean(String(error), 240)}`);
  }
  if (!response.ok) {
    return failedProvision(`cloudflare runner provision failed: HTTP ${response.status}`);
  }

  const body = (await response.json().catch(() => ({}))) as CloudflareSandboxPayload;
  const state = clean(body.state, 80);
  const ready = state === "running" || state === "healthy";
  return {
    status: ready ? "ready" : "provisioning",
    leaseId: `cloudflare:${clean(body.id, 120) || sandboxId}`,
    attachUrl: null,
    vncUrl: null,
    message: ready
      ? `cloudflare sandbox ready (${clean(body.instanceType, 80) || instanceType}); PTY bridge pending`
      : `cloudflare sandbox ${state || "provisioning"}`,
  };
}

async function provisionWithClawFleet(
  env: RuntimeEnv,
  session: InteractiveProvisionRequest,
): Promise<InteractiveProvisionResult> {
  if (session.runtime !== "crabbox") {
    return {
      status: "pending_adapter",
      leaseId: null,
      attachUrl: null,
      vncUrl: null,
      message: "container runtime requires CRABYARD_RUNTIME_PROVISION_URL",
    };
  }

  let response: Response;
  try {
    const headers = new Headers({ "content-type": "application/json" });
    if (env.CRABYARD_CLAWFLEET_TOKEN) {
      headers.set("authorization", `Bearer ${env.CRABYARD_CLAWFLEET_TOKEN}`);
    }
    response = await fetch(joinUrl(env.CRABYARD_CLAWFLEET_URL as string, "/api/v1/instances"), {
      method: "POST",
      headers,
      body: JSON.stringify({ count: 1, runtime_type: "openclaw" }),
    });
  } catch (error) {
    return failedProvision(`clawfleet provision failed: ${clean(String(error), 240)}`);
  }
  if (!response.ok) {
    return failedProvision(`clawfleet provision failed: HTTP ${response.status}`);
  }

  const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  const instances = Array.isArray(body.data) ? body.data : [];
  const instance = (instances[0] ?? {}) as ClawFleetInstancePayload;
  const name = clean(instance.name, 120);
  if (!name) return failedProvision("clawfleet provision failed: missing instance name");

  const publicUrl = env.CRABYARD_CLAWFLEET_PUBLIC_URL || env.CRABYARD_CLAWFLEET_URL || "";
  const status = instance.status === "running" ? "ready" : "provisioning";
  return {
    status,
    leaseId: `clawfleet:${name}`,
    attachUrl: joinUrl(publicUrl, `/console/${encodeURIComponent(name)}/`),
    vncUrl: directPortUrl(publicUrl, instance.novnc_port, "/vnc.html?autoconnect=1&resize=remote"),
    message: `clawfleet instance ${name} ${status}`,
  };
}

function provisionResultFromBody(
  body: Record<string, unknown>,
  invalidMessage: string,
): InteractiveProvisionResult {
  const status = optionalOneOf(body.status, interactiveSessionStatuses);
  if (!status) return failedProvision(invalidMessage);
  return {
    status,
    leaseId: clean(body.leaseId ?? body.lease_id, 240) || null,
    attachUrl: clean(body.attachUrl ?? body.attach_url, 1000) || null,
    vncUrl: clean(body.vncUrl ?? body.vnc_url, 1000) || null,
    message: clean(body.message, 500) || `interactive workspace ${status}`,
  };
}

function failedProvision(message: string): InteractiveProvisionResult {
  return {
    status: "failed",
    leaseId: null,
    attachUrl: null,
    vncUrl: null,
    message,
  };
}

function cloudflareRunnerWorkdir(env: RuntimeEnv, session: InteractiveProvisionRequest): string {
  const base = clean(env.CRABYARD_CLOUDFLARE_RUNNER_WORKDIR, 160) || "/workspace/crabyard";
  const suffix = session.id.toLowerCase().replace(/[^a-z0-9_-]/g, "-");
  return `${base.replace(/\/+$/, "")}/${suffix}`;
}

function cloudflareRunnerInstanceType(env: RuntimeEnv): string {
  return (
    optionalOneOf(env.CRABYARD_CLOUDFLARE_RUNNER_INSTANCE_TYPE, [
      "lite",
      "basic",
      "standard-1",
      "standard-2",
      "standard-3",
      "standard-4",
    ] as const) ?? "standard-4"
  );
}

function clampedSeconds(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(86_400, Math.max(300, Math.trunc(parsed)));
}

async function createCard(request: Request, env: RuntimeEnv, user: User): Promise<{ card: Card }> {
  const body = await readJson<{
    title?: string;
    prompt?: string;
    repo?: string;
    source?: string;
    runtime?: string;
    policy?: string;
  }>(request);
  const prompt = clean(body.prompt, 4000);
  const title = clean(body.title, 140) || titleFromPrompt(prompt);
  const repo = normalizeRepo(body.repo);
  if (!prompt || !repo) throw badRequest("prompt and repo are required");
  await requireRepo(env, repo);

  const now = Date.now();
  const workflow = await ensureWorkflowForRepo(env, repo, now);
  const workflowConfig = workflow?.status === "ok" ? workflow.config : undefined;
  const source = oneOf(body.source, ["Prompt", "Issue", "PR"], "Prompt");
  const runtime = oneOf(body.runtime, runtimeOptions, "auto");
  const policy = resolveCardPolicy(body.policy, workflowConfig);
  const owner = user.login ?? user.email ?? user.subject;
  const db = database(env);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const id = await nextCardId(env);
    try {
      await db
        .insertInto("cards")
        .values({
          id,
          title,
          prompt,
          repo,
          source,
          runtime,
          policy,
          lane: "Todo",
          owner,
          started_at: null,
          created_at: now,
          updated_at: now,
          last_event: "card created",
          changed_files: "[]",
          diff_patch: "",
          active_run_id: null,
        })
        .execute();
      await db
        .insertInto("events")
        .values([
          { card_id: id, actor: actor(user), message: "card created", created_at: now },
          { card_id: id, actor: actor(user), message: "repo allowlist ok", created_at: now + 1 },
        ])
        .execute();
      return { card: (await readCard(env, id)) as Card };
    } catch (error) {
      if (!isConstraintError(error) || attempt === 2) throw error;
    }
  }
  throw new Error("failed to allocate card id");
}

async function claimRunning(
  env: RuntimeEnv,
  user: User,
  card: Card,
  now: number,
): Promise<boolean> {
  await reconcileStalledRuns(env, now);
  const currentCard = (await readCard(env, card.id)) ?? card;
  await requireRepo(env, currentCard.repo);
  const settings = await readSettings(env);
  const cap = numberSetting(settings.cap, 20);
  const db = database(env);
  const existingRun =
    currentCard.run && activeRunStatuses.includes(currentCard.run.status) ? currentCard.run : null;
  if (existingRun) {
    await heartbeatRun(env, existingRun.id, user, now, "heartbeat ok");
    return true;
  }

  const workflow = await ensureWorkflowForRepo(env, currentCard.repo, now);
  const workflowConfig = workflow?.status === "ok" ? workflow.config : undefined;
  const attempt = await nextRunAttempt(env, currentCard.id);
  const runId = `${currentCard.id}-R${attempt}`;
  const descriptor = selectRuntimeDescriptor(currentCard, workflowConfig);
  const transition = await sql`
    UPDATE cards
      SET lane = 'Running',
        active_run_id = ${runId},
        started_at = COALESCE(started_at, ${now}),
        updated_at = ${now},
        last_event = ${"run queued"}
      WHERE id = ${currentCard.id}
        AND (active_run_id IS NULL OR active_run_id = '' OR active_run_id NOT IN (
          SELECT id FROM run_attempts WHERE status IN ('queued', 'leasing', 'running')
        ))
        AND (lane = 'Running' OR (
          SELECT count(*) FROM cards WHERE lane = 'Running' AND id <> ${currentCard.id}
        ) < ${cap})
  `.execute(db);
  if ((transition.numAffectedRows ?? 0n) === 0n) {
    const activeCount = await db
      .selectFrom("cards")
      .select(sql<number>`count(*)`.as("count"))
      .where("lane", "=", "Running")
      .executeTakeFirst();
    const message =
      Number(activeCount?.count ?? 0) >= cap
        ? `capacity blocked at cap ${cap}`
        : "run already active";
    await appendEvent(env, card.id, user, message, now);
    return false;
  }
  await db
    .insertInto("run_attempts")
    .values({
      id: runId,
      card_id: currentCard.id,
      attempt,
      runtime: descriptor.runtime,
      status: "queued",
      control_intent: null,
      lease_id: null,
      attach_url: null,
      vnc_url: null,
      selection_reason: descriptor.reason,
      capabilities_json: JSON.stringify(descriptor.capabilities),
      operator: null,
      last_heartbeat_at: now,
      started_at: now,
      ended_at: null,
      created_at: now,
      updated_at: now,
      error: null,
    })
    .onConflict((oc) => oc.doNothing())
    .execute();
  await appendEvent(env, currentCard.id, user, `scheduler queued ${currentCard.repo}`, now + 1);
  await appendEvent(
    env,
    currentCard.id,
    user,
    `runtime=${descriptor.runtime} policy=${currentCard.policy} workflow=${workflow?.status ?? "unseen"} reason=${descriptor.reason}`,
    now + 2,
  );
  return true;
}

async function mutateCard(
  env: RuntimeEnv,
  user: User,
  id: string,
  action: string,
): Promise<{ card: Card }> {
  const card = await readCard(env, id);
  if (!card) throw notFound("card not found");
  const now = Date.now();

  if (action === "start" || action === "pulse") {
    const wasRunning = card.lane === "Running";
    if (!wasRunning) {
      if (!(await claimRunning(env, user, card, now))) {
        return { card: (await readCard(env, id)) as Card };
      }
    } else if (card.run && activeRunStatuses.includes(card.run.status)) {
      await heartbeatRun(env, card.run.id, user, now + 2, "heartbeat ok");
      return { card: (await readCard(env, id)) as Card };
    } else if (!(await claimRunning(env, user, card, now))) {
      return { card: (await readCard(env, id)) as Card };
    }
    await appendEvent(env, card.id, user, "heartbeat ok", now + 3);
    return { card: (await readCard(env, id)) as Card };
  }

  if (action === "advance") {
    const nextLane = lanes[(lanes.indexOf(card.lane) + 1) % lanes.length] ?? "Todo";
    if (nextLane === "Running") {
      await claimRunning(env, user, card, now);
      return { card: (await readCard(env, id)) as Card };
    }
    const startedAt = nextLane === "Running" ? now : card.startedAt;
    await database(env)
      .updateTable("cards")
      .set({
        lane: nextLane,
        started_at: startedAt,
        updated_at: now,
        last_event: `moved to ${nextLane}`,
      })
      .where("id", "=", card.id)
      .execute();
    if (
      card.run &&
      (activeRunStatuses.includes(card.run.status) ||
        (card.run.status === "review" && nextLane === "Done"))
    ) {
      await finishRunForLane(env, card.run.id, nextLane, user, now + 1);
    }
    await appendEvent(env, card.id, user, `moved to ${nextLane}`, now);
    return { card: (await readCard(env, id)) as Card };
  }

  if (action === "attach") {
    return { card: (await readCard(env, id)) as Card };
  }

  if (action === "watch") {
    await appendEvent(env, card.id, user, "watch attached", now);
    return { card: (await readCard(env, id)) as Card };
  }

  if (action === "takeover") {
    if (!card.run || !activeRunStatuses.includes(card.run.status)) {
      throw badRequest("no active run to take over");
    }
    if (!card.run.capabilities.takeover) throw badRequest("runtime does not support takeover");
    await database(env)
      .updateTable("run_attempts")
      .set({ operator: actor(user), control_intent: "takeover", updated_at: now })
      .where("id", "=", card.run.id)
      .execute();
    await appendEvent(env, card.id, user, "operator takeover granted", now);
    return { card: (await readCard(env, id)) as Card };
  }

  if (action === "stall") {
    if (!card.run || !activeRunStatuses.includes(card.run.status)) {
      throw badRequest("no active run to mark stalled");
    }
    await markCardStalled(env, card, user, now, "operator marked stalled");
    return { card: (await readCard(env, id)) as Card };
  }

  throw badRequest("unknown action");
}

async function updatePolicy(
  request: Request,
  env: RuntimeEnv,
  user: User,
): Promise<Record<string, unknown>> {
  const body = await readJson<{ cap?: number; retention?: string; merge?: string }>(request);
  const cap = Math.min(200, Math.max(1, Number.isFinite(body.cap) ? Number(body.cap) : 20));
  const retention = oneOf(body.retention, ["14", "30", "60"], "30");
  const merge = oneOf(body.merge, ["guarded", "maintainers", "disabled"], "guarded");
  const now = Date.now();
  await database(env)
    .insertInto("settings")
    .values([
      { key: "cap", value: String(cap) },
      { key: "retention", value: retention },
      { key: "merge", value: merge },
    ])
    .onConflict((oc) => oc.column("key").doUpdateSet({ value: sql<string>`excluded.value` }))
    .execute();
  await audit(env, user, `policy updated cap=${cap} retention=${retention} merge=${merge}`, now);
  return readState(env, user);
}

async function evaluateWorkflow(
  request: Request,
  env: RuntimeEnv,
  user: User,
): Promise<Record<string, unknown>> {
  const body = await readJson<{ repo?: string }>(request);
  const repo = normalizeRepo(body.repo) || preferredRepo;
  await requireRepo(env, repo);
  const workflow = await refreshWorkflowForRepo(env, repo, Date.now());
  await audit(env, user, `workflow evaluated ${repo} status=${workflow.status}`, Date.now());
  return readState(env, user);
}

async function addAllowEntry(
  request: Request,
  env: RuntimeEnv,
  user: User,
): Promise<Record<string, unknown>> {
  const body = await readJson<{ value?: string; role?: Role }>(request);
  const value = normalizeAllow(body.value);
  if (!value) throw badRequest("allow value is required");
  const role = oneOf(body.role, ["viewer", "maintainer", "owner"], "maintainer") as Role;
  const now = Date.now();
  await database(env)
    .insertInto("allow_entries")
    .values({ value, role, created_at: now, updated_at: now })
    .onConflict((oc) => oc.column("value").doUpdateSet({ role, updated_at: now }))
    .execute();
  await audit(env, user, `allowlist updated ${value} role=${role}`, now);
  return readState(env, user);
}

async function removeAllowEntry(
  env: RuntimeEnv,
  user: User,
  value: string,
): Promise<Record<string, unknown>> {
  const normalized = normalizeAllow(value);
  await database(env).deleteFrom("allow_entries").where("value", "=", normalized).execute();
  await audit(env, user, `allowlist removed ${normalized}`, Date.now());
  return readState(env, user);
}

async function addRepo(
  request: Request,
  env: RuntimeEnv,
  user: User,
): Promise<Record<string, unknown>> {
  const body = await readJson<{ repo?: string }>(request);
  const repo = normalizeRepo(body.repo);
  if (!repo) throw badRequest("repo is required");
  const now = Date.now();
  await database(env)
    .insertInto("repos")
    .values({ repo, enabled: 1, created_at: now, updated_at: now })
    .onConflict((oc) => oc.column("repo").doUpdateSet({ enabled: 1, updated_at: now }))
    .execute();
  await audit(env, user, `repo allowlisted ${repo}`, now);
  return readState(env, user);
}

async function removeRepo(
  env: RuntimeEnv,
  user: User,
  repo: string,
): Promise<Record<string, unknown>> {
  const normalized = normalizeRepo(repo);
  await database(env)
    .updateTable("repos")
    .set({ enabled: 0, updated_at: Date.now() })
    .where("repo", "=", normalized)
    .execute();
  await audit(env, user, `repo removed ${normalized}`, Date.now());
  return readState(env, user);
}

async function searchGitHubRefs(
  request: Request,
  env: RuntimeEnv,
): Promise<{ matches: GitHubReference[] }> {
  const url = new URL(request.url);
  const number = Number(url.searchParams.get("number"));
  if (!Number.isInteger(number) || number < 1) throw badRequest("issue or PR number is required");

  const rows = await database(env)
    .selectFrom("repos")
    .select("repo")
    .where("enabled", "=", 1)
    .execute();
  const repos = sortRepos(rows.map((row) => row.repo)).slice(0, 160);
  const matches = env.GITHUB_TOKEN
    ? await fetchGitHubReferences(env, repos, number)
    : await fetchPublicGitHubReferences(env, repos, number);
  return { matches };
}

async function fetchGitHubReferences(
  env: RuntimeEnv,
  repos: string[],
  number: number,
): Promise<GitHubReference[]> {
  const targets = repos.flatMap((repo) => {
    const [owner, name] = repo.split("/");
    return owner && name ? [{ repo, owner, name }] : [];
  });
  if (!targets.length) return [];
  const selections = targets
    .map((target, index) => {
      const { owner, name } = target;
      return `r${index}: repository(owner: ${JSON.stringify(owner)}, name: ${JSON.stringify(name)}) {
        issueOrPullRequest(number: $number) {
          __typename
          ... on Issue { number title state url body author { login } updatedAt }
          ... on PullRequest { number title state url body author { login } updatedAt }
        }
      }`;
    })
    .join("\n");
  const response = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: {
      ...githubHeaders(env),
      "content-type": "application/json",
    },
    body: JSON.stringify({
      query: `query CrabyardRefs($number: Int!) { ${selections} }`,
      variables: { number },
    }),
  });
  if (response.status === 403 || response.status === 429) {
    throw serviceUnavailable("GitHub lookup rate limited; retry later");
  }
  if (!response.ok) throw serviceUnavailable("GitHub lookup failed; retry later");

  const payload = await response.json<{
    data?: Record<string, { issueOrPullRequest?: GitHubGraphqlRefPayload | null } | null>;
    errors?: { type?: string; message?: string }[];
  }>();
  if (
    payload.errors?.some((error) =>
      /rate|limit/i.test(`${error.type ?? ""} ${error.message ?? ""}`),
    )
  ) {
    throw serviceUnavailable("GitHub lookup rate limited; retry later");
  }
  return targets
    .flatMap((target, index) => {
      const item = payload.data?.[`r${index}`]?.issueOrPullRequest;
      return item ? [githubReferenceFromGraphql(target.repo, item)] : [];
    })
    .sort((left, right) => sortRepoNames(left.repo, right.repo));
}

async function fetchPublicGitHubReferences(
  env: RuntimeEnv,
  repos: string[],
  number: number,
): Promise<GitHubReference[]> {
  const repo = repos.includes(preferredRepo) ? preferredRepo : repos[0];
  if (!repo) return [];
  const match = await fetchGitHubReference(env, repo, number);
  return match ? [match] : [];
}

async function fetchGitHubReference(
  env: RuntimeEnv,
  repo: string,
  number: number,
): Promise<GitHubReference | null> {
  const response = await fetch(`https://api.github.com/repos/${repo}/issues/${number}`, {
    headers: githubHeaders(env),
  });
  if (response.status === 404 || response.status === 410) return null;
  if (response.status === 403 || response.status === 429) {
    throw serviceUnavailable("GitHub search rate limited; retry later");
  }
  if (!response.ok) return null;

  const item = await response.json<GitHubIssuePayload>();
  return {
    repo,
    number: item.number,
    title: item.title,
    source: item.pull_request ? "PR" : "Issue",
    state: item.state,
    url: item.html_url,
    author: item.user?.login ?? null,
    updatedAt: item.updated_at,
    body: item.body ?? "",
  };
}

async function ensureWorkflowForRepo(
  env: RuntimeEnv,
  repo: string,
  now: number,
): Promise<RepoWorkflow | null> {
  const existing = await readWorkflowForRepo(env, repo);
  if (existing && now - existing.evaluatedAt < workflowCacheMs) return existing;
  try {
    return await refreshWorkflowForRepo(env, repo, now);
  } catch {
    return existing;
  }
}

async function refreshWorkflowForRepo(
  env: RuntimeEnv,
  repo: string,
  now: number,
): Promise<RepoWorkflow> {
  const response = await fetch(`https://api.github.com/repos/${repo}/contents/CRABYARD.md`, {
    headers: githubHeaders(env),
  });
  if (response.status === 404) {
    return writeWorkflowRow(env, {
      repo,
      status: "missing",
      sourcePath: "CRABYARD.md",
      sourceSha: null,
      config: {},
      prompt: "",
      error: "CRABYARD.md not found",
      evaluatedAt: now,
      updatedAt: now,
    });
  }
  if (response.status === 403 || response.status === 429) {
    throw serviceUnavailable("GitHub workflow lookup rate limited; retry later");
  }
  if (!response.ok) throw serviceUnavailable("GitHub workflow lookup failed; retry later");

  const payload = await response.json<GitHubContentPayload>();
  if (payload.encoding !== "base64" || !payload.content) {
    return writeWorkflowRow(env, {
      repo,
      status: "invalid",
      sourcePath: "CRABYARD.md",
      sourceSha: payload.sha ?? null,
      config: {},
      prompt: "",
      error: "unsupported CRABYARD.md encoding",
      evaluatedAt: now,
      updatedAt: now,
    });
  }

  const decoded = decodeBase64Text(payload.content);
  const parsed = parseWorkflowMarkdown(decoded);
  return writeWorkflowRow(env, {
    repo,
    status: parsed.error ? "invalid" : "ok",
    sourcePath: "CRABYARD.md",
    sourceSha: payload.sha ?? null,
    config: parsed.error ? {} : parsed.config,
    prompt: parsed.prompt,
    error: parsed.error,
    evaluatedAt: now,
    updatedAt: now,
  });
}

async function readWorkflowForRepo(env: RuntimeEnv, repo: string): Promise<RepoWorkflow | null> {
  const row = await database(env)
    .selectFrom("repo_workflows")
    .selectAll()
    .where("repo", "=", repo)
    .executeTakeFirst();
  return row ? repoWorkflow(row) : null;
}

async function readWorkflowSummaries(env: RuntimeEnv): Promise<RepoWorkflow[]> {
  const rows = await database(env)
    .selectFrom("repo_workflows")
    .select([
      "repo",
      "status",
      "source_path",
      "source_sha",
      "config_json",
      "error",
      "evaluated_at",
      "updated_at",
    ])
    .orderBy("updated_at", "desc")
    .limit(80)
    .execute();
  return rows.map((row) => repoWorkflow({ ...row, prompt: "" }));
}

async function writeWorkflowRow(env: RuntimeEnv, workflow: RepoWorkflow): Promise<RepoWorkflow> {
  await database(env)
    .insertInto("repo_workflows")
    .values({
      repo: workflow.repo,
      status: workflow.status,
      source_path: workflow.sourcePath,
      source_sha: workflow.sourceSha,
      config_json: JSON.stringify(workflow.config),
      prompt: workflow.prompt,
      error: workflow.error,
      evaluated_at: workflow.evaluatedAt,
      updated_at: workflow.updatedAt,
    })
    .onConflict((oc) =>
      oc.column("repo").doUpdateSet({
        status: workflow.status,
        source_path: workflow.sourcePath,
        source_sha: workflow.sourceSha,
        config_json: JSON.stringify(workflow.config),
        prompt: workflow.prompt,
        error: workflow.error,
        evaluated_at: workflow.evaluatedAt,
        updated_at: workflow.updatedAt,
      }),
    )
    .execute();
  return workflow;
}

function githubReferenceFromGraphql(repo: string, item: GitHubGraphqlRefPayload): GitHubReference {
  return {
    repo,
    number: item.number,
    title: item.title,
    source: item.__typename === "PullRequest" ? "PR" : "Issue",
    state: item.state.toLowerCase(),
    url: item.url,
    author: item.author?.login ?? null,
    updatedAt: item.updatedAt,
    body: item.body ?? "",
  };
}

async function readCards(env: RuntimeEnv): Promise<Card[]> {
  const db = database(env);
  const cards = await db
    .selectFrom("cards")
    .select([
      "id",
      "title",
      "prompt",
      "repo",
      "source",
      "runtime",
      "policy",
      "lane",
      "owner",
      "started_at",
      "created_at",
      "changed_files",
      "active_run_id",
    ])
    .orderBy("updated_at", "desc")
    .orderBy("created_at", "desc")
    .execute();
  if (!cards.length) return [];
  const runs = await readActiveRunsForCards(env);
  const eventRows = (
    await sql<{ card_id: string; message: string; created_at: number }>`
      SELECT card_id, message, created_at
      FROM (
        SELECT card_id, message, created_at, id,
          row_number() OVER (PARTITION BY card_id ORDER BY created_at DESC, id DESC) AS rank
        FROM events
        WHERE card_id IN (SELECT id FROM cards)
      )
      WHERE rank <= 80
      ORDER BY card_id ASC, created_at ASC, id ASC
    `.execute(db)
  ).rows;
  const logs = new Map<string, string[]>();
  for (const row of eventRows) {
    const line = `${new Date(row.created_at).toLocaleTimeString("en-GB")} ${row.message}`;
    logs.set(row.card_id, [...(logs.get(row.card_id) ?? []), line]);
  }
  return cards.map((card) => ({
    id: card.id,
    title: card.title,
    prompt: card.prompt,
    repo: card.repo,
    source: card.source,
    runtime: card.runtime,
    policy: card.policy,
    lane: card.lane,
    owner: card.owner,
    startedAt: card.started_at,
    createdAt: card.created_at,
    logs: logs.get(card.id) ?? [],
    changes: cardChanges(card.changed_files, ""),
    run: card.active_run_id ? (runs.get(card.active_run_id) ?? null) : null,
  }));
}

async function readCard(env: RuntimeEnv, id: string): Promise<Card | null> {
  const db = database(env);
  const card = await db
    .selectFrom("cards")
    .select([
      "id",
      "title",
      "prompt",
      "repo",
      "source",
      "runtime",
      "policy",
      "lane",
      "owner",
      "started_at",
      "created_at",
      "changed_files",
      "diff_patch",
      "active_run_id",
    ])
    .where("id", "=", id)
    .executeTakeFirst();
  if (!card) return null;
  const runs = await readRunsByIds(env, card.active_run_id ? [card.active_run_id] : []);
  const eventRows = (
    await sql<{ message: string; created_at: number }>`
      SELECT message, created_at
      FROM (
        SELECT message, created_at, id
        FROM events
        WHERE card_id = ${card.id}
        ORDER BY created_at DESC, id DESC
        LIMIT 80
      )
      ORDER BY created_at ASC, id ASC
    `.execute(db)
  ).rows;
  return {
    id: card.id,
    title: card.title,
    prompt: card.prompt,
    repo: card.repo,
    source: card.source,
    runtime: card.runtime,
    policy: card.policy,
    lane: card.lane,
    owner: card.owner,
    startedAt: card.started_at,
    createdAt: card.created_at,
    logs: eventRows.map(
      (row) => `${new Date(row.created_at).toLocaleTimeString("en-GB")} ${row.message}`,
    ),
    changes: cardChanges(card.changed_files, card.diff_patch),
    run: card.active_run_id ? (runs.get(card.active_run_id) ?? null) : null,
  };
}

async function readRunsByIds(env: RuntimeEnv, ids: string[]): Promise<Map<string, RunAttempt>> {
  const uniqueIds = [...new Set(ids)].filter(Boolean);
  if (!uniqueIds.length) return new Map();
  const rows = await database(env)
    .selectFrom("run_attempts")
    .selectAll()
    .where("id", "in", uniqueIds)
    .execute();
  return new Map(rows.map((row) => [row.id, runAttempt(row)]));
}

async function readActiveRunsForCards(env: RuntimeEnv): Promise<Map<string, RunAttempt>> {
  const rows = (
    await sql<RunAttemptTable>`
      SELECT run_attempts.*
      FROM run_attempts
      INNER JOIN cards ON cards.active_run_id = run_attempts.id
    `.execute(database(env))
  ).rows;
  return new Map(rows.map((row) => [row.id, runAttempt(row)]));
}

async function readRunsForCard(env: RuntimeEnv, cardId: string): Promise<RunAttempt[]> {
  const rows = await database(env)
    .selectFrom("run_attempts")
    .selectAll()
    .where("card_id", "=", cardId)
    .orderBy("attempt", "desc")
    .execute();
  return rows.map(runAttempt);
}

async function readInteractiveSessions(
  env: RuntimeEnv,
  user?: User,
): Promise<InteractiveSession[]> {
  const rows = await database(env)
    .selectFrom("interactive_sessions")
    .selectAll()
    .orderBy("updated_at", "desc")
    .limit(80)
    .execute();
  if (!rows.length) return [];
  const logs = await readInteractiveSessionLogs(
    env,
    rows.map((row) => row.id),
  );
  return rows.map((row) =>
    decorateInteractiveSession(interactiveSession(row, logs.get(row.id) ?? []), user, env),
  );
}

async function readInteractiveSession(
  env: RuntimeEnv,
  id: string,
): Promise<InteractiveSession | null> {
  const row = await database(env)
    .selectFrom("interactive_sessions")
    .selectAll()
    .where("id", "=", id)
    .executeTakeFirst();
  if (!row) return null;
  const logs = await readInteractiveSessionLogs(env, [id]);
  return interactiveSession(row, logs.get(id) ?? []);
}

async function readSharedInteractiveSession(
  env: RuntimeEnv,
  id: string,
  token: string,
): Promise<{ session: InteractiveSession }> {
  const row = await database(env)
    .selectFrom("interactive_sessions")
    .selectAll()
    .where("id", "=", id)
    .where("share_mode", "=", "link_read")
    .executeTakeFirst();
  if (!row || !row.share_token_hash || !token) throw notFound("shared session not found");
  if ((await sha256(token)) !== row.share_token_hash) throw notFound("shared session not found");
  const logs = await readInteractiveSessionLogs(env, [id]);
  const session = interactiveSession(row, logs.get(id) ?? []);
  const activeController = activeDelegatedController(session, Date.now());
  return {
    session: {
      ...session,
      leaseId: null,
      attachUrl: null,
      vncUrl: null,
      controller: activeController,
      controlGrantedAt: activeController ? session.controlGrantedAt : null,
      controlExpiresAt: activeController ? session.controlExpiresAt : null,
      canControl: false,
      canManage: false,
      canRequestControl: false,
      sharedReadOnly: true,
    },
  };
}

async function readInteractiveSessionLogs(
  env: RuntimeEnv,
  ids: string[],
): Promise<Map<string, string[]>> {
  const uniqueIds = [...new Set(ids)].filter(Boolean);
  if (!uniqueIds.length) return new Map();
  const eventRows = (
    await sql<{ session_id: string; message: string; created_at: number }>`
      SELECT session_id, message, created_at
      FROM (
        SELECT session_id, message, created_at, id,
          row_number() OVER (PARTITION BY session_id ORDER BY created_at DESC, id DESC) AS rank
        FROM interactive_session_events
        WHERE session_id IN (${sql.join(uniqueIds)})
      )
      WHERE rank <= 80
      ORDER BY session_id ASC, created_at ASC, id ASC
    `.execute(database(env))
  ).rows;
  const logs = new Map<string, string[]>();
  for (const row of eventRows) {
    const line = `${new Date(row.created_at).toLocaleTimeString("en-GB")} ${row.message}`;
    logs.set(row.session_id, [...(logs.get(row.session_id) ?? []), line]);
  }
  return logs;
}

async function appendInteractiveSessionEvent(
  env: RuntimeEnv,
  id: string,
  user: User,
  message: string,
  now = Date.now(),
): Promise<void> {
  await database(env)
    .insertInto("interactive_session_events")
    .values({
      session_id: id,
      actor: actor(user),
      message: clean(message, 1000),
      created_at: now,
    })
    .execute();
}

async function readSettings(env: RuntimeEnv): Promise<Record<string, string>> {
  const rows = await database(env).selectFrom("settings").select(["key", "value"]).execute();
  return Object.fromEntries(rows.map((row) => [row.key, row.value]));
}

async function authorize(env: RuntimeEnv, user: User): Promise<User> {
  const entries = await database(env)
    .selectFrom("allow_entries")
    .select(["value", "role"])
    .execute();
  const candidates = new Set([
    user.login ? `@${user.login.toLowerCase()}` : "",
    user.email ? user.email.toLowerCase() : "",
    ...user.teams.map((team) => team.toLowerCase()),
  ]);
  let role: Role | null = null;
  for (const row of entries) {
    if (!candidates.has(row.value.toLowerCase())) continue;
    role = strongerRole(role, row.role);
  }
  return { ...user, role: role ?? "viewer", allowed: role !== null };
}

async function upsertUser(env: RuntimeEnv, user: User, now: number): Promise<void> {
  const row = {
    subject: user.subject,
    login: user.login,
    email: user.email,
    name: user.name,
    role: user.role,
    allowed: user.allowed ? 1 : 0,
    teams: JSON.stringify(user.teams),
    created_at: now,
    updated_at: now,
    last_seen_at: now,
  };
  await database(env)
    .insertInto("users")
    .values(row)
    .onConflict((oc) =>
      oc.column("subject").doUpdateSet({
        login: row.login,
        email: row.email,
        name: row.name,
        role: row.role,
        allowed: row.allowed,
        teams: row.teams,
        updated_at: row.updated_at,
        last_seen_at: row.last_seen_at,
      }),
    )
    .execute();
}

async function createSession(
  env: RuntimeEnv,
  subject: string,
  now: number,
  maxAgeSeconds = bootstrapSessionSeconds,
): Promise<string> {
  const token = crypto.randomUUID() + crypto.randomUUID();
  const tokenHash = await sha256(token);
  const expires = now + maxAgeSeconds * 1000;
  await database(env)
    .insertInto("sessions")
    .values({ token_hash: tokenHash, subject, expires_at: expires, created_at: now })
    .execute();
  return cookie(sessionCookie, token, maxAgeSeconds);
}

async function nextCardId(env: RuntimeEnv): Promise<string> {
  const row = await database(env)
    .selectFrom("cards")
    .select(sql<number | null>`max(CAST(substr(id, 4) AS INTEGER))`.as("max_id"))
    .where("id", "like", "CY-%")
    .executeTakeFirst();
  return `CY-${String((row?.max_id ?? 100) + 1)}`;
}

async function nextRunAttempt(env: RuntimeEnv, cardId: string): Promise<number> {
  const row = await database(env)
    .selectFrom("run_attempts")
    .select(sql<number | null>`max(attempt)`.as("max_attempt"))
    .where("card_id", "=", cardId)
    .executeTakeFirst();
  return (row?.max_attempt ?? 0) + 1;
}

async function nextInteractiveSessionId(env: RuntimeEnv): Promise<string> {
  const row = await database(env)
    .selectFrom("interactive_sessions")
    .select(sql<number | null>`max(CAST(substr(id, 4) AS INTEGER))`.as("max_id"))
    .where("id", "like", "IS-%")
    .executeTakeFirst();
  return `IS-${String((row?.max_id ?? 100) + 1)}`;
}

async function requireRepo(env: RuntimeEnv, repo: string): Promise<void> {
  const row = await database(env)
    .selectFrom("repos")
    .select("repo")
    .where("repo", "=", repo)
    .where("enabled", "=", 1)
    .executeTakeFirst();
  if (!row) throw forbidden(`repo blocked by allowlist: ${repo}`);
}

async function reconcileStalledRuns(env: RuntimeEnv, now: number): Promise<void> {
  const threshold = now - stallThresholdMs(await readSettings(env));
  const staleRuns = await database(env)
    .selectFrom("run_attempts")
    .select(["id", "card_id"])
    .where("status", "in", activeRunStatuses)
    .where("last_heartbeat_at", "<", threshold)
    .limit(25)
    .execute();
  if (!staleRuns.length) return;

  const db = database(env);
  const system = systemUser();
  for (const run of staleRuns) {
    const runUpdate = await db
      .updateTable("run_attempts")
      .set({
        status: "stalled",
        ended_at: now,
        updated_at: now,
        error: "heartbeat timeout",
      })
      .where("id", "=", run.id)
      .where("status", "in", activeRunStatuses)
      .where("last_heartbeat_at", "<", threshold)
      .executeTakeFirst();
    if ((runUpdate.numUpdatedRows ?? 0n) === 0n) continue;

    await executeBatch(env, [
      db
        .updateTable("cards")
        .set({
          lane: "Human Review",
          updated_at: now,
          last_event: "stalled; heartbeat timeout",
        })
        .where("id", "=", run.card_id)
        .where("active_run_id", "=", run.id),
      eventInsert(db, run.card_id, actor(system), "stalled; heartbeat timeout", now),
    ]);
  }
}

async function heartbeatRun(
  env: RuntimeEnv,
  runId: string,
  user: User,
  now: number,
  message: string,
): Promise<void> {
  const run = await database(env)
    .selectFrom("run_attempts")
    .select(["id", "card_id"])
    .where("id", "=", runId)
    .executeTakeFirst();
  if (!run) return;
  const db = database(env);
  await executeBatch(env, [
    db
      .updateTable("run_attempts")
      .set({ status: "running", last_heartbeat_at: now, updated_at: now })
      .where("id", "=", runId)
      .where("status", "in", activeRunStatuses),
    eventInsert(db, run.card_id, actor(user), message, now),
    db
      .updateTable("cards")
      .set({ updated_at: now, last_event: message })
      .where("id", "=", run.card_id),
  ]);
}

async function finishRunForLane(
  env: RuntimeEnv,
  runId: string,
  lane: string,
  user: User,
  now: number,
): Promise<void> {
  const status: RunStatus =
    lane === "Done" ? "completed" : lane === "Human Review" ? "review" : "canceled";
  const run = await database(env)
    .selectFrom("run_attempts")
    .select(["id", "card_id"])
    .where("id", "=", runId)
    .executeTakeFirst();
  if (!run) return;
  const db = database(env);
  await executeBatch(env, [
    db
      .updateTable("run_attempts")
      .set({
        status,
        ended_at: now,
        updated_at: now,
        control_intent: status === "canceled" ? "cancel" : null,
      })
      .where("id", "=", runId),
    eventInsert(db, run.card_id, actor(user), `run ${status}`, now),
  ]);
}

async function markCardStalled(
  env: RuntimeEnv,
  card: Card,
  user: User,
  now: number,
  reason: string,
): Promise<void> {
  const db = database(env);
  if (!card.run) throw badRequest("no active run to mark stalled");
  const runUpdate = await db
    .updateTable("run_attempts")
    .set({
      status: "stalled",
      ended_at: now,
      updated_at: now,
      error: reason,
    })
    .where("id", "=", card.run.id)
    .where("card_id", "=", card.id)
    .where("status", "in", activeRunStatuses)
    .executeTakeFirst();
  if ((runUpdate.numUpdatedRows ?? 0n) === 0n) {
    throw badRequest("run is no longer active");
  }
  await executeBatch(env, [
    db
      .updateTable("cards")
      .set({
        lane: "Human Review",
        updated_at: now,
        last_event: "stalled; workspace preserved",
      })
      .where("id", "=", card.id)
      .where("active_run_id", "=", card.run.id),
    eventInsert(db, card.id, actor(user), reason, now),
  ]);
}

async function appendEvent(
  env: RuntimeEnv,
  cardId: string,
  user: User,
  message: string,
  now: number,
): Promise<void> {
  const db = database(env);
  await executeBatch(env, [
    eventInsert(db, cardId, actor(user), message, now),
    db.updateTable("cards").set({ updated_at: now, last_event: message }).where("id", "=", cardId),
  ]);
}

async function audit(env: RuntimeEnv, user: User, message: string, now: number): Promise<void> {
  await database(env)
    .insertInto("audit_events")
    .values({ actor: actor(user), message, created_at: now })
    .execute();
}

function eventInsert(
  db: Kysely<Database>,
  cardId: string,
  actorName: string,
  message: string,
  now: number,
): CompilableQuery {
  return db
    .insertInto("events")
    .values({ card_id: cardId, actor: actorName, message, created_at: now });
}

async function githubFetch<T>(path: string, token: string): Promise<T> {
  const response = await fetch(`https://api.github.com${path}`, {
    headers: {
      ...githubHeaders(),
      authorization: `Bearer ${token}`,
    },
  });
  if (!response.ok) throw new GitHubApiError(response.status);
  return response.json<T>();
}

function githubHeaders(env?: RuntimeEnv): HeadersInit {
  return {
    accept: "application/vnd.github+json",
    ...(env?.GITHUB_TOKEN ? { authorization: `Bearer ${env.GITHUB_TOKEN}` } : {}),
    "user-agent": "crabyard-ai",
    "x-github-api-version": "2022-11-28",
  };
}

async function githubFetchPages<T>(path: string, token: string): Promise<T[]> {
  const rows: T[] = [];
  for (let page = 1; page <= 10; page += 1) {
    const separator = path.includes("?") ? "&" : "?";
    const batch = await githubFetch<T[]>(`${path}${separator}per_page=100&page=${page}`, token);
    rows.push(...batch);
    if (batch.length < 100) break;
  }
  return rows;
}

async function refreshGitHubUser(env: RuntimeEnv, token: string): Promise<User | null> {
  const org = env.GITHUB_ORG ?? "openclaw";
  const [githubUser, emails, membership, teamRows] = await Promise.all([
    githubFetch<GitHubProfile>("/user", token),
    githubFetch<Array<{ email: string; primary: boolean; verified: boolean }>>(
      "/user/emails",
      token,
    ).catch(() => []),
    githubFetch<{ state: string }>(`/user/memberships/orgs/${org}`, token).catch((error) => {
      if (error instanceof GitHubApiError && error.status === 404) return null;
      throw error;
    }),
    githubFetchPages<{ slug: string; organization?: { login?: string } }>("/user/teams", token),
  ]);
  if (membership?.state !== "active") return null;
  const email =
    githubUser.email ??
    emails.find((item) => item.primary && item.verified)?.email ??
    emails.find((item) => item.verified)?.email ??
    null;
  const teams = teamRows
    .filter((team) => (team.organization?.login ?? "").toLowerCase() === org.toLowerCase())
    .map((team) => `@${org}/${team.slug}`);
  return {
    subject: `github:${githubUser.id}`,
    login: githubUser.login,
    email,
    name: githubUser.name,
    role: "viewer",
    allowed: false,
    teams,
  };
}

class GitHubApiError extends Error {
  constructor(readonly status: number) {
    super(`GitHub API failed: ${status}`);
  }
}

function requireRole(user: User, needed: Role): void {
  const rank: Record<Role, number> = { viewer: 1, maintainer: 2, owner: 3 };
  if (rank[user.role] < rank[needed]) throw forbidden("insufficient role");
}

function strongerRole(left: Role | null, right: Role): Role {
  const rank: Record<Role, number> = { viewer: 1, maintainer: 2, owner: 3 };
  if (!left) return right;
  return rank[right] > rank[left] ? right : left;
}

function authMethods(env: RuntimeEnv): Record<string, boolean> {
  return {
    github: Boolean(env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET),
    token: Boolean(env.CRABYARD_BOOTSTRAP_TOKEN),
  };
}

function actor(user: User): string {
  return user.login ?? user.email ?? user.subject;
}

async function readJson<T>(request: Request): Promise<T> {
  try {
    return (await request.json()) as T;
  } catch {
    throw badRequest("invalid json");
  }
}

function parseJson<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function cardChanges(filesJson: string, patch: string): CardChanges {
  const files = parseJson<ChangedFile[]>(filesJson, []).filter(isChangedFile);
  return {
    files,
    patch,
    totals: {
      additions: files.reduce((sum, file) => sum + file.additions, 0),
      deletions: files.reduce((sum, file) => sum + file.deletions, 0),
      files: files.length,
    },
  };
}

function isChangedFile(value: unknown): value is ChangedFile {
  if (!value || typeof value !== "object") return false;
  const file = value as Partial<ChangedFile>;
  return (
    typeof file.path === "string" &&
    ["added", "deleted", "modified", "renamed"].includes(String(file.status)) &&
    typeof file.additions === "number" &&
    typeof file.deletions === "number"
  );
}

function runAttempt(row: RunAttemptTable): RunAttempt {
  return {
    id: row.id,
    cardId: row.card_id,
    attempt: row.attempt,
    runtime: row.runtime,
    status: row.status,
    controlIntent: row.control_intent,
    leaseId: row.lease_id,
    attachUrl: row.attach_url,
    vncUrl: row.vnc_url,
    selectionReason: row.selection_reason,
    capabilities: runtimeCapabilities(row.runtime, row.capabilities_json),
    operator: row.operator,
    lastHeartbeatAt: row.last_heartbeat_at,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    error: row.error,
  };
}

function interactiveSession(row: InteractiveSessionTable, logs: string[]): InteractiveSession {
  return {
    id: row.id,
    repo: row.repo,
    branch: row.branch,
    runtime: row.runtime,
    command: row.command,
    prompt: row.prompt,
    owner: row.owner,
    status: row.status,
    leaseId: row.lease_id,
    attachUrl: row.attach_url,
    vncUrl: row.vnc_url,
    lastEvent: row.last_event,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastSeenAt: row.last_seen_at,
    stoppedAt: row.stopped_at,
    shareMode: row.share_mode,
    shareTokenPreview: row.share_token_preview,
    controlRequestedBy: row.control_requested_by,
    controlRequestedAt: row.control_requested_at,
    controller: row.controller,
    controlGrantedAt: row.control_granted_at,
    controlExpiresAt: row.control_expires_at,
    logs,
  };
}

function decorateInteractiveSession(
  session: InteractiveSession,
  user?: User,
  env?: RuntimeEnv,
): InteractiveSession {
  if (!user) return session;
  const now = Date.now();
  const delegatedControl = env ? canGrantDelegatedControl(env, session) : true;
  const canManage = canManageInteractiveSession(user, session);
  const canControl = canControlInteractiveSession(user, session, now, delegatedControl);
  const activeController = activeDelegatedController(session, now);
  return {
    ...session,
    leaseId: canControl ? session.leaseId : null,
    attachUrl: canControl ? session.attachUrl : null,
    vncUrl: canControl ? session.vncUrl : null,
    controller: activeController,
    controlGrantedAt: activeController ? session.controlGrantedAt : null,
    controlExpiresAt: activeController ? session.controlExpiresAt : null,
    canManage,
    canControl,
    canRequestControl: delegatedControl && !canControl,
  };
}

function canManageInteractiveSession(user: User, session: InteractiveSession): boolean {
  const userActor = actor(user);
  return session.owner === userActor || user.role === "maintainer" || user.role === "owner";
}

function canControlInteractiveSession(
  user: User,
  session: InteractiveSession,
  now: number,
  delegatedControl = true,
): boolean {
  if (canManageInteractiveSession(user, session)) return true;
  if (!delegatedControl) return false;
  const userActor = actor(user);
  return (
    session.controller === userActor &&
    typeof session.controlExpiresAt === "number" &&
    session.controlExpiresAt > now
  );
}

function activeDelegatedController(session: InteractiveSession, now: number): string | null {
  if (!session.controller) return null;
  if (typeof session.controlExpiresAt !== "number" || session.controlExpiresAt <= now) return null;
  return session.controller;
}

async function canControlInteractiveSessionById(
  env: RuntimeEnv,
  user: User,
  id: string,
): Promise<boolean> {
  const row = await database(env)
    .selectFrom("interactive_sessions")
    .selectAll()
    .where("id", "=", id)
    .executeTakeFirst();
  if (!row) return false;
  const session = interactiveSession(row, []);
  if (["expired", "failed", "stopped"].includes(session.status)) return false;
  return canControlInteractiveSession(
    user,
    session,
    Date.now(),
    canGrantDelegatedControl(env, session),
  );
}

function canGrantDelegatedControl(env: RuntimeEnv, session: InteractiveSession): boolean {
  if (!env.SANDBOX && session.leaseId?.startsWith(sandboxLeasePrefix)) return false;
  return true;
}

function shareToken(): string {
  const first = crypto.randomUUID().replaceAll("-", "");
  const second = crypto.randomUUID().replaceAll("-", "");
  return `${first}${second}`;
}

function shareUrl(request: Request, id: string, token: string): string {
  const url = new URL(request.url);
  return `${url.origin}/app/sessions/${encodeURIComponent(id)}?token=${encodeURIComponent(token)}`;
}

function repoWorkflow(row: RepoWorkflowTable): RepoWorkflow {
  return {
    repo: row.repo,
    status: row.status,
    sourcePath: row.source_path,
    sourceSha: row.source_sha,
    config: parseJson<WorkflowConfig>(row.config_json, {}),
    prompt: row.prompt,
    error: row.error,
    evaluatedAt: row.evaluated_at,
    updatedAt: row.updated_at,
  };
}

function parseWorkflowMarkdown(markdown: string): {
  config: WorkflowConfig;
  prompt: string;
  error: string | null;
} {
  const match = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) return { config: {}, prompt: markdown.trim().slice(0, 8000), error: null };
  const raw = parseFrontmatter(match[1] ?? "");
  const config: WorkflowConfig = {};
  const runtime = optionalOneOf(
    raw.runtime ?? raw.runtime_default ?? raw["runtime.default"],
    runtimeOptions,
  );
  const policy = optionalOneOf(
    raw.policy ??
      raw.merge_policy ??
      raw.merge_default_policy ??
      raw["merge.default_policy"] ??
      raw["merge.policy"],
    mergePolicyOptions,
  );
  const stallMs = numberConfig(raw.stall_ms ?? raw.stallMs ?? raw["runtime.stall_ms"]);
  const cap = numberConfig(raw.cap);
  if (runtime) config.runtime = runtime;
  if (policy) config.policy = policy;
  if (stallMs) config.stallMs = stallMs;
  if (cap) config.cap = cap;
  if (raw.prompt_prefix) config.promptPrefix = clean(raw.prompt_prefix, 1000);
  const errors = workflowConfigErrors(raw, { runtime, policy, stallMs, cap });
  return {
    config,
    prompt: (match[2] ?? "").trim().slice(0, 8000),
    error: errors.length ? errors.join("; ") : null,
  };
}

function parseFrontmatter(value: string): Record<string, string> {
  const result: Record<string, string> = {};
  let section = "";
  for (const line of value.split(/\r?\n/)) {
    const match = line.match(/^(\s*)([A-Za-z][A-Za-z0-9_.-]*)\s*:\s*(.*?)\s*$/);
    if (!match) continue;
    const indent = match[1] ?? "";
    const key = match[2] ?? "";
    const value = scalar(match[3] ?? "");
    if (!indent && !value) {
      section = key;
      continue;
    }
    const normalized = indent && section ? `${section}.${key}` : key;
    result[normalized] = value;
    if (!indent) section = "";
  }
  return result;
}

function scalar(value: string): string {
  return value.trim().replace(/^['"]|['"]$/g, "");
}

function optionalOneOf<T extends string>(value: unknown, options: readonly T[]): T | undefined {
  return options.includes(value as T) ? (value as T) : undefined;
}

function numberConfig(value: unknown): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function resolveCardPolicy(value: unknown, workflow?: WorkflowConfig): string {
  const workflowPolicy = optionalOneOf(workflow?.policy, mergePolicyOptions);
  const fallback = workflowPolicy ?? "open_pr";
  if (
    value === undefined ||
    value === null ||
    value === "" ||
    value === "default" ||
    value === "repo_default"
  ) {
    return fallback;
  }
  const policy = optionalOneOf(value, mergePolicyOptions);
  if (!policy) throw badRequest("invalid merge policy");
  return policy;
}

function workflowConfigErrors(
  raw: Record<string, string>,
  parsed: {
    runtime: string | undefined;
    policy: string | undefined;
    stallMs: number | undefined;
    cap: number | undefined;
  },
): string[] {
  const errors: string[] = [];
  const runtime = raw.runtime ?? raw.runtime_default ?? raw["runtime.default"];
  const policy =
    raw.policy ??
    raw.merge_policy ??
    raw.merge_default_policy ??
    raw["merge.default_policy"] ??
    raw["merge.policy"];
  const stallMs = raw.stall_ms ?? raw.stallMs ?? raw["runtime.stall_ms"];
  const cap = raw.cap;
  if (runtime && !parsed.runtime) errors.push(`unsupported runtime ${runtime}`);
  if (policy && !parsed.policy) errors.push(`unsupported merge policy ${policy}`);
  if (stallMs && !parsed.stallMs) errors.push(`invalid stall_ms ${stallMs}`);
  if (cap && !parsed.cap) errors.push(`invalid cap ${cap}`);
  return errors;
}

function selectRuntimeDescriptor(
  card: Pick<Card, "runtime" | "prompt">,
  workflow?: WorkflowConfig,
): RuntimeDescriptor {
  if (card.runtime === "crabbox") {
    return runtimeDescriptor("crabbox", "card runtime override");
  }
  if (card.runtime === "container") {
    return runtimeDescriptor("container", "card runtime override");
  }
  const needsCrabbox = /\b(vnc|manual|takeover|gpu|perf|performance)\b/i.test(card.prompt);
  if (needsCrabbox) {
    return runtimeDescriptor("crabbox", "prompt requires desktop/manual/perf capability");
  }
  if (workflow?.runtime === "crabbox") {
    return runtimeDescriptor("crabbox", "repo CRABYARD.md runtime default");
  }
  if (workflow?.runtime === "container") {
    return runtimeDescriptor("container", "repo CRABYARD.md runtime default");
  }
  return runtimeDescriptor("container", "default container runtime");
}

function runtimeDescriptor(
  runtime: RuntimeDescriptor["runtime"],
  reason: string,
): RuntimeDescriptor {
  return {
    runtime,
    reason,
    capabilities: runtime === "crabbox" ? crabboxCapabilities : containerCapabilities,
  };
}

function runtimeCapabilities(runtime: string, value: string): RuntimeCapabilities {
  const fallback = runtime === "crabbox" ? crabboxCapabilities : containerCapabilities;
  const parsed = parseJson<Partial<RuntimeCapabilities>>(value, fallback);
  return {
    terminal: booleanCapability(parsed.terminal, fallback.terminal),
    takeover: booleanCapability(parsed.takeover, fallback.takeover),
    vnc: booleanCapability(parsed.vnc, fallback.vnc),
    desktop: booleanCapability(parsed.desktop, fallback.desktop),
    logs: booleanCapability(parsed.logs, fallback.logs),
    artifacts: booleanCapability(parsed.artifacts, fallback.artifacts),
  };
}

function booleanCapability(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function stallThresholdMs(settings: Record<string, string>): number {
  const parsed = Number(settings.stall_ms);
  return Number.isFinite(parsed) && parsed >= 60_000 ? parsed : defaultStallMs;
}

function systemUser(): User {
  return {
    subject: "system:crabyard",
    login: "system",
    email: null,
    name: "Crabyard",
    role: "owner",
    allowed: true,
    teams: [],
  };
}

function cookies(request: Request): Map<string, string> {
  const result = new Map<string, string>();
  for (const part of (request.headers.get("cookie") ?? "").split(";")) {
    const index = part.indexOf("=");
    if (index === -1) continue;
    result.set(part.slice(0, index).trim(), decodeURIComponent(part.slice(index + 1).trim()));
  }
  return result;
}

function cookie(name: string, value: string, maxAge: number): string {
  return `${name}=${encodeURIComponent(value)}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${maxAge}`;
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function bootstrapSubject(env: RuntimeEnv): Promise<string> {
  if (!env.CRABYARD_BOOTSTRAP_TOKEN) throw unauthorized();
  return `bootstrap:${(await sha256(env.CRABYARD_BOOTSTRAP_TOKEN)).slice(0, 24)}`;
}

function normalizeRepo(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/^https:\/\/github\.com\//, "")
    .replace(/\.git$/, "")
    .replace(/\/+$/, "");
}

function normalizeAllow(value: unknown): string {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  if (raw.includes("@")) return raw.toLowerCase();
  return `@${raw.toLowerCase()}`;
}

function clean(value: unknown, max: number): string {
  return String(value ?? "")
    .trim()
    .slice(0, max);
}

function decodeHeaderValue(value: string | null): string {
  if (!value) return "";
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function base64FromBytes(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

function safeClipboardFilename(value: unknown, mediaType: string): string {
  const raw =
    String(value ?? "")
      .split(/[\\/]/)
      .pop() || "";
  const base = clean(raw || `clipboard${clipboardExtension(mediaType)}`, 90)
    .replace(/[^A-Za-z0-9._-]/g, "-")
    .replace(/^-+/, "")
    .replace(/-+/g, "-");
  const fallback = `clipboard${clipboardExtension(mediaType)}`;
  const name = base || fallback;
  return name.includes(".") ? name : `${name}${clipboardExtension(mediaType)}`;
}

function clipboardExtension(mediaType: string): string {
  const normalized = (mediaType.toLowerCase().split(";")[0] ?? "").trim();
  return (
    {
      "image/png": ".png",
      "image/jpeg": ".jpg",
      "image/gif": ".gif",
      "image/webp": ".webp",
      "text/plain": ".txt",
      "text/markdown": ".md",
      "application/json": ".json",
      "application/pdf": ".pdf",
    }[normalized] || ".bin"
  );
}

function joinUrl(base: string, path: string): string {
  try {
    return new URL(path, base.endsWith("/") ? base : `${base}/`).toString();
  } catch {
    return "";
  }
}

function addQuery(rawUrl: string, params: Record<string, string>): string {
  try {
    const url = new URL(rawUrl);
    for (const [key, value] of Object.entries(params)) {
      if (value) url.searchParams.set(key, value);
    }
    return url.toString();
  } catch {
    return "";
  }
}

function httpToWebSocketUrl(rawUrl: string): string {
  try {
    const url = new URL(rawUrl);
    if (url.protocol === "http:") url.protocol = "ws:";
    if (url.protocol === "https:") url.protocol = "wss:";
    return url.toString();
  } catch {
    return "";
  }
}

function bearer(token: string | undefined): string | null {
  return token ? `Bearer ${token}` : null;
}

function sandboxIdForSession(id: string): string {
  return clean(`crabyard-${id}`.toLowerCase().replace(/[^a-z0-9_-]/g, "-"), 63);
}

function sandboxTerminalSessionId(id: string): string {
  return clean(`terminal-${id}`.toLowerCase().replace(/[^a-z0-9_-]/g, "-"), 80);
}

function sandboxWorkdir(id: string): string {
  return `/workspace/${sandboxIdForSession(id)}`;
}

function sandboxStartupScriptPath(
  session: Pick<InteractiveSession | InteractiveProvisionRequest, "id">,
): string {
  return `/workspace/.crabyard-start-${sandboxIdForSession(session.id)}.sh`;
}

function terminalSize(request: Request, name: "cols" | "rows", fallback: number): number {
  const url = new URL(request.url);
  const value = Number(url.searchParams.get(name));
  if (!Number.isFinite(value)) return fallback;
  return Math.min(300, Math.max(10, Math.trunc(value)));
}

function terminalDimension(value: number | null, fallback: number): number {
  if (!Number.isFinite(value ?? Number.NaN)) return fallback;
  return Math.min(300, Math.max(10, Math.trunc(value as number)));
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\"'\"'")}'`;
}

function shellFirstWord(command: string): string {
  return shellQuote(command.trim().split(/\s+/, 1)[0] || "codex");
}

function directPortUrl(base: string, port: unknown, path: string): string | null {
  const parsedPort = Number(port);
  if (!Number.isInteger(parsedPort) || parsedPort <= 0) return null;
  try {
    const url = new URL(path, base.endsWith("/") ? base : `${base}/`);
    url.port = String(parsedPort);
    return url.toString();
  } catch {
    return null;
  }
}

function titleFromPrompt(prompt: string): string {
  const line = prompt
    .split(/\r?\n/)
    .map((part) => part.trim())
    .find(Boolean);
  return clean(line?.replace(/^#+\s*/, ""), 140) || "Untitled card";
}

function oneOf<T extends string>(value: unknown, options: readonly T[], fallback: T): T {
  return options.includes(value as T) ? (value as T) : fallback;
}

function decodeBase64Text(value: string): string {
  const binary = atob(value.replace(/\s+/g, ""));
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function numberSetting(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function sortRepos(repos: string[]): string[] {
  return [...repos].sort(sortRepoNames);
}

function sortRepoNames(left: string, right: string): number {
  if (left === preferredRepo) return -1;
  if (right === preferredRepo) return 1;
  return left.localeCompare(right);
}

function isConstraintError(error: unknown): boolean {
  return error instanceof Error && /constraint|unique/i.test(error.message);
}

function wantsMarkdown(request: Request): boolean {
  const accept = request.headers.get("accept") ?? "";
  return accept.includes("text/markdown");
}

function text(
  body: string,
  contentType: string,
  extraHeaders: HeadersInit = {},
  status = 200,
): Response {
  return new Response(body, {
    status,
    headers: {
      ...securityHeaders(contentType),
      ...extraHeaders,
      "content-length": String(encoder.encode(body).byteLength),
    },
  });
}

function json(body: unknown, init: ResponseInit & { headers?: HeadersInit } = {}): Response {
  const textBody = JSON.stringify(body);
  return new Response(textBody, {
    ...init,
    headers: {
      ...securityHeaders("application/json; charset=utf-8", false),
      ...init.headers,
      "content-length": String(encoder.encode(textBody).byteLength),
    },
  });
}

function redirect(location: string, headers: HeadersInit = {}): Response {
  return new Response(null, {
    status: 302,
    headers: {
      location,
      ...headers,
    },
  });
}

function securityHeaders(contentType: string, cache = true): HeadersInit {
  return {
    "content-type": contentType,
    "x-content-type-options": "nosniff",
    "referrer-policy": "no-referrer",
    "cache-control": cache ? "public, max-age=300" : "no-store",
  };
}

function base64Bytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function unauthorized(): Error {
  return Object.assign(new Error("unauthorized"), { status: 401 });
}

function forbidden(message: string): Error {
  return Object.assign(new Error(message), { status: 403 });
}

function serviceUnavailable(message: string): Error {
  return Object.assign(new Error(message), { status: 503 });
}

function badRequest(message: string): Error {
  return Object.assign(new Error(message), { status: 400 });
}

function notFound(message: string): Error {
  return Object.assign(new Error(message), { status: 404 });
}
