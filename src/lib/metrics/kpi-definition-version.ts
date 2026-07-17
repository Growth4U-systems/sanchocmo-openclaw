/**
 * Persisted KPI runs have a single signed Postgres `integer` version column,
 * while their output depends on two independently versioned inputs:
 *
 *   1. the code-owned semantic KPI catalogue; and
 *   2. the client's active dashboard definition (custom formulas included).
 *
 * Pack both components into non-overlapping bit fields. The bounds are checked
 * instead of truncated, making the mapping injective for every accepted pair.
 */

const DASHBOARD_VERSION_BITS = 20;
const DASHBOARD_VERSION_BASE = 2 ** DASHBOARD_VERSION_BITS;
export const MAX_METRIC_DASHBOARD_VERSION = DASHBOARD_VERSION_BASE - 1;
export const MAX_METRIC_SEMANTIC_VERSION = 2 ** (31 - DASHBOARD_VERSION_BITS) - 1;

function checkedVersion(name: string, value: number, max: number): number {
  if (!Number.isSafeInteger(value) || value < 0 || value > max) {
    throw new Error(`${name} must be an integer between 0 and ${max}; received ${value}`);
  }
  return value;
}

export function composeMetricKpiDefinitionVersion(
  semanticVersion: number,
  dashboardVersion: number,
): number {
  const semantic = checkedVersion(
    "Metric semantic definition version",
    semanticVersion,
    MAX_METRIC_SEMANTIC_VERSION,
  );
  const dashboard = checkedVersion(
    "Metric dashboard version",
    dashboardVersion,
    MAX_METRIC_DASHBOARD_VERSION,
  );
  return semantic * DASHBOARD_VERSION_BASE + dashboard;
}

export function splitMetricKpiDefinitionVersion(version: number): {
  semanticVersion: number;
  dashboardVersion: number;
} {
  const packed = checkedVersion(
    "Effective metric KPI definition version",
    version,
    2_147_483_647,
  );
  return {
    semanticVersion: Math.floor(packed / DASHBOARD_VERSION_BASE),
    dashboardVersion: packed % DASHBOARD_VERSION_BASE,
  };
}
