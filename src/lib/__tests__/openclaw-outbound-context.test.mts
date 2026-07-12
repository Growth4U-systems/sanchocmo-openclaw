import assert from "node:assert/strict";
import test from "node:test";

const { textWithActiveOutboundWorkflow } = await import("../runtime/adapters/openclaw/messaging");

test("adds trusted workflow state to the runtime turn without changing the stored user text", () => {
  const text = textWithActiveOutboundWorkflow({
    slug: "growth4u",
    threadId: "growth4u:b2b-1",
    text: "Quiero un hook mejor",
    userId: "user-1",
    userName: "Martin",
    controlBaseUrl: "http://127.0.0.1:3000",
    activeOutboundWorkflow: {
      campaignId: "campaign-1",
      runId: "run-1",
      status: "awaiting_approval",
      lastOperation: "campaign.workflow.prepare",
      batch: { itemCount: 3, sample: [{ messageBody: "Hola Ruth" }] },
    },
  });

  assert.match(text, /Trusted Mission Control Outbound Control/);
  assert.match(text, /"campaignId":"campaign-1"/);
  assert.match(text, /outbound\.workflow\.rewrite/);
  assert.match(text, /yalc-client\.mjs/);
  assert.match(text, /Do not read or discover skill files/);
  assert.ok(text.endsWith("Quiero un hook mejor"));
});

test("gives a new outbound conversation a typed setup bus without guessing phrases", () => {
  const text = textWithActiveOutboundWorkflow({
    slug: "growth4u",
    threadId: "growth4u:yalc",
    missionControlRunId: "run-request-1",
    text: "ayúdame a montar outbound",
    userId: "user-1",
    userName: "Martin",
    skill: "yalc-operator",
    controlBaseUrl: "http://127.0.0.1:3000",
  });

  assert.match(text, /outbound-campaign-options/);
  assert.match(text, /outbound-campaign-start/);
  assert.match(text, /"requestId":"run-request-1"/);
  assert.match(text, /never classify it with a finite phrase list/i);
  assert.ok(text.endsWith("ayúdame a montar outbound"));
});

test("leaves ordinary turns byte-for-byte unchanged", () => {
  assert.equal(textWithActiveOutboundWorkflow({
    slug: "growth4u",
    threadId: "growth4u:general",
    text: "  Hola  ",
    userId: "user-1",
    userName: "Martin",
  }), "  Hola  ");
});
