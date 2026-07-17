import type { DurableExecutionScopeSupervisorReadiness } from "@/lib/durable-execution";
import { getCanaryDiscoveryRuntimeReadiness } from "@/lib/partnerships/discovery-durable-worker";
import { createStagingCanaryReadinessHandler } from "@/lib/runtime/staging-canary-readiness-api";
import { requireInternalAuth } from "@/lib/sancho-internal-api";

export function isPartnershipsDiscoveryCanaryReady(
  supervisor: DurableExecutionScopeSupervisorReadiness | undefined,
): boolean {
  return (
    supervisor?.state === "ready" &&
    supervisor.started &&
    Boolean(supervisor.lastFullSuccessAt) &&
    !supervisor.lastError
  );
}

export default createStagingCanaryReadinessHandler({
  surface: "partnerships",
  authorize: requireInternalAuth,
  getReady: () =>
    isPartnershipsDiscoveryCanaryReady(getCanaryDiscoveryRuntimeReadiness()),
});
