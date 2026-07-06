import type { NextApiRequest, NextApiResponse } from "next";
import pkg from "../../../package.json";

const STARTED_AT = Date.now();

/**
 * GET /api/health
 *
 * Liveness endpoint for deploy verification, monitoring, and load balancers.
 * No auth, no I/O — designed to respond in single-digit ms.
 */
export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  res.setHeader("Cache-Control", "no-store");
  return res.status(200).json({
    ok: true,
    version: pkg.version,
    commit: process.env.GIT_COMMIT ?? null,
    env: process.env.NEXT_PUBLIC_ENV_LABEL || process.env.NODE_ENV || "unknown",
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor((Date.now() - STARTED_AT) / 1000),
  });
}
