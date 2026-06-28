import { aggFor, type AggStrategy } from "@/lib/metrics/aggregation";
import { getKnownDirty } from "@/lib/metrics/collection-schedule";
import {
  isDemoProvenanceValue,
  isDemoQualityMetadata,
} from "@/lib/metrics/provenance";
import type { SurfaceKey } from "@/lib/metrics/surfaces";
import {
  normalizeMetricName,
  normalizeSourceId,
  type ComputedMetricKpiValue,
  type MetricKpiDefinition,
  type MetricKpiInputRef,
  type MetricKpiQualityStatus,
  type MetricKpiSnapshotInput,
} from "@/lib/metrics/semantic-kpis";

export type MetricFunnelStageId =
  | "sessions"
  | "leads"
  | "qualified"
  | "meetings"
  | "deals"
  | "customers";

export interface MetricFunnelStageDefinition {
  mapId: string;
  stageId: MetricFunnelStageId;
  stageLabel: string;
  stageOrder: number;
  surface?: SurfaceKey;
  source: string;
  sourceAliases?: string[];
  metric: string;
  metricAliases?: string[];
  dimensionsFilter?: Record<string, string>;
  channel?: string;
  aggregation?: AggStrategy;
  qualityOverride?: MetricKpiQualityStatus;
  enabled?: boolean;
}

export interface ComputedMetricStageRollup {
  mapId: string;
  stageId: MetricFunnelStageId;
  stageLabel: string;
  stageOrder: number;
  stageDate: string;
  channel: string;
  surface?: SurfaceKey;
  source: string;
  metricName: string;
  value: number;
  qualityStatus: MetricKpiQualityStatus;
  provenanceLabel: string;
  inputRefs: MetricKpiInputRef[];
  dimensions: Record<string, string>;
  range: { from: string; to: string };
}

export const METRIC_STAGE_ROLLUP_DEFINITION_VERSION = 1;

const DEFAULT_STALE_AFTER_DAYS = 7;

const CORE_AVAILABILITY_STAGE_IDS: MetricFunnelStageId[] = [
  "sessions",
  "leads",
  "qualified",
  "meetings",
  "deals",
];

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

export const DEFAULT_FUNNEL_STAGE_DEFINITIONS: MetricFunnelStageDefinition[] = [
  stage("web.sessions", "sessions", "Sessions", 0, "web", "ga4", "sessions", {
    channel: "web",
  }),
  stage("web.leads.ga4", "leads", "Leads", 1, "web", "ga4", "conversions", {
    channel: "web",
    qualityOverride: "partial",
  }),
  stage("crm.leads.ghl", "leads", "Leads", 1, "pipeline", "ghl", "newContacts", {
    channel: "crm",
    qualityOverride: "dirty",
  }),
  stage("paid.leads.meta", "leads", "Leads", 1, "paid", "meta_ads", "leads", {
    sourceAliases: ["meta-ads", "meta"],
    channel: "paid",
    qualityOverride: "partial",
  }),
  stage("paid.leads.google", "leads", "Leads", 1, "paid", "google_ads", "leads", {
    sourceAliases: ["google-ads", "google"],
    channel: "paid",
    qualityOverride: "partial",
  }),
  stage("outbound.leads.lemlist", "leads", "Leads", 1, "email", "lemlist", "leads", {
    channel: "outbound",
  }),
  stage("partnerships.signups", "leads", "Leads", 1, "partnerships", "yalc", "signups", {
    channel: "partnerships",
    qualityOverride: "partial",
  }),
  stage("partnerships.kyc", "qualified", "Cualificados", 2, "partnerships", "yalc", "kyc", {
    channel: "partnerships",
    qualityOverride: "partial",
  }),
  stage("crm.meetings.ghl", "meetings", "Reuniones", 3, "pipeline", "ghl", "appointments", {
    channel: "crm",
    qualityOverride: "dirty",
  }),
  stage("outbound.meetings.lemlist", "meetings", "Reuniones", 3, "email", "lemlist", "meetings", {
    metricAliases: ["meetings", "meetingBooked"],
    channel: "outbound",
    qualityOverride: "partial",
  }),
  stage("crm.deals.ghl", "deals", "Deals", 4, "pipeline", "ghl", "totalOpportunities", {
    channel: "crm",
    aggregation: "latest",
    qualityOverride: "dirty",
  }),
  stage("partnerships.first_tx", "customers", "Clientes", 5, "partnerships", "yalc", "firstTx", {
    metricAliases: ["firstTx", "first_tx", "firstTransaction"],
    channel: "partnerships",
    qualityOverride: "partial",
  }),
];

function stage(
  mapId: string,
  stageId: MetricFunnelStageId,
  stageLabel: string,
  stageOrder: number,
  surface: SurfaceKey | undefined,
  source: string,
  metric: string,
  opts: Partial<MetricFunnelStageDefinition> = {},
): MetricFunnelStageDefinition {
  return {
    mapId,
    stageId,
    stageLabel,
    stageOrder,
    surface,
    source,
    metric,
    enabled: true,
    ...opts,
  };
}

function metricNamesFor(def: MetricFunnelStageDefinition): Set<string> {
  return new Set(
    [def.metric, ...(def.metricAliases ?? [])].map(normalizeMetricName),
  );
}

function sourcesFor(def: MetricFunnelStageDefinition): Set<string> {
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

function matchesDimensions(
  row: MetricKpiSnapshotInput,
  filter: Record<string, string> | undefined,
): boolean {
  const entries = Object.entries(filter ?? {});
  if (!entries.length) return true;
  const dims = row.dimensions ?? {};
  return entries.every(([key, value]) => dims[key] === value);
}

function channelFor(
  def: MetricFunnelStageDefinition,
  row: MetricKpiSnapshotInput,
): string {
  const dims = row.dimensions ?? {};
  return (
    def.channel ||
    dims.channel ||
    dims.defaultChannel ||
    dims.platform ||
    def.surface ||
    normalizeSourceId(def.source)
  );
}

function reduceRows(
  def: MetricFunnelStageDefinition,
  rows: MetricKpiSnapshotInput[],
): number {
  const strategy = def.aggregation ?? aggFor(def.source, def.metric);
  if (strategy === "latest") {
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
  const values = rows
    .map((row) => Number(row.value))
    .filter((value) => Number.isFinite(value));
  const sum = values.reduce((acc, value) => acc + value, 0);
  return strategy === "avg" ? sum / Math.max(values.length, 1) : sum;
}

function ageDays(latestDate: string, to: string): number {
  const latestTime = new Date(`${latestDate}T00:00:00Z`).getTime();
  const toTime = new Date(`${to}T00:00:00Z`).getTime();
  if (!Number.isFinite(latestTime) || !Number.isFinite(toTime)) return 0;
  return Math.floor((toTime - latestTime) / 86_400_000);
}

function qualityFor(
  def: MetricFunnelStageDefinition,
  rows: MetricKpiSnapshotInput[],
  rangeTo: string,
): MetricKpiQualityStatus {
  if (rows.some(isDemoRow)) return "demo";
  if (def.qualityOverride === "demo") return "demo";
  if (
    def.qualityOverride === "dirty" ||
    rows.some((row) => getKnownDirty(normalizeSourceId(row.source)).knownDirty)
  )
    return "dirty";
  if (def.qualityOverride === "partial") return "partial";
  const latest = rows
    .map((row) => row.metricDate)
    .sort()
    .at(-1);
  if (latest && ageDays(latest, rangeTo) > DEFAULT_STALE_AFTER_DAYS)
    return "stale";
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

export function computeMetricStageRollupsFromSnapshots(
  rows: MetricKpiSnapshotInput[],
  range: { from: string; to: string },
  definitions: MetricFunnelStageDefinition[] = DEFAULT_FUNNEL_STAGE_DEFINITIONS,
): ComputedMetricStageRollup[] {
  const windowRows = rows.filter(
    (row) => row.metricDate >= range.from && row.metricDate <= range.to,
  );
  const out: ComputedMetricStageRollup[] = [];

  for (const def of definitions.filter((item) => item.enabled !== false)) {
    const sourceSet = sourcesFor(def);
    const metricSet = metricNamesFor(def);
    const matching = windowRows.filter((row) => {
      if (row.value == null || !Number.isFinite(Number(row.value)))
        return false;
      return (
        sourceSet.has(normalizeSourceId(row.source)) &&
        metricSet.has(normalizeMetricName(row.metricName)) &&
        matchesDimensions(row, def.dimensionsFilter)
      );
    });
    const rollupRows = matching.filter(isRollup);
    const selected = rollupRows.length ? rollupRows : matching;
    const byBucket = new Map<string, MetricKpiSnapshotInput[]>();
    for (const row of selected) {
      const channel = channelFor(def, row);
      const key = `${row.metricDate}\u0000${channel}`;
      const bucket = byBucket.get(key) ?? [];
      bucket.push(row);
      byBucket.set(key, bucket);
    }

    for (const [key, bucket] of byBucket) {
      const [stageDate, channel] = key.split("\u0000");
      out.push({
        mapId: def.mapId,
        stageId: def.stageId,
        stageLabel: def.stageLabel,
        stageOrder: def.stageOrder,
        stageDate,
        channel,
        surface: def.surface,
        source: normalizeSourceId(def.source),
        metricName: normalizeMetricName(def.metric),
        value: reduceRows(def, bucket),
        qualityStatus: qualityFor(def, bucket, range.to),
        provenanceLabel: `${def.source}.${def.metric} -> ${def.stageId}`,
        inputRefs: inputRefs(bucket),
        dimensions: { channel },
        range,
      });
    }
  }

  return out.sort((a, b) =>
    a.stageDate.localeCompare(b.stageDate) ||
    a.stageOrder - b.stageOrder ||
    a.channel.localeCompare(b.channel) ||
    a.source.localeCompare(b.source),
  );
}

function rollupSummaryQuality(
  rollups: ComputedMetricStageRollup[],
): MetricKpiQualityStatus {
  if (!rollups.length) return "missing";
  if (rollups.some((row) => row.qualityStatus === "demo")) return "demo";
  if (rollups.some((row) => row.qualityStatus === "dirty")) return "dirty";
  const coreStages = new Set(CORE_AVAILABILITY_STAGE_IDS);
  const observed = new Set(rollups.map((row) => row.stageId));
  const covered = [...coreStages].filter((stageId) => observed.has(stageId));
  if (covered.length < coreStages.size) return "partial";
  if (rollups.some((row) => row.qualityStatus === "partial")) return "partial";
  if (rollups.some((row) => row.qualityStatus === "stale")) return "stale";
  return "ok";
}

function rollupInputRefs(
  rollups: ComputedMetricStageRollup[],
): MetricKpiInputRef[] {
  return rollups.slice(0, 100).map((row) => ({
    source: row.source,
    metricName: row.metricName,
    metricDate: row.stageDate,
    dimensions: { stage: row.stageId, channel: row.channel },
  }));
}

export function buildStageRollupsAvailabilityKpi(
  rollups: ComputedMetricStageRollup[],
  range: { from: string; to: string },
  definition: MetricKpiDefinition,
): ComputedMetricKpiValue {
  const coreStages = new Set(CORE_AVAILABILITY_STAGE_IDS);
  const stageCount = new Set(
    rollups
      .map((row) => row.stageId)
      .filter((stageId) => coreStages.has(stageId)),
  ).size;
  const expectedStages = CORE_AVAILABILITY_STAGE_IDS.length;
  return {
    definition,
    kpiId: definition.id,
    label: definition.label,
    dashboardBlock: definition.dashboardBlock,
    surface: definition.surface,
    source: definition.source,
    metricName: definition.metric,
    value: stageCount,
    valueText: rollups.length ? `${stageCount}/${expectedStages} stages` : null,
    unit: definition.unit,
    qualityStatus: rollupSummaryQuality(rollups),
    provenanceLabel: "metric_stage_rollups",
    inputRefs: rollupInputRefs(rollups),
    sourceCoverage: Math.min(1, stageCount / expectedStages),
    range,
  };
}
