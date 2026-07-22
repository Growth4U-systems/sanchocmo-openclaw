const activeRuns = new Map();
const admittedInboundRuns = new Map();
const INBOUND_ADMISSION_TTL_MS = 2 * 60 * 60 * 1000;
const INBOUND_PENDING_TTL_MS = 60 * 1000;
const INBOUND_ADMISSION_MAX_ENTRIES = 10_000;

function canonicalThreadId(slug, threadId) {
  const client = typeof slug === "string" ? slug.trim() : "";
  const thread = typeof threadId === "string" ? threadId.trim() : "";
  if (!client) return thread;
  return thread.startsWith(`${client}:`) ? thread : `${client}:${thread}`;
}

function keyFor(slug, threadId, agent) {
  return `${canonicalThreadId(slug, threadId)}\0${String(agent || "sancho")
    .trim()
    .toLowerCase()}`;
}

const CAPABILITY_PATTERN = /^[a-f0-9]{64}$/;
const RUN_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:@/+~-]{0,159}$/;
const LEASE_TOKEN_PATTERN = /^[A-Za-z0-9_-]{32,256}$/;
const TERMINAL_CALLBACK_GRANT_PATTERN = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
const TERMINAL_CALLBACK_GRANT_MAX_BYTES = 4_096;

function normalizedTerminalCallbackGrant(value) {
  return typeof value === "string" &&
    Buffer.byteLength(value, "utf8") <= TERMINAL_CALLBACK_GRANT_MAX_BYTES &&
    TERMINAL_CALLBACK_GRANT_PATTERN.test(value)
    ? value
    : undefined;
}

export function safeTerminalCallbackGrantEnvelope(
  grant,
  expiresAt,
  now = Date.now(),
) {
  const token = normalizedTerminalCallbackGrant(grant);
  const expiry = typeof expiresAt === "string" ? Date.parse(expiresAt) : NaN;
  return token && Number.isFinite(expiry) && expiry > now
    ? { token, expiresAt: new Date(expiry).toISOString() }
    : null;
}

function pruneInboundAdmissions(now) {
  for (const [runId, admission] of admittedInboundRuns) {
    if (admission.expiresAt <= now) admittedInboundRuns.delete(runId);
  }
}

/**
 * Process-local single-flight admission. It prevents concurrent/retried HTTP
 * delivery from creating two OpenClaw turns on the singleton gateway without
 * introducing a durable claim-before-dispatch crash window.
 */
export function claimRuntimeInbound(runId, now = Date.now()) {
  if (typeof runId !== "string" || !runId) return "invalid";
  pruneInboundAdmissions(now);
  const existing = admittedInboundRuns.get(runId);
  if (existing?.state === "pending") return "duplicate_pending";
  if (existing?.state === "accepted") return "duplicate_accepted";
  if (admittedInboundRuns.size >= INBOUND_ADMISSION_MAX_ENTRIES) {
    return "saturated";
  }
  admittedInboundRuns.set(runId, {
    state: "pending",
    expiresAt: now + INBOUND_PENDING_TTL_MS,
  });
  return "claimed";
}

export function releaseRuntimeInbound(runId) {
  const admission = admittedInboundRuns.get(runId);
  if (!admission || admission.state !== "pending") return false;
  admittedInboundRuns.delete(runId);
  return true;
}

export function acceptRuntimeInbound(runId, now = Date.now()) {
  const admission = admittedInboundRuns.get(runId);
  if (!admission) return false;
  admittedInboundRuns.set(runId, {
    state: "accepted",
    expiresAt: now + INBOUND_ADMISSION_TTL_MS,
  });
  return true;
}

export function registerRuntimeRun({
  slug,
  threadId,
  agent,
  missionControlRunId,
  sessionKey,
  runtimeToolCapability,
  runtimeTerminalCallbackGrant,
  dispatchRunId,
  dispatchLeaseToken,
  allowExternalEffects = false,
  allowedExternalEffects = [],
}) {
  if (typeof missionControlRunId !== "string" || !missionControlRunId.trim())
    return () => {};
  const key = keyFor(slug, threadId, agent);
  const capability =
    typeof runtimeToolCapability === "string" &&
    CAPABILITY_PATTERN.test(runtimeToolCapability)
      ? runtimeToolCapability
      : undefined;
  const hasDispatchRunId =
    typeof dispatchRunId === "string" && RUN_ID_PATTERN.test(dispatchRunId);
  const hasDispatchLeaseToken =
    typeof dispatchLeaseToken === "string" &&
    LEASE_TOKEN_PATTERN.test(dispatchLeaseToken);
  const durableDispatch = hasDispatchRunId && hasDispatchLeaseToken;
  const terminalCallbackGrant = normalizedTerminalCallbackGrant(
    runtimeTerminalCallbackGrant,
  );
  const exactExternalEffects =
    allowExternalEffects === true && Array.isArray(allowedExternalEffects)
      ? [
          ...new Set(
            allowedExternalEffects.filter(
              (name) =>
                name === "leads_search_start" ||
                name === "partnerships_discovery_start",
            ),
          ),
        ]
      : [];
  const token = {
    missionControlRunId: missionControlRunId.trim(),
    ...(typeof sessionKey === "string" &&
    sessionKey.trim() &&
    Buffer.byteLength(sessionKey, "utf8") <= 1_024
      ? { sessionKey: sessionKey.trim() }
      : {}),
    ...(capability ? { runtimeToolCapability: capability } : {}),
    ...(durableDispatch ? { dispatchRunId, dispatchLeaseToken } : {}),
    ...(terminalCallbackGrant ? { runtimeTerminalCallbackGrant } : {}),
    allowExternalEffects: exactExternalEffects.length > 0,
    allowedExternalEffects: exactExternalEffects,
  };
  activeRuns.set(key, token);
  return () => {
    if (activeRuns.get(key) === token) activeRuns.delete(key);
  };
}

/**
 * Return tool authority only for the exact active agent turn. The raw
 * capability stays out of prompts, session history, logs and callback bodies.
 * Exact-run HTTP callback headers may carry it back to Mission Control; the
 * private terminal outbox can persist those headers until acknowledgement.
 */
export function runtimeRunAuthorityFor(slug, threadId, agent) {
  if (typeof agent !== "string" || !agent.trim()) return undefined;
  const active = activeRuns.get(keyFor(slug, threadId, agent));
  if (
    !active?.missionControlRunId ||
    active.allowExternalEffects !== true ||
    !CAPABILITY_PATTERN.test(active.runtimeToolCapability || "")
  ) {
    return undefined;
  }
  return {
    missionControlRunId: active.missionControlRunId,
    runtimeToolCapability: active.runtimeToolCapability,
    ...(active.dispatchRunId && active.dispatchLeaseToken
      ? {
          dispatchRunId: active.dispatchRunId,
          dispatchLeaseToken: active.dispatchLeaseToken,
        }
      : {}),
    allowExternalEffects: true,
    allowedExternalEffects: [...active.allowedExternalEffects],
  };
}

/** Callback authority is required for every run, including read-only/client
 * turns. Unlike tool authority it does not grant external side effects. */
export function runtimeRunCallbackAuthorityFor(slug, threadId, agent) {
  const hasAgent = typeof agent === "string" && agent.trim();
  let active = hasAgent
    ? activeRuns.get(keyFor(slug, threadId, agent))
    : undefined;
  if (!hasAgent) {
    const prefix = `${canonicalThreadId(slug, threadId)}\0`;
    const matches = [...activeRuns.entries()]
      .filter(([key]) => key.startsWith(prefix))
      .map(([, value]) => value);
    active = matches.length === 1 ? matches[0] : undefined;
  }
  if (
    !active?.missionControlRunId ||
    !CAPABILITY_PATTERN.test(active.runtimeToolCapability || "")
  ) {
    return undefined;
  }
  return {
    missionControlRunId: active.missionControlRunId,
    runtimeToolCapability: active.runtimeToolCapability,
    ...(active.dispatchRunId && active.dispatchLeaseToken
      ? {
          dispatchRunId: active.dispatchRunId,
          dispatchLeaseToken: active.dispatchLeaseToken,
        }
      : {}),
    ...(active.runtimeTerminalCallbackGrant
      ? {
          runtimeTerminalCallbackGrant: active.runtimeTerminalCallbackGrant,
        }
      : {}),
  };
}

export function missionControlRunIdFor(slug, threadId, agent) {
  return runtimeRunCallbackAuthorityFor(slug, threadId, agent)
    ?.missionControlRunId;
}

/**
 * Authorize a control-plane cancellation only for the exact run currently
 * owning this thread+agent slot. The shared transport secret authenticates the
 * caller at the HTTP boundary; this process-local binding prevents a stale
 * Stop from aborting a newer turn in the same OpenClaw session.
 */
export function runtimeRunStopAuthorityFor({
  slug,
  threadId,
  agent,
  missionControlRunId,
}) {
  if (
    typeof slug !== "string" ||
    !/^[a-z0-9][a-z0-9-]{0,119}$/.test(slug) ||
    typeof threadId !== "string" ||
    threadId !== canonicalThreadId(slug, threadId) ||
    typeof agent !== "string" ||
    !/^[a-z0-9][a-z0-9_-]{0,63}$/.test(agent) ||
    typeof missionControlRunId !== "string" ||
    !RUN_ID_PATTERN.test(missionControlRunId)
  ) {
    return null;
  }
  const active = activeRuns.get(keyFor(slug, threadId, agent));
  if (
    active?.missionControlRunId !== missionControlRunId ||
    typeof active.sessionKey !== "string" ||
    !active.sessionKey
  ) {
    return null;
  }
  return { sessionKey: active.sessionKey };
}

export function resetRuntimeRunStateForTest() {
  activeRuns.clear();
  admittedInboundRuns.clear();
}
