import type { NextApiRequest, NextApiResponse } from "next";
import fs from "fs";
import path from "path";
import { compose, withErrorHandler, withSlugAuth } from "@/lib/api-middleware";
import { BASE } from "@/lib/data/paths";
import { readJSON, writeJSON } from "@/lib/data/json-io";
import { recomputeMetricKpisAfterIngest } from "@/lib/data/metric-kpi-autorecompute";
import { ingestSourceMetrics } from "@/lib/data/metrics-snapshots";

const PSI_BASE = "https://www.googleapis.com/pagespeedonline/v5/runPagespeed";
const PSI_CATEGORIES =
  "&category=performance&category=seo&category=accessibility&category=best-practices";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

type StrategyResult = {
  performance: number | null;
  seo: number | null;
  accessibility: number | null;
  bestPractices: number | null;
  lcp: number | null;
  cls: number | null;
  tbt: number | null;
  opportunities: Array<{ id: string; title: string; savings: number; description?: string }>;
  diagnostics: Array<{ id: string; title: string; score: number }>;
};

type CachedResult = {
  url: string;
  mobile: StrategyResult;
  desktop: StrategyResult;
  fetchedAt: string;
  _stale?: boolean;
};

function resolveClientUrl(slug: string, queryUrl: string | null): string | null {
  const clients = readJSON<Record<string, { url?: string }>>(
    path.join(BASE, "clients.json"),
    {},
  );
  if (clients[slug]?.url) return clients[slug].url ?? null;
  // (El fallback a foundation-state.json brand_summary.url murió con el
  // fichero — SAN-183 F5. clients.json es la fuente de la URL del cliente.)
  return queryUrl;
}

function finiteNumber(value: unknown): number | null {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function normalizePageSpeedMeasurements(
  categories: Record<string, { score?: number | null }> = {},
  audits: Record<string, { numericValue?: number | null }> = {},
): Pick<StrategyResult, "performance" | "seo" | "accessibility" | "bestPractices" | "lcp" | "cls" | "tbt"> {
  const score = (key: string): number | null => {
    const value = finiteNumber(categories[key]?.score);
    return value == null ? null : Math.round(value * 100);
  };
  const audit = (key: string): number | null => finiteNumber(audits[key]?.numericValue);
  const lcpMs = audit("largest-contentful-paint");
  const cls = audit("cumulative-layout-shift");
  const tbt = audit("total-blocking-time");

  return {
    performance: score("performance"),
    seo: score("seo"),
    accessibility: score("accessibility"),
    bestPractices: score("best-practices"),
    lcp: lcpMs == null ? null : Number((lcpMs / 1000).toFixed(1)),
    cls: cls == null ? null : Number(cls.toFixed(3)),
    tbt: tbt == null ? null : Math.round(tbt),
  };
}

async function fetchPSI(clientUrl: string, strategy: "mobile" | "desktop"): Promise<StrategyResult> {
  const key = process.env.PAGESPEED_API_KEY;
  const keyParam = key ? `&key=${key}` : "";
  const apiUrl = `${PSI_BASE}?url=${encodeURIComponent(clientUrl)}&strategy=${strategy}${PSI_CATEGORIES}${keyParam}`;

  const resp = await fetch(apiUrl);
  if (!resp.ok) {
    throw new Error(`PSI ${strategy}: HTTP ${resp.status}`);
  }
  const data = (await resp.json()) as {
    lighthouseResult?: {
      categories?: Record<string, { score?: number }>;
      audits?: Record<string, {
        score?: number | null;
        title?: string;
        description?: string;
        numericValue?: number;
        details?: { type?: string; overallSavingsMs?: number };
      }>;
    };
  };
  const cats = data.lighthouseResult?.categories || {};
  const audits = data.lighthouseResult?.audits || {};

  const opportunities: StrategyResult["opportunities"] = [];
  for (const [id, audit] of Object.entries(audits)) {
    const savings = audit.details?.overallSavingsMs ?? 0;
    if (audit.details?.type === "opportunity" && savings > 0) {
      opportunities.push({
        id,
        title: audit.title || id,
        savings: Math.round(savings),
        description: audit.description?.slice(0, 150),
      });
    }
  }

  const diagnostics: StrategyResult["diagnostics"] = [];
  for (const [id, audit] of Object.entries(audits)) {
    if (audit.score !== null && audit.score !== undefined && audit.score < 0.5 && audit.details?.type === "table") {
      diagnostics.push({ id, title: audit.title || id, score: Math.round(audit.score * 100) });
    }
  }

  return {
    ...normalizePageSpeedMeasurements(cats, audits),
    opportunities: opportunities.sort((a, b) => b.savings - a.savings).slice(0, 10),
    diagnostics: diagnostics.slice(0, 10),
  };
}

async function persistDailyMetrics(slug: string, mobile: StrategyResult, desktop: StrategyResult) {
  const today = new Date().toISOString().slice(0, 10);
  const metrics = [
    { name: "performance_mobile", value: mobile.performance, date: today },
    { name: "seo_mobile", value: mobile.seo, date: today },
    { name: "performance_desktop", value: desktop.performance, date: today },
    { name: "seo_desktop", value: desktop.seo, date: today },
    { name: "lcp_mobile", value: mobile.lcp, date: today },
    { name: "cls_mobile", value: mobile.cls, date: today },
    { name: "tbt_mobile", value: mobile.tbt, date: today },
  ].filter((metric): metric is { name: string; value: number; date: string } =>
    typeof metric.value === "number" && Number.isFinite(metric.value),
  );
  const ingest = await ingestSourceMetrics(slug, "pagespeed", metrics, today, { collectedAt: new Date().toISOString() });
  if (!ingest.ok) {
    throw new Error("metric_snapshots storage is not configured for PageSpeed metrics");
  }
  return recomputeMetricKpisAfterIngest({
    slug,
    date: today,
    ingest,
    metricDates: [today],
    trigger: "pagespeed:auto",
  });
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  }

  const slug = req.query.slug as string;
  const refresh = req.query.refresh === "1";
  const queryUrl = (req.query.url as string) || null;

  const cacheFile = path.join(BASE, "brand", slug, "metrics", "pagespeed.json");
  const metricsDir = path.join(BASE, "brand", slug, "metrics");

  if (!refresh) {
    const cached = readJSON<CachedResult | null>(cacheFile, null);
    if (cached?.fetchedAt && Date.now() - new Date(cached.fetchedAt).getTime() < CACHE_TTL_MS) {
      return res.status(200).json(cached);
    }
  }

  let clientUrl = resolveClientUrl(slug, queryUrl);
  if (!clientUrl) {
    return res.status(404).json({
      error: "No URL found for client. Pass ?url= or set url in clients.json / brand_summary",
    });
  }
  if (!clientUrl.startsWith("http")) clientUrl = "https://" + clientUrl;

  try {
    const mobile = await fetchPSI(clientUrl, "mobile");
    const desktop = await fetchPSI(clientUrl, "desktop");
    const result: CachedResult = {
      url: clientUrl,
      mobile,
      desktop,
      fetchedAt: new Date().toISOString(),
    };

    const metricsRecompute = await persistDailyMetrics(slug, mobile, desktop);
    if (!fs.existsSync(metricsDir)) fs.mkdirSync(metricsDir, { recursive: true });
    writeJSON(cacheFile, result);

    return res.status(200).json({ ...result, _metricsRecompute: metricsRecompute });
  } catch (err) {
    const stale = readJSON<CachedResult | null>(cacheFile, null);
    if (stale) {
      return res.status(200).json({ ...stale, _stale: true });
    }
    const message = err instanceof Error ? err.message : "PSI fetch failed";
    return res.status(500).json({ error: message });
  }
}

export default compose(withErrorHandler, withSlugAuth)(handler);
