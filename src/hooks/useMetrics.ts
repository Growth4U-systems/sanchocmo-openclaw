import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { DashboardDefinition } from "@/lib/metrics/dashboard-schema";
import type { SurfaceKey } from "@/lib/metrics/surfaces";

// Client-facing shapes returned by the read endpoints. Declared locally (type-only)
// so the client bundle never pulls in the server-only data modules (fs/drizzle).
export interface DashboardVersionMeta {
  version: number;
  date: string;
  trigger: string;
  changes?: string;
}

export interface DashboardRecord {
  configured: boolean;
  slug: string;
  version: number;
  definition: DashboardDefinition | null;
  versions: DashboardVersionMeta[];
}

export interface SurfaceSummaryEntry {
  surface: SurfaceKey;
  name: string;
  emoji: string;
  connected: boolean;
  sources: string[];
  metrics: Array<{ source: string; metric: string; value: number | null; date: string }>;
  dataStatus?: "connected_no_data";
}

export interface SurfaceSummaryResult {
  configured: boolean;
  complete?: boolean;
  surfaces: SurfaceSummaryEntry[];
}

export type SurfaceDetailAggregation = "sum" | "avg" | "latest";
export type SurfaceDetailQuality = "ok" | "partial" | "demo" | "dirty" | "stale";

export interface SurfaceDetailMetric {
  metric: string;
  value: number;
  aggregation: SurfaceDetailAggregation;
  quality: SurfaceDetailQuality;
  dimensions: Record<string, string> | null;
}

export interface SurfaceDetailSource {
  source: string;
  metrics: SurfaceDetailMetric[];
  coverage?: SurfaceDetailCoverage;
}

export interface SurfaceDetailCoverage {
  cadence: "daily" | "weekly" | "twice_weekly" | "custom";
  enabled: boolean;
  asOf?: string;
  availableThrough?: string;
  expectedDates: string[];
  pendingDates?: string[];
  observedDates: string[];
  missingDates: string[];
  failedDates: string[];
  ratio: number | null;
  lastObservedDate: string | null;
  latestExpectedDate: string | null;
}

export interface SurfaceDetailCompleteness {
  rowsRead: number;
  groups: number;
  rowLimit: number;
  groupLimit: number;
  reason: "row_limit" | "group_limit" | "storage_unconfigured" | null;
}

/** Range-scoped provider breakdowns for the dedicated surface views. */
export interface SurfaceDetailResult {
  configured: boolean;
  surface: SurfaceKey;
  from: string;
  to: string;
  sources: SurfaceDetailSource[];
  complete?: boolean;
  completeness?: SurfaceDetailCompleteness;
}

export type MetricKpiQualityStatus =
  | "ok"
  | "partial"
  | "missing"
  | "dirty"
  | "stale"
  | "demo";
export type MetricKpiRange = "1d" | "7d" | "30d" | "90d";

export interface MetricKpiValue {
  id: string;
  kpiId: string;
  label: string;
  dashboardBlock: string;
  surface: SurfaceKey | null;
  source: string | null;
  metricName: string | null;
  value: number | null;
  valueText: string | null;
  displayValue: string;
  unit: string | null;
  qualityStatus: MetricKpiQualityStatus;
  provenanceLabel: string;
  inputRefs: Array<Record<string, unknown>>;
  sourceCoverage: number;
  rangeFrom: string;
  rangeTo: string;
  definitionVersion: number | null;
  computedAt: string;
  comparison: MetricKpiComparison | null;
}

export interface MetricKpiComparison {
  previousRange: {
    from: string;
    to: string;
  };
  previousValue: number | null;
  previousDisplayValue: string;
  absoluteDelta: number | null;
  relativeDelta: number | null;
  displayDelta: string | null;
  direction: "up" | "down" | "flat" | null;
  sentiment: "positive" | "negative" | "neutral" | null;
}

export interface MetricStageRollupStageValue {
  stageId: string;
  label: string;
  order: number;
  value: number | null;
  displayValue: string;
  qualityStatus: MetricKpiQualityStatus;
  aggregationStatus?: "missing" | "single_series" | "non_additive";
  seriesCount?: number;
  channels: string[];
  sources: string[];
  inputRefsCount: number;
}

export interface MetricStageRollupRateValue {
  fromStageId: string;
  fromLabel: string;
  toStageId: string;
  toLabel: string;
  value: number | null;
  displayValue: string;
  numerator: number | null;
  denominator: number | null;
  qualityStatus: MetricKpiQualityStatus;
  calculationStatus?: "missing_inputs" | "identity_not_available";
}

export interface MetricStageRollupChannelValue {
  seriesKey?: string;
  channel: string;
  source?: string;
  label: string;
  value: number | null;
  displayValue: string;
  qualityStatus: MetricKpiQualityStatus;
  stages: MetricStageRollupStageValue[];
  rates: MetricStageRollupRateValue[];
}

export interface MetricStageRollupResult {
  configured: boolean;
  available: boolean;
  range: { from: string; to: string } | null;
  summary: {
    qualityStatus: MetricKpiQualityStatus;
    totalRows: number;
    stageCount: number;
    channelCount: number;
    providerSeriesCount?: number;
    inputRefsCount: number;
    lastComputedAt: string | null;
    source: "metric_stage_rollups";
    aggregationMode?: "provider_observations";
    conversionRatesAvailable?: false;
    emptyState: "missing_stage_rollups" | "ready";
    nextAction: string;
  };
  stages: MetricStageRollupStageValue[];
  rates: MetricStageRollupRateValue[];
  channels: MetricStageRollupChannelValue[];
}

export interface MetricKpiResult {
  configured: boolean;
  slug: string;
  requestedRange: {
    key: MetricKpiRange | "custom";
    from: string;
    to: string;
  } | null;
  run: {
    id: string;
    status: string;
    trigger: string;
    definitionVersion: number | null;
    valuesCount: number;
    qualitySummary: Record<string, number>;
    rangeFrom: string;
    rangeTo: string;
    startedAt: string;
    finishedAt: string | null;
  } | null;
  summary: Record<MetricKpiQualityStatus | "total", number> & {
    qualityStatus: MetricKpiQualityStatus;
  };
  values: MetricKpiValue[];
  northStar: MetricKpiValue | null;
  stageRollups: MetricStageRollupResult;
}

export type PartnershipReportPeriodDays = 1 | 7 | 30 | 90;

export interface PartnershipReportPostRow {
  id: string;
  date: string;
  format: string;
  title: string;
  status: "live" | "scheduled";
  clicks: number;
  conversions: number;
}

export interface PartnershipReportCreatorRow {
  handle: string;
  network: string | null;
  leadId: string;
  lifecycleStatus: string | null;
  feeEur: number | null;
  variableCpaEur: number | null;
  postsLive: number;
  clicks: number;
  signups: number;
  kyc: number;
  conversions: number;
  totalCostEur: number | null;
  cpaRealEur: number | null;
  breakEvenCpaEur: number;
  conversionsNeeded: number | null;
  belowBreakEven: boolean | null;
  roi: number | null;
  qualityScore: number | null;
  qualityDelta: number | null;
  qualityNext: number | null;
  posts: PartnershipReportPostRow[];
  sparkline: number[];
}

export interface PartnershipReportTotals {
  investedEur: number | null;
  postsLive: number;
  clicks: number;
  signups: number;
  kyc: number;
  conversions: number;
  totalCostEur: number | null;
  cpaRealEur: number | null;
  belowBreakEven: boolean | null;
  roi: number | null;
}

export interface PartnershipReport {
  periodDays: PartnershipReportPeriodDays;
  from: string;
  to: string;
  targetCacEur: number;
  totals: PartnershipReportTotals;
  creators: PartnershipReportCreatorRow[];
  feedback: {
    note: string | null;
    deltas: Array<{
      handle: string;
      current: number | null;
      delta: number;
      next: number | null;
    }>;
  };
  tracking: {
    status: "real" | "demo" | "unavailable";
    sources: Array<"seed" | "impact">;
    recordCount: number;
  };
}

export function useMetricsPlan(slug: string | null) {
  return useQuery({
    queryKey: ["metrics-plan", slug],
    queryFn: async () => {
      const res = await fetch(`/api/metrics/plan?slug=${slug}`);
      if (!res.ok) throw new Error("Failed to fetch metrics plan");
      return res.json();
    },
    enabled: !!slug,
    retry: false,
    staleTime: 60_000,
  });
}

/** Active versioned dashboard definition — the render tree for the metrics tabs. */
export function useDashboardDefinition(slug: string | null) {
  return useQuery<DashboardRecord>({
    queryKey: ["metrics-dashboard", slug],
    queryFn: async () => {
      const res = await fetch(`/api/metrics/dashboard?slug=${slug}`);
      if (!res.ok) throw new Error("Failed to fetch dashboard definition");
      return res.json();
    },
    enabled: !!slug,
    staleTime: 60_000,
  });
}

/** Per-surface data availability + latest values for the selected dashboard range. */
export function useSurfaceSummary(slug: string | null, range?: MetricKpiRange) {
  return useQuery<SurfaceSummaryResult>({
    queryKey: ["metrics-surfaces", slug, range ?? "default"],
    queryFn: async () => {
      const params = new URLSearchParams({ view: "surfaces" });
      if (slug) params.set("slug", slug);
      if (range) params.set("range", range);
      const res = await fetch(`/api/metrics/timeseries?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to fetch surface summary");
      return res.json();
    },
    enabled: !!slug,
    staleTime: 60_000,
  });
}

/** Provider-native breakdowns. Disabled until a supported surface is open. */
export function useSurfaceDetail(
  slug: string | null,
  surface: SurfaceKey | null,
  range: MetricKpiRange,
) {
  return useQuery<SurfaceDetailResult>({
    queryKey: ["metrics-surface-detail", slug, surface, range],
    queryFn: async () => {
      if (!slug || !surface) throw new Error("Surface detail requires slug and surface");
      const params = new URLSearchParams({
        view: "surface-detail",
        slug,
        surface,
        range,
      });
      const res = await fetch(`/api/metrics/timeseries?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to fetch surface detail");
      return res.json();
    },
    enabled: !!slug && !!surface,
    staleTime: 60_000,
  });
}

/**
 * Provider-native breakdowns for an explicit calendar window (SAN-326).
 * Unlike `useSurfaceDetail`, the caller controls from/to — the sales-engine
 * matrix uses it to include today ("hasta ahora") while every preset-range
 * read keeps its complete-days behavior.
 */
export function useSurfaceDetailWindow(
  slug: string | null,
  surface: SurfaceKey | null,
  window: { from: string; to: string } | null,
) {
  return useQuery<SurfaceDetailResult>({
    queryKey: ["metrics-surface-detail-window", slug, surface, window?.from, window?.to],
    queryFn: async () => {
      if (!slug || !surface || !window) {
        throw new Error("Surface detail window requires slug, surface and window");
      }
      const params = new URLSearchParams({
        view: "surface-detail",
        slug,
        surface,
        from: window.from,
        to: window.to,
      });
      const res = await fetch(`/api/metrics/timeseries?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to fetch surface detail");
      return res.json();
    },
    enabled: !!slug && !!surface && !!window,
    staleTime: 60_000,
  });
}

// ── Sales-engine drill-down (SAN-326) ────────────────────────────────────────

export type SalesEngineLeadsStage = "leads" | "meetings" | "opportunities" | "won";

export interface SalesEngineLeadRow {
  name: string;
  email: string;
  companyName: string;
  source: string;
  date: string;
  status?: string;
  pipelineStage?: string;
  monetaryValue?: number;
}

export interface SalesEngineLeadsResponse {
  configured: boolean;
  slug: string;
  stage: SalesEngineLeadsStage;
  bucket: string | null;
  from: string | null;
  to: string | null;
  rows: SalesEngineLeadRow[];
  total: number;
  truncated: boolean;
  source: "ghl-live";
}

export interface SalesEngineLeadsParams {
  stage: SalesEngineLeadsStage;
  /** null → Total column (no channel filter). */
  bucket: string | null;
  from: string;
  to: string;
}

/** Live GHL list behind one "Motor de ventas" matrix cell. Enabled only while
 * a drill-down is open; the API queries GoHighLevel directly. */
export function useSalesEngineLeads(
  slug: string | null,
  params: SalesEngineLeadsParams | null,
) {
  return useQuery<SalesEngineLeadsResponse>({
    queryKey: [
      "sales-engine-leads",
      slug,
      params?.stage,
      params?.bucket ?? "total",
      params?.from,
      params?.to,
    ],
    queryFn: async () => {
      if (!slug || !params) throw new Error("Sales engine leads require slug and params");
      const search = new URLSearchParams({ slug, stage: params.stage });
      if (params.bucket) search.set("bucket", params.bucket);
      if (params.stage !== "won") {
        search.set("from", params.from);
        search.set("to", params.to);
      }
      const res = await fetch(`/api/metrics/sales-engine-leads?${search.toString()}`);
      const payload = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(
          (payload as { error?: string } | null)?.error
          || "No se pudo consultar GoHighLevel",
        );
      }
      return payload as SalesEngineLeadsResponse;
    },
    enabled: !!slug && !!params,
    retry: false,
    staleTime: 60_000,
  });
}

export interface SalesEngineCountsBuckets {
  web: number;
  paid: number;
  linkedin: number;
  email: number;
  trust: number;
  otros: number;
}

export interface SalesEngineCountsStage {
  stage: SalesEngineLeadsStage;
  buckets: SalesEngineCountsBuckets;
  total: number;
  /** True when a GHL safety cap made the counts lower bounds (render "≥N"). */
  truncated: boolean;
}

export interface SalesEngineCountsResponse {
  configured: boolean;
  slug: string;
  from: string;
  to: string;
  /** Absent when `configured` is false. */
  stages?: SalesEngineCountsStage[];
  wonValue?: { buckets: SalesEngineCountsBuckets; total: number; truncated: boolean };
  truncated?: boolean;
  source?: "ghl-live";
  error?: string;
}

/**
 * Live "Motor de ventas" matrix counts (SAN-326): the whole stage×bucket grid
 * in one call, computed by the API from the SAME GHL queries that feed the
 * drill-down lists — cells and lists agree by construction. The server caches
 * ~60 s per slug+window, so tab switches don't hammer GHL.
 */
export function useSalesEngineCounts(
  slug: string | null,
  window: { from: string; to: string } | null,
) {
  return useQuery<SalesEngineCountsResponse>({
    queryKey: ["sales-engine-counts", slug, window?.from, window?.to],
    queryFn: async () => {
      if (!slug || !window) throw new Error("Sales engine counts require slug and window");
      const search = new URLSearchParams({
        slug,
        view: "counts",
        from: window.from,
        to: window.to,
      });
      const res = await fetch(`/api/metrics/sales-engine-leads?${search.toString()}`);
      const payload = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(
          (payload as { error?: string } | null)?.error
          || "No se pudo consultar GoHighLevel",
        );
      }
      return payload as SalesEngineCountsResponse;
    },
    enabled: !!slug && !!window,
    retry: false,
    staleTime: 60_000,
  });
}

/** Persisted semantic KPI read model. The API may run a read-through recompute when snapshots changed. */
export function useMetricKpis(slug: string | null, range: MetricKpiRange) {
  return useQuery<MetricKpiResult>({
    queryKey: ["metrics-kpis", slug, range],
    queryFn: async () => {
      const params = new URLSearchParams({ range });
      if (slug) params.set("slug", slug);
      const res = await fetch(`/api/metrics/kpis?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to fetch semantic KPIs");
      return res.json();
    },
    enabled: !!slug,
    staleTime: 60_000,
  });
}

/** Creator reporting for the Metrics · Partnerships surface (SAN-81). */
export function usePartnershipReport(slug: string | null, period: PartnershipReportPeriodDays) {
  return useQuery<PartnershipReport>({
    queryKey: ["partnerships-report", slug, period],
    queryFn: async () => {
      const params = new URLSearchParams({ period: String(period) });
      if (slug) params.set("slug", slug);
      const res = await fetch(`/api/partnerships/report?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to fetch partnerships report");
      return res.json();
    },
    enabled: !!slug,
    staleTime: 60_000,
  });
}

// ── Collection cadence + health (SAN-300) ───────────────────────────────────

export type Cadence = "daily" | "weekly" | "twice_weekly" | "custom";

export interface CollectionScheduleItem {
  source: string;
  cadence: Cadence;
  daysOfWeek: number[];
  cronExpr: string | null;
  enabled: boolean;
}

/** Editable per-source collection cadence (defaults merged with overrides). */
export function useCollectionSchedule(slug: string | null) {
  return useQuery<{ slug: string; schedules: CollectionScheduleItem[] }>({
    queryKey: ["metrics-schedule", slug],
    queryFn: async () => {
      const res = await fetch(`/api/metrics/schedule?slug=${slug}`);
      if (!res.ok) throw new Error("Failed to fetch collection schedule");
      return res.json();
    },
    enabled: !!slug,
    staleTime: 60_000,
  });
}

/** Upsert one source's cadence; refreshes the schedule + health queries. */
export function useUpdateCollectionSchedule(slug: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (patch: { source: string } & Partial<Omit<CollectionScheduleItem, "source">>) => {
      const res = await fetch(`/api/metrics/schedule?slug=${slug}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error("Failed to update collection schedule");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["metrics-schedule", slug] });
      queryClient.invalidateQueries({ queryKey: ["metrics-health", slug] });
    },
  });
}

export interface SourceHealthItem {
  source: string;
  cadence: Cadence;
  enabled: boolean;
  lastMetricDate: string | null;
  lastCollectedAt: string | null;
  ageDays: number | null;
  dueToday: boolean;
  overdue: boolean;
  lastStatus: string | null;
  lastError: string | null;
  lastDeletedCount: number | null;
  /** Known instrumentation problem for this source (PR2 · SAN-319) — see KNOWN_DIRTY. */
  knownDirty: boolean;
  dirtyReason?: string;
}

export interface MetricsHealthResult {
  configured: boolean;
  slug: string;
  generatedAt: string;
  sources: SourceHealthItem[];
  cron: { degraded: boolean; reasons: string[] };
  overall: "ok" | "stale" | "error" | "no-data";
}

/** Per-source collection health + global cron signal. */
export function useMetricsHealth(slug: string | null) {
  return useQuery<MetricsHealthResult>({
    queryKey: ["metrics-health", slug],
    queryFn: async () => {
      const res = await fetch(`/api/metrics/health?slug=${slug}`);
      if (!res.ok) throw new Error("Failed to fetch metrics health");
      return res.json();
    },
    enabled: !!slug,
    staleTime: 60_000,
  });
}
