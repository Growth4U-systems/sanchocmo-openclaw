import type { NextApiRequest, NextApiResponse } from "next";
import fs from "fs";
import path from "path";
import { withAuth, withErrorHandler, compose } from "@/lib/api-middleware";
import { BASE, integrationsFile } from "@/lib/data/paths";

/**
 * GET /api/metrics?slug=hospital-capilar
 * Returns metrics data — ported from mc-server.js:9888
 */

const _metricsCache: Record<string, { json: string; ts: number }> = {};

/**
 * Drop the in-process metrics cache entry for a slug. Called from the client
 * delete flow so that recreating a client with the same slug doesn't serve
 * the previous client's cached metrics for up to 5 minutes.
 */
export function invalidateMetricsCache(slug: string): void {
  delete _metricsCache[slug];
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") { res.status(405).json({ error: "Method not allowed" }); return; }

  const slug = req.query.slug as string;
  if (!slug) { res.status(400).json({ error: "Missing slug parameter" }); return; }

  // Server-side cache: 5 min TTL per slug
  const now = Date.now();
  const cached = _metricsCache[slug];
  if (cached && (now - cached.ts) < 300_000) {
    res.setHeader("X-Cache", "hit");
    res.setHeader("Content-Type", "application/json");
    res.status(200).end(cached.json);
    return;
  }

  const metricsFile = path.join(BASE, "brand", slug, "metrics", "metrics-data.json");
  const intFile = integrationsFile(slug);

  let metrics: unknown[] = [];
  if (fs.existsSync(metricsFile)) {
    try { metrics = JSON.parse(fs.readFileSync(metricsFile, "utf-8")); } catch { /* skip */ }
  }

  let integrations: {
    dataSources?: Record<string, { status?: string }>;
    recommended?: { apiId: string }[];
    metricsSheet?: unknown;
  } = {};
  if (fs.existsSync(intFile)) {
    try { integrations = JSON.parse(fs.readFileSync(intFile, "utf-8")); } catch { /* skip */ }
  }

  // Read daily metric files (last 30 days)
  const metricsDir = path.join(BASE, "brand", slug, "metrics");
  const dailyFiles: unknown[] = [];
  if (fs.existsSync(metricsDir)) {
    const files = fs.readdirSync(metricsDir)
      .filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
      .sort()
      .slice(-30);
    for (const f of files) {
      try {
        const data = JSON.parse(fs.readFileSync(path.join(metricsDir, f), "utf-8"));
        dailyFiles.push({ date: f.replace(".json", ""), ...data });
      } catch { /* skip */ }
    }
  }

  // Read metrics plan
  let metricsPlan: { manualDataCadence?: string } | null = null;
  const planFile = path.join(BASE, "brand", slug, "metrics-plan.json");
  if (fs.existsSync(planFile)) {
    try { metricsPlan = JSON.parse(fs.readFileSync(planFile, "utf-8")); } catch { /* skip */ }
  }

  // Check if manual data is pending for current week
  let manualDataPending = false;
  const manualCadence = metricsPlan?.manualDataCadence || null;
  const ds = integrations.dataSources || {};
  if (manualCadence && ds.sheets) {
    const now_ = new Date();
    const day = now_.getDay();
    const monday = new Date(now_);
    monday.setDate(monday.getDate() - ((day + 6) % 7));
    const mondayStr = monday.toISOString().slice(0, 10);
    const hasSheetData = (dailyFiles as { date: string; sources?: Record<string, { status?: string; metrics?: unknown[] }> }[])
      .some((d) => d.date >= mondayStr && d.sources?.sheets?.status === "ok" && (d.sources.sheets.metrics || []).length > 0);
    if (!hasSheetData) manualDataPending = true;
  }

  // Filter recommended integrations
  const recommended = (integrations.recommended || []).filter((r) => {
    const existing = ds[r.apiId];
    return !existing || (existing as { status?: string }).status !== "connected";
  });

  const result = JSON.stringify({
    slug,
    plan: metricsPlan,
    metricsSheet: integrations.metricsSheet || null,
    dataSources: ds,
    rolling: metrics,
    daily: dailyFiles,
    recommended,
    manualDataPending,
    manualDataCadence: manualCadence,
    _cachedAt: new Date().toISOString(),
  });

  _metricsCache[slug] = { json: result, ts: now };

  res.setHeader("X-Cache", "miss");
  res.status(200).json(JSON.parse(result));
}

export default compose(withErrorHandler, withAuth)(handler);
