import type { NextApiRequest, NextApiResponse } from "next";
import { compose, withErrorHandler, withAuth } from "@/lib/api-middleware";

const LEGACY_PORT = process.env.LEGACY_PORT || "18790";

/**
 * GET /api/system/recurring-tasks
 * Proxies to legacy mc-server for recurring tasks data
 */
async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  }

  const upstream = await fetch(`http://localhost:${LEGACY_PORT}/api/recurring-tasks`);
  const data = await upstream.json();
  res.status(upstream.status).json(data);
}

export default compose(withErrorHandler, withAuth)(handler);
