/**
 * doc-owner.ts — Resolve the agent that AUTHORED a brand doc (SAN-148).
 *
 * Client feedback on a shared deliverable is processed by the agent that
 * produced the doc (product decision, SAN-148), not by a fixed triage
 * agent. Resolution order:
 *
 *   1. Task that owns the doc (deliverable_file / output_files /
 *      documents[].path / attachments[].path, tolerant of the brand
 *      prefix, the `.commented` sibling and the md/html canonical pair
 *      SAN-149) → task.agent, else task.skill → SKILL_OWNER_MAP.
 *   2. Foundation pillar whose conventional doc path matches
 *      (PILLAR_DOC_PATHS) → pillar skill → SKILL_OWNER_MAP.
 *   3. Default: "sancho".
 *
 * Also resolves the MC chat thread where notifications about the doc
 * should surface: the task's `mc_chat_thread_id` when present, else the
 * convergent thread id from chat-openers, else a doc-scoped feedback
 * thread.
 */

import { buildPillarThread, buildTaskThread } from "@/lib/chat-openers";
import { getOriginalDocPath } from "@/lib/comments-file";
import { listUnifiedTaskRowsAsync, type UnifiedTaskRow } from "@/lib/data/tasks";
import { resolveAgentForSkill, resolveSkillForPillar } from "@/lib/skill-resolver";
import { PILLAR_DOC_PATHS } from "@/lib/pillar-doc-paths";

export interface DocAuthorResolution {
  agent: string;
  skill: string | null;
  taskId: string | null;
  pillar: string | null;
  /** MC chat thread where the doc's conversation lives. */
  threadId: string;
  threadName: string;
}

function docSlugOf(docPath: string): string {
  return docPath.replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase();
}

/**
 * Build every string form under which a doc may be referenced by a task:
 * with/without `brand/{slug}/`, original (not `.commented`), and the
 * md/html canonical sibling (SAN-149).
 */
function pathVariants(slug: string, docPath: string): Set<string> {
  const variants = new Set<string>();
  const add = (p: string) => {
    const norm = p.replace(/^\/+/, "");
    variants.add(norm);
    variants.add(norm.startsWith(`brand/${slug}/`) ? norm.slice(`brand/${slug}/`.length) : norm);
    variants.add(norm.startsWith("brand/") ? norm : `brand/${slug}/${norm}`);
  };
  const original = getOriginalDocPath(docPath);
  add(original);
  if (/\.md$/i.test(original)) add(original.replace(/\.md$/i, ".html"));
  if (/\.html$/i.test(original)) add(original.replace(/\.html$/i, ".md"));
  return variants;
}

function taskOwnsDoc(task: UnifiedTaskRow, variants: Set<string>): boolean {
  const matches = (candidate: unknown): boolean => {
    if (!candidate) return false;
    if (typeof candidate === "string") {
      const c = candidate.replace(/^\/+/, "").replace(/\/$/, "");
      if (variants.has(c)) return true;
      // Directory-style deliverables (content drafts): the doc lives under
      // the declared dir.
      for (const v of variants) {
        if (v.startsWith(`${c}/`)) return true;
      }
      return false;
    }
    if (Array.isArray(candidate)) return candidate.some(matches);
    if (typeof candidate === "object") {
      return matches((candidate as { path?: unknown }).path);
    }
    return false;
  };

  return (
    matches(task.deliverable_file) ||
    matches(task.output_files) ||
    matches(task.documents) ||
    matches(task.attachments)
  );
}

/** Reverse lookup: which Foundation pillar conventionally writes this doc. */
function pillarForDoc(slug: string, docPath: string): string | null {
  const original = getOriginalDocPath(docPath)
    .replace(/^\/+/, "")
    .replace(new RegExp(`^brand/${slug}/`), "")
    .replace(/\.html$/i, ".md");
  for (const [pillarKey, paths] of Object.entries(PILLAR_DOC_PATHS)) {
    if (paths.some((p) => p === original)) return pillarKey;
  }
  return null;
}

export async function resolveDocAuthor(
  slug: string,
  docPath: string,
): Promise<DocAuthorResolution> {
  const variants = pathVariants(slug, docPath);

  let tasks: UnifiedTaskRow[] = [];
  try {
    tasks = await listUnifiedTaskRowsAsync(slug);
  } catch {
    // tasks backend unavailable — fall through to pillar/default resolution
  }

  const owner = tasks.find((t) => taskOwnsDoc(t, variants));
  if (owner) {
    const skill = (owner.skill as string | undefined) || null;
    const agent =
      (owner.agent as string | undefined) ||
      resolveAgentForSkill(skill || undefined) ||
      resolveAgentForSkill(resolveSkillForPillar(owner.pillar as string | undefined)) ||
      "sancho";
    const thread = buildTaskThread(
      slug,
      owner.id,
      owner.name || owner.id,
      (owner.project_id as string | undefined) || (owner.parent_id as string | undefined) || "",
      {
        taskSkill: skill || undefined,
        taskStatus: owner.status,
        pillar: owner.pillar as string | undefined,
        deliverableFile:
          typeof owner.deliverable_file === "string" ? owner.deliverable_file : undefined,
      },
    );
    return {
      agent,
      skill,
      taskId: owner.id,
      pillar: (owner.pillar as string | undefined) || null,
      threadId: (owner.mc_chat_thread_id as string | undefined) || thread.threadId,
      threadName: thread.threadName,
    };
  }

  const pillar = pillarForDoc(slug, docPath);
  if (pillar) {
    const thread = buildPillarThread(slug, pillar, docPath);
    const skill = resolveSkillForPillar(pillar) || thread.skill || null;
    const agent = thread.agent || resolveAgentForSkill(skill || undefined) || "sancho";
    return {
      agent,
      skill,
      taskId: null,
      pillar,
      threadId: thread.threadId,
      threadName: thread.threadName,
    };
  }

  return {
    agent: "sancho",
    skill: null,
    taskId: null,
    pillar: null,
    threadId: `${slug}:feedback:${docSlugOf(getOriginalDocPath(docPath))}`,
    threadName: `Feedback ${getOriginalDocPath(docPath).split("/").pop() || docPath}`,
  };
}
