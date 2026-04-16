/**
 * Pillar ↔ Task sync helper
 *
 * Centralized atomic helpers for keeping `foundation-state.json` (pillars) and
 * `<project>/tasks.json` (foundation tasks) in sync.
 *
 * Why this exists:
 *   The two files were drifting because:
 *     1. The status vocabulary was inconsistent — Sancho writes `"done"` to
 *        foundation-state.json directly, but `pillar-status.ts` only accepted
 *        `"approved"` (so calls bypassed the API → no sync ever fired).
 *     2. Each endpoint had its own copy of the mapping logic. They drifted.
 *     3. There was no reconciliation pass for direct file writes.
 *
 * Design:
 *   - One canonical mapping table (`PILLAR_TO_TASK`, `TASK_TO_PILLAR`).
 *   - Status aliases are normalized first (e.g. `done` → `approved`,
 *     `completed` → `approved`).
 *   - Two write entry points (`setPillarStatus`, `setTaskStatus`) that write
 *     BOTH files atomically (best effort — file system is not transactional,
 *     but both writes use safeWriteJSON with backups).
 *   - One reconciliation pass (`reconcilePillarTasks`) that detects drift
 *     between the two files and repairs it. Useful for catching direct file
 *     writes (Sancho) and as a self-healing read-side check.
 *
 * Migration note:
 *   Sancho currently writes to foundation-state.json directly. The reconcile
 *   pass on read catches this. Long-term, Sancho should call POST
 *   /api/foundation/pillar-status instead. See MIGRATION-PENDING.md.
 */

import fs from "fs";
import path from "path";
import { BASE, foundationStateFile } from "@/lib/data/paths";
import { safeWriteJSON } from "@/lib/data/json-io";

// ---------------------------------------------------------------------------
// Status vocabulary
// ---------------------------------------------------------------------------

/** Canonical pillar statuses — what foundation-state.json expects. */
export type CanonicalPillarStatus =
  | "not-started"
  | "in-progress"
  | "pending-review"
  | "generated"
  | "approved"
  | "request-changes"
  | "request-refresh";

/**
 * Canonical task statuses — hardcoded vocabulary (2026-04-15).
 * Mirrors `VALID_TASK_STATUSES` in `src/types/index.ts`.
 * Any write to tasks.json MUST use one of these values.
 */
export type CanonicalTaskStatus =
  | "todo"
  | "in-progress"
  | "completed"
  | "blocked"
  | "cancelled";

/**
 * Normalize any incoming status string into a canonical pillar status.
 * Handles aliases like `done` → `approved`, `completed` → `approved`,
 * `pending` → `not-started`.
 */
export function normalizePillarStatus(input: string): CanonicalPillarStatus {
  const s = (input || "").trim().toLowerCase();
  switch (s) {
    // Aliases that mean "approved/completed"
    case "done":
    case "completed":
    case "complete":
    case "approved":
      return "approved";

    case "in-progress":
    case "in_progress":
    case "inprogress":
    case "running":
    case "active":
    case "lite": // Fast Foundation: lite version of doc exists but not full
      return "in-progress";

    case "pending-review":
    case "pending_review":
    case "review":
      return "pending-review";

    case "generated":
      return "generated";

    case "request-changes":
    case "request_changes":
    case "changes-requested":
      return "request-changes";

    case "request-refresh":
    case "request_refresh":
    case "refresh-requested":
      return "request-refresh";

    case "not-started":
    case "not_started":
    case "notstarted":
    case "todo":
    case "pending":
    case "":
      return "not-started";

    default:
      // Unknown — fall back to not-started rather than corrupting state.
      return "not-started";
  }
}

/**
 * Normalize any incoming status into a canonical task status.
 *
 * The canonical set is hardcoded (2026-04-15) — 5 values only. Incoming
 * aliases are mapped to the closest canonical. Ambiguous values like
 * `"ready"` fall to `"todo"` (because `"ready to start"` is closer to
 * `todo` than to `completed`) — but MC's API layer rejects them
 * explicitly with a 400 so callers get a clear error rather than a
 * silent drift.
 */
export function normalizeTaskStatus(input: string): CanonicalTaskStatus {
  const s = (input || "").trim().toLowerCase();
  switch (s) {
    case "done":
    case "completed":
    case "complete":
    case "approved":
    case "finished":
      return "completed";

    case "in-progress":
    case "in_progress":
    case "inprogress":
    case "pending-review":
    case "pending_review":
    case "review":
    case "generated":
    case "lite":
    case "running":
    case "active":
    case "wip":
      return "in-progress";

    case "blocked":
      return "blocked";

    case "cancelled":
    case "canceled":
    case "discarded":
    case "rejected":
      return "cancelled";

    case "todo":
    case "pending":
    case "ready":
    case "not-started":
    case "not_started":
    case "new":
    case "":
      return "todo";

    default:
      return "todo";
  }
}

/** Pillar status → matching task status. */
export function pillarStatusToTaskStatus(pillar: string): CanonicalTaskStatus {
  const normalized = normalizePillarStatus(pillar);
  switch (normalized) {
    case "approved":
      return "completed";
    case "in-progress":
    case "pending-review":
    case "generated":
      return "in-progress";
    case "not-started":
    case "request-changes":
    case "request-refresh":
    default:
      return "todo";
  }
}

/** Task status → matching pillar status. */
export function taskStatusToPillarStatus(task: string): CanonicalPillarStatus {
  const normalized = normalizeTaskStatus(task);
  switch (normalized) {
    case "completed":
      return "approved";
    case "in-progress":
      return "in-progress";
    case "todo":
    default:
      return "not-started";
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

type AnyRecord = Record<string, unknown>;

/** Find a project directory inside `brand/<slug>/projects/`. */
function findProjectDirByPrefix(projectsDir: string, prefix: string): string | null {
  if (!fs.existsSync(projectsDir)) return null;
  try {
    const entries = fs.readdirSync(projectsDir, { withFileTypes: true });
    const exact = entries.find((d) => d.isDirectory() && d.name === prefix);
    if (exact) return path.join(projectsDir, exact.name);
    const startsWith = entries.find(
      (d) => d.isDirectory() && d.name.startsWith(prefix + "-")
    );
    return startsWith ? path.join(projectsDir, startsWith.name) : null;
  } catch {
    return null;
  }
}

/** List all project directories under `brand/<slug>/projects/`. */
function listProjectDirs(slug: string): string[] {
  const projectsDir = path.join(BASE, "brand", slug, "projects");
  if (!fs.existsSync(projectsDir)) return [];
  try {
    return fs
      .readdirSync(projectsDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => path.join(projectsDir, d.name));
  } catch {
    return [];
  }
}

/** Read tasks.json (returns the array regardless of file shape). */
function readTasksFile(filePath: string): {
  raw: unknown;
  tasks: AnyRecord[];
} | null {
  if (!fs.existsSync(filePath)) return null;
  try {
    const raw = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    const tasks: AnyRecord[] = Array.isArray(raw)
      ? (raw as AnyRecord[])
      : ((raw as AnyRecord).tasks as AnyRecord[]) || [];
    return { raw, tasks };
  } catch {
    return null;
  }
}

/** Write tasks.json preserving original shape (array vs object-with-tasks). */
function writeTasksFile(filePath: string, raw: unknown, tasks: AnyRecord[]): void {
  const writeData = Array.isArray(raw) ? tasks : { ...(raw as AnyRecord), tasks };
  fs.writeFileSync(filePath, JSON.stringify(writeData, null, 2));
}

/** Mutate a task in place to the given status. Returns true if changed. */
function applyStatusToTask(task: AnyRecord, newStatus: CanonicalTaskStatus): boolean {
  if (task.status === newStatus) return false;
  task.status = newStatus;
  if (newStatus === "completed" && !task.completed) {
    task.completed = new Date().toISOString().slice(0, 10);
  }
  return true;
}

/** Mutate a pillar in place. Returns true if changed. */
function applyStatusToPillar(
  pillar: AnyRecord,
  newStatus: CanonicalPillarStatus
): boolean {
  if (pillar.status === newStatus) return false;
  pillar.status = newStatus;
  pillar.updated_at = new Date().toISOString();
  if (newStatus === "approved" && !pillar.approved_at) {
    pillar.approved_at = new Date().toISOString();
  }
  return true;
}

/** Read foundation-state.json. Returns null if missing/corrupt. */
function readFoundationState(slug: string): AnyRecord | null {
  const file = foundationStateFile(slug);
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, "utf-8"));
  } catch {
    return null;
  }
}

/** Write foundation-state.json with safe write (validation + backup). */
function writeFoundationState(slug: string, state: AnyRecord): void {
  safeWriteJSON(foundationStateFile(slug), state, (d: unknown) => {
    const obj = d as AnyRecord;
    return !!obj.sections;
  });
}

// ---------------------------------------------------------------------------
// Rollup helpers (parent status derived from children)
// ---------------------------------------------------------------------------

/**
 * Compute the rolled-up status of a *section* (foundation-state) from its
 * pillars.
 *
 * Rules:
 *   - all pillars approved          → approved
 *   - none approved/in-progress     → not-started
 *   - any pillar approved/active    → in-progress
 *
 * "Active" = approved | in-progress | pending-review | generated.
 * "request-changes" / "request-refresh" do NOT count as approved (they need work).
 */
function computeSectionStatus(pillars: Record<string, AnyRecord>): CanonicalPillarStatus {
  const entries = Object.values(pillars);
  if (entries.length === 0) return "not-started";

  let approvedCount = 0;
  let activeCount = 0;
  for (const p of entries) {
    const s = normalizePillarStatus((p.status as string) || "not-started");
    if (s === "approved") {
      approvedCount++;
      activeCount++;
    } else if (s === "in-progress" || s === "pending-review" || s === "generated") {
      activeCount++;
    }
  }

  if (approvedCount === entries.length) return "approved";
  if (activeCount > 0) return "in-progress";
  return "not-started";
}

/**
 * Apply rollup to all sections of a foundation state. Mutates in place.
 * Returns the list of sections whose status changed (for logging).
 */
function rollupAllSections(state: AnyRecord): string[] {
  const sections = (state.sections || {}) as Record<string, AnyRecord>;
  const changed: string[] = [];
  for (const [secName, sec] of Object.entries(sections)) {
    const pillars =
      ((sec.pillars as AnyRecord) || (sec.skills as AnyRecord) || {}) as Record<string, AnyRecord>;
    if (Object.keys(pillars).length === 0) continue; // no pillars to roll up from
    const newStatus = computeSectionStatus(pillars);
    const oldStatus = normalizePillarStatus((sec.status as string) || "not-started");
    if (oldStatus !== newStatus) {
      sec.status = newStatus;
      sec.updated_at = new Date().toISOString();
      if (newStatus === "approved" && !sec.approved_at) {
        sec.approved_at = new Date().toISOString();
      }
      changed.push(`${secName}:${oldStatus}->${newStatus}`);
    }
  }
  return changed;
}

/**
 * Compute the rolled-up status of a *project* (project.json) from its tasks.
 *
 * Rules:
 *   - all tasks completed                      → completed
 *   - none completed AND none in-progress      → pending  (or "todo" alias)
 *   - any task completed or in-progress        → in-progress
 *
 * Aligned with the canonical task vocabulary (`todo`, `in-progress`, `completed`).
 * The project file historically uses "pending" for the not-started state; we
 * preserve that label for backward compatibility (UI may key off it).
 */
function computeProjectStatus(tasks: AnyRecord[]): "pending" | "in-progress" | "completed" {
  if (tasks.length === 0) return "pending";

  let completedCount = 0;
  let activeCount = 0;
  for (const t of tasks) {
    const s = normalizeTaskStatus((t.status as string) || "todo");
    if (s === "completed") {
      completedCount++;
      activeCount++;
    } else if (s === "in-progress") {
      activeCount++;
    }
  }

  if (completedCount === tasks.length) return "completed";
  if (activeCount > 0) return "in-progress";
  return "pending";
}

/**
 * Recompute the project.json status for a given project directory based on
 * its tasks.json. Writes only if the status changed. Returns the change log
 * entry, or null if no change.
 *
 * Safe to call repeatedly — it's a no-op when the project status is already
 * in sync with its tasks.
 */
function rollupProjectStatus(projDir: string): string | null {
  const projectPath = path.join(projDir, "project.json");
  const tasksPath = path.join(projDir, "tasks.json");

  if (!fs.existsSync(projectPath) || !fs.existsSync(tasksPath)) return null;

  let projectData: AnyRecord;
  try {
    projectData = JSON.parse(fs.readFileSync(projectPath, "utf-8")) as AnyRecord;
  } catch {
    return null;
  }

  const tasksData = readTasksFile(tasksPath);
  if (!tasksData) return null;

  const newStatus = computeProjectStatus(tasksData.tasks);
  const oldStatus = (projectData.status as string) || "pending";

  // Don't fight UI-managed transitions — only apply if the rollup is more
  // "advanced" than the current status. (Prevents accidentally regressing a
  // project to "pending" when someone manually marked it "in-progress" but
  // the tasks haven't caught up yet.)
  // Order: pending < in-progress < completed.
  const order: Record<string, number> = { pending: 0, "not-started": 0, todo: 0, "in-progress": 1, active: 1, completed: 2, done: 2, approved: 2 };
  const oldRank = order[oldStatus] ?? 0;
  const newRank = order[newStatus] ?? 0;

  // Allow transitions to higher rank, OR transitions back to "pending" only
  // if all tasks are pending (nothing is wrong with going back to baseline).
  if (newStatus === oldStatus) return null;
  if (newRank > oldRank || (newStatus === "pending" && oldRank === 0)) {
    projectData.status = newStatus;
    projectData.updated_at = new Date().toISOString();
    if (newStatus === "completed" && !projectData.completed_at) {
      projectData.completed_at = new Date().toISOString();
    }
    fs.writeFileSync(projectPath, JSON.stringify(projectData, null, 2));
    return `${path.basename(projDir)}:${oldStatus}->${newStatus}`;
  }

  return null;
}

/**
 * Run project status rollup for ALL projects of a slug. Used by reconcile
 * and after any task/pillar mutation.
 */
function rollupAllProjects(slug: string): string[] {
  const changes: string[] = [];
  for (const projDir of listProjectDirs(slug)) {
    const change = rollupProjectStatus(projDir);
    if (change) changes.push(change);
  }
  return changes;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface SyncResult {
  ok: boolean;
  pillarChanged: boolean;
  tasksChanged: number;
  oldStatus?: string;
  newStatus?: string;
  error?: string;
}

/**
 * Set a pillar's status and propagate to matching foundation task(s).
 *
 * Atomically (best effort):
 *   1. Updates `foundation-state.json` → sections[section].pillars[pillar]
 *   2. Finds all matching foundation tasks (`task.pillar === pillar`) across
 *      all projects of the slug and updates their status accordingly.
 *
 * Status input can be any alias (`done`, `completed`, `approved`...) — it is
 * normalized to the canonical pillar vocabulary before write.
 */
export function setPillarStatus(
  slug: string,
  section: string,
  pillar: string,
  status: string,
  opts?: { comment?: string }
): SyncResult {
  const pillarStatus = normalizePillarStatus(status);
  const taskStatus = pillarStatusToTaskStatus(pillarStatus);

  const state = readFoundationState(slug);
  if (!state) {
    return { ok: false, pillarChanged: false, tasksChanged: 0, error: "foundation-state.json not found" };
  }

  const sections = (state.sections || {}) as Record<string, AnyRecord>;
  const sec = sections[section];
  if (!sec) {
    return { ok: false, pillarChanged: false, tasksChanged: 0, error: `Section not found: ${section}` };
  }

  const pillars = ((sec.pillars as AnyRecord) || (sec.skills as AnyRecord) || {}) as Record<string, AnyRecord>;
  const pillarObj = pillars[pillar];
  if (!pillarObj) {
    return { ok: false, pillarChanged: false, tasksChanged: 0, error: `Pillar not found: ${pillar}` };
  }

  const oldStatus = (pillarObj.status as string) || "not-started";
  const pillarChanged = applyStatusToPillar(pillarObj, pillarStatus);
  if (opts?.comment) pillarObj.comment = opts.comment;

  // Roll up section status from its pillars (always — cheap, no-op when in sync).
  const sectionChanges = rollupAllSections(state);

  if (pillarChanged || sectionChanges.length > 0) {
    try {
      writeFoundationState(slug, state);
      if (sectionChanges.length > 0) {
        console.log(`[pillar-task-sync] ${slug}: section rollup applied: ${sectionChanges.join(", ")}`);
      }
    } catch (e) {
      return {
        ok: false,
        pillarChanged: false,
        tasksChanged: 0,
        error: `Failed to write foundation-state: ${(e as Error).message}`,
      };
    }
  }

  // Propagate to matching tasks across all projects of this slug.
  let tasksChanged = 0;
  for (const projDir of listProjectDirs(slug)) {
    const tasksPath = path.join(projDir, "tasks.json");
    const data = readTasksFile(tasksPath);
    if (!data) continue;

    let dirty = false;
    for (const task of data.tasks) {
      if (task.pillar !== pillar) continue;
      // Section is optional; if present, must match.
      if (task.section && task.section !== section) continue;
      if (applyStatusToTask(task, taskStatus)) {
        dirty = true;
        tasksChanged++;
      }
    }
    if (dirty) {
      try {
        writeTasksFile(tasksPath, data.raw, data.tasks);
      } catch (e) {
        console.error("[pillar-task-sync] write tasks failed:", (e as Error).message);
      }
    }
  }

  // Roll up project status from tasks (across all projects of this slug).
  const projectChanges = rollupAllProjects(slug);
  if (projectChanges.length > 0) {
    console.log(`[pillar-task-sync] ${slug}: project rollup applied: ${projectChanges.join(", ")}`);
  }

  return {
    ok: true,
    pillarChanged,
    tasksChanged,
    oldStatus,
    newStatus: pillarStatus,
  };
}

/**
 * Set a foundation task's status and propagate to the matching pillar.
 *
 * Looks up the task by id, updates its status in tasks.json, and if the task
 * has a `pillar` field, updates the corresponding pillar in
 * foundation-state.json.
 */
export function setTaskStatus(
  slug: string,
  taskId: string,
  status: string
): SyncResult {
  const taskStatus = normalizeTaskStatus(status);

  // Find the task across all projects.
  const projectIdGuess = taskId.split("-").slice(0, 1).join("-"); // "P00" from "P00-FUL-T01"
  const projectsDir = path.join(BASE, "brand", slug, "projects");
  const guessedDir = findProjectDirByPrefix(projectsDir, projectIdGuess);

  // Try the guessed dir first, fall back to scanning all.
  const dirsToSearch = guessedDir ? [guessedDir, ...listProjectDirs(slug).filter((d) => d !== guessedDir)] : listProjectDirs(slug);

  for (const projDir of dirsToSearch) {
    const tasksPath = path.join(projDir, "tasks.json");
    const data = readTasksFile(tasksPath);
    if (!data) continue;

    const task = data.tasks.find((t) => t.id === taskId);
    if (!task) continue;

    const oldStatus = (task.status as string) || "todo";
    const changed = applyStatusToTask(task, taskStatus);
    if (changed) {
      try {
        writeTasksFile(tasksPath, data.raw, data.tasks);
      } catch (e) {
        return {
          ok: false,
          pillarChanged: false,
          tasksChanged: 0,
          error: `Failed to write tasks.json: ${(e as Error).message}`,
        };
      }
    }

    // Propagate to pillar if the task has one.
    let pillarChanged = false;
    if (task.pillar) {
      const pillarStatus = taskStatusToPillarStatus(taskStatus);
      const state = readFoundationState(slug);
      if (state) {
        const sections = (state.sections || {}) as Record<string, AnyRecord>;
        let foundPillar = false;

        // Case 1: task has explicit section
        if (task.section && sections[task.section as string]) {
          const sec = sections[task.section as string];
          const pillars = ((sec.pillars as AnyRecord) || (sec.skills as AnyRecord) || {}) as Record<string, AnyRecord>;
          if (pillars[task.pillar as string]) {
            pillarChanged = applyStatusToPillar(pillars[task.pillar as string], pillarStatus) || pillarChanged;
            foundPillar = true;
          }
        }

        // Case 2: pillar name itself matches a section name → update all sub-pillars
        if (!foundPillar && sections[task.pillar as string]) {
          const sec = sections[task.pillar as string];
          const pillars = ((sec.pillars as AnyRecord) || (sec.skills as AnyRecord) || {}) as Record<string, AnyRecord>;
          for (const p of Object.values(pillars)) {
            pillarChanged = applyStatusToPillar(p as AnyRecord, pillarStatus) || pillarChanged;
          }
        }

        // Roll up section status from pillars (always — cheap).
        const sectionChanges = rollupAllSections(state);

        if (pillarChanged || sectionChanges.length > 0) {
          try {
            writeFoundationState(slug, state);
            if (sectionChanges.length > 0) {
              console.log(`[pillar-task-sync] ${slug}: section rollup applied: ${sectionChanges.join(", ")}`);
            }
          } catch (e) {
            console.error("[pillar-task-sync] write foundation-state failed:", (e as Error).message);
          }
        }
      }
    }

    // Roll up project status for THIS project (the one we just touched).
    if (changed) {
      const projectChange = rollupProjectStatus(projDir);
      if (projectChange) {
        console.log(`[pillar-task-sync] ${slug}: project rollup applied: ${projectChange}`);
      }
    }

    return {
      ok: true,
      pillarChanged,
      tasksChanged: changed ? 1 : 0,
      oldStatus,
      newStatus: taskStatus,
    };
  }

  return {
    ok: false,
    pillarChanged: false,
    tasksChanged: 0,
    error: `Task not found: ${taskId}`,
  };
}

// ---------------------------------------------------------------------------
// Reconciliation
// ---------------------------------------------------------------------------

export interface ReconcileEntry {
  taskId: string;
  pillar: string;
  section: string | undefined;
  oldTaskStatus: string;
  newTaskStatus: string;
  pillarStatus: string;
}

export interface ReconcileReport {
  slug: string;
  ranAt: string;
  drift: ReconcileEntry[];
  filesUpdated: string[];
}

/**
 * Detect drift between `foundation-state.json` (source of truth for foundation
 * pillars) and the foundation tasks across all projects, and repair tasks.json
 * to match.
 *
 * Direction: pillar → task. We treat foundation-state.json as the canonical
 * source for any task that has a `pillar` field, because that is where Sancho
 * writes when it completes a deliverable.
 *
 * Safe to call on every state-load (it's a no-op when in sync). Cheap: just
 * reads and string-compares.
 */
export function reconcilePillarTasks(slug: string): ReconcileReport {
  const report: ReconcileReport = {
    slug,
    ranAt: new Date().toISOString(),
    drift: [],
    filesUpdated: [],
  };

  const state = readFoundationState(slug);
  if (!state) return report;

  const sections = (state.sections || {}) as Record<string, AnyRecord>;

  // Build a fast lookup: { pillar -> { sectionName, status } }
  // (Pillar names should be unique across sections in practice, but if not,
  // section-scoped tasks still get the right one via the section field.)
  const pillarIndex = new Map<string, { section: string; status: CanonicalPillarStatus }[]>();
  for (const [secName, sec] of Object.entries(sections)) {
    const pillars = ((sec.pillars as AnyRecord) || (sec.skills as AnyRecord) || {}) as Record<string, AnyRecord>;
    for (const [pName, pInfo] of Object.entries(pillars)) {
      const status = normalizePillarStatus(((pInfo as AnyRecord).status as string) || "not-started");
      const list = pillarIndex.get(pName) || [];
      list.push({ section: secName, status });
      pillarIndex.set(pName, list);
    }
  }

  for (const projDir of listProjectDirs(slug)) {
    const tasksPath = path.join(projDir, "tasks.json");
    const data = readTasksFile(tasksPath);
    if (!data) continue;

    let dirty = false;

    for (const task of data.tasks) {
      const pillarName = task.pillar as string | undefined;
      if (!pillarName) continue;

      const matches = pillarIndex.get(pillarName);
      if (!matches || matches.length === 0) continue;

      // Prefer section-scoped match if the task declares a section.
      const taskSection = task.section as string | undefined;
      const match = taskSection
        ? matches.find((m) => m.section === taskSection) || matches[0]
        : matches[0];

      const expectedTaskStatus = pillarStatusToTaskStatus(match.status);
      const currentTaskStatus = normalizeTaskStatus((task.status as string) || "todo");

      if (currentTaskStatus !== expectedTaskStatus) {
        report.drift.push({
          taskId: task.id as string,
          pillar: pillarName,
          section: taskSection,
          oldTaskStatus: (task.status as string) || "todo",
          newTaskStatus: expectedTaskStatus,
          pillarStatus: match.status,
        });
        applyStatusToTask(task, expectedTaskStatus);
        dirty = true;
      }
    }

    if (dirty) {
      try {
        writeTasksFile(tasksPath, data.raw, data.tasks);
        report.filesUpdated.push(tasksPath);
      } catch (e) {
        console.error("[reconcilePillarTasks] write failed:", (e as Error).message);
      }
    }

    // Always run project rollup — even if no task drift, the project status
    // may still be stale from a previous direct write.
    const projectChange = rollupProjectStatus(projDir);
    if (projectChange) {
      report.filesUpdated.push(path.join(projDir, "project.json"));
      console.log(`[reconcilePillarTasks] ${slug}: project rollup: ${projectChange}`);
    }
  }

  // Also rollup section status from pillars (section may be stale even when
  // pillars are correct, if Sancho only updated pillars and not the parent).
  const sectionChanges = rollupAllSections(state);
  if (sectionChanges.length > 0) {
    try {
      writeFoundationState(slug, state);
      report.filesUpdated.push(foundationStateFile(slug));
      console.log(`[reconcilePillarTasks] ${slug}: section rollup: ${sectionChanges.join(", ")}`);
    } catch (e) {
      console.error("[reconcilePillarTasks] section rollup write failed:", (e as Error).message);
    }
  }

  if (report.drift.length > 0) {
    console.log(
      `[reconcilePillarTasks] ${slug}: repaired ${report.drift.length} task(s) across ${report.filesUpdated.length} file(s)`
    );
  }

  return report;
}
