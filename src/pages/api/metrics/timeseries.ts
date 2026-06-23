import type { NextApiRequest, NextApiResponse } from "next";
import { compose, withErrorHandler, withAuth, canAccessSlug } from "@/lib/api-middleware";
import {
  getMetricsTimeSeries,
  getSurfaceSummary,
  getSourceScorecards,
  getTrend,
  getNorthStar,
} from "@/lib/data/metrics";

/**
 * Read layer over the metric_snapshots time-series (Métricas v2 PR-5a). Mirrors
 * the MCP tool `sancho_get_metrics_timeseries` so the UI and Merlin read the same
 * data: `view=series|surfaces|scorecards|trend|northstar`. All views degrade to
 * `{ configured: false }` without DATABASE_URL — the page then falls back to the
 * file-based `/api/metrics` pipeline.
 */
const DAY_MS = 86_400_000;
function fmtDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  }

  const slug = req.ctx?.clientSlug || (req.query.slug as string);
  if (!slug) {
    return res.status(400).json({ error: "Missing slug" });
  }
  if (!canAccessSlug(req.ctx, slug)) {
    return res.status(403).json({ error: "Forbidden" });
  }

  const view = (req.query.view as string) || "series";
  const source = req.query.source as string | undefined;
  const metric = req.query.metric as string | undefined;
  const grain = req.query.grain as string | undefined;
  const from = req.query.from as string | undefined;
  const to = req.query.to as string | undefined;

  switch (view) {
    case "surfaces":
      return res.status(200).json(await getSurfaceSummary(slug, { from, to }));
    case "scorecards":
      return res.status(200).json(await getSourceScorecards(slug, { from, to }));
    case "northstar":
      return res.status(200).json(getNorthStar(slug));
    case "trend": {
      const toDate = to ?? fmtDate(new Date());
      const fromDate = from ?? fmtDate(new Date(Date.now() - 7 * DAY_MS));
      return res.status(200).json(await getTrend(slug, { source, metric, from: fromDate, to: toDate }));
    }
    case "series":
    default:
      return res.status(200).json(await getMetricsTimeSeries(slug, { source, metric, grain, from, to }));
  }
}

export default compose(withErrorHandler, withAuth)(handler);
