import type { NextApiRequest, NextApiResponse } from "next";
import { execSync } from "child_process";
import { withAuth, withErrorHandler, compose } from "@/lib/api-middleware";

/**
 * GET /api/system/restart-gateway
 * Ported from mc-server.js:8678
 * Restarts the OpenClaw gateway
 */
async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Admin only
  if (!req.ctx?.isAdmin) {
    return res.status(403).json({ error: "Admin only" });
  }

  res.setHeader("Access-Control-Allow-Origin", "*");
  try {
    execSync("/opt/homebrew/bin/openclaw gateway restart 2>&1", {
      timeout: 30000,
      encoding: "utf-8",
    });
    res.status(200).json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message.slice(0, 200) : "Unknown error";
    res.status(200).json({ ok: false, error: msg });
  }
}

export default compose(withErrorHandler, withAuth)(handler);
