/**
 * Shared types + derived-state machine for cron UI components.
 *
 * Pure module (no React, no fs) so the state machine can be unit tested
 * with a table of inputs and reused across panels.
 */

/** Wire shape returned by /api/recurring-tasks for a single cron. */
export interface CronApi {
  id: string;
  name: string;
  task_type?: string;
  schedule?: string | { kind?: string; expr?: string; everyMs?: number; tz?: string };
  schedule_raw?: { kind?: string; expr?: string; everyMs?: number; tz?: string } | null;
  /** "active" | "paused" — daemon enable flag, NOT live execution status. */
  status?: string;
  last_run_at?: string | null;
  next_run_at?: string | null;
  /** Exit status of the most recent finished run: "ok" | "error" | null. */
  last_status?: string | null;
  last_duration_ms?: number | null;
  consecutive_errors?: number;
  last_diagnostic_summary?: string | null;
  last_error?: string | null;
  last_error_reason?: string | null;
  last_finding?: string | null;
  diagnostics?: Array<{ ts: number; source: string; severity: string; message: string }>;
  /** Server-derived live signal: when present, the cron is mid-run. */
  running?: { startedAtMs: number; lastTouchMs: number; sessionId: string | null } | null;
  agent?: string;
  model?: string;
  prompt?: string;
  description?: string;
  scripts?: Array<{ name: string; path: string; lines: number; lang: string }>;
  client_slug?: string | null;
  /** True for "shared system" crons (no brand attribution). */
  _shared?: boolean;
  _source?: string;
}

export interface CronFlash {
  /** Transient kind. `queued` covers the dispatch-latency window between
   *  POST and the first agent session touch. */
  kind: "queued" | "running" | "ok" | "error" | "warn";
  message: string;
  /** Epoch ms when the flash was created — used for auto-dismiss timing. */
  createdAt: number;
}

export type CronState =
  | "running"
  | "queued"
  | "error"
  | "paused"
  | "ok"
  | "idle"
  | "unavailable";

export interface DerivedState {
  state: CronState;
  /** Ago in ms — meaning depends on state:
   *  - running: time since startedAtMs
   *  - ok/error: time since last_run_at
   *  - idle/paused: undefined */
  ago?: number;
  /** Short human summary to show inline. */
  summary?: string;
}

/** Normalize the wire `status` field to a boolean. Treats missing as enabled. */
export function isEnabled(cron: Pick<CronApi, "status">): boolean {
  return cron.status !== "paused";
}

/**
 * Pure state derivation. Order matters — first matching rule wins.
 *
 * `pendingClickFresh` represents the local "user clicked ▶ but the server's
 * live signal hasn't appeared yet" buffer — typically held for up to 90 s by
 * the parent hook to cover openclaw's dispatch latency.
 */
export function deriveCronState(input: {
  cron: CronApi;
  flash?: CronFlash | null;
  /** Optional "now" for deterministic tests. */
  now?: number;
  /** True while we're inside the 90s post-click buffer with no server-side
   *  running payload yet. */
  pendingClickFresh?: boolean;
}): DerivedState {
  const now = input.now ?? Date.now();
  const { cron, flash, pendingClickFresh } = input;

  // Disabled wins unless something is currently in-flight (disable doesn't
  // kill an active run; we still surface it as "running" so the user knows).
  if (!isEnabled(cron) && !cron.running) {
    return { state: "paused", summary: cron.last_finding || undefined };
  }

  if (cron.running) {
    return {
      state: "running",
      ago: Math.max(0, now - cron.running.startedAtMs),
    };
  }

  if (pendingClickFresh) {
    return { state: "queued", summary: "Encolada · arrancando" };
  }

  if (flash?.kind === "queued" && now - flash.createdAt < 10_000) {
    return { state: "queued", summary: flash.message };
  }

  if ((cron.consecutive_errors ?? 0) > 0) {
    return {
      state: "error",
      ago: cron.last_run_at ? now - new Date(cron.last_run_at).getTime() : undefined,
      summary:
        cron.last_diagnostic_summary ||
        cron.last_error ||
        cron.last_error_reason ||
        undefined,
    };
  }

  if (cron.last_status === "ok" || cron.last_run_at) {
    return {
      state: "ok",
      ago: cron.last_run_at ? now - new Date(cron.last_run_at).getTime() : undefined,
      summary: cron.last_finding || undefined,
    };
  }

  return { state: "idle" };
}

// ── Formatting helpers (UI side) ────────────────────────────────────

export function formatDuration(ms: number): string {
  if (ms < 0) ms = 0;
  const total = Math.floor(ms / 1000);
  if (total < 60) return `${total}s`;
  const m = Math.floor(total / 60);
  const s = total % 60;
  return s === 0 ? `${m}m` : `${m}m ${s}s`;
}

export function formatRelative(iso: string | undefined | null, now: number = Date.now()): string {
  if (!iso) return "nunca";
  const t = new Date(iso).getTime();
  if (isNaN(t)) return iso || "—";
  const diff = now - t;
  if (diff < 60_000) return "ahora mismo";
  if (diff < 3600_000) return `hace ${Math.floor(diff / 60_000)} min`;
  if (diff < 86400_000) return `hace ${Math.floor(diff / 3600_000)}h`;
  const days = Math.floor(diff / 86400_000);
  if (days < 7) return `hace ${days}d`;
  return new Date(iso).toLocaleDateString("es-ES", { day: "numeric", month: "short" });
}

export function humanizeSchedule(
  schedule: CronApi["schedule"] | CronApi["schedule_raw"],
): string {
  if (!schedule) return "—";
  if (typeof schedule === "string") return schedule;
  if (schedule.kind === "every" && schedule.everyMs) {
    const h = Math.round(schedule.everyMs / 3600000);
    if (h >= 24) return `Cada ${Math.round(h / 24)}d`;
    if (h >= 1) return `Cada ${h}h`;
    return `Cada ${Math.round(schedule.everyMs / 60000)}min`;
  }
  const expr = schedule.expr || "";
  const parts = expr.split(/\s+/);
  if (parts.length < 5) return expr;
  const [min, hour, dom, , dow] = parts;
  const dowMap: Record<string, string> = {
    "0": "Dom", "1": "Lun", "2": "Mar", "3": "Mié", "4": "Jue", "5": "Vie", "6": "Sáb",
  };
  const hStr = hour.includes(",")
    ? hour.split(",").map((h) => `${h}:${min.padStart(2, "0")}`).join(", ")
    : `${hour}:${min.padStart(2, "0")}`;
  let dayStr = "";
  if (dow === "*" && dom === "*") dayStr = "Cada día";
  else if (dow === "1-5") dayStr = "L-V";
  else if (dow === "0-4") dayStr = "D-J";
  else if (dow !== "*") {
    if (dow.includes("-")) {
      const [a, b] = dow.split("-");
      dayStr = `${dowMap[a] || a}-${dowMap[b] || b}`;
    } else {
      dayStr = dow.split(",").map((d) => dowMap[d] || d).join(", ");
    }
  } else if (dom === "1") dayStr = "Día 1 del mes";
  else dayStr = `Día ${dom}`;
  return `${dayStr} ${hStr}`;
}
