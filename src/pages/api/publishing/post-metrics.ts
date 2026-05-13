import fs from "fs";
import path from "path";
import type { NextApiRequest, NextApiResponse } from "next";
import { withErrorHandler } from "@/lib/api-middleware";
import { BASE } from "@/lib/data/paths";

/**
 * GET /api/publishing/post-metrics?slug=X&externalUrl=Y
 *
 * Returns the latest engagement snapshot for a published post by scanning
 * the brand's daily metrics files (`brand/{slug}/metrics/*.json`) and
 * finding the `postDetail` entry whose URL matches `externalUrl`. Used by
 * the calendar event slide-over to show "Y impressions / Z likes / W%
 * engagement" once a post is live.
 *
 * Why match by URL instead of `external_job_id`: the metrics-collector
 * adapter stores the canonical post URL (LinkedIn share URL, X status
 * URL, etc.) but not the Metricool job id. The publish flow stores both
 * `external_url` and `external_job_id` on the draft, so URL matching is
 * the natural cross-reference.
 */

interface PostDetail {
  network?: string;
  url?: string;
  likes?: number;
  clicks?: number;
  engagement?: number;
  text?: string;
}

interface PostMetric {
  name: string;
  value: number;
  date?: string;
  dimensions?: PostDetail;
}

interface MetricsFile {
  sources?: { metricool?: { metrics?: PostMetric[] } };
}

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

function metricsDir(slug: string): string {
  return path.join(BASE, "brand", slug, "metrics");
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

  const dir = metricsDir(slug);
  if (!fs.existsSync(dir)) {
    return res.status(200).json({ ok: true, found: false });
  }

  // Scan daily files newest-first; first match wins (latest snapshot).
  const files = fs
    .readdirSync(dir)
    .filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
    .sort()
    .reverse();

  for (const file of files) {
    let data: MetricsFile;
    try {
      data = JSON.parse(fs.readFileSync(path.join(dir, file), "utf-8"));
    } catch {
      continue;
    }
    const entries = data.sources?.metricool?.metrics ?? [];
    for (const entry of entries) {
      if (entry.name !== "postDetail") continue;
      const dim = entry.dimensions;
      if (!dim?.url) continue;
      if (dim.url !== externalUrl) continue;
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
          measured_at: entry.date || file.replace(".json", ""),
        },
      });
    }
  }

  return res.status(200).json({ ok: true, found: false });
}

export default withErrorHandler(handler);
