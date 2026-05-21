import assert from "node:assert/strict";
import { test } from "node:test";
import { terminalColorQueryResponses, terminalColorQueryState } from "../src/app/terminal.js";

test("terminal OSC color queries receive xterm-compatible responses", () => {
  assert.deepEqual(terminalColorQueryResponses("\x1b]10;?\x07"), [
    "\x1b]10;rgb:e5e5/e7e7/ebeb\x07",
  ]);
  assert.deepEqual(terminalColorQueryResponses("\x1b]11;?\x1b\\"), [
    "\x1b]11;rgb:1010/1818/2727\x07",
  ]);
});

test("terminal OSC color query parser ignores ordinary output", () => {
  assert.deepEqual(terminalColorQueryResponses("OpenAI Codex\n"), []);
});

test("terminal OSC color query parser buffers split output frames", () => {
  const first = terminalColorQueryState("\x1b]10;?");
  assert.deepEqual(first, { responses: [], pending: "\x1b]10;?" });

  const second = terminalColorQueryState("\x07", first.pending);
  assert.deepEqual(second, {
    responses: ["\x1b]10;rgb:e5e5/e7e7/ebeb\x07"],
    pending: "",
  });
});
