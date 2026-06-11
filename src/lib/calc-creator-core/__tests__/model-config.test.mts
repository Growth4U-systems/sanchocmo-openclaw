/**
 * SAN-76 · merge de model config: defaults (calc-creator-core) + overrides
 * (documento por tenant en Yalc). El contrato vive en ../model-config.ts:
 * objetos mergean · arrays reemplazan · tiers mergean por key · lo inválido
 * se descarta sin romper.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import * as calcCoreModule from "../index";

const calcCore =
  (calcCoreModule as unknown as { default: typeof calcCoreModule }).default ?? calcCoreModule;

const {
  DEFAULT_CREATOR_MODEL_CONFIG,
  computeQualityScore,
  hasModelConfigOverrides,
  mergeCreatorModelConfig,
  sanitizeCreatorModelOverrides,
} = calcCore;

function tierEr(config: ReturnType<typeof mergeCreatorModelConfig>, key: string): number {
  const tier = config.tiers.find((t) => t.key === key);
  assert.ok(tier, `tier ${key} no encontrado`);
  return tier.erBenchmarkPct;
}

// ─── Merge básico ────────────────────────────────────────────────────────────

test("sin overrides (undefined/{}/null) → la efectiva es exactamente la default", () => {
  for (const overrides of [undefined, null, {}, "garbage", 42, []]) {
    const merged = mergeCreatorModelConfig(overrides);
    assert.deepEqual(merged, JSON.parse(JSON.stringify(DEFAULT_CREATOR_MODEL_CONFIG)));
  }
});

test("merge no muta los defaults (clon profundo)", () => {
  const before = JSON.stringify(DEFAULT_CREATOR_MODEL_CONFIG);
  const merged = mergeCreatorModelConfig({ tiers: [{ key: "micro", erBenchmarkPct: 9.9 }] });
  (merged.tiers as Array<{ erBenchmarkPct: number }>)[0].erBenchmarkPct = 1.23;
  assert.equal(JSON.stringify(DEFAULT_CREATOR_MODEL_CONFIG), before);
});

test("tiers mergean POR KEY: editar el ER de micro no toca los demás campos ni tiers", () => {
  const merged = mergeCreatorModelConfig({ tiers: [{ key: "micro", erBenchmarkPct: 6.2 }] });
  assert.equal(tierEr(merged, "micro"), 6.2);
  // El resto del tier micro queda como el default.
  const micro = merged.tiers.find((t) => t.key === "micro");
  assert.equal(micro?.minFollowers, 25_000);
  assert.equal(micro?.maxFollowers, 100_000);
  assert.equal(micro?.label, "Micro");
  // Los otros tiers, intactos.
  assert.equal(tierEr(merged, "nano"), 8.0);
  assert.equal(tierEr(merged, "mid"), 4.0);
  assert.equal(tierEr(merged, "macro"), 2.5);
});

test("tier con key desconocida se descarta (taxonomía fija v1: no se añaden tiers)", () => {
  const merged = mergeCreatorModelConfig({
    tiers: [
      { key: "mega", erBenchmarkPct: 1.0 },
      { key: "nano", erBenchmarkPct: 7.5 },
    ],
  });
  assert.equal(merged.tiers.length, 4);
  assert.equal(tierEr(merged, "nano"), 7.5);
});

test("arrays REEMPLAZAN enteros: verticals/formats no se concatenan", () => {
  const merged = mergeCreatorModelConfig({ verticals: ["cripto", "trading"] });
  assert.deepEqual(merged.verticals, ["cripto", "trading"]);
  // formats sin override → default intacto.
  assert.deepEqual(merged.formats, [...DEFAULT_CREATOR_MODEL_CONFIG.formats]);
});

test("lista vacía explícita se respeta (quitar todos los chips)", () => {
  const merged = mergeCreatorModelConfig({ formats: [] });
  assert.deepEqual(merged.formats, []);
});

test("qualification mergea campo a campo: solo threshold deja el mode default en pie", () => {
  const merged = mergeCreatorModelConfig({ qualification: { threshold: 55 } });
  assert.equal(merged.qualification.threshold, 55);
  assert.equal(merged.qualification.defaultMode, "hybrid");

  const merged2 = mergeCreatorModelConfig({ qualification: { defaultMode: "manual" } });
  assert.equal(merged2.qualification.defaultMode, "manual");
  assert.equal(merged2.qualification.threshold, 40);
});

test("breakEven: escalares y ctr por formato mergean; multiplicadores reemplazan", () => {
  const merged = mergeCreatorModelConfig({
    breakEven: {
      defaultTargetCacEur: 95,
      ctrByFormatPct: { reel: 1.5 },
      incentiveMultipliers: [1, 2],
    },
  });
  assert.equal(merged.breakEven.defaultTargetCacEur, 95);
  assert.equal(merged.breakEven.ctrByFormatPct.reel, 1.5);
  assert.equal(merged.breakEven.ctrByFormatPct.post, 0.9); // intacto
  assert.deepEqual([...merged.breakEven.incentiveMultipliers], [1, 2]);
  assert.equal(merged.breakEven.clickToSignupPct, 8); // intacto
});

// ─── Sanitize (overrides corruptos nunca rompen) ─────────────────────────────

test("claves desconocidas y tipos inválidos se descartan", () => {
  const clean = sanitizeCreatorModelOverrides({
    tires: [{ key: "nano", erBenchmarkPct: 1 }], // typo → fuera
    verticals: ["fintech", "", "   ", "FINTECH", 7],
    qualification: { defaultMode: "yolo", threshold: "alto" },
    weights: { erVsTier: -1, sectorFit: 0.4, bogus: 3 },
    breakEven: { defaultTargetCacEur: 0.5 },
  });
  assert.deepEqual(clean, {
    verticals: ["fintech"],
    weights: { sectorFit: 0.4 },
  });
});

test("threshold se clampa a 0-100", () => {
  assert.equal(mergeCreatorModelConfig({ qualification: { threshold: 250 } }).qualification.threshold, 100);
  assert.equal(mergeCreatorModelConfig({ qualification: { threshold: -10 } }).qualification.threshold, 0);
});

test("ER de tier fuera de rango (≤0 o ≥100) se ignora", () => {
  const merged = mergeCreatorModelConfig({
    tiers: [
      { key: "nano", erBenchmarkPct: 0 },
      { key: "micro", erBenchmarkPct: 150 },
    ],
  });
  assert.equal(tierEr(merged, "nano"), 8.0);
  assert.equal(tierEr(merged, "micro"), 5.5);
});

test("tiers duplicados en el override: gana el último (PUT idempotente)", () => {
  const merged = mergeCreatorModelConfig({
    tiers: [
      { key: "mid", erBenchmarkPct: 3.0 },
      { key: "mid", erBenchmarkPct: 4.5 },
    ],
  });
  assert.equal(tierEr(merged, "mid"), 4.5);
});

test("hasModelConfigOverrides: false para basura/vacío, true para override real", () => {
  assert.equal(hasModelConfigOverrides({}), false);
  assert.equal(hasModelConfigOverrides({ tires: [] }), false);
  assert.equal(hasModelConfigOverrides(null), false);
  assert.equal(hasModelConfigOverrides({ qualification: { threshold: 55 } }), true);
});

// ─── La config mergeada alimenta la calc (integración con el motor) ─────────

test("editar el ER benchmark del tier cambia el quality score (componente erVsTier)", () => {
  // Creator mid (142K) con ER 4.8 — benchmark default 4.0 → por encima.
  const metrics = { followers: 142_000, engagementRatePct: 4.8 };
  const baseline = computeQualityScore(metrics, mergeCreatorModelConfig({}));
  // Si el benchmark del tier sube a 8.0, el mismo ER queda por debajo → score menor.
  const exigente = computeQualityScore(
    metrics,
    mergeCreatorModelConfig({ tiers: [{ key: "mid", erBenchmarkPct: 8.0 }] }),
  );
  const erBaseline = baseline.components.find((c) => c.key === "erVsTier");
  const erExigente = exigente.components.find((c) => c.key === "erVsTier");
  assert.ok(erBaseline && erExigente);
  assert.ok(
    erExigente.score < erBaseline.score,
    `esperaba erVsTier menor con benchmark 8.0 (${erExigente.score} < ${erBaseline.score})`,
  );
  assert.equal(exigente.erBenchmarkPct, 8.0);
});
