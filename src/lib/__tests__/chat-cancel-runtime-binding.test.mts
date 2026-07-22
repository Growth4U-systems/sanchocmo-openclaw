import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { NextApiRequest, NextApiResponse } from "next";

const workspace = fs.mkdtempSync(
  path.join(os.tmpdir(), "sancho-cancel-runtime-binding-"),
);
process.env.MC_WORKSPACE = workspace;
process.env.SANCHO_AGENT_RUNS_BACKEND = "json";
process.env.SANCHO_AGENT_RUNS_ALLOW_NON_DURABLE = "true";
process.env.SANCHO_RUNTIME = "external-http";
process.env.SANCHO_EXTERNAL_GATEWAY_URL = "http://current-runtime.invalid";
process.env.SANCHO_EXTERNAL_SECRET = "current-secret";
process.env.HERMES_GATEWAY_URL = "http://original-hermes.test";
process.env.HERMES_BRIDGE_SECRET = "hermes-secret";

const agentRuns = await import("@/lib/data/agent-runs");
const mcChat = await import("@/lib/data/mc-chat");
const { cancelHandler } = await import("@/pages/api/chat/cancel");

function response() {
  const state: { status: number; body?: Record<string, unknown> } = {
    status: 200,
  };
  const res = {
    status(code: number) {
      state.status = code;
      return this;
    },
    json(body: Record<string, unknown>) {
      state.body = body;
      return this;
    },
  } as unknown as NextApiResponse;
  return { state, res };
}

test("cancel dispatches to the runtime recorded on the run, not the current selection", async () => {
  const threadId = "demo:runtime-binding";
  const run = agentRuns.createAgentRun({
    threadId,
    runtime: "hermes",
    agent: "sancho",
    input: { slug: "demo", threadId },
  });
  agentRuns.markAgentRunDispatched(run.id, threadId);

  const previousFetch = globalThis.fetch;
  const calls: Array<{
    url: string;
    headers: Record<string, string>;
    body: unknown;
  }> = [];
  globalThis.fetch = (async (
    input: string | URL | Request,
    init?: RequestInit,
  ) => {
    calls.push({
      url: String(input),
      headers: init?.headers as Record<string, string>,
      body: JSON.parse(String(init?.body)),
    });
    return new Response(JSON.stringify({ ok: true, cancelled: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;

  try {
    const mocked = response();
    await cancelHandler(
      {
        method: "POST",
        headers: {},
        body: { slug: "demo", threadId, runId: run.id },
        query: {},
        ctx: { isAdmin: true, clientSlug: null, allowedSlugs: null },
      } as unknown as NextApiRequest,
      mocked.res,
    );

    assert.equal(mocked.state.status, 200);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, "http://original-hermes.test/sancho/inbound");
    assert.equal(calls[0].headers["X-MC-Secret"], "hermes-secret");
    assert.equal((calls[0].body as { text?: unknown }).text, "/stop");
    assert.equal(calls[0].headers["X-Sancho-Control-Action"], undefined);
    assert.equal(
      (calls[0].body as { runtimeControlAction?: unknown })
        .runtimeControlAction,
      undefined,
    );
    assert.equal(
      (calls[0].body as { missionControlRunId?: unknown }).missionControlRunId,
      run.id,
    );
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("OpenClaw Stop carries the dedicated exact-run control action", async () => {
  process.env.MC_CHAT_GATEWAY = "http://openclaw-runtime.test";
  process.env.MC_CHAT_SECRET = "openclaw-secret";
  const threadId = "demo:openclaw-stop-authority";
  const run = agentRuns.createAgentRun({
    threadId,
    runtime: "openclaw",
    agent: "sancho",
    input: { slug: "demo", threadId },
  });
  agentRuns.markAgentRunDispatched(run.id, threadId);

  const previousFetch = globalThis.fetch;
  const calls: Array<{
    url: string;
    headers: Record<string, string>;
    body: Record<string, unknown>;
  }> = [];
  globalThis.fetch = (async (
    input: string | URL | Request,
    init?: RequestInit,
  ) => {
    calls.push({
      url: String(input),
      headers: init?.headers as Record<string, string>,
      body: JSON.parse(String(init?.body)) as Record<string, unknown>,
    });
    return new Response(JSON.stringify({ ok: true, cancelled: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;

  try {
    const mocked = response();
    await cancelHandler(
      {
        method: "POST",
        headers: {},
        body: { slug: "demo", threadId, runId: run.id },
        query: {},
        ctx: { isAdmin: true, clientSlug: null, allowedSlugs: null },
      } as unknown as NextApiRequest,
      mocked.res,
    );

    assert.equal(mocked.state.status, 200);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, "http://openclaw-runtime.test/mc-chat/inbound");
    assert.equal(calls[0].headers["X-MC-Secret"], "openclaw-secret");
    assert.equal(calls[0].headers["X-Sancho-Control-Action"], "stop");
    assert.equal(calls[0].body.text, "/stop");
    assert.equal(calls[0].body.runtimeAuthorityText, "/stop");
    assert.equal(calls[0].body.runtimeControlAction, "stop");
    assert.equal(calls[0].body.missionControlRunId, run.id);
    assert.equal(calls[0].body.agent, "sancho");
    assert.equal(calls[0].body.agentId, "sancho");
    assert.equal(calls[0].body.runtimeToolCapability, undefined);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("OpenClaw Stop ignores a browser agent mismatch and binds the persisted run owner", async () => {
  process.env.MC_CHAT_GATEWAY = "http://openclaw-runtime.test";
  process.env.MC_CHAT_SECRET = "openclaw-secret";
  const threadId = "demo:openclaw-stop-agent-binding";
  const run = agentRuns.createAgentRun({
    threadId,
    runtime: "openclaw",
    agent: "sancho",
    input: { slug: "demo", threadId },
  });
  agentRuns.markAgentRunDispatched(run.id, threadId);

  const previousFetch = globalThis.fetch;
  let body: Record<string, unknown> | undefined;
  globalThis.fetch = (async (
    _input: string | URL | Request,
    init?: RequestInit,
  ) => {
    body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return new Response(JSON.stringify({ ok: true, cancelled: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;

  try {
    const mocked = response();
    await cancelHandler(
      {
        method: "POST",
        headers: {},
        body: {
          slug: "demo",
          threadId,
          runId: run.id,
          agent: "rocinante",
          agentId: "rocinante",
        },
        query: {},
        ctx: { isAdmin: true, clientSlug: null, allowedSlugs: null },
      } as unknown as NextApiRequest,
      mocked.res,
    );

    assert.equal(mocked.state.status, 200);
    assert.equal(body?.agent, "sancho");
    assert.equal(body?.agentId, "sancho");
    assert.equal(body?.missionControlRunId, run.id);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("a failed OpenClaw Stop delivery retries the tombstoned run once and keeps one visible message", async () => {
  process.env.MC_CHAT_GATEWAY = "http://openclaw-runtime.test";
  process.env.MC_CHAT_SECRET = "openclaw-secret";
  const threadId = "demo:openclaw-stop-transport-retry";
  const run = agentRuns.createAgentRun({
    threadId,
    runtime: "openclaw",
    agent: "sancho",
    input: { slug: "demo", threadId },
  });
  agentRuns.markAgentRunDispatched(run.id, threadId);

  const previousFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = (async () => {
    calls += 1;
    return calls === 1
      ? new Response(JSON.stringify({ error: "gateway unavailable" }), {
          status: 503,
          headers: { "Content-Type": "application/json" },
        })
      : new Response(JSON.stringify({ ok: true, cancelled: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
  }) as typeof fetch;

  const request = {
    method: "POST",
    headers: {},
    body: { slug: "demo", threadId, runId: run.id },
    query: {},
    ctx: { isAdmin: true, clientSlug: null, allowedSlugs: null },
  } as unknown as NextApiRequest;

  try {
    const first = response();
    await cancelHandler(request, first.res);
    assert.equal(first.state.status, 503);
    assert.equal(first.state.body?.retryable, true);
    assert.equal(first.state.body?.runtimeStopDelivered, false);
    assert.equal(
      (await agentRuns.getAgentRunByIdAsync(run.id))?.status,
      "cancelled",
    );

    const second = response();
    await cancelHandler(request, second.res);
    assert.equal(second.state.status, 200);
    assert.equal(second.state.body?.runtimeStopDelivered, true);
    assert.equal(second.state.body?.runtimeCancelled, true);
    assert.equal(calls, 2);

    // A lost HTTP response can replay the API call, but an already-delivered
    // Stop is terminal and must not be sent to the runtime again.
    const replay = response();
    await cancelHandler(request, replay.res);
    assert.equal(replay.state.status, 200);
    assert.equal(replay.state.body?.runtimeStopDelivered, true);
    assert.equal(replay.state.body?.runtimeCancelled, true);
    assert.equal(calls, 2);

    assert.equal(
      mcChat
        .getThread(threadId)
        .messages.filter(
          (message) => message.deliveryKey === `chat-stop:${run.id}`,
        ).length,
      1,
    );
    const deliveryEvents = (
      await agentRuns.listAgentRunEventsAsync(run.id)
    ).filter((event) =>
      ["cancel_failed", "cancel_dispatched"].includes(event.type),
    );
    assert.deepEqual(
      deliveryEvents.map((event) => event.type),
      ["cancel_failed", "cancel_dispatched"],
    );
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("a delivered cancelled:false Stop is terminal and is not retried", async () => {
  process.env.MC_CHAT_GATEWAY = "http://openclaw-runtime.test";
  process.env.MC_CHAT_SECRET = "openclaw-secret";
  const threadId = "demo:openclaw-stop-no-process";
  const run = agentRuns.createAgentRun({
    threadId,
    runtime: "openclaw",
    agent: "sancho",
    input: { slug: "demo", threadId },
  });
  agentRuns.markAgentRunDispatched(run.id, threadId);

  const previousFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = (async () => {
    calls += 1;
    return new Response(JSON.stringify({ ok: true, cancelled: false }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;
  const request = {
    method: "POST",
    headers: {},
    body: { slug: "demo", threadId, runId: run.id },
    query: {},
    ctx: { isAdmin: true, clientSlug: null, allowedSlugs: null },
  } as unknown as NextApiRequest;

  try {
    const first = response();
    await cancelHandler(request, first.res);
    assert.equal(first.state.status, 200);
    assert.equal(first.state.body?.runtimeStopDelivered, true);
    assert.equal(first.state.body?.runtimeCancelled, false);
    assert.equal(first.state.body?.runtimeAlreadyStopped, true);
    assert.equal(first.state.body?.retryable, undefined);

    const replay = response();
    await cancelHandler(request, replay.res);
    assert.equal(replay.state.status, 200);
    assert.equal(replay.state.body?.runtimeStopDelivered, true);
    assert.equal(replay.state.body?.runtimeCancelled, false);
    assert.equal(replay.state.body?.runtimeAlreadyStopped, true);
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("completed and failed runs remain closed to runtime Stop retries", async () => {
  const previousFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = (async () => {
    calls += 1;
    throw new Error("terminal runs must not reach the runtime");
  }) as typeof fetch;
  try {
    for (const terminalStatus of ["completed", "failed"] as const) {
      const threadId = `demo:openclaw-stop-${terminalStatus}`;
      const run = agentRuns.createAgentRun({
        threadId,
        runtime: "openclaw",
        agent: "sancho",
        input: { slug: "demo", threadId },
      });
      agentRuns.markAgentRunDispatched(run.id, threadId);
      if (terminalStatus === "completed") {
        agentRuns.markAgentRunCompleted(run.id, threadId, { text: "done" });
      } else {
        agentRuns.markAgentRunFailed(run.id, threadId, "failed");
      }
      const mocked = response();
      await cancelHandler(
        {
          method: "POST",
          headers: {},
          body: { slug: "demo", threadId, runId: run.id },
          query: {},
          ctx: { isAdmin: true, clientSlug: null, allowedSlugs: null },
        } as unknown as NextApiRequest,
        mocked.res,
      );
      assert.equal(mocked.state.status, 409);
    }
    assert.equal(calls, 0);
  } finally {
    globalThis.fetch = previousFetch;
  }
});
