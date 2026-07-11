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
    headers: { "x-mc-secret": "runtime-secret" },
    body,
    query: {},
  } as unknown as NextApiRequest;
}

test("trusted send retries reuse one ledger run and a client cannot claim mc-admin", async () => {
  const received: Array<Record<string, unknown>> = [];
  const runtime = http.createServer((req, res) => {
    let raw = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => { raw += chunk; });
    req.on("end", () => {
      received.push(JSON.parse(raw));
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
  } finally {
    await close(runtime);
  }
});
