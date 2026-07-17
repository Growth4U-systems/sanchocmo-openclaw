import assert from "node:assert/strict";
import test from "node:test";
import {
  DurableExecutionEngine,
  declaredEffectTimeoutBudgetMs,
  defaultHandlerTimeoutMsForOperation,
} from "@/lib/durable-execution/runtime";
import { DISCOVERY_EXECUTION_OPERATION } from "../discovery-execution-policy";
import { partnershipsDiscoveryRegistryV2 } from "../discovery-admission-v2";

test("Partnerships derives an outer deadline beyond every declared effect", () => {
  const registry = partnershipsDiscoveryRegistryV2();

  assert.equal(
    declaredEffectTimeoutBudgetMs(registry, DISCOVERY_EXECUTION_OPERATION),
    330_000,
  );
  assert.equal(
    defaultHandlerTimeoutMsForOperation(
      registry,
      DISCOVERY_EXECUTION_OPERATION,
    ),
    360_000,
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
        handlerTimeoutMs: 330_000,
      }),
    /must exceed the declared effect timeout budget \(330000\)/,
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
