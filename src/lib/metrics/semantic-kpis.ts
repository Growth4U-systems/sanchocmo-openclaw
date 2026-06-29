import { aggFor, type AggStrategy } from "@/lib/metrics/aggregation";
import {
  isDemoProvenanceValue,
  isDemoQualityMetadata,
} from "@/lib/metrics/provenance";
import type { SurfaceKey } from "@/lib/metrics/surfaces";

export type MetricKpiQualityStatus =
  | "ok"
  | "partial"
  | "missing"
  | "dirty"
  | "stale"
  | "demo";

export type MetricKpiDashboardBlock =
  | "overview"
  | "surface"
  | "channels"
  | "conversion"
  | "trends";

export interface MetricKpiSnapshotInput {
  id?: string | null;
  source: string;
  metricName: string;
  value: number | null;
  valueText?: string | null;
  metricDate: string;
  dimensions?: Record<string, string> | null;
  dimsKey?: string | null;
  collectedAt?: Date | string | null;
  ingestRunId?: string | null;
}

export interface MetricKpiInputRef {
  id?: string;
  source: string;
  metricName: string;
  metricDate: string;
  dimensions?: Record<string, string> | null;
}

export interface MetricKpiDefinition {
  id: string;
  label: string;
  dashboardBlock: MetricKpiDashboardBlock;
  surface?: SurfaceKey;
  source: string;
  sourceAliases?: string[];
  metric: string;
  metricAliases?: string[];
  unit?: string;
  agg?: AggStrategy;
  allowDimensionRollup?: boolean;
  staleAfterDays?: number;
  dirtySources?: string[];
  demoSources?: string[];
  provenanceLabel?: string;
  emptyState?: MetricKpiQualityStatus;
}

export interface ComputedMetricKpiValue {
  definition: MetricKpiDefinition;
  kpiId: string;
  label: string;
  dashboardBlock: MetricKpiDashboardBlock;
  surface?: SurfaceKey;
  source: string;
  metricName: string;
  value: number | null;
  valueText: string | null;
  unit?: string;
  qualityStatus: MetricKpiQualityStatus;
  provenanceLabel: string;
  inputRefs: MetricKpiInputRef[];
  sourceCoverage: number;
  range: { from: string; to: string };
}

export const METRIC_KPI_DEFINITION_VERSION = 1;

const SOURCE_ALIASES: Record<string, string> = {
  meta: "meta_ads",
  "meta-ads": "meta_ads",
  meta_ads: "meta_ads",
  google: "google_ads",
  "google-ads": "google_ads",
  google_ads: "google_ads",
  "linkedin-ads": "linkedin_ads",
  linkedin_ads: "linkedin_ads",
  "tiktok-ads": "tiktok_ads",
  tiktok_ads: "tiktok_ads",
  "google-analytics": "ga4",
  ga4: "ga4",
  "google-search-console": "gsc",
  gsc: "gsc",
  instantly: "instantly",
  lemlist: "lemlist",
  ghl: "ghl",
  "go-high-level": "ghl",
  "go_high_level": "ghl",
  "trust core": "trust_score",
  "trust_core": "trust_score",
  "trust-core": "trust_score",
  "trust engine": "trust_score",
  "trust_engine": "trust_score",
  "trust-score": "trust_score",
  trust_score: "trust_score",
};

const METRIC_ALIASES: Record<string, string> = {
  emailsSent: "sent",
  messagesSent: "sent",
  sent: "sent",
  opened: "opens",
  replied: "replies",
  messagesBounced: "bounced",
  unsubscribes: "unsubscribed",
  optOuts: "unsubscribed",
  meetingBooked: "meetings",
  inp_mobile: "inp_mobile",
  tbt_mobile: "inp_mobile",
  video_views: "videoViews",
  videoViews: "videoViews",
  followerCount: "followers",
  followersTotal: "followers",
  "Borrow Trust": "borrowed_trust",
  borrowTrust: "borrowed_trust",
  borrow_trust: "borrowed_trust",
  borrowedTrust: "borrowed_trust",
  "Brand Assets": "brand_assets",
  brandAssets: "brand_assets",
  "Demand Agents": "demand_engine",
  demandAgents: "demand_engine",
  demand_agents: "demand_engine",
  demandEngine: "demand_engine",
  "Geo Presence": "geo_presence",
  geoPresence: "geo_presence",
  "Out of Readiness": "outbound_readiness",
  outReadiness: "outbound_readiness",
  out_of_readiness: "outbound_readiness",
  outboundReadiness: "outbound_readiness",
  "Served Trust": "serp_trust",
  servedTrust: "serp_trust",
  served_trust: "serp_trust",
  serpTrust: "serp_trust",
  "Trust Core Global": "trust_score",
  trustCoreGlobal: "trust_score",
  trust_core_global: "trust_score",
};

const DEFAULT_STALE_AFTER_DAYS = 7;
const ROLLUP_METADATA_DIMENSION_KEYS = new Set([
  "__provenance",
  "__quality",
  "__type",
  "__demo",
  "__seed",
  "provenance",
  "quality",
  "seed",
  "demo",
  "type",
]);

const webSeoDefinitions: MetricKpiDefinition[] = [
  kpi("web.sessions", "Sessions", "overview", "web", "ga4", "sessions"),
  kpi("web.users", "Users", "surface", "web", "ga4", "totalUsers"),
  kpi("web.new_users", "New users", "surface", "web", "ga4", "newUsers"),
  kpi("web.pageviews", "Pageviews", "surface", "web", "ga4", "screenPageViews"),
  kpi(
    "web.conversions",
    "GA4 conversions",
    "surface",
    "web",
    "ga4",
    "conversions",
  ),
  kpi(
    "web.engagement_rate",
    "Engagement rate",
    "surface",
    "web",
    "ga4",
    "engagementRate",
    { unit: "%" },
  ),
  kpi("web.gsc_clicks", "GSC clicks", "surface", "web", "gsc", "clicks"),
  kpi(
    "web.gsc_impressions",
    "GSC impressions",
    "surface",
    "web",
    "gsc",
    "impressions",
  ),
  kpi("web.gsc_ctr", "GSC CTR", "surface", "web", "gsc", "ctr", { unit: "%" }),
  kpi("web.gsc_position", "Avg position", "surface", "web", "gsc", "position"),
  kpi(
    "web.pagespeed_mobile",
    "PageSpeed mobile",
    "surface",
    "web",
    "pagespeed",
    "performance_mobile",
  ),
  kpi(
    "web.pagespeed_desktop",
    "PageSpeed desktop",
    "surface",
    "web",
    "pagespeed",
    "performance_desktop",
  ),
  kpi(
    "web.lcp_mobile",
    "LCP mobile",
    "surface",
    "web",
    "pagespeed",
    "lcp_mobile",
    { unit: "s" },
  ),
  kpi(
    "web.cls_mobile",
    "CLS mobile",
    "surface",
    "web",
    "pagespeed",
    "cls_mobile",
  ),
  kpi(
    "web.inp_mobile",
    "INP mobile",
    "surface",
    "web",
    "pagespeed",
    "inp_mobile",
    {
      unit: "ms",
      metricAliases: ["inp_mobile", "tbt_mobile"],
    },
  ),
];

const TRUST_CORE_SOURCE_ALIASES = [
  "trust_core",
  "trust-core",
  "trust-score",
  "trust engine",
  "Trust Core",
];

const TRUST_CORE_KPIS: Array<{
  id: string;
  label: string;
  metric: string;
  aliases: string[];
}> = [
  {
    id: "reputation.trust_score",
    label: "Trust Core Global",
    metric: "trust_score",
    aliases: ["trustCoreGlobal", "trust_core_global"],
  },
  {
    id: "reputation.borrowed_trust",
    label: "Borrow Trust",
    metric: "borrowed_trust",
    aliases: ["borrow_trust", "borrowTrust", "borrowedTrust"],
  },
  {
    id: "reputation.brand_assets",
    label: "Brand Assets",
    metric: "brand_assets",
    aliases: ["brandAssets"],
  },
  {
    id: "reputation.demand_engine",
    label: "Demand Agents",
    metric: "demand_engine",
    aliases: ["demand_agents", "demandAgents", "demandEngine"],
  },
  {
    id: "reputation.geo_presence",
    label: "Geo Presence",
    metric: "geo_presence",
    aliases: ["geoPresence"],
  },
  {
    id: "reputation.outbound_readiness",
    label: "Out of Readiness",
    metric: "outbound_readiness",
    aliases: ["out_of_readiness", "outReadiness", "outboundReadiness"],
  },
  {
    id: "reputation.serp_trust",
    label: "Served Trust",
    metric: "serp_trust",
    aliases: ["served_trust", "servedTrust", "serpTrust"],
  },
];

const reputationDefinitions: MetricKpiDefinition[] = TRUST_CORE_KPIS.map(
  (item) =>
    kpi(
      item.id,
      item.label,
      "surface",
      "reputation",
      "trust_score",
      item.metric,
      {
        metricAliases: item.aliases,
        sourceAliases: TRUST_CORE_SOURCE_ALIASES,
      },
    ),
);

const paidDefinitions: MetricKpiDefinition[] = [
  kpi("paid.meta.spend", "Meta spend", "surface", "paid", "meta_ads", "spend", {
    unit: "currency",
  }),
  kpi(
    "paid.meta.impressions",
    "Meta impressions",
    "surface",
    "paid",
    "meta_ads",
    "impressions",
  ),
  kpi(
    "paid.meta.clicks",
    "Meta clicks",
    "surface",
    "paid",
    "meta_ads",
    "clicks",
  ),
  kpi("paid.meta.ctr", "Meta CTR", "surface", "paid", "meta_ads", "ctr", {
    unit: "%",
  }),
  kpi("paid.meta.cpc", "Meta CPC", "surface", "paid", "meta_ads", "cpc", {
    unit: "currency",
  }),
  kpi(
    "paid.meta.conversions",
    "Meta platform conversions",
    "surface",
    "paid",
    "meta_ads",
    "conversions",
    {
      provenanceLabel: "Meta Ads - platform/dedup",
    },
  ),
  kpi(
    "paid.meta.revenue",
    "Meta platform revenue",
    "surface",
    "paid",
    "meta_ads",
    "revenue",
    {
      unit: "currency",
      provenanceLabel: "Meta Ads - platform/dedup",
    },
  ),
  kpi(
    "paid.meta.roas",
    "Meta platform ROAS",
    "surface",
    "paid",
    "meta_ads",
    "roas",
    {
      unit: "ratio",
      provenanceLabel: "Meta Ads - platform/dedup",
    },
  ),
  kpi("paid.meta.frequency", "Meta frequency", "surface", "paid", "meta_ads", "frequency"),
  kpi("paid.meta.leads", "Meta platform leads", "surface", "paid", "meta_ads", "leads", {
    provenanceLabel: "Meta Ads - platform/dedup",
  }),
  kpi("paid.meta.hook_rate", "Meta creative hook rate", "surface", "paid", "meta_ads", "hookRate", {
    unit: "%",
    allowDimensionRollup: true,
    provenanceLabel: "Meta Ads - creative seed/collector",
  }),
  kpi(
    "paid.google.spend",
    "Google Ads spend",
    "surface",
    "paid",
    "google_ads",
    "spend",
    { unit: "currency" },
  ),
  kpi("paid.google.impressions", "Google Ads impressions", "surface", "paid", "google_ads", "impressions"),
  kpi("paid.google.clicks", "Google Ads clicks", "surface", "paid", "google_ads", "clicks"),
  kpi("paid.google.ctr", "Google Ads CTR", "surface", "paid", "google_ads", "ctr", { unit: "%" }),
  kpi("paid.google.cpc", "Google Ads CPC", "surface", "paid", "google_ads", "cpc", { unit: "currency" }),
  kpi("paid.google.conversions", "Google Ads platform conversions", "surface", "paid", "google_ads", "conversions", {
    provenanceLabel: "Google Ads - platform/dedup",
  }),
  kpi("paid.google.revenue", "Google Ads platform revenue", "surface", "paid", "google_ads", "revenue", {
    unit: "currency",
    provenanceLabel: "Google Ads - platform/dedup",
  }),
  kpi("paid.google.roas", "Google Ads platform ROAS", "surface", "paid", "google_ads", "roas", {
    unit: "ratio",
    provenanceLabel: "Google Ads - platform/dedup",
  }),
  kpi("paid.google.impression_share", "Google impression share", "surface", "paid", "google_ads", "impressionShare", {
    unit: "%",
    allowDimensionRollup: true,
  }),
  kpi(
    "paid.google.lost_impression_share",
    "Google lost impression share",
    "surface",
    "paid",
    "google_ads",
    "lostImpressionShare",
    {
      unit: "%",
      allowDimensionRollup: true,
    },
  ),
];

const productDefinitions: MetricKpiDefinition[] = [
  kpi(
    "product.pageviews",
    "Product pageviews",
    "surface",
    "product",
    "posthog",
    "pageviews",
  ),
  kpi(
    "product.activation_events",
    "Activation events",
    "surface",
    "product",
    "posthog",
    "activation_events",
  ),
  kpi(
    "product.activation_rate",
    "Activation rate",
    "surface",
    "product",
    "posthog",
    "activation_rate",
    { unit: "%" },
  ),
  kpi(
    "product.north_star_weekly",
    "Product North Star weekly",
    "surface",
    "product",
    "posthog",
    "north_star_weekly",
  ),
];

const pipelineDefinitions: MetricKpiDefinition[] = [
  kpi(
    "pipeline.ghl.contacts",
    "GHL total contacts",
    "surface",
    "pipeline",
    "ghl",
    "totalContacts",
    {
      dirtySources: ["ghl"],
    },
  ),
  kpi(
    "pipeline.ghl.opportunities",
    "GHL opportunities",
    "surface",
    "pipeline",
    "ghl",
    "totalOpportunities",
    {
      dirtySources: ["ghl"],
    },
  ),
  kpi(
    "pipeline.ghl.pipeline_value",
    "GHL pipeline value",
    "surface",
    "pipeline",
    "ghl",
    "pipelineValue",
    {
      unit: "currency",
      dirtySources: ["ghl"],
    },
  ),
  kpi(
    "pipeline.ghl.appointments",
    "GHL appointments",
    "surface",
    "pipeline",
    "ghl",
    "appointments",
    {
      dirtySources: ["ghl"],
    },
  ),
];

const outboundDefinitions: MetricKpiDefinition[] = [
  kpi("outbound.sent", "Emails sent", "surface", "email", "instantly", "sent", {
    metricAliases: ["sent", "emailsSent"],
    sourceAliases: ["lemlist"],
  }),
  kpi(
    "outbound.opens",
    "Email opens",
    "surface",
    "email",
    "instantly",
    "opens",
    { sourceAliases: ["lemlist"] },
  ),
  kpi(
    "outbound.replies",
    "Email replies",
    "surface",
    "email",
    "instantly",
    "replies",
    { sourceAliases: ["lemlist"] },
  ),
  kpi("outbound.delivered", "Emails delivered", "surface", "email", "lemlist", "delivered"),
  kpi("outbound.bounced", "Email bounces", "surface", "email", "lemlist", "bounced", {
    metricAliases: ["bounced", "messagesBounced"],
  }),
  kpi("outbound.unsubscribed", "Email unsubscribes", "surface", "email", "lemlist", "unsubscribed"),
  kpi("outbound.positive_replies", "Positive replies", "surface", "email", "lemlist", "interested"),
  kpi("outbound.meetings", "Outbound meetings", "surface", "email", "lemlist", "meetings"),
];

const socialDefinitions: MetricKpiDefinition[] = [
  kpi(
    "social.posts",
    "Social posts",
    "surface",
    "social",
    "metricool",
    "posts",
    { allowDimensionRollup: true },
  ),
  kpi(
    "social.impressions",
    "Social impressions",
    "surface",
    "social",
    "metricool",
    "impressions",
    {
      allowDimensionRollup: true,
    },
  ),
  kpi(
    "social.clicks",
    "Social clicks",
    "surface",
    "social",
    "metricool",
    "clicks",
    { allowDimensionRollup: true },
  ),
  kpi(
    "social.likes",
    "Social likes",
    "surface",
    "social",
    "metricool",
    "likes",
    { allowDimensionRollup: true },
  ),
  kpi(
    "social.comments",
    "Social comments",
    "surface",
    "social",
    "metricool",
    "comments",
    { allowDimensionRollup: true },
  ),
  kpi(
    "social.avg_engagement",
    "Social avg engagement",
    "surface",
    "social",
    "metricool",
    "avgEngagement",
    {
      allowDimensionRollup: true,
    },
  ),
  kpi("social.reach", "Social reach", "surface", "social", "metricool", "reach", {
    allowDimensionRollup: true,
  }),
  kpi("social.followers", "Social followers", "surface", "social", "metricool", "followers", {
    allowDimensionRollup: true,
  }),
  kpi("social.video_views", "Social video views", "surface", "social", "metricool", "videoViews", {
    metricAliases: ["videoViews", "video_views"],
    allowDimensionRollup: true,
  }),
  kpi("social.shares", "Social shares", "surface", "social", "metricool", "shares", {
    allowDimensionRollup: true,
  }),
  kpi("social.saves", "Social saves", "surface", "social", "metricool", "saves", {
    allowDimensionRollup: true,
  }),
];

const partnershipDefinitions: MetricKpiDefinition[] = [
  kpi(
    "partnerships.clicks",
    "Partnership clicks",
    "surface",
    "partnerships",
    "yalc",
    "clicks",
  ),
  kpi(
    "partnerships.signups",
    "Partnership signups",
    "surface",
    "partnerships",
    "yalc",
    "signups",
  ),
  kpi(
    "partnerships.kyc",
    "Partnership KYC",
    "surface",
    "partnerships",
    "yalc",
    "kyc",
  ),
  kpi(
    "partnerships.invested",
    "Partnership invested",
    "surface",
    "partnerships",
    "yalc",
    "invested",
    {
      unit: "currency",
    },
  ),
  kpi(
    "partnerships.value",
    "Partnership value",
    "surface",
    "partnerships",
    "yalc",
    "value",
    {
      unit: "currency",
    },
  ),
];

const futureBlockDefinitions: MetricKpiDefinition[] = [
  kpi(
    "channels.attribution_results",
    "Channel attribution results",
    "channels",
    undefined,
    "semantic",
    "metric_attribution_results",
    {
      emptyState: "missing",
    },
  ),
  kpi(
    "conversion.stage_rollups",
    "Conversion stage rollups",
    "conversion",
    undefined,
    "semantic",
    "metric_stage_rollups",
    {
      emptyState: "missing",
    },
  ),
  kpi(
    "trends.annotations",
    "Trend annotations",
    "trends",
    undefined,
    "semantic",
    "metric_annotations",
    {
      emptyState: "missing",
    },
  ),
];

export const METRIC_KPI_DEFINITIONS: MetricKpiDefinition[] = [
  ...webSeoDefinitions,
  ...reputationDefinitions,
  ...paidDefinitions,
  ...productDefinitions,
  ...pipelineDefinitions,
  ...outboundDefinitions,
  ...socialDefinitions,
  ...partnershipDefinitions,
  ...futureBlockDefinitions,
];

function kpi(
  id: string,
  label: string,
  dashboardBlock: MetricKpiDashboardBlock,
  surface: SurfaceKey | undefined,
  source: string,
  metric: string,
  opts: Partial<MetricKpiDefinition> = {},
): MetricKpiDefinition {
  return {
    id,
    label,
    dashboardBlock,
    surface,
    source,
    metric,
    staleAfterDays: DEFAULT_STALE_AFTER_DAYS,
    ...opts,
  };
}

export function normalizeSourceId(source: string): string {
  const normalized = source.trim().replace(/\s+/g, "_").toLowerCase();
  return SOURCE_ALIASES[source] ?? SOURCE_ALIASES[normalized] ?? normalized;
}

export function normalizeMetricName(metric: string): string {
  const normalized = metric.trim().replace(/[\s-]+/g, "_");
  const lower = normalized.toLowerCase();
  return (
    METRIC_ALIASES[metric] ??
    METRIC_ALIASES[normalized] ??
    METRIC_ALIASES[lower] ??
    metric
  );
}

function metricNamesFor(def: MetricKpiDefinition): Set<string> {
  return new Set(
    [def.metric, ...(def.metricAliases ?? [])].map(normalizeMetricName),
  );
}

function sourcesFor(def: MetricKpiDefinition): Set<string> {
  return new Set(
    [def.source, ...(def.sourceAliases ?? [])].map(normalizeSourceId),
  );
}

function isRollup(row: MetricKpiSnapshotInput): boolean {
  if (!row.dimsKey) return true;
  const dims = row.dimensions ?? {};
  return Object.keys(dims).every((key) =>
    ROLLUP_METADATA_DIMENSION_KEYS.has(key),
  );
}

function isDemoRow(row: MetricKpiSnapshotInput): boolean {
  return (
    isDemoQualityMetadata(row.dimensions) ||
    isDemoProvenanceValue(normalizeSourceId(row.source))
  );
}

function reduceRows(
  def: MetricKpiDefinition,
  rows: MetricKpiSnapshotInput[],
): number {
  const strategy = def.agg ?? aggFor(def.source, def.metric);
  if (strategy === "latest") {
    if (def.allowDimensionRollup) {
      const byDimension = new Map<string, MetricKpiSnapshotInput>();
      for (const row of rows) {
        const key = row.dimsKey ?? "";
        const existing = byDimension.get(key);
        if (!existing || row.metricDate.localeCompare(existing.metricDate) > 0)
          byDimension.set(key, row);
      }
      return [...byDimension.values()].reduce(
        (acc, row) => acc + Number(row.value ?? 0),
        0,
      );
    }
    const best = [...rows].sort((a, b) =>
      b.metricDate.localeCompare(a.metricDate),
    )[0];
    return Number(best.value ?? 0);
  }
  const values = rows
    .map((row) => Number(row.value))
    .filter((value) => Number.isFinite(value));
  const sum = values.reduce((acc, value) => acc + value, 0);
  return strategy === "avg" ? sum / Math.max(values.length, 1) : sum;
}

function daysInclusive(from: string, to: string): number {
  const fromTime = new Date(`${from}T00:00:00Z`).getTime();
  const toTime = new Date(`${to}T00:00:00Z`).getTime();
  if (
    !Number.isFinite(fromTime) ||
    !Number.isFinite(toTime) ||
    toTime < fromTime
  )
    return 1;
  return Math.floor((toTime - fromTime) / 86_400_000) + 1;
}

function ageDays(latestDate: string, to: string): number {
  const latestTime = new Date(`${latestDate}T00:00:00Z`).getTime();
  const toTime = new Date(`${to}T00:00:00Z`).getTime();
  if (!Number.isFinite(latestTime) || !Number.isFinite(toTime)) return 0;
  return Math.floor((toTime - latestTime) / 86_400_000);
}

function qualityFor(
  def: MetricKpiDefinition,
  rows: MetricKpiSnapshotInput[],
  rangeTo: string,
  dayCount: number,
): MetricKpiQualityStatus {
  if (!rows.length) return def.emptyState ?? "missing";
  const canonicalSources = new Set(
    rows.map((row) => normalizeSourceId(row.source)),
  );
  if (
    rows.some(isDemoRow) ||
    [...canonicalSources].some((source) => def.demoSources?.includes(source))
  )
    return "demo";
  if (
    [...canonicalSources].some((source) => def.dirtySources?.includes(source))
  )
    return "dirty";
  const latest = rows
    .map((row) => row.metricDate)
    .sort()
    .at(-1);
  if (
    latest &&
    ageDays(latest, rangeTo) > (def.staleAfterDays ?? DEFAULT_STALE_AFTER_DAYS)
  )
    return "stale";
  const strategy = def.agg ?? aggFor(def.source, def.metric);
  const observedDays = new Set(rows.map((row) => row.metricDate)).size;
  if (strategy !== "latest" && observedDays < dayCount) return "partial";
  return "ok";
}

function inputRefs(rows: MetricKpiSnapshotInput[]): MetricKpiInputRef[] {
  return rows.slice(0, 100).map((row) => ({
    id: row.id ?? undefined,
    source: row.source,
    metricName: row.metricName,
    metricDate: row.metricDate,
    dimensions: row.dimensions ?? null,
  }));
}

export function computeSemanticKpisFromSnapshots(
  rows: MetricKpiSnapshotInput[],
  range: { from: string; to: string },
  definitions: MetricKpiDefinition[] = METRIC_KPI_DEFINITIONS,
): ComputedMetricKpiValue[] {
  const windowRows = rows.filter(
    (row) => row.metricDate >= range.from && row.metricDate <= range.to,
  );
  const dayCount = daysInclusive(range.from, range.to);

  return definitions.map((def) => {
    const sourceSet = sourcesFor(def);
    const metricSet = metricNamesFor(def);
    const matching = windowRows.filter((row) => {
      if (row.value == null || !Number.isFinite(Number(row.value)))
        return false;
      return (
        sourceSet.has(normalizeSourceId(row.source)) &&
        metricSet.has(normalizeMetricName(row.metricName))
      );
    });
    const rollupRows = matching.filter(isRollup);
    const selected = rollupRows.length
      ? rollupRows
      : def.allowDimensionRollup
        ? matching
        : [];
    const value = selected.length ? reduceRows(def, selected) : null;
    const dates = new Set(selected.map((row) => row.metricDate));
    const qualityStatus = qualityFor(def, selected, range.to, dayCount);
    const sourceCoverage = selected.length
      ? Math.min(1, dates.size / dayCount)
      : 0;

    return {
      definition: def,
      kpiId: def.id,
      label: def.label,
      dashboardBlock: def.dashboardBlock,
      surface: def.surface,
      source: def.source,
      metricName: def.metric,
      value,
      valueText: null,
      unit: def.unit,
      qualityStatus,
      provenanceLabel: def.provenanceLabel ?? `${def.source}.${def.metric}`,
      inputRefs: inputRefs(selected),
      sourceCoverage,
      range,
    };
  });
}

export function summarizeKpiQuality(
  values: ComputedMetricKpiValue[],
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const value of values)
    out[value.qualityStatus] = (out[value.qualityStatus] ?? 0) + 1;
  return out;
}
