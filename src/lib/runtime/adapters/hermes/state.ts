import fs from "fs";
import os from "os";
import path from "path";
import type { RuntimeJobEndedAt, RuntimeRunningCron } from "../../types";

export function hermesHome(): string {
  return process.env.HERMES_HOME || path.join(os.homedir(), ".hermes");
}

export function hermesRuntimeFile(...segments: string[]): string {
  return path.join(hermesHome(), ...segments);
}

export const cronJobsFile = () => hermesRuntimeFile("cron", "jobs.json");
export const cronJobsStateFile = () => hermesRuntimeFile("cron", "jobs-state.json");
export const agentSessionsFile = (agent = "sancho") =>
  hermesRuntimeFile("agents", agent, "sessions", "sessions.json");

export function loadAgentSessions(agent = "sancho"): Record<string, unknown> {
  const file = agentSessionsFile(agent);
  if (!fs.existsSync(file)) return {};
  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf-8"));
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function getRunningCronJobs(
  _jobsEndedAt: Record<string, RuntimeJobEndedAt>,
  _opts: { agent?: string; freshnessMs?: number; now?: number } = {},
): Map<string, RuntimeRunningCron> {
  return new Map();
}
