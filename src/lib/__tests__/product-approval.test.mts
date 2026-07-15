import assert from "node:assert/strict";
import { test } from "node:test";
import {
  PRODUCT_APPROVAL_POLICY,
  PRODUCT_APPROVAL_QUORUM,
  ProductApprovalError,
  computeProductProposalHash,
  createProductApprovalDraft,
  decideProductApproval,
  isApprovedProductProposal,
  reviseProductApproval,
  submitProductApproval,
  type ProductDecisionProposal,
} from "../product-definition/approval";

const createdAt = new Date("2026-07-15T10:00:00.000Z");
const expiresAt = "2026-07-16T10:00:00.000Z";
const slackIdentityEnv = {
  SANCHO_PRODUCT_APPROVER_MARTIN_SLACK_USER_ID: "U-MARTIN",
  SANCHO_PRODUCT_APPROVER_ALFONSO_SLACK_USER_ID: "U-ALFONSO",
};

function proposal(overrides: Partial<ProductDecisionProposal> = {}): ProductDecisionProposal {
  return {
    incidentId: "inc_01",
    capabilityId: "mission-control.chat.run",
    requestedBy: {
      userId: "user_01",
      displayName: "Usuario de prueba",
      tenantSlug: "acme",
    },
    userGoal: "Continuar una ejecución que se detuvo por timeout.",
    observedBehavior: "La interfaz quedó mostrando progreso sin una respuesta terminal.",
    currentDefinition: "Un run debe terminar en success, error o cancelled.",
    decisionRequired: "Definir si se reintenta automáticamente una ejecución con efectos desconocidos.",
    proposedOutcome: "Mostrar el diagnóstico y pedir confirmación antes de reintentar.",
    impact: ["Afecta el retry de agent-runs con side effects no clasificados."],
    requiredArtifacts: ["decision", "acceptance-criteria"],
    ...overrides,
  };
}

function pendingRequest() {
  return submitProductApproval(createProductApprovalDraft({
    requestId: "pa_01",
    proposal: proposal(),
    createdBy: "growie",
    expiresAt,
  }, createdAt), new Date("2026-07-15T10:01:00.000Z"));
}

test("the product approval policy is one-of-two: Martín or Alfonso", () => {
  assert.equal(PRODUCT_APPROVAL_QUORUM, 1);
  assert.equal(PRODUCT_APPROVAL_POLICY.channelKey, "sancho-pruebas");
  assert.equal(PRODUCT_APPROVAL_POLICY.slackChannelIdEnvironmentVariable, "SANCHO_PRODUCT_APPROVAL_SLACK_CHANNEL_ID");
  assert.deepEqual(PRODUCT_APPROVAL_POLICY.approvers.map((approver) => approver.id), ["martin", "alfonso"]);
});

test("Martín can approve the exact pending proposal from an authenticated Slack identity", () => {
  const pending = pendingRequest();
  const approved = decideProductApproval(pending, {
    action: "approve",
    approverId: "martin",
    surface: "slack",
    externalUserId: "U-MARTIN",
    rationale: "La propuesta mantiene confirmación para efectos desconocidos.",
    expectedProposalHash: pending.proposalHash,
    expectedVersion: pending.version,
  }, new Date("2026-07-15T10:02:00.000Z"), slackIdentityEnv);

  assert.equal(approved.status, "approved");
  assert.equal(approved.decision?.approverId, "martin");
  assert.equal(approved.decision?.externalUserId, "U-MARTIN");
  assert.equal(isApprovedProductProposal(approved, approved.proposalHash, approved.version), true);
});

test("Alfonso can approve from Growie without requiring a Slack identity", () => {
  const pending = pendingRequest();
  const approved = decideProductApproval(pending, {
    action: "approve",
    approverId: "alfonso",
    surface: "growie",
    rationale: "Aprobado desde la superficie interna autenticada.",
    expectedProposalHash: pending.proposalHash,
    expectedVersion: pending.version,
  });
  assert.equal(approved.status, "approved");
  assert.equal(approved.decision?.approverId, "alfonso");
});

test("channel membership and an unverified Slack click do not authorize a decision", () => {
  const pending = pendingRequest();
  assert.throws(
    () => decideProductApproval(pending, {
      action: "approve",
      approverId: "channel-member",
      surface: "slack",
      externalUserId: "U-RANDOM",
      rationale: "Estoy en el canal.",
      expectedProposalHash: pending.proposalHash,
      expectedVersion: pending.version,
    }, new Date(), slackIdentityEnv),
    (error) => error instanceof ProductApprovalError && error.code === "unauthorized_approver",
  );

  assert.throws(
    () => decideProductApproval(pending, {
      action: "approve",
      approverId: "martin",
      surface: "slack",
      rationale: "Falta identidad externa autenticada.",
      expectedProposalHash: pending.proposalHash,
      expectedVersion: pending.version,
    }, new Date(), slackIdentityEnv),
    (error) => error instanceof ProductApprovalError && error.code === "unauthorized_approver",
  );

  assert.throws(
    () => decideProductApproval(pending, {
      action: "approve",
      approverId: "martin",
      surface: "slack",
      externalUserId: "U-RANDOM",
      rationale: "Intento atribuirme la identidad de Martín.",
      expectedProposalHash: pending.proposalHash,
      expectedVersion: pending.version,
    }, new Date(), slackIdentityEnv),
    (error) => error instanceof ProductApprovalError && error.code === "unauthorized_approver",
  );
});

test("requesting changes creates a new draft version and invalidates late buttons", () => {
  const pending = pendingRequest();
  const changesRequested = decideProductApproval(pending, {
    action: "request_changes",
    approverId: "martin",
    surface: "slack",
    externalUserId: "U-MARTIN",
    rationale: "Definir también el estado visible durante el retry.",
    expectedProposalHash: pending.proposalHash,
    expectedVersion: pending.version,
  }, new Date("2026-07-15T10:02:00.000Z"), slackIdentityEnv);

  const { superseded, revision } = reviseProductApproval(changesRequested, {
    proposal: proposal({
      proposedOutcome: "Mostrar diagnóstico, estado retrying y pedir confirmación antes de reintentar.",
      requiredArtifacts: ["decision", "acceptance-criteria", "copy"],
    }),
    createdBy: "growie",
    expiresAt: "2026-07-17T10:00:00.000Z",
  }, new Date("2026-07-15T10:03:00.000Z"));

  assert.equal(superseded.status, "superseded");
  assert.equal(revision.status, "draft");
  assert.equal(revision.version, 2);
  assert.equal(revision.supersedesProposalHash, pending.proposalHash);
  assert.notEqual(revision.proposalHash, pending.proposalHash);

  const revisedPending = submitProductApproval(revision, new Date("2026-07-15T10:04:00.000Z"));
  assert.throws(
    () => decideProductApproval(revisedPending, {
      action: "approve",
      approverId: "alfonso",
      surface: "slack",
      externalUserId: "U-ALFONSO",
      rationale: "Este botón pertenece a la versión anterior.",
      expectedProposalHash: pending.proposalHash,
      expectedVersion: pending.version,
    }),
    (error) => error instanceof ProductApprovalError && error.code === "stale_proposal",
  );
});

test("proposal hashes are deterministic but version-bound", () => {
  const value = proposal();
  assert.equal(computeProductProposalHash(value, 1), computeProductProposalHash(structuredClone(value), 1));
  assert.notEqual(computeProductProposalHash(value, 1), computeProductProposalHash(value, 2));
});
