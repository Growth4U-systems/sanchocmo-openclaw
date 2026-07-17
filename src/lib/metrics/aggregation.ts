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
 *                vitals, CRM running totals like totalContacts).
 *
 * This is SYSTEM knowledge — stable across clients, coupled to the collector
 * vocabulary (skills/metrics-collector) — so it lives in code next to
 * surfaces.ts, not in the DB. A per-client override can layer on top later.
 */

export type AggStrategy = "sum" | "avg" | "latest";

export type AggregationQuality = "ok" | "partial" | "missing";

export type AggregationFallbackReason =
  | "missing_companion_weight"
  | "ambiguous_companion_weight"
  | "invalid_companion_weight"
  | "zero_total_weight";

export interface DatedMetricValue {
  date: string;
  value: number;
}

export interface ReducedMetricSeries {
  value: number;
  quality: AggregationQuality;
  fallbackReason?: AggregationFallbackReason;
}

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
  // GA4 totalUsers is unique within each collected day. Across a daily series,
  // expose average daily users rather than double-counting returning users.
  totalUsers: "avg",
  avgEngagement: "avg",
  frequency: "avg",
  roas: "avg",
  impressionShare: "avg",
  lostImpressionShare: "avg",
  hookRate: "avg",
  activation_rate: "avg",
  topPageDuration: "avg",
  topPageEngagementRate: "avg",
  // PageSpeed scores & Core Web Vitals — latest snapshot.
  performance_mobile: "latest",
  seo_mobile: "latest",
  accessibility_mobile: "latest",
  best_practices_mobile: "latest",
  performance_desktop: "latest",
  seo_desktop: "latest",
  accessibility_desktop: "latest",
  best_practices_desktop: "latest",
  lcp_mobile: "latest",
  cls_mobile: "latest",
  inp_mobile: "latest",
  tbt_mobile: "latest",
  lcp_desktop: "latest",
  cls_desktop: "latest",
  inp_desktop: "latest",
  tbt_desktop: "latest",
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
  // newContacts / appointments / opportunities / pipelineValue are collected
  // from date-filtered opportunities and therefore sum across a requested range.
  "ghl:totalContacts": "latest",
  "ghl:totalOpportunities": "latest",
  // Pipeline and stage counts are all-time CRM state snapshots. Summing daily
  // pulls would multiply the same open opportunities across the selected range.
  "ghl:pipeline": "latest",
  "ghl:pipelineStage": "latest",
  // Post detail is a provider snapshot of a post's cumulative counters, not a
  // daily increment. Keep the newest observation for each post dimension.
  "metricool:postDetail": "latest",
  "metricool:postLikes": "latest",
  "metricool:postClicks": "latest",
  "metricool:postShares": "latest",
  "metricool:postSaves": "latest",
  "metricool:postReach": "latest",
  "metricool:postVideoViews": "latest",
  "metricool:postEngagement": "latest",
  // The campaign catalogue is current account state; daily campaign stats
  // remain additive, but the catalogue size must not multiply by range days.
  "lemlist:campaigns": "latest",
  // Legacy YALC rows (before exact daily collection) were rolling snapshots.
  // Keep them non-additive so generic historical queries cannot double count
  // them. Current flow metrics use the `*Daily` vocabulary and default to sum.
  "yalc:clicks": "latest",
  "yalc:signups": "latest",
  "yalc:kyc": "latest",
  "yalc:firstTx": "latest",
  "yalc:invested": "latest",
  "yalc:totalCost": "latest",
  "yalc:value": "latest",
  "yalc:cpaReal": "latest",
  "yalc:roi": "latest",
};

/**
 * Denominators used to combine daily rates/averages without giving a quiet day
 * the same influence as a high-volume day. The companion row must have the same
 * source, metric_date and roll-up dimensions as the value row.
 *
 * Keep this map close to `aggFor`: both are vocabulary-level knowledge shared
 * by every generic read surface (REST, MCP, scorecards and trends). A missing or
 * incomplete companion never gets silently ignored; `reduceMetricSeries` falls
 * back to the arithmetic mean and marks that result `partial`.
 */
const WEIGHT_BY_METRIC: Record<string, string> = {
  ctr: "impressions",
  cpc: "clicks",
  roas: "spend",
};

const WEIGHT_BY_SOURCE_METRIC: Record<string, string> = {
  "ga4:engagementRate": "sessions",
  "ga4:bounceRate": "sessions",
  "ga4:averageSessionDuration": "sessions",
  "ga4:topPageDuration": "topPageSessions",
  "ga4:topPageEngagementRate": "topPageSessions",
  "gsc:position": "impressions",
  "gsc:ctr": "impressions",
  "meta_ads:ctr": "impressions",
  "meta_ads:cpc": "clicks",
  "meta_ads:roas": "spend",
  "google_ads:ctr": "impressions",
  "google_ads:cpc": "clicks",
  "google_ads:roas": "spend",
  "posthog:activation_rate": "pageviews",
  // Metricool can omit engagement on otherwise valid post rows. Only posts
  // where engagement was actually observed are part of this average.
  "metricool:avgEngagement": "postsWithEngagement",
};

const AGGREGATION_SOURCE_ALIASES: Record<string, string> = {
  meta: "meta_ads",
  meta_ads: "meta_ads",
  metaads: "meta_ads",
  google: "google_ads",
  google_ads: "google_ads",
  googleads: "google_ads",
  google_analytics: "ga4",
  google_analytics_4: "ga4",
  ga4: "ga4",
  google_search_console: "gsc",
  gsc: "gsc",
  ghl: "ghl",
  go_high_level: "ghl",
  gohighlevel: "ghl",
  metricool: "metricool",
  posthog: "posthog",
  yalc: "yalc",
};

function aggregationSourceId(source: string): string {
  const normalized = source.trim().replace(/[\s-]+/g, "_").toLowerCase();
  return AGGREGATION_SOURCE_ALIASES[normalized] ?? normalized;
}

/** Companion denominator for a weighted average, or null for a plain reducer. */
export function weightMetricFor(source?: string, metric?: string): string | null {
  if (!metric || aggFor(source, metric) !== "avg") return null;
  if (source) {
    const keyed = WEIGHT_BY_SOURCE_METRIC[`${aggregationSourceId(source)}:${metric}`];
    if (keyed) return keyed;
  }
  return WEIGHT_BY_METRIC[metric] ?? null;
}

/**
 * Pure reducer shared by SQL-backed read models. For weighted metrics, every
 * value row must have exactly one finite, non-negative companion for that date.
 * Otherwise all observed values remain represented via arithmetic mean, but the
 * fidelity downgrade is explicit (`quality=partial`). A present zero companion
 * means the derived value is undefined (0/0), so that observation is excluded;
 * an all-zero window is `missing`, never a verified zero.
 */
export function reduceMetricSeries(
  strategy: AggStrategy,
  series: DatedMetricValue[],
  weightMetric: string | null = null,
  weightSeries: DatedMetricValue[] = [],
): ReducedMetricSeries {
  if (!series.length) return { value: 0, quality: "missing" };

  if (strategy === "latest") {
    let best = series[0];
    for (const point of series) if (point.date >= best.date) best = point;
    return { value: best.value, quality: "ok" };
  }

  const total = series.reduce((acc, point) => acc + point.value, 0);
  if (strategy !== "avg") return { value: total, quality: "ok" };

  if (!weightMetric) {
    return { value: total / series.length, quality: "ok" };
  }

  const weightsByDate = new Map<string, number>();
  const ambiguousDates = new Set<string>();
  const valueDates = new Set(series.map((point) => point.date));
  let hasInvalidWeight = false;
  for (const point of weightSeries) {
    if (!valueDates.has(point.date)) continue;
    if (!Number.isFinite(point.value) || point.value < 0) {
      hasInvalidWeight = true;
      continue;
    }
    if (weightsByDate.has(point.date)) ambiguousDates.add(point.date);
    else weightsByDate.set(point.date, point.value);
  }

  const fallback = (fallbackReason: AggregationFallbackReason): ReducedMetricSeries => ({
    value: total / series.length,
    quality: "partial",
    fallbackReason,
  });

  if (hasInvalidWeight) return fallback("invalid_companion_weight");
  if (series.some((point) => ambiguousDates.has(point.date))) {
    return fallback("ambiguous_companion_weight");
  }
  if (series.some((point) => !weightsByDate.has(point.date))) {
    return fallback("missing_companion_weight");
  }

  let totalWeight = 0;
  let weightedTotal = 0;
  for (const point of series) {
    const weight = weightsByDate.get(point.date) ?? 0;
    totalWeight += weight;
    weightedTotal += point.value * weight;
  }
  if (totalWeight <= 0) {
    return { value: 0, quality: "missing", fallbackReason: "zero_total_weight" };
  }
  return { value: weightedTotal / totalWeight, quality: "ok" };
}

/**
 * Resolve the aggregation strategy for a (source, metric) pair. Falls back to
 * `sum` when the metric is unknown or unspecified. Public series/trend reads
 * require a pinned source+metric, so this fallback is only for internal callers
 * resolving an individual, unknown metric.
 */
export function aggFor(source?: string, metric?: string): AggStrategy {
  if (!metric) return DEFAULT_AGG;
  if (source) {
    const keyed = BY_SOURCE_METRIC[`${aggregationSourceId(source)}:${metric}`];
    if (keyed) return keyed;
  }
  return BY_METRIC[metric] ?? DEFAULT_AGG;
}

/**
 * Storage vocabulary that can be read as point-in-time state for the supplied
 * providers. Callers use this to fetch the newest observation independently of
 * a flow window without broadening additive/rate reads outside that window.
 */
export function latestMetricNamesForSources(
  sources?: ReadonlyArray<string>,
): string[] {
  const canonicalSources = sources
    ? new Set(sources.map(aggregationSourceId))
    : null;
  const names = new Set(
    Object.entries(BY_METRIC)
      .filter(([, strategy]) => strategy === "latest")
      .map(([metric]) => metric),
  );
  for (const [key, strategy] of Object.entries(BY_SOURCE_METRIC)) {
    if (strategy !== "latest") continue;
    const separator = key.indexOf(":");
    const source = key.slice(0, separator);
    const metric = key.slice(separator + 1);
    if ((!canonicalSources || canonicalSources.has(source)) && metric) names.add(metric);
  }
  return [...names].sort();
}
