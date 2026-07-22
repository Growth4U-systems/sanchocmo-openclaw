import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  createLocalConnectorFailureOutbox,
  dispatchJob,
  localBridgeSpawnOptions,
  postFailureWebhook,
  retryPendingJobHandoffs,
} from "../../scripts/sancho-local-connector.mjs";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

async function waitUntil(predicate, message) {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  assert.fail(message);
}

function temporaryOutbox(t) {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), "sancho-local-connector-outbox-"),
  );
  const directory = path.join(root, "local-connector");
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return directory;
}

test("local bridge callback outbox is anchored to connector state", () => {
  const options = localBridgeSpawnOptions(
    { CODEX_BRIDGE_SECRET: "runtime-secret" },
    {
      PATH: "/usr/bin",
      SANCHO_CONNECTOR_TOKEN: "must-not-reach-child",
    },
    "/srv/sancho-connector/state",
  );

  assert.equal(options.cwd, "/srv/sancho-connector/state");
  assert.equal(
    options.env.SANCHO_CALLBACK_OUTBOX_DIR,
    "/srv/sancho-connector/state/callback-outbox",
  );
  assert.equal(options.env.SANCHO_CONNECTOR_TOKEN, undefined);
  assert.equal(options.env.CODEX_BRIDGE_SECRET, "runtime-secret");
});

test("relative local connector outbox paths never depend on process.cwd()", () => {
  const originalCwd = process.cwd();
  const alternateCwd = fs.mkdtempSync(
    path.join(os.tmpdir(), "sancho-local-connector-cwd-"),
  );
  const buildOptions = () => localBridgeSpawnOptions(
    { SANCHO_CALLBACK_OUTBOX_DIR: "durable-callbacks" },
    { PATH: "/usr/bin" },
    "connector-state",
  );

  try {
    const before = buildOptions();
    process.chdir(alternateCwd);
    const after = buildOptions();

    const expectedStateDir = path.join(repositoryRoot, "connector-state");
    const expectedOutboxDir = path.join(expectedStateDir, "durable-callbacks");
    assert.equal(before.cwd, expectedStateDir);
    assert.equal(after.cwd, expectedStateDir);
    assert.equal(before.env.SANCHO_CALLBACK_OUTBOX_DIR, expectedOutboxDir);
    assert.equal(after.env.SANCHO_CALLBACK_OUTBOX_DIR, expectedOutboxDir);
  } finally {
    process.chdir(originalCwd);
    fs.rmSync(alternateCwd, { recursive: true, force: true });
  }
});

test("a durably queued bridge failure is acknowledged as terminal handoff, not failed", async () => {
  const completions = [];
  let persisted = 0;
  let finishAttempts = 0;
  const job = {
    id: "job_terminal_handoff",
    provider: "codex",
    message: {
      slug: "acme",
      threadId: "acme:general",
      missionControlRunId: "run_terminal_handoff",
      runtimeToolCapability: "d".repeat(64),
    },
  };

  const result = await dispatchJob(job, {
    inboundUrl: "http://127.0.0.1:1/sancho/inbound",
    runtimeSecret: "runtime-secret",
    fetchImpl: async () => new Response("bridge unavailable", { status: 503 }),
    persistFailure: async (message, provider, _error, options) => {
      persisted += 1;
      assert.equal(message, job.message);
      assert.equal(provider, "codex");
      assert.equal(options.deliveryId, "run_terminal_handoff");
      return true;
    },
    finishJob: async (completion) => {
      finishAttempts += 1;
      completions.push(completion);
      if (finishAttempts === 1) throw new Error("finish response lost");
      return { ok: true };
    },
  });

  assert.deepEqual(result, {
    accepted: false,
    terminalHandoffPersisted: true,
    serverAcknowledged: false,
  });
  assert.equal(persisted, 1);
  const retried = await retryPendingJobHandoffs({
    finishJob: async (completion) => {
      finishAttempts += 1;
      completions.push(completion);
      return { ok: true };
    },
  });
  assert.deepEqual(retried, { attempted: 1, acknowledged: 1, pending: 0 });
  assert.equal(persisted, 1, "finish retry must not recreate the callback");
  assert.equal(finishAttempts, 2);
  assert.deepEqual(completions, [
    { jobId: "job_terminal_handoff", status: "dispatched" },
    { jobId: "job_terminal_handoff", status: "dispatched" },
  ]);
});

test("an unpersisted bridge failure remains claimed for safe recovery", async () => {
  let completions = 0;
  const result = await dispatchJob(
    {
      id: "job_unpersisted_failure",
      provider: "claude-code",
      message: {
        slug: "acme",
        threadId: "acme:general",
        missionControlRunId: "run_unpersisted_failure",
      },
    },
    {
      inboundUrl: "http://127.0.0.1:1/sancho/inbound",
      runtimeSecret: "runtime-secret",
      fetchImpl: async () => new Response("bridge unavailable", { status: 503 }),
      persistFailure: async () => false,
      finishJob: async () => {
        completions += 1;
      },
    },
  );

  assert.deepEqual(result, {
    accepted: false,
    terminalHandoffPersisted: false,
    serverAcknowledged: false,
  });
  assert.equal(completions, 0);
});

test("a lost finish acknowledgement after bridge acceptance never redispatches or invents failure", async () => {
  let bridgeDispatches = 0;
  let failureCallbacks = 0;
  let finishAttempts = 0;
  const job = {
    id: "job_accepted_finish_lost",
    provider: "codex",
    message: {
      slug: "acme",
      threadId: "acme:general",
      missionControlRunId: "run_accepted_finish_lost",
    },
  };
  const result = await dispatchJob(job, {
    inboundUrl: "http://127.0.0.1:1/sancho/inbound",
    runtimeSecret: "runtime-secret",
    fetchImpl: async () => {
      bridgeDispatches += 1;
      return new Response("", { status: 202 });
    },
    persistFailure: async () => {
      failureCallbacks += 1;
      return true;
    },
    finishJob: async () => {
      finishAttempts += 1;
      throw new Error("finish response lost");
    },
  });

  assert.deepEqual(result, {
    accepted: true,
    terminalHandoffPersisted: true,
    serverAcknowledged: false,
  });
  assert.equal(bridgeDispatches, 1);
  assert.equal(failureCallbacks, 0);
  assert.equal(finishAttempts, 1);

  const retried = await retryPendingJobHandoffs({
    finishJob: async (completion) => {
      finishAttempts += 1;
      assert.deepEqual(completion, {
        jobId: "job_accepted_finish_lost",
        status: "dispatched",
      });
      return { ok: true };
    },
  });
  assert.deepEqual(retried, { attempted: 1, acknowledged: 1, pending: 0 });
  assert.equal(bridgeDispatches, 1, "ACK retry must not call the bridge again");
  assert.equal(failureCallbacks, 0);
  assert.equal(finishAttempts, 2);
});

test("local connector failure callback is persisted and retried with exact run authority", async (t) => {
  const calls = [];
  const runtimeToolCapability = "b".repeat(64);
  const terminalGrant = `connector_grant.${"g".repeat(43)}`;
  const outbox = createLocalConnectorFailureOutbox({
    directory: temporaryOutbox(t),
    retryBaseMs: 5,
    retryMaxMs: 5,
    jitterRatio: 0,
    fetchImpl: async (url, init) => {
      calls.push({ url, init });
      return new Response("", { status: calls.length === 1 ? 503 : 200 });
    },
  });
  t.after(() => outbox.stop());
  const ok = await postFailureWebhook(
    {
      slug: "acme",
      threadId: "acme:general",
      missionControlRunId: "run_local_failure_1",
      runtimeToolCapability,
      runtimeTerminalCallbackGrant: terminalGrant,
      runtimeTerminalCallbackGrantExpiresAt: "2099-01-01T00:00:00.000Z",
      agent: "sancho",
    },
    "codex",
    new Error(`dispatch failed ${runtimeToolCapability}`),
    {
      baseUrl: "https://sancho.example.com/",
      runtimeSecret: "transport-secret",
      outbox,
    },
  );

  assert.equal(ok, true);
  assert.equal(calls.length, 0, "network delivery must start after the durable write");
  assert.equal(outbox.pendingCount(), 1);
  await waitUntil(
    () => calls.length === 2 && outbox.pendingCount() === 0,
    "durable failure callback was not retried to acknowledgement",
  );
  assert.equal(calls[1].url, "https://sancho.example.com/api/chat/webhook");
  assert.equal(calls[1].init.headers["X-MC-Secret"], "transport-secret");
  assert.equal(
    calls[1].init.headers["X-Mission-Control-Run-Id"],
    "run_local_failure_1",
  );
  assert.equal(
    calls[1].init.headers["X-Sancho-Run-Capability"],
    runtimeToolCapability,
  );
  assert.equal(
    calls[1].init.headers["X-Sancho-Terminal-Callback-Grant"],
    terminalGrant,
  );
  const body = JSON.parse(calls[1].init.body);
  assert.equal(body.missionControlRunId, "run_local_failure_1");
  assert.equal(body.slug, "acme");
  assert.equal(body.threadId, "acme:general");
  assert.match(body.errorDetail.raw, /\[redacted\]/);
  assert.doesNotMatch(JSON.stringify(body), new RegExp(runtimeToolCapability));
});

test("local connector replays a persisted dispatch failure after restart", async (t) => {
  const directory = temporaryOutbox(t);
  let clock = 1_000;
  const firstCalls = [];
  const firstEvents = [];
  const first = createLocalConnectorFailureOutbox({
    directory,
    retryBaseMs: 60_000,
    retryMaxMs: 60_000,
    jitterRatio: 0,
    now: () => clock,
    logger: (event) => firstEvents.push(event),
    fetchImpl: async (_url, init) => {
      firstCalls.push(init);
      return new Response("", { status: 503 });
    },
  });
  const persisted = await postFailureWebhook(
    {
      slug: "acme",
      threadId: "acme:general",
      missionControlRunId: "run_local_failure_replay",
      runtimeToolCapability: "c".repeat(64),
      runtimeTerminalCallbackGrant: `replay_grant.${"r".repeat(43)}`,
      runtimeTerminalCallbackGrantExpiresAt: "2099-01-01T00:00:00.000Z",
    },
    "codex",
    new Error("bridge unavailable"),
    {
      baseUrl: "https://sancho.example.com",
      runtimeSecret: "transport-secret",
      outbox: first,
    },
  );
  assert.equal(persisted, true);
  await waitUntil(
    () => firstEvents.some((event) => event.event === "retry_scheduled"),
    "initial failure was not persisted for retry",
  );
  assert.equal(firstCalls.length, 1);
  first.stop();
  assert.equal(first.pendingCount(), 1);

  clock = 61_001;
  const replayed = [];
  const second = createLocalConnectorFailureOutbox({
    directory,
    jitterRatio: 0,
    now: () => clock,
    fetchImpl: async (_url, init) => {
      replayed.push(init);
      return new Response(null, { status: 204 });
    },
  });
  t.after(() => second.stop());
  second.start();
  await waitUntil(
    () => replayed.length === 1 && second.pendingCount() === 0,
    "persisted connector failure was not replayed",
  );
  assert.equal(
    JSON.parse(replayed[0].body).missionControlRunId,
    "run_local_failure_replay",
  );
});

test("local connector failure callback fails closed for malformed terminal authority", async (t) => {
  let networkCalls = 0;
  const outbox = createLocalConnectorFailureOutbox({
    directory: temporaryOutbox(t),
    retryBaseMs: 60_000,
    retryMaxMs: 60_000,
    jitterRatio: 0,
    fetchImpl: async () => {
      networkCalls += 1;
      return new Response("", { status: 403 });
    },
  });
  t.after(() => outbox.stop());
  const persisted = await postFailureWebhook(
    {
      slug: "acme",
      threadId: "acme:general",
      missionControlRunId: "run_local_failure_2",
      runtimeToolCapability: "not-a-capability",
      runtimeTerminalCallbackGrant: "not-a-grant",
      runtimeTerminalCallbackGrantExpiresAt: "2099-01-01T00:00:00.000Z",
    },
    "claude-code",
    new Error("dispatch failed"),
    {
      baseUrl: "https://sancho.example.com",
      runtimeSecret: "transport-secret",
      outbox,
    },
  );

  assert.equal(persisted, false);
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(networkCalls, 0);
  assert.equal(outbox.pendingCount(), 0);
});
