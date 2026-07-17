import type { NextApiRequest, NextApiResponse } from "next";
import { compose, withErrorHandler, withAuth, canAccessSlug } from "@/lib/api-middleware";
import {
  getMetricsTimeSeries,
  getSurfaceSummary,
  getSourceScorecards,
  getTrend,
  getNorthStar,
} from "@/lib/data/metrics";
import {
  resolveMetricKpiReadRange,
  type MetricKpiRangeKey,
} from "@/lib/data/metric-kpi-read-model";
import {
  assertMetricSurfaceDetailRange,
  getMetricSurfaceDetail,
} from "@/lib/data/metric-surface-detail";
import { metricCalendarRangeError } from "@/lib/metrics/read-query";
import { getSurface, type SurfaceKey } from "@/lib/metrics/surfaces";

/**
 * Read layer over the metric_snapshots time-series (Métricas v2 PR-5a). Mirrors
 * the MCP tool `sancho_get_metrics_timeseries` so the UI and Merlin read the same
 * data: `view=series|surfaces|surface-detail|scorecards|trend|northstar`. All views degrade to
 * `{ configured: false }` without DATABASE_URL — the page then falls back to the
 * file-based `/api/metrics` pipeline.
 */
const DAY_MS = 86_400_000;
function fmtDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function queryString(value: string | string[] | undefined): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function badRequest(res: NextApiResponse, error: string) {
  return res.status(400).json({ error });
}

export async function metricsTimeseriesHandler(req: NextApiRequest, res: NextApiResponse) {
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

  const view = queryString(req.query.view) || "series";
  const source = queryString(req.query.source)?.trim() || undefined;
  const metric = queryString(req.query.metric)?.trim() || undefined;
  const surface = queryString(req.query.surface)?.trim() || undefined;
  const grain = queryString(req.query.grain);
  const from = queryString(req.query.from);
  const to = queryString(req.query.to);
  const range = queryString(req.query.range);

  const dateError = metricCalendarRangeError({ from, to });
  if (dateError) return badRequest(res, dateError);
  if (grain && !(["day", "week", "month"] as string[]).includes(grain)) {
    return badRequest(res, "grain must be one of day, week or month");
  }

  switch (view) {
    case "surfaces": {
      if (range && !(["1d", "7d", "30d", "90d"] as string[]).includes(range)) {
        return badRequest(res, "range must be one of 1d, 7d, 30d or 90d");
      }
      const preset = resolveMetricKpiReadRange({
        range: range as MetricKpiRangeKey | undefined,
      });
      const effectiveRange = {
        from: from ?? preset?.from,
        to: to ?? preset?.to,
      };
      const surfaceDateError = metricCalendarRangeError(effectiveRange);
      if (surfaceDateError) return badRequest(res, surfaceDateError);
      return res.status(200).json(await getSurfaceSummary(slug, {
        from: effectiveRange.from,
        to: effectiveRange.to,
      }));
    }
    case "surface-detail": {
      if (!surface || !getSurface(surface as SurfaceKey)) {
        return badRequest(res, `Invalid surface: ${surface ?? "missing"}`);
      }
      if (range && !(["1d", "7d", "30d", "90d"] as string[]).includes(range)) {
        return badRequest(res, "range must be one of 1d, 7d, 30d or 90d");
      }
      const customRangeError = metricCalendarRangeError(
        { from, to },
        { requireBoth: Boolean(from || to) },
      );
      if (customRangeError) return badRequest(res, customRangeError);

      let effectiveRange: { from: string; to: string };
      try {
        const resolved = resolveMetricKpiReadRange({
          range: range ?? (!from && !to ? "30d" : undefined),
          from,
          to,
        });
        if (!resolved) return badRequest(res, "A valid range is required");
        effectiveRange = { from: resolved.from, to: resolved.to };
        assertMetricSurfaceDetailRange(effectiveRange);
      } catch (error) {
        return badRequest(
          res,
          error instanceof Error ? error.message : "Invalid surface detail range",
        );
      }

      return res.status(200).json(await getMetricSurfaceDetail(slug, {
        surface: surface as SurfaceKey,
        ...effectiveRange,
      }));
    }
    case "scorecards":
      return res.status(200).json(await getSourceScorecards(slug, { from, to }));
    case "northstar":
      return res.status(200).json(getNorthStar(slug));
    case "trend": {
      if (!source || !metric) {
        return badRequest(res, "source and metric are required for view=trend");
      }
      const now = new Date();
      const completeDay = new Date(Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate(),
      ) - DAY_MS);
      const toDate = to ?? fmtDate(completeDay);
      // Inclusive seven-day default window.
      const fromDate = from ?? fmtDate(new Date(completeDay.getTime() - 6 * DAY_MS));
      const trendDateError = metricCalendarRangeError(
        { from: fromDate, to: toDate },
        { requireBoth: true },
      );
      if (trendDateError) return badRequest(res, trendDateError);
      return res.status(200).json(await getTrend(slug, { source, metric, from: fromDate, to: toDate }));
    }
    case "series": {
      if (!source || !metric) {
        return badRequest(res, "source and metric are required for view=series");
      }
      return res.status(200).json(await getMetricsTimeSeries(slug, { source, metric, grain, from, to }));
    }
    default:
      return badRequest(res, "view must be one of series, surfaces, surface-detail, scorecards, trend or northstar");
  }
}

export default compose(withErrorHandler, withAuth)(metricsTimeseriesHandler);
