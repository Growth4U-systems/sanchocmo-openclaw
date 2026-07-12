import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import type { NextApiRequest, NextApiResponse } from "next";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "sancho-outbound-choice-"));
process.env.MC_WORKSPACE = tmp;
process.env.MC_TASKS_BACKEND = "json";
process.env.SANCHO_RUNTIME = "external-http";
process.env.SANCHO_EXTERNAL_SECRET = "runtime-secret";
process.env.SANCHO_EXTERNAL_GATEWAY_URL = "http://127.0.0.1:1";
process.env.OUTBOUND_PREPARATION_BATCH_SIZE = "3";

function writeFoundationConfig() {
  const dir = path.join(tmp, "brand", "growth4u", "go-to-market", "ecps");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "config.json"), JSON.stringify({
    country: "ES",
    icp: {
      company_context: "Empresa tech post-PMF España, 5-200 empleados",
      role_keywords: [
        "fundador startup",
        "CEO startup",
        "CMO",
        "head of growth",
        "director marketing",
        "VP growth",
      ],
    },
  }));
}

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

test("an outbound ECP click starts YALC directly without invoking the agent gateway", async () => {
  writeFoundationConfig();
  const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
  const yalc = http.createServer((req, res) => {
    let raw = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => { raw += chunk; });
    req.on("end", () => {
      calls.push({ url: req.url || "", body: JSON.parse(raw) });
      const reused = calls.length === 2;
      res.writeHead(reused ? 200 : 202, { "Content-Type": "application/json" });
      res.end(JSON.stringify(reused ? {
        ok: true,
        command: "outbound.workflow.start",
        campaignId: "campaign-1",
        runId: "run-1",
        status: "awaiting_approval",
        reused: true,
        reusedBecause: "active_equivalent_workflow",
        batch: {
          itemCount: 3,
          contentHash: "content-hash-1",
          sample: [{ leadId: "lead-1", messageBody: "Hola Ruth" }],
        },
      } : {
        ok: true,
        command: "outbound.workflow.start",
        campaignId: "campaign-1",
        runId: "run-1",
        jobId: "job-1",
        status: "queued",
        statusUrl: "/api/jobs/job-1",
      }));
    });
  });
  const address = await listen(yalc);
  process.env.GROWTH4U_YALC_BASE_URL = `http://127.0.0.1:${address.port}`;

  const { resetRuntimeForTests } = await import("../runtime");
  resetRuntimeForTests();
  const { getThread } = await import("../data/mc-chat");
  const { sendHandler } = await import("@/pages/api/chat/send");
  const threadId = "growth4u:b2b-campaign-new-test";

  const optionsResponse = mockResponse();
  await sendHandler({
    method: "POST",
    headers: { "x-mc-secret": "runtime-secret", host: "localhost:3000" },
    query: {},
    body: {
      slug: "growth4u",
      threadId,
      text: "Quiero crear una campaña B2B por LinkedIn.",
      agent: "rocinante",
      scope: "agent",
      skill: "yalc-operator",
    },
  } as unknown as NextApiRequest, optionsResponse.res);

  assert.equal(optionsResponse.read().statusCode, 200);
  assert.equal(optionsResponse.read().payload.deterministic, true);
  assert.equal(calls.length, 0, "opening the campaign chooser must not call YALC or the agent gateway");
  const preparedThread = getThread(threadId);
  assert.equal(preparedThread.routing?.agent, "rocinante");
  assert.equal(preparedThread.routing?.skillHint, "yalc-operator");
  const optionMessage = preparedThread.messages.at(-1)?.text || "";
  const askMatch = optionMessage.match(/:::ask\n([\s\S]*?)\n:::/);
  assert.ok(askMatch);
  const question = JSON.parse(askMatch[1]) as {
    id: string;
    options: Array<{ id: string; label: string; workflowIntent: Record<string, unknown> }>;
  };
  assert.equal(question.id, "outbound_ecp_v1");
  assert.equal(question.options.length, 3);
  const selected = question.options[0];
  assert.doesNotMatch(String(selected.workflowIntent.targetSegment), /MRR|post-PMF/i);

  const response = mockResponse();
  try {
    await sendHandler({
      method: "POST",
      headers: {
        "x-mc-secret": "runtime-secret",
        host: "localhost:3000",
      },
      query: {},
      body: {
        slug: "growth4u",
        threadId,
        text: `[ask:outbound_ecp_v1] respuesta: ${selected.label} <!--workflow-option:${selected.id}-->`,
        agent: "rocinante",
        scope: "agent",
      },
    } as unknown as NextApiRequest, response.res);

    assert.equal(response.read().statusCode, 200);
    assert.equal(response.read().payload.deterministic, true);
    assert.equal(calls.length, 1);
    assert.match(calls[0].url, /^\/api\/outbound\/command\?tenant=growth4u$/);
    assert.equal(calls[0].body.command, "outbound.workflow.start");
    assert.deepEqual(calls[0].body.intent, selected.workflowIntent);
    assert.equal(
      (calls[0].body.callbackContext as Record<string, unknown>).threadId,
      threadId,
    );
    const messages = getThread(threadId).messages;
    assert.match(messages.at(-1)?.text || "", /workflow buscará primero las empresas/i);
    assert.doesNotMatch(messages.at(-1)?.text || "", /Campaña:|Run:|campaign-1|run-1/);
    const selectedUserMessage = [...messages].reverse().find((message) => message.role === "user");
    assert.equal(selectedUserMessage?.text, selected.label);
    assert.doesNotMatch(selectedUserMessage?.text || "", /workflow-option|\[ask:/);

    const invalid = mockResponse();
    await sendHandler({
      method: "POST",
      headers: { "x-mc-secret": "runtime-secret", host: "localhost:3000" },
      query: {},
      body: {
        slug: "growth4u",
        threadId,
        text: "[ask:outbound_ecp_v1] respuesta: Inventado <!--workflow-option:not-real-->",
        agent: "rocinante",
        scope: "agent",
      },
    } as unknown as NextApiRequest, invalid.res);
    assert.equal(invalid.read().statusCode, 200);
    assert.equal(invalid.read().payload.ok, false);
    assert.equal(calls.length, 1, "invalid structured choices must not reach YALC or the agent gateway");
    const invalidUserMessage = [...getThread(threadId).messages].reverse().find((message) => message.role === "user");
    assert.equal(invalidUserMessage?.text, "Inventado");

    const reusedThreadId = "growth4u:b2b-campaign-new-reused-test";
    const reusedOptions = mockResponse();
    await sendHandler({
      method: "POST",
      headers: { "x-mc-secret": "runtime-secret", host: "localhost:3000" },
      query: {},
      body: {
        slug: "growth4u",
        threadId: reusedThreadId,
        text: "Quiero crear una campaña B2B por LinkedIn.",
        agent: "rocinante",
        scope: "agent",
        skill: "yalc-operator",
      },
    } as unknown as NextApiRequest, reusedOptions.res);
    const reusedSelection = mockResponse();
    await sendHandler({
      method: "POST",
      headers: { "x-mc-secret": "runtime-secret", host: "localhost:3000" },
      query: {},
      body: {
        slug: "growth4u",
        threadId: reusedThreadId,
        text: `[ask:outbound_ecp_v1] respuesta: ${selected.label} <!--workflow-option:${selected.id}-->`,
        agent: "rocinante",
        scope: "agent",
      },
    } as unknown as NextApiRequest, reusedSelection.res);
    assert.equal(reusedSelection.read().statusCode, 200);
    assert.equal(calls.length, 2);
    const reusedMessage = getThread(reusedThreadId).messages.at(-1);
    assert.equal(reusedMessage?.role, "workflow");
    assert.match(reusedMessage?.text || "", /No creé otra ni repetí la búsqueda/);
    assert.equal(reusedMessage?.workflowJob?.campaignId, "campaign-1");

    const missingFoundation = mockResponse();
    await sendHandler({
      method: "POST",
      headers: { "x-mc-secret": "runtime-secret", host: "localhost:3000" },
      query: {},
      body: {
        slug: "missing-client",
        threadId: "missing-client:b2b-campaign-new-test",
        text: "Quiero crear una campaña B2B por LinkedIn.",
        agent: "rocinante",
        scope: "agent",
        skill: "yalc-operator",
      },
    } as unknown as NextApiRequest, missingFoundation.res);
    assert.equal(missingFoundation.read().statusCode, 200);
    assert.equal(missingFoundation.read().payload.ok, false);
    assert.equal(calls.length, 2, "missing Foundation must fail before YALC or the agent gateway");
  } finally {
    await close(yalc);
  }
});
