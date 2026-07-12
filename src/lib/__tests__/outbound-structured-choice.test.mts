import assert from "node:assert/strict";
import test from "node:test";

const imported = await import("../outreach/structured-choice");
const structuredChoice = (imported as unknown as { default?: typeof imported }).default ?? imported;
const { resolveOutboundWorkflowChoice } = structuredChoice;

const intent = {
  schemaVersion: 1,
  channel: "linkedin",
  title: "Founders SaaS España",
  ecpId: "solo-technical-founder",
  targetSegment: "Founders de empresas SaaS post-PMF en España",
  contactReason: "Quiero compartir una forma más simple de instalar un sistema de growth",
  batchSize: 1000,
  discoveryStrategy: "account_first_v1",
  accountTarget: {
    description: "Empresas SaaS post-PMF en España, 5-200 empleados",
    keywords: "SaaS post-PMF",
    locations: ["Spain"],
    employeeRanges: ["5,200"],
  },
  personTarget: {
    description: "Founders y CEOs",
    titles: ["Founder", "CEO"],
  },
};

const botText = `Elige un ECP.

:::ask
${JSON.stringify({
  id: "outbound_ecp_v1",
  prompt: "¿Con qué segmento empezamos?",
  mode: "single",
  options: [{
    id: "solo-founder",
    label: "Solo Technical Founder · SaaS 5-200 España · Founder/CEO",
    recommended: true,
    workflowIntent: intent,
  }],
})}
:::`;

test("resolves the hidden workflow intent from the persisted bot message", () => {
  const choice = resolveOutboundWorkflowChoice({
    messages: [{ role: "bot", text: botText, ts: 1 }],
  }, "[ask:outbound_ecp_v1] respuesta: Solo Technical Founder <!--workflow-option:solo-founder-->");

  assert.equal(choice?.optionId, "solo-founder");
  assert.equal(choice?.intent.discoveryStrategy, "account_first_v1");
  assert.deepEqual(choice?.intent.accountTarget, intent.accountTarget);
  assert.deepEqual(choice?.intent.personTarget, intent.personTarget);
});

test("does not accept a browser marker without a matching persisted option", () => {
  const choice = resolveOutboundWorkflowChoice({
    messages: [{ role: "bot", text: botText, ts: 1 }],
  }, "[ask:outbound_ecp_v1] respuesta: Inventado <!--workflow-option:not-real-->");
  assert.equal(choice, null);
});

test("rejects a workflow option that changes channel or discovery strategy", () => {
  const unsafeText = botText.replace('"channel":"linkedin"', '"channel":"email"');
  const choice = resolveOutboundWorkflowChoice({
    messages: [{ role: "bot", text: unsafeText, ts: 1 }],
  }, "[ask:outbound_ecp_v1] respuesta: Solo Technical Founder <!--workflow-option:solo-founder-->");
  assert.equal(choice, null);
});
