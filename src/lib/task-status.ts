/**
 * task-status.ts — La ÚNICA fuente del vocabulario de status de task.
 *
 * Client-safe (sin `fs`): lo importan tanto la UI (selectores, badges) como el
 * store de disco (`data/task-status-store.ts`). Tras F5 (SAN-183) el status de
 * un documento-pilar ES el status de su task — un solo vocabulario, un solo
 * juego de labels.
 *
 * Contiene:
 *   - `TASK_STATUS_OPTIONS`: los 6 valores canónicos con su label ES + estilo.
 *     Lo leen el selector de documento (Brand Brain), el de tarea (/tasks)
 *     y los badges. NO declarar listas de status en componentes — importar esto.
 *   - `statusLabel()` / `statusStyle()`: helpers de presentación.
 *   - `normalizeTaskStatus` + la tabla de ALIASES LEGACY (shim transicional para
 *     prosa vieja de skills). ⚠️ Retirar cuando las skills dejen de emitir
 *     valores legacy — follow-up en Linear.
 */

import type { TaskStatus } from "@/types";
import { VALID_TASK_STATUSES } from "@/types";

export type { TaskStatus };
export { VALID_TASK_STATUSES };

// ---------------------------------------------------------------------------
// Opciones de status — fuente única (6 valores canónicos + label ES + estilo)
// ---------------------------------------------------------------------------

export interface TaskStatusOption {
  value: TaskStatus;
  /** Label ES — el mismo en tarea y en documento-pilar. */
  label: string;
  /** Tokens de estilo para el chip/selector (Brand Brain doc dropdown). */
  bg: string;
  border: string;
  color: string;
}

/**
 * Los 6 estados canónicos en orden de progreso. `completed` = "Completada" en
 * TODAS las superficies (murió "Aprobado"/"No iniciado" del vocabulario viejo).
 */
export const TASK_STATUS_OPTIONS: readonly TaskStatusOption[] = [
  { value: "todo", label: "Por hacer", bg: "#F5F5F5", border: "#D0D0D0", color: "#666" },
  { value: "in-progress", label: "En progreso", bg: "#EFF6FF", border: "#93C5FD", color: "#1D4ED8" },
  { value: "pending-review", label: "Pendiente revisión", bg: "#FFFBEB", border: "#FCD34D", color: "#B45309" },
  { value: "completed", label: "Completada", bg: "#ECFDF5", border: "#6EE7B7", color: "#047857" },
  { value: "blocked", label: "Bloqueada", bg: "#FEF2F2", border: "#FCA5A5", color: "#B91C1C" },
  { value: "cancelled", label: "Cancelada", bg: "#F3F4F6", border: "#D1D5DB", color: "#6B7280" },
  { value: "archived", label: "Archivada", bg: "#E5E7EB", border: "#9CA3AF", color: "#4B5563" },
] as const;

const OPTION_BY_VALUE: Record<TaskStatus, TaskStatusOption> = Object.fromEntries(
  TASK_STATUS_OPTIONS.map((o) => [o.value, o]),
) as Record<TaskStatus, TaskStatusOption>;

/** Label ES de un status (acepta valores legacy/nullish: normaliza primero). */
export function statusLabel(status: string | null | undefined): string {
  return OPTION_BY_VALUE[normalizeTaskStatusQuiet(status)].label;
}

/** Opción completa (label + estilo) de un status (normaliza valores legacy/nullish). */
export function statusOption(status: string | null | undefined): TaskStatusOption {
  return OPTION_BY_VALUE[normalizeTaskStatusQuiet(status)];
}

// ---------------------------------------------------------------------------
// Normalización legacy (shim transicional) — el de task es EL vocabulario
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
export function normalizeTaskStatus(input: string | null | undefined): TaskStatus {
  const s = (input || "").trim().toLowerCase();
  if ((VALID_TASK_STATUSES as readonly string[]).includes(s)) return s as TaskStatus;
  const alias = LEGACY_STATUS_ALIASES[s];
  if (alias) {
    console.warn(
      `[task-status] DEPRECATED status alias "${s}" → "${alias}". ` +
        `Usa el vocabulario canónico (${VALID_TASK_STATUSES.join("|")}).`,
    );
    return alias;
  }
  return "todo";
}

/** normalize sin deprecation-warning (lecturas masivas de datos viejos). */
export function normalizeTaskStatusQuiet(input: string | null | undefined): TaskStatus {
  const s = (input || "").trim().toLowerCase();
  if ((VALID_TASK_STATUSES as readonly string[]).includes(s)) return s as TaskStatus;
  return LEGACY_STATUS_ALIASES[s] ?? "todo";
}

/** ¿Es un alias legacy (no canónico) que normalizamos? Para telemetría/respuestas. */
export function isLegacyStatusAlias(input: string): boolean {
  const s = (input || "").trim().toLowerCase();
  return !((VALID_TASK_STATUSES as readonly string[]).includes(s)) && s in LEGACY_STATUS_ALIASES;
}
