import type { NextApiRequest, NextApiResponse } from "next";
import { withErrorHandler } from "@/lib/api-middleware";
import { findMetricoolPostByUrl } from "@/lib/data/metrics";

/**
 * GET /api/publishing/post-metrics?slug=X&externalUrl=Y
 *
 * Returns the latest engagement snapshot for a published post by reading the
 * `metric_snapshots` DB and finding the `postDetail` entry whose URL matches
 * `externalUrl`. Used by the calendar event slide-over to show "Y impressions /
 * Z likes / W% engagement" once a post is live.
 *
 * Why match by URL instead of `external_job_id`: the metrics-collector
 * adapter stores the canonical post URL (LinkedIn share URL, X status
 * URL, etc.) but not the Metricool job id. The publish flow stores both
 * `external_url` and `external_job_id` on the draft, so URL matching is
 * the natural cross-reference.
 */

interface PostMetricsResponse {
  ok: true;
  found: boolean;
  metrics?: {
    impressions: number;
    likes: number;
    clicks: number;
    engagement: number;
    network: string;
    url: string;
    measured_at: string;
  };
}

async function handler(req: NextApiRequest, res: NextApiResponse<PostMetricsResponse | { error: string }>) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }
  const slug = (req.query.slug as string | undefined)?.trim();
  const externalUrl = (req.query.externalUrl as string | undefined)?.trim();
  if (!slug || !externalUrl) {
    return res.status(400).json({ error: "Missing slug or externalUrl" });
  }

  const entry = await findMetricoolPostByUrl(slug, externalUrl);
  const dim = entry?.dimensions;
  if (entry && dim?.url) {
    return res.status(200).json({
      ok: true,
      found: true,
      metrics: {
        impressions: entry.value || 0,
        likes: dim.likes || 0,
        clicks: dim.clicks || 0,
        engagement: dim.engagement || 0,
        network: dim.network || "",
        url: dim.url,
        measured_at: entry.date,
      },
    });
  }

  return res.status(200).json({ ok: true, found: false });
}

export default withErrorHandler(handler);
