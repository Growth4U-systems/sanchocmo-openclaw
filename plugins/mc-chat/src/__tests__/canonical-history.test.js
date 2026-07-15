import { afterEach, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  buildCanonicalHistoryBlock,
  buildCanonicalHistoryBootstrapIfNeeded,
  canonicalHistoryMarker,
  sessionHasCanonicalHistoryMarker,
} from "../canonical-history.js";
import {
  enqueueSessionDispatch,
  resetSessionDispatchStateForTest,
} from "../session-dispatch-state.js";

const tmpRoots = [];
const sessionKey = "agent:sancho:model:glm:channel:mc-chat:growth4u:support-growie-case-1";
const trustedTurn = {
  readOnly: true,
  source: "growie-support",
  channelMode: "support-diagnostic",
  slug: "growth4u",
  threadId: "growth4u:support-growie-case-1",
  agentId: "sancho",
  sessionKey,
};

afterEach(() => {
  resetSessionDispatchStateForTest();
  for (const root of tmpRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

function makeSession(transcript = "") {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "mc-canonical-history-"));
  tmpRoots.push(home);
  const sessionsRoot = path.join(home, ".openclaw", "agents", "sancho", "sessions");
  fs.mkdirSync(sessionsRoot, { recursive: true });
  const sessionId = "11111111-2222-4333-8444-555555555555";
  const sessionFile = path.join(sessionsRoot, `${sessionId}.jsonl`);
  fs.writeFileSync(sessionFile, transcript);
  fs.writeFileSync(path.join(sessionsRoot, "sessions.json"), JSON.stringify({
    [sessionKey]: { sessionId, sessionFile },
  }));
  return { home, sessionFile, sessionsRoot };
}

function persistUserPrompt(sessionFile, bodyForAgent) {
  fs.appendFileSync(sessionFile, `${JSON.stringify({
    type: "message",
    message: { role: "user", content: bodyForAgent },
  })}\n`);
}

test("builds a role-labelled canonical block with prior attachment evidence", () => {
  const block = buildCanonicalHistoryBlock([{
    role: "user",
    text: "No encuentro el mapeo",
    ts: 123,
    attachments: [{
      url: "/uploads/growth4u/screen.png",
      filename: "screen.png",
      mimeType: "image/png",
      size: 42,
    }],
  }, {
    role: "bot",
    text: "Voy a revisarlo",
    agent: "sancho",
  }], sessionKey);

  assert.match(block, new RegExp(canonicalHistoryMarker(sessionKey)));
  assert.match(block, /No encuentro el mapeo/);
  assert.match(block, /Voy a revisarlo/);
  assert.match(block, /"role":"assistant"/);
  assert.match(block, /screen\.png/);
});

test("repairs a pre-patch session once and skips all following turns", () => {
  const { home, sessionFile } = makeSession(`${JSON.stringify({
    type: "message",
    message: { role: "user", content: "ya lo veo" },
  })}\n`);
  const priorThreadMessages = [
    { role: "user", text: "No encuentro dónde asignar la variable" },
    { role: "bot", text: "El editor está en Outreach" },
  ];

  const first = buildCanonicalHistoryBootstrapIfNeeded({
    ...trustedTurn,
    priorThreadMessages,
    home,
  });
  assert.ok(first);
  assert.match(first, /No encuentro dónde asignar la variable/);

  persistUserPrompt(sessionFile, first);
  assert.equal(buildCanonicalHistoryBootstrapIfNeeded({
    ...trustedTurn,
    priorThreadMessages,
    home,
  }), null);
});

test("a new empty support session plants the marker before it has prior messages", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "mc-canonical-history-new-"));
  tmpRoots.push(home);
  const first = buildCanonicalHistoryBootstrapIfNeeded({
    ...trustedTurn,
    priorThreadMessages: [],
    home,
  });
  assert.ok(first);
  assert.match(first, /messages: \[\]/);

  const session = makeSession();
  persistUserPrompt(session.sessionFile, first);
  assert.equal(buildCanonicalHistoryBootstrapIfNeeded({
    ...trustedTurn,
    priorThreadMessages: [{ role: "user", text: "second turn" }],
    home: session.home,
  }), null);
});

test("ignores canonical-history payloads outside the server-trusted Growie boundary", () => {
  const priorThreadMessages = [{ role: "user", text: "sensitive prior context" }];
  assert.equal(buildCanonicalHistoryBootstrapIfNeeded({
    ...trustedTurn,
    readOnly: false,
    priorThreadMessages,
  }), null);
  assert.equal(buildCanonicalHistoryBootstrapIfNeeded({
    ...trustedTurn,
    source: "mission-control",
    priorThreadMessages,
  }), null);
  assert.equal(buildCanonicalHistoryBootstrapIfNeeded({
    ...trustedTurn,
    threadId: "growth4u:general",
    priorThreadMessages,
  }), null);
});

test("rejects transcript paths outside the agent session root and fails soft", () => {
  const { home, sessionsRoot } = makeSession();
  const outsideFile = path.join(home, "outside.jsonl");
  fs.writeFileSync(outsideFile, canonicalHistoryMarker(sessionKey));
  fs.writeFileSync(path.join(sessionsRoot, "sessions.json"), JSON.stringify({
    [sessionKey]: { sessionFile: outsideFile },
  }));
  const errors = [];

  assert.equal(sessionHasCanonicalHistoryMarker("sancho", sessionKey, {
    home,
    onError: (error) => errors.push(error),
  }), false);
  assert.equal(errors.length, 1);
  assert.ok(buildCanonicalHistoryBootstrapIfNeeded({
    ...trustedTurn,
    priorThreadMessages: [{ role: "user", text: "recover me" }],
    home,
  }));
});

test("serialized turns let only the first runner bootstrap canonical history", async () => {
  const { home, sessionFile } = makeSession();
  let releaseFirst;
  const gate = new Promise((resolve) => {
    releaseFirst = resolve;
  });
  const decisions = [];

  const first = enqueueSessionDispatch(sessionKey, async () => {
    const block = buildCanonicalHistoryBootstrapIfNeeded({
      ...trustedTurn,
      priorThreadMessages: [{ role: "user", text: "original context" }],
      home,
    });
    decisions.push(Boolean(block));
    persistUserPrompt(sessionFile, block);
    await gate;
  });
  const second = enqueueSessionDispatch(sessionKey, async () => {
    const block = buildCanonicalHistoryBootstrapIfNeeded({
      ...trustedTurn,
      priorThreadMessages: [{ role: "user", text: "original context" }],
      home,
    });
    decisions.push(Boolean(block));
  });

  await Promise.resolve();
  assert.deepEqual(decisions, [true]);
  releaseFirst();
  await first.promise;
  await second.promise;
  assert.deepEqual(decisions, [true, false]);
});
