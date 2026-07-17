import assert from "node:assert/strict";
import test from "node:test";
import {
  DurableExecutionEngine,
  declaredEffectTimeoutBudgetMs,
  defaultHandlerTimeoutMsForOperation,
} from "@/lib/durable-execution/runtime";
import { DISCOVERY_EXECUTION_OPERATION } from "../discovery-execution-policy";
import { partnershipsDiscoveryRegistryV2 } from "../discovery-admission-v2";

// v5 short-step handler: the scrape runs as checkpointed handler steps, so the
// only declared durable effect is the Yalc mutation (30s). The handler outer
// deadline (default 360s) bounds one claim; longer scrapes span extra claims
// by resuming from the persisted checkpoint.
test("Partnerships derives an outer deadline beyond every declared effect", () => {
  const registry = partnershipsDiscoveryRegistryV2();

  assert.equal(
    declaredEffectTimeoutBudgetMs(registry, DISCOVERY_EXECUTION_OPERATION),
    30_000,
  );
  // Derived engine default: max(120s floor, budget + settlement grace). The
  // worker still passes the explicit 360s contract timeout; a scrape that
  // outlives one claim resumes from its checkpoint on the next claim.
  assert.equal(
    defaultHandlerTimeoutMsForOperation(
      registry,
      DISCOVERY_EXECUTION_OPERATION,
    ),
    120_000,
  );
});

test("an explicit outer deadline cannot end inside its effect budget", () => {
  const registry = partnershipsDiscoveryRegistryV2();

  assert.throws(
    () =>
      new DurableExecutionEngine({
        repository: { blockRun: async () => null } as never,
        registry,
        scope: {
          tenantKey: "hospital-capilar",
          operation: DISCOVERY_EXECUTION_OPERATION,
          mode: "canary",
        },
        workerId: "timeout-budget-test",
        leaseMs: 60_000,
        maxAttempts: 1,
        handlerTimeoutMs: 30_000,
      }),
    /must exceed the declared effect timeout budget \(30000\)/,
  );

  assert.doesNotThrow(
    () =>
      new DurableExecutionEngine({
        repository: { blockRun: async () => null } as never,
        registry,
        scope: {
          tenantKey: "hospital-capilar",
          operation: DISCOVERY_EXECUTION_OPERATION,
          mode: "canary",
        },
        workerId: "timeout-budget-test",
        leaseMs: 60_000,
        maxAttempts: 1,
        handlerTimeoutMs: 360_000,
      }),
  );
});
