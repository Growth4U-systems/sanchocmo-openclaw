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
  /** Human owner override (default "Sancho") — e.g. integration tasks owned by "Usuario". */
  owner?: string;
  /** Foundation pillar this task covers 1:1 (SAN-183 F5). */
  pillar?: string;
  /** Foundation section of the pillar (SAN-183 F5). */
  section?: string;
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
  /** Verbatim cross-project task ids this depends on (e.g. "P00-FUL-T09"). */
  dependsOnExternal?: string[];
  /** Verbatim passthrough fields merged onto the seeded task (e.g. done_criteria). */
  extra?: Record<string, unknown>;
}

export interface TaskSet {
  label: string;
  /** Foundation sets (SAN-183 F5): task ids become `{idPrefix}-{taskKey}` (e.g. P00-FUL-T01). */
  idPrefix?: string;
  /** Foundation sets (SAN-183 F5): the project.json this set seeds, verbatim. */
  project?: Record<string, unknown> & { id: string; name: string };
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

/**
 * One entry of the single namespace registry (SAN-205) — the data behind BOTH
 * thread directions, replacing the old `chatEntries` block AND the hardcoded
 * fallbacks in resolveFullThreadConfig.
 *
 * Two flavours, distinguished by whether `threadId` is present:
 *   - OPENER (has `threadId`): an on-demand chat-opener BUTTON. String fields
 *     are templates with `{slug}` + per-button `{params}`; instantiateNamespace
 *     (chat-openers.ts) substitutes them into a ThreadConfig. Agent is explicit
 *     and validated by ownerCheckFindings.
 *   - REOPEN-ONLY (no `threadId`): a namespace whose threads are only ever
 *     re-opened from the thread list (content/idea/calendar/cron/project/scan/
 *     strategy/recurring). Only owner fields + reopen hints are declared.
 *
 * Reopen matching uses `nsKey` + `match`:
 *   - "exact":  shortId === nsKey
 *   - "prefix": shortId starts with `nsKey:` or `nsKey-` (longest nsKey wins)
 * `reopenLinkedTo` templates {rest}/{restUpper}; `reopenName: "restUpper"`
 * upper-cases the captured rest for the thread name (project threads).
 */
export interface NamespaceOwner {
  skill: string;
  skills: string[];
  agent?: string;
  /**
   * Thread scope (SAN-327). Absent or `"skill"` = narrow single-skill thread
   * (current behavior). `"agent"` = broad thread: the owning agent may use ANY
   * of its own skills here — send.ts widens skills[] to the agent's full owned
   * set and the gateway frames the seed skill as a starting suggestion.
   */
  scope?: "agent" | "skill";
  /** Reopen matching. */
  nsKey: string;
  match: "exact" | "prefix";
  reopenLinkedTo: string;
  reopenName?: "restUpper";
  /** OPENER-only template fields (present iff this namespace has a button). */
  threadId?: string;
  threadName?: string;
  linkedTo?: string;
  docPath?: string | null;
  threadState?: "create" | "continue";
  initialMessage?: string;
  quickActions?: Array<{ label: string; prompt: string }>;
  docKind?: "file" | "template";
}

export const MANIFEST_NAMESPACE_OWNERS = (
  pillarManifest as unknown as { namespaceOwners?: Record<string, NamespaceOwner> }
).namespaceOwners ?? {};

export function getNamespaceOwner(key: string): NamespaceOwner | undefined {
  return MANIFEST_NAMESPACE_OWNERS[key];
}

/** Namespace owners sorted by nsKey length DESC — so longest-prefix wins when
 *  matching a shortId (e.g. `skill-creator` before `skill`). */
export const NAMESPACE_OWNERS_BY_SPECIFICITY: ReadonlyArray<NamespaceOwner> =
  Object.values(MANIFEST_NAMESPACE_OWNERS).sort((a, b) => b.nsKey.length - a.nsKey.length);

/**
 * SAN-179 — opener (initialMessage) snippets for threads whose IDENTITY is
 * built by the builder's own logic (not a full chatEntry): html conversion
 * and Meeting Intelligence setup. Flat `key → templated string`;
 * resolveOpener(key, vars) in chat-openers.ts substitutes {slug}+{params}.
 * No agent — these are not thread declarations.
 */
export const MANIFEST_THREAD_OPENERS = (
  pillarManifest as unknown as { threadOpeners?: Record<string, string> }
).threadOpeners ?? {};

export function getThreadOpener(key: string): string | undefined {
  return MANIFEST_THREAD_OPENERS[key];
}

/** Defaults for ad-hoc / idea-driven tasks, keyed by task type (outreach|content). */
export interface TaskDefault {
  skill: string;
  channel: string;
  agent: string;
  ideaType: string;
  ideaList: string;
}

const MANIFEST_TASK_DEFAULTS = (
  pillarManifest as unknown as { taskDefaults?: { byType?: Record<string, TaskDefault> } }
).taskDefaults?.byType ?? {};

/** Default skill/channel/agent for a task type. Falls back to "content". */
export function getTaskDefault(type: string): TaskDefault {
  return MANIFEST_TASK_DEFAULTS[type] ?? MANIFEST_TASK_DEFAULTS.content;
}

/** Ordered skill pipeline (e.g. the outreach prospecting pipeline). */
export interface Pipeline {
  agent: string;
  stages: string[];
}

const MANIFEST_PIPELINES = (
  pillarManifest as unknown as { pipelines?: Record<string, Pipeline> }
).pipelines ?? {};

export function getPipeline(name: string): Pipeline | undefined {
  return MANIFEST_PIPELINES[name];
}

const subst = (s: string, slug: string, projectId?: string, channel?: string): string =>
  s
    .replace(/\{slug\}/g, slug)
    .replace(/\{projectId\}/g, projectId ?? "")
    .replace(/\{channel\}/g, channel ?? "");

/** Format `depends_on` like the legacy seeder: [] → null, [x] → x, [x,y] → [x,y].
 *  `external` are verbatim cross-project ids (dependsOnExternal), appended as-is. */
function formatDependsOn(
  deps: string[],
  keyById: Map<string, string>,
  projectId: string,
  external: string[] = [],
): null | string | string[] {
  const ids = deps.map((d) => {
    const key = keyById.get(d);
    if (!key) throw new Error(`task-blueprints: dependsOn references unknown task "${d}"`);
    return `${projectId}-${key}`;
  });
  const all = [...ids, ...external];
  if (all.length === 0) return null;
  if (all.length === 1) return all[0];
  return all;
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
    const skill = subst(t.skill, slug, projectId);

    return {
      id: `${projectId}-${t.taskKey}`,
      name: t.name,
      description: t.description ? subst(t.description, slug, projectId) : "",
      // Conditional keys: absent (not `undefined`) when undeclared, so seeded
      // tasks.json stays clean and goldens can assert exact key presence.
      ...(t.phase !== undefined ? { phase: t.phase } : {}),
      type: t.type,
      channel: t.channel,
      niche: null,
      status: "todo",
      deliverable: t.deliverable ? subst(t.deliverable, slug, projectId) : "",
      // Tasks without files (type integration/execution) omit deliverable_file
      // entirely — requireTaskAnchors exempts those types.
      ...(rel.length > 0 ? { deliverable_file: rel.length === 1 ? rel[0] : rel } : {}),
      ...(t.outputFiles ? { output_files: t.outputFiles } : {}),
      depends_on: formatDependsOn(t.dependsOn ?? [], keyById, projectId, t.dependsOnExternal ?? []),
      owner: t.owner ?? "Sancho",
      skill,
      agent: t.agent,
      ...(t.pillar ? { pillar: t.pillar } : {}),
      ...(t.section ? { section: t.section } : {}),
      mc_chat_thread_id: `task-${projectId.toLowerCase()}-${t.taskKey.toLowerCase()}`,
      ...(t.extra ?? {}),
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

// ============================================================
// Foundation (SAN-183 F5) — pillars as 1:1 tasks
// ============================================================

/** The five seeded Foundation projects, in dependency order. */
export const FOUNDATION_TASK_SET_KEYS = [
  "foundation-cb",
  "foundation-site-audit",
  "foundation-full",
  "foundation-metrics",
  "foundation-sp",
] as const;

export interface FoundationPillarDecl {
  key: string;
  layer?: number;
  optional?: boolean;
  /** The task that covers this pillar 1:1: `{idPrefix}-{taskKey}` of the set entry. */
  task: { set: string; id: string };
}

export interface FoundationSection {
  key: string;
  layer: number;
  pillars: FoundationPillarDecl[];
}

const MANIFEST_FOUNDATION = (
  pillarManifest as unknown as { foundation?: { sections?: FoundationSection[] } }
).foundation?.sections ?? [];

/** The Foundation structure: ordered sections → pillars + task binding. */
export function getFoundationManifest(): FoundationSection[] {
  return MANIFEST_FOUNDATION;
}

/** Locate a Foundation pillar declaration (and its section) by pillar key. */
export function findFoundationPillar(
  key: string,
): { section: FoundationSection; pillar: FoundationPillarDecl } | undefined {
  for (const section of MANIFEST_FOUNDATION) {
    const pillar = section.pillars.find((p) => p.key === key);
    if (pillar) return { section, pillar };
  }
  return undefined;
}

/** Concrete task id (`{idPrefix}-{taskKey}`) covering a Foundation pillar. */
export function foundationTaskIdForPillar(key: string): string | undefined {
  const found = findFoundationPillar(key);
  if (!found) return undefined;
  const set = getTaskSet(found.pillar.task.set);
  const entry = set?.tasks.find((t) => t.id === found.pillar.task.id);
  if (!set?.idPrefix || !entry?.taskKey) return undefined;
  return `${set.idPrefix}-${entry.taskKey}`;
}

/**
 * Instantiate one seeded Foundation project (project.json + tasks.json
 * contents) from its task set. Pure — the consumer writes to disk and applies
 * anchors. Task ids use the set's `idPrefix` (e.g. P00-FUL-T01), preserving
 * the legacy ids from scripts/reseed-foundation.sh.
 */
export function instantiateFoundationProject(
  setKey: string,
  ctx: { slug: string },
): { project: Record<string, unknown> & { id: string; name: string }; tasks: TaskCreateInput[] } {
  const set = getTaskSet(setKey);
  if (!set) throw new Error(`task-blueprints: unknown task set "${setKey}"`);
  if (!set.project || !set.idPrefix) {
    throw new Error(`task-blueprints: task set "${setKey}" declares no project/idPrefix`);
  }
  return {
    project: { ...set.project },
    tasks: instantiateTaskSet(setKey, { slug: ctx.slug, projectId: set.idPrefix }),
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
  // Chat-opener BUTTON entries (those with a threadId template) are validated
  // the same way. Reopen-only namespaces (no threadId, no explicit agent) are
  // not buttons — their owner is derived on reopen, so they're skipped here.
  for (const [key, entry] of Object.entries(MANIFEST_NAMESPACE_OWNERS)) {
    if (!entry.threadId || entry.agent === undefined) continue;
    if (entry.skill.includes("{")) continue;
    const owner = resolveAgentForSkill(entry.skill);
    if (owner && owner !== entry.agent) {
      findings.push({ section: "namespaceOwners", taskId: key, skill: entry.skill, declaredAgent: entry.agent, ownerAgent: owner });
    }
  }
  // Type defaults: skill's owner must match the declared agent.
  for (const [type, d] of Object.entries(MANIFEST_TASK_DEFAULTS)) {
    const owner = resolveAgentForSkill(d.skill);
    if (owner && owner !== d.agent) {
      findings.push({ section: "taskDefaults", taskId: type, skill: d.skill, declaredAgent: d.agent, ownerAgent: owner });
    }
  }
  // Pipelines: every stage skill must be owned by the pipeline's agent.
  for (const [name, p] of Object.entries(MANIFEST_PIPELINES)) {
    for (const skill of p.stages) {
      const owner = resolveAgentForSkill(skill);
      if (owner && owner !== p.agent) {
        findings.push({ section: "pipelines", taskId: `${name}:${skill}`, skill, declaredAgent: p.agent, ownerAgent: owner });
      }
    }
  }
  return findings;
}
