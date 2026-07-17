export const DURABLE_WORKER_BOOT_FLAGS = {
  partnershipsDiscovery: "PARTNERSHIPS_DURABLE_WORKER_BOOT_ENABLED",
  leadsDiscovery: "LEADS_DISCOVERY_DURABLE_WORKER_BOOT_ENABLED",
  leadsSearch: "LEADS_SEARCH_DURABLE_WORKER_BOOT_ENABLED",
} as const;

export interface DurableWorkerBootEnvironment {
  readonly [key: string]: string | undefined;
  PARTNERSHIPS_DURABLE_WORKER_BOOT_ENABLED?: string;
  LEADS_DISCOVERY_DURABLE_WORKER_BOOT_ENABLED?: string;
  LEADS_SEARCH_DURABLE_WORKER_BOOT_ENABLED?: string;
}

export interface DurableWorkerBootPlan {
  partnershipsDiscovery: boolean;
  leadsDiscovery: boolean;
  leadsSearch: boolean;
}

/**
 * Runtime authority is deliberately narrower than truthiness. Operators must
 * set the exact value `1`; absent, padded or descriptive values remain
 * disabled. Product adapters use this same decision for eager startup, lazy
 * wake and external execution.
 */
export function isDurableWorkerBootEnabled(value: string | undefined): boolean {
  return value === "1";
}

/**
 * Resolve runtime execution independently from rollout/admission flags. A
 * worker may therefore boot with admission off and continue draining sticky
 * receipts; with boot off those receipts remain authoritative but paused.
 */
export function resolveDurableWorkerBootPlan(
  env: DurableWorkerBootEnvironment,
): DurableWorkerBootPlan {
  return {
    partnershipsDiscovery: isDurableWorkerBootEnabled(
      env.PARTNERSHIPS_DURABLE_WORKER_BOOT_ENABLED,
    ),
    leadsDiscovery: isDurableWorkerBootEnabled(
      env.LEADS_DISCOVERY_DURABLE_WORKER_BOOT_ENABLED,
    ),
    leadsSearch: isDurableWorkerBootEnabled(
      env.LEADS_SEARCH_DURABLE_WORKER_BOOT_ENABLED,
    ),
  };
}
