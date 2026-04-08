import type { NextApiRequest, NextApiResponse } from "next";
import { compose, withErrorHandler, withAuth } from "@/lib/api-middleware";

const LEGACY_PORT = process.env.LEGACY_PORT || "18790";

/**
 * POST /api/system/cron-toggle
 * Proxies to legacy mc-server for toggling cron tasks
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

  const upstream = await fetch(`http://localhost:${LEGACY_PORT}/api/crons/toggle`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req.body),
  });
  const data = await upstream.json();
  res.status(upstream.status).json(data);
}

export default compose(withErrorHandler, withAuth)(handler);
