import { skillsOwnedBy } from "@/lib/skill-resolver";

export type AgentExecutionScope = "agent" | "skill" | "task";
export type SkillMode = "auto" | "pinned";

/**
 * Durable routing metadata for one chat thread.
 *
 * `skillHint` is deliberately advisory: the owning agent, scope and execution
 * mode survive between turns, but an "active skill" does not. `agent` scope
 * exposes the owner's catalogue; `task` scope keeps the task boundary while
 * allowing the owner's catalogue; `skill` scope is reserved for a strictly
 * guided/deterministic workflow.
 */
export interface ThreadRouting {
  agent?: string;
  scope: AgentExecutionScope;
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

export interface AgentTurnPolicy {
  policy: AgentExecutionPolicy;
  /** False only for a one-turn Sancho intervention. */
  persistRoute: boolean;
  temporarySancho: boolean;
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
  if (candidate.scope === "agent" || candidate.scope === "skill" || candidate.scope === "task") {
    return candidate.scope;
  }
  if (candidate.skillMode === "auto") return "agent";
  if (candidate.skillMode === "pinned") return "skill";
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

  const ownedSkills = agent === "sancho" ? [] : skillsOwnedBy(agent);
  const scopeCandidate = compatibleCandidates.find((candidate) => candidateScope(candidate) === scope)
    ?? (scope === "skill"
      ? compatibleCandidates.find((candidate) =>
          Boolean(routingToken(candidate.skillHint) ?? routingToken(candidate.skill)),
        )
      : undefined);

  if (scope === "task") {
    // The task is the durable boundary, not a second skill cage. Its declared
    // primary/supporting skills are prioritized, then every skill owned by the
    // same agent is available. Lower-precedence browser/persisted hints may
    // select only from that permitted catalogue; they can never widen it.
    const declaredPrimary = routingToken(scopeCandidate?.skillHint)
      ?? routingToken(scopeCandidate?.skill);
    const declaredSkillsRaw = routingTokens(scopeCandidate?.availableSkills)
      ?? routingTokens(scopeCandidate?.skills)
      ?? [];
    const declaredPrimaryAllowed = declaredPrimary && (ownedSkills.length === 0 || ownedSkills.includes(declaredPrimary))
      ? declaredPrimary
      : undefined;
    const declaredSkills = ownedSkills.length === 0
      ? declaredSkillsRaw
      : declaredSkillsRaw.filter((item) => ownedSkills.includes(item));
    const permitted = Array.from(new Set([
      ...(declaredPrimaryAllowed ? [declaredPrimaryAllowed] : []),
      ...declaredSkills,
      ...ownedSkills,
    ]));
    skillHint = skillHint && permitted.includes(skillHint)
      ? skillHint
      : declaredPrimaryAllowed;
    providedSkills = permitted;
  } else if (scope === "agent" && agent !== "sancho") {
    // Agent scope may receive an advisory hint, but only an owned skill can be
    // selected. Ignore arbitrary skill tokens supplied by stale/client state.
    skillHint = skillHint && ownedSkills.includes(skillHint) ? skillHint : undefined;
    providedSkills = ownedSkills;
  } else if (scope === "skill" && scopeCandidate) {
    // Deterministic skill scope remains narrow. Supporting skills declared by
    // the same authoritative candidate are allowed, lower candidates are not.
    // A specialist can never be pinned to a skill owned by another agent.
    const declaredPrimary = routingToken(scopeCandidate.skillHint)
      ?? routingToken(scopeCandidate.skill);
    const declaredSkillsRaw = routingTokens(scopeCandidate.availableSkills)
      ?? routingTokens(scopeCandidate.skills)
      ?? [];
    const declared = Array.from(new Set([
      ...(declaredPrimary ? [declaredPrimary] : []),
      ...declaredSkillsRaw,
    ]));
    const permitted = agent === "sancho"
      ? declared
      : declared.filter((item) => ownedSkills.includes(item));
    skillHint = skillHint && permitted.includes(skillHint)
      ? skillHint
      : permitted[0];
    if (skillHint) {
      providedSkills = permitted;
    } else {
      // A corrupt/stale pinned route must not execute a foreign skill. Preserve
      // the owning specialist and fall back to its safe agent catalogue.
      scope = "agent";
      providedSkills = agent === "sancho" ? undefined : ownedSkills;
    }
  }

  const availableSkills = Array.from(new Set([
    ...(skillHint ? [skillHint] : []),
    ...(providedSkills ?? []),
  ]));

  return {
    agent,
    scope,
    skillMode: scope === "agent" || scope === "task" ? "auto" : "pinned",
    skillHint,
    availableSkills: availableSkills.length > 0 ? availableSkills : undefined,
  };
}

/**
 * Resolve a turn while keeping durable thread ownership separate from a
 * reversible one-turn Sancho intervention.
 */
export function resolveAgentTurnPolicy(
  candidates: readonly ExecutionRoutingCandidate[],
  override: { temporaryAgent?: unknown; agent?: unknown } = {},
): AgentTurnPolicy {
  const temporarySancho = override.temporaryAgent === true
    && routingToken(override.agent) === "sancho";
  if (temporarySancho) {
    return {
      policy: resolveAgentExecutionPolicy([
        { agent: "sancho", scope: "agent", skillMode: "auto" },
      ]),
      persistRoute: false,
      temporarySancho: true,
    };
  }
  return {
    policy: resolveAgentExecutionPolicy(candidates),
    persistRoute: true,
    temporarySancho: false,
  };
}

export function toThreadRouting(
  policy: AgentExecutionPolicy,
  updatedAt = Date.now(),
): ThreadRouting {
  return {
    agent: policy.agent,
    scope: policy.scope,
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
