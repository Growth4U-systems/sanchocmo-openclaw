import { test } from "node:test";
import assert from "node:assert/strict";
import {
  acceptRuntimeInbound,
  claimRuntimeInbound,
  releaseRuntimeInbound,
  missionControlRunIdFor,
  registerRuntimeRun,
  resetRuntimeRunStateForTest,
  runtimeRunAuthorityFor,
  runtimeRunCallbackAuthorityFor,
} from "../runtime-run-state.js";

test("concurrent/retried inbound delivery is single-flight per agent run", () => {
  resetRuntimeRunStateForTest();
  assert.equal(claimRuntimeInbound("run_once", 1_000), "claimed");
  assert.equal(claimRuntimeInbound("run_once", 1_001), "duplicate_pending");
  assert.equal(acceptRuntimeInbound("run_once", 1_002), true);
  assert.equal(claimRuntimeInbound("run_once", 1_003), "duplicate_accepted");
  assert.equal(claimRuntimeInbound("run_other", 1_001), "claimed");
  assert.equal(
    claimRuntimeInbound("run_once", 1_002 + 2 * 60 * 60 * 1000),
    "claimed",
  );
  assert.equal(claimRuntimeInbound("run_pending", 10_000), "claimed");
  assert.equal(claimRuntimeInbound("run_pending", 70_001), "claimed");
});

test("only a pending inbound admission can be released for an authoritative retry", () => {
  resetRuntimeRunStateForTest();
  assert.equal(claimRuntimeInbound("run_pending", 1_000), "claimed");
  assert.equal(releaseRuntimeInbound("run_pending"), true);
  assert.equal(claimRuntimeInbound("run_pending", 1_001), "claimed");
  assert.equal(acceptRuntimeInbound("run_pending", 1_002), true);
  assert.equal(releaseRuntimeInbound("run_pending"), false);
  assert.equal(claimRuntimeInbound("run_pending", 1_003), "duplicate_accepted");
});

test("OpenClaw outbound delivery resolves the exact run by canonical thread and agent", () => {
  resetRuntimeRunStateForTest();
  const capability = "a".repeat(64);
  const releaseOwner = registerRuntimeRun({
    slug: "acme",
    threadId: "acme:task-1",
    agent: "rocinante",
    missionControlRunId: "run_owner",
    runtimeToolCapability: capability,
  });
  const releaseTemporary = registerRuntimeRun({
    slug: "acme",
    threadId: "task-1",
    agent: "sancho",
    missionControlRunId: "run_temporary",
    runtimeToolCapability: capability,
  });

  assert.equal(missionControlRunIdFor("acme", "task-1", "rocinante"), "run_owner");
  assert.equal(missionControlRunIdFor("acme", "acme:task-1", "sancho"), "run_temporary");
  releaseOwner();
  assert.equal(missionControlRunIdFor("acme", "task-1", "rocinante"), undefined);
  assert.equal(missionControlRunIdFor("acme", "task-1", "sancho"), "run_temporary");
  releaseTemporary();
});

test("a stale release cannot remove a newer registration", () => {
  resetRuntimeRunStateForTest();
  const capability = "b".repeat(64);
  const releaseOld = registerRuntimeRun({
    slug: "acme",
    threadId: "task-1",
    agent: "sancho",
    missionControlRunId: "run_old",
    runtimeToolCapability: capability,
  });
  const releaseNew = registerRuntimeRun({
    slug: "acme",
    threadId: "task-1",
    agent: "sancho",
    missionControlRunId: "run_new",
    runtimeToolCapability: capability,
  });
  releaseOld();
  assert.equal(missionControlRunIdFor("acme", "task-1", "sancho"), "run_new");
  releaseNew();
});

test("tool authority requires an exact agent turn and a valid one-turn capability", () => {
  resetRuntimeRunStateForTest();
  const capability = "a".repeat(64);
  const release = registerRuntimeRun({
    slug: "acme",
    threadId: "task-1",
    agent: "sancho",
    missionControlRunId: "run_authorized",
    runtimeToolCapability: capability,
    allowExternalEffects: true,
    allowedExternalEffects: ["leads_search_start"],
  });
  assert.deepEqual(runtimeRunAuthorityFor("acme", "task-1", "sancho"), {
    missionControlRunId: "run_authorized",
    runtimeToolCapability: capability,
    allowExternalEffects: true,
    allowedExternalEffects: ["leads_search_start"],
  });
  assert.equal(runtimeRunAuthorityFor("acme", "task-1", "rocinante"), undefined);
  release();
  assert.equal(runtimeRunAuthorityFor("acme", "task-1", "sancho"), undefined);

  resetRuntimeRunStateForTest();
  registerRuntimeRun({
    slug: "acme",
    threadId: "support-growie-1",
    agent: "sancho",
    missionControlRunId: "run_read_only",
    runtimeToolCapability: capability,
    allowExternalEffects: false,
  });
  assert.equal(
    runtimeRunAuthorityFor("acme", "support-growie-1", "sancho"),
    undefined,
  );
  assert.deepEqual(
    runtimeRunCallbackAuthorityFor("acme", "support-growie-1", "sancho"),
    {
      missionControlRunId: "run_read_only",
      runtimeToolCapability: capability,
    },
  );

  registerRuntimeRun({
    slug: "acme",
    threadId: "task-1",
    agent: "sancho",
    missionControlRunId: "run_without_capability",
    runtimeToolCapability: "invalid",
  });
  assert.equal(runtimeRunAuthorityFor("acme", "task-1", "sancho"), undefined);
});

test("durable dispatch credentials stay in memory and propagate only as a complete pair", () => {
  resetRuntimeRunStateForTest();
  const capability = "c".repeat(64);
  const leaseToken = "lease-token-" + "d".repeat(32);
  const terminalCallbackGrant = "signed-terminal.callback-grant";
  registerRuntimeRun({
    slug: "acme",
    threadId: "task-1",
    agent: "sancho",
    missionControlRunId: "run_durable",
    runtimeToolCapability: capability,
    runtimeTerminalCallbackGrant: terminalCallbackGrant,
    dispatchRunId: "dispatch-1",
    dispatchLeaseToken: leaseToken,
    allowExternalEffects: true,
    allowedExternalEffects: ["leads_search_start"],
  });
  assert.deepEqual(runtimeRunAuthorityFor("acme", "task-1", "sancho"), {
    missionControlRunId: "run_durable",
    runtimeToolCapability: capability,
    dispatchRunId: "dispatch-1",
    dispatchLeaseToken: leaseToken,
    allowExternalEffects: true,
    allowedExternalEffects: ["leads_search_start"],
  });
  assert.deepEqual(
    runtimeRunCallbackAuthorityFor("acme", "task-1", "sancho"),
    {
      missionControlRunId: "run_durable",
      runtimeToolCapability: capability,
      dispatchRunId: "dispatch-1",
      dispatchLeaseToken: leaseToken,
      runtimeTerminalCallbackGrant: terminalCallbackGrant,
    },
  );

  resetRuntimeRunStateForTest();
  registerRuntimeRun({
    slug: "acme",
    threadId: "task-1",
    agent: "sancho",
    missionControlRunId: "run_partial",
    runtimeToolCapability: capability,
    dispatchRunId: "dispatch-1",
    allowExternalEffects: true,
  });
  assert.equal(
    runtimeRunAuthorityFor("acme", "task-1", "sancho"),
    undefined,
  );
});
