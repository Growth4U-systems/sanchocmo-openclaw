import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "sancho-workflow-job-"));
process.env.MC_WORKSPACE = workspace;

const mc = await import("../mc-chat");
const api = (mc as unknown as { default: typeof mc }).default ?? mc;

test("workflow job callback retries update one visible event", () => {
  const threadId = "growth4u:linkedin-v1";
  api.upsertWorkflowJobMessage(threadId, "Preparando campaña...", {
    jobId: "job-1",
    type: "campaign.workflow.prepare",
    status: "completed",
    campaignId: "campaign-1",
  }, "rocinante");
  const first = api.getThread(threadId).messages[0];

  api.upsertWorkflowJobMessage(threadId, "Campaña lista para revisar: 50 mensajes preparados.", {
    jobId: "job-1",
    type: "campaign.workflow.prepare",
    status: "completed",
    campaignId: "campaign-1",
    runId: "run-1",
    batch: { itemCount: 50, sample: [] },
  }, "rocinante");

  const messages = api.getThread(threadId).messages;
  assert.equal(messages.length, 1);
  assert.equal(messages[0].ts, first.ts);
  assert.equal(messages[0].text, "Campaña lista para revisar: 50 mensajes preparados.");
  assert.equal(messages[0].workflowJob?.runId, "run-1");
});

test("campaign workflow transitions replace the prior card for the same run", () => {
  const threadId = "growth4u:campaign-run";
  api.upsertWorkflowJobMessage(threadId, "Campaña cargada", {
    jobId: "context-run-2",
    type: "campaign.workflow.status",
    status: "completed",
    campaignId: "campaign-2",
    runId: "run-2",
  }, "rocinante");
  api.upsertWorkflowJobMessage(threadId, "Mensajes actualizados", {
    jobId: "rewrite-run-2",
    type: "campaign.workflow.rewrite",
    status: "completed",
    campaignId: "campaign-2",
    runId: "run-2",
  }, "rocinante");

  const messages = api.getThread(threadId).messages;
  assert.equal(messages.length, 1);
  assert.equal(messages[0].text, "Mensajes actualizados");
  assert.equal(messages[0].workflowJob?.type, "campaign.workflow.rewrite");
});

test.after(() => {
  fs.rmSync(workspace, { recursive: true, force: true });
});
