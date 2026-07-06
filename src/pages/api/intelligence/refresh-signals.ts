import type { NextApiRequest, NextApiResponse } from "next";
import { withErrorHandler } from "@/lib/api-middleware";
import { refreshMetricoolSignals } from "@/lib/data/intelligence/adapters/metricool-signals";

// POST /api/intelligence/refresh-signals  { slug }  — local-only cron runner.
// Re-collects this brand's published-content Metricool metrics into the `signals`
// table so the detect engine (SAN-270) can query content performance (SAN-271).
// Idempotent; safe to run daily.

function isLocalRequest(req: NextApiRequest) {
  const remote = req.socket.remoteAddress || "";
  return remote === "127.0.0.1" || remote === "::1" || remote === "::ffff:127.0.0.1";
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  }
  if (!isLocalRequest(req)) {
    return res.status(403).json({ error: "Signals refresh runner is local-only." });
  }

  const slug = req.body?.slug || req.query.slug;
  if (!slug || typeof slug !== "string") return res.status(400).json({ error: "Missing slug" });

  const result = await refreshMetricoolSignals(slug);
  return res.status(result.ok ? 200 : 503).json(result);
}

export default withErrorHandler(handler);
