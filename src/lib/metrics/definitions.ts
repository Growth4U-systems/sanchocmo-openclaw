import {
  DASHBOARD_METRIC_GROUPS,
  REQUIRED_DASHBOARD_METRIC_IDS,
} from "@/lib/metrics/definitions-dashboard";
import {
  DASHBOARD_AREAS,
  METRIC_AGGREGATIONS,
  METRIC_CALCULATION_KINDS,
  METRIC_DEFINITION_STATUSES,
  METRIC_FAMILIES,
  METRIC_FORMATS,
  type DashboardArea,
  type MetricDefinition,
  type MetricFamily,
} from "@/lib/metrics/semantic-types";

export { DASHBOARD_METRIC_GROUPS, REQUIRED_DASHBOARD_METRIC_IDS };

export const METRIC_DEFINITIONS: readonly MetricDefinition[] = Object.freeze(
  DASHBOARD_METRIC_GROUPS.flatMap((group) => group.definitions),
);

export const METRIC_DEFINITION_BY_ID = new Map<string, MetricDefinition>(
  METRIC_DEFINITIONS.map((definition) => [definition.id, definition]),
);

const ID_RE = /^[a-z][a-z0-9]*(?:[._][a-z0-9]+)*$/;
const DIMENSION_RE = /^[a-z][a-z0-9_]{0,63}$/;

const FAMILIES = new Set<string>(METRIC_FAMILIES);
const AREAS = new Set<string>(DASHBOARD_AREAS);
const FORMATS = new Set<string>(METRIC_FORMATS);
const AGGREGATIONS = new Set<string>(METRIC_AGGREGATIONS);
const CALCULATION_KINDS = new Set<string>(METRIC_CALCULATION_KINDS);
const STATUSES = new Set<string>(METRIC_DEFINITION_STATUSES);

export interface MetricDefinitionValidationError {
  id: string;
  field: string;
  message: string;
}

function push(errors: MetricDefinitionValidationError[], id: string, field: string, message: string): void {
  errors.push({ id, field, message });
}

function validateDimensions(
  errors: MetricDefinitionValidationError[],
  id: string,
  field: string,
  dimensions: string[] | Record<string, string> | undefined,
): void {
  if (!dimensions) return;
  const keys = Array.isArray(dimensions) ? dimensions : Object.keys(dimensions);
  for (const key of keys) {
    if (!DIMENSION_RE.test(key)) {
      push(errors, id, field, `Invalid dimension key "${key}"`);
    }
  }
}

export function validateMetricDefinitions(
  definitions: readonly MetricDefinition[] = METRIC_DEFINITIONS,
): MetricDefinitionValidationError[] {
  const errors: MetricDefinitionValidationError[] = [];
  const seen = new Set<string>();
  const ids = new Set(definitions.map((definition) => definition.id));

  for (const definition of definitions) {
    const id = definition.id || "<missing>";
    if (!ID_RE.test(id)) push(errors, id, "id", "Metric id must be stable lower-case dot/underscore notation");
    if (seen.has(id)) push(errors, id, "id", "Duplicate metric id");
    seen.add(id);
    if (!definition.label?.trim()) push(errors, id, "label", "Missing label");
    if (!definition.description?.trim()) push(errors, id, "description", "Missing description");
    if (!FAMILIES.has(definition.family)) push(errors, id, "family", `Unknown family "${definition.family}"`);
    if (!AREAS.has(definition.area)) push(errors, id, "area", `Unknown area "${definition.area}"`);
    if (!FORMATS.has(definition.format)) push(errors, id, "format", `Unknown format "${definition.format}"`);
    if (!AGGREGATIONS.has(definition.aggregation)) push(errors, id, "aggregation", `Unknown aggregation "${definition.aggregation}"`);
    if (!CALCULATION_KINDS.has(definition.calculationKind)) {
      push(errors, id, "calculationKind", `Unknown calculation kind "${definition.calculationKind}"`);
    }
    if (!STATUSES.has(definition.status)) push(errors, id, "status", `Unknown status "${definition.status}"`);
    if (!definition.sources.length) push(errors, id, "sources", "Definitions must declare at least one source or semantic table");
    for (const source of definition.sources) {
      if (!source.source?.trim()) push(errors, id, "sources", "Source reference is missing source");
      validateDimensions(errors, id, "sources.dimensions", source.dimensions);
    }
    validateDimensions(errors, id, "requiredDimensions", definition.requiredDimensions);
    validateDimensions(errors, id, "optionalDimensions", definition.optionalDimensions);
    for (const dep of definition.dependsOn ?? []) {
      if (!ids.has(dep)) push(errors, id, "dependsOn", `Unknown dependency "${dep}"`);
    }
  }

  for (const requiredId of REQUIRED_DASHBOARD_METRIC_IDS) {
    if (!ids.has(requiredId)) push(errors, requiredId, "required", "Required dashboard metric is not defined");
  }

  return errors;
}

export function getMetricDefinition(id: string): MetricDefinition | undefined {
  return METRIC_DEFINITION_BY_ID.get(id);
}

export function requireMetricDefinition(id: string): MetricDefinition {
  const definition = getMetricDefinition(id);
  if (!definition) throw new Error(`Unknown metric definition: ${id}`);
  return definition;
}

export function metricDefinitionsForArea(area: DashboardArea): MetricDefinition[] {
  return METRIC_DEFINITIONS.filter((definition) => definition.area === area);
}

export function metricDefinitionsForFamily(family: MetricFamily): MetricDefinition[] {
  return METRIC_DEFINITIONS.filter((definition) => definition.family === family);
}
