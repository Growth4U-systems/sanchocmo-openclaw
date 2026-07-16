import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import {
  claimDurableTurn,
  durableTurnWorkerEnabled,
  postDurableTurnAction,
  safeDurableTurnClaim,
  startDurableTurnHeartbeat,
  startDurableTurnWorker,
} from "../durable-turn-worker.js";

const leaseToken = "l".repeat(48);
const parentAgentRunId = "parent-1";
const dispatchRunId = "dispatch-1";
const runtimeToolCapability = createHash("sha256")
  .update(
    [
      "sancho-runtime-tool-dispatch-lease-v1",
      parentAgentRunId,
      dispatchRunId,
      leaseToken,
    ].join("\0"),
  )
  .digest("hex");
const claim = {
  dispatchRunId,
  parentAgentRunId,
  leaseToken,
  leaseExpiresAt: "2026-07-16T12:01:00.000Z",
  recovered: false,
  runtimeToolCapability,
  envelope: {
    slug: "hospital-capilar",
    threadId: "hospital-capilar:general",
    missionControlRunId: parentAgentRunId,
    runtimeToolCapability,
    text: "Busca leads",
    userId: "mc-admin",
    userName: "Martin",
    agent: "sancho",
    agentId: "sancho",
  },
};
const channelConfig = {
  mcServerUrl: "https://staging.sanchocmo.ai",
  sharedSecret: "runtime-secret",
};

test("claim validates the server envelope and never sends a lease token in the body", async () => {
  const calls = [];
  const result = await claimDurableTurn(channelConfig, {
    env: { CHAT_AGENT_TURN_WORKER_ID: "openclaw-test-1" },
    fetchImpl: async (url, init) => {
      calls.push({ url, init, body: JSON.parse(init.body) });
      return new Response(JSON.stringify({ ok: true, claim }), { status: 200 });
    },
  });
  assert.deepEqual(result, claim);
  assert.equal(
    calls[0].url,
    "https://staging.sanchocmo.ai/api/runtime/chat-agent-turn-dispatch",
  );
  assert.deepEqual(calls[0].body, {
    action: "claim",
    workerId: "openclaw-test-1",
  });
  assert.doesNotMatch(calls[0].init.body, new RegExp(leaseToken));
  assert.equal(calls[0].init.redirect, "error");

  assert.equal(
    safeDurableTurnClaim({ ...claim, runtimeToolCapability: "f".repeat(64) }),
    null,
  );
});

test("control actions carry the exact lease tuple in headers, never in the body", async () => {
  const calls = [];
  const result = await postDurableTurnAction("started", claim, channelConfig, {
    fetchImpl: async (_url, init) => {
      calls.push(init);
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    },
  });
  assert.equal(result.ok, true);
  assert.equal(
    calls[0].headers["X-Mission-Control-Run-Id"],
    parentAgentRunId,
  );
  assert.equal(
    calls[0].headers["X-Sancho-Dispatch-Run-Id"],
    dispatchRunId,
  );
  assert.equal(
    calls[0].headers["X-Sancho-Dispatch-Lease-Token"],
    leaseToken,
  );
  assert.deepEqual(JSON.parse(calls[0].body), { action: "started" });
  assert.doesNotMatch(calls[0].body, new RegExp(leaseToken));
});

test("heartbeat stops and aborts the local turn when the fenced claim is lost", async () => {
  let tick;
  let cleared = 0;
  let lost = 0;
  const stop = startDurableTurnHeartbeat(claim, channelConfig, {
    setIntervalImpl: (handler) => {
      tick = handler;
      return { unref() {} };
    },
    clearIntervalImpl: () => {
      cleared += 1;
    },
    onClaimLost: () => {
      lost += 1;
    },
    fetchImpl: async () =>
      new Response(JSON.stringify({ error: "chat_agent_turn_claim_lost" }), {
        status: 409,
      }),
  });
  await tick();
  assert.equal(lost, 1);
  assert.equal(cleared, 1);
  stop();
  assert.equal(cleared, 1);
});

test("heartbeat aborts cooperatively when the Ledger requests cancellation", async () => {
  let tick;
  let cleared = 0;
  let cancelled = 0;
  const stop = startDurableTurnHeartbeat(claim, channelConfig, {
    setIntervalImpl: (handler) => {
      tick = handler;
      return { unref() {} };
    },
    clearIntervalImpl: () => {
      cleared += 1;
    },
    onCancellationRequested: () => {
      cancelled += 1;
    },
    fetchImpl: async () =>
      new Response(
        JSON.stringify({ ok: true, cancellationRequested: true }),
        { status: 200 },
      ),
  });
  await tick();
  assert.equal(cancelled, 1);
  assert.equal(cleared, 1);
  stop();
  assert.equal(cleared, 1);
});

test("worker is opt-in and requeues busy work without claiming a hidden local backlog", async () => {
  assert.equal(durableTurnWorkerEnabled({}), false);
  let disabledCalls = 0;
  await startDurableTurnWorker({
    env: {},
    loadConfig: () => ({ channels: { "mc-chat": channelConfig } }),
    maxConcurrency: 1,
    fetchImpl: async () => {
      disabledCalls += 1;
    },
    executeClaim: async () => ({ ok: true, status: 200 }),
  })();
  assert.equal(disabledCalls, 0);

  const events = [];
  const scheduled = [];
  let claimCalls = 0;
  const stop = startDurableTurnWorker({
    env: {
      CHAT_AGENT_TURN_DURABLE_WORKER_ENABLED: "1",
      CHAT_AGENT_TURN_WORKER_ID: "openclaw-test-1",
    },
    loadConfig: () => ({ channels: { "mc-chat": channelConfig } }),
    maxConcurrency: 1,
    setTimeoutImpl: (handler) => {
      scheduled.push(handler);
      return { unref() {} };
    },
    clearTimeoutImpl() {},
    fetchImpl: async (_url, init) => {
      const body = JSON.parse(init.body);
      if (body.action === "claim") {
        claimCalls += 1;
        events.push("claim");
        return new Response(
          JSON.stringify({ ok: true, claim: claimCalls === 1 ? claim : null }),
          { status: 200 },
        );
      }
      events.push(`control:${body.action}:${body.reason}`);
      return new Response(JSON.stringify({ ok: true }), { status: 202 });
    },
    executeClaim: async () => {
      events.push("execute");
      return {
        ok: false,
        status: 409,
        code: "runtime_session_busy",
        dispatchInvoked: false,
      };
    },
  });
  for (let i = 0; i < 8 && !events.some((item) => item.startsWith("control:")); i += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
  assert.deepEqual(events.slice(0, 3), [
    "claim",
    "execute",
    "control:requeue:runtime_session_busy",
  ]);
  assert.ok(scheduled.length >= 1);
  await stop();
});
