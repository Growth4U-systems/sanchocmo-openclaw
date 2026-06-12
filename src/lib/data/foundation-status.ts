/**
 * foundation-status.ts — Status de Foundation con UNA sola fuente (SAN-183 F5).
 *
 * Sucesor de pillar-task-sync.ts (~830 líneas, BORRADO): ya no hay dos stores
 * que sincronizar. El status de un pilar ES el status de su task 1:1 (binding
 * en config/pillar-manifest.json → foundation.sections[].pillars[].task).
 * Sin dual-writes, sin reconcile-on-read: una task, un status.
 *
 * Vive aquí:
 *   - normalizeTaskStatus + la tabla de ALIASES LEGACY del vocabulario de
 *     pilar (approved→completed, not-started→todo, generated→pending-review…).
 *     ⚠️ La tabla de aliases es un SHIM TRANSICIONAL para skills con prosa
 *     vieja — las skills hablan ya el vocabulario canónico (PR3); retirar los
 *     aliases es follow-up en Linear. Cada uso loggea un deprecation warning.
 *   - resolveCoveringTask: pilar → su task viva (lookup del manifest primero,
 *     fallback a scan por task.pillar para datos pre-manifest).
 *   - setPillarStatusViaTask: el único write path de status de pilar.
 *   - rollupProjectStatus / rollupAllProjects (task → project.json, sobreviven
 *     del módulo viejo — esa derivación sigue siendo válida).
 */

import fs from "fs";
import path from "path";
import { BASE } from "@/lib/data/paths";
import type { TaskStatus } from "@/types";
import { VALID_TASK_STATUSES } from "@/types";
import { findFoundationPillar, foundationTaskIdForPillar } from "./task-blueprints";

type AnyRecord = Record<string, unknown>;

// ---------------------------------------------------------------------------
// Vocabulario — el de task es EL vocabulario (6 valores)
// ---------------------------------------------------------------------------

/**
 * Aliases LEGACY → status canónico de task. El vocabulario de pilar (7
 * valores) murió; estas entradas existen solo para prosa vieja de skills y
 * datos históricos. DEPRECADO — retirar cuando las sesiones de agente ciclen.
 */
const LEGACY_STATUS_ALIASES: Record<string, TaskStatus> = {
  // vocabulario de pilar muerto
  "not-started": "todo",
  not_started: "todo",
  notstarted: "todo",
  approved: "completed",
  generated: "pending-review",
  "request-changes": "todo",
  request_changes: "todo",
  "changes-requested": "todo",
  "request-refresh": "todo",
  request_refresh: "todo",
  "refresh-requested": "todo",
  // aliases genéricos históricos
  done: "completed",
  complete: "completed",
  finished: "completed",
  pending_review: "pending-review",
  review: "pending-review",
  in_progress: "in-progress",
  inprogress: "in-progress",
  running: "in-progress",
  active: "in-progress",
  wip: "in-progress",
  lite: "in-progress",
  pending: "todo",
  ready: "todo",
  new: "todo",
  canceled: "cancelled",
  discarded: "cancelled",
  rejected: "cancelled",
};

/**
 * Normaliza cualquier status entrante al vocabulario canónico de task.
 * Valores canónicos pasan tal cual; aliases legacy se traducen (con warning);
 * lo desconocido cae a "todo".
 */
export function normalizeTaskStatus(input: string): TaskStatus {
  const s = (input || "").trim().toLowerCase();
  if ((VALID_TASK_STATUSES as readonly string[]).includes(s)) return s as TaskStatus;
  const alias = LEGACY_STATUS_ALIASES[s];
  if (alias) {
    console.warn(
      `[foundation-status] DEPRECATED status alias "${s}" → "${alias}". ` +
        `Usa el vocabulario canónico (${VALID_TASK_STATUSES.join("|")}).`,
    );
    return alias;
  }
  return "todo";
}

/** ¿Es un alias legacy (no canónico) que normalizamos? Para telemetría/respuestas. */
export function isLegacyStatusAlias(input: string): boolean {
  const s = (input || "").trim().toLowerCase();
  return !((VALID_TASK_STATUSES as readonly string[]).includes(s)) && s in LEGACY_STATUS_ALIASES;
}

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

/** Mutate a task in place to the given status. Returns true if changed. */
function applyStatusToTask(task: AnyRecord, newStatus: TaskStatus): boolean {
  if (task.status === newStatus) return false;
  task.status = newStatus;
  if (newStatus === "completed" && !task.completed) {
    task.completed = new Date().toISOString().slice(0, 10);
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

/** normalize sin deprecation-warning (lecturas masivas de datos viejos). */
function normalizeTaskStatusQuiet(input: string): TaskStatus {
  const s = (input || "").trim().toLowerCase();
  if ((VALID_TASK_STATUSES as readonly string[]).includes(s)) return s as TaskStatus;
  return LEGACY_STATUS_ALIASES[s] ?? "todo";
}

export { normalizeTaskStatusQuiet };

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
export function setTaskStatus(slug: string, taskId: string, status: string): SyncResult {
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
      const projectChange = rollupProjectStatus(projDir);
      if (projectChange) {
        console.log(`[foundation-status] ${slug}: project rollup: ${projectChange}`);
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
    console.log(`[foundation-status] ${slug}: project rollup: ${projectChange}`);
  }

  return {
    ok: true,
    pillarChanged: changed,
    tasksChanged: changed ? 1 : 0,
    oldStatus,
    newStatus: taskStatus,
  };
}
