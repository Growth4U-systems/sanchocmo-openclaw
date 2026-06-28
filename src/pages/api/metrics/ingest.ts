import type { NextApiRequest, NextApiResponse } from "next";
import { compose, withAuth, withErrorHandler } from "@/lib/api-middleware";
import { recomputeMetricKpisAfterIngest } from "@/lib/data/metric-kpi-autorecompute";
import { ingestDailySnapshot, ingestSourceMetrics, type RawMetric } from "@/lib/data/metrics-snapshots";

/**
 * POST /api/metrics/ingest  (admin only)
 *
 * Writes a daily metrics snapshot (or a single source's metrics) into the
 * `metric_snapshots` time-series. This table is the runtime source of truth for
 * metrics; the endpoint is idempotent for collector retries and re-pulls.
 *
 * Body (one of):
 *   { slug, date?, collectedAt?, sources: { <source>: { status, metrics:[...] } } }
 *   { slug, date?, source, metrics:[...] }
 */
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function metricDatesFromMetrics(metrics: RawMetric[] | undefined, fallback: string): string[] {
  const dates = new Set<string>([fallback]);
  for (const metric of metrics ?? []) {
    if (typeof metric.date === "string" && DATE_RE.test(metric.date)) {
      dates.add(metric.date);
    }
  }
  return [...dates].sort();
}

function metricDatesFromSources(
  sources: Record<string, { metrics?: RawMetric[] }> | undefined,
  fallback: string,
): string[] {
  const dates = new Set<string>([fallback]);
  for (const payload of Object.values(sources ?? {})) {
    for (const date of metricDatesFromMetrics(payload.metrics, fallback)) {
      dates.add(date);
    }
  }
  return [...dates].sort();
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.status(405).json({ error: `Method ${req.method} not allowed` });
    return;
  }
  if (!req.ctx?.isAdmin) {
    res.status(403).json({ error: "Admin token required" });
    return;
  }

  const body = (req.body ?? {}) as {
    slug?: string;
    date?: string;
    collectedAt?: string | null;
    provenance?: string | null;
    quality?: string | null;
    sources?: Record<
      string,
      {
        status?: string;
        collectedAt?: string | null;
        provenance?: string | null;
        quality?: string | null;
        metrics?: RawMetric[];
      }
    >;
    source?: string;
    metrics?: RawMetric[];
    deleteStale?: boolean;
    recomputeKpis?: boolean;
  };
  const deleteStale = body.deleteStale === true;
  const recomputeEnabled = body.recomputeKpis !== false;

  const slug = typeof body.slug === "string" ? body.slug.trim() : "";
  if (!slug) {
    res.status(400).json({ error: "Missing slug" });
    return;
  }
  const date = typeof body.date === "string" && DATE_RE.test(body.date) ? body.date : new Date().toISOString().slice(0, 10);

  if (typeof body.source === "string" && Array.isArray(body.metrics)) {
    const result = await ingestSourceMetrics(slug, body.source, body.metrics, date, {
      collectedAt: body.collectedAt,
      deleteStale,
      provenance: body.provenance,
      quality: body.quality,
    });
    const recompute = await recomputeMetricKpisAfterIngest({
      slug,
      date,
      enabled: recomputeEnabled,
      ingest: result,
      metricDates: metricDatesFromMetrics(body.metrics, date),
    });
    res.status(200).json({ ...result, recompute });
    return;
  }
  if (body.sources && typeof body.sources === "object") {
    const result = await ingestDailySnapshot(
      slug,
      date,
      {
        slug,
        collectedAt: body.collectedAt,
        provenance: body.provenance,
        quality: body.quality,
        sources: body.sources,
      },
      { deleteStale },
    );
    const recompute = await recomputeMetricKpisAfterIngest({
      slug,
      date,
      enabled: recomputeEnabled,
      ingest: result,
      metricDates: metricDatesFromSources(body.sources, date),
    });
    res.status(200).json({ ...result, recompute });
    return;
  }

  res.status(400).json({ error: "Provide either { sources } or { source, metrics }" });
}

export default compose(withErrorHandler, withAuth)(handler);
