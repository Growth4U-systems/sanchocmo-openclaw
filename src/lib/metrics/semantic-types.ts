import type { SurfaceKey } from "@/lib/metrics/surfaces";

export const METRIC_FAMILIES = [
  "overview",
  "web",
  "paid",
  "reputation",
  "pipeline",
  "product",
  "social",
  "outbound_icp",
  "partnerships",
  "channels",
  "conversion",
  "trends",
] as const;

export type MetricFamily = (typeof METRIC_FAMILIES)[number];

export const DASHBOARD_AREAS = ["overview", "surfaces", "channels", "conversion", "trends"] as const;
export type DashboardArea = (typeof DASHBOARD_AREAS)[number];

export type SemanticMetricSurface = SurfaceKey | "outbound";

export const METRIC_FORMATS = [
  "number",
  "integer",
  "currency",
  "percent",
  "ratio",
  "duration",
  "score",
  "text",
] as const;
export type MetricFormat = (typeof METRIC_FORMATS)[number];

export const METRIC_AGGREGATIONS = ["sum", "avg", "latest", "min", "max", "count_distinct", "computed"] as const;
export type MetricAggregation = (typeof METRIC_AGGREGATIONS)[number];

export const METRIC_CALCULATION_KINDS = [
  "direct",
  "derived",
  "ratio",
  "rollup",
  "stage_rollup",
  "attribution",
  "event",
  "manual",
  "forecast",
] as const;
export type MetricCalculationKind = (typeof METRIC_CALCULATION_KINDS)[number];

export const METRIC_DEFINITION_STATUSES = ["available", "partial", "requires_mapping", "planned"] as const;
export type MetricDefinitionStatus = (typeof METRIC_DEFINITION_STATUSES)[number];

export const METRIC_QUALITY_STATUSES = ["ok", "partial", "missing", "dirty", "stale", "demo"] as const;
export type MetricQualityStatus = (typeof METRIC_QUALITY_STATUSES)[number];

export interface MetricSourceRef {
  source: string;
  metric?: string;
  dimensions?: Record<string, string>;
  role?: "primary" | "input" | "cost" | "revenue" | "stage" | "quality";
}

export interface MetricDefinition {
  id: string;
  label: string;
  family: MetricFamily;
  area: DashboardArea;
  surface?: SemanticMetricSurface;
  description: string;
  format: MetricFormat;
  aggregation: MetricAggregation;
  calculationKind: MetricCalculationKind;
  status: MetricDefinitionStatus;
  sources: MetricSourceRef[];
  requiredDimensions?: string[];
  optionalDimensions?: string[];
  dependsOn?: string[];
  stageKey?: string;
  tags?: string[];
}

export interface MetricDefinitionGroup {
  id: string;
  title: string;
  area: DashboardArea;
  definitions: MetricDefinition[];
}

export interface MetricInputRef {
  [key: string]: unknown;
  table: "metric_snapshots" | "metric_kpi_values" | "metric_stage_rollups" | "metric_stage_events" | string;
  id?: string;
  source?: string;
  metric?: string;
  date?: string;
  dimensions?: Record<string, string>;
}

export interface MetricKpiValuePayload {
  definitionId: string;
  value?: number | null;
  valueText?: string | null;
  metricDate: string;
  rangeStart: string;
  rangeEnd: string;
  grain?: "day" | "week" | "month" | "range";
  dimensions?: Record<string, unknown> | null;
  qualityStatus?: MetricQualityStatus;
  confidence?: number | null;
  calculationKind?: MetricCalculationKind;
  inputRefs?: MetricInputRef[];
  warnings?: string[];
  deltaValue?: number | null;
  deltaPct?: number | null;
  trendPoints?: Array<{ date: string; value: number | null }>;
}
