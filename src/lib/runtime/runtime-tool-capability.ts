import type { AgentRun } from "@/lib/data/agent-runs";

// The current runtime turn watchdog permits 30 minutes. Keep the capability
// slightly longer than that bounded turn so a legitimate late tool call is not
// cut off, while still placing an absolute limit on a leaked/orphaned token.
// Once the runtime watchdog is reduced to 15 minutes, reduce this to 20 minutes.
export const RUNTIME_TOOL_CAPABILITY_MAX_AGE_MS = 35 * 60 * 1000;
const MAX_FUTURE_SKEW_MS = 60 * 1000;

export function isFreshRuntimeToolCapability(
  run: Pick<AgentRun, "createdAt">,
  now = Date.now(),
): boolean {
  const createdAt = Date.parse(run.createdAt);
  if (!Number.isFinite(createdAt)) return false;
  const age = now - createdAt;
  return (
    age >= -MAX_FUTURE_SKEW_MS && age <= RUNTIME_TOOL_CAPABILITY_MAX_AGE_MS
  );
}
