import assert from "node:assert/strict";
import { test } from "node:test";
import {
  multiplayerTerminalInputPayloadsForMode,
  newTerminalInputState,
} from "../src/terminal-multiplayer.ts";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

const user = {
  subject: "dev:admin-1",
  login: "admin-1",
  email: null,
  name: "Admin 1",
};
const secondUser = {
  subject: "dev:user-1",
  login: "user-1",
  email: null,
  name: "User 1",
};

function text(payloads: Uint8Array[]): string {
  return payloads.map((payload) => decoder.decode(payload)).join("");
}

test("multiplayer input tracks interleaved writers on the shared session line", () => {
  const state = newTerminalInputState();

  assert.deepEqual(
    multiplayerTerminalInputPayloadsForMode(state, user, encoder.encode("hello "), true),
    [encoder.encode("hello ")],
  );
  assert.deepEqual(
    multiplayerTerminalInputPayloadsForMode(state, secondUser, encoder.encode("world"), true),
    [encoder.encode("world")],
  );

  assert.equal(
    text(multiplayerTerminalInputPayloadsForMode(state, secondUser, encoder.encode("\r"), true)),
    '\x15<sender name="User 1"/> hello world\r',
  );
});

test("multiplayer disabled forwards input unchanged", () => {
  const state = newTerminalInputState();
  const typed = encoder.encode("hello ");
  const enter = encoder.encode("\r");

  assert.deepEqual(multiplayerTerminalInputPayloadsForMode(state, user, typed, false), [typed]);
  assert.deepEqual(multiplayerTerminalInputPayloadsForMode(state, user, enter, false), [enter]);
});
