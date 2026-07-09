import { test } from "node:test";
import assert from "node:assert/strict";
import {
  enqueueSessionDispatch,
  hasActiveSessionDispatch,
  isStopCommand,
  resetSessionDispatchStateForTest,
  semanticSessionFamilyKey,
} from "../session-dispatch-state.js";

function deferred() {
  let resolve;
  const promise = new Promise((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

test("isStopCommand only matches the gateway cancel command", () => {
  assert.equal(isStopCommand("/stop"), true);
  assert.equal(isStopCommand("  /STOP  "), true);
  assert.equal(isStopCommand("stop"), false);
  assert.equal(isStopCommand("please /stop this"), false);
});

test("enqueueSessionDispatch serializes work for the same session key", async () => {
  resetSessionDispatchStateForTest();
  const gate = deferred();
  const events = [];

  const first = enqueueSessionDispatch("agent:hamete:thread:x", async (info) => {
    events.push(`first:${info.queued}`);
    await gate.promise;
    events.push("first:done");
    return "first";
  });
  const second = enqueueSessionDispatch("agent:hamete:thread:x", async (info) => {
    events.push(`second:${info.queued}`);
    events.push("second:done");
    return "second";
  });

  await Promise.resolve();
  assert.equal(first.queued, false);
  assert.equal(second.queued, true);
  assert.equal(hasActiveSessionDispatch("agent:hamete:thread:x"), true);
  assert.deepEqual(events, ["first:false"]);

  gate.resolve();
  assert.equal(await first.promise, "first");
  assert.equal(await second.promise, "second");
  assert.deepEqual(events, ["first:false", "first:done", "second:true", "second:done"]);
  assert.equal(hasActiveSessionDispatch("agent:hamete:thread:x"), false);
});

test("enqueueSessionDispatch keeps different session keys independent", async () => {
  resetSessionDispatchStateForTest();
  const gate = deferred();
  const events = [];

  const slow = enqueueSessionDispatch("session:slow", async () => {
    events.push("slow:start");
    await gate.promise;
    events.push("slow:done");
  });
  const fast = enqueueSessionDispatch("session:fast", async () => {
    events.push("fast:start");
    events.push("fast:done");
  });

  await fast.promise;
  assert.deepEqual(events, ["slow:start", "fast:start", "fast:done"]);
  gate.resolve();
  await slow.promise;
  assert.deepEqual(events, ["slow:start", "fast:start", "fast:done", "slow:done"]);
});

test("semanticSessionFamilyKey groups generated discovery-new threads", () => {
  const prefix = "agent:rocinante:model:fireworks_accounts_fireworks_models_glm-5p2:channel:mc-chat:growth4u:";
  assert.equal(
    semanticSessionFamilyKey(`${prefix}discovery-new-1782805329481`),
    `${prefix}discovery-new`,
  );
  assert.equal(
    semanticSessionFamilyKey(`${prefix}discovery-new-verify328a`),
    `${prefix}discovery-new`,
  );
  assert.equal(
    semanticSessionFamilyKey(`${prefix}company-brief`),
    `${prefix}company-brief`,
  );
});

test("enqueueSessionDispatch can serialize related session keys by family key", async () => {
  resetSessionDispatchStateForTest();
  const prefix = "agent:rocinante:model:fireworks_accounts_fireworks_models_glm-5p2:channel:mc-chat:growth4u:";
  const firstKey = `${prefix}discovery-new-1782805329481`;
  const secondKey = `${prefix}discovery-new-verify328a`;
  const familyKey = semanticSessionFamilyKey(firstKey);
  const gate = deferred();
  const events = [];

  const first = enqueueSessionDispatch(
    firstKey,
    async (info) => {
      events.push(`first:${info.queued}:${info.dispatchKey === familyKey}`);
      await gate.promise;
      events.push("first:done");
    },
    { familyKey },
  );
  const second = enqueueSessionDispatch(
    secondKey,
    async (info) => {
      events.push(`second:${info.queued}:${info.sessionKey === secondKey}`);
      events.push("second:done");
    },
    { familyKey: semanticSessionFamilyKey(secondKey) },
  );

  await Promise.resolve();
  assert.equal(first.queued, false);
  assert.equal(second.queued, true);
  assert.equal(hasActiveSessionDispatch(secondKey, { familyKey }), true);
  assert.deepEqual(events, ["first:false:true"]);

  gate.resolve();
  await first.promise;
  await second.promise;
  assert.deepEqual(events, ["first:false:true", "first:done", "second:true:true", "second:done"]);
});
