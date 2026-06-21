import type { NextApiRequest, NextApiResponse } from "next";
import { compose, withErrorHandler, withAuth, canAccessSlug } from "@/lib/api-middleware";
import { getDueSources, getResolvedSchedules, setCollectionSchedule } from "@/lib/data/metrics-schedule";

/**
 * Editable per-source collection cadence (SAN-300).
 *   GET /api/metrics/schedule?slug=                       → resolved schedules
 *   GET /api/metrics/schedule?slug=&due=1&sources=a,b,c   → { due: [...] } today
 *   PUT /api/metrics/schedule?slug=                       → upsert one source
 *       body: { source, cadence?, daysOfWeek?, cronExpr?, enabled? }
 * Without DATABASE_URL, GET returns an empty list and PUT errors.
 */
async function handler(req: NextApiRequest, res: NextApiResponse) {
  const slug = req.ctx?.clientSlug || (req.query.slug as string);
  if (!slug) return res.status(400).json({ error: "Missing slug" });
  if (!canAccessSlug(req.ctx, slug)) return res.status(403).json({ error: "Forbidden" });

  if (req.method === "GET") {
    // due-check mode for the collector: which of these sources run today?
    if (req.query.due && typeof req.query.sources === "string") {
      const sources = req.query.sources.split(",").map((s) => s.trim()).filter(Boolean);
      const due = await getDueSources(slug, sources);
      return res.status(200).json({ slug, due });
    }
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
