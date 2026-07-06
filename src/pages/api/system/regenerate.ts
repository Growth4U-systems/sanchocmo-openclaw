import type { NextApiRequest, NextApiResponse } from "next";
import { execSync } from "child_process";
import { withAuth, withErrorHandler, compose } from "@/lib/api-middleware";
import { BASE } from "@/lib/data/paths";

/**
 * POST /api/system/regenerate
 * Ported from mc-server.js:6812
 * Regenerates mc-data.js
 */
async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!req.ctx?.isAdmin) {
    return res.status(403).json({ error: "Admin only" });
  }

  try {
    execSync("python3 scripts/regenerate.py", {
      cwd: BASE,
      timeout: 30000,
      encoding: "utf-8",
    });
    res.status(200).json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message.slice(0, 300) : "Regenerate failed";
    res.status(500).json({ error: msg });
  }
}

export default compose(withErrorHandler, withAuth)(handler);
