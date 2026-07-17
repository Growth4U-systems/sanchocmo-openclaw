import assert from "node:assert/strict";
import test from "node:test";
import type { AgentRun } from "../../data/agent-runs";
import { authorizeRuntimeRunRequest } from "../runtime-run-request-authority";

const capability = "a".repeat(64);
const leaseToken = "l".repeat(48);

function durableParent(): AgentRun {
  return {
    id: "parent-1",
    threadId: "hospital-capilar:general",
    runtime: "openclaw",
    agent: "sancho",
    status: "running",
    input: {
      slug: "hospital-capilar",
      threadId: "hospital-capilar:general",
      text: "Busca partners",
      runtimeDispatchMode: "ledger-v1",
    },
    createdAt: "2025-01-01T00:00:00.000Z",
    updatedAt: "2025-01-01T00:00:00.000Z",
  };
}

test("a fenced dispatch lease authorizes its parent without the legacy expiring digest", async () => {
  const parentRun = durableParent();
  let leaseInput: Record<string, unknown> | undefined;
  const authority = await authorizeRuntimeRunRequest(
    {
      runId: parentRun.id,
      capability,
      dispatchRunId: "dispatch-1",
      dispatchLeaseToken: leaseToken,
    },
    {
      resolveAgentRun: async () => {
        throw new Error("legacy lookup must not be authoritative");
      },
      authorizeDispatchLease: async (input) => {
        leaseInput = input;
        return { parentRun };
      },
      now: () => new Date("2026-07-16T00:00:00.000Z"),
    },
  );
  assert.equal(authority?.run.id, parentRun.id);
  assert.equal(authority?.slug, "hospital-capilar");
  assert.deepEqual(leaseInput, {
    parentAgentRunId: "parent-1",
    dispatchRunId: "dispatch-1",
    leaseToken,
    runtimeToolCapability: capability,
    allowTerminalParent: undefined,
  });
});

test("partial or stale dispatch credentials cannot fall back to legacy authority", async () => {
  const parentRun = durableParent();
  let legacyLookups = 0;
  let leaseLookups = 0;
  const dependencies = {
    resolveAgentRun: async () => {
      legacyLookups += 1;
      return parentRun;
    },
    authorizeDispatchLease: async () => {
      leaseLookups += 1;
      return null;
    },
  };
  const partial = await authorizeRuntimeRunRequest(
    {
      runId: parentRun.id,
      capability,
      dispatchRunId: "dispatch-1",
    },
    dependencies,
  );
  const stale = await authorizeRuntimeRunRequest(
    {
      runId: parentRun.id,
      capability,
      dispatchRunId: "dispatch-1",
      dispatchLeaseToken: leaseToken,
    },
    dependencies,
  );
  assert.equal(partial, null);
  assert.equal(stale, null);
  assert.equal(legacyLookups, 0);
  assert.equal(leaseLookups, 1);
});
