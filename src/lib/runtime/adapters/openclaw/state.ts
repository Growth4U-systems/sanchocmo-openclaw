import fs from "fs";
import os from "os";
import path from "path";
import type { RuntimeJobEndedAt, RuntimeRunningCron } from "../../types";

export interface SessionEntry {
  sessionId?: string;
  updatedAt?: number;
  [key: string]: unknown;
}

export type RunningCron = RuntimeRunningCron;
export type JobEndedAt = RuntimeJobEndedAt;

export function openclawHome(): string {
  return process.env.OPENCLAW_HOME || path.join(os.homedir(), ".openclaw");
}

// Newer OpenClaw versions store runtime state under a nested `.openclaw/`
// subdirectory inside OPENCLAW_HOME (e.g. `~/.openclaw/.openclaw/cron/jobs.json`).
// Older deployments kept it flat (`~/.openclaw/cron/jobs.json`). We probe at
// resolve-time so the app works regardless of which layout the host uses.
export function openclawRuntimeFile(...segments: string[]): string {
  const home = openclawHome();
  const nested = path.join(home, ".openclaw", ...segments);
  const flat = path.join(home, ...segments);
  if (fs.existsSync(nested)) return nested;
  if (fs.existsSync(flat)) return flat;
  return nested;
}

export const cronJobsFile = () => openclawRuntimeFile("cron", "jobs.json");
export const cronJobsStateFile = () => openclawRuntimeFile("cron", "jobs-state.json");

// Agent session store. We default to `sancho` because every cron job runs
// under that agent (see `agentId: "sancho"` in cron templates); if a future
// brand uses a different agent we can derive the path from the job's agentId.
export const agentSessionsFile = (agent = "sancho") =>
  openclawRuntimeFile("agents", agent, "sessions", "sessions.json");

// 600s instead of 90s because openclaw only writes `updatedAt` near the start
// of a cron session and does not bump it across long agent steps.
const DEFAULT_FRESHNESS_MS = 600_000;
const SESSION_KEY_RE = /^agent:[^:]+:cron:([0-9a-f-]+)$/;

export function loadAgentSessions(agent = "sancho"): Record<string, SessionEntry> {
  const file = agentSessionsFile(agent);
  if (!fs.existsSync(file)) return {};
  try {
    const raw = fs.readFileSync(file, "utf-8");
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function getRunningCronJobs(
  jobsEndedAt: Record<string, JobEndedAt>,
  opts: { agent?: string; freshnessMs?: number; now?: number } = {},
): Map<string, RunningCron> {
  const agent = opts.agent ?? "sancho";
  const now = opts.now ?? Date.now();
  const freshness = opts.freshnessMs ?? DEFAULT_FRESHNESS_MS;
  const sessions = loadAgentSessions(agent);
  const running = new Map<string, RunningCron>();

  for (const [key, entry] of Object.entries(sessions)) {
    const m = key.match(SESSION_KEY_RE);
    if (!m) continue;
    const jobId = m[1];
    const updatedAt = entry.updatedAt;
    if (typeof updatedAt !== "number") continue;
    if (now - updatedAt > freshness) continue;

    const prev = jobsEndedAt[jobId];
    const lastEnd = (prev?.lastRunAtMs ?? 0) + (prev?.lastDurationMs ?? 0);
    if (lastEnd > 0 && updatedAt <= lastEnd + 1) continue;

    // Lower bound for the in-flight run's start. If we have a previous end,
    // the new run started after it. Cap at `now - freshnessMs` to avoid
    // reporting hour-old durations when the previous run was distant.
    const flooredStart = Math.max(lastEnd, now - freshness, updatedAt - 30_000);
    running.set(jobId, {
      jobId,
      sessionId: typeof entry.sessionId === "string" ? entry.sessionId : null,
      startedAtMs: flooredStart,
      lastTouchMs: updatedAt,
    });
  }

  return running;
}
