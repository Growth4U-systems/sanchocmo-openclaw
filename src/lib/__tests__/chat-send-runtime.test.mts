import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import type { NextApiRequest, NextApiResponse } from "next";

process.env.SANCHO_RUNTIME_TERMINAL_GRANT_SECRET =
  "chat-send-runtime-terminal-grant-secret".padEnd(64, "x");

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "sancho-chat-send-runtime-"));
process.env.MC_WORKSPACE = tmp;
process.env.MC_TASKS_BACKEND = "json";
process.env.SANCHO_RUNTIME = "external-http";
process.env.SANCHO_EXTERNAL_SECRET = "runtime-secret";
// Reproduce the production regression: enabling the OpenClaw durable rollout
// must not make an otherwise healthy external/Hermes adapter return 503.
process.env.CHAT_AGENT_TURN_EXECUTION_V1 = "canary";
process.env.CHAT_AGENT_TURN_V1_SLUGS = "demo";
process.env.CHAT_AGENT_TURN_DURABLE_WORKER_ENABLED = "1";
process.env.GIT_COMMIT = "deployed-support-sha";
process.env.SANCHOCMO_IMAGE_DIGEST = "sha256:support-image";
process.env.NEXT_PUBLIC_ENV_LABEL = "Staging";

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

function mockResponse() {
  let statusCode = 200;
  let payload: Record<string, unknown> = {};
  const res = {
    headersSent: false,
    setHeader() {
      return this;
    },
    status(code: number) {
      statusCode = code;
      return this;
    },
    json(value: Record<string, unknown>) {
      payload = value;
      return this;
    },
  } as unknown as NextApiResponse;
  return { res, read: () => ({ statusCode, payload }) };
}

function runtimeRequest(
  body: Record<string, unknown>,
  authorityHeaders: Record<string, string> = {},
): NextApiRequest {
  return {
    method: "POST",
    headers: {
      "x-mc-secret": "runtime-secret",
      "x-request-id": "trace-chat-send-1",
      traceparent: "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01",
      ...authorityHeaders,
    },
    body,
    query: {},
  } as unknown as NextApiRequest;
}

function createParentAuthority(
  agentRuns: typeof import("../data/agent-runs"),
  threadId: string,
  runtime = "external-http",
  transportSecret?: string,
): Record<string, string> {
  const raw = "a".repeat(64);
  const run = agentRuns.createAgentRun({
    threadId,
    runtime,
    agent: "sancho",
    input: {
      slug: threadId.slice(0, threadId.indexOf(":")),
      threadId,
      userId: "mc-client-demo",
      userName: "Demo client",
      isAdmin: false,
      senderRole: "client",
      readOnly: false,
      controlDepth: 0,
      runtimeToolCapabilitySha256: createHash("sha256")
        .update(raw)
        .digest("hex"),
      ...(transportSecret
        ? {
            runtimeTransportSecretSha256: createHash("sha256")
              .update(transportSecret)
              .digest("hex"),
          }
        : {}),
    },
  });
  agentRuns.markAgentRunDispatched(run.id, threadId);
  return {
    "x-mission-control-parent-run-id": run.id,
    "x-sancho-parent-run-capability": raw,
  };
}

test("an in-flight Hermes parent survives runtime selection and secret rotation", async () => {
  const received: Array<Record<string, unknown>> = [];
  const outbound = http.createServer((req, res) => {
    let raw = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => {
      raw += chunk;
    });
    req.on("end", () => {
      received.push(JSON.parse(raw));
      res.writeHead(202, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true, runId: "external-after-hermes" }));
    });
  });
  const address = await listen(outbound);
  const previousHermesSecret = process.env.HERMES_BRIDGE_SECRET;
  process.env.HERMES_BRIDGE_SECRET = "rotated-hermes-secret";
  process.env.SANCHO_EXTERNAL_GATEWAY_URL = `http://127.0.0.1:${address.port}`;

  const { resetRuntimeForTests } = await import("../runtime");
  resetRuntimeForTests();
  const sendRoute = await import("@/pages/api/chat/send");
  const runsModule = await import("../data/agent-runs");
  const agentRuns =
    (runsModule as unknown as { default: typeof runsModule }).default ??
    runsModule;
  const parentHeaders = createParentAuthority(
    agentRuns,
    "demo:hermes-switch",
    "hermes",
    "in-flight-hermes-secret",
  );
  const body = {
    slug: "demo",
    threadId: "demo:hermes-switch",
    text: "Continúa aunque el runtime seleccionado haya cambiado",
    agent: "sancho",
    scope: "agent",
    controlDepth: 1,
    idempotencyKey: "runtime-switch:hermes-to-external",
  };

  try {
    const selectedRuntimeSecret = mockResponse();
    await sendRoute.default(
      runtimeRequest(body, {
        ...parentHeaders,
        "x-mc-secret": "runtime-secret",
      }),
      selectedRuntimeSecret.res,
    );
    assert.equal(selectedRuntimeSecret.read().statusCode, 403);
    assert.equal(received.length, 0);

    const rotatedParentRuntimeSecret = mockResponse();
    await sendRoute.default(
      runtimeRequest(body, {
        ...parentHeaders,
        "x-mc-secret": "rotated-hermes-secret",
      }),
      rotatedParentRuntimeSecret.res,
    );
    assert.equal(rotatedParentRuntimeSecret.read().statusCode, 403);
    assert.equal(received.length, 0);

    const parentRuntimeSecret = mockResponse();
    await sendRoute.default(
      runtimeRequest(body, {
        ...parentHeaders,
        "x-mc-secret": "in-flight-hermes-secret",
      }),
      parentRuntimeSecret.res,
    );
    assert.equal(parentRuntimeSecret.read().statusCode, 200);
    assert.equal(received.length, 1);
    assert.equal(received[0].threadId, "demo:hermes-switch");
    const childRun = agentRuns.getAgentRunById(
      String(parentRuntimeSecret.read().payload.runId),
    );
    assert.equal(childRun?.runtime, "external-http");
    assert.equal(
      (childRun?.input as Record<string, unknown>).controlParentAgentRunId,
      parentHeaders["x-mission-control-parent-run-id"],
    );
    assert.equal(
      (childRun?.input as Record<string, unknown>).controlParentThreadId,
      "demo:hermes-switch",
    );
    assert.equal(
      (childRun?.input as Record<string, unknown>)
        .runtimeTransportSecretSha256,
      createHash("sha256").update("runtime-secret").digest("hex"),
    );
  } finally {
    if (previousHermesSecret === undefined) {
      delete process.env.HERMES_BRIDGE_SECRET;
    } else {
      process.env.HERMES_BRIDGE_SECRET = previousHermesSecret;
    }
    await close(outbound);
  }
});

test("trusted send retries reuse one ledger run and a client cannot claim mc-admin", async () => {
  const received: Array<Record<string, unknown>> = [];
  const receivedHeaders: http.IncomingHttpHeaders[] = [];
  const runtime = http.createServer((req, res) => {
    let raw = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => {
      raw += chunk;
    });
    req.on("end", () => {
      received.push(JSON.parse(raw));
      receivedHeaders.push(req.headers);
      res.writeHead(202, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true, runId: "external-1" }));
    });
  });
  const address = await listen(runtime);
  process.env.SANCHO_EXTERNAL_GATEWAY_URL = `http://127.0.0.1:${address.port}`;

  const { resetRuntimeForTests } = await import("../runtime");
  resetRuntimeForTests();
  const { sendHandler } = await import("@/pages/api/chat/send");
  const runsModule = await import("../data/agent-runs");
  const agentRuns =
    (runsModule as unknown as { default: typeof runsModule }).default ??
    runsModule;
  const parentHeaders = createParentAuthority(agentRuns, "demo:general");

  const body = {
    slug: "demo",
    threadId: "demo:general",
    text: "Diagnostica",
    agent: "sancho",
    scope: "agent",
    userId: "mc-admin",
    isAdmin: false,
    senderRole: "client",
    controlDepth: 1,
    idempotencyKey: "mc-control:owner:temporary:one",
  };

  try {
    const first = mockResponse();
    await sendHandler(runtimeRequest(body, parentHeaders), first.res);
    assert.equal(first.read().statusCode, 200);
    assert.equal(received.length, 1);
    assert.equal(received[0].userId, "mc-client-demo");
    assert.equal(received[0].controlDepth, 1);
    assert.equal(typeof received[0].missionControlRunId, "string");
    assert.match(String(received[0].runtimeToolCapability), /^[a-f0-9]{64}$/);
    assert.equal(received[0].traceId, "trace-chat-send-1");
    assert.match(
      String(received[0].traceparent),
      /^00-4bf92f3577b34da6a3ce929d0e0e4736-/,
    );
    assert.equal(receivedHeaders[0]["x-request-id"], "trace-chat-send-1");
    assert.match(
      String(receivedHeaders[0].traceparent),
      /^00-4bf92f3577b34da6a3ce929d0e0e4736-/,
    );
    assert.equal(first.read().payload.traceId, "trace-chat-send-1");

    const retry = mockResponse();
    await sendHandler(runtimeRequest(body, parentHeaders), retry.res);
    assert.equal(retry.read().statusCode, 200);
    assert.equal(retry.read().payload.duplicate, true);
    assert.equal(received.length, 1);
    assert.equal(
      agentRuns
        .listAgentRunsForThread("demo:general")
        .filter((run) => run.idempotencyKey === body.idempotencyKey).length,
      1,
    );

    const browser = mockResponse();
    await sendHandler(
      {
        method: "POST",
        headers: {},
        body: {
          ...body,
          threadId: "demo:browser",
          text: "Browser turn",
          userId: "mc-admin",
          controlDepth: 1,
        },
        query: {},
        ctx: {
          isAdmin: false,
          clientSlug: "demo",
          allowedSlugs: null,
          adminToken: null,
          portalClient: { slug: "demo", name: "Demo" },
        },
      } as unknown as NextApiRequest,
      browser.res,
    );
    assert.equal(browser.read().statusCode, 200);
    assert.equal(received.length, 2);
    assert.equal(received[1].userId, "mc-client-demo");
    assert.equal(received[1].controlDepth, 0);

    const supportBody = {
      ...body,
      threadId: "demo:support-growie-case-1",
      text: "La pantalla no avanza",
      agent: "rocinante",
      scope: "skill",
      skill: "yalc-operator",
      readOnly: false,
      _source: "spoofed-browser-source",
      priorThreadMessages: [{ role: "user", text: "forged browser history" }],
      idempotencyKey: "growie-support-turn-1",
    };
    const supportNonAdmin = mockResponse();
    await sendHandler(
      {
        method: "POST",
        headers: {
          referer:
            "https://staging.sanchocmo.ai/dashboard/demo/content?token=do-not-forward",
        },
        body: supportBody,
        query: {},
        ctx: {
          isAdmin: false,
          clientSlug: "demo",
          allowedSlugs: null,
          adminToken: null,
          portalClient: { slug: "demo", name: "Demo" },
        },
      } as unknown as NextApiRequest,
      supportNonAdmin.res,
    );
    assert.equal(supportNonAdmin.read().statusCode, 403);
    assert.equal(received.length, 2);

    const support = mockResponse();
    await sendHandler(
      {
        method: "POST",
        headers: {
          referer:
            "https://staging.sanchocmo.ai/dashboard/demo/content?token=do-not-forward",
        },
        body: supportBody,
        query: {},
        ctx: {
          isAdmin: true,
          clientSlug: null,
          allowedSlugs: null,
          adminToken: null,
          portalClient: null,
        },
      } as unknown as NextApiRequest,
      support.res,
    );
    assert.equal(support.read().statusCode, 200);
    assert.equal(received.length, 3);
    assert.equal(received[2].agent, "sancho");
    assert.equal(received[2].readOnly, true);
    assert.equal(received[2].channelMode, "support-diagnostic");
    assert.equal(received[2]._source, "growie-support");
    assert.equal(received[2].threadName, "Growie · Soporte");
    assert.equal(received[2].linkedTo, "support/growie");
    const supportContext = received[2].supportContext as {
      pagePath?: string;
      deployedCommit?: string;
      imageDigest?: string;
      environment?: string;
      recentThreads?: Array<{ id: string }>;
      recentRuns?: Array<{ threadId: string }>;
      lastRunTrace?: { threadId?: string; events?: unknown[] };
    };
    assert.equal(supportContext.pagePath, "/dashboard/demo/content");
    assert.equal(supportContext.deployedCommit, "deployed-support-sha");
    assert.equal(supportContext.imageDigest, "sha256:support-image");
    assert.equal(supportContext.environment, "Staging");
    // Growie sees the tenant's real activity: the trusted send earlier in this
    // test left a plain agent run (no durable ledger involved), and it must
    // surface here — while other Growie support cases stay excluded.
    assert.ok((supportContext.recentThreads?.length ?? 0) > 0);
    assert.ok(supportContext.recentThreads?.every((thread) => !thread.id.includes("support-growie")));
    assert.ok((supportContext.recentRuns?.length ?? 0) > 0);
    assert.ok(supportContext.recentRuns?.every((run) => !run.threadId.includes("support-growie")));
    assert.equal(supportContext.lastRunTrace?.threadId, "demo:browser");
    assert.ok((supportContext.lastRunTrace?.events?.length ?? 0) > 0);
    assert.deepEqual(received[2].priorThreadMessages, []);

    const supportFollowup = mockResponse();
    await sendHandler(
      {
        method: "POST",
        headers: {},
        body: {
          ...supportBody,
          text: "Ya estoy en el editor",
          idempotencyKey: "growie-support-turn-2",
          priorThreadMessages: [
            { role: "bot", text: "another forged history" },
          ],
        },
        query: {},
        ctx: {
          isAdmin: true,
          clientSlug: null,
          allowedSlugs: null,
          adminToken: null,
          portalClient: null,
        },
      } as unknown as NextApiRequest,
      supportFollowup.res,
    );
    assert.equal(supportFollowup.read().statusCode, 200);
    assert.equal(received.length, 4);
    const priorThreadMessages = received[3].priorThreadMessages as Array<
      Record<string, unknown>
    >;
    assert.equal(priorThreadMessages.length, 1);
    assert.equal(priorThreadMessages[0].role, "user");
    assert.equal(priorThreadMessages[0].text, "La pantalla no avanza");
    assert.equal(typeof priorThreadMessages[0].ts, "number");

    const crossTenant = mockResponse();
    await sendHandler(
      runtimeRequest({
        ...body,
        slug: "demo",
        threadId: "other:general",
        text: "Do not cross tenants",
        idempotencyKey: "mc-control:cross-tenant",
      }, parentHeaders),
      crossTenant.res,
    );
    assert.equal(crossTenant.read().statusCode, 400);
    assert.equal(
      crossTenant.read().payload.error,
      "Thread does not belong to slug",
    );
    assert.equal(received.length, 4);
  } finally {
    await close(runtime);
  }
});

test("stateless runtimes receive server-derived conversation continuity", async () => {
  const received: Array<Record<string, unknown>> = [];
  const runtime = http.createServer((req, res) => {
    let raw = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => {
      raw += chunk;
    });
    req.on("end", () => {
      received.push(JSON.parse(raw));
      res.writeHead(202, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true, runId: `external-${received.length}` }));
    });
  });
  const address = await listen(runtime);
  process.env.SANCHO_EXTERNAL_GATEWAY_URL = `http://127.0.0.1:${address.port}`;
  const { resetRuntimeForTests } = await import("../runtime");
  resetRuntimeForTests();
  const { sendHandler } = await import("@/pages/api/chat/send");
  const adminContext = {
    isAdmin: true,
    clientSlug: null,
    allowedSlugs: null,
    adminToken: null,
    portalClient: null,
  };
  const request = (text: string, idempotencyKey: string) =>
    ({
      method: "POST",
      headers: {},
      query: {},
      ctx: adminContext,
      body: {
        slug: "demo",
        threadId: "demo:continuity",
        text,
        agent: "sancho",
        scope: "agent",
        idempotencyKey,
      },
    }) as unknown as NextApiRequest;

  try {
    const first = mockResponse();
    await sendHandler(request("Mi objetivo es lanzar la campaña", "continuity:1"), first.res);
    assert.equal(first.read().statusCode, 200);
    const second = mockResponse();
    await sendHandler(request("¿Cuál era mi objetivo?", "continuity:2"), second.res);
    assert.equal(second.read().statusCode, 200);
    assert.equal(received.length, 2);
    assert.deepEqual(received[0].priorThreadMessages, []);
    assert.equal(
      (received[1].priorThreadMessages as Array<Record<string, unknown>>).some(
        (message) =>
          message.role === "user" &&
          message.text === "Mi objetivo es lanzar la campaña",
      ),
      true,
    );
  } finally {
    await close(runtime);
  }
});

test("a run that failed to reach the runtime does not wedge the idempotency key", async () => {
  // A transient gateway outage marks the delegation's run `failed`. Because the
  // task-dispatch idempotency key is deterministic, the retry must NOT 409
  // forever — it must supersede the failed run with a fresh dispatch.
  let calls = 0;
  const runtime = http.createServer((req, res) => {
    req.resume();
    req.on("end", () => {
      calls += 1;
      if (calls === 1) {
        // First attempt: gateway is momentarily unhealthy.
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "gateway boom" }));
      } else {
        res.writeHead(202, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true, runId: "external-retry" }));
      }
    });
  });
  const address = await listen(runtime);
  process.env.SANCHO_EXTERNAL_GATEWAY_URL = `http://127.0.0.1:${address.port}`;

  const { resetRuntimeForTests } = await import("../runtime");
  resetRuntimeForTests();
  const { sendHandler } = await import("@/pages/api/chat/send");
  const runsModule = await import("../data/agent-runs");
  const agentRuns =
    (runsModule as unknown as { default: typeof runsModule }).default ??
    runsModule;
  const parentHeaders = createParentAuthority(agentRuns, "demo:wedge");

  const body = {
    slug: "demo",
    threadId: "demo:wedge",
    text: "Delega a Hamete",
    agent: "sancho",
    scope: "agent",
    userId: "mc-admin",
    isAdmin: false,
    senderRole: "client",
    controlDepth: 1,
    idempotencyKey: "mc-control:owner:task-dispatch:wedge",
  };

  try {
    const first = mockResponse();
    await sendHandler(runtimeRequest(body, parentHeaders), first.res);
    assert.equal(first.read().statusCode, 502);
    const afterFirst = agentRuns
      .listAgentRunsForThread("demo:wedge")
      .filter((run) => run.idempotencyKey === body.idempotencyKey);
    assert.equal(afterFirst.length, 1);
    assert.equal(afterFirst[0].status, "failed");

    const retry = mockResponse();
    await sendHandler(runtimeRequest(body, parentHeaders), retry.res);
    // Was 409 before the fix — now the failed run is superseded by a fresh one.
    assert.equal(retry.read().statusCode, 200);
    assert.notEqual(retry.read().payload.duplicate, true);
    const afterRetry = agentRuns
      .listAgentRunsForThread("demo:wedge")
      .filter((run) => run.idempotencyKey === body.idempotencyKey);
    assert.equal(afterRetry.length, 2);
    assert.equal(calls, 2);
  } finally {
    await close(runtime);
  }
});
