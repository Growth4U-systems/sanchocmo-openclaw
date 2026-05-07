import fs from "fs";
import path from "path";
import { BASE } from "@/lib/data/paths";
import type { ContentTask, ContentTaskStatus } from "@/types";

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
