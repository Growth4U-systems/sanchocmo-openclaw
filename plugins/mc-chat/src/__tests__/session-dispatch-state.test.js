import { test } from "node:test";
import assert from "node:assert/strict";
import {
  enqueueSessionDispatch,
  hasActiveSessionDispatch,
  isStopCommand,
  resetSessionDispatchStateForTest,
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
