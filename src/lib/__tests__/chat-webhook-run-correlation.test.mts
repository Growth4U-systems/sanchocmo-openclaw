import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import type { NextApiRequest, NextApiResponse } from "next";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "sancho-chat-webhook-run-"));
process.env.MC_WORKSPACE = tmp;
process.env.SANCHO_RUNTIME = "external-http";
process.env.SANCHO_EXTERNAL_SECRET = "callback-secret";

const { resetRuntimeForTests } = await import("../runtime");
resetRuntimeForTests();
const runsModule = await import("../data/agent-runs");
const agentRuns =
  (runsModule as unknown as { default: typeof runsModule }).default ??
  runsModule;
const chatModule = await import("../data/mc-chat");
const chat =
  (chatModule as unknown as { default: typeof chatModule }).default ??
  chatModule;
const readbackModule = await import("../quality/artifact-readback");
const artifactReadback =
  (readbackModule as unknown as { default: typeof readbackModule }).default ??
  readbackModule;
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
    input: {
      slug: "demo",
      userText: "temporary",
      temporaryAgent: true,
      senderRole: "client",
    },
  });
  agentRuns.markAgentRunDispatched(temporary.id, threadId);
  chat.setStatusEntry(threadId, {
    text: "Sancho sigue trabajando",
    agent: "sancho",
    ts: Date.now(),
  });

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
  await webhookHandler(
    {
      method: "POST",
      headers: { "x-mc-secret": "callback-secret" },
      body: {
        slug: "demo",
        threadId: "demo:two",
        missionControlRunId: run.id,
        text: "wrong thread",
      },
      query: {},
    } as unknown as NextApiRequest,
    mocked.res,
  );
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
  assert.equal(
    chat
      .getThread(threadId)
      .messages.filter((message) => message.text === "Resultado único").length,
    1,
  );
});

test("a persisted callback claim on an active run is recovered after a crash", async () => {
  const threadId = "demo:crash-replay";
  const run = agentRuns.createAgentRun({
    threadId,
    runtime: "external-http",
    agent: "sancho",
    input: { slug: "demo", userText: "hazlo" },
  });
  agentRuns.markAgentRunDispatched(run.id, threadId);
  const body = {
    slug: "demo",
    threadId,
    missionControlRunId: run.id,
    text: "Resultado recuperado",
    agent: "sancho",
  };
  const fingerprint = createHash("sha256")
    .update(
      JSON.stringify({
        role: "bot",
        text: body.text,
        agent: body.agent,
        errorDetail: undefined,
      }),
    )
    .digest("hex");
  // Simulate a process dying immediately after the durable claim.
  assert.equal(
    agentRuns.claimAgentRunCallbackFingerprint(run.id, fingerprint),
    true,
  );
  // Also cover a crash after the visible message write but before the run's
  // terminal ledger transition.
  chat.addMessage(
    threadId,
    "bot",
    body.text,
    body.agent,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    `${run.id}:${fingerprint}`,
  );

  const retry = mockResponse();
  await webhookHandler(
    {
      method: "POST",
      headers: { "x-mc-secret": "callback-secret" },
      body,
      query: {},
    } as unknown as NextApiRequest,
    retry.res,
  );

  assert.equal(retry.read().statusCode, 200);
  assert.equal(retry.read().payload.duplicate, undefined);
  assert.equal(agentRuns.getAgentRunById(run.id)?.status, "completed");
  assert.equal(
    chat
      .getThread(threadId)
      .messages.filter((message) => message.text === body.text).length,
    1,
  );
});

test("an uncorrelated legacy callback is UI-only with multiple active runs", async () => {
  const threadId = "demo:legacy-ambiguous";
  const owner = agentRuns.createAgentRun({
    threadId,
    runtime: "external-http",
    agent: "rocinante",
    input: { slug: "demo", userText: "old request" },
  });
  agentRuns.markAgentRunDispatched(owner.id, threadId);
  const newer = agentRuns.createAgentRun({
    threadId,
    runtime: "external-http",
    agent: "sancho",
    input: { slug: "demo", userText: "new request" },
  });
  agentRuns.markAgentRunDispatched(newer.id, threadId);

  const response = mockResponse();
  await webhookHandler(
    {
      method: "POST",
      headers: { "x-mc-secret": "callback-secret" },
      body: {
        slug: "demo",
        threadId,
        text: "late owner result",
        agent: "rocinante",
      },
      query: {},
    } as unknown as NextApiRequest,
    response.res,
  );

  assert.equal(response.read().statusCode, 200);
  assert.equal(agentRuns.getAgentRunById(owner.id)?.status, "running");
  assert.equal(agentRuns.getAgentRunById(newer.id)?.status, "running");
  assert.equal(
    chat
      .getThread(threadId)
      .messages.some((message) => message.text === "late owner result"),
    true,
  );
});

test("an uncorrelated legacy callback cannot terminalize the sole active run", async () => {
  const threadId = "demo:legacy-single";
  const active = agentRuns.createAgentRun({
    threadId,
    runtime: "external-http",
    agent: "sancho",
    input: { slug: "demo", userText: "new request" },
  });
  agentRuns.markAgentRunDispatched(active.id, threadId);

  const response = mockResponse();
  await webhookHandler(
    {
      method: "POST",
      headers: { "x-mc-secret": "callback-secret" },
      body: {
        slug: "demo",
        threadId,
        text: "uncorrelated old result",
        agent: "sancho",
      },
      query: {},
    } as unknown as NextApiRequest,
    response.res,
  );

  assert.equal(response.read().statusCode, 200);
  assert.equal(agentRuns.getAgentRunById(active.id)?.status, "running");
  assert.deepEqual(
    agentRuns.listAgentRunEvents(active.id).map((event) => event.type),
    ["run_created", "runtime_dispatched"],
  );
  assert.equal(
    chat
      .getThread(threadId)
      .messages.some((message) => message.text === "uncorrelated old result"),
    true,
  );
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
    await webhookHandler(
      {
        method: "POST",
        headers: { "x-mc-secret": "callback-secret" },
        body: {
          slug: "demo",
          threadId,
          missionControlRunId: run.id,
          text,
          agent: "sancho",
        },
        query: {},
      } as unknown as NextApiRequest,
      mocked.res,
    );
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
  await webhookHandler(
    {
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
    } as unknown as NextApiRequest,
    mocked.res,
  );
  assert.equal(mocked.read().payload.cancelled, true);
  assert.equal(
    chat
      .getThread(threadId)
      .messages.some((message) => message.text.includes("después de Stop")),
    false,
  );
});

test("successful webhook persists causal artifact readback only for a matching file_write", async () => {
  const threadId = "demo:causal-readback";
  const output = path.join(tmp, "brand", "demo", "reports", "final.md");
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, "causal bytes");
  const agentWorkspace = path.join(tmp, "workspace-specialist");
  fs.mkdirSync(agentWorkspace, { recursive: true });
  fs.symlinkSync(
    path.join("..", "brand"),
    path.join(agentWorkspace, "brand"),
    "dir",
  );
  const agentOutput = path.join(
    agentWorkspace,
    "brand",
    "demo",
    "reports",
    "final.md",
  );
  const run = agentRuns.createAgentRun({
    threadId,
    runtime: "external-http",
    agent: "sancho",
    taskId: "T-CAUSAL",
    taskContract: {
      completion: "Report exists",
      expectedOutputs: [
        { path: "brand/demo/reports/*.md", source: "output_files" },
      ],
    },
    input: { slug: "demo", userText: "write report", senderRole: "admin" },
  });
  agentRuns.markAgentRunDispatched(run.id, threadId);

  const progress = mockResponse();
  await webhookHandler(
    {
      method: "POST",
      headers: { "x-mc-secret": "callback-secret" },
      body: {
        slug: "demo",
        threadId,
        missionControlRunId: run.id,
        role: "progress",
        event: {
          kind: "file_write",
          label: "Writing report",
          target: agentOutput,
        },
        agent: "sancho",
      },
      query: {},
    } as unknown as NextApiRequest,
    progress.res,
  );
  assert.equal(progress.read().statusCode, 200);
  // The write must happen at or after the causally bound progress receipt.
  await new Promise((resolve) => setTimeout(resolve, 5));
  fs.writeFileSync(output, "causal bytes after progress");
  // The kernel stamps mtime from the coarse clock, granular to one timer tick
  // (10ms at CONFIG_HZ=100), which can put the write before the receipt and drop
  // the readback. Pin mtime to the wall clock so the gap above is what counts.
  // It must stay a whole millisecond wide: utimes round-trips through ns and
  // reads back ~0.001ms low, and the lower bound has no pre-progress tolerance.
  const writtenAt = new Date();
  fs.utimesSync(output, writtenAt, writtenAt);

  const final = mockResponse();
  await webhookHandler(
    {
      method: "POST",
      headers: { "x-mc-secret": "callback-secret" },
      body: {
        slug: "demo",
        threadId,
        missionControlRunId: run.id,
        text: "Done",
        agent: "sancho",
      },
      query: {},
    } as unknown as NextApiRequest,
    final.res,
  );
  assert.equal(final.read().statusCode, 200);

  const events = agentRuns.listAgentRunEvents(run.id);
  assert.deepEqual(
    events.map((entry) => entry.type),
    [
      "run_created",
      "runtime_dispatched",
      "progress",
      "artifact_readback",
      "bot_reply",
    ],
  );
  const readback = events.find((entry) => entry.type === "artifact_readback")
    ?.data as {
    expectedPath: string;
    actualPath: string;
    sha256: string;
  };
  assert.equal(readback.expectedPath, "brand/demo/reports/*.md");
  assert.equal(readback.actualPath, "brand/demo/reports/final.md");
  assert.match(readback.sha256, /^[a-f0-9]{64}$/);
  assert.equal(
    (
      agentRuns.getAgentRunById(run.id)?.output as {
        artifactReadbackCount: number;
      }
    ).artifactReadbackCount,
    1,
  );
});

test("file_write intent cannot certify a pre-existing stale file", async () => {
  const threadId = "demo:stale-readback";
  const output = path.join(tmp, "brand", "demo", "reports", "stale.md");
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, "old bytes");
  // A near-stale file used to pass via the former five-second tolerance.
  const old = new Date(Date.now() - 4_000);
  fs.utimesSync(output, old, old);
  const run = agentRuns.createAgentRun({
    threadId,
    runtime: "external-http",
    agent: "sancho",
    taskId: "T-STALE",
    taskContract: {
      expectedOutputs: [
        { path: "brand/demo/reports/stale.md", source: "deliverable_file" },
      ],
    },
    input: { slug: "demo", userText: "write stale report" },
  });
  agentRuns.markAgentRunDispatched(run.id, threadId);

  const progress = mockResponse();
  await webhookHandler(
    {
      method: "POST",
      headers: { "x-mc-secret": "callback-secret" },
      body: {
        slug: "demo",
        threadId,
        missionControlRunId: run.id,
        role: "progress",
        event: { kind: "file_write", label: "Writing report", target: output },
        agent: "sancho",
      },
      query: {},
    } as unknown as NextApiRequest,
    progress.res,
  );

  const final = mockResponse();
  await webhookHandler(
    {
      method: "POST",
      headers: { "x-mc-secret": "callback-secret" },
      body: {
        slug: "demo",
        threadId,
        missionControlRunId: run.id,
        text: "Done",
        agent: "sancho",
      },
      query: {},
    } as unknown as NextApiRequest,
    final.res,
  );

  const events = agentRuns.listAgentRunEvents(run.id);
  assert.equal(
    events.some((entry) => entry.type === "artifact_readback"),
    false,
  );
  assert.equal(
    (
      agentRuns.getAgentRunById(run.id)?.output as {
        artifactReadbackCount: number;
      }
    ).artifactReadbackCount,
    0,
  );
});

test("a tenant-root symlink cannot relabel another tenant's artifact", async () => {
  const brandRoot = path.join(tmp, "brand");
  const betaRoot = path.join(brandRoot, "beta-readback-boundary");
  const alphaRoot = path.join(brandRoot, "alpha-readback-boundary");
  fs.mkdirSync(betaRoot, { recursive: true });
  fs.writeFileSync(path.join(betaRoot, "private.md"), "beta-only bytes");
  fs.symlinkSync(path.basename(betaRoot), alphaRoot, "dir");
  const now = new Date();
  const run = {
    id: "run_cross_tenant_readback",
    threadId: "alpha-readback-boundary:task",
    runtime: "external-http",
    status: "running" as const,
    taskId: "T-CROSS-TENANT",
    taskContract: {
      expectedOutputs: [
        {
          path: "brand/alpha-readback-boundary/private.md",
          source: "deliverable_file" as const,
        },
      ],
    },
    createdAt: new Date(now.getTime() - 1_000).toISOString(),
    updatedAt: now.toISOString(),
  };
  const progress = {
    id: "evt_cross_tenant_readback",
    runId: run.id,
    threadId: run.threadId,
    type: "progress" as const,
    ts: now.toISOString(),
    data: { kind: "file_write", target: "private.md" },
  };

  const result = await artifactReadback.persistCausalArtifactReadbacks(
    run,
    "alpha-readback-boundary",
    [progress],
    new Date(now.getTime() + 100),
  );
  assert.deepEqual(result, []);
});
