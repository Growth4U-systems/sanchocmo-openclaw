import type { NextApiRequest, NextApiResponse } from "next";
import { compose, withAuth, withErrorHandler } from "@/lib/api-middleware";
import { ingestDailySnapshot, ingestSourceMetrics, type RawMetric } from "@/lib/data/metrics-snapshots";

/**
 * POST /api/metrics/ingest  (admin only)
 *
 * Mirrors a daily metrics snapshot (or a single source's metrics) into the
 * `metric_snapshots` time-series. Called best-effort by the metrics-collector,
 * trust-score and pagespeed paths. The JSON files remain the source of truth;
 * this is an additive, idempotent upsert. (SAN-263 · Métricas v2 PR-1.)
 *
 * Body (one of):
 *   { slug, date?, collectedAt?, sources: { <source>: { status, metrics:[...] } } }
 *   { slug, date?, source, metrics:[...] }
 */
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

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
    sources?: Record<string, { status?: string; collectedAt?: string | null; metrics?: RawMetric[] }>;
    source?: string;
    metrics?: RawMetric[];
  };

  const slug = typeof body.slug === "string" ? body.slug.trim() : "";
  if (!slug) {
    res.status(400).json({ error: "Missing slug" });
    return;
  }
  const date = typeof body.date === "string" && DATE_RE.test(body.date) ? body.date : new Date().toISOString().slice(0, 10);

  if (typeof body.source === "string" && Array.isArray(body.metrics)) {
    const result = await ingestSourceMetrics(slug, body.source, body.metrics, date, { collectedAt: body.collectedAt });
    res.status(200).json(result);
    return;
  }
  if (body.sources && typeof body.sources === "object") {
    const result = await ingestDailySnapshot(slug, date, { slug, collectedAt: body.collectedAt, sources: body.sources });
    res.status(200).json(result);
    return;
  }

  res.status(400).json({ error: "Provide either { sources } or { source, metrics }" });
}

export default compose(withErrorHandler, withAuth)(handler);
