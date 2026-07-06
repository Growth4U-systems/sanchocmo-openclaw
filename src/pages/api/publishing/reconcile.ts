import type { NextApiRequest, NextApiResponse } from "next";
import { withErrorHandler } from "@/lib/api-middleware";
import { reconcileScheduledDrafts, type ReconcileResult } from "@/lib/publishing/reconciliation";

/**
 * POST /api/publishing/reconcile?slug=X
 *
 * Sweeps `scheduled` drafts whose publishAt is in the past and asks the
 * provider whether they actually went live. Authoritative trigger called
 * by the `metrics-collector` cron after each daily run — by then Metricool
 * has both the scheduler status (publishedDate / url) and per-post analytics.
 *
 * Idempotent. Drafts already `published` are skipped. Drafts with no
 * `external_job_id` fall back to text matching against metrics output.
 *
 * Response: { ok, scanned, reconciled: [{ideaId, channel, url}] }
 */

interface ReconcileResponse extends ReconcileResult { ok: true }

async function handler(req: NextApiRequest, res: NextApiResponse<ReconcileResponse | { error: string }>) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  const slug = (req.query.slug as string | undefined)?.trim() || (req.body?.slug as string | undefined)?.trim();
  if (!slug) return res.status(400).json({ error: "Missing slug" });

  const result = await reconcileScheduledDrafts(slug);
  return res.status(200).json({ ok: true, ...result });
}

export default withErrorHandler(handler);
