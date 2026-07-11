import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { NextApiRequest, NextApiResponse } from "next";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "sancho-chat-webhook-run-"));
process.env.MC_WORKSPACE = tmp;
process.env.SANCHO_RUNTIME = "external-http";
process.env.SANCHO_EXTERNAL_SECRET = "callback-secret";

const { resetRuntimeForTests } = await import("../runtime");
resetRuntimeForTests();
const runsModule = await import("../data/agent-runs");
const agentRuns = (runsModule as unknown as { default: typeof runsModule }).default ?? runsModule;
const chatModule = await import("../data/mc-chat");
const chat = (chatModule as unknown as { default: typeof chatModule }).default ?? chatModule;
const { webhookHandler } = await import("@/pages/api/chat/webhook");

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

test("a late owner callback completes only its exact run and preserves the temporary run state", async () => {
  const threadId = "demo:task-p1-t1";
  const owner = agentRuns.createAgentRun({
    threadId,
    runtime: "external-http",
    agent: "rocinante",
    input: { slug: "demo", userText: "owner", senderRole: "client" },
  });
  agentRuns.markAgentRunDispatched(owner.id, threadId);
  const temporary = agentRuns.createAgentRun({
    threadId,
    runtime: "external-http",
    agent: "sancho",
    input: { slug: "demo", userText: "temporary", temporaryAgent: true, senderRole: "client" },
  });
  agentRuns.markAgentRunDispatched(temporary.id, threadId);
  chat.setStatusEntry(threadId, { text: "Sancho sigue trabajando", agent: "sancho", ts: Date.now() });

  const req = {
    method: "POST",
    headers: { "x-mc-secret": "callback-secret" },
    body: {
      slug: "demo",
      threadId,
      missionControlRunId: owner.id,
      text: "Parte tardía del owner",
      agent: "rocinante",
    },
    query: {},
  } as unknown as NextApiRequest;
  const mocked = mockResponse();
  await webhookHandler(req, mocked.res);

  assert.equal(mocked.read().statusCode, 200);
  assert.equal(agentRuns.getAgentRunById(owner.id)?.status, "completed");
  assert.equal(agentRuns.getAgentRunById(temporary.id)?.status, "running");
  assert.equal(agentRuns.getLatestActiveRun(threadId)?.id, temporary.id);
  assert.equal(chat.getStatusEntry(threadId)?.text, "Sancho sigue trabajando");
});

test("a callback run id cannot be replayed onto another thread", async () => {
  const run = agentRuns.createAgentRun({
    threadId: "demo:one",
    runtime: "external-http",
  });
  const mocked = mockResponse();
  await webhookHandler({
    method: "POST",
    headers: { "x-mc-secret": "callback-secret" },
    body: {
      slug: "demo",
      threadId: "demo:two",
      missionControlRunId: run.id,
      text: "wrong thread",
    },
    query: {},
  } as unknown as NextApiRequest, mocked.res);
  assert.equal(mocked.read().statusCode, 409);
  assert.equal(agentRuns.getAgentRunById(run.id)?.status, "queued");
});

test("a retried terminal callback is acknowledged without duplicating the visible reply", async () => {
  const threadId = "demo:idempotent";
  const run = agentRuns.createAgentRun({
    threadId,
    runtime: "external-http",
    agent: "sancho",
    input: { slug: "demo", userText: "hazlo", senderRole: "admin" },
  });
  agentRuns.markAgentRunDispatched(run.id, threadId);
  const request = {
    method: "POST",
    headers: { "x-mc-secret": "callback-secret" },
    body: {
      slug: "demo",
      threadId,
      missionControlRunId: run.id,
      text: "Resultado único",
      agent: "sancho",
    },
    query: {},
  } as unknown as NextApiRequest;
  const first = mockResponse();
  const retry = mockResponse();
  await webhookHandler(request, first.res);
  await webhookHandler(request, retry.res);
  assert.equal(first.read().payload.duplicate, undefined);
  assert.equal(retry.read().payload.stale, true);
  assert.equal(chat.getThread(threadId).messages.filter((message) => message.text === "Resultado único").length, 1);
});

test("a run accepts only one terminal callback", async () => {
  const threadId = "demo:multipart";
  const run = agentRuns.createAgentRun({
    threadId,
    runtime: "external-http",
    agent: "sancho",
    input: { slug: "demo", userText: "explica", senderRole: "admin" },
  });
  agentRuns.markAgentRunDispatched(run.id, threadId);
  const sendPart = async (text: string) => {
    const mocked = mockResponse();
    await webhookHandler({
      method: "POST",
      headers: { "x-mc-secret": "callback-secret" },
      body: { slug: "demo", threadId, missionControlRunId: run.id, text, agent: "sancho" },
      query: {},
    } as unknown as NextApiRequest, mocked.res);
    return mocked.read().payload;
  };
  assert.equal((await sendPart("Parte uno")).duplicate, undefined);
  assert.equal((await sendPart("Parte dos")).stale, true);
  assert.equal((await sendPart("Parte dos")).stale, true);
  assert.deepEqual(
    chat.getThread(threadId).messages.map((message) => message.text),
    ["Parte uno"],
  );
});

test("a callback correlated to a cancelled run never becomes a chat message", async () => {
  const threadId = "demo:cancelled";
  const run = agentRuns.createAgentRun({
    threadId,
    runtime: "external-http",
    agent: "sancho",
    input: { slug: "demo", userText: "hazlo", senderRole: "admin" },
  });
  agentRuns.markAgentRunDispatched(run.id, threadId);
  agentRuns.markAgentRunCancelled(run.id, threadId);
  chat.markCancelled(threadId);
  const mocked = mockResponse();
  await webhookHandler({
    method: "POST",
    headers: { "x-mc-secret": "callback-secret" },
    body: {
      slug: "demo",
      threadId,
      missionControlRunId: run.id,
      text: "Respuesta que llegó después de Stop",
      agent: "sancho",
    },
    query: {},
  } as unknown as NextApiRequest, mocked.res);
  assert.equal(mocked.read().payload.cancelled, true);
  assert.equal(chat.getThread(threadId).messages.some((message) => message.text.includes("después de Stop")), false);
});
