/**
 * POST /api/system/cron-run — trigger a manual run of any openclaw cron.
 *
 * Admin-only (cost + side-effect surface). Body: { cronId: string }.
 *
 * The job runs detached via the openclaw daemon; we return 202 immediately
 * and the caller polls /api/recurring-tasks (or /api/system/cron-status)
 * for live state.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { spawn } from "child_process";
import { compose, withErrorHandler, withAuth } from "@/lib/api-middleware";
import { loadAllCrons, getLiveStatuses } from "@/lib/data/openclaw-crons";
import { EXEC_PATH } from "@/lib/data/paths";

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  }

  if (!req.ctx?.isAdmin) {
    return res.status(403).json({ error: "Admin only" });
  }

  const cronId = req.body?.cronId;
  if (!cronId || typeof cronId !== "string") {
    return res.status(400).json({ error: "Missing cronId" });
  }

  const job = loadAllCrons().find((j) => j.id === cronId);
  if (!job) {
    return res.status(404).json({ error: "Cron not found" });
  }

  // Defense-in-depth: if the live status already shows running, don't
  // double-dispatch. The UI also disables the button locally for ~90s but
  // a stale tab could still POST.
  const live = getLiveStatuses([cronId])[cronId];
  if (live?.running) {
    return res.status(409).json({
      error: "Cron is already running",
      startedAtMs: live.startedAtMs,
    });
  }

  try {
    const child = spawn("openclaw", ["cron", "run", cronId], {
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
    cronId,
    jobName: job.name,
    triggeredAt: Date.now(),
  });
}

export default compose(withErrorHandler, withAuth)(handler);
