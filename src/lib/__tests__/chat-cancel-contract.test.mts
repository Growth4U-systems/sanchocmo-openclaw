import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const workspace = process.cwd();
const cancelApi = fs.readFileSync(
  path.join(workspace, "src/pages/api/chat/cancel.ts"),
  "utf8",
);
const atomicAdmission = fs.readFileSync(
  path.join(workspace, "src/lib/chat/agent-turn-atomic-admission.ts"),
  "utf8",
);
const postgresAgentRuns = fs.readFileSync(
  path.join(workspace, "src/lib/data/agent-runs-postgres.ts"),
  "utf8",
);
const plugin = fs.readFileSync(
  path.join(workspace, "plugins/mc-chat/src/index.js"),
  "utf8",
);

test("chat cancel aborts the active OpenClaw turn", () => {
  assert.match(plugin, /mcChatCostGuard\.cancelRun\(/);
  assert.match(
    plugin,
    /cancelled,\s*chatId,\s*finalText,\s*finalAgent: requestedAgent,/,
  );
  assert.match(
    plugin,
    /message: cancelled[\s\S]*\? "Active turn cancelled"[\s\S]*: "No active turn found"/,
  );
});

test("chat cancel records one terminal note only for an active run", () => {
  assert.match(
    cancelApi,
    /originCancellationPending[\s\S]*Cancelación solicitada\. Esperando confirmación de las tareas activas\.[\s\S]*Ejecución detenida\./,
  );
  assert.match(cancelApi, /alreadyStopped: originAlreadyStopped/);
  assert.match(cancelApi, /runtimeCancelled/);
});

test("child admission locks the active parent row before either AgentRun insert", () => {
  for (const source of [postgresAgentRuns, atomicAdmission]) {
    assert.match(
      source,
      /FROM "agent_runs"[\s\S]*"status" IN \('queued', 'running'\)[\s\S]*FOR UPDATE/,
    );
    assert.match(source, /FROM (?:parent_gate|active_parent_gate)/);
  }
  assert.match(atomicAdmission, /FROM inserted_parent[\s\S]*ON CONFLICT DO NOTHING/);
});

test("chat cancel seals the origin, tombstones the parent, and still reaches the runtime", () => {
  const originSeal = cancelApi.indexOf(
    "originCancellation = await sealExecutionOriginCancellation",
  );
  const parentTombstone = cancelApi.indexOf(
    "const tombstone = await markAgentRunCancelledAsync",
  );
  const childDrain = cancelApi.indexOf(
    "const childCancellation = await cancelSealedExecutionOriginChildren",
  );
  const agentRunChildDrain = cancelApi.indexOf(
    "const activeChildren = await listActiveChildAgentRunsAsync",
  );
  const runtimeCancellation = cancelApi.indexOf(
    "await runtime.messaging.cancel",
  );
  const runtimeStop = cancelApi.indexOf(
    "const result = await runtime.messaging.sendInbound",
  );
  assert.ok(originSeal >= 0);
  assert.ok(parentTombstone > originSeal);
  assert.ok(agentRunChildDrain > parentTombstone);
  assert.ok(childDrain > parentTombstone);
  assert.ok(runtimeCancellation > childDrain);
  assert.ok(runtimeStop > runtimeCancellation);
  assert.match(cancelApi, /code: "runtime_stop_delivery_failed"/);
  assert.match(
    cancelApi,
    /return res\.status\(503\)\.json\(\{[\s\S]*?retryable: true,[\s\S]*?runtimeStopDelivered: false/,
  );
  assert.match(cancelApi, /originCancellationUnavailable/);
  assert.match(cancelApi, /parentTombstoned/);
  assert.match(cancelApi, /code: "control_parent_stopped"/);
  assert.match(
    cancelApi,
    /createRuntimeAdapter\(childRuntimeId\)\.messaging\.cancel\(/,
  );
  assert.match(cancelApi, /runtimeControlAction: "stop"/);
  assert.match(cancelApi, /"X-Sancho-Control-Action": "stop"/);
});
