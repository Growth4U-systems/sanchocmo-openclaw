const activeRuns = new Map();

function canonicalThreadId(slug, threadId) {
  const client = typeof slug === "string" ? slug.trim() : "";
  const thread = typeof threadId === "string" ? threadId.trim() : "";
  if (!client) return thread;
  return thread.startsWith(`${client}:`) ? thread : `${client}:${thread}`;
}

function keyFor(slug, threadId, agent) {
  return `${canonicalThreadId(slug, threadId)}\0${String(agent || "sancho").trim().toLowerCase()}`;
}

export function registerRuntimeRun({ slug, threadId, agent, missionControlRunId }) {
  if (typeof missionControlRunId !== "string" || !missionControlRunId.trim()) return () => {};
  const key = keyFor(slug, threadId, agent);
  const token = { missionControlRunId: missionControlRunId.trim() };
  activeRuns.set(key, token);
  return () => {
    if (activeRuns.get(key) === token) activeRuns.delete(key);
  };
}

export function missionControlRunIdFor(slug, threadId, agent) {
  const hasAgent = typeof agent === "string" && agent.trim();
  const exact = hasAgent ? activeRuns.get(keyFor(slug, threadId, agent))?.missionControlRunId : undefined;
  if (hasAgent) return exact;
  // Some OpenClaw SDK delivery versions omit agentId. Fall back only when the
  // thread has one unambiguous active run; concurrent owner/Sancho runs must
  // never be guessed.
  const prefix = `${canonicalThreadId(slug, threadId)}\0`;
  const matches = [...activeRuns.entries()]
    .filter(([key]) => key.startsWith(prefix))
    .map(([, value]) => value.missionControlRunId);
  return matches.length === 1 ? matches[0] : undefined;
}

export function resetRuntimeRunStateForTest() {
  activeRuns.clear();
}
