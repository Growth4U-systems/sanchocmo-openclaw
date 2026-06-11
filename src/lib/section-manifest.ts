// ============================================================
// Section Task Manifests (SAN-167 F1)
// ============================================================
// Declarative, deterministic seed of the predefined tasks/documents
// for each Mission Control section (content, outreach, meeting, …).
// Each task co-locates its owner `agent` with its `skill` and canonical
// `docPath`, so routing no longer depends on the indirect SKILL_OWNER_MAP
// lookup (the indirection that caused SAN-166: channel-strategy docs
// falling back to Sancho instead of Dulcinea).
//
// CLIENT-SAFE: imports JSON only — no fs/path. Mirrors pillar-doc-paths.ts.
// The section UIs render from here and clients/create.ts seeds from here,
// instead of the hardcoded task arrays in api/content-creation/create-project.ts.
// ============================================================

import { resolveAgentForSkill } from "./skill-resolver";
import contentManifest from "../../config/sections/content.json";

export interface SectionTask {
  /** Stable id, unique within the section. */
  id: string;
  /** Human-facing task/document name. */
  name: string;
  /** Skill that runs the task. May contain `{slug}` when `skillTemplated`. */
  skill: string;
  /** Set when `skill` is a per-brand template (e.g. `{slug}-visual-generator`)
   *  and therefore can't be looked up statically in SKILL_OWNER_MAP. */
  skillTemplated?: boolean;
  /** Owner agent slug — the single source of truth for dispatch. */
  agent: string;
  /** Canonical output path relative to `brand/{slug}/`. May contain
   *  `{slug}` and (for `perChannel` tasks) `{channel}`. */
  docPath: string;
  /** Task ids in the same section this one depends on. */
  dependsOn: string[];
  /** When true, the task is instantiated once per active channel, with
   *  `{channel}` substituted in `docPath`. */
  perChannel?: boolean;
}

export interface SectionManifest {
  section: string;
  label: string;
  tasks: SectionTask[];
}

/** All section manifests, keyed by section. Add sections here as they migrate. */
export const SECTION_MANIFESTS: Record<string, SectionManifest> = {
  content: contentManifest as unknown as SectionManifest,
};

export function getSectionManifest(section: string): SectionManifest | undefined {
  return SECTION_MANIFESTS[section];
}

/** A task instance with `{slug}`/`{channel}` placeholders resolved. */
export interface ResolvedSectionTask extends Omit<SectionTask, "docPath" | "skill"> {
  skill: string;
  docPath: string;
  /** Present when the task was expanded from a `perChannel` template. */
  channel?: string;
}

/**
 * Resolve a section's tasks for a concrete brand. Substitutes `{slug}` in
 * skill + docPath, and expands `perChannel` tasks once per channel in
 * `opts.channels` (substituting `{channel}`). Non-perChannel tasks pass through
 * once. Returns [] for an unknown section.
 */
export function resolveSectionTasks(
  section: string,
  slug: string,
  opts: { channels?: string[] } = {},
): ResolvedSectionTask[] {
  const manifest = SECTION_MANIFESTS[section];
  if (!manifest) return [];
  const channels = opts.channels ?? [];

  const out: ResolvedSectionTask[] = [];
  for (const task of manifest.tasks) {
    const skill = task.skill.replace(/\{slug\}/g, slug);
    if (task.perChannel) {
      for (const channel of channels) {
        out.push({
          ...task,
          skill,
          channel,
          docPath: task.docPath.replace(/\{slug\}/g, slug).replace(/\{channel\}/g, channel),
        });
      }
    } else {
      out.push({ ...task, skill, docPath: task.docPath.replace(/\{slug\}/g, slug) });
    }
  }
  return out;
}

export interface OwnerCheckFinding {
  section: string;
  taskId: string;
  skill: string;
  declaredAgent: string;
  ownerAgent: string | undefined;
}

/**
 * Owner-check: for every task whose skill is statically known (not templated)
 * and has an owner in SKILL_OWNER_MAP, assert the declared `agent` equals that
 * owner. Returns the mismatches (empty = healthy). This is the guard that would
 * have caught SAN-166 — it makes "the agent declared on the task" and "the
 * agent that owns the skill" provably consistent.
 */
export function ownerCheckFindings(): OwnerCheckFinding[] {
  const findings: OwnerCheckFinding[] = [];
  for (const manifest of Object.values(SECTION_MANIFESTS)) {
    for (const task of manifest.tasks) {
      if (task.skillTemplated || task.skill.includes("{")) continue;
      const owner = resolveAgentForSkill(task.skill);
      if (owner && owner !== task.agent) {
        findings.push({
          section: manifest.section,
          taskId: task.id,
          skill: task.skill,
          declaredAgent: task.agent,
          ownerAgent: owner,
        });
      }
    }
  }
  return findings;
}
