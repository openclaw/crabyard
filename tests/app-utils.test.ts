import assert from "node:assert/strict";
import { test } from "node:test";
import {
  isActiveRun,
  linkedInteractiveSessionPlaceholder,
  optimisticInteractiveSession,
  sessionItems,
  terminalText,
} from "../src/app/utils.js";

test("interactive session ordering ignores passive terminal last-seen refreshes", () => {
  const state = {
    cards: [],
    interactiveSessions: [
      {
        id: "IS-1",
        repo: "openclaw/openclaw",
        branch: "main",
        status: "attached",
        updatedAt: 2000,
        createdAt: 1000,
        lastSeenAt: 100_000,
      },
      {
        id: "IS-2",
        repo: "openclaw/openclaw",
        branch: "main",
        status: "attached",
        updatedAt: 3000,
        createdAt: 1000,
        lastSeenAt: 10_000,
      },
    ],
  };

  assert.deepEqual(
    sessionItems(state).map((session) => session.id),
    ["IS-2", "IS-1"],
  );
});

test("card ordering falls back to created time when no run has started", () => {
  const state = {
    interactiveSessions: [],
    cards: [
      { id: "CY-1", lane: "Todo", createdAt: 1000, updatedAt: 0, startedAt: null, run: null },
      { id: "CY-2", lane: "Todo", createdAt: 2000, updatedAt: 0, startedAt: null, run: null },
    ],
  };

  assert.deepEqual(
    sessionItems(state).map((session) => session.id),
    ["CY-2", "CY-1"],
  );
});

test("card ordering keeps updated cards ahead of older start times", () => {
  const state = {
    interactiveSessions: [],
    cards: [
      { id: "CY-1", lane: "Todo", createdAt: 1000, updatedAt: 9000, startedAt: 1000, run: null },
      { id: "CY-2", lane: "Todo", createdAt: 2000, updatedAt: 3000, startedAt: 8000, run: null },
    ],
  };

  assert.deepEqual(
    sessionItems(state).map((session) => session.id),
    ["CY-1", "CY-2"],
  );
});

test("optimistic interactive sessions use runtime-specific pending copy", () => {
  const data = new FormData();
  data.set("repo", "openclaw/openclaw");
  data.set("runtime", "crabbox");

  const session = optimisticInteractiveSession(data, "steipete");

  assert.equal(session.runtime, "crabbox");
  assert.equal(session.lastEvent, "Requesting Crabbox...");
  assert.deepEqual(session.logs, ["Requesting Crabbox...", "Waiting for session id..."]);
});

test("linked session placeholders render a best-effort Codex card", () => {
  const session = { ...linkedInteractiveSessionPlaceholder("IS-101"), kind: "interactive" };

  assert.equal(session.routePlaceholder, true);
  assert.equal(isActiveRun(session), true);
  assert.match(terminalText(session), /\$ codex attach IS-101/);
  assert.match(terminalText(session), /Loading Codex session/);
});
