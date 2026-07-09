import crypto from "crypto";
import fs from "fs";
import type { MeetingIntelligenceConfig } from "@/lib/data/meeting-intelligence-db";
import { getRuntime } from "@/lib/runtime";

interface CronJob {
  id: string;
  agentId?: string;
  name: string;
  enabled: boolean;
  createdAtMs?: number;
  updatedAtMs?: number;
  schedule: { kind: string; expr: string; tz?: string };
  sessionTarget?: string;
  wakeMode?: string;
  payload?: { kind?: string; message?: string; model?: string };
  delivery?: Record<string, unknown>;
  state?: Record<string, unknown>;
  [key: string]: unknown;
}

interface CronData {
  version: number;
  jobs: CronJob[];
}

function loadJobs(): CronData | null {
  try {
    return JSON.parse(fs.readFileSync(getRuntime().state.cronJobsFile(), "utf-8")) as CronData;
  } catch {
    return null;
  }
}

function saveJobs(data: CronData) {
  fs.writeFileSync(getRuntime().state.cronJobsFile(), JSON.stringify(data, null, 2));
}

function loadJobState(jobId: string) {
  try {
    const parsed = JSON.parse(fs.readFileSync(getRuntime().state.cronJobsStateFile(), "utf-8")) as {
      jobs?: Record<string, { state?: Record<string, unknown> }>;
    };
    return parsed.jobs?.[jobId]?.state || null;
  } catch {
    return null;
  }
}

function configuredSourceCount(config: MeetingIntelligenceConfig) {
  const drive = config.sources.googleDrive.enabled
    ? config.sources.googleDrive.folders.filter((scope) => scope.id || scope.url).length
    : 0;
  const notion = config.sources.notion.enabled
    ? [...config.sources.notion.databases, ...config.sources.notion.pages].filter((scope) => scope.id || scope.url).length
    : 0;
  const slack = config.sources.slack.enabled ? config.sources.slack.channels.length : 0;
  const discord = config.sources.discord.enabled ? config.sources.discord.channels.length : 0;
  return drive + notion + slack + discord;
}

function findMeetingIntelligenceJob(jobs: CronJob[], slug: string, preferredId?: string | null) {
  return jobs.find((job) => preferredId && job.id === preferredId)
    || jobs.find((job) => {
      const name = (job.name || "").toLowerCase();
      const message = (job.payload?.message || "").toLowerCase();
      return name.includes("meeting intelligence") && (message.includes(`"slug":"${slug}"`) || message.includes(`slug\":\"${slug}`) || message.includes(slug));
    });
}

function buildPayload(slug: string, limit: number) {
  return `Ejecuta el cron backend de Meeting Intelligence para ${slug} usando Neon como source of truth.

Comando unico:
curl -sS -X POST http://127.0.0.1:3000/api/meeting-intelligence/run-cron -H 'Content-Type: application/json' --data '{"slug":"${slug}","trigger":"cron","limit":${limit}}'

Reglas:
- No guardes meetings, transcripts, summaries, insights ni recommendations en JSON legacy.
- Si Meeting Intelligence o su automatic sync estan desactivados en Neon, el backend respondera skipped=true y no debes forzar nada.
- El backend debe leer mi_sources, bajar raw_text desde Drive/Notion, guardar mi_meetings y mi_meeting_artifacts en Neon, analizar decisions/actions/insights/impact y crear mi_recommendations como task drafts en estado recommended.
- StrategyPlan, Foundation docs y POV siguen review-first: no apliques cambios directos.
- Si el endpoint devuelve ok=true, reporta solo metricas: rawAvailable, insights, recommendations y errores.
- Si devuelve error, reporta el error sin intentar escribir datos legacy.`;
}

function nextDailyRunIso(expr: string) {
  const parts = expr.split(/\s+/);
  if (parts.length !== 5 || parts[2] !== "*" || parts[3] !== "*" || parts[4] !== "*") return null;
  const minute = Number(parts[0]);
  const hour = Number(parts[1]);
  if (!Number.isFinite(minute) || !Number.isFinite(hour)) return null;
  const next = new Date();
  next.setSeconds(0, 0);
  next.setHours(hour, minute, 0, 0);
  if (next.getTime() <= Date.now()) next.setDate(next.getDate() + 1);
  return next.toISOString();
}

export function getMeetingIntelligenceCronStatus(slug: string, cronJobId?: string | null) {
  const data = loadJobs();
  if (!data) return { configured: false, job: null, error: "Could not read cron/jobs.json" };
  const job = findMeetingIntelligenceJob(data.jobs || [], slug, cronJobId);
  if (!job) return { configured: false, job: null };
  const state = loadJobState(job.id);
  return {
    configured: true,
    job: {
      id: job.id,
      name: job.name,
      enabled: job.enabled !== false,
      schedule: job.schedule,
      nextRunAt: nextDailyRunIso(job.schedule.expr) || (typeof state?.nextRunAtMs === "number" ? new Date(state.nextRunAtMs).toISOString() : null),
      lastRunAt: typeof state?.lastRunAtMs === "number" ? new Date(state.lastRunAtMs).toISOString() : null,
      lastStatus: typeof state?.lastRunStatus === "string" ? state.lastRunStatus : null,
      consecutiveErrors: typeof state?.consecutiveErrors === "number" ? state.consecutiveErrors : 0,
    },
  };
}

export function syncMeetingIntelligenceCron(config: MeetingIntelligenceConfig) {
  const data = loadJobs();
  if (!data) return { ok: false, cron: { configured: false, job: null, error: "Could not read cron/jobs.json" } };

  const now = Date.now();
  const sourcesConfigured = configuredSourceCount(config);
  const shouldRun = config.enabled && config.sync.enabled && sourcesConfigured > 0;
  let job = findMeetingIntelligenceJob(data.jobs || [], config.slug, config.sync.cronJobId);

  if (!job && sourcesConfigured > 0) {
    job = {
      id: crypto.randomUUID(),
      agentId: "sancho",
      name: `Meeting Intelligence — ${config.slug}`,
      enabled: shouldRun,
      createdAtMs: now,
      updatedAtMs: now,
      schedule: {
        kind: "cron",
        expr: config.sync.cronExpr,
        tz: config.sync.timezone,
      },
      sessionTarget: "isolated",
      wakeMode: "now",
      payload: {
        kind: "agentTurn",
        message: buildPayload(config.slug, config.sync.limit),
        model: "gpt-5.2",
      },
      delivery: {
        mode: "none",
      },
      state: {},
    };
    data.jobs.push(job);
  }

  if (job) {
    job.name = `Meeting Intelligence — ${config.slug}`;
    job.enabled = shouldRun;
    job.updatedAtMs = now;
    job.schedule = {
      kind: "cron",
      expr: config.sync.cronExpr,
      tz: config.sync.timezone,
    };
    job.payload = {
      ...(job.payload || {}),
      kind: "agentTurn",
      message: buildPayload(config.slug, config.sync.limit),
      model: job.payload?.model || "gpt-5.2",
    };
    job.delivery = job.delivery || { mode: "none" };
  }

  saveJobs(data);
  return { ok: true, cron: getMeetingIntelligenceCronStatus(config.slug, job?.id || config.sync.cronJobId) };
}
