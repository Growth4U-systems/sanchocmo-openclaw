import type { NextApiRequest, NextApiResponse } from "next";
import { withAuth, withErrorHandler, compose } from "@/lib/api-middleware";
import { getRuntime } from "@/lib/runtime";

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
  const result = await getRuntime().lifecycle.restart();
  res.status(200).json(result);
}

export default compose(withErrorHandler, withAuth)(handler);
