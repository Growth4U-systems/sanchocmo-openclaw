/**
 * Partnerships · model config efectiva por cliente (SAN-76)
 *
 * UNA sola lógica para las tres superficies (UI · chat · MCP): lee/escribe el
 * documento de OVERRIDES que Yalc persiste en `GET/PUT /api/model-config` y
 * calcula la config EFECTIVA con los defaults de calc-creator-core
 * (`mergeCreatorModelConfig` — fuente de verdad compartida, contrato en
 * `src/lib/calc-creator-core/model-config.ts`).
 *
 * Consumidores:
 *  - Proxy `/api/yalc/model-config` (tab Settings de Outreach).
 *  - `createDiscoverySearch` (defaults de cualificación de búsquedas nuevas)
 *    y `runDiscoverySearch`/qualify-enrich (el score usa la config efectiva).
 *  - Tool MCP `yalc_update_model_config` y el camino con config de
 *    `yalc_breakeven`.
 *
 * Si Yalc no responde (no configurado, caído), la efectiva DEGRADA a los
 * defaults sembrados — la calc y el discovery nunca se bloquean por esto.
 */

import {
  DEFAULT_CREATOR_MODEL_CONFIG,
  hasModelConfigOverrides,
  mergeCreatorModelConfig,
  MODEL_CONFIG_OVERRIDE_KEYS,
} from "@/lib/calc-creator-core";
import type { CreatorModelConfig } from "@/lib/calc-creator-core";
import { resolveYalcConfig, yalcFetch } from "@/lib/yalc/client";

interface YalcModelConfigPayload {
  ok?: boolean;
  tenantId?: string;
  overrides?: Record<string, unknown>;
  updatedAt?: string | null;
}

export interface EffectiveModelConfig {
  /** Config EFECTIVA = defaults + overrides saneados (la que consume la calc). */
  config: CreatorModelConfig;
  /** Documento de overrides tal y como lo almacena Yalc (`{}` si no hay). */
  overrides: Record<string, unknown>;
  /** 'yalc' si hay overrides efectivos · 'defaults' si no (o Yalc caído). */
  source: "yalc" | "defaults";
  updatedAt: string | null;
  /** Error de transporte cuando se degradó a defaults (informativo). */
  yalcError?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function toEffective(payload: YalcModelConfigPayload): EffectiveModelConfig {
  const overrides = isRecord(payload.overrides) ? payload.overrides : {};
  return {
    config: mergeCreatorModelConfig(overrides),
    overrides,
    source: hasModelConfigOverrides(overrides) ? "yalc" : "defaults",
    updatedAt: typeof payload.updatedAt === "string" ? payload.updatedAt : null,
  };
}

/** Config efectiva del cliente; degrada a defaults si Yalc no responde. */
export async function getEffectiveModelConfig(
  slug: string,
  options: { signal?: AbortSignal } = {},
): Promise<EffectiveModelConfig> {
  try {
    const payload = await yalcFetch<YalcModelConfigPayload>(
      resolveYalcConfig(slug),
      "/api/model-config",
      { signal: options.signal },
    );
    return toEffective(payload);
  } catch (err) {
    return {
      config: mergeCreatorModelConfig({}),
      overrides: {},
      source: "defaults",
      updatedAt: null,
      yalcError: err instanceof Error ? err.message : String(err),
    };
  }
}

export class ModelConfigValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ModelConfigValidationError";
  }
}

/**
 * Validación estructural del partial (espejo del 400 de Yalc): objeto JSON con
 * solo claves conocidas. La validación de VALORES ocurre al mergear (lo
 * inválido se ignora y queda el default) — así un `null` puede viajar para
 * borrar un override almacenado.
 */
export function assertModelConfigPartial(
  partial: unknown,
): Record<string, unknown> {
  if (!isRecord(partial)) {
    throw new ModelConfigValidationError(
      "model-config update must be a JSON object",
    );
  }
  const unknown = Object.keys(partial).filter(
    (key) => !(MODEL_CONFIG_OVERRIDE_KEYS as readonly string[]).includes(key),
  );
  if (unknown.length > 0) {
    throw new ModelConfigValidationError(
      `Unknown model-config keys: ${unknown.join(", ")} (allowed: ${MODEL_CONFIG_OVERRIDE_KEYS.join(", ")})`,
    );
  }
  return partial;
}

/**
 * PUT parcial a Yalc (deep-merge sobre lo almacenado; arrays reemplazan;
 * null borra la clave; `reset` limpia el documento antes de aplicar).
 * Devuelve la efectiva resultante.
 */
export async function putModelConfigOverrides(
  slug: string,
  partial: unknown,
  opts: { reset?: boolean } = {},
): Promise<EffectiveModelConfig> {
  const clean = assertModelConfigPartial(partial);
  if (Object.keys(clean).length === 0 && opts.reset !== true) {
    throw new ModelConfigValidationError(
      "Empty update: provide at least one override key or reset:true",
    );
  }
  const payload = await yalcFetch<YalcModelConfigPayload>(
    resolveYalcConfig(slug),
    "/api/model-config",
    {
      method: "PUT",
      body: {
        overrides: clean,
        ...(opts.reset === true ? { reset: true } : {}),
      },
    },
  );
  return toEffective(payload);
}

/** `tiers` mergea POR `key` también en el documento: editar un tier no borra los demás. */
function mergeTierArrays(base: unknown[], incoming: unknown[]): unknown[] {
  const byKey = new Map<string, Record<string, unknown>>();
  for (const item of base) {
    if (isRecord(item) && typeof item.key === "string")
      byKey.set(item.key, { ...item });
  }
  for (const item of incoming) {
    if (!isRecord(item) || typeof item.key !== "string") continue;
    const merged: Record<string, unknown> = {
      ...(byKey.get(item.key) ?? { key: item.key }),
    };
    for (const [field, value] of Object.entries(item)) {
      if (value === null) delete merged[field];
      else merged[field] = value;
    }
    merged.key = item.key;
    if (Object.keys(merged).length > 1) byKey.set(item.key, merged);
    else byKey.delete(item.key);
  }
  return Array.from(byKey.values());
}

/**
 * Deep-merge de documentos de overrides — ESPEJO de la semántica del PUT de
 * Yalc (`src/lib/qualification/model-config.ts` allí): objetos mergean,
 * arrays/escalares reemplazan SALVO `tiers` (merge por `key`), null borra la
 * clave. Solo para previews (dry-run de la tool MCP); la escritura real la
 * hace Yalc.
 */
export function mergeOverrideDocuments(
  base: Record<string, unknown>,
  incoming: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(incoming)) {
    if (value === null) {
      delete out[key];
      continue;
    }
    const current = out[key];
    if (key === "tiers" && Array.isArray(value)) {
      const merged = mergeTierArrays(
        Array.isArray(current) ? current : [],
        value,
      );
      if (merged.length > 0) out[key] = merged;
      else delete out[key];
    } else if (isRecord(current) && isRecord(value)) {
      out[key] = mergeOverrideDocuments(current, value);
    } else if (isRecord(value)) {
      out[key] = mergeOverrideDocuments({}, value);
    } else {
      out[key] = value;
    }
  }
  return out;
}

export interface ModelConfigPreview {
  current: EffectiveModelConfig;
  /** Documento que Yalc almacenaría tras el PUT. */
  wouldStore: Record<string, unknown>;
  /** Config efectiva resultante (defaults + wouldStore). */
  configAfter: CreatorModelConfig;
}

/** Preview de un PUT parcial SIN escribir (dry-run de `yalc_update_model_config`). */
export async function previewModelConfigUpdate(
  slug: string,
  partial: unknown,
  opts: { reset?: boolean } = {},
): Promise<ModelConfigPreview> {
  const clean = assertModelConfigPartial(partial);
  const current = await getEffectiveModelConfig(slug);
  const base = opts.reset === true ? {} : current.overrides;
  const wouldStore = mergeOverrideDocuments(base, clean);
  return {
    current,
    wouldStore,
    configAfter: mergeCreatorModelConfig(wouldStore),
  };
}

/** Defaults sembrados (para que los consumidores no importen el core a mano). */
export function defaultModelConfig(): CreatorModelConfig {
  return mergeCreatorModelConfig({});
}

export { DEFAULT_CREATOR_MODEL_CONFIG };
