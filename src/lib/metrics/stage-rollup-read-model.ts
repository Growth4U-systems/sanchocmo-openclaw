export type MetricStageRollupQualityStatus =
  | "ok"
  | "partial"
  | "missing"
  | "dirty"
  | "stale"
  | "demo";

export interface MetricStageRollupReadInput {
  id: string;
  stageId: string;
  stageLabel: string;
  stageOrder: number;
  stageDate: string;
  channel: string;
  surface: string | null;
  source: string;
  metricName: string;
  value: number | null;
  qualityStatus: string | null;
  provenanceLabel: string;
  inputRefs: unknown;
  rangeFrom: string;
  rangeTo: string;
  definitionVersion: number | null;
  computedAt: Date | string | null;
}

export interface MetricStageRollupStageValue {
  stageId: string;
  label: string;
  order: number;
  value: number | null;
  displayValue: string;
  qualityStatus: MetricStageRollupQualityStatus;
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
  qualityStatus: MetricStageRollupQualityStatus;
}

export interface MetricStageRollupChannelValue {
  channel: string;
  label: string;
  value: number;
  displayValue: string;
  qualityStatus: MetricStageRollupQualityStatus;
  stages: MetricStageRollupStageValue[];
  rates: MetricStageRollupRateValue[];
}

export interface MetricStageRollupReadModel {
  configured: boolean;
  available: boolean;
  range: { from: string; to: string } | null;
  summary: {
    qualityStatus: MetricStageRollupQualityStatus;
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

const QUALITY_ORDER: MetricStageRollupQualityStatus[] = [
  "dirty",
  "stale",
  "demo",
  "partial",
  "ok",
  "missing",
];

const CORE_FUNNEL_STAGES = [
  { stageId: "sessions", label: "Sessions", order: 0 },
  { stageId: "leads", label: "Leads", order: 1 },
  { stageId: "qualified", label: "Cualificados", order: 2 },
  { stageId: "meetings", label: "Reuniones", order: 3 },
  { stageId: "deals", label: "Deals", order: 4 },
];

const CHANNEL_LABELS: Record<string, string> = {
  crm: "Pipeline/CRM",
  email: "Outbound ICP",
  outbound: "Outbound ICP",
  paid: "Paid",
  partnerships: "Partnerships",
  social: "Social",
  web: "Web/SEO",
};

function normalizeQuality(value: string | null | undefined): MetricStageRollupQualityStatus {
  return QUALITY_ORDER.includes(value as MetricStageRollupQualityStatus)
    ? (value as MetricStageRollupQualityStatus)
    : "missing";
}

function combineQuality(statuses: MetricStageRollupQualityStatus[]): MetricStageRollupQualityStatus {
  if (!statuses.length) return "missing";
  if (statuses.includes("dirty")) return "dirty";
  if (statuses.includes("stale")) return "stale";
  if (statuses.includes("demo")) return "demo";
  if (statuses.includes("partial")) return "partial";
  if (statuses.every((status) => status === "ok")) return "ok";
  return "partial";
}

function formatCount(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return "-";
  return new Intl.NumberFormat("es-ES", {
    maximumFractionDigits: Number.isInteger(value) ? 0 : 2,
  }).format(value);
}

function formatRate(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return "-";
  return `${new Intl.NumberFormat("es-ES", {
    maximumFractionDigits: value < 10 ? 1 : 0,
  }).format(value)}%`;
}

function dateToString(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : value;
}

function refsCount(value: unknown): number {
  return Array.isArray(value) ? value.length : 0;
}

function uniqueSorted(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))]
    .sort((a, b) => a.localeCompare(b));
}

function channelLabel(channel: string): string {
  return CHANNEL_LABELS[channel] ?? channel;
}

function buildStage(
  definition: { stageId: string; label: string; order: number },
  rows: MetricStageRollupReadInput[],
): MetricStageRollupStageValue {
  const values = rows
    .map((row) => row.value)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  const value = values.length ? values.reduce((acc, item) => acc + item, 0) : null;
  const qualityStatus = rows.length
    ? combineQuality(rows.map((row) => normalizeQuality(row.qualityStatus)))
    : "missing";

  return {
    stageId: definition.stageId,
    label: definition.label,
    order: definition.order,
    value,
    displayValue: formatCount(value),
    qualityStatus,
    channels: uniqueSorted(rows.map((row) => row.channel)),
    sources: uniqueSorted(rows.map((row) => `${row.source}.${row.metricName}`)),
    inputRefsCount: rows.reduce((acc, row) => acc + refsCount(row.inputRefs), 0),
  };
}

function buildRate(
  from: MetricStageRollupStageValue,
  to: MetricStageRollupStageValue,
): MetricStageRollupRateValue {
  const numerator = to.value;
  const denominator = from.value;
  const value =
    numerator != null && denominator != null && denominator > 0
      ? (numerator / denominator) * 100
      : null;
  const rawQuality = value == null
    ? "missing"
    : combineQuality([from.qualityStatus, to.qualityStatus]);
  const qualityStatus = rawQuality === "ok" ? "partial" : rawQuality;

  return {
    fromStageId: from.stageId,
    fromLabel: from.label,
    toStageId: to.stageId,
    toLabel: to.label,
    value,
    displayValue: formatRate(value),
    numerator,
    denominator,
    qualityStatus,
  };
}

function expectedStages(rows: MetricStageRollupReadInput[]) {
  const known = new Map(CORE_FUNNEL_STAGES.map((stage) => [stage.stageId, stage]));
  for (const row of rows) {
    if (!known.has(row.stageId)) {
      known.set(row.stageId, {
        stageId: row.stageId,
        label: row.stageLabel,
        order: row.stageOrder,
      });
    }
  }
  return [...known.values()].sort((a, b) => a.order - b.order);
}

function buildRates(stages: MetricStageRollupStageValue[]) {
  const rates: MetricStageRollupRateValue[] = [];
  for (let index = 0; index < stages.length - 1; index += 1) {
    rates.push(buildRate(stages[index], stages[index + 1]));
  }
  return rates;
}

function buildChannel(
  channel: string,
  rows: MetricStageRollupReadInput[],
  stages: Array<{ stageId: string; label: string; order: number }>,
): MetricStageRollupChannelValue {
  const stageValues = stages.map((stage) =>
    buildStage(stage, rows.filter((row) => row.stageId === stage.stageId)),
  );
  const values = rows
    .map((row) => row.value)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  const value = values.reduce((acc, item) => acc + item, 0);

  return {
    channel,
    label: channelLabel(channel),
    value,
    displayValue: formatCount(value),
    qualityStatus: rows.length
      ? combineQuality(rows.map((row) => normalizeQuality(row.qualityStatus)))
      : "missing",
    stages: stageValues,
    rates: buildRates(stageValues),
  };
}

export function buildMetricStageRollupReadModel(args: {
  configured: boolean;
  range: { from: string; to: string } | null;
  rows: MetricStageRollupReadInput[];
}): MetricStageRollupReadModel {
  const definitions = expectedStages(args.rows);
  const stages = definitions.map((stage) =>
    buildStage(stage, args.rows.filter((row) => row.stageId === stage.stageId)),
  );
  const channels = uniqueSorted(args.rows.map((row) => row.channel)).map((channel) =>
    buildChannel(channel, args.rows.filter((row) => row.channel === channel), definitions),
  );
  const available = args.rows.length > 0;
  const qualityStatus = available
    ? combineQuality(args.rows.map((row) => normalizeQuality(row.qualityStatus)))
    : "missing";
  const lastComputedAt = args.rows
    .map((row) => dateToString(row.computedAt))
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1) ?? null;

  return {
    configured: args.configured,
    available,
    range: args.range,
    summary: {
      qualityStatus,
      totalRows: args.rows.length,
      stageCount: stages.filter((stage) => stage.value != null).length,
      channelCount: channels.length,
      inputRefsCount: args.rows.reduce((acc, row) => acc + refsCount(row.inputRefs), 0),
      lastComputedAt,
      source: "metric_stage_rollups",
      emptyState: available ? "ready" : "missing_stage_rollups",
      nextAction: available
        ? "Mostrar como vista agregada; attribution avanzada requiere eventos individuales."
        : "Ejecutar cálculo de KPIs y configurar el mapa de etapas para este rango.",
    },
    stages,
    rates: buildRates(stages),
    channels,
  };
}
