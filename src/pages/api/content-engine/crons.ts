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
  return JSON.parse(fs.readFileSync(cronJobsFile(), "utf-8"));
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

/** Get the last execution. Prefers per-day recurring-tasks JSON, falls back to jobs-state.json. */
function getLastExecution(slug: string, cronName: string, jobId: string): { date: string; status: string } | null {
  // 1) Try recurring-tasks (richer info: status from cron output)
  const BASE = path.join(process.env.HOME || "", ".openclaw", "workspace-sancho");
  const nameMap: Record<string, string> = {
    "News Monitor": "content-news-monitor",
    "Competitor Monitor": "content-competitor-monitor",
    "Classify + Ideas": "content-ideas",
    "Editorial Dispatch": "content-editorial-dispatch",
    "PAA Monitor": "content-paa-monitor",
    "Keyword Research": "content-keyword-research",
    "POV Bank Refresh": "content-pov-bank",
  };
  const baseName = cronName.replace(/^Content:\s*/, "").replace(/\s*—\s*.*$/, "").trim();
  const folderName = nameMap[baseName];
  if (folderName) {
    const dir = path.join(BASE, "brand", slug, "recurring-tasks", folderName);
    if (fs.existsSync(dir)) {
      const files = fs.readdirSync(dir).filter((f) => f.endsWith(".json")).sort().reverse();
      if (files.length > 0) {
        try {
          const data = JSON.parse(fs.readFileSync(path.join(dir, files[0]), "utf-8"));
          return { date: data.date || files[0].replace(".json", ""), status: data.status || "ok" };
        } catch {
          return { date: files[0].replace(".json", ""), status: "unknown" };
        }
      }
    }
  }

  // 2) Fallback to runtime jobs-state.json (always written by the cron runner)
  const state = loadJobsState()[jobId];
  if (state?.state?.lastRunAtMs) {
    return {
      date: new Date(state.state.lastRunAtMs).toISOString(),
      status: state.state.lastRunStatus || "unknown",
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
    const contentJobs = data.jobs
      .filter((j) => j.name.startsWith("Content:"))
      .filter((j) => {
        // Match jobs for this slug (check if the prompt mentions the slug)
        const msg = j.payload?.message || "";
        return msg.includes(`brand/${slug}/`) || msg.includes(`para ${slug}`) || j.name.toLowerCase().includes(slug.toLowerCase());
      })
      .map((j) => {
        const baseName = j.name.replace(/^Content:\s*/, "").replace(/\s*—\s*.*$/, "").trim();
        return {
          id: j.id,
          name: j.name,
          baseName,
          description: DESCRIPTIONS[baseName] || "",
          enabled: j.enabled,
          schedule: j.schedule.expr,
          scheduleHuman: humanizeCron(j.schedule.expr),
          timezone: j.schedule.tz,
          model: j.payload?.model || "unknown",
          lastExecution: getLastExecution(slug, j.name, j.id),
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
