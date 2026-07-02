/**
 * GET/PATCH/POST /api/content-engine/crons — Manage Content Engine cron jobs
 *
 * GET ?slug=X → returns all Content Engine crons for this client
 * PATCH { jobId, fields } → update job (enabled, schedule)
 * POST  { jobId, action: "run" } → trigger one-shot manual execution (fire-and-forget)
 */

import type { NextApiRequest, NextApiResponse } from "next";
import fs from "fs";
import path from "path";
import { spawn } from "child_process";
import { withErrorHandler } from "@/lib/api-middleware";
import { cronJobsFile, cronJobsStateFile } from "@/lib/data/openclaw-paths";
import { getRunningCronJobs } from "@/lib/data/openclaw-sessions";

const EXEC_PATH = "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin";

interface CronJob {
  id: string;
  name: string;
  enabled: boolean;
  schedule: { kind: string; expr: string; tz: string };
  payload: { kind: string; message: string; model: string };
  state: Record<string, unknown>;
  createdAtMs: number;
  [key: string]: unknown;
}

function loadJobs(): { version: number; jobs: CronJob[] } {
  const file = cronJobsFile();
  if (!fs.existsSync(file)) return { version: 1, jobs: [] };
  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf-8")) as { version?: unknown; jobs?: unknown };
    const jobs = Array.isArray(parsed.jobs)
      ? parsed.jobs.filter((j): j is CronJob => (
          !!j &&
          typeof j === "object" &&
          typeof (j as Partial<CronJob>).id === "string" &&
          typeof (j as Partial<CronJob>).name === "string"
        ))
      : [];
    return {
      version: typeof parsed.version === "number" ? parsed.version : 1,
      jobs,
    };
  } catch {
    return { version: 1, jobs: [] };
  }
}

function saveJobs(data: { version: number; jobs: CronJob[] }) {
  fs.writeFileSync(cronJobsFile(), JSON.stringify(data, null, 2));
}

/** Convert cron expression to human-readable Spanish */
function humanizeCron(expr: string): string {
  const parts = expr.split(" ");
  if (parts.length !== 5) return expr;
  const [min, hour, dom, , dow] = parts;
  const time = `${hour.padStart(2, "0")}:${min.padStart(2, "0")}`;
  const dayMap: Record<string, string> = {
    "1-5": "L-V", "1-7": "L-D", "*": "Todos los dias",
    "1": "Lunes", "2": "Martes", "3": "Miercoles", "4": "Jueves", "5": "Viernes",
  };
  const dayStr = dow !== "*" ? (dayMap[dow] || `dia ${dow}`) : (dom !== "*" ? `dia ${dom} del mes` : "Diario");
  return `${time} ${dayStr}`;
}

/** Read raw jobs-state.json once per request */
let _jobsStateCache: { mtime: number; data: Record<string, { state?: { lastRunAtMs?: number; lastRunStatus?: string } }> } | null = null;
function loadJobsState(): Record<string, { state?: { lastRunAtMs?: number; lastRunStatus?: string } }> {
  const f = cronJobsStateFile();
  if (!fs.existsSync(f)) return {};
  try {
    const stat = fs.statSync(f);
    if (_jobsStateCache && _jobsStateCache.mtime === stat.mtimeMs) return _jobsStateCache.data;
    const parsed = JSON.parse(fs.readFileSync(f, "utf-8"));
    const data = parsed.jobs || {};
    _jobsStateCache = { mtime: stat.mtimeMs, data };
    return data;
  } catch {
    return {};
  }
}

/** Get the last execution. Prefers per-day recurring-tasks JSON (rich:
 *  surfaces last_finding/last_error written by the agent), falls back to
 *  jobs-state.json (always present, but only carries the openclaw-side
 *  status + delivery error — not the agent's human-readable summary). */
interface LastExecution {
  date: string;
  status: string;
  /** 1-2 sentence summary the agent wrote in recurring-tasks/{date}.json,
   *  e.g. "5 ideas nuevas hoy. Highlight: idea-... pov_confidence 0.95." */
  last_finding?: string | null;
  /** Error message from the cron runner or the agent — preferred over a
   *  generic "error" status pill. */
  last_error?: string | null;
}

function getLastExecution(slug: string, cronName: string, jobId: string): LastExecution | null {
  // The cron has two reporting surfaces and they can diverge:
  //
  //   (a) `recurring-tasks/{folder}/{YYYY-MM-DD}.json` — written by the
  //       AGENT at the end of its prompt (PASO N · RECURRING TASKS).
  //       Carries `last_finding` (the 1-2 line human summary) and the
  //       agent's own framing of any errors that happened mid-prompt.
  //       BUT: if the run dies before that step (preflight reject,
  //       LLM billing failure, gateway restart, …), this file is NOT
  //       updated and we read a stale entry from a previous run.
  //
  //   (b) `cron/jobs-state.json` — written by the OPENCLAW CRON RUNNER
  //       at the end of every run regardless of success. Always current,
  //       but lacks `last_finding`.
  //
  // Strategy: read both. If (b) is newer than (a)'s file mtime, the
  // recurring-tasks JSON is stale relative to the runner's last attempt,
  // so we prefer (b)'s status + error. Otherwise we take (a)'s richer
  // payload but still overlay (b)'s lastError when the file's `error`
  // field is empty (catches successful agent + failed delivery cases).
  const BASE = path.join(process.env.HOME || "", ".openclaw", "workspace-sancho");
  const nameMap: Record<string, string> = {
    "News Monitor": "content-news-monitor",
    "Competitor Monitor": "content-competitor-monitor",
    "Classify + Ideas": "content-ideas",
    "Editorial Dispatch": "content-editorial-dispatch",
    "PAA Monitor": "content-paa-monitor",
    "Keyword Research": "content-keyword-research",
    "POV Bank Refresh": "content-pov-bank",
    "Idea Dedupe Audit": "content-dedupe-audit",
  };
  const baseName = cronName.replace(/^Content:\s*/, "").replace(/\s*—\s*.*$/, "").trim();

  const runtime = loadJobsState()[jobId]?.state as
    | { lastRunAtMs?: number; lastDurationMs?: number; lastRunStatus?: string; lastError?: string }
    | undefined;

  // Locate the most recent recurring-tasks file for this cron (if any).
  let filePath: string | null = null;
  let fileMtimeMs = 0;
  let fileData:
    | { date?: string; status?: string; last_finding?: string; error?: string }
    | null = null;
  const folderName = nameMap[baseName];
  if (folderName) {
    const dir = path.join(BASE, "brand", slug, "recurring-tasks", folderName);
    if (fs.existsSync(dir)) {
      const files = fs.readdirSync(dir).filter((f) => f.endsWith(".json")).sort().reverse();
      if (files.length > 0) {
        filePath = path.join(dir, files[0]);
        try {
          fileMtimeMs = fs.statSync(filePath).mtimeMs;
          fileData = JSON.parse(fs.readFileSync(filePath, "utf-8"));
        } catch {
          // Treat unreadable file as missing — fall through to runtime.
          filePath = null;
          fileMtimeMs = 0;
          fileData = null;
        }
      }
    }
  }

  // The runtime ran AFTER the agent's last write to the file (or there
  // is no file). Show the runner's view — that's the truth of what
  // happened in the most recent attempt.
  const runtimeIsNewer = runtime?.lastRunAtMs && runtime.lastRunAtMs > fileMtimeMs + 1000;
  if (runtimeIsNewer && runtime?.lastRunAtMs) {
    return {
      date: new Date(runtime.lastRunAtMs).toISOString(),
      status: runtime.lastRunStatus || "unknown",
      last_finding: null,
      last_error: runtime.lastError ?? null,
    };
  }

  // We have a recent recurring-tasks file — use it as the base. Overlay
  // the runner's `lastError` only when the file doesn't carry one
  // (covers "agent succeeded → cron-runner delivery failed").
  if (fileData) {
    return {
      date: fileData.date || (filePath ? path.basename(filePath, ".json") : ""),
      status: fileData.status || "ok",
      last_finding: fileData.last_finding ?? null,
      last_error: fileData.error ?? runtime?.lastError ?? null,
    };
  }

  // No file at all — fall back to runtime alone.
  if (runtime?.lastRunAtMs) {
    return {
      date: new Date(runtime.lastRunAtMs).toISOString(),
      status: runtime.lastRunStatus || "unknown",
      last_finding: null,
      last_error: runtime.lastError ?? null,
    };
  }
  return null;
}

/** Short description for each cron type */
const DESCRIPTIONS: Record<string, string> = {
  "News Monitor": "Busca noticias relevantes por pillar via WebSearch. Genera research signals.",
  "Competitor Monitor": "Monitorea competidores y creators referentes. Extrae top content + por que funciono.",
  "Classify + Ideas": "Clasifica signals en 7 tipos + genera ideas con angle_draft para el Idea Queue.",
  "Editorial Dispatch": "Selecciona 3-5 ideas del dia y las propone al humano para aprobacion.",
  "PAA Monitor": "Extrae preguntas People Also Ask por pillar. Semanal.",
  "Keyword Research": "Investiga keywords SEO por pillar. BOFU-first. Semanal.",
  "POV Bank Refresh": "Analiza patrones del clarify-history y refina Brand Voice. Mensual.",
};

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === "GET") {
    const slug = req.query.slug as string;
    if (!slug) return res.status(400).json({ error: "Missing slug" });

    const data = loadJobs();
    const matchedJobs = data.jobs
      .filter((j) => j.name.startsWith("Content:"))
      .filter((j) => {
        // Match jobs for this slug (check if the prompt mentions the slug)
        const msg = j.payload?.message || "";
        return msg.includes(`brand/${slug}/`) || msg.includes(`para ${slug}`) || j.name.toLowerCase().includes(slug.toLowerCase());
      });

    // Build a {jobId → lastEnd} map first so getRunningCronJobs can
    // distinguish a fresh session touch (in-flight) from a session that
    // was just touched by the run that already finished.
    const jobsState = loadJobsState();
    const jobsEndedAt: Record<string, { lastRunAtMs?: number; lastDurationMs?: number }> = {};
    for (const j of matchedJobs) {
      const s = jobsState[j.id]?.state as { lastRunAtMs?: number; lastDurationMs?: number } | undefined;
      jobsEndedAt[j.id] = { lastRunAtMs: s?.lastRunAtMs, lastDurationMs: s?.lastDurationMs };
    }
    const runningMap = getRunningCronJobs(jobsEndedAt);

    const contentJobs = matchedJobs.map((j) => {
      const baseName = j.name.replace(/^Content:\s*/, "").replace(/\s*—\s*.*$/, "").trim();
      const live = runningMap.get(j.id);
      return {
        id: j.id,
        name: j.name,
        baseName,
        description: DESCRIPTIONS[baseName] || "",
        enabled: Boolean(j.enabled),
        schedule: j.schedule?.expr || "",
        scheduleHuman: humanizeCron(j.schedule?.expr || ""),
        timezone: j.schedule?.tz || "",
        model: j.payload?.model || "unknown",
        lastExecution: getLastExecution(slug, j.name, j.id),
        running: live
          ? {
              startedAtMs: live.startedAtMs,
              lastTouchMs: live.lastTouchMs,
              sessionId: live.sessionId,
            }
          : null,
        promptPreview: (j.payload?.message || "").slice(0, 200) + "...",
        promptFull: j.payload?.message || "",
      };
    });

    const stats = {
      total: contentJobs.length,
      active: contentJobs.filter((j) => j.enabled).length,
      lastRun: contentJobs
        .map((j) => j.lastExecution?.date)
        .filter(Boolean)
        .sort()
        .reverse()[0] || null,
    };

    return res.status(200).json({ ok: true, crons: contentJobs, stats });
  }

  if (req.method === "PATCH") {
    const { jobId, fields } = req.body;
    if (!jobId || !fields) return res.status(400).json({ error: "Missing jobId or fields" });

    const data = loadJobs();
    const job = data.jobs.find((j) => j.id === jobId);
    if (!job) return res.status(404).json({ error: "Job not found" });

    // Allowed fields to update
    if (typeof fields.enabled === "boolean") job.enabled = fields.enabled;
    if (fields.schedule && typeof fields.schedule === "string") {
      job.schedule.expr = fields.schedule;
    }

    saveJobs(data);
    return res.status(200).json({ ok: true, job: { id: job.id, name: job.name, enabled: job.enabled, schedule: job.schedule.expr } });
  }

  if (req.method === "POST") {
    const { jobId, action } = req.body || {};
    if (action !== "run") return res.status(400).json({ error: "Unknown action: " + action });
    if (!jobId) return res.status(400).json({ error: "Missing jobId" });

    // Verify job exists
    const data = loadJobs();
    const job = data.jobs.find((j) => j.id === jobId);
    if (!job) return res.status(404).json({ error: "Job not found" });

    // Fire-and-forget: spawn `openclaw cron run <id>` detached.
    // The job runs via the Gateway and writes results to cron/runs/<id>.jsonl.
    try {
      const child = spawn("openclaw", ["cron", "run", jobId], {
        detached: true,
        stdio: "ignore",
        env: { ...process.env, PATH: EXEC_PATH },
      });
      child.unref();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return res.status(500).json({ error: "Failed to spawn cron run: " + msg });
    }

    return res.status(202).json({
      ok: true,
      message: "Triggered manual run",
      jobId,
      jobName: job.name,
    });
  }

  res.status(405).json({ error: "Method not allowed" });
}

export default withErrorHandler(handler);
