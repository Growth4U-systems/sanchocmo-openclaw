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
}

export interface SurfaceSummaryResult {
  configured: boolean;
  surfaces: SurfaceSummaryEntry[];
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
}

export interface MetricStageRollupChannelValue {
  channel: string;
  label: string;
  value: number;
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
    inputRefsCount: number;
    lastComputedAt: string | null;
    source: "metric_stage_rollups";
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

export function useMetricsPlan(slug: string | null) {
  return useQuery({
    queryKey: ["metrics-plan", slug],
    queryFn: async () => {
      const res = await fetch(`/api/metrics/plan?slug=${slug}`);
      if (!res.ok) throw new Error("Failed to fetch metrics plan");
      return res.json();
    },
    enabled: !!slug,
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

/** Per-surface connection state + latest values from the metric_snapshots store. */
export function useSurfaceSummary(slug: string | null) {
  return useQuery<SurfaceSummaryResult>({
    queryKey: ["metrics-surfaces", slug],
    queryFn: async () => {
      const res = await fetch(`/api/metrics/timeseries?view=surfaces&slug=${slug}`);
      if (!res.ok) throw new Error("Failed to fetch surface summary");
      return res.json();
    },
    enabled: !!slug,
    staleTime: 60_000,
  });
}

/** Persisted semantic KPI read model. This endpoint is read-only; cron/manual runner computes the rows. */
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
  overall: "ok" | "stale" | "no-data";
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
