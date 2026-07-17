import type { NextApiRequest, NextApiResponse } from "next";
import fs from "fs";
import path from "path";
import { withSlugAuth, withErrorHandler, compose } from "@/lib/api-middleware";
import { BASE, integrationsFile } from "@/lib/data/paths";
import { getDailySnapshots } from "@/lib/data/metrics";

/**
 * GET /api/metrics?slug=example
 * Returns metrics data — ported from mc-server.js:9888
 *
 * DB-only metrics runtime: `metric_snapshots` is the source of truth. `rolling`
 * is kept as an alias of `daily` for legacy UI components that still read that
 * property, but it is reconstructed from the DB rather than metrics-data.json.
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

  const intFile = integrationsFile(slug);

  let integrations: {
    dataSources?: Record<string, { status?: string }>;
    recommended?: { apiId: string }[];
    metricsSheet?: unknown;
  } = {};
  if (fs.existsSync(intFile)) {
    try { integrations = JSON.parse(fs.readFileSync(intFile, "utf-8")); } catch { /* skip */ }
  }

  let daily: unknown[] = [];
  const dailySource = "db" as const;
  let storage = { configured: false };
  try {
    const db = await getDailySnapshots(slug);
    storage = { configured: db.configured };
    daily = db.daily;
  } catch {
    daily = [];
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
    const hasSheetData = (daily as { date: string; sources?: Record<string, { status?: string; metrics?: unknown[] }> }[])
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
    rolling: daily,
    daily,
    dailySource,
    storage,
    recommended,
    manualDataPending,
    manualDataCadence: manualCadence,
    _cachedAt: new Date().toISOString(),
  });

  _metricsCache[slug] = { json: result, ts: now };

  res.setHeader("X-Cache", "miss");
  res.status(200).json(JSON.parse(result));
}

export default compose(withErrorHandler, withSlugAuth)(handler);
