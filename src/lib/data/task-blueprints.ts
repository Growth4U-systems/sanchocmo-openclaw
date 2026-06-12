// ============================================================
// Task Blueprints (SAN-167)
// ============================================================
// The generic instantiation engine over the single declarative registry
// `config/pillar-manifest.json` → `taskSets`. One engine for every zone:
// reads a preconfigured task SET (or a single on-demand entry), substitutes
// {slug}/{projectId}/{channel} placeholders, co-locates the EXPLICIT agent
// declared in the blueprint, and returns `TaskCreateInput[]` ready to write
// to tasks.json via applyTaskAnchors. Replaces the bespoke per-zone builders
// (content-engine-tasks.ts, section-manifest.ts, …).
//
// CLIENT-SAFE: imports JSON + skill-resolver only (no fs). The owner-check is
// the SAN-166 guard: every non-templated task's declared agent must equal its
// skill's owner.
// ============================================================

import { resolveAgentForSkill } from "../skill-resolver";
import pillarManifest from "../../../config/pillar-manifest.json";
import type { TaskCreateInput } from "./task-create-helpers";

export interface TaskSetEntry {
  /** Semantic id, unique within the set; referenced by other tasks' dependsOn. */
  id: string;
  /** When present, the task is seeded as part of a fixed project set; the
   *  concrete task id becomes `{projectId}-{taskKey}`. Sorted by taskKey. */
  taskKey?: string;
  name: string;
  /** Skill that runs it. May contain `{slug}` when `skillTemplated`. */
  skill: string;
  skillTemplated?: boolean;
  /** Owner agent — EXPLICIT in the blueprint (never resolved for predeclared tasks). */
  agent: string;
  type?: string;
  channel?: string;
  phase?: number;
  /** Prose, with {slug}/{projectId}/{channel} placeholders. */
  description?: string;
  deliverable?: string;
  /** Deliverable file paths relative to `brand/{slug}/`. First is primary. */
  deliverableFiles?: string[];
  /** Canonical doc path(s) for on-demand entries (no taskKey), e.g. channel-strategy. */
  docPaths?: string[];
  /** `output_files` verbatim (mixed-convention) as stored on the seeded task. */
  outputFiles?: string[];
  /** Semantic ids in the same set this depends on. */
  dependsOn?: string[];
  /** Verbatim passthrough fields merged onto the seeded task (e.g. done_criteria). */
  extra?: Record<string, unknown>;
}

export interface TaskSet {
  label: string;
  tasks: TaskSetEntry[];
}

export const MANIFEST_TASK_SETS = (
  pillarManifest as unknown as { taskSets?: Record<string, TaskSet> }
).taskSets ?? {};

export function getTaskSet(section: string): TaskSet | undefined {
  return MANIFEST_TASK_SETS[section];
}

export function getTaskSetEntry(section: string, id: string): TaskSetEntry | undefined {
  return MANIFEST_TASK_SETS[section]?.tasks.find((t) => t.id === id);
}

/** One on-demand chat-opener BUTTON declaration. String fields are templates
 *  with `{slug}` + per-button `{params}`; instantiateEntry (chat-openers.ts)
 *  substitutes them into a ThreadConfig. Agent is explicit. */
export interface ChatEntry {
  threadId: string;
  threadName: string;
  skill: string;
  skills: string[];
  agent: string;
  linkedTo: string;
  docPath: string | null;
  threadState?: "create" | "continue";
  initialMessage?: string;
  docKind?: "file" | "template";
}

export const MANIFEST_CHAT_ENTRIES = (
  pillarManifest as unknown as { chatEntries?: Record<string, ChatEntry> }
).chatEntries ?? {};

export function getChatEntry(key: string): ChatEntry | undefined {
  return MANIFEST_CHAT_ENTRIES[key];
}

const subst = (s: string, slug: string, projectId?: string, channel?: string): string =>
  s
    .replace(/\{slug\}/g, slug)
    .replace(/\{projectId\}/g, projectId ?? "")
    .replace(/\{channel\}/g, channel ?? "");

/** Format `depends_on` like the legacy seeder: [] → null, [x] → x, [x,y] → [x,y]. */
function formatDependsOn(
  deps: string[],
  keyById: Map<string, string>,
  projectId: string,
): null | string | string[] {
  const ids = deps.map((d) => {
    const key = keyById.get(d);
    if (!key) throw new Error(`task-blueprints: dependsOn references unknown task "${d}"`);
    return `${projectId}-${key}`;
  });
  if (ids.length === 0) return null;
  if (ids.length === 1) return ids[0];
  return ids;
}

/**
 * Instantiate a fixed project task SET (the `taskKey` tasks of a section),
 * ordered by taskKey, for a brand + projectId. Pure — no fs. The output is the
 * TaskCreateInput[] written to tasks.json (the consumer applies anchors).
 */
export function instantiateTaskSet(section: string, ctx: { slug: string; projectId: string }): TaskCreateInput[] {
  const set = getTaskSet(section);
  if (!set) throw new Error(`task-blueprints: unknown task set "${section}"`);
  const { slug, projectId } = ctx;

  const seeded = set.tasks
    .filter((t): t is TaskSetEntry & { taskKey: string } => Boolean(t.taskKey))
    .sort((a, b) => a.taskKey.localeCompare(b.taskKey));

  const keyById = new Map(seeded.map((t) => [t.id, t.taskKey]));

  return seeded.map((t) => {
    const rel = (t.deliverableFiles ?? t.docPaths ?? []).map((p) => `brand/${slug}/${p}`);
    const deliverable_file = rel.length === 1 ? rel[0] : rel;
    const skill = subst(t.skill, slug, projectId);

    return {
      id: `${projectId}-${t.taskKey}`,
      name: t.name,
      description: t.description ? subst(t.description, slug, projectId) : "",
      phase: t.phase,
      type: t.type,
      channel: t.channel,
      niche: null,
      status: "todo",
      deliverable: t.deliverable ? subst(t.deliverable, slug, projectId) : "",
      deliverable_file,
      output_files: t.outputFiles,
      depends_on: formatDependsOn(t.dependsOn ?? [], keyById, projectId),
      owner: "Sancho",
      skill,
      agent: t.agent,
      mc_chat_thread_id: `task-${projectId.toLowerCase()}-${t.taskKey.toLowerCase()}`,
      discord_thread_id: null,
    };
  });
}

/**
 * Instantiate a SINGLETON task (the single entry of a set, no taskKey) with a
 * caller-provided id — for sections whose task is placed imperatively (host
 * project discovery, dedupe, nextTaskId), e.g. Meeting Intelligence setup. The
 * placement logic stays in the consumer; the task contract comes from here.
 */
export function instantiateSingletonTask(section: string, ctx: { slug: string; id: string }): TaskCreateInput {
  const set = getTaskSet(section);
  if (!set) throw new Error(`task-blueprints: unknown task set "${section}"`);
  const t = set.tasks[0];
  if (!t) throw new Error(`task-blueprints: task set "${section}" has no tasks`);
  const { slug } = ctx;
  const rel = (t.deliverableFiles ?? t.docPaths ?? []).map((p) => `brand/${slug}/${p}`);
  return {
    id: ctx.id,
    name: t.name,
    description: t.description ? subst(t.description, slug) : "",
    deliverable: t.deliverable ? subst(t.deliverable, slug) : "",
    ...(t.extra ?? {}),
    depends_on: null,
    owner: "Sancho",
    status: "todo",
    channel: t.channel,
    type: t.type,
    skill: subst(t.skill, slug),
    agent: t.agent,
    deliverable_file: rel.length === 1 ? rel[0] : rel,
    output_files: t.outputFiles?.map((p) => subst(p, slug)),
  };
}

export interface OwnerCheckFinding {
  section: string;
  taskId: string;
  skill: string;
  declaredAgent: string;
  ownerAgent: string | undefined;
}

/**
 * Owner-check (SAN-166 guard): every non-templated task whose skill has a known
 * owner must declare that owner as its `agent`. Returns mismatches (empty = ok).
 */
export function ownerCheckFindings(): OwnerCheckFinding[] {
  const findings: OwnerCheckFinding[] = [];
  for (const [section, set] of Object.entries(MANIFEST_TASK_SETS)) {
    for (const t of set.tasks) {
      if (t.skillTemplated || t.skill.includes("{")) continue;
      const owner = resolveAgentForSkill(t.skill);
      if (owner && owner !== t.agent) {
        findings.push({ section, taskId: t.id, skill: t.skill, declaredAgent: t.agent, ownerAgent: owner });
      }
    }
  }
  // Chat-opener button entries are validated the same way.
  for (const [key, entry] of Object.entries(MANIFEST_CHAT_ENTRIES)) {
    if (entry.skill.includes("{")) continue;
    const owner = resolveAgentForSkill(entry.skill);
    if (owner && owner !== entry.agent) {
      findings.push({ section: "chatEntries", taskId: key, skill: entry.skill, declaredAgent: entry.agent, ownerAgent: owner });
    }
  }
  return findings;
}
