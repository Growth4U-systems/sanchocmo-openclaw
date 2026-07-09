/**
 * Centralized helpers for reading openclaw cron jobs and enriching them with
 * live "currently running" state. Used by /api/recurring-tasks,
 * /api/content-engine/crons, /api/system/cron-run, etc.
 *
 * Source of truth split:
 *  - `cron/jobs.json` — schedule + payload + enabled flag (configuration)
 *  - `cron/jobs-state.json` — lastRun/nextRun/lastError/diagnostics
 *  - `agents/<agent>/sessions/sessions.json` — heartbeat for in-flight runs
 *  - `brand/<slug>/recurring-tasks/<folder>/<date>.json` — per-run rich output
 */
import fs from "fs";
import path from "path";
import { readJSON } from "./json-io";
import { BASE } from "./paths";
import { getRuntime, type RuntimeRunningCron } from "@/lib/runtime";

// ── Types ─────────────────────────────────────────────────────────

export interface RawCronJob {
  id: string;
  name: string;
  enabled?: boolean;
  schedule?: { kind?: string; expr?: string; everyMs?: number; tz?: string };
  payload?: { kind?: string; message?: string; model?: string };
  agentId?: string;
  description?: string;
  state?: Record<string, unknown>;
  createdAtMs?: number;
  [key: string]: unknown;
}

export interface CronDiagnosticEntry {
  ts: number;
  source: string;
  severity: string;
  message: string;
}

/** Shape returned by `enrichCron` — everything the panel needs in one object. */
export interface EnrichedCron {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  category: string;
  schedule_raw: { kind?: string; expr?: string; everyMs?: number; tz?: string } | null;
  agent: string;
  model: string;
  prompt: string;
  client_slug: string | null;
  /** When the cron last finished (from jobs-state.json). */
  last_run_at: string | null;
  next_run_at: string | null;
  last_status: string | null;
  last_duration_ms: number | null;
  consecutive_errors: number;
  /** Top-level diagnostics summary written by the cron runner. Optional. */
  last_diagnostic_summary: string | null;
  /** Full error message (preflight or agent-side). Optional. */
  last_error: string | null;
  last_error_reason: string | null;
  /** Diagnostic entries (kept short so the payload stays small). */
  diagnostics: CronDiagnosticEntry[];
  /** Agent's rich summary written in recurring-tasks/<folder>/<date>.json. */
  last_finding: string | null;
  /** Live: set when an agent session is currently being touched. */
  running: { startedAtMs: number; lastTouchMs: number; sessionId: string | null } | null;
}

// ── Brand resolution ──────────────────────────────────────────────

/**
 * Try to attribute a cron to a brand by inspecting its name and prompt.
 * Returns the matching client slug, or null if the cron is "shared system"
 * (backups, health checks, cost trackers, etc.).
 *
 * The matching rules mirror the per-cron filter in /api/content-engine/crons
 * so a cron that surfaces under a brand in the Content Engine panel is the
 * same one that surfaces under that brand in the Recurring Tasks panel.
 * Keep the two filters aligned — divergence is what made running crons
 * disappear from the recurring panel.
 */
export function resolveCronBrand(
  cron: RawCronJob,
  clients: { slug: string; name: string }[],
): string | null {
  const name = (cron.name || "").toLowerCase();
  for (const c of clients) {
    if (name.includes(c.name.toLowerCase()) || name.includes(c.slug.toLowerCase())) {
      return c.slug;
    }
  }
  const msg = cron.payload?.message || "";
  // Prompt-based attribution: prefer `brand/<slug>/` paths (canonical), then
  // fall back to natural-language `para <slug>` phrasing used by Content
  // Engine prompts written before the per-brand cron template existed.
  const promptMatch = msg.match(/brand\/([a-z0-9_-]+)\//i);
  if (promptMatch) {
    const slug = promptMatch[1].toLowerCase();
    if (clients.some((c) => c.slug === slug)) return slug;
  }
  for (const c of clients) {
    const slugLc = c.slug.toLowerCase();
    const nameLc = c.name.toLowerCase();
    // Match `para <slug>` or `para <name>` as a standalone token.
    const re = new RegExp(`\\bpara\\s+(${escapeRegex(slugLc)}|${escapeRegex(nameLc)})\\b`, "i");
    if (re.test(msg)) return c.slug;
  }
  return null;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ── Category classification ───────────────────────────────────────

export function detectCronCategory(name: string): string {
  const n = (name || "").toLowerCase();
  if (/metric|morning|cost|dashboard|regenerar|analytics/.test(n)) return "metrics";
  if (/pulse|meeting|synthesis|intelligence|thief|signal|idea/.test(n)) return "intelligence";
  if (/outreach|lead|call prep|prospecting/.test(n)) return "outreach";
  if (/content|blog|social|newsletter/.test(n)) return "content";
  if (/health|backup|watchdog|memory|update|token|image-opt|compact|changelog|activity|mejora|skill-improvement|pattern|observa/.test(n)) {
    return "system";
  }
  return "other";
}

// ── Schedule humanization ─────────────────────────────────────────

const DOW_MAP: Record<string, string> = {
  "0": "Dom", "1": "Lun", "2": "Mar", "3": "Mié", "4": "Jue", "5": "Vie", "6": "Sáb",
};

export function humanizeSchedule(schedule: RawCronJob["schedule"]): string {
  if (!schedule) return "—";
  if (schedule.kind === "every" && schedule.everyMs) {
    const h = Math.round(schedule.everyMs / 3600000);
    if (h >= 24) return `Cada ${Math.round(h / 24)}d`;
    if (h >= 1) return `Cada ${h}h`;
    const m = Math.round(schedule.everyMs / 60000);
    return `Cada ${m}min`;
  }
  const expr = schedule.expr || "";
  const parts = expr.split(/\s+/);
  if (parts.length < 5) return expr;
  const [min, hour, dom, , dow] = parts;
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
      dayStr = `${DOW_MAP[a] || a}-${DOW_MAP[b] || b}`;
    } else {
      dayStr = dow.split(",").map((d) => DOW_MAP[d] || d).join(", ");
    }
  } else if (dom === "1") dayStr = "Día 1 del mes";
  else dayStr = `Día ${dom}`;
  return `${dayStr} ${hStr}`;
}

// ── Loading raw crons ─────────────────────────────────────────────

export function loadAllCrons(): RawCronJob[] {
  const file = process.env.OPENCLAW_CRON_FILE || getRuntime().state.cronJobsFile();
  const data = readJSON<{ jobs?: RawCronJob[] } | RawCronJob[]>(file, { jobs: [] });
  if (Array.isArray(data)) return data;
  return data.jobs || [];
}

interface JobState {
  state?: {
    lastRunAtMs?: number;
    nextRunAtMs?: number;
    lastRunStatus?: string;
    lastStatus?: string;
    lastDurationMs?: number;
    consecutiveErrors?: number;
    lastError?: string;
    lastErrorReason?: string;
    lastDiagnosticSummary?: string;
    lastDiagnostics?: { summary?: string; entries?: CronDiagnosticEntry[] };
  };
}

let _jobsStateCache: { mtime: number; data: Record<string, JobState> } | null = null;

export function loadJobsState(): Record<string, JobState> {
  const file = getRuntime().state.cronJobsStateFile();
  if (!fs.existsSync(file)) return {};
  try {
    const stat = fs.statSync(file);
    if (_jobsStateCache && _jobsStateCache.mtime === stat.mtimeMs) return _jobsStateCache.data;
    const parsed = JSON.parse(fs.readFileSync(file, "utf-8"));
    const data = (parsed.jobs || {}) as Record<string, JobState>;
    _jobsStateCache = { mtime: stat.mtimeMs, data };
    return data;
  } catch {
    return {};
  }
}

// ── Per-brand rich finding ────────────────────────────────────────

/**
 * Best-effort read of the agent's 1-2 sentence summary for the most recent
 * run of this cron, stored under brand/<slug>/recurring-tasks/<folder>/
 * <date>.json. Returns null if no such file is found.
 */
export function loadLastFinding(slug: string | null, cronName: string): { finding: string | null; error: string | null } {
  if (!slug) return { finding: null, error: null };
  const folder = cronNameToFolderSlug(cronName, slug);
  if (!folder) return { finding: null, error: null };
  const dir = path.join(BASE, "brand", slug, "recurring-tasks", folder);
  if (!fs.existsSync(dir)) return { finding: null, error: null };
  try {
    const files = fs
      .readdirSync(dir)
      .filter((f) => f.endsWith(".json"))
      .sort()
      .reverse();
    if (files.length === 0) return { finding: null, error: null };
    const data = readJSON<{ last_finding?: string; error?: string; content?: string }>(
      path.join(dir, files[0]),
      {},
    );
    return { finding: data.last_finding || data.content || null, error: data.error || null };
  } catch {
    return { finding: null, error: null };
  }
}

/** Best-effort transform from cron name to its recurring-tasks/<folder> slug. */
function cronNameToFolderSlug(name: string, brandSlug: string): string | null {
  let s = (name || "").toLowerCase();
  s = s.replace(/\s*[—–-]\s*(multi-client|system|global)$/i, "");
  // Strip brand suffix variants ("Cost Tracker — Growth4U" / "— growth4u")
  s = s.replace(new RegExp(`\\s*[—–-]\\s*${brandSlug.replace(/-/g, "[- ]?")}$`, "i"), "");
  const trimmed = s.trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return trimmed || null;
}

// ── Enrichment entry point ────────────────────────────────────────

interface EnrichOptions {
  /** When provided, only crons matching this slug (or _system if includeSystem)
   *  will be returned. When null, all crons are returned grouped by slug. */
  slug?: string | null;
  /** Include "shared system" crons (no brand match) in the result. Caller is
   *  responsible for permission gating (admin-only in the UI). */
  includeSystem?: boolean;
  clients: { slug: string; name: string }[];
  /** Pre-loaded running map (lets callers reuse one read across many crons). */
  runningMap?: Map<string, RuntimeRunningCron>;
}

export interface EnrichedCronsResult {
  crons: EnrichedCron[];
  /** Crons that didn't match any brand (only when includeSystem === true). */
  systemCrons: EnrichedCron[];
}

export function enrichCrons(opts: EnrichOptions): EnrichedCronsResult {
  const allCrons = loadAllCrons();
  const jobsState = loadJobsState();
  const targetSlug = opts.slug ?? null;
  const includeSystem = !!opts.includeSystem;

  // Build {jobId → lastEnd} for getRunningCronJobs heuristic. Only needed if
  // caller didn't already supply a runningMap.
  let runningMap = opts.runningMap;
  if (!runningMap) {
    const jobsEndedAt: Record<string, { lastRunAtMs?: number; lastDurationMs?: number }> = {};
    for (const j of allCrons) {
      const s = jobsState[j.id]?.state;
      jobsEndedAt[j.id] = { lastRunAtMs: s?.lastRunAtMs, lastDurationMs: s?.lastDurationMs };
    }
    runningMap = getRuntime().state.getRunningCronJobs(jobsEndedAt);
  }

  const matched: EnrichedCron[] = [];
  const systemMatched: EnrichedCron[] = [];

  for (const cron of allCrons) {
    const cronSlug = resolveCronBrand(cron, opts.clients);
    const isBrandMatch = targetSlug && cronSlug === targetSlug;
    const isSystemMatch = includeSystem && !cronSlug;

    if (targetSlug && !isBrandMatch && !isSystemMatch) continue;

    const enriched = enrichSingleCron(cron, jobsState[cron.id], runningMap.get(cron.id), cronSlug);
    if (cronSlug) {
      matched.push(enriched);
    } else {
      systemMatched.push(enriched);
    }
  }

  return { crons: matched, systemCrons: systemMatched };
}

function enrichSingleCron(
  cron: RawCronJob,
  jobState: JobState | undefined,
  running: RuntimeRunningCron | undefined,
  cronSlug: string | null,
): EnrichedCron {
  const payload = cron.payload || {};
  const state = jobState?.state || {};
  const sched = cron.schedule || null;
  const { finding, error: findingError } = loadLastFinding(cronSlug, cron.name);

  return {
    id: cron.id,
    name: cron.name || "—",
    description: cron.description || "",
    enabled: cron.enabled !== false,
    category: detectCronCategory(cron.name),
    schedule_raw: sched as EnrichedCron["schedule_raw"],
    agent: cron.agentId || "sancho",
    model: payload.model || "—",
    prompt: payload.message || "",
    client_slug: cronSlug,
    last_run_at: state.lastRunAtMs ? new Date(state.lastRunAtMs).toISOString() : null,
    next_run_at: state.nextRunAtMs ? new Date(state.nextRunAtMs).toISOString() : null,
    last_status: (state.lastRunStatus || state.lastStatus) ?? null,
    last_duration_ms: state.lastDurationMs ?? null,
    consecutive_errors: state.consecutiveErrors ?? 0,
    last_diagnostic_summary:
      state.lastDiagnosticSummary || state.lastDiagnostics?.summary || null,
    last_error: state.lastError || findingError || null,
    last_error_reason: state.lastErrorReason || null,
    diagnostics: (state.lastDiagnostics?.entries || []).slice(-20),
    last_finding: finding,
    running: running
      ? {
          startedAtMs: running.startedAtMs,
          lastTouchMs: running.lastTouchMs,
          sessionId: running.sessionId,
        }
      : null,
  };
}

// ── Live-only summary for cheap polling ───────────────────────────

export interface LiveStatus {
  running: boolean;
  startedAtMs?: number;
  lastTouchMs?: number;
  /** Only present if the daemon is reachable. Some local environments don't
   *  have the runs/ tree yet — caller can show "—" rather than "OK". */
  _unavailable?: boolean;
}

/**
 * Cheap status for the adaptive 5s polling cycle. Skips brand attribution and
 * heavy fields; only reads jobs-state + the agent sessions file.
 */
export function getLiveStatuses(jobIds: string[]): Record<string, LiveStatus> {
  const jobsState = loadJobsState();
  const jobsEndedAt: Record<string, { lastRunAtMs?: number; lastDurationMs?: number }> = {};
  for (const id of jobIds) {
    const s = jobsState[id]?.state;
    jobsEndedAt[id] = { lastRunAtMs: s?.lastRunAtMs, lastDurationMs: s?.lastDurationMs };
  }
  const running = getRuntime().state.getRunningCronJobs(jobsEndedAt);
  const result: Record<string, LiveStatus> = {};
  for (const id of jobIds) {
    const live = running.get(id);
    if (live) {
      result[id] = {
        running: true,
        startedAtMs: live.startedAtMs,
        lastTouchMs: live.lastTouchMs,
      };
    } else {
      result[id] = { running: false };
    }
  }
  return result;
}
