import type { NextApiRequest, NextApiResponse } from "next";
import { compose, withAuth, withErrorHandler } from "@/lib/api-middleware";
import {
  metricDatesFromMetrics,
  metricDatesFromSources,
  recomputeMetricKpisAfterIngest,
} from "@/lib/data/metric-kpi-autorecompute";
import {
  ingestDailySnapshot,
  ingestSourceMetrics,
  isRealMetricDate,
  normalizeAttemptedProviderDates,
  normalizeMetricRestatementScopeInputs,
  type RawMetric,
  type MetricRestatementScopeInput,
} from "@/lib/data/metrics-snapshots";

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
function hasInvalidMetricDate(metrics: unknown): boolean {
  return Array.isArray(metrics) && metrics.some((metric) => {
    if (!metric || typeof metric !== "object") return false;
    const date = (metric as { date?: unknown }).date;
    return date != null && !isRealMetricDate(date);
  });
}

export async function metricsIngestHandler(req: NextApiRequest, res: NextApiResponse) {
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
        restatedDates?: string[];
        attemptedDates?: string[];
        restatedScopes?: MetricRestatementScopeInput[];
      }
    >;
    source?: string;
    metrics?: RawMetric[];
    attemptedDates?: string[];
    restatedScopes?: MetricRestatementScopeInput[];
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
  if (body.date != null && !isRealMetricDate(body.date)) {
    res.status(400).json({ error: "date must be a real YYYY-MM-DD calendar date" });
    return;
  }
  const date = body.date ?? new Date().toISOString().slice(0, 10);

  const invalidMetricDate = hasInvalidMetricDate(body.metrics)
    || Object.values(body.sources ?? {}).some((payload) =>
      hasInvalidMetricDate(payload?.metrics));
  if (invalidMetricDate) {
    res.status(400).json({ error: "metric.date must be a real YYYY-MM-DD calendar date" });
    return;
  }

  try {
    const validatePayload = (payload: {
      attemptedDates?: string[];
      restatedScopes?: MetricRestatementScopeInput[];
    }) => {
      const attemptedDates = normalizeAttemptedProviderDates(payload.attemptedDates);
      normalizeMetricRestatementScopeInputs(payload.restatedScopes, attemptedDates);
    };
    validatePayload(body);
    for (const payload of Object.values(body.sources ?? {})) validatePayload(payload ?? {});
  } catch (error) {
    res.status(400).json({
      error: error instanceof Error ? error.message : "Invalid restatement evidence",
    });
    return;
  }

  if (typeof body.source === "string" && Array.isArray(body.metrics)) {
    const result = await ingestSourceMetrics(slug, body.source, body.metrics, date, {
      collectedAt: body.collectedAt,
      deleteStale,
      provenance: body.provenance,
      quality: body.quality,
      attemptedDates: body.attemptedDates,
      restatedScopes: body.restatedScopes,
    });
    const recompute = await recomputeMetricKpisAfterIngest({
      slug,
      date,
      enabled: recomputeEnabled,
      ingest: result,
      metricDates: [
        ...metricDatesFromMetrics(body.metrics, date),
        ...(body.attemptedDates ?? []),
        ...(body.restatedScopes ?? []).map((scope) => scope.metricDate),
      ],
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

export default compose(withErrorHandler, withAuth)(metricsIngestHandler);
