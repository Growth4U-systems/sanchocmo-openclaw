import type { NextApiRequest, NextApiResponse } from "next";
import {
  canAccessSlug,
  compose,
  withAuth,
  withErrorHandler,
} from "@/lib/api-middleware";
import {
  getMetricKpiReadModelReadThrough,
  type MetricKpiRangeKey,
} from "@/lib/data/metric-kpi-read-model";
import type { SurfaceKey } from "@/lib/metrics/surfaces";

const RANGES = new Set<MetricKpiRangeKey>(["1d", "7d", "30d", "90d"]);
const DASHBOARD_BLOCKS = new Set([
  "overview",
  "surface",
  "channels",
  "conversion",
  "trends",
]);
const SURFACES = new Set([
  "reputation",
  "web",
  "product",
  "pipeline",
  "paid",
  "email",
  "partnerships",
  "social",
]);

function firstString(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  }

  const slug = req.ctx?.clientSlug || firstString(req.query.slug);
  if (!slug) return res.status(400).json({ error: "Missing slug" });
  if (!canAccessSlug(req.ctx, slug)) {
    return res.status(403).json({ error: "Forbidden" });
  }

  const range = firstString(req.query.range);
  if (range && !RANGES.has(range as MetricKpiRangeKey)) {
    return res.status(400).json({ error: `Invalid range: ${range}` });
  }
  const dashboardBlock = firstString(req.query.dashboardBlock);
  if (dashboardBlock && !DASHBOARD_BLOCKS.has(dashboardBlock)) {
    return res.status(400).json({ error: `Invalid dashboardBlock: ${dashboardBlock}` });
  }
  const surface = firstString(req.query.surface);
  if (surface && !SURFACES.has(surface)) {
    return res.status(400).json({ error: `Invalid surface: ${surface}` });
  }

  return res.status(200).json(await getMetricKpiReadModelReadThrough(slug, {
    dashboardBlock: dashboardBlock as never,
    from: firstString(req.query.from),
    range,
    runId: firstString(req.query.runId),
    surface: surface as SurfaceKey | undefined,
    to: firstString(req.query.to),
  }));
}

export default compose(withErrorHandler, withAuth)(handler);
