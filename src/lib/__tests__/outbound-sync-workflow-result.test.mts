import assert from "node:assert/strict";
import test from "node:test";

const { buildSynchronousOutboundWorkflowMessage } = await import("../outreach/sync-workflow-result");

test("turns a synchronous batch rewrite into a persisted workflow event", () => {
  const message = buildSynchronousOutboundWorkflowMessage("growth4u", {
    command: "outbound.workflow.rewrite",
    callbackContext: { slug: "growth4u", threadId: "growth4u:b2b-1", agent: "rocinante" },
  }, {
    campaignId: "campaign-1",
    runId: "run-1",
    batch: {
      itemCount: 3,
      contentHash: "abcdef0123456789abcdef",
      sample: [{ leadId: "lead-1", messageBody: "Hola Ruth" }],
    },
  });

  assert.equal(message?.threadId, "growth4u:b2b-1");
  assert.equal(message?.event.type, "campaign.workflow.rewrite");
  assert.equal(message?.event.workflowStatus, "awaiting_approval");
  assert.deepEqual(message?.event.batch, {
    itemCount: 3,
    sample: [{ leadId: "lead-1", messageBody: "Hola Ruth" }],
  });
});

test("rejects a browser-supplied thread outside the authenticated slug", () => {
  assert.equal(buildSynchronousOutboundWorkflowMessage("growth4u", {
    command: "outbound.workflow.rewrite",
    callbackContext: { threadId: "other:b2b-1" },
  }, {}), null);
});
