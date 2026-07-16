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
  return `${canonicalThreadId(slug, threadId)}\0${String(agent || "sancho").trim().toLowerCase()}`;
}

const CAPABILITY_PATTERN = /^[a-f0-9]{64}$/;
const RUN_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:@/+~-]{0,159}$/;
const LEASE_TOKEN_PATTERN = /^[A-Za-z0-9_-]{32,256}$/;

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
  runtimeToolCapability,
  dispatchRunId,
  dispatchLeaseToken,
  allowExternalEffects = false,
}) {
  if (typeof missionControlRunId !== "string" || !missionControlRunId.trim()) return () => {};
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
  const token = {
    missionControlRunId: missionControlRunId.trim(),
    ...(capability ? { runtimeToolCapability: capability } : {}),
    ...(durableDispatch ? { dispatchRunId, dispatchLeaseToken } : {}),
    allowExternalEffects: allowExternalEffects === true,
  };
  activeRuns.set(key, token);
  return () => {
    if (activeRuns.get(key) === token) activeRuns.delete(key);
  };
}

/**
 * Return tool authority only for the exact active agent turn. The raw
 * capability stays in this process-local map and is never added to prompts,
 * session history, logs, callback bodies or durable storage. Exact-run HTTP
 * callback headers may carry it back to Mission Control.
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
  };
}

export function missionControlRunIdFor(slug, threadId, agent) {
  return runtimeRunCallbackAuthorityFor(slug, threadId, agent)
    ?.missionControlRunId;
}

export function resetRuntimeRunStateForTest() {
  activeRuns.clear();
  admittedInboundRuns.clear();
}
