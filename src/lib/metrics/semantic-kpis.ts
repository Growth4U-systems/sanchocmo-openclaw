import { aggFor, type AggStrategy } from "@/lib/metrics/aggregation";
import {
  isDemoProvenanceValue,
  isDemoQualityMetadata,
  metricScopeEvidenceStatus,
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
  /** For latest scalar snapshots, a complete scope-evidence row with no value
   * authoritatively clears an older observation instead of falling back to it. */
  authoritativeLatestScope?: boolean;
  /**
   * Companion denominator used to combine per-snapshot averages/rates without
   * giving a tiny sample the same influence as a large one. The companion row
   * must share source, date and dimensions with every selected value row;
   * otherwise aggregation deliberately falls back to the legacy plain mean.
   */
  weightMetric?: string;
  weightMetricAliases?: string[];
  /** Display-layer normalization applied after aggregation (for example GA4
   * stores engagementRate as a 0..1 ratio while this KPI is expressed as %). */
  valueMultiplier?: number;
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

export interface MetricKpiEvaluationOptions {
  /**
   * UTC provider-observation boundary. Flow reducers remain strictly inside
   * `range`; only `latest` definitions may use observations before/after that
   * flow window, and never later than this day.
   */
  observationAsOf?: string;
}

function normalizedObservationAsOf(value: string | undefined, fallback: string): string {
  const day = value ?? fallback;
  const parsed = /^\d{4}-\d{2}-\d{2}$/.test(day)
    ? new Date(`${day}T00:00:00.000Z`)
    : null;
  if (!parsed || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== day) {
    throw new RangeError(`Invalid KPI observationAsOf: ${day}`);
  }
  return day;
}

// v10 adds Explee's provider-native lifetime/current project snapshots. They
// are explicit `latest` KPIs and must never be summed into daily outbound flows
// or mixed into the Instantly + Lemlist cross-provider counters.
export const METRIC_KPI_DEFINITION_VERSION = 10;

const SOURCE_ALIASES: Record<string, string> = {
  meta: "meta_ads",
  "meta-ads": "meta_ads",
  meta_ads: "meta_ads",
  metaads: "meta_ads",
  google: "google_ads",
  "google-ads": "google_ads",
  google_ads: "google_ads",
  googleads: "google_ads",
  "linkedin-ads": "linkedin_ads",
  linkedin_ads: "linkedin_ads",
  "tiktok-ads": "tiktok_ads",
  tiktok_ads: "tiktok_ads",
  "google-analytics": "ga4",
  google_analytics: "ga4",
  ga4: "ga4",
  "google-search-console": "gsc",
  google_search_console: "gsc",
  gsc: "gsc",
  instantly: "instantly",
  lemlist: "lemlist",
  explee: "explee",
  ghl: "ghl",
  "go-high-level": "ghl",
  "go_high_level": "ghl",
  gohighlevel: "ghl",
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
  video_views: "videoViews",
  videoViews: "videoViews",
  followerCount: "followers",
  followersTotal: "followers",
  "Borrow Trust": "borrowed_trust",
  "Borrowed Trust": "borrowed_trust",
  borrowTrust: "borrowed_trust",
  borrow_trust: "borrowed_trust",
  borrowedTrust: "borrowed_trust",
  "Brand Assets": "brand_assets",
  brandAssets: "brand_assets",
  "Demand Agents": "demand_engine",
  "Demand Engine": "demand_engine",
  demandAgents: "demand_engine",
  demand_agents: "demand_engine",
  demandEngine: "demand_engine",
  "Geo Presence": "geo_presence",
  "GEO Presence": "geo_presence",
  geoPresence: "geo_presence",
  "Out of Readiness": "outbound_readiness",
  "Outbound Readiness": "outbound_readiness",
  outReadiness: "outbound_readiness",
  out_of_readiness: "outbound_readiness",
  outboundReadiness: "outbound_readiness",
  "SERP Trust": "serp_trust",
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
  "__scopeEvidence",
  "provenance",
  "quality",
  "seed",
  "demo",
  "type",
]);

const webSeoDefinitions: MetricKpiDefinition[] = [
  kpi("web.sessions", "Visitas web", "overview", "web", "ga4", "sessions"),
  kpi(
    "web.users",
    "Usuarios diarios medios",
    "surface",
    "web",
    "ga4",
    "totalUsers",
    { agg: "avg" },
  ),
  kpi("web.new_users", "Usuarios nuevos", "surface", "web", "ga4", "newUsers"),
  kpi("web.pageviews", "Paginas vistas", "surface", "web", "ga4", "screenPageViews"),
  kpi(
    "web.conversions",
    "Conversiones GA4",
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
    { unit: "%", weightMetric: "sessions", valueMultiplier: 100 },
  ),
  kpi("web.gsc_clicks", "Clicks GSC", "surface", "web", "gsc", "clicks"),
  kpi(
    "web.gsc_impressions",
    "Impresiones GSC",
    "surface",
    "web",
    "gsc",
    "impressions",
  ),
  kpi("web.gsc_ctr", "CTR GSC", "surface", "web", "gsc", "ctr", {
    unit: "%",
    weightMetric: "impressions",
  }),
  kpi("web.gsc_position", "Posicion media", "surface", "web", "gsc", "position", {
    weightMetric: "impressions",
  }),
  kpi(
    "web.pagespeed_mobile",
    "Lighthouse performance mobile (lab)",
    "surface",
    "web",
    "pagespeed",
    "performance_mobile",
    { provenanceLabel: "PageSpeed · Lighthouse laboratorio" },
  ),
  kpi(
    "web.pagespeed_desktop",
    "Lighthouse performance desktop (lab)",
    "surface",
    "web",
    "pagespeed",
    "performance_desktop",
    { provenanceLabel: "PageSpeed · Lighthouse laboratorio" },
  ),
  kpi(
    "web.lcp_mobile",
    "LCP mobile (lab)",
    "surface",
    "web",
    "pagespeed",
    "lcp_mobile",
    { unit: "s", provenanceLabel: "PageSpeed · Lighthouse laboratorio" },
  ),
  kpi(
    "web.cls_mobile",
    "CLS mobile (lab)",
    "surface",
    "web",
    "pagespeed",
    "cls_mobile",
    { provenanceLabel: "PageSpeed · Lighthouse laboratorio" },
  ),
  kpi(
    "web.inp_mobile",
    "INP mobile (lab)",
    "surface",
    "web",
    "pagespeed",
    "inp_mobile",
    {
      unit: "ms",
      metricAliases: ["inp_mobile"],
      provenanceLabel: "PageSpeed · Lighthouse laboratorio",
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
    label: "Borrowed Trust",
    metric: "borrowed_trust",
    aliases: ["Borrow Trust", "borrow_trust", "borrowTrust", "borrowedTrust"],
  },
  {
    id: "reputation.brand_assets",
    label: "Brand Assets",
    metric: "brand_assets",
    aliases: ["brandAssets"],
  },
  {
    id: "reputation.demand_engine",
    label: "Demand Engine",
    metric: "demand_engine",
    aliases: ["Demand Agents", "demand_agents", "demandAgents", "demandEngine"],
  },
  {
    id: "reputation.geo_presence",
    label: "GEO Presence",
    metric: "geo_presence",
    aliases: ["Geo Presence", "geoPresence"],
  },
  {
    id: "reputation.outbound_readiness",
    label: "Outbound Readiness",
    metric: "outbound_readiness",
    aliases: ["Out of Readiness", "out_of_readiness", "outReadiness", "outboundReadiness"],
  },
  {
    id: "reputation.serp_trust",
    label: "SERP Trust",
    metric: "serp_trust",
    aliases: ["Served Trust", "served_trust", "servedTrust", "serpTrust"],
  },
];

const TRUST_CORE_LABEL_BY_KPI_ID = new Map(
  TRUST_CORE_KPIS.map((item) => [item.id, item.label]),
);
const TRUST_CORE_LABEL_BY_METRIC = new Map(
  TRUST_CORE_KPIS.map((item) => [item.metric, item.label]),
);

export function canonicalMetricKpiLabel(input: {
  kpiId?: string | null;
  label?: string | null;
  source?: string | null;
  metricName?: string | null;
}): string {
  const currentLabel = input.label ?? "";
  const labelById = input.kpiId ? TRUST_CORE_LABEL_BY_KPI_ID.get(input.kpiId) : null;
  if (labelById) return labelById;

  const source = input.source ? normalizeSourceId(input.source) : "";
  const metric = normalizeMetricName(input.metricName ?? currentLabel);
  const labelByMetric = TRUST_CORE_LABEL_BY_METRIC.get(metric);
  if (source === "trust_score" && labelByMetric) return labelByMetric;

  return currentLabel;
}

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
    unit: "account_currency",
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
    weightMetric: "impressions",
  }),
  kpi("paid.meta.cpc", "Meta CPC", "surface", "paid", "meta_ads", "cpc", {
    unit: "account_currency",
    weightMetric: "clicks",
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
      unit: "account_currency",
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
      weightMetric: "spend",
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
    { unit: "account_currency" },
  ),
  kpi("paid.google.impressions", "Google Ads impressions", "surface", "paid", "google_ads", "impressions"),
  kpi("paid.google.clicks", "Google Ads clicks", "surface", "paid", "google_ads", "clicks"),
  kpi("paid.google.ctr", "Google Ads CTR", "surface", "paid", "google_ads", "ctr", {
    unit: "%",
    weightMetric: "impressions",
  }),
  kpi("paid.google.cpc", "Google Ads CPC", "surface", "paid", "google_ads", "cpc", {
    unit: "account_currency",
    weightMetric: "clicks",
  }),
  kpi("paid.google.conversions", "Google Ads platform conversions", "surface", "paid", "google_ads", "conversions", {
    provenanceLabel: "Google Ads - platform/dedup",
  }),
  kpi("paid.google.revenue", "Google Ads platform revenue", "surface", "paid", "google_ads", "revenue", {
    unit: "account_currency",
    provenanceLabel: "Google Ads - platform/dedup",
  }),
  kpi("paid.google.roas", "Google Ads platform ROAS", "surface", "paid", "google_ads", "roas", {
    unit: "ratio",
    weightMetric: "spend",
    provenanceLabel: "Google Ads - platform/dedup",
  }),
  kpi("paid.google.impression_share", "Google impression share", "surface", "paid", "google_ads", "impressionShare", {
    unit: "%",
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
    "Eventos de activación por 100 pageviews",
    "surface",
    "product",
    "posthog",
    "activation_rate",
    { unit: "%", weightMetric: "pageviews" },
  ),
  kpi(
    "product.north_star_weekly",
    "Eventos North Star del rango",
    "surface",
    "product",
    "posthog",
    "north_star_weekly",
  ),
];

const pipelineDefinitions: MetricKpiDefinition[] = [
  kpi(
    "pipeline.ghl.contacts",
    "Total contactos GHL",
    "surface",
    "pipeline",
    "ghl",
    "totalContacts",
  ),
  kpi(
    "pipeline.ghl.new_contacts",
    "Contactos nuevos GHL del rango",
    "surface",
    "pipeline",
    "ghl",
    "newContacts",
  ),
  kpi(
    "pipeline.ghl.opportunities",
    "Oportunidades GHL del rango",
    "surface",
    "pipeline",
    "ghl",
    "opportunities",
  ),
  kpi(
    "pipeline.ghl.pipeline_value",
    "Valor de oportunidades GHL creadas en el rango",
    "surface",
    "pipeline",
    "ghl",
    "pipelineValue",
    {
      unit: "account_currency",
    },
  ),
  kpi(
    "pipeline.ghl.appointments",
    "Reuniones GHL del rango",
    "surface",
    "pipeline",
    "ghl",
    "appointments",
  ),
];

const outboundDefinitions: MetricKpiDefinition[] = [
  // Cross-provider counters remain available only as absolute observed totals.
  // Ratios in the UI use the provider-specific definitions below so Lemlist
  // deliverability can never be divided by Instantly volume (or vice versa).
  kpi("outbound.sent", "Envíos reportados por proveedores", "surface", "email", "instantly", "sent", {
    metricAliases: ["sent", "emailsSent"],
    sourceAliases: ["lemlist"],
    provenanceLabel: "Instantly + Lemlist · suma de envíos reportados",
  }),
  kpi(
    "outbound.opens",
    "Aperturas reportadas por proveedores",
    "surface",
    "email",
    "instantly",
    "opens",
    {
      sourceAliases: ["lemlist"],
      provenanceLabel: "Instantly + Lemlist · contadores de apertura no deduplicados",
    },
  ),
  kpi(
    "outbound.replies",
    "Replies reportados por proveedores",
    "surface",
    "email",
    "instantly",
    "replies",
    {
      sourceAliases: ["lemlist"],
      provenanceLabel: "Instantly + Lemlist · contadores de reply",
    },
  ),
  kpi("outbound.delivered", "Emails delivered", "surface", "email", "lemlist", "delivered"),
  kpi("outbound.bounced", "Email bounces", "surface", "email", "lemlist", "bounced", {
    metricAliases: ["bounced", "messagesBounced"],
  }),
  kpi("outbound.unsubscribed", "Email unsubscribes", "surface", "email", "lemlist", "unsubscribed"),
  kpi("outbound.positive_replies", "Positive replies", "surface", "email", "lemlist", "interested"),
  kpi("outbound.meetings", "Outbound meetings", "surface", "email", "lemlist", "meetings"),
  kpi(
    "outbound.instantly.sent",
    "Instantly · envíos",
    "surface",
    "email",
    "instantly",
    "sent",
    {
      metricAliases: ["emailsSent"],
      provenanceLabel: "Instantly · emailsSent",
    },
  ),
  kpi(
    "outbound.instantly.unique_opens",
    "Instantly · aperturas únicas",
    "surface",
    "email",
    "instantly",
    "uniqueOpens",
    { provenanceLabel: "Instantly · unique_opened" },
  ),
  kpi(
    "outbound.instantly.unique_replies",
    "Instantly · replies únicos",
    "surface",
    "email",
    "instantly",
    "uniqueReplies",
    { provenanceLabel: "Instantly · unique_replies" },
  ),
  kpi(
    "outbound.instantly.opportunities",
    "Instantly · oportunidades reportadas",
    "surface",
    "email",
    "instantly",
    "opportunities",
    { provenanceLabel: "Instantly · opportunities" },
  ),
  kpi(
    "outbound.lemlist.sent",
    "Lemlist · mensajes enviados",
    "surface",
    "email",
    "lemlist",
    "sent",
    { provenanceLabel: "Lemlist · messagesSent" },
  ),
  kpi(
    "outbound.lemlist.delivered",
    "Lemlist · mensajes entregados",
    "surface",
    "email",
    "lemlist",
    "delivered",
    { provenanceLabel: "Lemlist · delivered" },
  ),
  kpi(
    "outbound.lemlist.opens",
    "Lemlist · aperturas reportadas",
    "surface",
    "email",
    "lemlist",
    "opens",
    { provenanceLabel: "Lemlist · opened (contador del proveedor)" },
  ),
  kpi(
    "outbound.lemlist.replies",
    "Lemlist · replies reportados",
    "surface",
    "email",
    "lemlist",
    "replies",
    { provenanceLabel: "Lemlist · replied (contador del proveedor)" },
  ),
  kpi(
    "outbound.lemlist.bounced",
    "Lemlist · mensajes rebotados",
    "surface",
    "email",
    "lemlist",
    "bounced",
    {
      metricAliases: ["messagesBounced"],
      provenanceLabel: "Lemlist · messagesBounced",
    },
  ),
  kpi(
    "outbound.lemlist.unsubscribed",
    "Lemlist · leads desuscritos",
    "surface",
    "email",
    "lemlist",
    "unsubscribed",
    { provenanceLabel: "Lemlist · nbLeadsUnsubscribed" },
  ),
  kpi(
    "outbound.lemlist.positive_replies",
    "Lemlist · leads interesados",
    "surface",
    "email",
    "lemlist",
    "interested",
    { provenanceLabel: "Lemlist · nbLeadsInterested" },
  ),
  kpi(
    "outbound.lemlist.meetings",
    "Lemlist · reuniones reservadas",
    "surface",
    "email",
    "lemlist",
    "meetings",
    { provenanceLabel: "Lemlist · meetingBooked" },
  ),
  kpi(
    "outbound.explee.campaigns_current",
    "Explee · campañas no archivadas",
    "surface",
    "email",
    "explee",
    "campaignsCurrent",
    {
      agg: "latest",
      provenanceLabel: "Explee AutoGTM · snapshot acumulado del proveedor",
    },
  ),
  kpi(
    "outbound.explee.emails_sent_lifetime",
    "Explee · emails enviados acumulados",
    "surface",
    "email",
    "explee",
    "emailsSentLifetime",
    {
      agg: "latest",
      provenanceLabel: "Explee AutoGTM · snapshot acumulado del proveedor",
    },
  ),
  kpi(
    "outbound.explee.replies_lifetime",
    "Explee · respuestas acumuladas",
    "surface",
    "email",
    "explee",
    "repliesLifetime",
    {
      agg: "latest",
      provenanceLabel: "Explee AutoGTM · snapshot acumulado del proveedor",
    },
  ),
  kpi(
    "outbound.explee.reply_rate_lifetime",
    "Explee · tasa de respuesta acumulada",
    "surface",
    "email",
    "explee",
    "replyRatePctLifetime",
    {
      agg: "latest",
      authoritativeLatestScope: true,
      unit: "%",
      provenanceLabel: "Explee AutoGTM · snapshot acumulado del proveedor",
    },
  ),
  kpi(
    "outbound.explee.hot_leads_lifetime",
    "Explee · hot leads acumulados",
    "surface",
    "email",
    "explee",
    "hotLeadsLifetime",
    {
      agg: "latest",
      provenanceLabel: "Explee AutoGTM · snapshot acumulado del proveedor",
    },
  ),
  kpi(
    "outbound.explee.spend_lifetime",
    "Explee · gasto acumulado",
    "surface",
    "email",
    "explee",
    "spendUsdLifetime",
    {
      agg: "latest",
      unit: "USD",
      provenanceLabel: "Explee AutoGTM · snapshot acumulado del proveedor",
    },
  ),
  kpi(
    "outbound.explee.cpl_lifetime",
    "Explee · coste por hot lead acumulado",
    "surface",
    "email",
    "explee",
    "costPerHotLeadUsdLifetime",
    {
      agg: "latest",
      authoritativeLatestScope: true,
      unit: "USD",
      provenanceLabel: "Explee AutoGTM · snapshot acumulado del proveedor",
    },
  ),
];

const socialDefinitions: MetricKpiDefinition[] = [
  kpi(
    "social.posts",
    "Publicaciones creadas en el rango",
    "surface",
    "social",
    "metricool",
    "posts",
    {
      allowDimensionRollup: true,
      provenanceLabel: "Metricool · publicaciones creadas en el rango",
    },
  ),
  kpi(
    "social.impressions",
    "Impresiones acumuladas de publicaciones creadas en el rango",
    "surface",
    "social",
    "metricool",
    "impressions",
    {
      allowDimensionRollup: true,
      provenanceLabel: "Metricool · snapshot acumulado de la cohorte publicada",
    },
  ),
  kpi(
    "social.clicks",
    "Clicks acumulados de publicaciones creadas en el rango",
    "surface",
    "social",
    "metricool",
    "clicks",
    {
      allowDimensionRollup: true,
      provenanceLabel: "Metricool · snapshot acumulado de la cohorte publicada",
    },
  ),
  kpi(
    "social.likes",
    "Likes acumulados de publicaciones creadas en el rango",
    "surface",
    "social",
    "metricool",
    "likes",
    {
      allowDimensionRollup: true,
      provenanceLabel: "Metricool · snapshot acumulado de la cohorte publicada",
    },
  ),
  kpi(
    "social.comments",
    "Comentarios acumulados de publicaciones creadas en el rango",
    "surface",
    "social",
    "metricool",
    "comments",
    {
      allowDimensionRollup: true,
      provenanceLabel: "Metricool · snapshot acumulado de la cohorte publicada",
    },
  ),
  kpi(
    "social.avg_engagement",
    "Engagement acumulado medio por publicación (escala Metricool)",
    "surface",
    "social",
    "metricool",
    "avgEngagement",
    {
      allowDimensionRollup: true,
      weightMetric: "postsWithEngagement",
      provenanceLabel: "Metricool · snapshot acumulado de la cohorte · escala configurada por la marca",
    },
  ),
  kpi("social.reach", "Reach acumulado de publicaciones creadas en el rango", "surface", "social", "metricool", "reach", {
    allowDimensionRollup: true,
    provenanceLabel: "Metricool · snapshot acumulado de la cohorte publicada",
  }),
  kpi("social.followers", "Social followers", "surface", "social", "metricool", "followers", {
    allowDimensionRollup: true,
  }),
  kpi("social.video_views", "Views acumuladas de publicaciones creadas en el rango", "surface", "social", "metricool", "videoViews", {
    metricAliases: ["videoViews", "video_views"],
    allowDimensionRollup: true,
    provenanceLabel: "Metricool · snapshot acumulado de la cohorte publicada",
  }),
  kpi("social.shares", "Shares acumulados de publicaciones creadas en el rango", "surface", "social", "metricool", "shares", {
    allowDimensionRollup: true,
    provenanceLabel: "Metricool · snapshot acumulado de la cohorte publicada",
  }),
  kpi("social.saves", "Guardados acumulados de publicaciones creadas en el rango", "surface", "social", "metricool", "saves", {
    allowDimensionRollup: true,
    provenanceLabel: "Metricool · snapshot acumulado de la cohorte publicada",
  }),
];

const partnershipDefinitions: MetricKpiDefinition[] = [
  kpi(
    "partnerships.clicks",
    "Clicks de Partnerships del rango",
    "surface",
    "partnerships",
    "yalc",
    "clicksDaily",
  ),
  kpi(
    "partnerships.signups",
    "Registros de Partnerships del rango",
    "surface",
    "partnerships",
    "yalc",
    "signupsDaily",
  ),
  kpi(
    "partnerships.kyc",
    "KYC de Partnerships del rango",
    "surface",
    "partnerships",
    "yalc",
    "kycDaily",
  ),
  kpi(
    "partnerships.invested",
    "Inversión comprometida en Partnerships",
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
    "Valor a CAC objetivo",
    "surface",
    "partnerships",
    "yalc",
    "valueDaily",
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
    "Embudo unificado",
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
  const normalized = source.trim().replace(/[\s-]+/g, "_").toLowerCase();
  return SOURCE_ALIASES[normalized] ?? normalized;
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

function snapshotCollectedAtMs(row: MetricKpiSnapshotInput): number {
  if (!row.collectedAt) return Number.NEGATIVE_INFINITY;
  const collectedAt =
    row.collectedAt instanceof Date
      ? row.collectedAt.getTime()
      : Date.parse(row.collectedAt);
  return Number.isFinite(collectedAt)
    ? collectedAt
    : Number.NEGATIVE_INFINITY;
}

function canonicalSnapshotScore(row: MetricKpiSnapshotInput): number {
  const rawSource = row.source.trim().toLowerCase();
  const rawMetric = row.metricName.trim();
  return (
    (rawSource === normalizeSourceId(row.source) ? 2 : 0) +
    (rawMetric === normalizeMetricName(row.metricName) ? 1 : 0)
  );
}

function preferSnapshot(
  candidate: MetricKpiSnapshotInput,
  current: MetricKpiSnapshotInput,
): boolean {
  const candidateCollectedAt = snapshotCollectedAtMs(candidate);
  const currentCollectedAt = snapshotCollectedAtMs(current);
  if (candidateCollectedAt !== currentCollectedAt)
    return candidateCollectedAt > currentCollectedAt;

  const candidateCanonicalScore = canonicalSnapshotScore(candidate);
  const currentCanonicalScore = canonicalSnapshotScore(current);
  if (candidateCanonicalScore !== currentCanonicalScore)
    return candidateCanonicalScore > currentCanonicalScore;

  // IDs provide a stable final choice when timestamps and canonical forms tie.
  // Missing IDs deliberately retain input order instead of inventing recency.
  if (candidate.id && current.id && candidate.id !== current.id)
    return candidate.id > current.id;
  return false;
}

/**
 * Collapse connector aliases that describe the same persisted observation.
 * This runs before KPI and companion-weight matching so an alias transition
 * cannot inflate either the value or its denominator.
 */
export function dedupeCanonicalMetricSnapshots(
  rows: MetricKpiSnapshotInput[],
): MetricKpiSnapshotInput[] {
  const groups = new Map<
    string,
    {
      rows: MetricKpiSnapshotInput[];
      rawIdentities: Set<string>;
    }
  >();

  for (const row of rows) {
    const key = [
      normalizeSourceId(row.source),
      normalizeMetricName(row.metricName),
      row.metricDate,
      row.dimsKey ?? "",
    ].join("\u0000");
    const group = groups.get(key) ?? {
      rows: [],
      rawIdentities: new Set<string>(),
    };
    group.rows.push(row);
    group.rawIdentities.add(
      [row.source.trim().toLowerCase(), row.metricName.trim()].join("\u0000"),
    );
    groups.set(key, group);
  }

  const selected: MetricKpiSnapshotInput[] = [];
  for (const group of groups.values()) {
    // Identical provider/metric identities can represent separate provenance
    // rows (for example live + seed evidence). Alias coexistence is the unsafe
    // migration case: only then should the canonical observation collapse.
    if (group.rawIdentities.size === 1) {
      selected.push(...group.rows);
      continue;
    }
    let winner = group.rows[0];
    for (const candidate of group.rows.slice(1)) {
      if (preferSnapshot(candidate, winner)) winner = candidate;
    }
    selected.push(winner);
  }

  return selected;
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

function weightMetricNamesFor(def: MetricKpiDefinition): Set<string> {
  return new Set(
    [def.weightMetric, ...(def.weightMetricAliases ?? [])]
      .filter((metric): metric is string => Boolean(metric))
      .map(normalizeMetricName),
  );
}

function rowSeriesKey(row: MetricKpiSnapshotInput): string {
  return [
    normalizeSourceId(row.source),
    row.metricDate,
    row.dimsKey ?? "",
  ].join("\u0000");
}

/**
 * Return one unambiguous companion weight for every selected value row. A
 * partial or duplicated match is unsafe: in that case callers retain the
 * previous plain-average behavior instead of silently discarding inputs.
 */
function matchingWeightRows(
  def: MetricKpiDefinition,
  valueRows: MetricKpiSnapshotInput[],
  allRows: MetricKpiSnapshotInput[],
): MetricKpiSnapshotInput[] | null {
  if (!def.weightMetric || (def.agg ?? aggFor(def.source, def.metric)) !== "avg")
    return null;

  const sourceSet = sourcesFor(def);
  const metricSet = weightMetricNamesFor(def);
  const bySeries = new Map<string, MetricKpiSnapshotInput>();
  const ambiguousSeries = new Set<string>();

  for (const row of allRows) {
    const numericValue = Number(row.value);
    if (
      row.value == null ||
      !Number.isFinite(numericValue) ||
      numericValue < 0 ||
      !sourceSet.has(normalizeSourceId(row.source)) ||
      !metricSet.has(normalizeMetricName(row.metricName))
    )
      continue;

    const key = rowSeriesKey(row);
    if (bySeries.has(key)) ambiguousSeries.add(key);
    else bySeries.set(key, row);
  }

  const weights: MetricKpiSnapshotInput[] = [];
  for (const row of valueRows) {
    const key = rowSeriesKey(row);
    const weight = bySeries.get(key);
    if (!weight || ambiguousSeries.has(key)) return null;
    weights.push(weight);
  }
  return weights;
}

/**
 * A persisted rate/average whose companion denominator is zero is undefined,
 * even if an older collector stored a numeric zero for it. Remove those pairs
 * before reduction so historical 0/0 snapshots cannot become a verified 0%.
 */
function excludeZeroWeightObservations(
  valueRows: MetricKpiSnapshotInput[],
  weightRows: MetricKpiSnapshotInput[] | null,
): {
  valueRows: MetricKpiSnapshotInput[];
  weightRows: MetricKpiSnapshotInput[] | null;
} {
  if (!weightRows) return { valueRows, weightRows: null };

  const validValueRows: MetricKpiSnapshotInput[] = [];
  const validWeightRows: MetricKpiSnapshotInput[] = [];
  for (let index = 0; index < valueRows.length; index += 1) {
    const valueRow = valueRows[index];
    const weightRow = weightRows[index];
    const weight = Number(weightRow?.value);
    if (!valueRow || !weightRow || !Number.isFinite(weight) || weight <= 0)
      continue;
    validValueRows.push(valueRow);
    validWeightRows.push(weightRow);
  }
  return { valueRows: validValueRows, weightRows: validWeightRows };
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

function metadataQuality(
  row: MetricKpiSnapshotInput,
): MetricKpiQualityStatus | null {
  const raw = row.dimensions?.__quality ?? row.dimensions?.quality;
  const normalized = String(raw ?? "").trim().toLowerCase();
  return ["ok", "partial", "missing", "dirty", "stale", "demo"].includes(
    normalized,
  )
    ? (normalized as MetricKpiQualityStatus)
    : null;
}

function reduceRows(
  def: MetricKpiDefinition,
  rows: MetricKpiSnapshotInput[],
  weightRows: MetricKpiSnapshotInput[] | null = null,
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
  if (strategy !== "avg") return sum;

  if (weightRows?.length === rows.length) {
    const totalWeight = weightRows.reduce(
      (acc, row) => acc + Number(row.value ?? 0),
      0,
    );
    if (totalWeight > 0) {
      return rows.reduce(
        (acc, row, index) =>
          acc + Number(row.value ?? 0) * Number(weightRows[index]?.value ?? 0),
        0,
      ) / totalWeight;
    }
  }

  return sum / Math.max(values.length, 1);
}

interface DimensionSnapshotSelection {
  rows: MetricKpiSnapshotInput[];
  qualityEvidenceRows: MetricKpiSnapshotInput[];
  evidenceQuality: MetricKpiQualityStatus | null;
  completeSnapshotDays: number | null;
}

const SOURCE_SNAPSHOT_SET_METRICS = new Set(["metricool:followers"]);

function isSourceSnapshotSetDefinition(def: MetricKpiDefinition): boolean {
  return SOURCE_SNAPSHOT_SET_METRICS.has(
    `${normalizeSourceId(def.source)}:${normalizeMetricName(def.metric)}`,
  );
}

function stableSnapshotDimensionKey(row: MetricKpiSnapshotInput): string {
  const dimensions = Object.entries(row.dimensions ?? {})
    .filter(([key, value]) =>
      !ROLLUP_METADATA_DIMENSION_KEYS.has(key)
      && value != null
      && String(value) !== "")
    .map(([key, value]) => [key, String(value)] as const)
    .sort(([left], [right]) => left.localeCompare(right));
  return dimensions.length ? JSON.stringify(dimensions) : row.dimsKey ?? "";
}

function latestRowsPerStableDimension(
  rows: MetricKpiSnapshotInput[],
): MetricKpiSnapshotInput[] {
  const selected = new Map<string, MetricKpiSnapshotInput>();
  for (const row of rows) {
    const key = stableSnapshotDimensionKey(row);
    const current = selected.get(key);
    if (
      !current
      || row.metricDate > current.metricDate
      || (row.metricDate === current.metricDate && preferSnapshot(row, current))
    ) {
      selected.set(key, row);
    }
  }
  return [...selected.values()];
}

function sourceSnapshotEvidenceQuality(
  rows: MetricKpiSnapshotInput[],
): MetricKpiQualityStatus {
  if (!rows.length) return "missing";
  if (rows.some((row) => metadataQuality(row) === "dirty")) return "dirty";
  if (rows.some((row) => metadataQuality(row) === "stale")) return "stale";
  const scopeStatuses = rows.map((row) =>
    metricScopeEvidenceStatus(row.dimensions));
  if (scopeStatuses.includes("partial")) return "partial";
  const valueRows = rows.filter((row) =>
    metricScopeEvidenceStatus(row.dimensions) == null);
  if (
    valueRows.some((row) =>
      row.value == null
      || !Number.isFinite(Number(row.value))
      || ["partial", "missing"].includes(metadataQuality(row) ?? ""))
  ) {
    return "partial";
  }
  // One null-valued row with `__scopeEvidence=complete` is the durable proof
  // that the provider returned a complete, intentionally empty set. It must
  // authorize removing the previous membership without being mistaken for a
  // missing numeric observation.
  if (!valueRows.length) {
    return scopeStatuses.includes("complete") ? "ok" : "partial";
  }
  const demoRows = valueRows.filter(isDemoRow).length;
  if (demoRows === valueRows.length) return "demo";
  if (demoRows > 0) return "partial";
  return "ok";
}

function mergeSnapshotEvidenceQuality(
  quality: MetricKpiQualityStatus,
  evidenceQuality: MetricKpiQualityStatus | null,
): MetricKpiQualityStatus {
  if (!evidenceQuality || evidenceQuality === "ok") return quality;
  if (quality === "dirty" || evidenceQuality === "dirty") return "dirty";
  if (quality === "stale" || evidenceQuality === "stale") return "stale";
  if (quality === "missing") return "missing";
  if (quality === "partial" || evidenceQuality === "partial") return "partial";
  if (quality === "demo" && evidenceQuality === "demo") return "demo";
  if (quality === "demo" || evidenceQuality === "demo") return "partial";
  return quality;
}

function latestDimensionSnapshotSelection(
  def: MetricKpiDefinition,
  rows: MetricKpiSnapshotInput[],
  allRows: MetricKpiSnapshotInput[],
): DimensionSnapshotSelection {
  const strategy = def.agg ?? aggFor(def.source, def.metric);
  if (strategy !== "latest")
    return {
      rows,
      qualityEvidenceRows: [],
      evidenceQuality: null,
      completeSnapshotDays: null,
    };

  const sourceSet = sourcesFor(def);
  const metricSet = metricNamesFor(def);
  const sourceRows = allRows.filter((row) =>
    sourceSet.has(normalizeSourceId(row.source))
    && metricSet.has(normalizeMetricName(row.metricName)));
  const latestSourceDate = sourceRows
    .map((row) => row.metricDate)
    .sort()
    .at(-1);

  if (def.authoritativeLatestScope && latestSourceDate) {
    const latestSourceRows = sourceRows.filter((row) =>
      row.metricDate === latestSourceDate);
    const evidenceQuality = sourceSnapshotEvidenceQuality(latestSourceRows);
    if (evidenceQuality === "ok") {
      // A complete scope with no numeric row is an intentional absence (for
      // example an undefined rate with a zero denominator), not permission to
      // resurrect yesterday's value.
      return {
        rows: rows.filter((row) => row.metricDate === latestSourceDate),
        qualityEvidenceRows: [],
        evidenceQuality: null,
        completeSnapshotDays: null,
      };
    }
    if (evidenceQuality === "partial") {
      const selectedSet = new Set(rows);
      return {
        rows,
        qualityEvidenceRows: latestSourceRows.filter((row) => !selectedSet.has(row)),
        evidenceQuality,
        completeSnapshotDays: null,
      };
    }
  }

  if (!def.allowDimensionRollup || !rows.length)
    return {
      rows,
      qualityEvidenceRows: [],
      evidenceQuality: null,
      completeSnapshotDays: null,
    };

  // Dimensioned stock metrics describe one provider snapshot as a set. Mixing
  // the latest row of every dimension would retain networks/entities omitted
  // by the newest collection and overstate the current total.
  const latestMetricDate = rows.map((row) => row.metricDate).sort().at(-1);
  if (!isSourceSnapshotSetDefinition(def)) {
    return {
      rows: latestMetricDate
        ? rows.filter((row) => row.metricDate === latestMetricDate)
        : rows,
      qualityEvidenceRows: [],
      evidenceQuality: null,
      completeSnapshotDays: null,
    };
  }

  // Snapshot membership is authoritative only inside the exact metric family.
  // A clean flow row from the same provider/day (for example Metricool posts)
  // must never invalidate retained followers from a failed optional snapshot.
  if (!latestSourceDate) {
    return {
      rows: latestMetricDate
        ? rows.filter((row) => row.metricDate === latestMetricDate)
        : rows,
      qualityEvidenceRows: [],
      evidenceQuality: null,
      completeSnapshotDays: null,
    };
  }

  const latestSourceRows = sourceRows.filter((row) =>
    row.metricDate === latestSourceDate);
  const evidenceQuality = sourceSnapshotEvidenceQuality(latestSourceRows);
  if (evidenceQuality === "ok") {
    return {
      rows: rows.filter((row) => row.metricDate === latestSourceDate),
      qualityEvidenceRows: [],
      evidenceQuality: null,
      completeSnapshotDays: null,
    };
  }

  // A partial collection cannot prove that an absent network was removed.
  // Retain the newest valid value per stable network identity, while keeping
  // the latest source rows only as quality evidence (never as follower value).
  const selected = latestRowsPerStableDimension(rows);
  const selectedSet = new Set(selected);
  const sourceRowsByDate = new Map<string, MetricKpiSnapshotInput[]>();
  for (const row of sourceRows) {
    const dateRows = sourceRowsByDate.get(row.metricDate) ?? [];
    dateRows.push(row);
    sourceRowsByDate.set(row.metricDate, dateRows);
  }
  const completeMetricDates = new Set(
    rows
      .map((row) => row.metricDate)
      .filter((date) =>
        sourceSnapshotEvidenceQuality(sourceRowsByDate.get(date) ?? []) === "ok"),
  );
  return {
    rows: selected,
    qualityEvidenceRows: latestSourceRows.filter((row) => !selectedSet.has(row)),
    evidenceQuality,
    completeSnapshotDays: completeMetricDates.size,
  };
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
  if (rows.some((row) => metadataQuality(row) === "dirty")) return "dirty";
  const latest = rows
    .map((row) => row.metricDate)
    .sort()
    .at(-1);
  if (
    latest &&
    ageDays(latest, rangeTo) > (def.staleAfterDays ?? DEFAULT_STALE_AFTER_DAYS)
  )
    return "stale";
  if (rows.some((row) => metadataQuality(row) === "stale")) return "stale";
  if (rows.some((row) => metadataQuality(row) === "partial")) return "partial";
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
  options: MetricKpiEvaluationOptions = {},
): ComputedMetricKpiValue[] {
  const dedupedRows = dedupeCanonicalMetricSnapshots(rows);
  const flowRows = dedupedRows.filter(
    (row) => row.metricDate >= range.from && row.metricDate <= range.to,
  );
  const observationAsOf = normalizedObservationAsOf(options.observationAsOf, range.to);
  const observationRows = dedupedRows.filter(
    (row) => row.metricDate <= observationAsOf,
  );
  const dayCount = daysInclusive(range.from, range.to);

  return definitions.map((def) => {
    const strategy = def.agg ?? aggFor(def.source, def.metric);
    const candidateRows = strategy === "latest" ? observationRows : flowRows;
    const sourceSet = sourcesFor(def);
    const metricSet = metricNamesFor(def);
    const matching = candidateRows.filter((row) => {
      if (row.value == null || !Number.isFinite(Number(row.value)))
        return false;
      return (
        sourceSet.has(normalizeSourceId(row.source)) &&
        metricSet.has(normalizeMetricName(row.metricName))
      );
    });
    const snapshotSelection = latestDimensionSnapshotSelection(
      def,
      matching,
      candidateRows,
    );
    const aggregationCandidates = snapshotSelection.rows;
    const rollupRows = aggregationCandidates.filter(isRollup);
    const selected = rollupRows.length
      ? rollupRows
      : def.allowDimensionRollup
        ? aggregationCandidates
        : [];
    const matchedWeightRows = selected.length
      ? matchingWeightRows(def, selected, candidateRows)
      : null;
    const weightedRows = excludeZeroWeightObservations(
      selected,
      matchedWeightRows,
    );
    const effectiveSelected = weightedRows.valueRows;
    const weightRows = weightedRows.weightRows;
    const reducedValue = effectiveSelected.length
      ? reduceRows(def, effectiveSelected, weightRows)
      : null;
    const value =
      reducedValue == null
        ? null
        : reducedValue * (def.valueMultiplier ?? 1);
    const computationRows = weightRows
      ? [...effectiveSelected, ...weightRows]
      : effectiveSelected;
    const dates = new Set(effectiveSelected.map((row) => row.metricDate));
    const baseQualityStatus = qualityFor(
      def,
      computationRows,
      strategy === "latest" ? observationAsOf : range.to,
      dayCount,
    );
    const reducedQualityStatus =
      def.weightMetric &&
      effectiveSelected.length > 1 &&
      !weightRows &&
      baseQualityStatus === "ok"
        ? "partial"
        : baseQualityStatus;
    const qualityStatus = effectiveSelected.length
      ? mergeSnapshotEvidenceQuality(
        reducedQualityStatus,
        snapshotSelection.evidenceQuality,
      )
      : reducedQualityStatus;
    // Point-in-time KPIs normally use one latest valid observation. A retained
    // snapshot-set fallback is the exception: report only complete observed
    // snapshot days so partial current evidence cannot look like coverage=1.
    const sourceCoverage = effectiveSelected.length
      ? snapshotSelection.completeSnapshotDays != null
        ? Math.min(1, snapshotSelection.completeSnapshotDays / dayCount)
        : strategy === "latest"
        ? 1
        : Math.min(1, dates.size / dayCount)
      : 0;
    const provenanceRows = snapshotSelection.qualityEvidenceRows.length
      ? [...computationRows, ...snapshotSelection.qualityEvidenceRows]
      : computationRows;

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
      inputRefs: inputRefs(provenanceRows),
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
