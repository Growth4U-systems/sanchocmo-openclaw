const RUN_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:@/+~-]{0,159}$/;
const CAPABILITY_PATTERN = /^[a-f0-9]{64}$/;

/**
 * Bind runtime callbacks to the exact Mission Control run that created them.
 * The shared transport secret authenticates the bridge; these headers prove
 * authority over one run and prevent cross-run or cross-tenant callbacks.
 */
export function callbackAuthorityHeaders(message) {
  const runId = message?.missionControlRunId;
  const capability = message?.runtimeToolCapability;
  if (
    typeof runId !== "string" ||
    !RUN_ID_PATTERN.test(runId) ||
    typeof capability !== "string" ||
    !CAPABILITY_PATTERN.test(capability)
  ) {
    return {};
  }
  return {
    "X-Mission-Control-Run-Id": runId,
    "X-Sancho-Run-Capability": capability,
  };
}
