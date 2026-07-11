import { skillsOwnedBy } from "@/lib/skill-resolver";

export type AgentExecutionScope = "agent" | "skill";
export type SkillMode = "auto" | "pinned";

/**
 * Durable routing metadata for one chat thread.
 *
 * `skillHint` is deliberately advisory: the owning agent and execution mode
 * survive between turns, but an "active skill" does not. In auto mode the
 * owning agent re-evaluates the user's intent on every turn and may use a
 * different skill or no skill at all.
 */
export interface ThreadRouting {
  agent?: string;
  skillMode: SkillMode;
  skillHint?: string;
  availableSkills?: string[];
  updatedAt: number;
}

export interface ExecutionRoutingCandidate {
  agent?: unknown;
  scope?: unknown;
  skillMode?: unknown;
  skill?: unknown;
  skillHint?: unknown;
  skills?: unknown;
  availableSkills?: unknown;
}

export interface AgentExecutionPolicy {
  agent: string;
  scope: AgentExecutionScope;
  skillMode: SkillMode;
  skillHint?: string;
  availableSkills?: string[];
}

const ROUTING_TOKEN_RE = /^[a-z0-9][a-z0-9_-]{0,127}$/i;

function routingToken(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().toLowerCase();
  return normalized && ROUTING_TOKEN_RE.test(normalized) ? normalized : undefined;
}

function routingTokens(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const normalized = value.map(routingToken).filter((item): item is string => Boolean(item));
  return normalized.length > 0 ? Array.from(new Set(normalized)) : undefined;
}

function candidateScope(candidate: ExecutionRoutingCandidate): AgentExecutionScope | undefined {
  if (candidate.skillMode === "auto") return "agent";
  if (candidate.skillMode === "pinned") return "skill";
  if (candidate.scope === "agent" || candidate.scope === "skill") return candidate.scope;
  return undefined;
}

/**
 * Resolve one turn's execution policy using highest-precedence candidates
 * first (normally explicit request, persisted thread route, namespace route).
 *
 * Backwards compatibility: any legacy route with a seed skill remains pinned,
 * even when it advertises supporting skills. Only an explicit agent/auto scope,
 * or a route with no skill at all, is agent-first.
 */
export function resolveAgentExecutionPolicy(
  candidates: readonly ExecutionRoutingCandidate[],
): AgentExecutionPolicy {
  let agent: string | undefined;
  let skillHint: string | undefined;
  let providedSkills: string[] | undefined;
  let scope: AgentExecutionScope | undefined;

  for (const candidate of candidates) {
    agent ??= routingToken(candidate.agent);
  }
  // Sancho is the one global generalist. A specialist becomes skill-flexible
  // in auto mode, but never turns into a second global generalist.
  agent ??= "sancho";

  // Routing fields belong to an owner. If a higher-precedence candidate
  // changes the agent, do not leak the previous owner's skill catalogue into
  // the new route. Owner-less candidates remain valid per-turn overlays.
  const compatibleCandidates = candidates.filter((candidate) => {
    const candidateAgent = routingToken(candidate.agent);
    return !candidateAgent || candidateAgent === agent;
  });

  for (const candidate of compatibleCandidates) {
    skillHint ??= routingToken(candidate.skillHint) ?? routingToken(candidate.skill);
    providedSkills ??=
      routingTokens(candidate.availableSkills) ?? routingTokens(candidate.skills);
    scope ??= candidateScope(candidate);
  }

  if (!scope) {
    scope = skillHint ? "skill" : "agent";
  }
  // A pinned workflow without an actual seed cannot execute deterministically.
  // Fall back to the owning agent (Sancho when none was declared) instead of
  // creating another "missing skill" failure mode.
  if (scope === "skill" && !skillHint) scope = "agent";

  const availableSkills = Array.from(
    new Set([
      ...(skillHint ? [skillHint] : []),
      ...(providedSkills ?? []),
      ...(scope === "agent" && agent !== "sancho" ? skillsOwnedBy(agent) : []),
    ]),
  );

  return {
    agent,
    scope,
    skillMode: scope === "agent" ? "auto" : "pinned",
    skillHint,
    availableSkills: availableSkills.length > 0 ? availableSkills : undefined,
  };
}

export function toThreadRouting(
  policy: AgentExecutionPolicy,
  updatedAt = Date.now(),
): ThreadRouting {
  return {
    agent: policy.agent,
    skillMode: policy.skillMode,
    skillHint: policy.skillHint,
    availableSkills: policy.availableSkills,
    updatedAt,
  };
}

/** Defensive read boundary for routing metadata loaded from thread JSON. */
export function normalizeThreadRouting(value: unknown): ThreadRouting | undefined {
  if (!value || typeof value !== "object") return undefined;
  const candidate = value as ExecutionRoutingCandidate & { updatedAt?: unknown };
  const scope = candidateScope(candidate);
  if (!scope) return undefined;

  const policy = resolveAgentExecutionPolicy([candidate]);
  return toThreadRouting(
    policy,
    typeof candidate.updatedAt === "number" && Number.isFinite(candidate.updatedAt)
      ? candidate.updatedAt
      : 0,
  );
}
