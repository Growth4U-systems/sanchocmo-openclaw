export interface MetricQualityMetadata {
  provenance?: string | null;
  quality?: string | null;
}

export interface MetricWithQualityMetadata extends MetricQualityMetadata {
  dimensions?: Record<string, unknown> | null;
}

export const METRIC_METADATA_DIMENSION_KEYS = new Set([
  "__provenance",
  "__quality",
  "__type",
  "__demo",
  "__seed",
]);

const DEMO_PROVENANCE_VALUES = new Set(["seed", "demo"]);
const TRUE_FLAG_VALUES = new Set(["true", "1", "yes"]);

export function isMetricMetadataDimensionKey(key: string): boolean {
  return METRIC_METADATA_DIMENSION_KEYS.has(key);
}

function metadataValue(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  return normalized || null;
}

export function applyMetricQualityMetadata<T extends MetricWithQualityMetadata>(
  metric: T,
  inherited: MetricQualityMetadata = {},
): T {
  const provenance = metadataValue(metric.provenance ?? inherited.provenance);
  const quality = metadataValue(metric.quality ?? inherited.quality);
  if (!provenance && !quality) return metric;
  const dimensions =
    metric.dimensions && typeof metric.dimensions === "object"
      ? { ...metric.dimensions }
      : {};
  if (provenance && dimensions.__provenance == null)
    dimensions.__provenance = provenance;
  if (quality && dimensions.__quality == null) dimensions.__quality = quality;
  return { ...metric, dimensions };
}

export function isDemoQualityMetadata(
  dimensions: Record<string, unknown> | null | undefined,
): boolean {
  const dims = dimensions ?? {};
  const provenanceValues = [
    dims.__provenance,
    dims.provenance,
    dims.__type,
    dims.type,
    dims.__quality,
    dims.quality,
  ].map((value) => String(value ?? "").trim().toLowerCase());
  const flagValues = [
    dims.__demo,
    dims.demo,
    dims.__seed,
    dims.seed,
  ].map((value) => String(value ?? "").trim().toLowerCase());
  return (
    provenanceValues.some((value) => DEMO_PROVENANCE_VALUES.has(value)) ||
    flagValues.some((value) => TRUE_FLAG_VALUES.has(value))
  );
}

export function isDemoProvenanceValue(value: unknown): boolean {
  return DEMO_PROVENANCE_VALUES.has(String(value ?? "").trim().toLowerCase());
}
