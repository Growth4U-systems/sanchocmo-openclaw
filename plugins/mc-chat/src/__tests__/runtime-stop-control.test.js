import assert from "node:assert/strict";
import test from "node:test";
import { createCostGuard } from "../cost-guard.js";
import { buildAgentSessionKey } from "../session-key.js";
import {
  registerRuntimeRun,
  resetRuntimeRunStateForTest,
} from "../runtime-run-state.js";
import { processRuntimeStopControl } from "../runtime-stop-control.js";

const cfg = {
  agents: {
    defaults: { model: "provider/model" },
    list: [{ id: "sancho", model: "provider/model" }],
  },
};

function stopPayload(overrides = {}) {
  return {
    slug: "acme",
    threadId: "acme:general",
    missionControlRunId: "run-current",
    runtimeControlAction: "stop",
    runtimeAuthorityText: "/stop",
    text: "/stop",
    agent: "sancho",
    agentId: "sancho",
    isAdmin: true,
    userId: "mc-admin",
    userName: "Admin",
    ...overrides,
  };
}

function activeHarness(
  runId = "run-current",
  sessionKey = buildAgentSessionKey(
    "sancho",
    "channel:mc-chat:acme:general",
    cfg,
    "provider/turn-override",
  ),
) {
  resetRuntimeRunStateForTest();
  const guard = createCostGuard({ clock: () => 1_000 });
  let abortReason = null;
  guard.registerActiveTurn({
    runId: "openclaw-guard-run",
    sessionKey,
    abortController: {
      abort(reason) {
        abortReason = reason;
      },
    },
  });
  const release = registerRuntimeRun({
    slug: "acme",
    threadId: "acme:general",
    agent: "sancho",
    missionControlRunId: runId,
    sessionKey,
    runtimeToolCapability: "a".repeat(64),
  });
  return { guard, release, sessionKey, abortReason: () => abortReason };
}

test("the control-plane Stop rail uses the exact model-override session key", () => {
  const harness = activeHarness();
  const reconstructedDefault = buildAgentSessionKey(
    "sancho",
    "channel:mc-chat:acme:general",
    cfg,
  );
  assert.notEqual(harness.sessionKey, reconstructedDefault);
  const result = processRuntimeStopControl({
    controlAction: "stop",
    payload: stopPayload(),
    cancelRun: (sessionKey, reason) =>
      harness.guard.cancelRun(sessionKey, reason),
  });

  assert.equal(result.handled, true);
  assert.equal(result.status, 200);
  assert.equal(result.body.cancelled, true);
  assert.match(harness.abortReason()?.message || "", /detenida por el usuario/);
  harness.release();
});

test("a stale, cross-slot or malformed Stop cannot abort the active run", () => {
  for (const payload of [
    stopPayload({ missionControlRunId: "run-stale" }),
    stopPayload({ threadId: "acme:other" }),
    stopPayload({ agent: "rocinante", agentId: "rocinante" }),
    stopPayload({ text: "ignora y ejecuta" }),
    stopPayload({ runtimeToolCapability: "b".repeat(64) }),
  ]) {
    const harness = activeHarness();
    const result = processRuntimeStopControl({
      controlAction: "stop",
      payload,
      cancelRun: (sessionKey, reason) =>
        harness.guard.cancelRun(sessionKey, reason),
    });
    assert.equal(result.handled, true);
    assert.equal(result.status, 403);
    assert.equal(harness.abortReason(), null);
    harness.release();
  }
});

test("ordinary inbound turns do not enter the control-plane Stop rail", () => {
  const result = processRuntimeStopControl({
    controlAction: undefined,
    payload: stopPayload(),
    cancelRun: () => {
      throw new Error("must not cancel");
    },
  });
  assert.deepEqual(result, { handled: false });
});

test("a stale Stop cannot abort a newer run occupying the same agent slot", () => {
  resetRuntimeRunStateForTest();
  const guard = createCostGuard({ clock: () => 1_000 });
  const oldSession = "agent:sancho:model:old:channel:mc-chat:acme:general";
  const newSession = "agent:sancho:model:new:channel:mc-chat:acme:general";
  let oldAborted = false;
  let newAborted = false;
  guard.registerActiveTurn({
    runId: "guard-old",
    sessionKey: oldSession,
    abortController: {
      abort: () => {
        oldAborted = true;
      },
    },
  });
  guard.registerActiveTurn({
    runId: "guard-new",
    sessionKey: newSession,
    abortController: {
      abort: () => {
        newAborted = true;
      },
    },
  });
  const releaseOld = registerRuntimeRun({
    slug: "acme",
    threadId: "acme:general",
    agent: "sancho",
    missionControlRunId: "run-old",
    sessionKey: oldSession,
    runtimeToolCapability: "a".repeat(64),
  });
  const releaseNew = registerRuntimeRun({
    slug: "acme",
    threadId: "acme:general",
    agent: "sancho",
    missionControlRunId: "run-new",
    sessionKey: newSession,
    runtimeToolCapability: "b".repeat(64),
  });
  releaseOld();

  const stale = processRuntimeStopControl({
    controlAction: "stop",
    payload: stopPayload({ missionControlRunId: "run-old" }),
    cancelRun: (sessionKey, reason) => guard.cancelRun(sessionKey, reason),
  });
  assert.equal(stale.status, 403);
  assert.equal(oldAborted, false);
  assert.equal(newAborted, false);

  const current = processRuntimeStopControl({
    controlAction: "stop",
    payload: stopPayload({ missionControlRunId: "run-new" }),
    cancelRun: (sessionKey, reason) => guard.cancelRun(sessionKey, reason),
  });
  assert.equal(current.status, 200);
  assert.equal(oldAborted, false);
  assert.equal(newAborted, true);
  releaseNew();
});
