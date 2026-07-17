import assert from "node:assert/strict";
import test from "node:test";
import {
  DURABLE_WORKER_BOOT_FLAGS,
  isDurableWorkerBootEnabled,
  resolveDurableWorkerBootPlan,
} from "@/lib/runtime/durable-worker-boot-plan";

test("durable worker boot flags are explicit and adapter-specific", () => {
  assert.deepEqual(DURABLE_WORKER_BOOT_FLAGS, {
    partnershipsDiscovery: "PARTNERSHIPS_DURABLE_WORKER_BOOT_ENABLED",
    leadsDiscovery: "LEADS_DISCOVERY_DURABLE_WORKER_BOOT_ENABLED",
    leadsSearch: "LEADS_SEARCH_DURABLE_WORKER_BOOT_ENABLED",
  });
});

test("durable worker boot is off by default and accepts only exact 1", () => {
  assert.deepEqual(resolveDurableWorkerBootPlan({}), {
    partnershipsDiscovery: false,
    leadsDiscovery: false,
    leadsSearch: false,
  });

  for (const value of [undefined, "", "0", "true", "yes", "01", " 1", "1 "]) {
    assert.equal(isDurableWorkerBootEnabled(value), false, String(value));
  }
  assert.equal(isDurableWorkerBootEnabled("1"), true);
});

test("each adapter has independent boot authority", () => {
  assert.deepEqual(
    resolveDurableWorkerBootPlan({
      PARTNERSHIPS_DURABLE_WORKER_BOOT_ENABLED: "1",
      LEADS_DISCOVERY_DURABLE_WORKER_BOOT_ENABLED: "0",
      LEADS_SEARCH_DURABLE_WORKER_BOOT_ENABLED: "0",
    }),
    {
      partnershipsDiscovery: true,
      leadsDiscovery: false,
      leadsSearch: false,
    },
  );

  assert.deepEqual(
    resolveDurableWorkerBootPlan({
      PARTNERSHIPS_DURABLE_WORKER_BOOT_ENABLED: "0",
      LEADS_DISCOVERY_DURABLE_WORKER_BOOT_ENABLED: "1",
      LEADS_SEARCH_DURABLE_WORKER_BOOT_ENABLED: "0",
    }),
    {
      partnershipsDiscovery: false,
      leadsDiscovery: true,
      leadsSearch: false,
    },
  );

  assert.deepEqual(
    resolveDurableWorkerBootPlan({
      PARTNERSHIPS_DURABLE_WORKER_BOOT_ENABLED: "0",
      LEADS_DISCOVERY_DURABLE_WORKER_BOOT_ENABLED: "0",
      LEADS_SEARCH_DURABLE_WORKER_BOOT_ENABLED: "1",
    }),
    {
      partnershipsDiscovery: false,
      leadsDiscovery: false,
      leadsSearch: true,
    },
  );
});

test("rollout-like values cannot implicitly boot a supervisor", () => {
  const rolloutOnlyEnvironment = {
    PARTNERSHIPS_DISCOVERY_EXECUTION_V2: "canary",
    LEADS_DISCOVERY_EXECUTION_V2: "canary",
    LEADS_SEARCH_EXECUTION_V2: "canary",
  };

  assert.deepEqual(resolveDurableWorkerBootPlan(rolloutOnlyEnvironment), {
    partnershipsDiscovery: false,
    leadsDiscovery: false,
    leadsSearch: false,
  });
});
