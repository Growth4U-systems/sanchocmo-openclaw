import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  createOpenClawCallbackDelivery,
  isTerminalCallbackDeliveryError,
} from "../callback-delivery.js";

function temporaryDirectory(t) {
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), "mc-chat-callback-delivery-"),
  );
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return directory;
}

async function waitUntil(predicate, message) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  assert.fail(message);
}

function callbackInput(overrides = {}) {
  return {
    deliveryId: "run-terminal-1",
    url: "http://127.0.0.1:3000/api/chat/webhook",
    headers: {
      "Content-Type": "application/json",
      "X-Sancho-Terminal-Callback-Grant": "grant.payload",
      "X-Arbitrary-Callback-Header": "preserved",
    },
    payload: {
      missionControlRunId: "run-terminal-1",
      role: "bot",
      text: "done",
    },
    ...overrides,
  };
}

test("persists before delivery and waits for the callback 2xx", async (t) => {
  const directory = temporaryDirectory(t);
  let finishRequest;
  const calls = [];
  const delivery = createOpenClawCallbackDelivery({
    directory,
    jitterRatio: 0,
    fetchImpl: async (_url, init) => {
      calls.push(init);
      return new Promise((resolve) => {
        finishRequest = resolve;
      });
    },
  });
  t.after(() => delivery.stop());
  delivery.start();

  const queued = delivery.enqueueTerminal(callbackInput());
  assert.equal(fs.existsSync(queued.file), true);

  let acknowledged = false;
  void queued.delivery.then(() => {
    acknowledged = true;
  });
  await waitUntil(() => calls.length === 1, "callback attempt did not start");
  assert.equal(acknowledged, false);
  assert.equal(
    calls[0].headers["X-Sancho-Terminal-Callback-Grant"],
    "grant.payload",
  );
  assert.equal(calls[0].headers["X-Arbitrary-Callback-Header"], "preserved");

  finishRequest(new Response(null, { status: 204 }));
  const receipt = await queued.delivery;
  assert.equal(receipt.callbackId, queued.callbackId);
  assert.equal(receipt.status, 204);
  assert.equal(delivery.pendingCount(), 0);
});

test("replays a Retry-After delayed terminal callback after restart", async (t) => {
  const directory = temporaryDirectory(t);
  let clock = 1_000;
  const firstEvents = [];
  const first = createOpenClawCallbackDelivery({
    directory,
    now: () => clock,
    jitterRatio: 0,
    retryBaseMs: 5,
    retryMaxMs: 5,
    logger: (event) => firstEvents.push(event),
    fetchImpl: async () =>
      new Response(null, {
        status: 503,
        headers: { "Retry-After": "60" },
      }),
  });
  first.start();
  const queued = first.enqueueTerminal(callbackInput());
  const stopped = assert.rejects(
    queued.delivery,
    (error) =>
      isTerminalCallbackDeliveryError(error) &&
      error.code === "terminal_callback_stopped",
  );
  await waitUntil(
    () => firstEvents.some((event) => event.event === "retry_scheduled"),
    "first process did not persist retry state",
  );
  const retryEvent = firstEvents.find(
    (event) => event.event === "retry_scheduled",
  );
  assert.equal(retryEvent.delayMs, 60_000);
  assert.equal(first.pendingCount(), 1);
  first.stop();
  await stopped;

  clock = 61_001;
  const replayed = [];
  const second = createOpenClawCallbackDelivery({
    directory,
    now: () => clock,
    jitterRatio: 0,
    fetchImpl: async (url, init) => {
      replayed.push({ url, init });
      return new Response(null, { status: 200 });
    },
  });
  t.after(() => second.stop());
  second.start();
  await waitUntil(
    () => second.pendingCount() === 0,
    "restarted outbox did not replay the callback",
  );
  assert.equal(replayed.length, 1);
  assert.equal(
    JSON.parse(replayed[0].init.body).missionControlRunId,
    "run-terminal-1",
  );
});

test("shutdown releases an in-flight waiter and preserves its record for replay", async (t) => {
  const directory = temporaryDirectory(t);
  let finishRequest;
  const firstEvents = [];
  const first = createOpenClawCallbackDelivery({
    directory,
    jitterRatio: 0,
    retryBaseMs: 5,
    retryMaxMs: 5,
    logger: (event) => firstEvents.push(event),
    fetchImpl: async () =>
      new Promise((resolve) => {
        finishRequest = resolve;
      }),
  });
  first.start();

  const queued = first.enqueueTerminal(callbackInput());
  await waitUntil(
    () => typeof finishRequest === "function",
    "callback attempt did not enter the in-flight state",
  );
  first.stop();
  await assert.rejects(
    queued.delivery,
    (error) =>
      isTerminalCallbackDeliveryError(error) &&
      error.code === "terminal_callback_stopped",
  );
  assert.equal(fs.existsSync(queued.file), true);

  finishRequest(new Response(null, { status: 503 }));
  await waitUntil(
    () => firstEvents.some((event) => event.event === "retry_scheduled"),
    "stopped in-flight attempt did not leave replayable retry state",
  );
  assert.equal(fs.existsSync(queued.file), true);

  const replayed = [];
  const second = createOpenClawCallbackDelivery({
    directory,
    jitterRatio: 0,
    fetchImpl: async (_url, init) => {
      replayed.push(init);
      return new Response(null, { status: 200 });
    },
  });
  t.after(() => second.stop());
  second.start();
  await waitUntil(
    () => second.pendingCount() === 0,
    "preserved callback was not replayed after restart",
  );
  assert.equal(replayed.length, 1);
});

test("an unreadable outbox record rejects its waiter instead of hanging", async (t) => {
  const directory = temporaryDirectory(t);
  let networkCalls = 0;
  const delivery = createOpenClawCallbackDelivery({
    directory,
    fetchImpl: async () => {
      networkCalls += 1;
      return new Response(null, { status: 200 });
    },
  });
  t.after(() => delivery.stop());

  const queued = delivery.enqueueTerminal(callbackInput());
  fs.writeFileSync(queued.file, "not-json", "utf8");
  delivery.start();

  await assert.rejects(
    queued.delivery,
    (error) =>
      isTerminalCallbackDeliveryError(error) &&
      error.code === "terminal_callback_record_invalid",
  );
  assert.equal(networkCalls, 0);
  assert.equal(delivery.pendingCount(), 0);
  assert.equal(fs.existsSync(queued.file), false);
});

test("duplicate delivery ids share one durable record and acknowledgement", async (t) => {
  const directory = temporaryDirectory(t);
  let finishRequest;
  const calls = [];
  const delivery = createOpenClawCallbackDelivery({
    directory,
    jitterRatio: 0,
    fetchImpl: async (_url, init) => {
      calls.push(init);
      return new Promise((resolve) => {
        finishRequest = resolve;
      });
    },
  });
  t.after(() => delivery.stop());
  delivery.start();

  const first = delivery.enqueueTerminal(callbackInput());
  const duplicate = delivery.enqueueTerminal(
    callbackInput({ payload: { role: "bot", text: "must not replace first" } }),
  );
  assert.equal(first.existing, false);
  assert.equal(duplicate.existing, true);
  assert.equal(first.callbackId, duplicate.callbackId);
  assert.equal(delivery.pendingCount(), 1);

  await waitUntil(() => calls.length === 1, "callback attempt did not start");
  assert.equal(JSON.parse(calls[0].body).text, "done");
  finishRequest(new Response(null, { status: 200 }));
  const [firstReceipt, duplicateReceipt] = await Promise.all([
    first.delivery,
    duplicate.delivery,
  ]);
  assert.deepEqual(firstReceipt, duplicateReceipt);
  assert.equal(calls.length, 1);
});

test("rejects an awaiting caller when the durable record expires", async (t) => {
  const directory = temporaryDirectory(t);
  let clock = 1_000;
  let calls = 0;
  const delivery = createOpenClawCallbackDelivery({
    directory,
    now: () => clock,
    maxAgeMs: 10,
    retryBaseMs: 5,
    retryMaxMs: 5,
    jitterRatio: 0,
    logger(event) {
      if (event.event === "retry_scheduled") clock = 1_011;
    },
    fetchImpl: async () => {
      calls += 1;
      return new Response(null, { status: 503 });
    },
  });
  t.after(() => delivery.stop());
  delivery.start();

  const queued = delivery.enqueueTerminal(callbackInput());
  let timeout;
  try {
    await assert.rejects(
      Promise.race([
        queued.delivery,
        new Promise((_, reject) => {
          timeout = setTimeout(
            () => reject(new Error("expiration event was not observed")),
            500,
          );
        }),
      ]),
      (error) =>
        isTerminalCallbackDeliveryError(error) &&
        error.code === "terminal_callback_expired",
    );
  } finally {
    clearTimeout(timeout);
  }
  assert.equal(calls, 1);
  assert.equal(delivery.pendingCount(), 0);
});

test("fails closed before network delivery when persistence is unavailable", (t) => {
  const parent = temporaryDirectory(t);
  const invalidDirectory = path.join(parent, "not-a-directory");
  fs.writeFileSync(invalidDirectory, "occupied", "utf8");
  let networkCalls = 0;
  const delivery = createOpenClawCallbackDelivery({
    directory: invalidDirectory,
    fetchImpl: async () => {
      networkCalls += 1;
      return new Response(null, { status: 200 });
    },
  });

  assert.throws(
    () => delivery.enqueueTerminal(callbackInput()),
    (error) =>
      isTerminalCallbackDeliveryError(error) &&
      error.code === "terminal_callback_persist_failed",
  );
  assert.equal(networkCalls, 0);
});
