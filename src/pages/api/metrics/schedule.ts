import type { NextApiRequest, NextApiResponse } from "next";
import { compose, withErrorHandler, withAuth, canAccessSlug } from "@/lib/api-middleware";
import { getResolvedSchedules, setCollectionSchedule } from "@/lib/data/metrics-schedule";

/**
 * Editable per-source collection cadence (SAN-300).
 *   GET /api/metrics/schedule?slug=  → resolved schedules (defaults + overrides)
 *   PUT /api/metrics/schedule?slug=  → upsert one source's cadence
 *       body: { source, cadence?, daysOfWeek?, cronExpr?, enabled? }
 * Without DATABASE_URL, GET returns an empty list and PUT errors.
 */
async function handler(req: NextApiRequest, res: NextApiResponse) {
  const slug = req.ctx?.clientSlug || (req.query.slug as string);
  if (!slug) return res.status(400).json({ error: "Missing slug" });
  if (!canAccessSlug(req.ctx, slug)) return res.status(403).json({ error: "Forbidden" });

  if (req.method === "GET") {
    const schedules = await getResolvedSchedules(slug);
    return res.status(200).json({ slug, schedules });
  }

  if (req.method === "PUT") {
    const body = (req.body ?? {}) as {
      source?: string;
      cadence?: string;
      daysOfWeek?: number[];
      cronExpr?: string | null;
      enabled?: boolean;
    };
    if (!body.source) return res.status(400).json({ error: "Missing source" });
    const schedule = await setCollectionSchedule(slug, body.source, {
      cadence: body.cadence,
      daysOfWeek: body.daysOfWeek,
      cronExpr: body.cronExpr,
      enabled: body.enabled,
    });
    return res.status(200).json({ slug, schedule });
  }

  res.setHeader("Allow", "GET, PUT");
  return res.status(405).json({ error: `Method ${req.method} not allowed` });
}

export default compose(withErrorHandler, withAuth)(handler);
