const RUN_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:@/+~-]{0,159}$/;
const CAPABILITY_PATTERN = /^[a-f0-9]{64}$/;
const TERMINAL_CALLBACK_GRANT_PATTERN =
  /^[A-Za-z0-9_-]{1,3072}\.[A-Za-z0-9_-]{43}$/;
const TERMINAL_CALLBACK_GRANT_MAX_BYTES = 4_096;

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

/**
 * Terminal callbacks get one additional, webhook-only credential. Keep this
 * separate from callbackAuthorityHeaders so progress/context/tool requests can
 * never inherit the durable bearer by accident.
 */
export function terminalCallbackAuthorityHeaders(message, now = Date.now()) {
  const authority = callbackAuthorityHeaders(message);
  const grant = message?.runtimeTerminalCallbackGrant;
  const expiresAt = Date.parse(message?.runtimeTerminalCallbackGrantExpiresAt);
  if (
    Object.keys(authority).length === 0 ||
    typeof grant !== "string" ||
    Buffer.byteLength(grant, "utf8") > TERMINAL_CALLBACK_GRANT_MAX_BYTES ||
    !TERMINAL_CALLBACK_GRANT_PATTERN.test(grant) ||
    !Number.isFinite(expiresAt) ||
    expiresAt <= now
  ) {
    return {};
  }
  return {
    ...authority,
    "X-Sancho-Terminal-Callback-Grant": grant,
  };
}
