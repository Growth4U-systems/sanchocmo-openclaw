import { test } from "node:test";
import assert from "node:assert/strict";
import * as calcCoreModule from "../index";

const calcCore =
  (calcCoreModule as unknown as { default: typeof calcCoreModule }).default ?? calcCoreModule;

const {
  DEFAULT_CREATOR_MODEL_CONFIG,
  NEUTRAL_SCORE,
  SEED_CREATORS,
  computeQualityScore,
  isBelowQualificationThreshold,
  resolveTier,
  scoreBand,
  scoreErVsTier,
  scoreSectorFit,
} = calcCore;

type ComponentMap = Record<string, number>;

function componentScores(result: ReturnType<typeof computeQualityScore>): ComponentMap {
  return Object.fromEntries(result.components.map((c) => [c.key, c.score]));
}

function seed(handle: string) {
  const found = SEED_CREATORS.find((s) => s.metrics.handle === handle);
  assert.ok(found, `seed ${handle} no encontrado`);
  return found;
}

// ─── Config sembrada (espejo de settings.html) ────────────────────────────

test("config sembrada: tiers Nano/Micro/Mid/Macro con ER benchmark 8.0/5.5/4.0/2.5", () => {
  const tiers = DEFAULT_CREATOR_MODEL_CONFIG.tiers;
  assert.deepEqual(
    tiers.map((t) => [t.key, t.minFollowers, t.maxFollowers, t.erBenchmarkPct]),
    [
      ["nano", 0, 25_000, 8.0],
      ["micro", 25_000, 100_000, 5.5],
      ["mid", 100_000, 250_000, 4.0],
      ["macro", 250_000, null, 2.5],
    ],
  );
});

test("config sembrada: verticals y formats del mockup settings", () => {
  assert.deepEqual(DEFAULT_CREATOR_MODEL_CONFIG.verticals, [
    "finanzas personales",
    "inversión",
    "ahorro",
    "fintech",
  ]);
  assert.deepEqual(DEFAULT_CREATOR_MODEL_CONFIG.formats, [
    "reel",
    "post",
    "story",
    "video largo",
    "carrusel",
  ]);
});

test("config sembrada: pesos default iguales y suman 1; hybrid con umbral 40", () => {
  const weights = Object.values(DEFAULT_CREATOR_MODEL_CONFIG.weights);
  assert.equal(weights.length, 5);
  assert.ok(Math.abs(weights.reduce((a, b) => a + b, 0) - 1) < 1e-9);
  assert.equal(DEFAULT_CREATOR_MODEL_CONFIG.qualification.defaultMode, "hybrid");
  assert.equal(DEFAULT_CREATOR_MODEL_CONFIG.qualification.threshold, 40);
});

test("config sembrada: semillas break-even espejo del drawer (reach 30 × CTR por formato)", () => {
  // La semilla provisional `clickRatePct: 15` de la pasada A se retiró:
  // el mockup final modela reach × CTR (ver break-even.test.mts).
  const be = DEFAULT_CREATOR_MODEL_CONFIG.breakEven;
  assert.equal(be.defaultTargetCacEur, 80);
  assert.equal(be.reachRatePct, 30);
  assert.deepEqual(be.ctrByFormatPct, {
    reel: 1.2,
    post: 0.9,
    story: 0.6,
    video: 1.4,
    carrusel: 1.0,
  });
  assert.deepEqual([be.clickToSignupPct, be.signupToKycPct, be.kycToFirstTxPct], [8, 60, 70]);
  assert.deepEqual(be.incentiveMultipliers, [1, 1.5, 2, 3]);
  assert.deepEqual(be.verdict, { viableMinRatio: 1, tightMinRatio: 0.6 });
});

// ─── Tiers: límites ───────────────────────────────────────────────────────

test("resolveTier: límites de rango (superior exclusivo)", () => {
  const cases: Array<[number, string]> = [
    [0, "nano"],
    [24_999, "nano"],
    [25_000, "micro"],
    [99_999, "micro"],
    [100_000, "mid"],
    [249_999, "mid"],
    [250_000, "macro"],
    [5_000_000, "macro"],
  ];
  for (const [followers, expected] of cases) {
    assert.equal(resolveTier(followers)?.key, expected, `followers=${followers}`);
  }
});

test("resolveTier: tier desconocido con followers no válidos", () => {
  assert.equal(resolveTier(undefined), null);
  assert.equal(resolveTier(-5), null);
  assert.equal(resolveTier(Number.NaN), null);
  assert.equal(resolveTier(Number.POSITIVE_INFINITY), null);
});

// ─── Paridad con el drawer (drawer-partner.html) ──────────────────────────

test("paridad drawer: @finanzasconlucia → 87 con desglose 92/88/95/84/76", () => {
  const result = computeQualityScore(seed("@finanzasconlucia").metrics);
  assert.equal(result.total, 87);
  assert.deepEqual(componentScores(result), {
    erVsTier: 92,
    authenticity: 88,
    sectorFit: 95,
    audienceEs: 84,
    consistency: 76,
  });
  assert.equal(result.tier, "mid");
  assert.equal(result.erBenchmarkPct, 4.0);
  assert.equal(result.band, "high");
  assert.deepEqual(result.missingSignals, []);
  const fit = result.components.find((c) => c.key === "sectorFit");
  assert.ok(fit && fit.note.includes("Revolut 2×"), "la nota cita el repeat de Revolut");
  assert.ok(fit && fit.note.includes("revealed preference"), "la nota cita revealed preference");
});

// ─── Calibración sobre los seeds del mockup ───────────────────────────────

test("calibración: los 9 seeds reproducen la columna quality del mockup", () => {
  for (const s of SEED_CREATORS) {
    const result = computeQualityScore(s.metrics);
    assert.equal(
      result.total,
      s.expectedQuality,
      `${s.metrics.handle}: esperado ${s.expectedQuality}, obtenido ${result.total}`,
    );
  }
});

test("calibración: anclas del plan (@elinversorprudente≈91, @cuentasclaras_es≈58)", () => {
  assert.equal(computeQualityScore(seed("@elinversorprudente").metrics).total, 91);
  assert.equal(computeQualityScore(seed("@cuentasclaras_es").metrics).total, 58);
});

test("calibración: el ranking relativo de los seeds se respeta", () => {
  const ranked = SEED_CREATORS.map((s) => ({
    handle: s.metrics.handle,
    total: computeQualityScore(s.metrics).total,
  }))
    .sort((a, b) => b.total - a.total)
    .map((r) => r.handle);
  assert.deepEqual(ranked, [
    "@elinversorprudente",
    "@money_pau",
    "@finanzasconlucia",
    "@davidfintech",
    "@lauraylasfinanzas",
    "@ahorroconmarta",
    "@cuentasclaras_es",
    "@cuentasclaras_es2",
    "@pelotazo_cripto",
  ]);
});

test("bandas: paridad con qClass de la lista (≥85 high · ≥70 medium · resto low)", () => {
  assert.equal(scoreBand(85), "high");
  assert.equal(scoreBand(84), "medium");
  assert.equal(scoreBand(70), "medium");
  assert.equal(scoreBand(69), "low");
  const bands = SEED_CREATORS.map((s) => computeQualityScore(s.metrics).band);
  const byHandle = Object.fromEntries(SEED_CREATORS.map((s, i) => [s.metrics.handle, bands[i]]));
  assert.equal(byHandle["@elinversorprudente"], "high");
  assert.equal(byHandle["@ahorroconmarta"], "medium");
  assert.equal(byHandle["@pelotazo_cripto"], "low");
});

test("umbral hybrid: @pelotazo_cripto (31) cae, @cuentasclaras_es2 (52) no", () => {
  assert.equal(isBelowQualificationThreshold(31), true);
  assert.equal(isBelowQualificationThreshold(52), false);
  // El umbral es estricto: 40 NO se descarta, 39 sí.
  assert.equal(isBelowQualificationThreshold(40), false);
  assert.equal(isBelowQualificationThreshold(39), true);
});

// ─── Umbrales del componente ER vs tier ───────────────────────────────────

test("ER vs tier: en el benchmark exacto → 75; muy por encima → cap 100", () => {
  // @lauraylasfinanzas: 67K (micro, benchmark 5.5) con ER 5.5 → exactamente 75.
  const atBenchmark = scoreErVsTier({ followers: 67_000, engagementRatePct: 5.5 });
  assert.equal(atBenchmark.score, 75);
  // @money_pau: 510K (macro, benchmark 2.5) con ER 4.0 (ratio 1.6) → cap 100.
  const aboveCap = scoreErVsTier({ followers: 510_000, engagementRatePct: 4.0 });
  assert.equal(aboveCap.score, 100);
});

test("edge ER 0: señal real (score 0), no dato ausente", () => {
  const component = scoreErVsTier({ followers: 50_000, engagementRatePct: 0 });
  assert.equal(component.score, 0);
  assert.equal(component.missingData, false);
});

test("edge tier desconocido: neutro 50 + flag, sin NaN en el total", () => {
  const result = computeQualityScore({ engagementRatePct: 4.5 });
  const er = result.components.find((c) => c.key === "erVsTier");
  assert.ok(er);
  assert.equal(er.score, NEUTRAL_SCORE);
  assert.equal(er.missingData, true);
  assert.equal(result.tier, null);
  assert.equal(result.tierLabel, null);
  assert.equal(result.erBenchmarkPct, null);
  assert.ok(result.missingSignals.includes("followers"));
  assert.ok(Number.isFinite(result.total));
});

// ─── Sector fit & track record ────────────────────────────────────────────

test("edge sin ad-library: sin bonus de track record + señal ausente anotada", () => {
  const signals = {
    verticalMatchShare: 1,
    // repeat presente pero NO verificable: la ad-library no se consultó.
    competitorPromos: [{ brand: "Revolut", count: 2 }],
  };
  const withoutAdLibrary = scoreSectorFit({ ...signals, adLibraryChecked: false });
  assert.equal(withoutAdLibrary.score, 70);
  assert.ok(withoutAdLibrary.note.includes("Sin datos de ad-library"));
  const withAdLibrary = scoreSectorFit({ ...signals, adLibraryChecked: true });
  assert.equal(withAdLibrary.score, 95);

  const result = computeQualityScore({
    followers: 142_000,
    engagementRatePct: 4.8,
    signals: { ...signals, adLibraryChecked: false },
  });
  assert.ok(result.missingSignals.includes("adLibrary"));
});

test("sector fit: 1 promo sin repeat → bonus parcial (+12)", () => {
  const single = scoreSectorFit({
    verticalMatchShare: 1,
    adLibraryChecked: true,
    competitorPromos: [{ brand: "N26", count: 1 }],
  });
  assert.equal(single.score, 82); // 70 + 12
});

test("sector fit: conflicto activo penaliza −30", () => {
  const conflicted = scoreSectorFit({
    verticalMatchShare: 1,
    adLibraryChecked: true,
    competitorPromos: [{ brand: "Revolut", count: 2 }],
    activeConflict: true,
  });
  assert.equal(conflicted.score, 65); // 70 + 25 − 30
  assert.ok(conflicted.note.includes("Conflicto activo"));
});

// ─── Robustez: datos vacíos, clamps y pesos ───────────────────────────────

test("edge métricas vacías: todo neutro 50, banda low, señales ausentes listadas", () => {
  const result = computeQualityScore({});
  assert.equal(result.total, 50);
  assert.equal(result.band, "low");
  for (const component of result.components) {
    assert.equal(component.score, NEUTRAL_SCORE, component.key);
  }
  for (const expected of [
    "followers",
    "engagementRate",
    "fakeFollowers",
    "verticalMatch",
    "adLibrary",
    "spanishAudience",
    "postsPerWeek",
  ]) {
    assert.ok(result.missingSignals.includes(expected), `falta ${expected}`);
  }
});

test("clamps: entradas absurdas no salen del rango 0-100", () => {
  const result = computeQualityScore({
    followers: 88_000,
    engagementRatePct: 50, // ratio descomunal → cap 100
    signals: {
      fakeFollowersPct: 200, // → autenticidad 0
      verticalMatchShare: 1.5, // se trata como 1
      adLibraryChecked: false,
      spanishAudiencePct: 250, // se trata como 100
      cetAlignmentPct: 400, // se trata como 100
      postsPerWeek: 3,
      longGapsLast6Months: 20, // → consistencia 0
    },
  });
  for (const component of result.components) {
    assert.ok(component.score >= 0 && component.score <= 100, component.key);
  }
  const map = componentScores(result);
  assert.equal(map.erVsTier, 100);
  assert.equal(map.authenticity, 0);
  assert.equal(map.sectorFit, 70);
  assert.equal(map.audienceEs, 100);
  assert.equal(map.consistency, 0);
});

test("pesos configurables: se normalizan aunque no sumen 1", () => {
  const config = {
    ...DEFAULT_CREATOR_MODEL_CONFIG,
    weights: { erVsTier: 2, authenticity: 1, sectorFit: 1, audienceEs: 1, consistency: 1 },
  };
  const result = computeQualityScore(seed("@finanzasconlucia").metrics, config);
  // comps 92/88/95/84/76 → 92·(2/6) + (88+95+84+76)·(1/6) = 87.83 → 88
  assert.equal(result.total, 88);
  const er = result.components.find((c) => c.key === "erVsTier");
  assert.ok(er && Math.abs(er.weight - 2 / 6) < 1e-9);
});

test("pesos degenerados (todo 0) → reparto igual, sin NaN", () => {
  const config = {
    ...DEFAULT_CREATOR_MODEL_CONFIG,
    weights: { erVsTier: 0, authenticity: 0, sectorFit: 0, audienceEs: 0, consistency: 0 },
  };
  const result = computeQualityScore(seed("@finanzasconlucia").metrics, config);
  assert.equal(result.total, 87);
});

test("config editable (camino SAN-76): cambiar el benchmark mueve el componente ER", () => {
  const config = {
    ...DEFAULT_CREATOR_MODEL_CONFIG,
    tiers: DEFAULT_CREATOR_MODEL_CONFIG.tiers.map((tier) =>
      tier.key === "mid" ? { ...tier, erBenchmarkPct: 2.0 } : tier,
    ),
  };
  const result = computeQualityScore(seed("@finanzasconlucia").metrics, config);
  const er = result.components.find((c) => c.key === "erVsTier");
  assert.ok(er);
  assert.equal(er.score, 100); // ratio 4.8/2.0 = 2.4 → cap
  assert.equal(result.total, 89); // (100+88+95+84+76)/5 = 88.6 → 89
});
