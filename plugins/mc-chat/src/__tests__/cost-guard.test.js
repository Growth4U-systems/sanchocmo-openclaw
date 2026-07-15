import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createCostGuard,
  estimateBeforeAgentRunTokens,
  readCostGuardLimits,
} from "../cost-guard.js";

test("readCostGuardLimits reads env overrides with sane fallbacks", () => {
  const limits = readCostGuardLimits({
    MC_CHAT_COST_GUARD_ENABLED: "false",
    MC_CHAT_MAX_MODEL_CALLS_PER_RUN: "7",
    MC_CHAT_MAX_PROMPT_TOKENS_AT_START: "bad",
  });

  assert.equal(limits.enabled, false);
  assert.equal(limits.maxModelCallsPerRun, 7);
  assert.equal(limits.maxPromptTokensAtStart, 140_000);
  assert.equal(limits.maxToolCallsPerRun, 36);
  assert.equal(limits.maxRiskyToolCallsPerRun, 10);
});

test("estimateBeforeAgentRunTokens includes system prompt, user prompt and history", () => {
  const tokens = estimateBeforeAgentRunTokens({
    systemPrompt: "a".repeat(400),
    prompt: "b".repeat(400),
    messages: [{ role: "assistant", content: "c".repeat(400) }],
  });

  assert.equal(tokens, 300);
});

test("beforeAgentRun blocks an oversized prepared prompt before provider call", () => {
  const guard = createCostGuard({
    env: {
      MC_CHAT_MAX_PROMPT_TOKENS_AT_START: "10",
      MC_CHAT_COST_GUARD_COOLDOWN_MS: "1000",
    },
    clock: () => 1_000,
  });

  const result = guard.beforeAgentRun(
    { prompt: "x".repeat(80), messages: [] },
    { sessionKey: "agent:hamete:thread:1" },
  );

  assert.equal(result.outcome, "block");
  assert.match(result.message, /No se completó la ejecución/);

  const cooled = guard.beforeAgentRun(
    { prompt: "ok", messages: [] },
    { sessionKey: "agent:hamete:thread:1" },
  );
  assert.equal(cooled.outcome, "block");
});

test("modelCallStarted aborts once a run exceeds the model-call budget", () => {
  let aborted = false;
  const guard = createCostGuard({
    env: { MC_CHAT_MAX_MODEL_CALLS_PER_RUN: "2" },
    clock: () => 1_000,
  });
  guard.registerActiveTurn({
    runId: "run-1",
    sessionKey: "session-1",
    abortController: { abort: () => { aborted = true; } },
  });

  guard.modelCallStarted({ runId: "run-1" }, { runId: "run-1", sessionKey: "session-1" });
  guard.modelCallStarted({ runId: "run-1" }, { runId: "run-1", sessionKey: "session-1" });
  assert.equal(aborted, false);

  guard.modelCallStarted({ runId: "run-1" }, { runId: "run-1", sessionKey: "session-1" });
  assert.equal(aborted, true);
  assert.match(guard.abortMessageFor("run-1", "session-1"), /llamadas al modelo/);
});

test("modelCallStarted reuses the active session when hooks omit runId", () => {
  let aborted = false;
  const guard = createCostGuard({
    env: { MC_CHAT_MAX_MODEL_CALLS_PER_RUN: "1" },
    clock: () => 1_000,
  });
  guard.registerActiveTurn({
    runId: "run-with-controller",
    sessionKey: "session-only-hook",
    abortController: { abort: () => { aborted = true; } },
  });

  guard.modelCallStarted({}, { sessionKey: "session-only-hook" });
  assert.equal(aborted, false);

  guard.modelCallStarted({}, { sessionKey: "session-only-hook" });
  assert.equal(aborted, true);
  assert.match(guard.abortMessageFor("run-with-controller", "session-only-hook"), /llamadas al modelo/);
});

test("abortRun records wall-clock timeouts as cost-guard stops", () => {
  let aborted = false;
  const guard = createCostGuard({ clock: () => 1_000 });
  guard.registerActiveTurn({
    runId: "run-timeout",
    sessionKey: "session-timeout",
    abortController: { abort: () => { aborted = true; } },
  });

  const message = guard.abortRun("run-timeout", "session-timeout", "La ejecución superó el tiempo máximo permitido.");

  assert.equal(aborted, true);
  assert.match(message, /No se completó la ejecución/);
  assert.match(guard.abortMessageFor("run-timeout", "session-timeout"), /tiempo máximo/);
});

test("cancelRun aborts the active session without adding a cooldown", () => {
  let abortedWith = null;
  const guard = createCostGuard({ clock: () => 1_000 });
  guard.registerActiveTurn({
    runId: "run-cancel",
    sessionKey: "session-cancel",
    abortController: { abort: (reason) => { abortedWith = reason; } },
  });

  assert.equal(guard.cancelRun("session-cancel"), true);
  assert.match(abortedWith?.message || "", /detenida por el usuario/);
  assert.equal(guard.abortMessageFor("run-cancel", "session-cancel"), null);
  assert.equal(
    guard.beforeAgentRun({ prompt: "nuevo turno", messages: [] }, { sessionKey: "session-cancel" }).outcome,
    "pass",
  );
  assert.equal(guard.cancelRun("missing-session"), false);
});

test("llmOutput aborts on repeated tiny outputs with large prompts", () => {
  let aborted = false;
  const guard = createCostGuard({
    env: {
      MC_CHAT_MAX_TINY_OUTPUT_STREAK: "2",
      MC_CHAT_TINY_OUTPUT_TOKENS: "20",
      MC_CHAT_TINY_OUTPUT_MIN_INPUT_TOKENS: "100",
    },
    clock: () => 1_000,
  });
  guard.registerActiveTurn({
    runId: "run-2",
    sessionKey: "session-2",
    abortController: { abort: () => { aborted = true; } },
  });

  guard.llmOutput(
    { runId: "run-2", usage: { input: 120, output: 10 } },
    { runId: "run-2", sessionKey: "session-2" },
  );
  assert.equal(aborted, false);

  guard.llmOutput(
    { runId: "run-2", usage: { input: 130, output: 0 } },
    { runId: "run-2", sessionKey: "session-2" },
  );
  assert.equal(aborted, true);
  assert.match(guard.abortMessageFor("run-2", "session-2"), /casi vacías/);
});

test("beforeToolCall blocks repeated session history reads", () => {
  let aborted = false;
  const guard = createCostGuard({
    env: { MC_CHAT_MAX_SESSION_HISTORY_CALLS_PER_RUN: "1" },
    clock: () => 1_000,
  });
  guard.registerActiveTurn({
    runId: "run-history",
    sessionKey: "session-history",
    abortController: { abort: () => { aborted = true; } },
  });

  assert.equal(
    guard.beforeToolCall(
      { name: "sessions_history", input: { sessionKey: "current", limit: 30 } },
      { runId: "run-history", sessionKey: "session-history" },
    ),
    undefined,
  );
  const blocked = guard.beforeToolCall(
    { name: "sessions_history", input: { sessionKey: "current", limit: 100 } },
    { runId: "run-history", sessionKey: "session-history" },
  );

  assert.equal(aborted, true);
  assert.equal(blocked.block, true);
  assert.match(blocked.blockReason, /historial de sesión/);
});

test("beforeToolCall blocks repeated broad filesystem probes", () => {
  let aborted = false;
  const guard = createCostGuard({
    env: { MC_CHAT_MAX_RISKY_TOOL_CALLS_PER_RUN: "2" },
    clock: () => 1_000,
  });
  guard.registerActiveTurn({
    runId: "run-risky",
    sessionKey: "session-risky",
    abortController: { abort: () => { aborted = true; } },
  });

  guard.beforeToolCall(
    { name: "exec", input: { command: "find /root/.openclaw -path '*brand/growth4u*' -type f" } },
    { runId: "run-risky", sessionKey: "session-risky" },
  );
  guard.beforeToolCall(
    { name: "exec", input: { command: "grep -rn \"partnerships\" /app" } },
    { runId: "run-risky", sessionKey: "session-risky" },
  );
  const blocked = guard.beforeToolCall(
    { name: "exec", input: { command: "for f in /root/.openclaw/workspace-sancho/brand/growth4u/outreach/searches/*.json; do cat \"$f\"; done" } },
    { runId: "run-risky", sessionKey: "session-risky" },
  );

  assert.equal(aborted, true);
  assert.equal(blocked.block, true);
  assert.match(blocked.blockReason, /herramientas de riesgo/);
});

test("beforeToolCall allows scoped code searches but still guards runtime roots", () => {
  const guard = createCostGuard({
    env: { MC_CHAT_MAX_RISKY_TOOL_CALLS_PER_RUN: "1" },
    clock: () => 1_000,
  });
  guard.registerActiveTurn({
    runId: "run-scoped-search",
    sessionKey: "session-scoped-search",
    abortController: { abort: () => {} },
  });

  const scoped = guard.beforeToolCall(
    { name: "exec", input: { command: "rg -n partnerships /app/mc-nextjs/src/lib" } },
    { runId: "run-scoped-search", sessionKey: "session-scoped-search" },
  );
  assert.equal(scoped, undefined);

  guard.beforeToolCall(
    { name: "exec", input: { command: "rg -n partnerships /app" } },
    { runId: "run-scoped-search", sessionKey: "session-scoped-search" },
  );
  const blocked = guard.beforeToolCall(
    { name: "exec", input: { command: "find /root/.openclaw -name '*.json'" } },
    { runId: "run-scoped-search", sessionKey: "session-scoped-search" },
  );
  assert.equal(blocked.block, true);
});

test("a managed turn can resume immediately in the same session after a reactive stop", () => {
  const guard = createCostGuard({
    env: { MC_CHAT_MAX_RISKY_TOOL_CALLS_PER_RUN: "1" },
    clock: () => 1_000,
  });
  guard.registerActiveTurn({
    runId: "run-blocked",
    sessionKey: "session-resume",
    abortController: { abort: () => {} },
  });
  guard.beforeToolCall(
    { name: "exec", input: { command: "rg foo /app" } },
    { runId: "run-blocked", sessionKey: "session-resume" },
  );
  guard.beforeToolCall(
    { name: "exec", input: { command: "find /root/.openclaw -type f" } },
    { runId: "run-blocked", sessionKey: "session-resume" },
  );
  guard.clearActiveTurn("run-blocked", "session-resume");

  assert.deepEqual(
    guard.beforeAgentRun({ sessionKey: "session-resume", prompt: "continúa" }, { sessionKey: "session-resume" }),
    { outcome: "pass" },
  );
  guard.registerActiveTurn({
    runId: "run-resumed",
    sessionKey: "session-resume",
    abortController: { abort: () => {} },
  });
  const firstRiskInNewTurn = guard.beforeToolCall(
    { name: "exec", input: { command: "rg foo /app" } },
    { runId: "run-resumed", sessionKey: "session-resume" },
  );
  assert.equal(firstRiskInNewTurn, undefined);
});

test("beforeToolCall blocks exact repeated tool calls", () => {
  let aborted = false;
  const guard = createCostGuard({
    env: { MC_CHAT_MAX_REPEATED_TOOL_CALLS_PER_RUN: "2" },
    clock: () => 1_000,
  });
  guard.registerActiveTurn({
    runId: "run-repeat",
    sessionKey: "session-repeat",
    abortController: { abort: () => { aborted = true; } },
  });

  const event = { name: "exec", input: { command: "ls /tmp" } };
  guard.beforeToolCall(event, { runId: "run-repeat", sessionKey: "session-repeat" });
  guard.beforeToolCall(event, { runId: "run-repeat", sessionKey: "session-repeat" });
  const blocked = guard.beforeToolCall(event, { runId: "run-repeat", sessionKey: "session-repeat" });

  assert.equal(aborted, true);
  assert.equal(blocked.block, true);
  assert.match(blocked.blockReason, /misma llamada de herramienta/);
});

test("blocked reason survives agent_end until the channel fallback consumes it", () => {
  const guard = createCostGuard({
    env: { MC_CHAT_MAX_RISKY_TOOL_CALLS_PER_RUN: "1" },
    clock: () => 1_000,
  });
  guard.registerActiveTurn({
    runId: "run-lifecycle",
    sessionKey: "session-lifecycle",
    abortController: { abort: () => {} },
  });

  guard.beforeToolCall(
    { name: "exec", input: { command: "find /root/.openclaw -type f" } },
    { runId: "run-lifecycle", sessionKey: "session-lifecycle" },
  );
  guard.beforeToolCall(
    { name: "exec", input: { command: "grep -rn partnerships /app" } },
    { runId: "run-lifecycle", sessionKey: "session-lifecycle" },
  );

  guard.agentEnd({}, { runId: "run-lifecycle", sessionKey: "session-lifecycle" });
  assert.match(
    guard.abortMessageFor("run-lifecycle", "session-lifecycle"),
    /herramientas de riesgo/,
  );

  guard.clearActiveTurn("run-lifecycle", "session-lifecycle");
  assert.equal(guard.abortMessageFor("run-lifecycle", "session-lifecycle"), null);
});

test("agent_end still cleans blocked runs that are not managed MC turns", () => {
  const guard = createCostGuard({
    env: { MC_CHAT_MAX_MODEL_CALLS_PER_RUN: "1" },
    clock: () => 1_000,
  });

  guard.modelCallStarted({ runId: "other-run" }, { runId: "other-run" });
  guard.modelCallStarted({ runId: "other-run" }, { runId: "other-run" });
  assert.match(guard.abortMessageFor("other-run"), /llamadas al modelo/);

  guard.agentEnd({}, { runId: "other-run" });
  assert.equal(guard.abortMessageFor("other-run"), null);
});
