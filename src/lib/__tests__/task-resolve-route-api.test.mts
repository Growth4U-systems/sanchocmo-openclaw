import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { NextApiRequest, NextApiResponse } from "next";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "sancho-task-route-api-"));
process.env.MC_WORKSPACE = tmp;
process.env.MC_TASKS_BACKEND = "json";
process.env.SANCHO_RUNTIME = "external-http";
process.env.SANCHO_EXTERNAL_SECRET = "route-secret";

const projectDir = path.join(tmp, "brand", "demo", "projects", "P1");
fs.mkdirSync(projectDir, { recursive: true });
fs.writeFileSync(path.join(projectDir, "project.json"), JSON.stringify({
  id: "P1",
  slug: "group-p1",
  name: "Group P1",
  strategy: "growth",
  status: "active",
  phase: 1,
  category: "growth",
  created_at: new Date(0).toISOString(),
  review_date: null,
}));
fs.writeFileSync(path.join(projectDir, "tasks.json"), JSON.stringify([{
  id: "P1-T1",
  name: "Source",
  owner: "Rocinante",
  agent: "rocinante",
  status: "todo",
  channel: "execution",
  type: "execution",
  skill: "outreach-playbook",
  output_files: [],
  mc_chat_thread_id: "demo:task-p1-t1",
}]));

function seedProject(slug: string, groupId: string, tasks: Array<Record<string, unknown>>) {
  const dir = path.join(tmp, "brand", slug, "projects", groupId);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "project.json"), JSON.stringify({
    id: groupId,
    slug: groupId.toLowerCase(),
    name: `Group ${groupId}`,
    strategy: "growth",
    status: "active",
    phase: 1,
    category: "growth",
    created_at: new Date(0).toISOString(),
    review_date: null,
  }));
  fs.writeFileSync(path.join(dir, "tasks.json"), JSON.stringify(tasks));
  return dir;
}

const sanchoProjectDir = seedProject("sancho-demo", "P2", [
  {
    id: "P2-T1",
    name: "Tarea actual",
    owner: "Sancho",
    agent: "sancho",
    status: "todo",
    type: "execution",
    skill: "",
    mc_chat_thread_id: "task-p2-t1",
  },
  {
    id: "P2-T2",
    name: "Otra tarea Sancho",
    owner: "Sancho",
    agent: "sancho",
    status: "todo",
    type: "execution",
    skill: "",
    mc_chat_thread_id: "task-p2-t2",
  },
]);

const ambiguousProjectDir = seedProject("amb-demo", "P3", [
  {
    id: "P3-T1",
    name: "Origen",
    owner: "Rocinante",
    agent: "rocinante",
    status: "todo",
    type: "execution",
    mc_chat_thread_id: "task-p3-t1",
  },
  ...["P3-T2", "P3-T3"].map((id) => ({
    id,
    name: "Investigar mercado",
    owner: "Hamete",
    agent: "hamete",
    status: "todo",
    type: "research",
    skill: "market-intelligence",
    mc_chat_thread_id: `task-${id.toLowerCase()}`,
  })),
]);

const { resetRuntimeForTests } = await import("../runtime");
resetRuntimeForTests();
const { resetTaskRouteProposalsForTests } = await import("../data/task-route-proposals");
const { resolveRouteHandler } = await import("@/pages/api/tasks/resolve-route");

function mockResponse() {
  let statusCode = 200;
  let payload: unknown;
  const res = {
    status(code: number) {
      statusCode = code;
      return this;
    },
    json(value: unknown) {
      payload = value;
      return this;
    },
  } as unknown as NextApiResponse;
  return {
    res,
    read: () => ({ statusCode, payload: payload as Record<string, unknown> }),
  };
}

function request(body: Record<string, unknown>, secret = "route-secret"): NextApiRequest {
  return {
    method: "POST",
    headers: { "x-mc-secret": secret },
    body,
    query: {},
  } as unknown as NextApiRequest;
}

const baseBody = {
  slug: "demo",
  sourceThreadId: "demo:task-p1-t1",
  agent: "hamete",
  skill: "market-intelligence",
  skills: ["market-intelligence", "competitor-intelligence"],
  name: "Investigar nuevo mercado",
  brief: "Investiga el nuevo mercado y entrega un informe.",
};

test("task route endpoint rejects an invalid runtime secret", async () => {
  const mocked = mockResponse();
  await resolveRouteHandler(request(baseBody, "wrong"), mocked.res);
  assert.equal(mocked.read().statusCode, 403);
});

test("confirmCreate cannot create without a pending proposal and human confirmation", async () => {
  resetTaskRouteProposalsForTests();
  const mocked = mockResponse();
  await resolveRouteHandler(request({ ...baseBody, confirmCreate: true }), mocked.res);
  assert.equal(mocked.read().statusCode, 200);
  assert.equal(mocked.read().payload.action, "confirmation_required");
  const tasks = JSON.parse(fs.readFileSync(path.join(projectDir, "tasks.json"), "utf8"));
  assert.equal(tasks.length, 1);
});

test("a matching proposal plus the current human confirmation creates exactly one same-group task", async () => {
  resetTaskRouteProposalsForTests();
  const proposalResponse = mockResponse();
  await resolveRouteHandler(request(baseBody), proposalResponse.res);
  const proposalId = proposalResponse.read().payload.proposalId;
  const questionId = String(proposalResponse.read().payload.message).match(/"id":"([^"]+)"/)?.[1];
  assert.equal(typeof proposalId, "string");
  assert.match(String(questionId), /^q_task_create_/);
  assert.equal(proposalResponse.read().payload.action, "suggest_create");

  const createResponse = mockResponse();
  await resolveRouteHandler(request({
    ...baseBody,
    proposalId,
    confirmCreate: true,
    confirmationText: `[ask:${questionId}] respuesta: Sí, crear y ejecutar`,
  }), createResponse.res);

  assert.equal(createResponse.read().statusCode, 201);
  assert.equal(createResponse.read().payload.action, "created");
  const tasks = JSON.parse(fs.readFileSync(path.join(projectDir, "tasks.json"), "utf8"));
  assert.equal(tasks.length, 2);
  assert.equal(tasks[1].parent_id, "P1");
  assert.equal(tasks[1].agent, "hamete");
  assert.deepEqual(tasks[1].skills, ["market-intelligence", "competitor-intelligence"]);
});

test("concurrent confirmations consume one proposal and create exactly one task", async () => {
  resetTaskRouteProposalsForTests();
  const body = {
    ...baseBody,
    name: "Investigar canal concurrente",
    brief: "Investiga el canal y entrega un informe reproducible.",
  };
  const before = JSON.parse(fs.readFileSync(path.join(projectDir, "tasks.json"), "utf8"));
  const proposalResponse = mockResponse();
  await resolveRouteHandler(request(body), proposalResponse.res);
  const proposalId = proposalResponse.read().payload.proposalId;
  const questionId = String(proposalResponse.read().payload.message).match(/"id":"([^"]+)"/)?.[1];
  const first = mockResponse();
  const second = mockResponse();
  const confirmation = {
    ...body,
    proposalId,
    confirmCreate: true,
    confirmationText: `[ask:${questionId}] respuesta: Sí, crear y ejecutar`,
  };
  await Promise.all([
    resolveRouteHandler(request(confirmation), first.res),
    resolveRouteHandler(request(confirmation), second.res),
  ]);
  const actions = [first.read().payload.action, second.read().payload.action].sort();
  assert.deepEqual(actions, ["confirmation_required", "created"]);
  const after = JSON.parse(fs.readFileSync(path.join(projectDir, "tasks.json"), "utf8"));
  assert.equal(after.length, before.length + 1);
});

test("Sancho may route to another Sancho-owned task", async () => {
  resetTaskRouteProposalsForTests();
  const mocked = mockResponse();
  await resolveRouteHandler(request({
    slug: "sancho-demo",
    sourceThreadId: "sancho-demo:task-p2-t1",
    agent: "sancho",
    name: "Otra tarea Sancho",
    brief: "Continúa con el otro entregable.",
  }), mocked.res);
  assert.equal(mocked.read().statusCode, 200);
  assert.equal(mocked.read().payload.action, "reuse");
  assert.equal(mocked.read().payload.taskId, "P2-T2");
});

test("routing to the current task returns no_change without creating anything", async () => {
  resetTaskRouteProposalsForTests();
  const before = JSON.parse(fs.readFileSync(path.join(sanchoProjectDir, "tasks.json"), "utf8"));
  const mocked = mockResponse();
  await resolveRouteHandler(request({
    slug: "sancho-demo",
    sourceThreadId: "sancho-demo:task-p2-t1",
    agent: "sancho",
    name: "Tarea actual",
    brief: "Esto sigue perteneciendo a la tarea actual.",
  }), mocked.res);
  assert.equal(mocked.read().statusCode, 200);
  assert.equal(mocked.read().payload.action, "no_change");
  assert.equal(mocked.read().payload.taskId, "P2-T1");
  const after = JSON.parse(fs.readFileSync(path.join(sanchoProjectDir, "tasks.json"), "utf8"));
  assert.deepEqual(after, before);
});

test("only the exact create-new choice may create while compatible tasks are ambiguous", async () => {
  resetTaskRouteProposalsForTests();
  const body = {
    slug: "amb-demo",
    sourceThreadId: "amb-demo:task-p3-t1",
    agent: "hamete",
    skill: "market-intelligence",
    name: "Investigar mercado",
    brief: "Investiga el mercado.",
  };
  const proposalResponse = mockResponse();
  await resolveRouteHandler(request(body), proposalResponse.res);
  assert.equal(proposalResponse.read().payload.action, "ambiguous");
  const proposalId = proposalResponse.read().payload.proposalId;
  const firstQuestionId = String(proposalResponse.read().payload.message).match(/"id":"([^"]+)"/)?.[1];

  const confirmResponse = mockResponse();
  await resolveRouteHandler(request({
    ...body,
    proposalId,
    confirmCreate: true,
    confirmationText: "Sí, crea una nueva",
  }), confirmResponse.res);
  assert.equal(confirmResponse.read().statusCode, 200);
  assert.equal(confirmResponse.read().payload.action, "ambiguous");
  const secondQuestionId = String(confirmResponse.read().payload.message).match(/"id":"([^"]+)"/)?.[1];
  assert.notEqual(firstQuestionId, secondQuestionId);
  let tasks = JSON.parse(fs.readFileSync(path.join(ambiguousProjectDir, "tasks.json"), "utf8"));
  assert.equal(tasks.length, 3);

  const explicitResponse = mockResponse();
  await resolveRouteHandler(request({
    ...body,
    proposalId: confirmResponse.read().payload.proposalId,
    confirmCreate: true,
    confirmationText: `[ask:${secondQuestionId}] respuesta: Crear una tarea nueva`,
  }), explicitResponse.res);
  assert.equal(explicitResponse.read().statusCode, 201);
  assert.equal(explicitResponse.read().payload.action, "created");
  tasks = JSON.parse(fs.readFileSync(path.join(ambiguousProjectDir, "tasks.json"), "utf8"));
  assert.equal(tasks.length, 4);
});
