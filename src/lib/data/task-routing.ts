import { canonicalThreadId } from "@/lib/thread-id";
import { listUnifiedTaskRowsAsync, type UnifiedTaskRow } from "@/lib/data/tasks";

const TERMINAL_TASK_STATUSES = new Set([
  "archived",
  "cancelled",
  "completed",
  // ContentTask terminal states use a different vocabulary.
  "discarded",
  "published",
]);

export interface TaskRouteRequestSelectors {
  requestedAgent?: string;
  requestedSkill?: string;
  requestedName?: string;
}

export interface ResolveSameGroupTaskRouteInput extends TaskRouteRequestSelectors {
  clientSlug: string;
  /** Current task context. Used only to derive the project/group. */
  sourceTaskId?: string;
  /** Current chat context. Used only to derive the project/group. */
  sourceThreadId?: string;
  /** Explicit project/group context. Takes precedence over source context. */
  groupId?: string;
  /** Explicit destination. When present, no heuristic fallback is allowed. */
  targetTaskId?: string;
  /** Explicit destination. When present, no heuristic fallback is allowed. */
  targetThreadId?: string;
}

export type TaskRouteMatchSignal =
  | "agent_exact"
  | "agent_missing"
  | "agent_mismatch"
  | "skill_exact"
  | "skill_missing"
  | "skill_mismatch"
  | "name_exact"
  | "name_strong"
  | "name_weak"
  | "name_mismatch"
  | "inactive";

export interface TaskRouteCandidateScore {
  score: number;
  strength: "exact" | "strong" | "weak" | "none";
  eligibleForReuse: boolean;
  signals: TaskRouteMatchSignal[];
}

export interface TaskRouteCandidate {
  taskId: string;
  taskName: string;
  taskType: string;
  status: string;
  groupId: string | null;
  agent?: string;
  skill?: string;
  targetThreadId: string;
  match: TaskRouteCandidateScore;
}

export type SameGroupTaskRouteResolution =
  | {
      kind: "reuse";
      reason: "explicit_target" | "unique_compatible";
      groupId: string | null;
      target: TaskRouteCandidate;
    }
  | {
      kind: "ambiguous";
      reason: "explicit_target_ambiguous" | "multiple_compatible";
      groupId: string | null;
      candidates: TaskRouteCandidate[];
    }
  | {
      kind: "suggest_create";
      reason:
        | "no_compatible_task"
        | "explicit_target_not_found"
        | "explicit_target_inactive"
        | "explicit_target_outside_group";
      groupId: string;
      requested: TaskRouteRequestSelectors;
      nearbyCandidates: TaskRouteCandidate[];
      unavailableTarget?: TaskRouteCandidate;
    }
  | {
      kind: "group_required";
      reason:
        | "no_group_context"
        | "group_not_found"
        | "source_not_found"
        | "source_ambiguous";
    };

function normalized(value: unknown): string {
  if (typeof value !== "string") return "";
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("en-US")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function key(value: unknown): string {
  return typeof value === "string" ? value.trim().toLocaleLowerCase("en-US") : "";
}

function tokens(value: string): Set<string> {
  return new Set(normalized(value).split(" ").filter((part) => part.length > 1));
}

function nameSimilarity(requestedName: string, candidateName: string): "exact" | "strong" | "weak" | "none" {
  const requested = normalized(requestedName);
  const candidate = normalized(candidateName);
  if (!requested || !candidate) return "none";
  if (requested === candidate) return "exact";

  const requestedTokens = tokens(requested);
  const candidateTokens = tokens(candidate);
  const shared = [...requestedTokens].filter((part) => candidateTokens.has(part)).length;
  if (shared === 0) return "none";

  const requestedCoverage = shared / requestedTokens.size;
  const candidateCoverage = shared / candidateTokens.size;
  if (shared >= 2 && requestedCoverage >= 0.75 && candidateCoverage >= 0.6) {
    return "strong";
  }
  return "weak";
}

export function isActiveTaskRouteCandidate(candidate: Pick<UnifiedTaskRow, "status">): boolean {
  return !TERMINAL_TASK_STATUSES.has(normalized(candidate.status));
}

/**
 * Pure compatibility scorer. It deliberately treats fuzzy name overlap as
 * insufficient on its own: a strong-but-non-exact name needs an exact agent or
 * skill anchor before the candidate can be reused.
 */
export function scoreTaskRouteCandidate(
  candidate: UnifiedTaskRow,
  request: TaskRouteRequestSelectors,
): TaskRouteCandidateScore {
  const signals: TaskRouteMatchSignal[] = [];
  let score = 0;

  if (!isActiveTaskRouteCandidate(candidate)) {
    return { score: -1_000, strength: "none", eligibleForReuse: false, signals: ["inactive"] };
  }

  const requestedAgent = normalized(request.requestedAgent);
  const candidateAgents = new Set(
    [candidate.agent, candidate.owner].map(normalized).filter(Boolean),
  );
  const agentExact = Boolean(requestedAgent && candidateAgents.has(requestedAgent));
  let structuredMismatch = false;
  let structuredMissing = false;
  if (requestedAgent) {
    if (agentExact) {
      signals.push("agent_exact");
      score += 30;
    } else if (candidateAgents.size === 0) {
      signals.push("agent_missing");
      structuredMissing = true;
      score -= 5;
    } else {
      signals.push("agent_mismatch");
      structuredMismatch = true;
      score -= 60;
    }
  }

  const requestedSkill = normalized(request.requestedSkill);
  const candidateSkills = new Set(
    [candidate.skill, ...(Array.isArray(candidate.skills) ? candidate.skills : [])]
      .map(normalized)
      .filter(Boolean),
  );
  const skillExact = Boolean(requestedSkill && candidateSkills.has(requestedSkill));
  if (requestedSkill) {
    if (skillExact) {
      signals.push("skill_exact");
      score += 45;
    } else if (candidateSkills.size === 0) {
      signals.push("skill_missing");
      structuredMissing = true;
      score -= 10;
    } else {
      signals.push("skill_mismatch");
      structuredMismatch = true;
      score -= 80;
    }
  }

  const requestedName = normalized(request.requestedName);
  const nameMatch = requestedName
    ? nameSimilarity(requestedName, candidate.name)
    : "none";
  if (requestedName) {
    if (nameMatch === "exact") {
      signals.push("name_exact");
      score += 70;
    } else if (nameMatch === "strong") {
      signals.push("name_strong");
      score += 30;
    } else if (nameMatch === "weak") {
      signals.push("name_weak");
      score += 10;
    } else {
      signals.push("name_mismatch");
      score -= 15;
    }
  }

  const hasSelector = Boolean(requestedAgent || requestedSkill || requestedName);
  const structuredAnchor = agentExact || skillExact;
  const nameSatisfied = !requestedName
    || nameMatch === "exact"
    || (nameMatch === "strong" && structuredAnchor);
  const identityAnchor = nameMatch === "exact" || structuredAnchor;
  const eligibleForReuse = hasSelector
    && !structuredMismatch
    && !structuredMissing
    && nameSatisfied
    && identityAnchor;

  let strength: TaskRouteCandidateScore["strength"] = "none";
  if (eligibleForReuse && (nameMatch === "exact" || !requestedName)) {
    strength = "exact";
  } else if (eligibleForReuse) {
    strength = "strong";
  } else if (signals.some((signal) => signal.endsWith("_exact") || signal === "name_strong" || signal === "name_weak")) {
    strength = "weak";
  }

  return { score, strength, eligibleForReuse, signals };
}

function isRoutableTask(row: UnifiedTaskRow): boolean {
  return normalized(row.type) !== "project";
}

/** Return the canonical full chat id, preferring the task's persisted anchor. */
export function canonicalTaskRouteThreadId(row: UnifiedTaskRow, clientSlug: string): string {
  const persisted = typeof row.mc_chat_thread_id === "string"
    ? row.mc_chat_thread_id.trim()
    : "";
  if (persisted) {
    return canonicalThreadId(persisted.includes(":") ? persisted : `${clientSlug}:${persisted}`);
  }

  const namespace = normalized(row.type) === "content task" ? "content" : "task";
  return canonicalThreadId(`${clientSlug}:${namespace}:${row.id.toLocaleLowerCase("en-US")}`);
}

function canonicalInputThreadId(clientSlug: string, threadId: string): string {
  const trimmed = threadId.trim();
  return canonicalThreadId(trimmed.includes(":") ? trimmed : `${clientSlug}:${trimmed}`);
}

function indexRows(rows: UnifiedTaskRow[]): Map<string, UnifiedTaskRow> {
  return new Map(rows.map((row) => [key(row.id), row]));
}

function groupIdForRow(row: UnifiedTaskRow, byId: Map<string, UnifiedTaskRow>): string | null {
  if (normalized(row.type) === "project") return row.id;
  if (row.project_id) return row.project_id;

  const visited = new Set<string>([key(row.id)]);
  let parentId = row.parent_id;
  while (parentId) {
    const parentKey = key(parentId);
    if (!parentKey || visited.has(parentKey)) return null;
    visited.add(parentKey);
    const parent = byId.get(parentKey);
    if (!parent) return null;
    if (normalized(parent.type) === "project") return parent.id;
    if (parent.project_id) return parent.project_id;
    parentId = parent.parent_id;
  }
  return null;
}

function rowsByThread(rows: UnifiedTaskRow[], input: ResolveSameGroupTaskRouteInput, threadId: string): UnifiedTaskRow[] {
  const wanted = key(canonicalInputThreadId(input.clientSlug, threadId));
  return rows.filter((row) => key(canonicalTaskRouteThreadId(row, input.clientSlug)) === wanted);
}

function toCandidate(
  row: UnifiedTaskRow,
  groupId: string | null,
  input: ResolveSameGroupTaskRouteInput,
): TaskRouteCandidate {
  return {
    taskId: row.id,
    taskName: row.name,
    taskType: String(row.type),
    status: row.status,
    groupId,
    agent: row.agent || row.owner || undefined,
    skill: row.skill || (Array.isArray(row.skills) ? row.skills[0] : undefined),
    targetThreadId: canonicalTaskRouteThreadId(row, input.clientSlug),
    match: scoreTaskRouteCandidate(row, input),
  };
}

function sortCandidates(candidates: TaskRouteCandidate[]): TaskRouteCandidate[] {
  return [...candidates].sort((left, right) =>
    right.match.score - left.match.score
    || left.taskName.localeCompare(right.taskName)
    || left.taskId.localeCompare(right.taskId),
  );
}

function resolveExplicitTarget(
  rows: UnifiedTaskRow[],
  input: ResolveSameGroupTaskRouteInput,
): UnifiedTaskRow[] | null {
  const hasTask = Boolean(input.targetTaskId?.trim());
  const hasThread = Boolean(input.targetThreadId?.trim());
  if (!hasTask && !hasThread) return null;

  return rows.filter((row) => {
    if (!isRoutableTask(row)) return false;
    const taskMatches = !hasTask || key(row.id) === key(input.targetTaskId);
    const threadMatches = !hasThread
      || key(canonicalTaskRouteThreadId(row, input.clientSlug))
        === key(canonicalInputThreadId(input.clientSlug, input.targetThreadId!));
    return taskMatches && threadMatches;
  });
}

function resolveGroupId(
  rows: UnifiedTaskRow[],
  byId: Map<string, UnifiedTaskRow>,
  input: ResolveSameGroupTaskRouteInput,
): { groupId?: string; error?: Extract<SameGroupTaskRouteResolution, { kind: "group_required" }>["reason"] } {
  if (input.groupId?.trim()) {
    const wanted = key(input.groupId);
    const group = rows.find((row) => normalized(row.type) === "project" && key(row.id) === wanted);
    return group ? { groupId: group.id } : { error: "group_not_found" };
  }

  const hasSource = Boolean(input.sourceTaskId?.trim() || input.sourceThreadId?.trim());
  if (!hasSource) return { error: "no_group_context" };

  const sourceRows = new Map<string, UnifiedTaskRow>();
  if (input.sourceTaskId?.trim()) {
    for (const row of rows.filter((candidate) => key(candidate.id) === key(input.sourceTaskId))) {
      sourceRows.set(key(row.id), row);
    }
  }
  if (input.sourceThreadId?.trim()) {
    for (const row of rowsByThread(rows, input, input.sourceThreadId)) {
      sourceRows.set(key(row.id), row);
    }
  }
  if (sourceRows.size === 0) return { error: "source_not_found" };

  const groups = new Map<string, string>();
  for (const row of sourceRows.values()) {
    const groupId = groupIdForRow(row, byId);
    if (groupId) groups.set(key(groupId), groupId);
  }
  if (groups.size === 0) return { error: "source_not_found" };
  if (groups.size > 1) return { error: "source_ambiguous" };
  return { groupId: [...groups.values()][0] };
}

function sourceTaskKeys(
  rows: UnifiedTaskRow[],
  input: ResolveSameGroupTaskRouteInput,
): Set<string> {
  const sourceKeys = new Set<string>();
  if (input.sourceTaskId?.trim()) {
    for (const row of rows) {
      if (key(row.id) === key(input.sourceTaskId)) sourceKeys.add(key(row.id));
    }
  }
  if (input.sourceThreadId?.trim()) {
    for (const row of rowsByThread(rows, input, input.sourceThreadId)) {
      sourceKeys.add(key(row.id));
    }
  }
  return sourceKeys;
}

/** Pure row resolver; useful for deterministic unit tests and callers with a snapshot. */
export function resolveSameGroupTaskRouteFromRows(
  rows: UnifiedTaskRow[],
  input: ResolveSameGroupTaskRouteInput,
): SameGroupTaskRouteResolution {
  const byId = indexRows(rows);
  const explicitTargetRows = resolveExplicitTarget(rows, input);

  // A supplied source/group is a hard safety boundary, including for explicit
  // targets. With no supplied context, an explicit target may establish its
  // own group because the user named that destination directly.
  const hasGroupContext = Boolean(
    input.groupId?.trim() || input.sourceTaskId?.trim() || input.sourceThreadId?.trim(),
  );
  const contextGroup = hasGroupContext ? resolveGroupId(rows, byId, input) : null;
  if (contextGroup && !contextGroup.groupId) {
    return { kind: "group_required", reason: contextGroup.error || "no_group_context" };
  }

  if (explicitTargetRows) {
    const targetsInGroup = contextGroup?.groupId
      ? explicitTargetRows.filter((row) =>
          key(groupIdForRow(row, byId)) === key(contextGroup.groupId),
        )
      : explicitTargetRows;
    const activeTargets = targetsInGroup.filter(isActiveTaskRouteCandidate);
    if (activeTargets.length > 0) {
      const candidates = sortCandidates(activeTargets.map((row) =>
        toCandidate(row, groupIdForRow(row, byId), input),
      ));
      if (candidates.length === 1) {
        return {
          kind: "reuse",
          reason: "explicit_target",
          groupId: candidates[0].groupId,
          target: candidates[0],
        };
      }
      return {
        kind: "ambiguous",
        reason: "explicit_target_ambiguous",
        groupId: candidates[0]?.groupId || null,
        candidates,
      };
    }

    if (
      contextGroup?.groupId
      && explicitTargetRows.some((row) =>
        key(groupIdForRow(row, byId)) !== key(contextGroup.groupId),
      )
    ) {
      const outsideTarget = explicitTargetRows.find((row) =>
        key(groupIdForRow(row, byId)) !== key(contextGroup.groupId),
      )!;
      return {
        kind: "suggest_create",
        reason: "explicit_target_outside_group",
        groupId: contextGroup.groupId,
        requested: {
          requestedAgent: input.requestedAgent,
          requestedSkill: input.requestedSkill,
          requestedName: input.requestedName,
        },
        nearbyCandidates: [],
        unavailableTarget: toCandidate(
          outsideTarget,
          groupIdForRow(outsideTarget, byId),
          input,
        ),
      };
    }
  }

  const targetDerivedGroup = explicitTargetRows?.[0]
    ? groupIdForRow(explicitTargetRows[0], byId)
    : null;
  const group = contextGroup || (targetDerivedGroup
    ? { groupId: targetDerivedGroup }
    : resolveGroupId(rows, byId, input));
  if (!group.groupId) {
    return { kind: "group_required", reason: group.error || "no_group_context" };
  }

  if (explicitTargetRows) {
    const unavailable = contextGroup?.groupId
      ? explicitTargetRows.find((row) =>
          key(groupIdForRow(row, byId)) === key(contextGroup.groupId),
        )
      : explicitTargetRows[0];
    return {
      kind: "suggest_create",
      reason: unavailable ? "explicit_target_inactive" : "explicit_target_not_found",
      groupId: group.groupId,
      requested: {
        requestedAgent: input.requestedAgent,
        requestedSkill: input.requestedSkill,
        requestedName: input.requestedName,
      },
      nearbyCandidates: [],
      unavailableTarget: unavailable
        ? toCandidate(unavailable, groupIdForRow(unavailable, byId), input)
        : undefined,
    };
  }

  const sourceKeys = sourceTaskKeys(rows, input);
  const groupCandidates = rows
    .filter(isRoutableTask)
    .filter(isActiveTaskRouteCandidate)
    .filter((row) => !sourceKeys.has(key(row.id)))
    .filter((row) => key(groupIdForRow(row, byId)) === key(group.groupId))
    .map((row) => toCandidate(row, group.groupId!, input));
  const eligible = sortCandidates(groupCandidates.filter((candidate) => candidate.match.eligibleForReuse));

  if (eligible.length > 0) {
    const bestStrength = eligible.some((candidate) => candidate.match.strength === "exact")
      ? "exact"
      : "strong";
    const finalists = eligible.filter((candidate) => candidate.match.strength === bestStrength);
    if (finalists.length === 1) {
      return {
        kind: "reuse",
        reason: "unique_compatible",
        groupId: group.groupId,
        target: finalists[0],
      };
    }
    return {
      kind: "ambiguous",
      reason: "multiple_compatible",
      groupId: group.groupId,
      candidates: finalists,
    };
  }

  return {
    kind: "suggest_create",
    reason: "no_compatible_task",
    groupId: group.groupId,
    requested: {
      requestedAgent: input.requestedAgent,
      requestedSkill: input.requestedSkill,
      requestedName: input.requestedName,
    },
    nearbyCandidates: sortCandidates(
      groupCandidates.filter((candidate) => candidate.match.strength === "weak"),
    ).slice(0, 5),
  };
}

/**
 * Backend-neutral entry point. `listUnifiedTaskRowsAsync` selects DB or JSON
 * using the existing task backend configuration before the pure resolver runs.
 */
export async function resolveSameGroupTaskRoute(
  input: ResolveSameGroupTaskRouteInput,
): Promise<SameGroupTaskRouteResolution> {
  const rows = await listUnifiedTaskRowsAsync(input.clientSlug);
  return resolveSameGroupTaskRouteFromRows(rows, input);
}
