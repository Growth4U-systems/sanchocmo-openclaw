import fs from "fs";
import os from "os";
import path from "path";

const OPENCLAW_HOME = process.env.OPENCLAW_HOME || path.join(os.homedir(), ".openclaw");

// Newer OpenClaw versions store runtime state under a nested `.openclaw/`
// subdirectory inside OPENCLAW_HOME (e.g. `~/.openclaw/.openclaw/cron/jobs.json`).
// Older deployments kept it flat (`~/.openclaw/cron/jobs.json`). We probe at
// resolve-time so the app works regardless of which layout the host uses.
export function openclawRuntimeFile(...segments: string[]): string {
  const nested = path.join(OPENCLAW_HOME, ".openclaw", ...segments);
  const flat = path.join(OPENCLAW_HOME, ...segments);
  if (fs.existsSync(nested)) return nested;
  if (fs.existsSync(flat)) return flat;
  return nested;
}

export const cronJobsFile = () => openclawRuntimeFile("cron", "jobs.json");
export const cronJobsStateFile = () => openclawRuntimeFile("cron", "jobs-state.json");
