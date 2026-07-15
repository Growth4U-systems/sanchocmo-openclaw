import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import type { NextApiRequest, NextApiResponse } from "next";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "sancho-chat-send-runtime-"));
process.env.MC_WORKSPACE = tmp;
process.env.MC_TASKS_BACKEND = "json";
process.env.SANCHO_RUNTIME = "external-http";
process.env.SANCHO_EXTERNAL_SECRET = "runtime-secret";
process.env.GIT_COMMIT = "deployed-support-sha";
process.env.SANCHOCMO_IMAGE_DIGEST = "sha256:support-image";
process.env.NEXT_PUBLIC_ENV_LABEL = "Staging";

function listen(server: http.Server): Promise<{ port: number }> {
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve(server.address() as { port: number }));
  });
}

function close(server: http.Server): Promise<void> {
  return new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}

function mockResponse() {
  let statusCode = 200;
  let payload: Record<string, unknown> = {};
  const res = {
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

function runtimeRequest(body: Record<string, unknown>): NextApiRequest {
  return {
    method: "POST",
    headers: {
      "x-mc-secret": "runtime-secret",
      "x-request-id": "trace-chat-send-1",
      traceparent: "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01",
    },
    body,
    query: {},
  } as unknown as NextApiRequest;
}

test("trusted send retries reuse one ledger run and a client cannot claim mc-admin", async () => {
  const received: Array<Record<string, unknown>> = [];
  const receivedHeaders: http.IncomingHttpHeaders[] = [];
  const runtime = http.createServer((req, res) => {
    let raw = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => { raw += chunk; });
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
  const agentRuns = (runsModule as unknown as { default: typeof runsModule }).default ?? runsModule;

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
    await sendHandler(runtimeRequest(body), first.res);
    assert.equal(first.read().statusCode, 200);
    assert.equal(received.length, 1);
    assert.equal(received[0].userId, "mc-client-demo");
    assert.equal(received[0].controlDepth, 1);
    assert.equal(typeof received[0].missionControlRunId, "string");
    assert.equal(received[0].traceId, "trace-chat-send-1");
    assert.match(String(received[0].traceparent), /^00-4bf92f3577b34da6a3ce929d0e0e4736-/);
    assert.equal(receivedHeaders[0]["x-request-id"], "trace-chat-send-1");
    assert.match(String(receivedHeaders[0].traceparent), /^00-4bf92f3577b34da6a3ce929d0e0e4736-/);
    assert.equal(first.read().payload.traceId, "trace-chat-send-1");

    const retry = mockResponse();
    await sendHandler(runtimeRequest(body), retry.res);
    assert.equal(retry.read().statusCode, 200);
    assert.equal(retry.read().payload.duplicate, true);
    assert.equal(received.length, 1);
    assert.equal(agentRuns.listAgentRunsForThread("demo:general").length, 1);

    const browser = mockResponse();
    await sendHandler({
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
    } as unknown as NextApiRequest, browser.res);
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
      idempotencyKey: "growie-support-turn-1",
    };
    const supportNonAdmin = mockResponse();
    await sendHandler({
      method: "POST",
      headers: {
        referer: "https://staging.sanchocmo.ai/dashboard/demo/content?token=do-not-forward",
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
    } as unknown as NextApiRequest, supportNonAdmin.res);
    assert.equal(supportNonAdmin.read().statusCode, 403);
    assert.equal(received.length, 2);

    const support = mockResponse();
    await sendHandler({
      method: "POST",
      headers: {
        referer: "https://staging.sanchocmo.ai/dashboard/demo/content?token=do-not-forward",
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
    } as unknown as NextApiRequest, support.res);
    assert.equal(support.read().statusCode, 200);
    assert.equal(received.length, 3);
    assert.equal(received[2].agent, "sancho");
    assert.equal(received[2].readOnly, true);
    assert.equal(received[2].channelMode, "support-diagnostic");
    assert.equal(received[2]._source, "growie-support");
    assert.equal(received[2].threadName, "Growie · Soporte");
    assert.equal(received[2].linkedTo, "support/growie");
    assert.deepEqual(received[2].supportContext, {
      pagePath: "/dashboard/demo/content",
      deployedCommit: "deployed-support-sha",
      imageDigest: "sha256:support-image",
      environment: "Staging",
    });

    const crossTenant = mockResponse();
    await sendHandler(runtimeRequest({
      ...body,
      slug: "demo",
      threadId: "other:general",
      text: "Do not cross tenants",
      idempotencyKey: "mc-control:cross-tenant",
    }), crossTenant.res);
    assert.equal(crossTenant.read().statusCode, 400);
    assert.equal(crossTenant.read().payload.error, "Thread does not belong to slug");
    assert.equal(received.length, 3);
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
  const agentRuns = (runsModule as unknown as { default: typeof runsModule }).default ?? runsModule;

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
    await sendHandler(runtimeRequest(body), first.res);
    assert.equal(first.read().statusCode, 502);
    const afterFirst = agentRuns.listAgentRunsForThread("demo:wedge");
    assert.equal(afterFirst.length, 1);
    assert.equal(afterFirst[0].status, "failed");

    const retry = mockResponse();
    await sendHandler(runtimeRequest(body), retry.res);
    // Was 409 before the fix — now the failed run is superseded by a fresh one.
    assert.equal(retry.read().statusCode, 200);
    assert.notEqual(retry.read().payload.duplicate, true);
    const afterRetry = agentRuns.listAgentRunsForThread("demo:wedge");
    assert.equal(afterRetry.length, 2);
    assert.equal(calls, 2);
  } finally {
    await close(runtime);
  }
});
