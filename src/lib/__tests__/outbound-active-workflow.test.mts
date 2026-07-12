import assert from "node:assert/strict";
import test from "node:test";

const { resolveActiveOutboundWorkflow } = await import("../outreach/active-workflow");

test("resolves the latest persisted outbound workflow as trusted turn context", () => {
  const context = resolveActiveOutboundWorkflow({
    messages: [
      { role: "workflow", text: "old", ts: 1, workflowJob: {
        jobId: "job-old",
        type: "campaign.workflow.prepare",
        status: "completed",
        campaignId: "campaign-old",
        runId: "run-old",
        batch: { itemCount: 1, sample: [{ messageBody: "old" }] },
      } },
      { role: "user", text: "cámbialos", ts: 2 },
      { role: "workflow", text: "ready", ts: 3, workflowJob: {
        jobId: "job-new",
        type: "campaign.workflow.rewrite",
        status: "completed",
        campaignId: "campaign-new",
        runId: "run-new",
        batch: { itemCount: 3, sample: [{ leadId: "lead-1", messageBody: "Hola Ruth" }] },
      } },
    ],
  });

  assert.deepEqual(context, {
    campaignId: "campaign-new",
    runId: "run-new",
    status: "awaiting_approval",
    lastOperation: "campaign.workflow.rewrite",
    batch: { itemCount: 3, sample: [{ leadId: "lead-1", messageBody: "Hola Ruth" }] },
  });
});

test("does not invent workflow context from ordinary chat prose", () => {
  assert.equal(resolveActiveOutboundWorkflow({
    messages: [{ role: "bot", text: "Campaña campaign-1", ts: 1 }],
  }), undefined);
});

test("preserves the persisted workflow state when a campaign is opened from the UI", () => {
  const context = resolveActiveOutboundWorkflow({
    messages: [{ role: "workflow", text: "loaded", ts: 1, workflowJob: {
      jobId: "campaign-context:run-1",
      type: "campaign.workflow.status",
      status: "completed",
      workflowStatus: "approved",
      campaignId: "campaign-1",
      runId: "run-1",
      batch: { itemCount: 2, sample: [] },
    } }],
  });

  assert.equal(context?.status, "approved");
  assert.equal(context?.campaignId, "campaign-1");
});
