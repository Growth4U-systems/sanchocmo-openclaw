import type { LeadsSearchOperationalReadiness } from "@/lib/leads/search-durable-worker";
import { getLeadsSearchOperationalReadiness } from "@/lib/leads/search-durable-worker";
import { createStagingCanaryReadinessHandler } from "@/lib/runtime/staging-canary-readiness-api";
import { requireInternalAuth } from "@/lib/sancho-internal-api";

export function isLeadsSearchCanaryReady(
  readiness: LeadsSearchOperationalReadiness,
): boolean {
  const supervisor = readiness.supervisor;
  return (
    readiness.acceptsNewAdmissions &&
    readiness.rolloutReady &&
    readiness.credentialBindingReady &&
    readiness.startup.state === "ready" &&
    supervisor?.state === "ready" &&
    supervisor.started &&
    Boolean(supervisor.lastFullSuccessAt) &&
    !supervisor.lastError
  );
}

export default createStagingCanaryReadinessHandler({
  surface: "leads",
  authorize: requireInternalAuth,
  getReady: () =>
    isLeadsSearchCanaryReady(getLeadsSearchOperationalReadiness()),
});
