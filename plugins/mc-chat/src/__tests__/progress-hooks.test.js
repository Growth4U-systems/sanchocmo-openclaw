import { test } from "node:test";
import assert from "node:assert/strict";
import { parseThreadIdFromSessionKey, toolToProgressEvent } from "../progress-hooks.js";

// ── parseThreadIdFromSessionKey ──────────────────────────────────────────────

test("parses the canonical agent-scoped mc-chat session key", () => {
  const out = parseThreadIdFromSessionKey("agent:sancho:channel:mc-chat:criptan:fast-foundation");
  assert.deepEqual(out, { slug: "criptan", threadId: "criptan:fast-foundation" });
});

test("handles a thread id that itself contains colons (typed prefixes)", () => {
  const out = parseThreadIdFromSessionKey("agent:sancho:channel:mc-chat:growth4u:project:q3-launch");
  assert.deepEqual(out, { slug: "growth4u", threadId: "growth4u:project:q3-launch" });
});

test("parses a session key without the agent prefix", () => {
  const out = parseThreadIdFromSessionKey("channel:mc-chat:masavo:general");
  assert.deepEqual(out, { slug: "masavo", threadId: "masavo:general" });
});

test("returns null for a non-mc-chat session key (e.g. discord)", () => {
  assert.equal(parseThreadIdFromSessionKey("agent:sancho:channel:discord:123456:789"), null);
});

test("returns null for empty / non-string input", () => {
  assert.equal(parseThreadIdFromSessionKey(""), null);
  assert.equal(parseThreadIdFromSessionKey(undefined), null);
  assert.equal(parseThreadIdFromSessionKey(null), null);
});

test("returns null when there is no thread segment after the channel marker", () => {
  // marker present but nothing (or only a slug with no thread) after it
  assert.equal(parseThreadIdFromSessionKey("agent:sancho:channel:mc-chat:"), null);
  assert.equal(parseThreadIdFromSessionKey("agent:sancho:channel:mc-chat:onlyslug"), null);
});

// ── toolToProgressEvent ──────────────────────────────────────────────────────

test("maps Claude Read → read with file_path target", () => {
  assert.deepEqual(toolToProgressEvent("Read", { file_path: "brand/x/a.md" }), {
    kind: "read",
    label: "📄 Leyendo",
    target: "brand/x/a.md",
  });
});

test("maps Claude Write/Edit → file_write", () => {
  assert.equal(toolToProgressEvent("Write", { file_path: "a.md" }).kind, "file_write");
  assert.equal(toolToProgressEvent("Edit", { file_path: "a.md" }).kind, "file_write");
});

test("maps Grep/Glob and Web tools → search", () => {
  assert.equal(toolToProgressEvent("Grep", { pattern: "foo" }).kind, "search");
  assert.equal(toolToProgressEvent("WebSearch", { query: "bar" }).kind, "search");
});

test("maps Agent → agent_handoff with subagent_type target", () => {
  assert.deepEqual(toolToProgressEvent("Agent", { subagent_type: "hamete" }), {
    kind: "agent_handoff",
    label: "🤖 Delegando a subagente",
    target: "hamete",
  });
});

test("maps codex exec_command → tool_call with command target (truncated)", () => {
  const longCmd = "curl -s https://criptan.com/" + "x".repeat(200);
  const out = toolToProgressEvent("exec_command", { command: longCmd });
  assert.equal(out.kind, "tool_call");
  assert.equal(out.label, "⚡ Ejecutando");
  assert.ok(out.target.length <= 80, "command target should be truncated to <= 80 chars");
});

test("maps codex shell array command → tool_call joining argv", () => {
  const out = toolToProgressEvent("shell", { command: ["bash", "-lc", "ls"] });
  assert.equal(out.kind, "tool_call");
  assert.equal(out.target, "bash -lc ls");
});

test("maps codex apply_patch → file_write, preferring derivedPaths", () => {
  const out = toolToProgressEvent("apply_patch", {}, ["brand/criptan/company-context/lite.md"]);
  assert.equal(out.kind, "file_write");
  assert.equal(out.label, "📝 Escribiendo");
  assert.equal(out.target, "brand/criptan/company-context/lite.md");
});

test("unknown tool → generic tool_call with the tool name in the label", () => {
  const out = toolToProgressEvent("mcp__whatever__do", {});
  assert.equal(out.kind, "tool_call");
  assert.ok(out.label.includes("mcp__whatever__do"));
});

test("returns null for missing tool name", () => {
  assert.equal(toolToProgressEvent("", {}), null);
  assert.equal(toolToProgressEvent(undefined, {}), null);
});

test("target is undefined (not present) when no usable hint exists", () => {
  const out = toolToProgressEvent("Bash", {});
  assert.equal(out.kind, "tool_call");
  assert.equal(out.target, undefined);
});
