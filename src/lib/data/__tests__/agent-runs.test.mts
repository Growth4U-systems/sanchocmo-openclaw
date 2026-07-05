import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "sancho-agent-runs-"));
process.env.MC_WORKSPACE = tmp;

const mod = await import("../agent-runs");
const agentRuns = (mod as unknown as { default: typeof mod }).default ?? mod;

test("agent run ledger records lifecycle events for a thread", () => {
  const run = agentRuns.createAgentRun({
    threadId: "acme:general",
    runtime: "openclaw",
    agent: "sancho",
    skill: "sancho-manager",
    input: { text: "hola" },
    now: new Date("2026-06-30T10:00:00.000Z"),
  });

  assert.equal(run.status, "queued");
  assert.equal(run.threadId, "acme:general");

  agentRuns.markAgentRunDispatched(run.id, run.threadId, { chatId: "acme:general" });
  assert.equal(agentRuns.getLatestActiveRun(run.threadId)?.id, run.id);

  agentRuns.appendAgentRunEvent({
    runId: run.id,
    threadId: run.threadId,
    type: "progress",
    data: { kind: "tool_call", label: "Leyendo docs" },
    now: new Date("2026-06-30T10:00:01.000Z"),
  });

  agentRuns.markAgentRunCompleted(run.id, run.threadId, { text: "listo" });

  const runs = agentRuns.listAgentRunsForThread(run.threadId);
  assert.equal(runs.length, 1);
  assert.equal(runs[0].status, "completed");
  assert.equal(agentRuns.getLatestActiveRun(run.threadId), null);

  const events = agentRuns.listAgentRunEvents(run.id);
  assert.deepEqual(events.map((event) => event.type), [
    "run_created",
    "runtime_dispatched",
    "progress",
    "bot_reply",
  ]);
});

test("agent run ledger marks failures and cancellations terminal", () => {
  const failed = agentRuns.createAgentRun({
    threadId: "acme:fail",
    runtime: "openclaw",
  });
  agentRuns.markAgentRunFailed(failed.id, failed.threadId, "HTTP 500", "runtime_rejected");
  assert.equal(agentRuns.listAgentRunsForThread(failed.threadId)[0].status, "failed");
  assert.equal(agentRuns.getLatestActiveRun(failed.threadId), null);

  const cancelled = agentRuns.createAgentRun({
    threadId: "acme:cancel",
    runtime: "openclaw",
  });
  agentRuns.markAgentRunCancelled(cancelled.id, cancelled.threadId, { requestedAgent: "sancho" });
  assert.equal(agentRuns.listAgentRunsForThread(cancelled.threadId)[0].status, "cancelled");
  assert.equal(agentRuns.getLatestActiveRun(cancelled.threadId), null);
});
