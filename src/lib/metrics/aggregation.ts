import { TRUST_PILLAR_KEYS } from "@/lib/trust-score/client";

/**
 * Per-metric aggregation strategy for the `metric_snapshots` read layer (SAN-300).
 *
 * The store holds one row per slug·day·source·metric·dimension. When a metric is
 * rolled up over a window (getTrend) or a week/month bucket (getMetricsTimeSeries),
 * the correct reducer depends on the metric's nature:
 *   - `sum`    — additive counts/totals (sessions, clicks, spend, leads…). DEFAULT.
 *   - `avg`    — rates & averages that must NOT be summed (ctr, cpc, position,
 *                bounceRate, engagementRate, avgEngagement, avg session duration).
 *   - `latest` — point-in-time snapshots/scores where only the most recent value
 *                is meaningful (trust_score + pillars, PageSpeed scores & web
 *                vitals, CRM running totals like totalContacts / pipelineValue).
 *
 * This is SYSTEM knowledge — stable across clients, coupled to the collector
 * vocabulary (skills/metrics-collector) — so it lives in code next to
 * surfaces.ts, not in the DB. A per-client override can layer on top later.
 */

export type AggStrategy = "sum" | "avg" | "latest";

export const DEFAULT_AGG: AggStrategy = "sum";

/** Cross-source rules keyed by bare metric name. */
const BY_METRIC: Record<string, AggStrategy> = {
  // Rates / averages — average over the bucket, never sum.
  ctr: "avg",
  cpc: "avg",
  position: "avg",
  bounceRate: "avg",
  engagementRate: "avg",
  averageSessionDuration: "avg",
  avgEngagement: "avg",
  frequency: "avg",
  roas: "avg",
  impressionShare: "avg",
  lostImpressionShare: "avg",
  hookRate: "avg",
  activation_rate: "avg",
  // PageSpeed scores & Core Web Vitals — latest snapshot.
  performance_mobile: "latest",
  seo_mobile: "latest",
  performance_desktop: "latest",
  seo_desktop: "latest",
  lcp_mobile: "latest",
  cls_mobile: "latest",
  inp_mobile: "latest",
  tbt_mobile: "latest",
  followers: "latest",
  followersTotal: "latest",
  followerCount: "latest",
  // Trust Score + its 6 pillars — latest snapshot.
  trust_score: "latest",
  ...Object.fromEntries(TRUST_PILLAR_KEYS.map((key): [string, AggStrategy] => [key, "latest"])),
};

/** Source-specific overrides keyed by `"source:metric"` (wins over BY_METRIC). */
const BY_SOURCE_METRIC: Record<string, AggStrategy> = {
  // CRM running totals are cumulative state, not per-day increments → latest.
  // (newContacts / appointments / opportunities ARE per-period counts → sum.)
  "ghl:totalContacts": "latest",
  "ghl:totalOpportunities": "latest",
  "ghl:pipelineValue": "latest",
};

/**
 * Resolve the aggregation strategy for a (source, metric) pair. Falls back to
 * `sum` when the metric is unknown or unspecified — a mixed-metric query keeps
 * the legacy SUM behaviour, so existing call sites never regress.
 */
export function aggFor(source?: string, metric?: string): AggStrategy {
  if (!metric) return DEFAULT_AGG;
  if (source) {
    const keyed = BY_SOURCE_METRIC[`${source}:${metric}`];
    if (keyed) return keyed;
  }
  return BY_METRIC[metric] ?? DEFAULT_AGG;
}
