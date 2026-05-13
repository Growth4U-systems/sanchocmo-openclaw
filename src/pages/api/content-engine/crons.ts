/**
 * GET/PATCH /api/content-engine/crons — Manage Content Engine cron jobs
 *
 * GET ?slug=X → returns all Content Engine crons for this client
 * PATCH { jobId, fields } → update job (enabled, schedule)
 */

import type { NextApiRequest, NextApiResponse } from "next";
import fs from "fs";
import path from "path";
import { withErrorHandler } from "@/lib/api-middleware";

const CRON_FILE = path.join(process.env.HOME || "", ".openclaw", "cron", "jobs.json");

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
  return JSON.parse(fs.readFileSync(CRON_FILE, "utf-8"));
}

function saveJobs(data: { version: number; jobs: CronJob[] }) {
  fs.writeFileSync(CRON_FILE, JSON.stringify(data, null, 2));
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

/** Get the last execution from recurring-tasks */
function getLastExecution(slug: string, cronName: string): { date: string; status: string } | null {
  // Map cron names to recurring-tasks folder names
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

  // Extract the base name (remove "Content: " prefix and " — {client}" suffix)
  const baseName = cronName.replace(/^Content:\s*/, "").replace(/\s*—\s*.*$/, "").trim();
  const folderName = nameMap[baseName];
  if (!folderName) return null;

  const dir = path.join(BASE, "brand", slug, "recurring-tasks", folderName);
  if (!fs.existsSync(dir)) return null;

  const files = fs.readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .reverse();
  if (files.length === 0) return null;

  try {
    const data = JSON.parse(fs.readFileSync(path.join(dir, files[0]), "utf-8"));
    return { date: data.date || files[0].replace(".json", ""), status: data.status || "ok" };
  } catch {
    return { date: files[0].replace(".json", ""), status: "unknown" };
  }
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
          lastExecution: getLastExecution(slug, j.name),
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

  res.status(405).json({ error: "Method not allowed" });
}

export default withErrorHandler(handler);
