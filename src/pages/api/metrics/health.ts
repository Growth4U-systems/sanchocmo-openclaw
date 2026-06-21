import type { NextApiRequest, NextApiResponse } from "next";
import { compose, withErrorHandler, withAuth, canAccessSlug } from "@/lib/api-middleware";
import { getMetricsHealth } from "@/lib/data/metrics";

/**
 * GET /api/metrics/health?slug= → per-source collection health (last data, age,
 * due-today, overdue vs cadence, latest ledger status) + a global cron-degraded
 * signal. Degrades to { configured:false } without DATABASE_URL (SAN-300).
 */
async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  }
  const slug = req.ctx?.clientSlug || (req.query.slug as string);
  if (!slug) return res.status(400).json({ error: "Missing slug" });
  if (!canAccessSlug(req.ctx, slug)) return res.status(403).json({ error: "Forbidden" });
  return res.status(200).json(await getMetricsHealth(slug));
}

export default compose(withErrorHandler, withAuth)(handler);
