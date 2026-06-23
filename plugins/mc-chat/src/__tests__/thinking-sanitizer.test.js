import { afterEach, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  agentThinkingHistoryRoots,
  sanitizeAgentThinkingHistory,
  sanitizeJsonLine,
  sanitizeThinkingBlocks,
} from "../thinking-sanitizer.js";

const tmpRoots = [];

afterEach(() => {
  for (const dir of tmpRoots.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

function mkTmp() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mc-thinking-sanitizer-"));
  tmpRoots.push(dir);
  return dir;
}

test("sanitizeThinkingBlocks removes only internal thinking content", () => {
  const input = {
    type: "message",
    message: {
      role: "assistant",
      content: [
        { type: "thinking", thinking: "private chain", thinkingSignature: "bad-signature" },
        { type: "text", text: "Respuesta visible" },
        { type: "toolCall", name: "exec", arguments: { command: "date" } },
      ],
    },
  };

  const result = sanitizeThinkingBlocks(input);

  assert.equal(result.changed, true);
  assert.equal(result.removedBlocks, 1);
  assert.deepEqual(result.value.message.content, [
    { type: "text", text: "Respuesta visible" },
    { type: "toolCall", name: "exec", arguments: { command: "date" } },
  ]);
});

test("sanitizeJsonLine is idempotent and preserves valid visible content", () => {
  const raw = JSON.stringify({
    type: "message",
    message: {
      role: "assistant",
      content: [
        { type: "thinking", thinking: "hidden", thinkingSignature: "invalid" },
        { type: "text", text: "Listo." },
      ],
    },
  });

  const once = sanitizeJsonLine(raw);
  const twice = sanitizeJsonLine(once.line);

  assert.equal(once.changed, true);
  assert.equal(once.removedBlocks, 1);
  assert.equal(twice.changed, false);
  assert.deepEqual(JSON.parse(once.line).message.content, [{ type: "text", text: "Listo." }]);
});

test("sanitizeAgentThinkingHistory scans agent session roots and rewrites JSONL stores", () => {
  const home = mkTmp();
  const codexSessions = path.join(home, ".openclaw", "agents", "rocinante", "agent", "codex-home", "sessions", "2026", "06", "23");
  const openclawSessions = path.join(home, ".openclaw", "agents", "rocinante", "sessions");
  fs.mkdirSync(codexSessions, { recursive: true });
  fs.mkdirSync(openclawSessions, { recursive: true });

  const badLine = JSON.stringify({
    type: "message",
    message: {
      role: "assistant",
      content: [
        { type: "thinking", thinking: "private", thinkingSignature: "invalid" },
        { type: "text", text: "Visible memory" },
      ],
    },
  });
  const goodLine = JSON.stringify({ type: "message", message: { role: "user", content: "hola" } });
  const codexFile = path.join(codexSessions, "rollout-test.jsonl");
  const openclawFile = path.join(openclawSessions, "thread.jsonl.reset.2026-06-23T00-00-00.000Z");
  fs.writeFileSync(codexFile, `${badLine}\n${goodLine}\n`);
  fs.writeFileSync(openclawFile, `${badLine}\n`);

  const roots = agentThinkingHistoryRoots("rocinante", home);
  const result = sanitizeAgentThinkingHistory("rocinante", { home });

  assert.ok(roots.some((root) => root.includes("codex-home")));
  assert.equal(result.filesChanged, 2);
  assert.equal(result.removedBlocks, 2);
  assert.equal(fs.readFileSync(codexFile, "utf8").includes("thinkingSignature"), false);
  assert.equal(fs.readFileSync(openclawFile, "utf8").includes('"type":"thinking"'), false);
  assert.equal(fs.readFileSync(codexFile, "utf8").includes("Visible memory"), true);
});
