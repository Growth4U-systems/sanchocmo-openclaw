import type { CustomMetric } from "@/lib/metrics/dashboard-schema";
import {
  evaluateMetricFormula,
  parseMetricFormula,
  type MetricFormulaReference,
} from "@/lib/metrics/formula";
import {
  METRIC_KPI_DEFINITIONS,
  computeSemanticKpisFromSnapshots,
  normalizeMetricName,
  normalizeSourceId,
  type ComputedMetricKpiValue,
  type MetricKpiDefinition,
  type MetricKpiEvaluationOptions,
  type MetricKpiInputRef,
  type MetricKpiQualityStatus,
  type MetricKpiSnapshotInput,
} from "@/lib/metrics/semantic-kpis";
import { SURFACES, type SurfaceKey } from "@/lib/metrics/surfaces";

const SURFACE_KEYS = new Set<string>(SURFACES.map((surface) => surface.key));

function definitionMatchesReference(
  definition: MetricKpiDefinition,
  reference: MetricFormulaReference,
): boolean {
  const source = normalizeSourceId(reference.source);
  const metric = normalizeMetricName(reference.metric);
  return (
    [definition.source, ...(definition.sourceAliases ?? [])]
      .map(normalizeSourceId)
      .includes(source) &&
    [definition.metric, ...(definition.metricAliases ?? [])]
      .map(normalizeMetricName)
      .includes(metric)
  );
}

function referenceDefinition(reference: MetricFormulaReference): MetricKpiDefinition {
  const known = METRIC_KPI_DEFINITIONS.find((definition) =>
    definitionMatchesReference(definition, reference),
  );
  const source = normalizeSourceId(reference.source);
  return {
    ...(known ?? {}),
    id: `__formula_ref.${reference.raw}`,
    label: reference.raw,
    dashboardBlock: "overview",
    surface: undefined,
    source,
    sourceAliases: [],
    metric: reference.metric,
    metricAliases: [],
    staleAfterDays: known?.staleAfterDays ?? 7,
    provenanceLabel: reference.raw,
  };
}

function aggregateReference(
  rows: MetricKpiSnapshotInput[],
  range: { from: string; to: string },
  reference: MetricFormulaReference,
  options: MetricKpiEvaluationOptions,
): ComputedMetricKpiValue {
  return computeSemanticKpisFromSnapshots(
    rows,
    range,
    [referenceDefinition(reference)],
    options,
  )[0];
}

function customMetricUnit(format: string | undefined): string | undefined {
  switch (format?.trim().toLowerCase()) {
    case "currency":
    case "moneda":
      // A dashboard formula has no ISO currency field. Never manufacture EUR:
      // keep the result in the connected account's currency until every input
      // exposes a compatible explicit currency code.
      return "account_currency";
    case "percent":
    case "percentage":
    case "%":
      return "%";
    case "ratio":
      return "ratio";
    case "ms":
    case "s":
      return format.trim().toLowerCase();
    default:
      return undefined;
  }
}

function customMetricSurface(surface: string | undefined): SurfaceKey | undefined {
  const normalized = surface?.trim().toLowerCase();
  return normalized && SURFACE_KEYS.has(normalized)
    ? (normalized as SurfaceKey)
    : undefined;
}

function inputRefKey(ref: MetricKpiInputRef): string {
  return ref.id ?? [
    ref.source,
    ref.metricName,
    ref.metricDate,
    JSON.stringify(ref.dimensions ?? null),
  ].join("\u0000");
}

function combineInputRefs(values: ComputedMetricKpiValue[]): MetricKpiInputRef[] {
  const refs = new Map<string, MetricKpiInputRef>();
  for (const value of values) {
    for (const ref of value.inputRefs) {
      const key = inputRefKey(ref);
      if (!refs.has(key)) refs.set(key, ref);
      if (refs.size >= 100) return [...refs.values()];
    }
  }
  return [...refs.values()];
}

function combinedQuality(
  values: ComputedMetricKpiValue[],
  hasValue: boolean,
): MetricKpiQualityStatus {
  if (!hasValue || values.some((value) => value.qualityStatus === "missing")) {
    return "missing";
  }
  for (const status of ["dirty", "stale", "demo", "partial"] as const) {
    if (values.some((value) => value.qualityStatus === status)) return status;
  }
  return "ok";
}

function customDefinition(metric: CustomMetric): MetricKpiDefinition {
  const surface = customMetricSurface(metric.surface);
  const id = `custom.${metric.id}`;
  return {
    id,
    label: metric.label,
    dashboardBlock: surface ? "surface" : "overview",
    surface,
    source: "custom",
    metric: metric.id,
    unit: customMetricUnit(metric.format),
    provenanceLabel: `Formula: ${metric.formula}`,
    emptyState: "missing",
  };
}

/**
 * Compute versioned dashboard formulas from the same raw snapshot set as the
 * built-in semantic KPIs. Invalid formulas, absent references, and arithmetic
 * errors deliberately yield a missing value; no error path manufactures zero.
 */
export function computeCustomMetricKpisFromSnapshots(
  rows: MetricKpiSnapshotInput[],
  range: { from: string; to: string },
  metrics: CustomMetric[],
  options: MetricKpiEvaluationOptions = {},
): ComputedMetricKpiValue[] {
  return metrics.map((metric) => {
    const definition = customDefinition(metric);
    const parsed = parseMetricFormula(metric.formula);
    if (!parsed.ok || parsed.references.length === 0) {
      return {
        definition,
        kpiId: definition.id,
        label: definition.label,
        dashboardBlock: definition.dashboardBlock,
        surface: definition.surface,
        source: definition.source,
        metricName: definition.metric,
        value: null,
        valueText: null,
        unit: definition.unit,
        qualityStatus: "missing",
        provenanceLabel: `${definition.provenanceLabel} · invalid syntax or missing reference`,
        inputRefs: [],
        sourceCoverage: 0,
        range,
      };
    }

    const inputs = parsed.references.map((reference) => ({
      reference,
      value: aggregateReference(rows, range, reference, options),
    }));
    const byReference = new Map(
      inputs.map((input) => [input.reference.raw, input.value]),
    );
    const evaluated = evaluateMetricFormula(parsed.ast, (reference) =>
      byReference.get(reference.raw)?.value,
    );
    const inputValues = inputs.map((input) => input.value);
    const value = evaluated.ok && Number.isFinite(evaluated.value)
      ? evaluated.value
      : null;
    const qualityStatus = combinedQuality(inputValues, value != null);
    const provenanceSuffix = evaluated.ok ? "" : ` · ${evaluated.error.code}`;

    return {
      definition,
      kpiId: definition.id,
      label: definition.label,
      dashboardBlock: definition.dashboardBlock,
      surface: definition.surface,
      source: definition.source,
      metricName: definition.metric,
      value,
      valueText: null,
      unit: definition.unit,
      qualityStatus,
      provenanceLabel: `${definition.provenanceLabel}${provenanceSuffix}`,
      inputRefs: combineInputRefs(inputValues),
      sourceCoverage: inputValues.length
        ? Math.min(...inputValues.map((input) => input.sourceCoverage))
        : 0,
      range,
    };
  });
}
