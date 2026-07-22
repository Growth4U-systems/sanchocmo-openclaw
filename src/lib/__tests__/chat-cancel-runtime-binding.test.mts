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
  const calls: Array<{ url: string; headers: Record<string, string>; body: unknown }> = [];
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
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
    assert.equal(
      (calls[0].body as { missionControlRunId?: unknown })
        .missionControlRunId,
      run.id,
    );
  } finally {
    globalThis.fetch = previousFetch;
  }
});
