import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "sancho-task-route-proposals-"));
process.env.MC_WORKSPACE = tmp;
process.env.MC_TASKS_BACKEND = "json";

const {
  consumeTaskRouteProposal,
  getPendingTaskRouteProposal,
  isExplicitNewTaskSelection,
  isExplicitTaskCreationRejection,
  isExplicitTaskCreationConfirmation,
  issueTaskRouteProposal,
  proposalMatches,
  resetTaskRouteProposalsForTests,
} = await import("../task-route-proposals");

const input = {
  clientSlug: "demo",
  sourceThreadId: "demo:task-p1-t1",
  groupId: "P1",
  agent: "rocinante",
  skill: "outreach-playbook",
  name: "Crear secuencia",
  brief: "Crear la secuencia aprobada.",
};

test("a proposal is durable, scoped, expiring and one-time", async () => {
  resetTaskRouteProposalsForTests();
  const now = Date.now();
  const proposal = await issueTaskRouteProposal(input, now);
  assert.equal(fs.existsSync(path.join(tmp, "_system", "task-route-proposals.json")), true);
  assert.equal((await getPendingTaskRouteProposal("demo", "demo:task-p1-t1", now + 1))?.id, proposal.id);
  assert.equal(proposalMatches(proposal, input), true);
  assert.equal(proposalMatches(proposal, { ...input, groupId: "P2" }), false);
  assert.equal((await consumeTaskRouteProposal(proposal.id))?.id, proposal.id);
  assert.equal(await consumeTaskRouteProposal(proposal.id), undefined);
});

test("a proposal no longer matches if the candidate set changed", async () => {
  resetTaskRouteProposalsForTests();
  const proposal = await issueTaskRouteProposal({ ...input, candidateTaskIds: ["P1-T2", "P1-T3"] });
  assert.equal(proposalMatches(proposal, { ...input, candidateTaskIds: ["P1-T3", "P1-T2"] }), true);
  assert.equal(proposalMatches(proposal, { ...input, candidateTaskIds: ["P1-T2", "P1-T3", "P1-T4"] }), false);
});

test("a newer proposal replaces the old proposal for the same source thread", async () => {
  resetTaskRouteProposalsForTests();
  const now = Date.now();
  const first = await issueTaskRouteProposal(input, now);
  const second = await issueTaskRouteProposal({ ...input, name: "Nueva propuesta" }, now + 1);
  assert.equal(await consumeTaskRouteProposal(first.id), undefined);
  assert.equal((await getPendingTaskRouteProposal(input.clientSlug, input.sourceThreadId))?.id, second.id);
});

test("only one concurrent consumer can claim a proposal", async () => {
  resetTaskRouteProposalsForTests();
  const proposal = await issueTaskRouteProposal(input);
  const claims = await Promise.all([
    consumeTaskRouteProposal(proposal.id),
    consumeTaskRouteProposal(proposal.id),
  ]);
  assert.equal(claims.filter(Boolean).length, 1);
});

test("task creation requires an explicit affirmative human message", () => {
  assert.equal(isExplicitTaskCreationConfirmation("[ask:q_task_create] respuesta: Sí, crear y ejecutar"), true);
  assert.equal(isExplicitTaskCreationConfirmation("[ask:q_task_route] respuesta: Crear una tarea nueva"), true);
  assert.equal(isExplicitTaskCreationConfirmation("[ask:q_task_route] respuesta: P01-T03"), false);
  assert.equal(isExplicitTaskCreationConfirmation("Dale, créala"), true);
  assert.equal(isExplicitTaskCreationConfirmation("No, seguir aquí"), false);
  assert.equal(isExplicitTaskCreationConfirmation("Quizás luego"), false);
  assert.equal(isExplicitTaskCreationConfirmation(undefined), false);
  assert.equal(isExplicitNewTaskSelection("[ask:q_task_route] respuesta: Crear una tarea nueva"), true);
  assert.equal(isExplicitNewTaskSelection("Sí, crea una tarea nueva"), false);
  assert.equal(isExplicitTaskCreationRejection("[ask:q_task_create] respuesta: No, seguir aquí"), true);
  assert.equal(isExplicitTaskCreationRejection("Cancela la propuesta"), true);
  assert.equal(isExplicitTaskCreationRejection("Dale, créala"), false);
  assert.equal(isExplicitTaskCreationConfirmation("[ask:q_task_create_a1b2c3] respuesta: Sí, crear y ejecutar"), true);
  assert.equal(isExplicitNewTaskSelection("[ask:q_task_route_a1b2c3] respuesta: Crear una tarea nueva"), true);
});
