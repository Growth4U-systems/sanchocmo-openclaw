import type { NextApiRequest, NextApiResponse } from "next";
import { execSync } from "child_process";
import { compose, withErrorHandler, withAuth } from "@/lib/api-middleware";

const EXEC_PATH = "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin";

/**
 * POST /api/system/cron-toggle
 * Toggles an OpenClaw cron task on/off
 * Body: { cronId: string, enable: boolean }
 */
async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  }

  if (!req.ctx?.isAdmin) {
    return res.status(403).json({ error: "Admin only" });
  }

  const { cronId, enable } = req.body;
  if (!cronId || typeof enable !== "boolean") {
    return res.status(400).json({ error: "Missing cronId or enable" });
  }

  try {
    const cmd = enable ? "enable" : "disable";
    execSync(`openclaw cron ${cmd} ${cronId} 2>/dev/null`, {
      timeout: 10000,
      encoding: "utf-8",
      env: { ...process.env, PATH: EXEC_PATH },
    });
    return res.status(200).json({ ok: true, cronId, enabled: enable });
  } catch (e) {
    return res.status(500).json({
      error: "Failed to toggle cron: " + (e instanceof Error ? e.message : String(e)),
    });
  }
}

export default compose(withErrorHandler, withAuth)(handler);
