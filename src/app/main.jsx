import { render } from "preact";
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { api } from "./api.js";
import {
  canMaintain,
  canOwn,
  elapsed,
  hasRunCapability,
  issueNumber,
  isActiveRun,
  lanes,
  optimisticInteractiveSession,
  preferredRepo,
  preferredRepos,
  runCapabilities,
  runtimeCapabilityLabel,
  sessionItems,
  statusLabel,
  titleFromPrompt,
} from "./utils.js";
import {
  configureTerminalHub,
  copyTerminalSelection,
  disposeAllTerminals,
  disposeTerminal,
  disposeMissingTerminals,
  mountTerminal,
  pasteClipboardFile,
  pasteClipboardText,
  warmGhosttyModule,
} from "./terminal.js";

const logo = "__CRABYARD_LOGO__";
const loginReturnKey = "crabyard-login-return";
const sessionLayoutStorageKey = "crabyard-session-layout-v1";
const emptyState = {
  cards: [],
  interactiveSessions: [],
  allow: [],
  repos: [],
  workflows: [],
  cap: 20,
  retention: "30",
  merge: "guarded",
};

function App() {
  const initialSessionLink = useMemo(() => {
    restoreSessionReturnUrl();
    return parseSessionLink();
  }, []);
  const [state, setState] = useState(emptyState);
  const [signedIn, setSignedIn] = useState(false);
  const [authMethods, setAuthMethods] = useState({ github: false, token: false });
  const [loginMessage, setLoginMessage] = useState("");
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [drawers, setDrawers] = useState({});
  const [activeRunId, setActiveRunId] = useState(null);
  const [focusedSessionId, setFocusedSessionId] = useState(initialSessionLink.id);
  const [sharedSessionId, setSharedSessionId] = useState(initialSessionLink.id);
  const [sharedToken, setSharedToken] = useState(initialSessionLink.token);
  const [initialSessionOpened, setInitialSessionOpened] = useState(false);
  const [refPreview, setRefPreview] = useState({
    number: "",
    loading: false,
    matches: [],
    error: "",
  });
  const [theme, setThemeState] = useState(
    document.documentElement.dataset.theme === "light" ? "light" : "dark",
  );
  const [sessionLayout, setSessionLayout] = useState(loadSessionLayout);
  const [terminalStatus, setTerminalStatus] = useState({});
  const stateRef = useRef(state);
  const authMethodsRef = useRef(authMethods);
  const signedInRef = useRef(signedIn);
  const activeRunIdRef = useRef(activeRunId);
  const focusedSessionIdRef = useRef(focusedSessionId);
  const drawersRef = useRef(drawers);
  const sharedRef = useRef({ id: sharedSessionId, token: sharedToken });
  const stateRetryTimer = useRef(null);
  const refPreviewTimer = useRef(null);
  const refPreviewSeq = useRef(0);
  const draggedSessionId = useRef(null);

  const allSessionItems = useMemo(() => sessionItems(state), [state]);
  const sessionItemById = useMemo(
    () => new Map(allSessionItems.map((item) => [item.id, item])),
    [allSessionItems],
  );

  stateRef.current = state;
  authMethodsRef.current = authMethods;
  signedInRef.current = signedIn;
  activeRunIdRef.current = activeRunId;
  focusedSessionIdRef.current = focusedSessionId;
  drawersRef.current = drawers;
  sharedRef.current = { id: sharedSessionId, token: sharedToken };

  useEffect(() => {
    void loadState();
    const interval = setInterval(() => {
      if (signedInRef.current) {
        void loadState();
        return;
      }
      const shared = sharedRef.current;
      if (shared.id && shared.token && !document.body.classList.contains("locked")) {
        loadSharedSession().catch((error) => {
          if (error.status === 403 || error.status === 404) {
            void showSharedLinkError(error);
            return;
          }
          console.warn("Shared session refresh failed", error);
        });
      }
    }, 15000);
    return () => {
      clearInterval(interval);
      if (stateRetryTimer.current) clearTimeout(stateRetryTimer.current);
      if (refPreviewTimer.current) clearTimeout(refPreviewTimer.current);
      disposeAllTerminals();
    };
  }, []);

  useEffect(() => {
    document.documentElement.dataset.appRuntime = "preact";
    document.body.classList.toggle("locked", !signedIn && !(sharedSessionId && sharedToken));
  }, [signedIn, sharedSessionId, sharedToken]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem("crabyard-theme", theme);
    } catch {}
  }, [theme]);

  useEffect(() => {
    configureTerminalHub({
      sharedSessionId,
      sharedToken,
      sessions: () => sessionItems(stateRef.current),
      onStatus: (id, label) =>
        setTerminalStatus((current) => {
          if (current[id] === label) return current;
          return { ...current, [id]: label };
        }),
    });
  }, [sharedSessionId, sharedToken, state]);

  useEffect(() => {
    if (!sharedSessionId) return;
    void openInitialSessionLink();
  }, [sharedSessionId, signedIn, state.interactiveSessions]);

  async function loadState() {
    try {
      const nextState = await api("/api/state", { authOptional: true });
      const activeRunId = activeRunIdRef.current;
      const activeCard = nextState.cards.find((card) => card.id === activeRunId);
      if (activeRunId && drawersRef.current.run && activeCard?.changes?.files?.length) {
        const result = await api(`/api/cards/${encodeURIComponent(activeRunId)}/actions`, {
          method: "POST",
          body: { action: "attach" },
        });
        nextState.cards = nextState.cards.map((card) =>
          card.id === result.card.id ? result.card : card,
        );
      }
      if (stateRetryTimer.current) clearTimeout(stateRetryTimer.current);
      stateRetryTimer.current = null;
      setAuthMethods(nextState.auth || authMethodsRef.current);
      setState(nextState);
      setSignedIn(true);
      setLoginMessage("");
    } catch (error) {
      if (error.status === 401 || error.status === 403) {
        const shared = sharedRef.current;
        if (shared.id && shared.token) {
          try {
            await loadSharedSession();
          } catch (sharedError) {
            await showSharedLinkError(sharedError);
          }
          return;
        }
        await loadAuthMethods();
        setSignedIn(false);
        setLoginMessage(error.message === "unauthorized" ? "" : error.message);
        return;
      }
      setLoginMessage(error.message);
      stateRetryTimer.current ||= setTimeout(() => {
        stateRetryTimer.current = null;
        void loadState();
      }, 5000);
    }
  }

  async function loadSharedSession() {
    const result = await api(
      `/api/shared-sessions/${encodeURIComponent(sharedSessionId)}?token=${encodeURIComponent(sharedToken)}`,
      { authOptional: true },
    );
    await loadAuthMethods();
    setState({
      user: { subject: "shared", login: "shared link", role: "viewer" },
      auth: authMethods,
      org: "OpenClaw",
      cap: 20,
      retention: "30",
      merge: "guarded",
      allow: [],
      repos: [result.session.repo],
      workflows: [],
      cards: [],
      interactiveSessions: [result.session],
    });
    setSignedIn(false);
    setFocusedSessionId(result.session.id);
    openSessionGrid(result.session.id, { deepLink: true });
  }

  async function loadLinkedInteractiveSession(id) {
    const result = await api(`/api/interactive-sessions/${encodeURIComponent(id)}`);
    upsertInteractiveSession(result.session);
    setInitialSessionOpened(true);
    setFocusedSessionId(result.session.id);
    openSessionGrid(result.session.id, { deepLink: true });
  }

  async function showSharedLinkError(error) {
    await loadAuthMethods();
    setSharedSessionId(null);
    setSharedToken(null);
    setFocusedSessionId(null);
    setInitialSessionOpened(true);
    setSessionUrl(null);
    setSignedIn(false);
    setLoginMessage(
      error?.status === 404
        ? "Shared session link is invalid or expired."
        : error?.message || "Shared session could not be loaded.",
    );
  }

  async function loadAuthMethods() {
    try {
      const result = await api("/api/auth", { authOptional: true });
      const methods = result.auth || authMethodsRef.current;
      setAuthMethods(methods);
      return methods;
    } catch {
      const methods = { github: false, token: true };
      setAuthMethods(methods);
      return methods;
    }
  }

  async function openInitialSessionLink() {
    if (!sharedSessionId) return;
    if (!findInteractiveSession(sharedSessionId)) {
      if (signedIn && (!initialSessionOpened || focusedSessionId === sharedSessionId)) {
        try {
          await loadLinkedInteractiveSession(sharedSessionId);
        } catch (error) {
          if (error.status !== 403 && error.status !== 404) throw error;
          setSharedSessionId(null);
          setSharedToken(null);
          setFocusedSessionId(null);
          setInitialSessionOpened(true);
          setSessionUrl(null);
        }
      } else if (!signedIn && sharedToken && !document.body.classList.contains("locked")) {
        await loadSharedSession();
      } else if (!initialSessionOpened) {
        setSessionUrl(null);
      }
      return;
    }
    if (initialSessionOpened && focusedSessionId !== sharedSessionId) return;
    setInitialSessionOpened(true);
    setFocusedSessionId(sharedSessionId);
    openSessionGrid(sharedSessionId);
  }

  function findCard(id) {
    return stateRef.current.cards.find((card) => card.id === id);
  }

  function findInteractiveSession(id) {
    return (stateRef.current.interactiveSessions || []).find((session) => session.id === id);
  }

  function upsertCard(card) {
    setState((current) => ({
      ...current,
      cards: current.cards.map((item) => (item.id === card.id ? card : item)),
    }));
  }

  function upsertInteractiveSession(session) {
    setState((current) => {
      const sessions = current.interactiveSessions || [];
      return {
        ...current,
        interactiveSessions: sessions.some((item) => item.id === session.id)
          ? sessions.map((item) => (item.id === session.id ? session : item))
          : [session, ...sessions],
      };
    });
  }

  function removeInteractiveSession(id) {
    setState((current) => ({
      ...current,
      interactiveSessions: (current.interactiveSessions || []).filter(
        (session) => session.id !== id,
      ),
    }));
  }

  function openDrawer(id) {
    setDrawers((current) => ({ ...current, [id]: true }));
  }

  function closeDrawer(id) {
    setDrawers((current) => ({ ...current, [id]: false }));
    if (id === "run") setActiveRunId(null);
    if (id === "sessions") {
      setFocusedSessionId(null);
      if (!sharedToken) setSessionUrl(null);
      disposeAllTerminals();
    }
  }

  function closeAllDrawers() {
    setDrawers({});
    setActiveRunId(null);
    setFocusedSessionId(null);
    if (!sharedToken) setSessionUrl(null);
    disposeAllTerminals();
  }

  function closeTopDrawer() {
    const order = ["card", "interactive", "run", "sessions", "admin"];
    const id = order.findLast((key) => drawers[key]);
    if (!id) return false;
    closeDrawer(id);
    return true;
  }

  function showSessionGrid() {
    setFocusedSessionId(null);
    if (!sharedToken) setSessionUrl(null);
  }

  function openSessionGrid(id, options = {}) {
    const targetId = id === undefined ? focusedSessionIdRef.current : id;
    if (targetId) setFocusedSessionId(targetId);
    else if (id === null) setFocusedSessionId(null);
    const deepLink =
      options.deepLink ??
      Boolean(targetId && sessionItemById.get(targetId)?.kind === "interactive");
    const urlSessionId =
      targetId && deepLink && !String(targetId).startsWith("LOCAL-") ? targetId : null;
    if (urlSessionId || !sharedToken) setSessionUrl(urlSessionId);
    warmGhosttyModule();
    setDrawers((current) => ({ ...current, sessions: true }));
  }

  function setSessionUrl(id) {
    if (!history.replaceState) return;
    if (id) {
      const url = new URL(location.href);
      url.pathname = `/app/sessions/${encodeURIComponent(id)}`;
      url.search = "";
      if (sharedToken && id === sharedSessionId) url.searchParams.set("token", sharedToken);
      history.replaceState(null, "", url);
      return;
    }
    const url = new URL(location.href);
    url.pathname = "/app";
    url.search = "";
    history.replaceState(null, "", url);
  }

  function setTheme(value) {
    setThemeState(value === "light" ? "light" : "dark");
  }

  async function beginLogin() {
    try {
      if (sharedSessionId) sessionStorage.setItem(loginReturnKey, location.href);
    } catch {}
    let methods = authMethods;
    if (!methods.github && !methods.token) methods = await loadAuthMethods();
    if (methods.github) {
      location.href = "/login/github";
      return;
    }
    setLoginMessage("Sign in to request terminal control.");
  }

  async function tokenLogin(token) {
    try {
      await api("/api/login/token", { method: "POST", body: { token }, authOptional: true });
      await loadState();
    } catch (error) {
      setLoginMessage(String(error.message || error));
    }
  }

  async function logout() {
    await api("/api/logout", { method: "POST", authOptional: true });
    await loadState();
  }

  async function cardAction(id, action) {
    const result = await api(`/api/cards/${encodeURIComponent(id)}/actions`, {
      method: "POST",
      body: { action },
    });
    upsertCard(result.card);
  }

  async function attachCard(id) {
    const result = await api(`/api/cards/${encodeURIComponent(id)}/actions`, {
      method: "POST",
      body: { action: "attach" },
    });
    upsertCard(result.card);
    openSessionGrid(id);
  }

  async function interactiveSessionAction(id, action) {
    const result = await api(`/api/interactive-sessions/${encodeURIComponent(id)}/actions`, {
      method: "POST",
      body: { action },
    });
    upsertInteractiveSession(result.session);
    if (action === "stop") return result;
    openSessionGrid(id, { deepLink: true });
    return result;
  }

  async function shareInteractiveSession(id) {
    const result = await interactiveSessionAction(id, "share_link");
    if (!result.shareUrl) return;
    let copied = false;
    try {
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(result.shareUrl);
        copied = true;
      }
    } catch {}
    if (!copied) window.prompt("Copy share link", result.shareUrl);
  }

  async function openRunDetails(id) {
    closeDrawer("sessions");
    setActiveRunId(id);
    let card = findCard(id);
    if (!card) return;
    try {
      const result = await api(`/api/cards/${encodeURIComponent(id)}/actions`, {
        method: "POST",
        body: { action: "attach" },
      });
      upsertCard(result.card);
      card = result.card;
    } catch (error) {
      setLoginMessage(error.message);
      return;
    }
    openDrawer("run");
  }

  function scheduleRefPreview(value) {
    const number = issueNumber(value);
    refPreviewSeq.current += 1;
    if (refPreviewTimer.current) clearTimeout(refPreviewTimer.current);
    if (!number) {
      setRefPreview({ number: "", loading: false, matches: [], error: "" });
      return;
    }
    setRefPreview({ number, loading: true, matches: [], error: "" });
    const seq = refPreviewSeq.current;
    refPreviewTimer.current = setTimeout(() => loadRefPreview(number, seq), 220);
  }

  async function loadRefPreview(number, seq) {
    try {
      const result = await api(`/api/github/refs?number=${encodeURIComponent(number)}`);
      if (seq !== refPreviewSeq.current) return;
      setRefPreview({ number, loading: false, matches: result.matches || [], error: "" });
    } catch (error) {
      if (seq !== refPreviewSeq.current) return;
      setRefPreview({
        number,
        loading: false,
        matches: [],
        error: error.message || "GitHub lookup failed",
      });
    }
  }

  async function createRefCard(index) {
    const match = refPreview.matches[index];
    if (!match) return;
    await api("/api/cards", {
      method: "POST",
      body: {
        title: `${match.repo}#${match.number}: ${match.title}`,
        prompt: `${match.source} ${match.url}\n\n${match.title}\n\n${match.body || ""}`,
        repo: match.repo,
        source: match.source,
        runtime: "auto",
        policy: "",
      },
    });
    setRefPreview({ number: "", loading: false, matches: [], error: "" });
    setSearch("");
    await loadState();
  }

  async function createCard(form) {
    const data = new FormData(form);
    await api("/api/cards", {
      method: "POST",
      body: {
        title: data.get("title") || titleFromPrompt(data.get("prompt")),
        prompt: data.get("prompt"),
        repo: data.get("repo"),
        source: data.get("source"),
        runtime: data.get("runtime"),
        policy: data.get("policy"),
      },
    });
    form.reset();
    closeDrawer("card");
    await loadState();
  }

  async function createInteractiveSession(form) {
    const data = new FormData(form);
    const optimistic = optimisticInteractiveSession(data, state.user?.login);
    upsertInteractiveSession(optimistic);
    closeDrawer("interactive");
    setFocusedSessionId(optimistic.id);
    openSessionGrid(optimistic.id);
    try {
      const result = await api("/api/interactive-sessions", {
        method: "POST",
        body: {
          repo: data.get("repo"),
          branch: data.get("branch"),
          runtime: data.get("runtime"),
          command: data.get("command"),
          prompt: data.get("prompt"),
        },
      });
      removeInteractiveSession(optimistic.id);
      upsertInteractiveSession(result.session);
      form.reset();
      form.elements.branch.value = "main";
      form.elements.command.value = "codex --dangerously-bypass-approvals-and-sandbox";
      setFocusedSessionId(result.session.id);
      openSessionGrid(result.session.id, { deepLink: true });
    } catch (error) {
      upsertInteractiveSession({
        ...optimistic,
        status: "failed",
        lastEvent: error.message || "session creation failed",
        logs: [error.message || "session creation failed"],
      });
      setLoginMessage(error.message || "session creation failed");
    }
  }

  async function addAllow(value, role) {
    setState(await api("/api/admin/allow", { method: "POST", body: { value, role } }));
  }

  async function removeAllow(value) {
    setState(await api(`/api/admin/allow/${encodeURIComponent(value)}`, { method: "DELETE" }));
  }

  async function addRepo(repo) {
    setState(await api("/api/admin/repos", { method: "POST", body: { repo } }));
  }

  async function removeRepo(repo) {
    setState(await api(`/api/admin/repos/${encodeURIComponent(repo)}`, { method: "DELETE" }));
  }

  async function refreshWorkflow(repo) {
    setState(await api("/api/admin/workflows/evaluate", { method: "POST", body: { repo } }));
  }

  async function updatePolicy(policy) {
    setState(await api("/api/admin/policy", { method: "PUT", body: policy }));
  }

  function updateSessionLayout(updater) {
    setSessionLayout((current) => {
      const next = typeof updater === "function" ? updater(current) : updater;
      saveSessionLayout(next);
      return next;
    });
  }

  const props = {
    state,
    signedIn,
    authMethods,
    loginMessage,
    filter,
    setFilter,
    search,
    setSearch: (value) => {
      setSearch(value);
      scheduleRefPreview(value);
    },
    drawers,
    activeRunId,
    focusedSessionId,
    setFocusedSessionId,
    showSessionGrid,
    refPreview,
    theme,
    terminalStatus,
    sessionLayout,
    setSessionLayout: updateSessionLayout,
    draggedSessionId,
    allSessionItems,
    sessionItemById,
    openDrawer,
    closeDrawer,
    closeAllDrawers,
    closeTopDrawer,
    openSessionGrid,
    beginLogin,
    tokenLogin,
    logout,
    setTheme,
    cardAction,
    attachCard,
    interactiveSessionAction,
    shareInteractiveSession,
    openRunDetails,
    createRefCard,
    createCard,
    createInteractiveSession,
    addAllow,
    removeAllow,
    addRepo,
    removeRepo,
    refreshWorkflow,
    updatePolicy,
  };

  return <CrabyardApp {...props} />;
}

function CrabyardApp(props) {
  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key !== "Escape" || event.isComposing || isTerminalKeyTarget(event)) return;
      if (props.closeTopDrawer()) event.preventDefault();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [props.drawers]);

  return (
    <>
      <LoginScreen
        hidden={props.signedIn || (props.state.user?.subject === "shared" && !props.loginMessage)}
        authMethods={props.authMethods}
        message={props.loginMessage}
        onGithub={props.beginLogin}
        onToken={props.tokenLogin}
      />
      <AppShell {...props} />
      <CardDrawer {...props} />
      <InteractiveDrawer {...props} />
      <RunDrawer {...props} />
      <SessionsDrawer {...props} />
      <AdminDrawer {...props} />
    </>
  );
}

function LoginScreen({ hidden, authMethods, message, onGithub, onToken }) {
  const [token, setToken] = useState("");
  return (
    <section class="login-screen" hidden={hidden}>
      <form
        class="login-panel"
        onSubmit={(event) => {
          event.preventDefault();
          void onToken(token);
          setToken("");
        }}
      >
        <div class="mark">
          <img src={logo} alt="" />
        </div>
        <h1>Crabyard.ai</h1>
        <p>Sign in to manage OpenClaw Codex runs, repo allowlists, and runtime policy.</p>
        <div class="login-actions">
          <button
            class="primary"
            type="button"
            hidden={!authMethods.github}
            disabled={!authMethods.github}
            onClick={onGithub}
          >
            Continue with GitHub
          </button>
          <label>
            Bootstrap token
            <input
              type="password"
              autocomplete="current-password"
              disabled={!authMethods.token}
              value={token}
              onInput={(event) => setToken(event.currentTarget.value)}
            />
          </label>
          <button type="submit" disabled={!authMethods.token}>
            Use token
          </button>
        </div>
        <div class={`banner ${message ? "show" : ""}`}>{message}</div>
        <div class="login-footer">
          <a href="/docs/">Documentation</a>
        </div>
      </form>
    </section>
  );
}

function AppShell(props) {
  const active = props.state.cards.filter((card) => card.lane === "Running").length;
  const queue = props.state.cards.filter((card) => card.lane === "Todo").length;
  const review = props.state.cards.filter((card) => card.lane === "Human Review").length;
  const cli = (props.state.interactiveSessions || []).filter((session) =>
    ["provisioning", "pending_adapter", "ready", "attached", "detached"].includes(session.status),
  ).length;
  const user = props.state.user;
  const userLabel =
    !props.signedIn && user?.subject === "shared"
      ? "Sign in for control"
      : user
        ? `${user.login || user.email || user.subject} / ${user.role}`
        : "Signed out";
  return (
    <div class="app">
      <aside class="rail" aria-label="Primary">
        <div class="mark" title="Crabyard.ai">
          <img src={logo} alt="" />
        </div>
        <button class="active" title="Board" aria-label="Board" onClick={props.closeAllDrawers}>
          <Icon name="layout-grid" />
        </button>
        <button
          title="Admin"
          aria-label="Admin"
          disabled={!canOwn(user)}
          onClick={() => props.openDrawer("admin")}
        >
          <Icon name="settings" />
        </button>
        <button title="Logs" aria-label="Logs" onClick={() => props.openSessionGrid(null)}>
          <Icon name="terminal" />
        </button>
        <div class="spacer" />
        <button
          class="theme-toggle"
          title={`Switch to ${props.theme === "dark" ? "light" : "dark"} mode`}
          aria-label={`Switch to ${props.theme === "dark" ? "light" : "dark"} mode`}
          onClick={() => props.setTheme(props.theme === "dark" ? "light" : "dark")}
        >
          <Icon name={props.theme === "dark" ? "sun" : "moon"} />
        </button>
        <button title="Spec" aria-label="Spec" onClick={() => (location.href = "/docs/spec")}>
          <Icon name="book-open" />
        </button>
      </aside>
      <main class="shell">
        <section class="top">
          <div class="title">
            <h1>Crabyard.ai</h1>
            <p>
              OpenClaw Codex runs, repo-gated cards, attachable sessions, and merge policy in one
              operations board.
            </p>
          </div>
          <div class="status-strip">
            <Metric label="Active" value={`${active} / ${props.state.cap}`} />
            <Metric label="Queue" value={queue} />
            <Metric label="Review" value={review} />
            <Metric label="CLI" value={cli} />
            <Metric label="Logs" value={`${props.state.retention}d`} />
          </div>
        </section>
        <section class="toolbar">
          <div class="search-wrap">
            <input
              type="search"
              placeholder="Search cards, repos, runs, #76552"
              value={props.search}
              onInput={(event) => props.setSearch(event.currentTarget.value)}
            />
            <RefPreview
              preview={props.refPreview}
              canCreate={canMaintain(user)}
              onCreate={props.createRefCard}
            />
          </div>
          <div class="segmented" aria-label="Board filter">
            {["all", "mine", "hot"].map((key) => (
              <button
                class={props.filter === key ? "active" : ""}
                onClick={() => props.setFilter(key)}
              >
                {key === "all" ? "All" : key === "mine" ? "Mine" : "Live"}
              </button>
            ))}
          </div>
          <button
            class="primary"
            disabled={!canMaintain(user)}
            onClick={() => props.openDrawer("card")}
          >
            New card
          </button>
          <button disabled={!canMaintain(user)} onClick={() => props.openDrawer("interactive")}>
            New session
          </button>
          <button disabled={!canOwn(user)} onClick={() => props.openDrawer("admin")}>
            Admin
          </button>
          <button
            class="ghost user-chip"
            onClick={props.signedIn ? props.logout : props.beginLogin}
          >
            {userLabel}
          </button>
        </section>
        <Board {...props} />
      </main>
    </div>
  );
}

function Metric({ label, value }) {
  return (
    <div class="metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function RefPreview({ preview, canCreate, onCreate }) {
  if (!preview.number) return <div class="ref-preview" hidden />;
  const title = preview.loading
    ? `Looking up #${preview.number}`
    : `Matches for #${preview.number}`;
  return (
    <div class="ref-preview">
      <div class="ref-preview-head">
        <span>{title}</span>
        <span>{preview.matches.length || ""}</span>
      </div>
      {preview.loading ? (
        <div class="ref-empty">Searching allowed OpenClaw repos...</div>
      ) : preview.error ? (
        <div class="ref-empty">{preview.error}</div>
      ) : preview.matches.length ? (
        <div class="ref-preview-list">
          {preview.matches.map((match, index) => (
            <div class="ref-row">
              <div>
                <div class="ref-title">{match.title}</div>
                <div class="ref-meta">
                  <span class="chip">
                    {match.repo}#{match.number}
                  </span>
                  <span class="chip merge">{match.source}</span>
                  <span class="chip">{match.state}</span>
                  {match.author ? <span class="chip">@{match.author}</span> : null}
                </div>
              </div>
              {canCreate ? (
                <button class="primary" onClick={() => onCreate(index)}>
                  New card
                </button>
              ) : null}
            </div>
          ))}
        </div>
      ) : (
        <div class="ref-empty">No issue or PR #{preview.number} in enabled repos.</div>
      )}
    </div>
  );
}

function Board(props) {
  const current = props.state.user?.login || props.state.user?.email || props.state.user?.subject;
  const query = props.search.trim().toLowerCase();
  const visibleCards = props.state.cards.filter((card) => {
    if (props.filter === "mine" && card.owner !== current) return false;
    if (props.filter === "hot" && card.lane !== "Running") return false;
    return matchesCard(card, query);
  });
  return (
    <section class="board" aria-label="Crabyard board">
      {lanes.map((lane) => {
        const cards = visibleCards.filter((card) => card.lane === lane);
        return (
          <section class="lane" key={lane}>
            <div class="lane-head">
              <span>{lane}</span>
              <small>{cards.length}</small>
            </div>
            <div class="cards">
              {cards.length ? (
                cards.map((card) => <Card key={card.id} card={card} {...props} />)
              ) : (
                <div class="empty">No cards</div>
              )}
            </div>
          </section>
        );
      })}
    </section>
  );
}

function matchesCard(card, query) {
  if (!query) return true;
  const changedPaths = (card.changes?.files || []).map((file) => file.path).join(" ");
  return [card.id, card.title, card.repo, card.source, card.runtime, card.policy, changedPaths]
    .join(" ")
    .toLowerCase()
    .includes(query);
}

function Card({ card, state, cardAction, attachCard }) {
  const cls =
    card.lane === "Running"
      ? "running"
      : card.lane === "Human Review"
        ? "review"
        : card.lane === "Done"
          ? "done"
          : "";
  const maintain = canMaintain(state.user);
  return (
    <article class={`card ${cls}`}>
      <div>
        <h3>{card.title}</h3>
        <p>{card.prompt}</p>
      </div>
      <div class="meta">
        <span class="chip">{card.id}</span>
        <span class="chip">{card.repo}</span>
        <span class="chip">{card.runtime}</span>
        {card.run ? <span class="chip">{card.run.id}</span> : null}
        <span class="chip merge">{card.policy}</span>
        {card.lane === "Running" ? (
          <span class="chip hot">
            {card.run?.status || "live"} {elapsed(card.run?.lastHeartbeatAt || card.startedAt)}
          </span>
        ) : null}
      </div>
      <ChangeCard changes={card.changes} />
      <div class="card-actions">
        {maintain ? (
          <button onClick={() => cardAction(card.id, card.lane === "Running" ? "pulse" : "start")}>
            {card.lane === "Running" ? "Pulse" : "Start"}
          </button>
        ) : null}
        <button onClick={() => attachCard(card.id)}>Attach</button>
        {maintain ? <button onClick={() => cardAction(card.id, "advance")}>Move</button> : null}
      </div>
    </article>
  );
}

function ChangeCard({ changes }) {
  const value = changes || { files: [], totals: { additions: 0, deletions: 0 } };
  if (!value.files.length) return null;
  return (
    <div class="change-card" aria-label="Changed files">
      <div class="change-card-head">
        <span>Diff</span>
        <span>{value.files.length} files</span>
        <span class="change-delta">
          <span class="add">+{value.totals.additions}</span>{" "}
          <span class="del">-{value.totals.deletions}</span>
        </span>
      </div>
      {value.files.slice(0, 3).map((file) => (
        <div class="change-file">
          <span class={`status-badge ${file.status}`}>{statusLabel(file.status)}</span>
          <span class="change-path" title={file.path}>
            {file.path}
          </span>
          <span class="change-delta">
            <span class="add">+{Number(file.additions) || 0}</span>{" "}
            <span class="del">-{Number(file.deletions) || 0}</span>
          </span>
        </div>
      ))}
      {value.files.length > 3 ? <span>+{value.files.length - 3} more</span> : null}
    </div>
  );
}

function CardDrawer({ drawers, closeDrawer, createCard, state }) {
  const [busy, setBusy] = useState(false);
  return (
    <Drawer
      id="card-drawer"
      open={drawers.card}
      title="New card"
      onClose={() => closeDrawer("card")}
    >
      <form
        class="form-grid"
        aria-busy={busy ? "true" : "false"}
        onSubmit={async (event) => {
          event.preventDefault();
          setBusy(true);
          try {
            await createCard(event.currentTarget);
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          Source
          <select name="source">
            <option>Prompt</option>
            <option>Issue</option>
            <option>PR</option>
          </select>
        </label>
        <RepoSelect repos={state.repos} name="repo" />
        <label class="full">
          Title (optional)
          <input name="title" placeholder="Generated from prompt if blank" />
        </label>
        <label class="full">
          Prompt
          <textarea name="prompt" required placeholder="Describe the Codex task" />
        </label>
        <label>
          Runtime
          <select name="runtime">
            <option>auto</option>
            <option>container</option>
            <option>crabbox</option>
          </select>
        </label>
        <label>
          Merge policy
          <select name="policy">
            <option value="">repo default</option>
            <option>open_pr</option>
            <option>merge_when_green</option>
            <option>fix_until_green_and_merge</option>
          </select>
        </label>
        <div class="actions full">
          <button type="button" disabled={busy} onClick={() => closeDrawer("card")}>
            Cancel
          </button>
          <button class="primary" type="submit" disabled={busy}>
            {busy ? "Creating..." : "Create"}
          </button>
        </div>
      </form>
    </Drawer>
  );
}

function InteractiveDrawer({ drawers, closeDrawer, createInteractiveSession, state }) {
  const [busy, setBusy] = useState(false);
  return (
    <Drawer
      id="interactive-drawer"
      open={drawers.interactive}
      title="New Codex session"
      onClose={() => closeDrawer("interactive")}
    >
      <form
        class="form-grid"
        aria-busy={busy ? "true" : "false"}
        onSubmit={async (event) => {
          event.preventDefault();
          setBusy(true);
          try {
            await createInteractiveSession(event.currentTarget);
          } finally {
            setBusy(false);
          }
        }}
      >
        <RepoSelect repos={state.repos} name="repo" />
        <label>
          Branch
          <input name="branch" defaultValue="main" placeholder="main" />
        </label>
        <label>
          Runtime
          <select name="runtime">
            <option>container</option>
            <option>crabbox</option>
          </select>
        </label>
        <label>
          Command
          <input
            name="command"
            defaultValue="codex --dangerously-bypass-approvals-and-sandbox"
            placeholder="codex --dangerously-bypass-approvals-and-sandbox"
          />
        </label>
        <label class="full">
          Prompt (optional)
          <textarea name="prompt" placeholder="Initial note for the interactive box" />
        </label>
        <div class="actions full">
          <button type="button" disabled={busy} onClick={() => closeDrawer("interactive")}>
            Cancel
          </button>
          <button class="primary" type="submit" disabled={busy}>
            {busy ? "Provisioning..." : "Create session"}
          </button>
        </div>
      </form>
    </Drawer>
  );
}

function RepoSelect({ repos, name }) {
  const values = preferredRepos(repos);
  return (
    <label>
      Repo
      <select name={name} defaultValue={values.includes(preferredRepo) ? preferredRepo : values[0]}>
        {values.map((repo) => (
          <option>{repo}</option>
        ))}
      </select>
    </label>
  );
}

function RunDrawer({ drawers, closeDrawer, activeRunId, state, cardAction }) {
  const card = state.cards.find((item) => item.id === activeRunId);
  return (
    <Drawer
      id="run-drawer"
      open={drawers.run}
      title={card ? `${card.id} - ${card.title}` : "Run"}
      wide
      onClose={() => closeDrawer("run")}
    >
      <div class="run-layout">
        <div class="run-main">
          <pre class="terminal">{card?.logs?.join("\n") || ""}</pre>
          <DiffPanel card={card} />
        </div>
        <aside class="sidebox">
          {card ? <RunSide card={card} state={state} cardAction={cardAction} /> : null}
        </aside>
      </div>
    </Drawer>
  );
}

function DiffPanel({ card }) {
  const files = card?.changes?.files || [];
  const patch = card?.changes?.patch || "";
  if (!files.length) return <section class="diff-panel" hidden />;
  return (
    <section class="diff-panel">
      <div class="diff-head">
        <strong>Changed files</strong>
        <span>
          {files.length} files · +{card.changes.totals.additions} -{card.changes.totals.deletions}
        </span>
      </div>
      {files.map((file) => (
        <details key={file.path} open>
          <summary>
            <span>{file.path}</span>
            <span>
              +{file.additions} -{file.deletions}
            </span>
          </summary>
          {file.patch ? <pre>{file.patch}</pre> : null}
        </details>
      ))}
      <pre>{patch || "No patch preview"}</pre>
    </section>
  );
}

function RunSide({ card, state, cardAction }) {
  const capabilities = runCapabilities(card);
  const capabilityLabel = Object.entries(capabilities)
    .filter(([, enabled]) => enabled)
    .map(([name]) => name)
    .join(", ");
  const maintain = canMaintain(state.user);
  return (
    <>
      <h3>Session</h3>
      <div class="kv">
        <span>
          Repo <strong>{card.repo}</strong>
        </span>
        <span>
          Runtime <strong>{card.run?.runtime || card.runtime}</strong>
        </span>
        <span>
          Run <strong>{card.run?.id || "none"}</strong>
        </span>
        <span>
          Merge <strong>{card.policy}</strong>
        </span>
        <span>
          Status <strong>{card.run?.status || card.lane}</strong>
        </span>
        <span>
          Capabilities <strong>{capabilityLabel || "none"}</strong>
        </span>
      </div>
      <h3>Capabilities</h3>
      <div class="kv">
        {Object.entries(capabilities).map(([key, value]) => (
          <span>
            {key} <strong>{value ? "yes" : "no"}</strong>
          </span>
        ))}
      </div>
      <button onClick={() => cardAction(card.id, "watch")}>Watch</button>
      {maintain && hasRunCapability(card, "takeover") ? (
        <button class="primary" onClick={() => cardAction(card.id, "takeover")}>
          Take over
        </button>
      ) : null}
      {maintain && isActiveRun(card) ? (
        <button onClick={() => cardAction(card.id, "stall")}>Mark stalled</button>
      ) : null}
    </>
  );
}

function SessionsDrawer(props) {
  const open = Boolean(props.drawers.sessions);
  const focused = props.focusedSessionId ? props.sessionItemById.get(props.focusedSessionId) : null;
  const sessions = focused
    ? [focused]
    : orderedSessionItems(props.allSessionItems, props.sessionLayout);
  useEffect(() => {
    if (!open) return;
    disposeMissingTerminals(new Set(sessions.map((session) => session.id)));
  }, [open, sessions.map((session) => session.id).join("\0")]);
  return (
    <div class={`drawer ${open ? "open" : ""}`} aria-hidden={open ? "false" : "true"}>
      <section class="panel session-panel">
        <div class="panel-head session-head">
          <div>
            <h2>Codex sessions</h2>
            <p>Attach, watch, or take over live Codex CLI terminals.</p>
          </div>
          <SessionTools focused={Boolean(focused)} {...props} />
        </div>
        <div class="panel-body">
          <section
            class={`session-grid ${props.sessionLayout.columns !== "auto" && !focused ? "fixed-columns" : ""} ${
              props.sessionLayout.edit && !focused ? "layout-editing" : ""
            } ${focused ? "focus-mode" : ""}`}
            style={{
              "--session-columns":
                props.sessionLayout.columns !== "auto" && !focused
                  ? props.sessionLayout.columns
                  : "1",
            }}
            aria-label="Codex session grid"
          >
            {sessions.length ? (
              sessions.map((session) => (
                <SessionCell
                  key={session.id}
                  session={session}
                  focused={Boolean(focused)}
                  drawerOpen={open}
                  {...props}
                />
              ))
            ) : (
              <div class="session-empty">No Codex sessions yet</div>
            )}
          </section>
        </div>
      </section>
    </div>
  );
}

function SessionTools({ focused, sessionLayout, setSessionLayout, closeDrawer, showSessionGrid }) {
  return (
    <div class="session-tools">
      <label>
        Columns
        <select
          value={focused ? "1" : sessionLayout.columns}
          disabled={focused}
          onChange={(event) =>
            setSessionLayout((layout) => ({ ...layout, columns: event.currentTarget.value }))
          }
        >
          {["auto", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10"].map((value) => (
            <option value={value}>{value === "auto" ? "Auto" : value}</option>
          ))}
        </select>
      </label>
      <details class="session-layout-menu">
        <summary>Layout</summary>
        <div class="session-layout-popover">
          <button
            disabled={focused}
            class={sessionLayout.edit && !focused ? "primary" : ""}
            onClick={(event) => {
              event.currentTarget.closest("details")?.removeAttribute("open");
              setSessionLayout((layout) => ({ ...layout, edit: !layout.edit }));
            }}
          >
            {sessionLayout.edit && !focused ? "Done editing" : "Edit layout"}
          </button>
          <button
            disabled={focused}
            onClick={(event) => {
              event.currentTarget.closest("details")?.removeAttribute("open");
              setSessionLayout(defaultSessionLayout(true));
            }}
          >
            Reset
          </button>
        </div>
      </details>
      <button onClick={showSessionGrid} hidden={!focused}>
        Grid
      </button>
      <button class="icon" aria-label="Close sessions" onClick={() => closeDrawer("sessions")}>
        <Icon name="x" />
      </button>
    </div>
  );
}

function SessionCell(props) {
  const session = props.session;
  const editable = props.sessionLayout.edit && !props.focused;
  return (
    <article
      class={`session-cell ${editable ? "layout-editing" : ""}`}
      draggable={editable}
      data-session-cell={session.id}
      onDragStart={(event) => {
        if (!editable) return;
        props.draggedSessionId.current = session.id;
        event.currentTarget.classList.add("dragging");
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", session.id);
      }}
      onDragOver={(event) => {
        if (
          !props.draggedSessionId.current ||
          !editable ||
          props.draggedSessionId.current === session.id
        )
          return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        event.currentTarget.classList.add("drop-target");
      }}
      onDragLeave={(event) => event.currentTarget.classList.remove("drop-target")}
      onDrop={(event) => {
        const sourceId = props.draggedSessionId.current;
        event.currentTarget.classList.remove("drop-target");
        if (!sourceId || sourceId === session.id) return;
        event.preventDefault();
        props.draggedSessionId.current = null;
        props.setSessionLayout((layout) =>
          moveSessionLayoutItem(layout, props.allSessionItems, sourceId, session.id),
        );
      }}
      onDragEnd={(event) => {
        props.draggedSessionId.current = null;
        event.currentTarget.classList.remove("dragging", "drop-target");
      }}
    >
      <header class="session-cell-head">
        <div class="session-cell-title">
          <strong title={session.title}>{session.repo}</strong>
          <span title={session.branch || session.title}>
            {session.branch || session.title}
            {session.kind !== "interactive" && session.policy ? ` · ${session.policy}` : ""}
          </span>
        </div>
        <SessionStatus session={session} />
        <div class="session-controls">
          {editable ? <SessionLayoutButtons session={session} {...props} /> : null}
          {props.focused ? (
            <button onClick={props.showSessionGrid}>Grid</button>
          ) : (
            <button
              onClick={() => {
                props.setFocusedSessionId(session.id);
                props.openSessionGrid(session.id, { deepLink: session.kind === "interactive" });
              }}
            >
              Open
            </button>
          )}
          <SessionActions session={session} minimal={!props.focused && !editable} {...props} />
        </div>
      </header>
      <div class="session-terminal-wrap">
        <TerminalMount session={session} focused={props.focused} drawerOpen={props.drawerOpen} />
      </div>
      <footer class="session-cell-foot">
        <span>{sessionFooterSummary(session)}</span>
        <span>{props.terminalStatus[session.id] || runtimeCapabilityLabel(session)}</span>
      </footer>
    </article>
  );
}

function SessionLayoutButtons() {
  return (
    <span class="session-edit-controls">
      <button class="session-drag layout-control" draggable="true" title="Drag to rearrange">
        Move
      </button>
    </span>
  );
}

function SessionActions(props) {
  const session = props.session;
  if (session.kind === "interactive") return <InteractiveSessionActions {...props} />;
  if (props.minimal) {
    return (
      <>
        <button onClick={() => props.openRunDetails(session.id)}>Details</button>
        <button onClick={() => props.cardAction(session.id, "watch")}>Watch</button>
      </>
    );
  }
  return (
    <>
      <button onClick={() => props.openRunDetails(session.id)}>Details</button>
      <button onClick={() => props.cardAction(session.id, "watch")}>Watch</button>
      {canMaintain(props.state.user) && hasRunCapability(session, "takeover") ? (
        <button onClick={() => props.cardAction(session.id, "takeover")}>Take over</button>
      ) : null}
    </>
  );
}

function InteractiveSessionActions(props) {
  const session = props.session;
  if (String(session.id).startsWith("LOCAL-")) return null;
  const stopped = ["stopped", "expired", "failed"].includes(session.status);
  const canManage = session.canManage || canMaintain(props.state.user);
  const canUse = session.canControl || canManage;
  const filePaste =
    canUse && typeof session.leaseId === "string" && session.leaseId.startsWith("sandbox:");
  if (props.minimal) {
    return (
      <>
        {canManage ? (
          <button onClick={() => props.shareInteractiveSession(session.id)}>
            {session.shareMode === "link_read" ? "New link" : "Share"}
          </button>
        ) : null}
        {!stopped && canUse ? (
          <button onClick={() => props.interactiveSessionAction(session.id, "attach")}>
            Attach
          </button>
        ) : null}
        {canManage && !stopped ? (
          <button class="danger" onClick={() => props.interactiveSessionAction(session.id, "stop")}>
            Stop
          </button>
        ) : null}
      </>
    );
  }
  return (
    <>
      <button onClick={() => copyTerminalSelection(session.id)}>Copy</button>
      {!stopped && canUse ? (
        <button onClick={() => pasteClipboardText(session.id)}>Paste</button>
      ) : null}
      {!stopped && filePaste ? (
        <button onClick={() => pasteClipboardFile(session.id)}>Paste file</button>
      ) : null}
      {canManage ? (
        <button onClick={() => props.shareInteractiveSession(session.id)}>
          {session.shareMode === "link_read" ? "New link" : "Share"}
        </button>
      ) : null}
      {canManage && session.shareMode === "link_read" ? (
        <button onClick={() => props.interactiveSessionAction(session.id, "disable_share")}>
          Unshare
        </button>
      ) : null}
      {session.canRequestControl && !session.sharedReadOnly && !stopped ? (
        <button onClick={() => props.interactiveSessionAction(session.id, "request_control")}>
          {session.controlRequestedBy ? "Control requested" : "Request control"}
        </button>
      ) : null}
      {canManage && session.controlRequestedBy ? (
        <>
          <button
            class="primary"
            onClick={() => props.interactiveSessionAction(session.id, "approve_control")}
          >
            Allow
          </button>
          <button onClick={() => props.interactiveSessionAction(session.id, "deny_control")}>
            Deny
          </button>
        </>
      ) : null}
      {canManage && session.controller ? (
        <button onClick={() => props.interactiveSessionAction(session.id, "revoke_control")}>
          Revoke
        </button>
      ) : null}
      {!stopped && canUse ? (
        <button onClick={() => props.interactiveSessionAction(session.id, "attach")}>Attach</button>
      ) : null}
      {canManage && !stopped ? (
        <button class="danger" onClick={() => props.interactiveSessionAction(session.id, "stop")}>
          Stop
        </button>
      ) : null}
    </>
  );
}

function SessionStatus({ session }) {
  const status = sessionStatus(session);
  return <span class={`session-status ${status.tone}`}>{status.label}</span>;
}

function sessionStatus(session) {
  if (session.kind === "interactive") {
    if (["failed"].includes(session.status)) return { label: "Failed", tone: "failed" };
    if (["stopped", "expired"].includes(session.status))
      return { label: "Stopped", tone: "stopped" };
    if (session.status === "provisioning" || session.status === "pending_adapter") {
      return { label: "Provisioning", tone: "provisioning" };
    }
    if (session.shareMode === "link_read" || session.sharedReadOnly) {
      return { label: "Shared", tone: "shared" };
    }
    if (["ready", "attached", "detached"].includes(session.status)) {
      return { label: "Live", tone: "live" };
    }
    return { label: humanStatus(session.status), tone: "" };
  }
  if (session.run?.status === "failed" || session.lane === "Human Review") {
    return { label: humanStatus(session.run?.status || session.lane), tone: "failed" };
  }
  if (session.lane === "Running") return { label: "Live", tone: "live" };
  if (session.lane === "Done") return { label: "Done", tone: "stopped" };
  return { label: session.lane || humanStatus(session.run?.status), tone: "" };
}

function sessionFooterSummary(session) {
  if (session.kind === "interactive") {
    const parts = [session.id];
    const seen = session.lastSeenAt || session.updatedAt;
    if (seen) parts.push(`seen ${elapsed(seen)}`);
    if (session.status) parts.push(humanStatus(session.status));
    if (session.shareMode === "link_read" || session.sharedReadOnly) parts.push("shared");
    if (session.controller) parts.push(`control ${session.controller}`);
    if (session.controlRequestedBy) parts.push(`request ${session.controlRequestedBy}`);
    return parts.join(" · ");
  }
  const parts = [session.id];
  if (session.run?.lastHeartbeatAt || session.startedAt) {
    parts.push(`seen ${elapsed(session.run?.lastHeartbeatAt || session.startedAt)}`);
  }
  if (session.run?.status) parts.push(humanStatus(session.run.status));
  if (session.run?.runtime || session.runtime) parts.push(session.run?.runtime || session.runtime);
  return parts.join(" · ");
}

function humanStatus(value) {
  return String(value || "")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function TerminalMount({ session, focused, drawerOpen }) {
  const ref = useRef(null);
  const [visible, setVisible] = useState(focused);

  useEffect(() => {
    if (focused) {
      setVisible(true);
      return;
    }
    if (!drawerOpen) {
      setVisible(false);
      return;
    }
    const mount = ref.current;
    if (!mount || !("IntersectionObserver" in window)) {
      setVisible(true);
      return;
    }
    const root = mount.closest(".panel-body");
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), {
      root,
      rootMargin: "360px 0px",
      threshold: 0,
    });
    observer.observe(mount);
    return () => observer.disconnect();
  }, [session.id, focused, drawerOpen]);

  useEffect(() => {
    const mount = ref.current;
    if (!mount) return;
    const active = drawerOpen && visible;
    mount.dataset.sessionId = active ? session.id : "";
    if (!active) {
      disposeTerminal(session.id);
      return;
    }
    void mountTerminal(session, mount, { focused });
    return () => {
      if (!drawerOpen) disposeTerminal(session.id);
    };
  }, [session, focused, drawerOpen, visible]);

  return (
    <div
      ref={ref}
      class="ghostty-terminal"
      data-session-id={drawerOpen && visible ? session.id : ""}
      aria-label={`${session.id} terminal`}
    >
      {!visible ? <div class="terminal-placeholder">Terminal paused offscreen</div> : null}
    </div>
  );
}

function AdminDrawer(props) {
  const owner = props.state.user?.role === "owner";
  return (
    <Drawer
      id="admin-drawer"
      open={props.drawers.admin}
      title="Admin"
      wide
      onClose={() => props.closeDrawer("admin")}
    >
      <div class="admin-grid">
        <AdminList
          title="Users and teams"
          placeholder="@login or @org/team"
          disabled={!owner}
          select={{
            values: [
              ["maintainer", "Maintainer"],
              ["owner", "Owner"],
              ["viewer", "Viewer"],
            ],
          }}
          rows={props.state.allow.map((item) => ({
            label: `${item.value} - ${item.role}`,
            value: item.value,
          }))}
          onAdd={(value, role) => props.addAllow(value, role)}
          onRemove={props.removeAllow}
        />
        <AdminList
          title="Repos"
          placeholder="owner/repo"
          disabled={!owner}
          rows={props.state.repos.map((repo) => ({ label: repo, value: repo }))}
          onAdd={props.addRepo}
          onRemove={props.removeRepo}
        />
        <PolicyBox disabled={!owner} state={props.state} updatePolicy={props.updatePolicy} />
        <WorkflowBox
          disabled={!owner}
          workflows={props.state.workflows || []}
          refreshWorkflow={props.refreshWorkflow}
        />
      </div>
    </Drawer>
  );
}

function AdminList({ title, placeholder, disabled, select, rows, onAdd, onRemove }) {
  const [value, setValue] = useState("");
  const [role, setRole] = useState(select?.values?.[0]?.[0] || "");
  return (
    <section class="admin-box">
      <h3>{title}</h3>
      <div class="form-grid">
        <input
          class="full"
          placeholder={placeholder}
          value={value}
          disabled={disabled}
          onInput={(event) => setValue(event.currentTarget.value)}
        />
        {select ? (
          <select
            class="full"
            value={role}
            disabled={disabled}
            onChange={(event) => setRole(event.currentTarget.value)}
          >
            {select.values.map(([key, label]) => (
              <option value={key}>{label}</option>
            ))}
          </select>
        ) : null}
        <button
          class="primary full"
          disabled={disabled}
          onClick={() => {
            if (!value.trim()) return;
            void onAdd(value.trim(), role);
            setValue("");
          }}
        >
          Add
        </button>
      </div>
      <div class="list">
        {rows.map((row) => (
          <div class="list-row">
            <span>{row.label}</span>
            <button
              class="icon"
              disabled={disabled}
              aria-label={`Remove ${row.label}`}
              onClick={() => onRemove(row.value)}
            >
              <Icon name="x" />
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}

function PolicyBox({ disabled, state, updatePolicy }) {
  const [cap, setCap] = useState(state.cap);
  const [merge, setMerge] = useState(state.merge);
  const [retention, setRetention] = useState(state.retention);
  useEffect(() => {
    setCap(state.cap);
    setMerge(state.merge);
    setRetention(state.retention);
  }, [state.cap, state.merge, state.retention]);
  return (
    <section class="admin-box">
      <h3>Policy</h3>
      <label>
        Concurrent cap
        <input
          type="number"
          min="1"
          max="200"
          value={cap}
          disabled={disabled}
          onInput={(event) => setCap(event.currentTarget.value)}
        />
      </label>
      <label>
        Direct merge
        <select
          value={merge}
          disabled={disabled}
          onChange={(event) => setMerge(event.currentTarget.value)}
        >
          <option value="guarded">Guarded</option>
          <option value="disabled">Disabled</option>
          <option value="maintainers">Maintainers only</option>
        </select>
      </label>
      <label>
        Log retention
        <select
          value={retention}
          disabled={disabled}
          onChange={(event) => setRetention(event.currentTarget.value)}
        >
          <option value="30">30 days</option>
          <option value="14">14 days</option>
          <option value="60">60 days</option>
        </select>
      </label>
      <button
        class="primary"
        disabled={disabled}
        onClick={() => {
          const rawCap = Number(cap);
          updatePolicy({
            cap: Number.isFinite(rawCap) ? Math.min(200, Math.max(1, rawCap)) : 20,
            retention,
            merge,
          });
        }}
      >
        Save policy
      </button>
      <div class="kv">
        <span>
          Secrets: <strong>per org, referenced only</strong>
        </span>
        <span>
          VNC: <strong>Crabbox leases only</strong>
        </span>
      </div>
    </section>
  );
}

function WorkflowBox({ disabled, workflows, refreshWorkflow }) {
  const [repo, setRepo] = useState(preferredRepo);
  return (
    <section class="admin-box">
      <h3>Workflows</h3>
      <div class="form-grid">
        <input
          class="full"
          placeholder={preferredRepo}
          value={repo}
          disabled={disabled}
          onInput={(event) => setRepo(event.currentTarget.value)}
        />
        <button
          class="primary full"
          disabled={disabled}
          onClick={() => refreshWorkflow(repo.trim())}
        >
          Refresh CRABYARD.md
        </button>
      </div>
      <div class="list">
        {workflows.length ? (
          workflows.map((workflow) => {
            const config = workflow.config || {};
            const detail = [
              config.runtime ? `runtime=${config.runtime}` : "",
              config.policy ? `policy=${config.policy}` : "",
              workflow.error || "",
            ]
              .filter(Boolean)
              .join(" ");
            return (
              <div class="list-row">
                <span>
                  {workflow.repo} - {workflow.status}
                  {detail ? (
                    <>
                      <br />
                      <small>{detail}</small>
                    </>
                  ) : null}
                </span>
              </div>
            );
          })
        ) : (
          <div class="empty">No workflow evaluations</div>
        )}
      </div>
    </section>
  );
}

function Drawer({ id, open, title, wide, onClose, children }) {
  return (
    <div class={`drawer ${open ? "open" : ""}`} id={id} aria-hidden={open ? "false" : "true"}>
      <section class={`panel ${wide ? "wide" : ""}`}>
        <div class="panel-head">
          <h2>{title}</h2>
          <button class="icon" aria-label={`Close ${title}`} onClick={onClose}>
            <Icon name="x" />
          </button>
        </div>
        <div class="panel-body">{children}</div>
      </section>
    </div>
  );
}

function Icon({ name }) {
  const nodes = globalThis.lucideIconNodes?.[name];
  if (!nodes) return null;
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      {nodes.map(([tag, attrs], index) => {
        const Tag = tag;
        return <Tag key={`${tag}-${index}`} {...attrs} />;
      })}
    </svg>
  );
}

function orderedSessionItems(items, layout) {
  const currentIds = new Set(items.map((item) => item.id));
  if (!layout.manualOrder) return items;
  const order = [
    ...layout.order.filter((id) => currentIds.has(id)),
    ...items.map((item) => item.id).filter((id) => !layout.order.includes(id)),
  ];
  const rank = new Map(order.map((id, index) => [id, index]));
  return [...items].sort(
    (left, right) =>
      (rank.get(left.id) ?? Number.MAX_SAFE_INTEGER) -
      (rank.get(right.id) ?? Number.MAX_SAFE_INTEGER),
  );
}

function moveSessionLayoutItem(layout, items, sourceId, targetId) {
  const ids = orderedSessionItems(items, layout).map((item) => item.id);
  const sourceIndex = ids.indexOf(sourceId);
  const targetIndex = ids.indexOf(targetId);
  if (sourceIndex === -1 || targetIndex === -1) return layout;
  ids.splice(sourceIndex, 1);
  ids.splice(targetIndex, 0, sourceId);
  return { ...layout, manualOrder: true, order: ids };
}

function defaultSessionLayout(edit = false) {
  return { columns: "auto", edit, manualOrder: false, order: [], sizes: {} };
}

function loadSessionLayout() {
  try {
    return normalizeSessionLayout(
      JSON.parse(localStorage.getItem(sessionLayoutStorageKey) || "null") || defaultSessionLayout(),
    );
  } catch {
    return defaultSessionLayout();
  }
}

function saveSessionLayout(layout) {
  try {
    localStorage.setItem(
      sessionLayoutStorageKey,
      JSON.stringify({
        columns: layout.columns,
        manualOrder: layout.manualOrder,
        order: layout.order,
        sizes: layout.sizes,
      }),
    );
  } catch {}
}

function normalizeSessionLayout(value) {
  return {
    columns: ["auto", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10"].includes(
      String(value?.columns),
    )
      ? String(value.columns)
      : "auto",
    edit: false,
    manualOrder: Boolean(value?.manualOrder),
    order: Array.isArray(value?.order) ? value.order.map(String).slice(0, 200) : [],
    sizes: typeof value?.sizes === "object" && value.sizes ? value.sizes : {},
  };
}

function parseSessionLink() {
  const match = location.pathname.match(/^\/app\/sessions\/([^/]+)$/);
  return {
    id: match ? decodeURIComponent(match[1]) : null,
    token: new URLSearchParams(location.search).get("token"),
  };
}

function restoreSessionReturnUrl() {
  try {
    const saved = sessionStorage.getItem(loginReturnKey);
    if (!saved || !history.replaceState) return;
    const url = new URL(saved, location.origin);
    if (url.origin !== location.origin || !url.pathname.startsWith("/app/sessions/")) return;
    if (location.pathname !== "/app" && location.pathname !== "/app/") return;
    sessionStorage.removeItem(loginReturnKey);
    history.replaceState(null, "", `${url.pathname}${url.search}`);
  } catch {}
}

function isTerminalKeyTarget(event) {
  const active = document.activeElement;
  return Boolean(
    event.target?.closest?.(".ghostty-terminal") || active?.closest?.(".ghostty-terminal"),
  );
}

render(<App />, document.getElementById("crabyard-preact-root"));
