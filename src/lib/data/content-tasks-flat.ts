import fs from "fs";
import path from "path";
import { BASE } from "@/lib/data/paths";
import type { ContentTask, ContentTaskStatus } from "@/types";

/** Discovery-phase fields copied from a legacy idea record onto a unified CT. */
const IDEA_DISCOVERY_FIELDS = [
  "title", "pillar_id", "content_type", "target_channel",
  "signal", "angle_draft", "pov_confidence", "signal_type", "source_signals",
  "dispatch_date", "dispatch_slot",
  // Repurposing lineage (SAN-141) — written by content-atomizer on the idea.
  "derived_from",
  // Founder-Led persona assignment (SAN-163) — set on the idea via the Ideas
  // PATCH endpoint; must survive into the unified CT so the channel aggregator
  // and the Ideas pool can group/filter by author.
  "author",
  "approved_via", "approved_by",
  "archived_at", "archived_via", "archived_by",
  "deferred_by", "target_date",
  // Routing pointers used by the Idea Tab to deep-link into the draft editor.
  // For nested CTs these often duplicate `id`/`parent_task_id`; for orphans
  // they're typically absent until the CT graduates to Approved.
  "content_task_id", "content_task_channels", "project_task_id", "project_id",
] as const;

/**
 * Flat-file storage for ContentTasks. Single source of truth at
 * `brand/{slug}/content/content-tasks.json`.
 *
 * Replaces the nested model where ContentTasks lived inside
 * `tasks[].content_tasks[]` arrays in each project's `tasks.json`. After the
 * migration (Phase 2 of the unification plan), every ContentTask — including
 * orphans (status=New, no parent yet) — lives in this single flat list per
 * brand. The relationship to a parent Task is preserved via the optional
 * `parent_task_id` reference.
 */

function contentTasksFile(slug: string): string {
  return path.join(BASE, "brand", slug, "content", "content-tasks.json");
}

export function loadAllContentTasks(slug: string): ContentTask[] {
  const filePath = contentTasksFile(slug);
  if (!fs.existsSync(filePath)) return [];
  try {
    const raw = JSON.parse(fs.readFileSync(filePath, "utf-8")) as ContentTask[];
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

export function saveAllContentTasks(slug: string, tasks: ContentTask[]): void {
  const filePath = contentTasksFile(slug);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(tasks, null, 2));
}

export function findContentTaskById(slug: string, id: string): ContentTask | null {
  return loadAllContentTasks(slug).find((c) => c.id === id) || null;
}

/**
 * Insert or replace a ContentTask by id. Returns the saved record. Caller is
 * responsible for stamping `updated_at`.
 */
export function upsertContentTask(slug: string, ct: ContentTask): ContentTask {
  const all = loadAllContentTasks(slug);
  const idx = all.findIndex((c) => c.id === ct.id);
  if (idx >= 0) all[idx] = ct;
  else all.push(ct);
  saveAllContentTasks(slug, all);
  return ct;
}

/** Filter by status — primary entrypoint for the Idea Tab. */
export function listContentTasksByStatus(
  slug: string,
  status?: ContentTaskStatus,
): ContentTask[] {
  const all = loadAllContentTasks(slug);
  if (!status) return all;
  return all.filter((c) => c.status === status);
}

/** Filter by parent task — replaces the old nested `listContentTasks(slug, parentTaskId)`. */
export function listContentTasksByParent(
  slug: string,
  parentTaskId: string,
): ContentTask[] {
  return loadAllContentTasks(slug).filter((c) => c.parent_task_id === parentTaskId);
}

/** Counts by status for filter badges. */
export function contentTaskCountsByStatus(slug: string): Record<ContentTaskStatus, number> & { total: number } {
  const all = loadAllContentTasks(slug);
  const counts: Record<string, number> = {
    New: 0, Approved: 0, Draft: 0, "Pending Media": 0,
    Ready: 0, Published: 0, Discarded: 0, Deferred: 0,
  };
  for (const c of all) counts[c.status] = (counts[c.status] || 0) + 1;
  return { ...(counts as Record<ContentTaskStatus, number>), total: all.length };
}

/**
 * Transitional helper used while the dispatch flow + skills still write to
 * the legacy `idea-queue.json` and nested `tasks[].content_tasks[]` arrays.
 * Merges those two sources in-memory each call so the Idea Tab always sees
 * fresh data without requiring all writers to migrate first.
 *
 * Once Phase 5 lands (writers go directly to `content-tasks.json`), this
 * function can be replaced by a plain `loadAllContentTasks(slug)` and removed.
 */
export function loadUnifiedContentTasks(slug: string): ContentTask[] {
  const ideaPath = path.join(BASE, "brand", slug, "content", "idea-queue.json");
  const rawIdeas: Record<string, unknown>[] = (() => {
    if (!fs.existsSync(ideaPath)) return [];
    try {
      const data = JSON.parse(fs.readFileSync(ideaPath, "utf-8"));
      // Canonical shape is a bare array; tolerate `{ "ideas": [...] }` so a
      // misbehaving cron writer doesn't silently empty the Ideas tab.
      if (Array.isArray(data)) return data;
      if (data && Array.isArray((data as { ideas?: unknown }).ideas)) {
        return (data as { ideas: Record<string, unknown>[] }).ideas;
      }
      return [];
    } catch {
      return [];
    }
  })();

  // Collect nested CTs from each project's tasks.json.
  const nestedCTs: ContentTask[] = [];
  const projectsRoot = path.join(BASE, "brand", slug, "projects");
  if (fs.existsSync(projectsRoot)) {
    for (const proj of fs.readdirSync(projectsRoot, { withFileTypes: true })) {
      if (!proj.isDirectory()) continue;
      const tasksPath = path.join(projectsRoot, proj.name, "tasks.json");
      if (!fs.existsSync(tasksPath)) continue;
      try {
        const tasks = JSON.parse(fs.readFileSync(tasksPath, "utf-8"));
        if (!Array.isArray(tasks)) continue;
        for (const t of tasks) {
          if (!Array.isArray(t.content_tasks)) continue;
          for (const ct of t.content_tasks as ContentTask[]) {
            nestedCTs.push({ ...ct, parent_task_id: ct.parent_task_id || t.id });
          }
        }
      } catch { /* skip malformed */ }
    }
  }

  const ctsByIdeaId = new Map<string, ContentTask>();
  for (const ct of nestedCTs) {
    if (ct.idea_id) ctsByIdeaId.set(ct.idea_id, ct);
  }

  const seen = new Set<string>();
  const out: ContentTask[] = [];

  for (const idea of rawIdeas) {
    const ideaId = String(idea.id);
    if (!ideaId) continue;
    const matched = ctsByIdeaId.get(ideaId);
    let ct: ContentTask;
    if (matched) {
      // CT is more authoritative (status, drafts, threads). Enrich with idea
      // discovery fields where the CT has none.
      ct = { ...matched } as ContentTask;
      const ctRecord = ct as unknown as Record<string, unknown>;
      for (const k of IDEA_DISCOVERY_FIELDS) {
        if (ctRecord[k] === undefined && idea[k] !== undefined) ctRecord[k] = idea[k];
      }
      if (!ct.idea_id) ct.idea_id = ideaId;
      if (!ct.documents) ct.documents = [];
      if (!ct.target_channels?.length) {
        ct.target_channels = idea.target_channel ? [String(idea.target_channel)] : [];
      }
      if (!ct.created_at) ct.created_at = String(idea.created_at || new Date().toISOString());
      if (!ct.name) ct.name = String(idea.title || (idea.angle_draft as string || "").slice(0, 80) || ideaId);
    } else {
      // Orphan CT — never reached approval, lives only as an idea.
      ct = {
        id: ideaId,
        idea_id: ideaId,
        name: String(idea.title || (idea.angle_draft as string || "").slice(0, 80) || ideaId),
        status: (idea.status as ContentTaskStatus) || "New",
        target_channels: idea.target_channel ? [String(idea.target_channel)] : [],
        documents: [],
        created_at: String(idea.created_at || new Date().toISOString()),
      };
      const ctRecord = ct as unknown as Record<string, unknown>;
      for (const k of IDEA_DISCOVERY_FIELDS) {
        if (idea[k] !== undefined) ctRecord[k] = idea[k];
      }
      if (idea.approved_at) ct.approved_at = String(idea.approved_at);
      if (idea.deferred_at) ct.deferred_at = String(idea.deferred_at);
      if (idea.published_at) ct.published_at = String(idea.published_at);
    }
    if (seen.has(ct.id)) continue;
    seen.add(ct.id);
    out.push(ct);
  }

  // Pass 2: nested CTs not linked to any idea (defensive — should be rare).
  for (const ct of nestedCTs) {
    if (ct.idea_id && ctsByIdeaId.has(ct.idea_id)) continue;
    if (seen.has(ct.id)) continue;
    seen.add(ct.id);
    out.push(ct);
  }

  return out;
}

/**
 * Resolve a unique id given a candidate. If `desired` collides with an
 * existing CT, append `-b`, `-c`, ... until free. Mirrors the dedup pattern
 * the POST `/api/content-engine/ideas` endpoint uses.
 */
export function resolveUniqueContentTaskId(slug: string, desired: string): string {
  const ids = new Set(loadAllContentTasks(slug).map((c) => c.id));
  if (!ids.has(desired)) return desired;
  for (let n = 2; ; n++) {
    const candidate = `${desired}-${String.fromCharCode(96 + n)}`;
    if (!ids.has(candidate)) return candidate;
  }
}
