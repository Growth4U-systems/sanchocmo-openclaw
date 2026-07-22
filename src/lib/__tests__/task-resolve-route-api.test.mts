import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import http from "node:http";
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
const runtimeRouteGrants = await import(
  "../data/runtime-route-dispatch-grants"
);
const { resetRuntimeRouteDispatchGrantsForTests } = runtimeRouteGrants;
const agentRunsModule = await import("../data/agent-runs");
const agentRuns =
  (agentRunsModule as unknown as { default: typeof agentRunsModule }).default ??
  agentRunsModule;
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

function listen(server: http.Server): Promise<{ port: number }> {
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () =>
      resolve(server.address() as { port: number }),
    );
  });
}

function close(server: http.Server): Promise<void> {
  return new Promise((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
}

function createParentAuthority(
  threadId: string,
  userText = "Resuelve la tarea",
  inputOverrides: Record<string, unknown> = {},
) {
  const capability = createHash("sha256")
    .update(`${threadId}:${userText}:${Math.random()}`)
    .digest("hex");
  const run = agentRuns.createAgentRun({
    threadId,
    runtime: "external-http",
    agent: "sancho",
    input: {
      slug: threadId.slice(0, threadId.indexOf(":")),
      threadId,
      userText,
      userId: "mc-client-demo",
      userName: "Demo client",
      isAdmin: false,
      senderRole: "client",
      readOnly: false,
      controlDepth: 0,
      runtimeToolCapabilitySha256: createHash("sha256")
        .update(capability)
        .digest("hex"),
      ...inputOverrides,
    },
  });
  agentRuns.markAgentRunDispatched(run.id, threadId);
  return {
    run,
    capability,
    headers: {
      "x-mission-control-parent-run-id": run.id,
      "x-sancho-parent-run-capability": capability,
    },
  };
}

function request(
  body: Record<string, unknown>,
  secret = "route-secret",
  authorityHeaders?: Record<string, string>,
): NextApiRequest {
  const sourceThreadId = String(body.sourceThreadId || "demo:missing");
  const userText = typeof body.confirmationText === "string"
    ? body.confirmationText
    : "Resuelve la tarea";
  const headers = authorityHeaders ?? createParentAuthority(
    sourceThreadId,
    userText,
  ).headers;
  return {
    method: "POST",
    headers: { "x-mc-secret": secret, ...headers },
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

test("task route endpoint requires an active exact parent authority", async () => {
  const missing = mockResponse();
  await resolveRouteHandler(request(baseBody, "route-secret", {}), missing.res);
  assert.equal(missing.read().statusCode, 403);

  const wrongSourceAuthority = createParentAuthority("demo:other-source");
  const wrongSource = mockResponse();
  await resolveRouteHandler(
    request(baseBody, "route-secret", wrongSourceAuthority.headers),
    wrongSource.res,
  );
  assert.equal(wrongSource.read().statusCode, 403);
  assert.equal(
    wrongSource.read().payload.error,
    "Runtime route source authority mismatch",
  );

  const exactAuthority = createParentAuthority(String(baseBody.sourceThreadId));
  const nonCanonicalClaim = mockResponse();
  await resolveRouteHandler(
    request(
      {
        ...baseBody,
        sourceThreadId: `${baseBody.sourceThreadId} `,
      },
      "route-secret",
      exactAuthority.headers,
    ),
    nonCanonicalClaim.res,
  );
  assert.equal(nonCanonicalClaim.read().statusCode, 403);

  const childAuthority = createParentAuthority(
    String(baseBody.sourceThreadId),
    "Resuelve la tarea",
    { controlDepth: 1 },
  );
  const child = mockResponse();
  await resolveRouteHandler(
    request(baseBody, "route-secret", childAuthority.headers),
    child.res,
  );
  assert.equal(child.read().statusCode, 403);

  const terminalAuthority = createParentAuthority(String(baseBody.sourceThreadId));
  agentRuns.markAgentRunCompleted(
    terminalAuthority.run.id,
    String(baseBody.sourceThreadId),
  );
  const terminal = mockResponse();
  await resolveRouteHandler(
    request(baseBody, "route-secret", terminalAuthority.headers),
    terminal.res,
  );
  assert.equal(terminal.read().statusCode, 403);
});

test("task route confirmation must be the exact human input of its parent run", async () => {
  const forgedAuthority = createParentAuthority(
    String(baseBody.sourceThreadId),
    "No, no crees nada",
  );
  const mocked = mockResponse();
  await resolveRouteHandler(
    request(
      {
        ...baseBody,
        confirmCreate: true,
        confirmationText: "Sí, crear y ejecutar",
      },
      "route-secret",
      forgedAuthority.headers,
    ),
    mocked.res,
  );
  assert.equal(mocked.read().statusCode, 403);
  assert.equal(
    mocked.read().payload.error,
    "Runtime route confirmation authority mismatch",
  );
});

test("confirmCreate cannot create without a pending proposal and human confirmation", async () => {
  resetTaskRouteProposalsForTests();
  const mocked = mockResponse();
  await resolveRouteHandler(request({
    ...baseBody,
    confirmCreate: true,
    confirmationText: "Sí, crear y ejecutar",
  }), mocked.res);
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
  assert.match(
    String(createResponse.read().payload.dispatchGrant),
    /^[a-f0-9]{64}$/,
  );
  assert.equal(
    typeof createResponse.read().payload.dispatchIdempotencyKey,
    "string",
  );
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
  assert.match(String(mocked.read().payload.dispatchGrant), /^[a-f0-9]{64}$/);
  assert.match(
    String(mocked.read().payload.dispatchIdempotencyKey),
    /^mc-control:.*:task-dispatch:/,
  );
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

test("full handlers authorize A→B once while same-thread control needs no route grant", async () => {
  resetRuntimeRouteDispatchGrantsForTests();
  process.env.CHAT_AGENT_TURN_EXECUTION_V1 = "off";
  const received: Array<Record<string, unknown>> = [];
  const runtimeServer = http.createServer((req, res) => {
    let raw = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => {
      raw += chunk;
    });
    req.on("end", () => {
      received.push(JSON.parse(raw));
      res.writeHead(202, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true, runId: `runtime-${received.length}` }));
    });
  });
  const address = await listen(runtimeServer);
  process.env.SANCHO_EXTERNAL_GATEWAY_URL = `http://127.0.0.1:${address.port}`;
  resetRuntimeForTests();
  const { sendHandler } = await import("@/pages/api/chat/send");

  const sourceThreadId = "sancho-demo:task-p2-t1";
  const targetThreadId = "sancho-demo:task-p2-t2";
  const brief = "Continúa con el otro entregable.";
  const parent = createParentAuthority(sourceThreadId, "Delega la tarea");
  const routeResponse = mockResponse();
  await resolveRouteHandler(
    request(
      {
        slug: "sancho-demo",
        sourceThreadId,
        targetThreadId,
        agent: "sancho",
        name: "Otra tarea Sancho",
        brief,
      },
      "route-secret",
      parent.headers,
    ),
    routeResponse.res,
  );
  assert.equal(routeResponse.read().statusCode, 200);
  assert.equal(routeResponse.read().payload.action, "reuse");
  assert.equal(routeResponse.read().payload.threadId, targetThreadId);

  const crossThreadBody = {
    slug: "sancho-demo",
    threadId: targetThreadId,
    threadName: "Otra tarea Sancho",
    text: brief,
    agent: "sancho",
    controlDepth: 1,
    idempotencyKey: routeResponse.read().payload.dispatchIdempotencyKey,
    userId: "forged-client",
    isAdmin: false,
    senderRole: "client",
  };
  const crossThreadHeaders = {
    "x-mc-secret": "route-secret",
    ...parent.headers,
    "x-sancho-route-dispatch-grant": String(
      routeResponse.read().payload.dispatchGrant,
    ),
  };

  try {
    const dispatched = mockResponse();
    await sendHandler(
      {
        method: "POST",
        headers: crossThreadHeaders,
        body: crossThreadBody,
        query: {},
      } as unknown as NextApiRequest,
      dispatched.res,
    );
    assert.equal(dispatched.read().statusCode, 200);
    assert.equal(received.length, 1);
    assert.equal(received[0].threadId, targetThreadId);
    assert.equal(received[0].userId, "mc-client-demo");

    const replay = mockResponse();
    await sendHandler(
      {
        method: "POST",
        headers: crossThreadHeaders,
        body: crossThreadBody,
        query: {},
      } as unknown as NextApiRequest,
      replay.res,
    );
    assert.equal(replay.read().statusCode, 200);
    assert.equal(replay.read().payload.duplicate, true);
    assert.equal(received.length, 1);

    const forgedReplay = mockResponse();
    await sendHandler(
      {
        method: "POST",
        headers: {
          ...crossThreadHeaders,
          "x-sancho-route-dispatch-grant": "f".repeat(64),
        },
        body: crossThreadBody,
        query: {},
      } as unknown as NextApiRequest,
      forgedReplay.res,
    );
    assert.equal(forgedReplay.read().statusCode, 403);
    assert.equal(received.length, 1);

    const alteredParent = createParentAuthority(sourceThreadId, "Delega otra vez");
    const alteredRoute = mockResponse();
    await resolveRouteHandler(
      request(
        {
          slug: "sancho-demo",
          sourceThreadId,
          targetThreadId,
          agent: "sancho",
          name: "Otra tarea Sancho",
          brief,
        },
        "route-secret",
        alteredParent.headers,
      ),
      alteredRoute.res,
    );
    const alteredBrief = mockResponse();
    await sendHandler(
      {
        method: "POST",
        headers: {
          "x-mc-secret": "route-secret",
          ...alteredParent.headers,
          "x-sancho-route-dispatch-grant": String(
            alteredRoute.read().payload.dispatchGrant,
          ),
        },
        body: {
          ...crossThreadBody,
          text: `${brief} alterado`,
          idempotencyKey: alteredRoute.read().payload.dispatchIdempotencyKey,
        },
        query: {},
      } as unknown as NextApiRequest,
      alteredBrief.res,
    );
    assert.equal(alteredBrief.read().statusCode, 403);
    assert.equal(received.length, 1);

    const expiredParent = createParentAuthority(sourceThreadId, "Delega expirada");
    const expiredBriefSha256 = runtimeRouteGrants.runtimeRouteBriefSha256(brief);
    const expiredIdempotencyKey =
      runtimeRouteGrants.runtimeRouteDispatchIdempotencyKey({
        parentRunId: expiredParent.run.id,
        clientSlug: "sancho-demo",
        sourceThreadId,
        targetThreadId,
        agent: "sancho",
        briefSha256: expiredBriefSha256,
      });
    const expiredGrant = await runtimeRouteGrants.issueRuntimeRouteDispatchGrant(
      {
        parentRunId: expiredParent.run.id,
        clientSlug: "sancho-demo",
        sourceThreadId,
        targetThreadId,
        agent: "sancho",
        briefSha256: expiredBriefSha256,
        idempotencyKey: expiredIdempotencyKey,
      },
      Date.now() - runtimeRouteGrants.RUNTIME_ROUTE_DISPATCH_GRANT_TTL_MS - 1,
    );
    const expired = mockResponse();
    await sendHandler(
      {
        method: "POST",
        headers: {
          "x-mc-secret": "route-secret",
          ...expiredParent.headers,
          "x-sancho-route-dispatch-grant": expiredGrant.token,
        },
        body: {
          ...crossThreadBody,
          idempotencyKey: expiredIdempotencyKey,
        },
        query: {},
      } as unknown as NextApiRequest,
      expired.res,
    );
    assert.equal(expired.read().statusCode, 403);

    const orphanedParent = createParentAuthority(
      sourceThreadId,
      "Delega sin child",
    );
    const orphanedBriefSha256 =
      runtimeRouteGrants.runtimeRouteBriefSha256(brief);
    const orphanedClaims = {
      parentRunId: orphanedParent.run.id,
      clientSlug: "sancho-demo",
      sourceThreadId,
      targetThreadId,
      agent: "sancho",
      briefSha256: orphanedBriefSha256,
      idempotencyKey: runtimeRouteGrants.runtimeRouteDispatchIdempotencyKey({
        parentRunId: orphanedParent.run.id,
        clientSlug: "sancho-demo",
        sourceThreadId,
        targetThreadId,
        agent: "sancho",
        briefSha256: orphanedBriefSha256,
      }),
    };
    const orphanedGrant =
      await runtimeRouteGrants.issueRuntimeRouteDispatchGrant(orphanedClaims);
    assert.equal(
      await runtimeRouteGrants.consumeRuntimeRouteDispatchGrant(
        orphanedGrant.token,
        orphanedClaims,
      ),
      "claimed",
    );
    const orphanedReplay = mockResponse();
    await sendHandler(
      {
        method: "POST",
        headers: {
          "x-mc-secret": "route-secret",
          ...orphanedParent.headers,
          "x-sancho-route-dispatch-grant": orphanedGrant.token,
        },
        body: {
          ...crossThreadBody,
          idempotencyKey: orphanedClaims.idempotencyKey,
        },
        query: {},
      } as unknown as NextApiRequest,
      orphanedReplay.res,
    );
    assert.equal(orphanedReplay.read().statusCode, 403);
    assert.equal(
      orphanedReplay.read().payload.error,
      "Runtime route grant replay invalid",
    );

    const wrongSourceParent = createParentAuthority(
      sourceThreadId,
      "Delega con source alterado",
    );
    const wrongSource = "sancho-demo:task-p2-forged";
    const wrongSourceBriefSha256 =
      runtimeRouteGrants.runtimeRouteBriefSha256(brief);
    const wrongSourceIdempotencyKey =
      runtimeRouteGrants.runtimeRouteDispatchIdempotencyKey({
        parentRunId: wrongSourceParent.run.id,
        clientSlug: "sancho-demo",
        sourceThreadId: wrongSource,
        targetThreadId,
        agent: "sancho",
        briefSha256: wrongSourceBriefSha256,
      });
    const wrongSourceGrant =
      await runtimeRouteGrants.issueRuntimeRouteDispatchGrant({
        parentRunId: wrongSourceParent.run.id,
        clientSlug: "sancho-demo",
        sourceThreadId: wrongSource,
        targetThreadId,
        agent: "sancho",
        briefSha256: wrongSourceBriefSha256,
        idempotencyKey: wrongSourceIdempotencyKey,
      });
    const sourceMismatch = mockResponse();
    await sendHandler(
      {
        method: "POST",
        headers: {
          "x-mc-secret": "route-secret",
          ...wrongSourceParent.headers,
          "x-sancho-route-dispatch-grant": wrongSourceGrant.token,
        },
        body: {
          ...crossThreadBody,
          idempotencyKey: wrongSourceIdempotencyKey,
        },
        query: {},
      } as unknown as NextApiRequest,
      sourceMismatch.res,
    );
    assert.equal(sourceMismatch.read().statusCode, 403);

    const crossTenant = mockResponse();
    await sendHandler(
      {
        method: "POST",
        headers: {
          "x-mc-secret": "route-secret",
          ...wrongSourceParent.headers,
          "x-sancho-route-dispatch-grant": wrongSourceGrant.token,
        },
        body: {
          ...crossThreadBody,
          slug: "demo",
          threadId: "demo:task-p1-t1",
          idempotencyKey: wrongSourceIdempotencyKey,
        },
        query: {},
      } as unknown as NextApiRequest,
      crossTenant.res,
    );
    assert.equal(crossTenant.read().statusCode, 403);
    assert.equal(received.length, 1);

    const sameThreadParent = createParentAuthority(
      sourceThreadId,
      "Intervén aquí",
    );
    const sameThread = mockResponse();
    await sendHandler(
      {
        method: "POST",
        headers: {
          "x-mc-secret": "route-secret",
          ...sameThreadParent.headers,
        },
        body: {
          slug: "sancho-demo",
          threadId: sourceThreadId,
          text: "Intervén aquí",
          agent: "sancho",
          controlDepth: 1,
          idempotencyKey: "mc-control:same-thread:followup:one",
          isAdmin: false,
          senderRole: "client",
        },
        query: {},
      } as unknown as NextApiRequest,
      sameThread.res,
    );
    assert.equal(sameThread.read().statusCode, 200);
    assert.equal(received.length, 2);
    assert.equal(received[1].threadId, sourceThreadId);
    assert.equal(received[1].controlDepth, 1);

    const controlParent = createParentAuthority(
      sourceThreadId,
      "Mueve el trabajo a la otra tarea",
    );
    const { processRuntimeControlReply } = await import(
      "../runtime/control-actions"
    );
    const controlled = await processRuntimeControlReply(
      ':::task-route\n{"agent":"sancho","name":"Otra tarea Sancho","brief":"Entrega el informe desde la tarea destino.","taskId":"P2-T2"}\n:::',
      {
        slug: "sancho-demo",
        threadId: sourceThreadId,
        missionControlRunId: controlParent.run.id,
        parentCapability: controlParent.capability,
        respondingAgent: "sancho",
        userText: "Mueve el trabajo a la otra tarea",
        userId: "mc-client-demo",
        userName: "Demo client",
        isAdmin: false,
        senderRole: "client",
      },
      {
        secret: "route-secret",
        nextBaseUrl: "http://next",
        fetchImpl: async (url, init) => {
          const headers = Object.fromEntries(
            Object.entries(init.headers as Record<string, string>).map(
              ([key, value]) => [key.toLowerCase(), value],
            ),
          );
          const apiResponse = mockResponse();
          const apiRequest = {
            method: "POST",
            headers,
            body: JSON.parse(String(init.body)),
            query: {},
          } as unknown as NextApiRequest;
          if (url.endsWith("/api/tasks/resolve-route")) {
            await resolveRouteHandler(apiRequest, apiResponse.res);
          } else if (url.endsWith("/api/chat/send")) {
            await sendHandler(apiRequest, apiResponse.res);
          } else {
            throw new Error(`Unexpected control URL: ${url}`);
          }
          const result = apiResponse.read();
          return {
            ok: result.statusCode >= 200 && result.statusCode < 300,
            status: result.statusCode,
            json: async () => result.payload,
          };
        },
      },
    );
    assert.equal(controlled.actionsDispatched, 1);
    assert.equal(received.length, 3);
    assert.equal(received[2].threadId, targetThreadId);
    assert.equal(
      received[2].text,
      "Entrega el informe desde la tarea destino.",
    );
  } finally {
    await close(runtimeServer);
  }
});
