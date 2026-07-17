export type MetricStageRollupQualityStatus =
  | "ok"
  | "partial"
  | "missing"
  | "dirty"
  | "stale"
  | "demo";

export interface MetricStageRollupReadInput {
  id: string;
  mapId?: string | null;
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
  aggregationStatus: "missing" | "single_series" | "non_additive";
  seriesCount: number;
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
  calculationStatus: "missing_inputs" | "identity_not_available";
}

export interface MetricStageRollupChannelValue {
  seriesKey: string;
  channel: string;
  source: string;
  label: string;
  value: number | null;
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
    providerSeriesCount: number;
    inputRefsCount: number;
    lastComputedAt: string | null;
    source: "metric_stage_rollups";
    aggregationMode: "provider_observations";
    conversionRatesAvailable: false;
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
  { stageId: "sessions", label: "Visitas web", order: 0 },
  { stageId: "leads", label: "Leads", order: 1 },
  { stageId: "qualified", label: "Cualificados", order: 2 },
  { stageId: "meetings", label: "Reuniones", order: 3 },
  { stageId: "deals", label: "Oportunidades", order: 4 },
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

function observationSeriesKey(row: MetricStageRollupReadInput): string {
  return `${row.channel}\u0000${row.source}\u0000${row.metricName}\u0000${row.mapId ?? "default"}`;
}

function providerSeriesKey(row: MetricStageRollupReadInput): string {
  return `${row.channel}\u0000${row.source}`;
}

function sumFiniteValues(rows: MetricStageRollupReadInput[]): number | null {
  const values = rows
    .map((row) => row.value)
    .filter((value): value is number =>
      typeof value === "number" && Number.isFinite(value),
    );
  return values.length ? values.reduce((acc, value) => acc + value, 0) : null;
}

function buildStage(
  definition: { stageId: string; label: string; order: number },
  rows: MetricStageRollupReadInput[],
): MetricStageRollupStageValue {
  const series = new Map<string, MetricStageRollupReadInput[]>();
  for (const row of rows) {
    const key = observationSeriesKey(row);
    const bucket = series.get(key) ?? [];
    bucket.push(row);
    series.set(key, bucket);
  }
  const seriesValues = [...series.values()]
    .map(sumFiniteValues)
    .filter((value): value is number => value != null);
  // Values are additive only inside one provider/metric series (for example,
  // daily GHL opportunities). Different providers can observe the same person
  // and therefore must never be summed into a global lead total.
  const value = seriesValues.length === 1 ? seriesValues[0] : null;
  const aggregationStatus = seriesValues.length === 0
    ? "missing"
    : seriesValues.length === 1
      ? "single_series"
      : "non_additive";
  const qualityStatus = rows.length
    ? combineQuality([
        ...rows.map((row) => normalizeQuality(row.qualityStatus)),
        ...(aggregationStatus === "non_additive"
          ? (["partial"] as MetricStageRollupQualityStatus[])
          : []),
      ])
    : "missing";

  return {
    stageId: definition.stageId,
    label: definition.label,
    order: definition.order,
    value,
    displayValue: aggregationStatus === "non_additive"
      ? `${seriesValues.length} series separadas`
      : formatCount(value),
    qualityStatus,
    aggregationStatus,
    seriesCount: seriesValues.length,
    channels: uniqueSorted(rows.map((row) => row.channel)),
    sources: uniqueSorted(rows.map((row) => `${row.source}.${row.metricName}`)),
    inputRefsCount: rows.reduce((acc, row) => acc + refsCount(row.inputRefs), 0),
  };
}

function buildRate(
  from: MetricStageRollupStageValue,
  to: MetricStageRollupStageValue,
): MetricStageRollupRateValue {
  const calculationStatus = from.seriesCount > 0 && to.seriesCount > 0
    ? "identity_not_available"
    : "missing_inputs";

  return {
    fromStageId: from.stageId,
    fromLabel: from.label,
    toStageId: to.stageId,
    toLabel: to.label,
    value: null,
    displayValue: "-",
    numerator: null,
    denominator: null,
    qualityStatus: calculationStatus === "identity_not_available"
      ? "partial"
      : "missing",
    calculationStatus,
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
  seriesKey: string,
  channel: string,
  source: string,
  rows: MetricStageRollupReadInput[],
  stages: Array<{ stageId: string; label: string; order: number }>,
): MetricStageRollupChannelValue {
  const stageValues = stages.map((stage) =>
    buildStage(stage, rows.filter((row) => row.stageId === stage.stageId)),
  );
  const observedStageCount = stageValues.filter(
    (stage) => stage.seriesCount > 0,
  ).length;
  const hasMissingCoreStage = CORE_FUNNEL_STAGES.some((coreStage) =>
    stageValues.some(
      (stage) =>
        stage.stageId === coreStage.stageId && stage.qualityStatus === "missing",
    ),
  );

  return {
    seriesKey,
    channel,
    source,
    label: channelLabel(channel),
    // Counts from different funnel stages are also different universes. A
    // provider row exposes the observations but never a made-up row total.
    value: null,
    displayValue: `${observedStageCount} ${observedStageCount === 1 ? "etapa observada" : "etapas observadas"}`,
    qualityStatus: rows.length
      ? combineQuality([
          ...rows.map((row) => normalizeQuality(row.qualityStatus)),
          ...(hasMissingCoreStage
            ? (["partial"] as MetricStageRollupQualityStatus[])
            : []),
        ])
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
  const providerGroups = new Map<
    string,
    { channel: string; source: string; rows: MetricStageRollupReadInput[] }
  >();
  for (const row of args.rows) {
    const key = providerSeriesKey(row);
    const group = providerGroups.get(key) ?? {
      channel: row.channel,
      source: row.source,
      rows: [],
    };
    group.rows.push(row);
    providerGroups.set(key, group);
  }
  const channels = [...providerGroups.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([seriesKey, group]) =>
      buildChannel(
        seriesKey,
        group.channel,
        group.source,
        group.rows,
        definitions,
      ),
    );
  const available = args.rows.length > 0;
  const hasMissingCoreStage = CORE_FUNNEL_STAGES.some((coreStage) =>
    stages.some(
      (stage) =>
        stage.stageId === coreStage.stageId && stage.qualityStatus === "missing",
    ),
  );
  const qualityStatus = available
    ? combineQuality([
        ...args.rows.map((row) => normalizeQuality(row.qualityStatus)),
        ...(stages.some((stage) => stage.aggregationStatus === "non_additive")
          ? (["partial"] as MetricStageRollupQualityStatus[])
          : []),
        ...(hasMissingCoreStage
          ? (["partial"] as MetricStageRollupQualityStatus[])
          : []),
      ])
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
      stageCount: stages.filter((stage) => stage.seriesCount > 0).length,
      channelCount: new Set(args.rows.map((row) => row.channel)).size,
      providerSeriesCount: channels.length,
      inputRefsCount: args.rows.reduce((acc, row) => acc + refsCount(row.inputRefs), 0),
      lastComputedAt,
      source: "metric_stage_rollups",
      aggregationMode: "provider_observations",
      conversionRatesAvailable: false,
      emptyState: available ? "ready" : "missing_stage_rollups",
      nextAction: available
        ? "Mostrar volúmenes separados por proveedor. Tasas, fugas y atribución requieren identidad deduplicada y eventos individuales."
        : "Ejecutar cálculo de KPIs y configurar el mapa de etapas para este rango.",
    },
    stages,
    rates: buildRates(stages),
    channels,
  };
}
