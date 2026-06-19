import type { NextApiRequest, NextApiResponse } from "next";
import fs from "fs";
import path from "path";
import { compose, withErrorHandler, withSlugAuth } from "@/lib/api-middleware";
import { BASE } from "@/lib/data/paths";
import { readJSON, writeJSON } from "@/lib/data/json-io";
import { ingestSourceMetrics } from "@/lib/data/metrics-snapshots";

const PSI_BASE = "https://www.googleapis.com/pagespeedonline/v5/runPagespeed";
const PSI_CATEGORIES =
  "&category=performance&category=seo&category=accessibility&category=best-practices";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

type StrategyResult = {
  performance: number;
  seo: number;
  accessibility: number;
  bestPractices: number;
  lcp: number;
  cls: number;
  tbt: number;
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
    performance: Math.round((cats.performance?.score ?? 0) * 100),
    seo: Math.round((cats.seo?.score ?? 0) * 100),
    accessibility: Math.round((cats.accessibility?.score ?? 0) * 100),
    bestPractices: Math.round((cats["best-practices"]?.score ?? 0) * 100),
    lcp: parseFloat(((audits["largest-contentful-paint"]?.numericValue ?? 0) / 1000).toFixed(1)),
    cls: parseFloat((audits["cumulative-layout-shift"]?.numericValue ?? 0).toFixed(3)),
    tbt: Math.round(audits["total-blocking-time"]?.numericValue ?? 0),
    opportunities: opportunities.sort((a, b) => b.savings - a.savings).slice(0, 10),
    diagnostics: diagnostics.slice(0, 10),
  };
}

function persistDailyMetrics(
  slug: string,
  metricsDir: string,
  mobile: StrategyResult,
  desktop: StrategyResult,
) {
  const today = new Date().toISOString().slice(0, 10);
  const dailyFile = path.join(metricsDir, today + ".json");
  const daily = readJSON<{
    slug?: string;
    collectedAt?: string;
    sources?: Record<string, unknown>;
  }>(dailyFile, {});
  daily.sources = daily.sources || {};
  const metrics = [
    { name: "performance_mobile", value: mobile.performance, date: today },
    { name: "seo_mobile", value: mobile.seo, date: today },
    { name: "performance_desktop", value: desktop.performance, date: today },
    { name: "seo_desktop", value: desktop.seo, date: today },
    { name: "lcp_mobile", value: mobile.lcp, date: today },
    { name: "cls_mobile", value: mobile.cls, date: today },
    { name: "tbt_mobile", value: mobile.tbt, date: today },
  ];
  daily.sources.pagespeed = { status: "ok", metrics };
  daily.slug = daily.slug || slug;
  daily.collectedAt = daily.collectedAt || new Date().toISOString();
  writeJSON(dailyFile, daily);
  // Best-effort mirror into the metric_snapshots time-series (SAN-263).
  void ingestSourceMetrics(slug, "pagespeed", metrics, today).catch(() => {});
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

    if (!fs.existsSync(metricsDir)) fs.mkdirSync(metricsDir, { recursive: true });
    writeJSON(cacheFile, result);
    persistDailyMetrics(slug, metricsDir, mobile, desktop);

    return res.status(200).json(result);
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
