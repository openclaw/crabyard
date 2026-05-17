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
import {
  APP_HTML,
  GHOSTTY_BROWSER_EXTERNAL_JS,
  GHOSTTY_WEB_JS,
  LOGO_PNG_BASE64,
  SPEC_HTML,
  SPEC_MARKDOWN,
} from "./generated";

type Role = "viewer" | "maintainer" | "owner";

type RuntimeEnv = Env & {
  DB: D1Database;
  CRABYARD_BOOTSTRAP_TOKEN?: string;
  GITHUB_CLIENT_ID?: string;
  GITHUB_CLIENT_SECRET?: string;
  GITHUB_TOKEN?: string;
  GITHUB_ORG?: string;
};

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
  operator: string | null;
  lastHeartbeatAt: number;
  startedAt: number | null;
  endedAt: number | null;
  createdAt: number;
  updatedAt: number;
  error: string | null;
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
  operator: string | null;
  last_heartbeat_at: number;
  started_at: number | null;
  ended_at: number | null;
  created_at: number;
  updated_at: number;
  error: string | null;
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
const lanes = ["Todo", "Running", "Human Review", "Done"];
const preferredRepo = "openclaw/openclaw";
const activeRunStatuses: readonly RunStatus[] = ["queued", "leasing", "running"];
const runtimeOptions = ["auto", "container", "crabbox"] as const;
const mergePolicyOptions = ["open_pr", "merge_when_green", "fix_until_green_and_merge"] as const;
const defaultStallMs = 5 * 60 * 1000;
const workflowCacheMs = 60 * 60 * 1000;

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

      if (url.pathname === "/" || url.pathname === "/app" || url.pathname === "/app/") {
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

async function readState(env: RuntimeEnv, user: User): Promise<Record<string, unknown>> {
  await reconcileStalledRuns(env, Date.now());
  const db = database(env);
  const [settings, allow, repos, cards, workflows] = await Promise.all([
    readSettings(env),
    user.role === "owner"
      ? db.selectFrom("allow_entries").select(["value", "role"]).orderBy("value").execute()
      : Promise.resolve([]),
    db.selectFrom("repos").select("repo").where("enabled", "=", 1).orderBy("repo").execute(),
    readCards(env),
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
  };
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
  const runtime = selectRuntime(currentCard, workflowConfig);
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
      runtime,
      status: "queued",
      control_intent: null,
      lease_id: null,
      attach_url: null,
      vnc_url: null,
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
    `runtime=${runtime} policy=${currentCard.policy} workflow=${workflow?.status ?? "unseen"}`,
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
    if (card.run) {
      await database(env)
        .updateTable("run_attempts")
        .set({ operator: actor(user), control_intent: "takeover", updated_at: now })
        .where("id", "=", card.run.id)
        .execute();
    }
    await appendEvent(env, card.id, user, "operator takeover granted", now);
    return { card: (await readCard(env, id)) as Card };
  }

  if (action === "stall") {
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
  const updates: CompilableQuery[] = [
    db
      .updateTable("cards")
      .set({
        lane: "Human Review",
        updated_at: now,
        last_event: "stalled; workspace preserved",
      })
      .where("id", "=", card.id),
    eventInsert(db, card.id, actor(user), reason, now),
  ];
  if (card.run) {
    updates.push(
      db
        .updateTable("run_attempts")
        .set({
          status: "stalled",
          ended_at: now,
          updated_at: now,
          error: reason,
        })
        .where("id", "=", card.run.id),
    );
  }
  await executeBatch(env, updates);
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
    operator: row.operator,
    lastHeartbeatAt: row.last_heartbeat_at,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    error: row.error,
  };
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

function selectRuntime(card: Pick<Card, "runtime" | "prompt">, workflow?: WorkflowConfig): string {
  if (card.runtime === "crabbox" || card.runtime === "container") return card.runtime;
  const needsCrabbox = /\b(vnc|manual|takeover|gpu|perf|performance)\b/i.test(card.prompt);
  if (needsCrabbox) return "crabbox";
  if (workflow?.runtime === "crabbox" || workflow?.runtime === "container") {
    return workflow.runtime;
  }
  return "container";
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
