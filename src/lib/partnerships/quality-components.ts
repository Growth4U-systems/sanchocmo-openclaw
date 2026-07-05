import type { QualityComponentsMap } from "./types";

export const QUALITY_COMPONENT_KEYS = [
  "erVsTier",
  "authenticity",
  "sectorFit",
  "audienceEs",
  "consistency",
] as const satisfies ReadonlyArray<keyof QualityComponentsMap>;

const SNAKE_TO_COMPONENT: Record<string, keyof QualityComponentsMap> = {
  er_vs_tier: "erVsTier",
  authenticity: "authenticity",
  sector_fit: "sectorFit",
  audience_es: "audienceEs",
  consistency: "consistency",
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function put(
  out: Partial<QualityComponentsMap>,
  key: keyof QualityComponentsMap,
  value: unknown,
) {
  const score = finiteNumber(value);
  if (score !== null) out[key] = score;
}

export function normalizeQualityComponents(
  value: unknown,
): Partial<QualityComponentsMap> | null {
  const record = asRecord(value);
  if (!record) return null;

  const out: Partial<QualityComponentsMap> = {};

  for (const key of QUALITY_COMPONENT_KEYS) {
    put(out, key, record[key]);
  }
  for (const [snake, key] of Object.entries(SNAKE_TO_COMPONENT)) {
    put(out, key, record[snake]);
  }

  if (Array.isArray(record.components)) {
    for (const component of record.components) {
      const item = asRecord(component);
      if (!item) continue;
      const rawKey = typeof item.key === "string" ? item.key : "";
      const key =
        QUALITY_COMPONENT_KEYS.find((candidate) => candidate === rawKey) ??
        SNAKE_TO_COMPONENT[rawKey];
      if (!key) continue;
      put(out, key, item.score ?? item.value);
    }
  }

  return Object.keys(out).length > 0 ? out : null;
}
