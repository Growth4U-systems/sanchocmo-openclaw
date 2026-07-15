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
    skillMode: "pinned",
    taskId: "P01-T01",
    taskContract: {
      completion: "Report exists",
      expectedOutputs: [{ path: "brand/acme/report.md", source: "deliverable_file" }],
    },
    input: { text: "hola" },
    now: new Date("2026-06-30T10:00:00.000Z"),
  });

  assert.equal(run.status, "queued");
  assert.equal(run.threadId, "acme:general");
  assert.equal(run.skillMode, "pinned");
  assert.equal(run.taskId, "P01-T01");
  assert.equal(run.taskContract?.expectedOutputs[0].path, "brand/acme/report.md");

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
  assert.equal((events[0].data as { skillMode?: string }).skillMode, "pinned");
  assert.equal((events[0].data as { taskId?: string }).taskId, "P01-T01");
  const snapshot = agentRuns.readAgentRunsSnapshot();
  assert.equal(snapshot.runs.some((entry) => entry.id === run.id), true);
  assert.equal(agentRuns.AGENT_RUN_RETENTION.maxRuns, 2000);
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

test("agent runs support exact callback lookup and retry idempotency keys", () => {
  const first = agentRuns.createAgentRun({
    threadId: "acme:shared",
    runtime: "external-http",
    agent: "rocinante",
    idempotencyKey: "mc-control:owner:temporary",
  });
  const second = agentRuns.createAgentRun({
    threadId: "acme:shared",
    runtime: "external-http",
    agent: "sancho",
  });

  assert.equal(agentRuns.getAgentRunById(first.id)?.agent, "rocinante");
  assert.equal(agentRuns.getAgentRunById(second.id)?.agent, "sancho");
  assert.equal(
    agentRuns.getAgentRunByIdempotencyKey("acme:shared", "mc-control:owner:temporary")?.id,
    first.id,
  );
  assert.equal(
    agentRuns.getAgentRunByIdempotencyKey("acme:other", "mc-control:owner:temporary"),
    null,
  );
});

test("terminal agent-run state is monotonic under late callbacks", () => {
  const run = agentRuns.createAgentRun({
    threadId: "acme:monotonic",
    runtime: "external-http",
  });
  agentRuns.markAgentRunCompleted(run.id, run.threadId, { text: "winner" });
  agentRuns.markAgentRunDispatched(run.id, run.threadId, { late: true });
  agentRuns.markAgentRunFailed(run.id, run.threadId, "late failure");

  const stored = agentRuns.getAgentRunById(run.id);
  assert.equal(stored?.status, "completed");
  assert.deepEqual(stored?.output, { text: "winner" });
  assert.deepEqual(
    agentRuns.listAgentRunEvents(run.id).map((event) => event.type),
    ["run_created", "bot_reply"],
  );
});

test("async facade atomically reuses an in-flight idempotency key and correlates trace events", async () => {
  const input = {
    threadId: "acme:concurrent",
    runtime: "external-http",
    idempotencyKey: "retry:concurrent:1",
    traceId: "trace-concurrent-1",
  };
  const receipts = await Promise.all([
    agentRuns.createAgentRunWithReceiptAsync(input),
    agentRuns.createAgentRunWithReceiptAsync(input),
  ]);

  assert.equal(receipts.filter((receipt) => receipt.created).length, 1);
  assert.equal(new Set(receipts.map((receipt) => receipt.run.id)).size, 1);
  const run = receipts[0].run;
  assert.equal(run.traceId, "trace-concurrent-1");
  const events = await agentRuns.listAgentRunEventsForTraceAsync("trace-concurrent-1");
  assert.deepEqual(events.map((event) => event.type), ["run_created"]);
  assert.equal(events[0].runId, run.id);
  assert.equal(events[0].traceId, run.traceId);
});
