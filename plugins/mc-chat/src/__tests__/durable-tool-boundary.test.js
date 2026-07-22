import { test } from "node:test";
import assert from "node:assert/strict";
import { createDurableToolBoundary } from "../durable-tool-boundary.js";

function durableBoundary() {
  return createDurableToolBoundary({
    ledgerAdmissionTools: [
      "leads_search_start",
      "partnerships_discovery_start",
    ],
  });
}

test("legacy and non-canary turns keep their existing tool policy", () => {
  const boundary = durableBoundary();
  for (const toolName of [
    "exec",
    "Bash",
    "cron",
    "gateway",
    "Agent",
    "mcp__sancho__tasks_create",
  ]) {
    assert.equal(
      boundary.beforeToolCall(
        { toolName },
        { runId: "legacy-run", sessionKey: "legacy-session" },
      ),
      undefined,
    );
  }
});

test("durable turns allow explicit read-only, internal and Ledger admission tools", () => {
  const boundary = durableBoundary();
  const release = boundary.registerTurn({
    runId: "durable-run",
    sessionKey: "agent:sancho:mc-chat:growth4u:task",
    allowedLedgerAdmissions: [
      "leads_search_start",
      "partnerships_discovery_start",
    ],
  });
  assert.equal(typeof release, "function");

  for (const toolName of [
    "Read",
    "Grep",
    "web_search",
    "image",
    "Write",
    "Edit",
    "apply_patch",
    "update_plan",
    "leads_search_start",
    "partnerships_discovery_start",
  ]) {
    assert.equal(
      boundary.beforeToolCall(
        { toolName, runId: "durable-run" },
        { sessionKey: "agent:sancho:mc-chat:growth4u:task" },
      ),
      undefined,
      toolName,
    );
  }
});

test("durable turns block process, automation, handoff and arbitrary MCP tools", () => {
  const boundary = durableBoundary();
  boundary.registerTurn({
    runId: "durable-run",
    sessionKey: "agent:sancho:mc-chat:growth4u:task",
  });

  for (const toolName of [
    "Bash",
    "exec",
    "shell",
    "code_execution",
    "process",
    "cron",
    "gateway",
    "message",
    "Agent",
    "sessions_send",
    "sessions_spawn",
    "subagents",
    "browser",
    "mcp__sancho__tasks_create",
    "some_future_mutating_tool",
  ]) {
    const result = boundary.beforeToolCall(
      { toolName, runId: "durable-run" },
      { sessionKey: "agent:sancho:mc-chat:growth4u:task" },
    );
    assert.equal(result?.block, true, toolName);
    assert.match(result?.blockReason ?? "", /Ledger/);
  }
});

test("read-only Growie turns keep read tools and cannot mutate or admit effects", () => {
  const boundary = durableBoundary();
  boundary.registerTurn({
    runId: "growie-run",
    sessionKey: "agent:sancho:mc-chat:growth4u:support",
    readOnly: true,
  });

  for (const toolName of ["read", "grep", "web_fetch", "image"]) {
    assert.equal(
      boundary.beforeToolCall({ toolName }, { runId: "growie-run" }),
      undefined,
    );
  }
  for (const toolName of [
    "write",
    "edit",
    "apply_patch",
    "leads_search_start",
    "partnerships_discovery_start",
    "exec",
  ]) {
    assert.equal(
      boundary.beforeToolCall({ toolName }, { runId: "growie-run" })?.block,
      true,
      toolName,
    );
  }
});

test("release is identity-fenced and correlation conflicts fail closed", () => {
  const boundary = durableBoundary();
  const releaseFirst = boundary.registerTurn({
    runId: "run-first",
    sessionKey: "shared-session",
  });
  boundary.registerTurn({
    runId: "run-second",
    sessionKey: "shared-session",
  });
  assert.match(
    boundary.beforeToolCall(
      { toolName: "read", runId: "run-first" },
      { sessionKey: "shared-session" },
    )?.blockReason ?? "",
    /inequívoca/,
  );

  releaseFirst?.();
  assert.equal(
    boundary.beforeToolCall(
      { toolName: "exec", runId: "run-second" },
      { sessionKey: "shared-session" },
    )?.block,
    true,
  );
});
