/**
 * task-status-store.ts — Escritura/lectura en disco del status de task.
 *
 * El VOCABULARIO (valores, labels, normalización legacy) vive en
 * `src/lib/task-status.ts` (client-safe). Este módulo es la capa de DISCO
 * (necesita `fs`): localiza la task que cubre un documento-pilar y escribe su
 * status. Sucesor de `foundation-status.ts` / `pillar-task-sync.ts` (BORRADOS):
 * una task, un status — sin dual-writes, sin reconcile-on-read.
 *
 * Vive aquí:
 *   - resolveCoveringTask: documento-pilar → su task viva (lookup del manifest
 *     primero, fallback a scan por task.pillar para datos pre-manifest).
 *   - setTaskStatus / setPillarStatusViaTask: write paths (normalizan en el
 *     límite vía `normalizeTaskStatus` del módulo de vocabulario).
 *   - rollupProjectStatus / rollupAllProjects (task → project.json). ⚠️ LEGACY:
 *     `project.json` está en deprecación (todo es Task, type=project) — retirar
 *     con la deprecación de projects (follow-up Linear).
 */

import fs from "fs";
import path from "path";
import { BASE } from "@/lib/data/paths";
import type { TaskStatus, DoneStamp } from "@/types";
import { normalizeTaskStatus, normalizeTaskStatusQuiet } from "@/lib/task-status";
import { findFoundationPillar, foundationTaskIdForPillar } from "./task-blueprints";

type AnyRecord = Record<string, unknown>;

// Re-export del normalizador del límite de escritura para compat de importadores.
export { normalizeTaskStatus };

// ---------------------------------------------------------------------------
// Tasks on disk (json backend)
// ---------------------------------------------------------------------------

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
function readTasksFile(filePath: string): { raw: unknown; tasks: AnyRecord[] } | null {
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

/** Mutate a task in place to the given status. Returns true if changed.
 *  `stamp` (SAN-344) is the Definition-of-Done gate's traceability record; when
 *  present and the task is being completed, it's recorded on `task.done_stamp`. */
function applyStatusToTask(
  task: AnyRecord,
  newStatus: TaskStatus,
  stamp?: DoneStamp,
): boolean {
  if (task.status === newStatus) return false;
  task.status = newStatus;
  if (newStatus === "completed" && !task.completed) {
    task.completed = new Date().toISOString().slice(0, 10);
  }
  if (newStatus === "completed" && stamp) {
    task.done_stamp = stamp;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Pilar → task cubriente
// ---------------------------------------------------------------------------

export interface CoveringTask {
  projectDir: string;
  tasksPath: string;
  raw: unknown;
  tasks: AnyRecord[];
  task: AnyRecord;
}

/**
 * Localiza la task viva que cubre un pilar de Foundation.
 *
 * 1. Binding del manifest (foundationTaskIdForPillar → id concreto P00-*-T*).
 * 2. Fallback para datos pre-manifest: scan de todas las tasks buscando
 *    `task.pillar === pillar` (o el legacy `task.pillars[]` plural).
 */
export function resolveCoveringTask(slug: string, pillar: string): CoveringTask | null {
  const canonicalId = foundationTaskIdForPillar(pillar);
  let fallback: CoveringTask | null = null;
  for (const projectDir of listProjectDirs(slug)) {
    const tasksPath = path.join(projectDir, "tasks.json");
    const data = readTasksFile(tasksPath);
    if (!data) continue;
    for (const task of data.tasks) {
      if (canonicalId && task.id === canonicalId) {
        return { projectDir, tasksPath, raw: data.raw, tasks: data.tasks, task };
      }
      const matchesPillar =
        task.pillar === pillar ||
        (Array.isArray(task.pillars) && (task.pillars as string[]).includes(pillar));
      if (matchesPillar && !fallback) {
        fallback = { projectDir, tasksPath, raw: data.raw, tasks: data.tasks, task };
      }
    }
  }
  return fallback;
}

// ---------------------------------------------------------------------------
// Project rollup (task → project.json) — sobrevive del módulo viejo
// ---------------------------------------------------------------------------

function computeProjectStatus(tasks: AnyRecord[]): "pending" | "in-progress" | "completed" {
  if (tasks.length === 0) return "pending";
  let completedCount = 0;
  let activeCount = 0;
  for (const t of tasks) {
    const s = normalizeTaskStatusQuiet((t.status as string) || "todo");
    if (s === "completed") {
      completedCount++;
      activeCount++;
    } else if (s === "in-progress" || s === "pending-review") {
      activeCount++;
    }
  }
  if (completedCount === tasks.length) return "completed";
  if (activeCount > 0) return "in-progress";
  return "pending";
}

/**
 * Recompute the project.json status for a project directory from its tasks.
 * Writes only on change; only "upward" transitions (pending < in-progress <
 * completed) to avoid fighting UI-managed states. (Portado de pillar-task-sync.)
 */
export function rollupProjectStatus(projDir: string): string | null {
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
  const order: Record<string, number> = { pending: 0, "not-started": 0, todo: 0, "in-progress": 1, active: 1, completed: 2, done: 2, approved: 2 };
  const oldRank = order[oldStatus] ?? 0;
  const newRank = order[newStatus] ?? 0;

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

/** Project rollup para todos los proyectos de un slug. */
export function rollupAllProjects(slug: string): string[] {
  const changes: string[] = [];
  for (const projDir of listProjectDirs(slug)) {
    const change = rollupProjectStatus(projDir);
    if (change) changes.push(change);
  }
  return changes;
}

// ---------------------------------------------------------------------------
// El único write path de status de pilar
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
 * Escribe el status de una task por id (cualquier task, Foundation o no).
 * Sucesor del setTaskStatus de pillar-task-sync SIN la mitad de pilar: con
 * una sola fuente, escribir la task ES escribir el pilar. `pillarChanged`
 * se conserva en el resultado por compat de contrato (siempre false).
 */
export function setTaskStatus(
  slug: string,
  taskId: string,
  status: string,
  stamp?: DoneStamp,
): SyncResult {
  const taskStatus = normalizeTaskStatus(status);

  // Guess del proyecto por prefijo ("P00" de "P00-FUL-T01"), fallback a scan.
  const projectIdGuess = taskId.split("-").slice(0, 1).join("-");
  const dirs = listProjectDirs(slug);
  const guessed = dirs.filter((d) => path.basename(d).startsWith(projectIdGuess));
  const dirsToSearch = [...guessed, ...dirs.filter((d) => !guessed.includes(d))];

  for (const projDir of dirsToSearch) {
    const tasksPath = path.join(projDir, "tasks.json");
    const data = readTasksFile(tasksPath);
    if (!data) continue;
    const task = data.tasks.find((t) => t.id === taskId);
    if (!task) continue;

    const oldStatus = (task.status as string) || "todo";
    const changed = applyStatusToTask(task, taskStatus, stamp);
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
      const projectChange = rollupProjectStatus(projDir);
      if (projectChange) {
        console.log(`[task-status-store] ${slug}: project rollup: ${projectChange}`);
      }
    }

    return {
      ok: true,
      pillarChanged: false,
      tasksChanged: changed ? 1 : 0,
      oldStatus,
      newStatus: taskStatus,
    };
  }

  return { ok: false, pillarChanged: false, tasksChanged: 0, error: `Task not found: ${taskId}` };
}

/**
 * Escribe el status de un pilar — es decir, el status de SU task (única
 * fuente). Acepta aliases legacy (shim transicional, ver cabecera). El
 * parámetro `section` se conserva por compat de contrato del endpoint pero ya
 * no participa en la resolución (el binding del manifest es por pilar).
 */
export function setPillarStatusViaTask(
  slug: string,
  _section: string,
  pillar: string,
  status: string,
  opts?: { comment?: string },
): SyncResult {
  if (!findFoundationPillar(pillar) && !resolveCoveringTask(slug, pillar)) {
    return { ok: false, pillarChanged: false, tasksChanged: 0, error: `Pillar not found: ${pillar}` };
  }
  const taskStatus = normalizeTaskStatus(status);

  const covering = resolveCoveringTask(slug, pillar);
  if (!covering) {
    // Pilar declarado pero proyectos P00 no sembrados (cliente pre-F5 sin
    // migrar): la migración (scripts/migrate-foundation-state.mts) los crea.
    return {
      ok: false,
      pillarChanged: false,
      tasksChanged: 0,
      error: `No covering task for pillar "${pillar}" — run scripts/migrate-foundation-state.mts for ${slug}`,
    };
  }

  const oldStatus = (covering.task.status as string) || "todo";
  const changed = applyStatusToTask(covering.task, taskStatus);
  if (opts?.comment) covering.task.status_comment = opts.comment;
  if (changed || opts?.comment) {
    try {
      writeTasksFile(covering.tasksPath, covering.raw, covering.tasks);
    } catch (e) {
      return {
        ok: false,
        pillarChanged: false,
        tasksChanged: 0,
        error: `Failed to write tasks.json: ${(e as Error).message}`,
      };
    }
  }

  const projectChange = rollupProjectStatus(covering.projectDir);
  if (projectChange) {
    console.log(`[task-status-store] ${slug}: project rollup: ${projectChange}`);
  }

  return {
    ok: true,
    pillarChanged: changed,
    tasksChanged: changed ? 1 : 0,
    oldStatus,
    newStatus: taskStatus,
  };
}
