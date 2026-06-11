import { test } from "node:test";
import assert from "node:assert/strict";
import * as calcCoreModule from "../index";
import * as mcpToolModule from "../mcp-tool";

const calcCore =
  (calcCoreModule as unknown as { default: typeof calcCoreModule }).default ?? calcCoreModule;
const mcpTool =
  (mcpToolModule as unknown as { default: typeof mcpToolModule }).default ?? mcpToolModule;

const { BREAK_EVEN_VERDICT_LABELS, DEFAULT_CREATOR_MODEL_CONFIG, computeBreakEven, normalizeDealFormat } =
  calcCore;
const { YALC_BREAKEVEN_TOOL_NAME, runYalcBreakeven } = mcpTool;

type BreakEvenResult = ReturnType<typeof computeBreakEven>;

function closeTo(actual: number, expected: number, eps = 1e-9): void {
  assert.ok(
    Math.abs(actual - expected) < eps,
    `esperado ≈${expected}, recibido ${actual} (Δ ${Math.abs(actual - expected)})`,
  );
}

// ── Caso de ORO: @finanzasconlucia, paridad EXACTA con drawer-partner.html ──
// Seed del mockup: 142K followers · ER 4.8 · ER_BENCH 4.8 (benchmark de nicho
// fijado en el <script> → ajuste ×1,00) · 3 reels · 3.500€ · CAC 80 ·
// funnel 8/60/70 · solo fijo · ×1.
// NOTA paridad: la calc HTML original de OUTPUTS/g4u-tools no existe en disco
// (directorio ausente) — el test de oro es este mockup, que es la spec viva.
const GOLD_DEAL = { posts: 3, format: "reel", feeEur: 3500, targetCacEur: 80 } as const;
const GOLD_FUNNEL = { followers: 142_000, engagementRatePct: 4.8, erBenchmarkPct: 4.8 } as const;

function gold(overrides: Record<string, unknown> = {}): BreakEvenResult {
  return computeBreakEven({ ...GOLD_DEAL, ...overrides }, GOLD_FUNNEL);
}

test("ORO mockup: necesita 44 · alcanzable ~52 · VIABLE · contraoferta 4.100€", () => {
  const r = gold();
  assert.equal(r.necesarias, 44); // ceil(3500/80 = 43.75)
  closeTo(r.necesariasExactas, 43.75);
  closeTo(r.alcanzableBase, 51.52896); // 142000×0.30×3×0.012×1.00×0.08×0.60×0.70
  closeTo(r.alcanzable, 51.52896);
  assert.equal(Math.round(r.alcanzable), 52); // el "~52" del drawer
  closeTo(r.ratio, 51.52896 / 44);
  assert.equal(r.veredicto, "viable");
  assert.equal(r.veredictoLabel, "VIABLE");
  assert.equal(r.veredictoColor, "green");
  assert.equal(r.contraofertaEur, 4100); // floor(51.52896×80/100)×100
  assert.equal(r.structureBroken, false);
  closeTo(r.erAdjustment, 1);
  closeTo(r.clicks, 1533.6);
  assert.deepEqual(r.missingSignals, []);
});

test("ORO mockup: textos espejo (fórmula, frase, modelo, €/post)", () => {
  const r = gold();
  assert.equal(r.formulaNecesarias, "3.500€ ÷ 80€ CAC");
  assert.equal(r.frase, "Necesita 44 first_tx · alcanzable ~52 → VIABLE");
  assert.equal(
    r.modelo,
    "Modelo: 3 posts × alcance ~30% de 142K seguidores → 1.534 clicks (CTR 1,2%, ajuste ER ×1,00) → signup 8% → KYC 60% → first_tx 70%",
  );
  assert.equal(r.contraofertaNota, "(precio máx. = alcanzable × CAC objetivo, redondeado)");
  closeTo(r.deal.perPostEur, 3500 / 3); // ≈ 1.167 €/post
  assert.equal(r.deal.ctrPct, 1.2);
  assert.equal(r.deal.format, "reel");
});

test("ORO mockup: desglose del funnel paso a paso (cadena completa)", () => {
  const r = gold();
  assert.deepEqual(
    r.funnel.map((s) => s.key),
    ["audience", "reach", "clicks", "signups", "kycs", "firstTx", "incentive"],
  );
  const [audience, reach, clicks, signups, kycs, firstTx, incentive] = r.funnel;
  assert.equal(audience.value, 142_000);
  closeTo(reach.value, 127_800); // ×30% × 3 posts
  closeTo(clicks.value, 1533.6); // ×CTR 1.2% × ajuste ER 1.00
  assert.equal(clicks.rounded, 1534);
  closeTo(signups.value, 122.688); // ×8%
  closeTo(kycs.value, 73.6128); // ×60%
  closeTo(firstTx.value, 51.52896); // ×70%
  assert.equal(firstTx.value, r.alcanzableBase);
  assert.equal(incentive.value, r.alcanzable);
  assert.equal(reach.detail, "×30% alcance × 3 posts");
  assert.equal(clicks.detail, "CTR 1,2% × ajuste ER ×1,00");
  assert.equal(incentive.detail, "×1 incentivo");
  for (const step of r.funnel) assert.equal(step.rounded, Math.round(step.value));
});

// ── Solo fijo vs fijo+variable ───────────────────────────────────────────

test("fijo+variable: necesita = fee/(CAC−CPA) → 64, AJUSTADO, contraoferta 2.800€", () => {
  const r = gold({ structure: "mixto", variableCpaEur: 25 });
  assert.equal(r.necesarias, 64); // ceil(3500/55 = 63.63…)
  closeTo(r.necesariasExactas, 3500 / 55);
  assert.equal(r.formulaNecesarias, "3.500€ ÷ (80€ − 25€ CPA var.)");
  closeTo(r.ratio, 51.52896 / 64); // 0.805…
  assert.equal(r.veredicto, "ajustado");
  assert.equal(r.veredictoColor, "amber");
  // contraoferta con unidad (CAC − CPA) = 55€: floor(51.52896×55/100)×100
  assert.equal(r.contraofertaEur, 2800);
  assert.equal(r.contraofertaNota, "(precio máx. fijo = alcanzable × (CAC − CPA var.), redondeado)");
  assert.equal(r.frase, "Necesita 64 first_tx · alcanzable ~52 → AJUSTADO · negocia precio o sube incentivo");
  assert.equal(r.deal.variableCpaEur, 25);
});

test("estructura fijo ignora variableCpaEur (echo null) y default structure = fijo", () => {
  const r = gold({ variableCpaEur: 25 });
  assert.equal(r.deal.structure, "fijo");
  assert.equal(r.deal.variableCpaEur, null);
  assert.equal(r.necesarias, 44);
});

// ── Multiplicador de incentivo: SOLO empuja lo alcanzable ────────────────

test("multiplicadores ×1/×1.5/×2/×3 escalan alcanzable, no necesarias", () => {
  const expectations = [
    { mult: 1, alcanzable: 51.52896, contra: 4100 },
    { mult: 1.5, alcanzable: 77.29344, contra: 6100 },
    { mult: 2, alcanzable: 103.05792, contra: 8200 },
    { mult: 3, alcanzable: 154.58688, contra: 12300 },
  ];
  for (const { mult, alcanzable, contra } of expectations) {
    const r = gold({ incentiveMultiplier: mult });
    assert.equal(r.necesarias, 44, `necesarias no depende del multiplicador (×${mult})`);
    closeTo(r.alcanzableBase, 51.52896);
    closeTo(r.alcanzable, alcanzable);
    assert.equal(r.contraofertaEur, contra);
    assert.equal(r.deal.incentiveMultiplier, mult);
  }
  // ×1.5 cruza a verde con un deal ajustado: fee 4500 → 57 necesarias.
  const amber = gold({ feeEur: 4500 });
  assert.equal(amber.veredicto, "ajustado");
  const green = gold({ feeEur: 4500, incentiveMultiplier: 1.5 });
  assert.equal(green.veredicto, "viable");
});

// ── Veredictos: los 3 colores + INVIABLE ─────────────────────────────────

test("veredicto verde: ratio ≥ 1 (caso de oro)", () => {
  const r = gold();
  assert.ok(r.ratio >= 1);
  assert.deepEqual([r.veredicto, r.veredictoColor], ["viable", "green"]);
});

test("veredicto ámbar: 0.6 ≤ ratio < 1 (fee 4.500€ → 57 necesarias)", () => {
  const r = gold({ feeEur: 4500 });
  closeTo(r.ratio, 51.52896 / 57); // 0.904…
  assert.deepEqual([r.veredicto, r.veredictoLabel, r.veredictoColor], ["ajustado", "AJUSTADO", "amber"]);
  assert.ok(r.frase.endsWith("→ AJUSTADO · negocia precio o sube incentivo"));
});

test("veredicto rojo: ratio < 0.6 (fee 7.000€ → 88 necesarias)", () => {
  const r = gold({ feeEur: 7000 });
  closeTo(r.ratio, 51.52896 / 88); // 0.585…
  assert.deepEqual([r.veredicto, r.veredictoLabel, r.veredictoColor], ["no-viable", "NO VIABLE", "red"]);
  assert.ok(r.frase.endsWith("→ NO VIABLE · muy lejos del break-even"));
});

test("labels canónicos del sello", () => {
  assert.deepEqual(BREAK_EVEN_VERDICT_LABELS, {
    viable: "VIABLE",
    ajustado: "AJUSTADO",
    "no-viable": "NO VIABLE",
    inviable: "INVIABLE",
  });
});

// ── Edges ────────────────────────────────────────────────────────────────

test("edge: CPA variable ≥ CAC → estructura rota, ∞ necesarias, INVIABLE, sin contraoferta", () => {
  for (const cpa of [80, 100]) {
    const r = gold({ structure: "mixto", variableCpaEur: cpa });
    assert.equal(r.structureBroken, true);
    assert.equal(r.necesarias, Infinity);
    assert.equal(r.necesariasExactas, Infinity);
    assert.equal(r.ratio, 0);
    assert.deepEqual([r.veredicto, r.veredictoLabel, r.veredictoColor], ["inviable", "INVIABLE", "red"]);
    assert.equal(r.contraofertaEur, null);
    assert.equal(r.formulaNecesarias, "CPA variable ≥ CAC objetivo");
    assert.equal(
      r.frase,
      `El CPA variable (${cpa}€) iguala o supera el CAC objetivo (80€) — cada conversión pierde dinero. Reestructura el deal.`,
    );
  }
});

test("edge: fee 0 → necesarias 0, ratio ∞, viable (normalización documentada del mockup)", () => {
  const r = gold({ feeEur: 0 });
  assert.equal(r.necesarias, 0);
  assert.equal(r.ratio, Infinity);
  assert.equal(r.veredicto, "viable");
  assert.equal(r.contraofertaEur, 4100); // la contraoferta no depende del fee
  // fee 0 + ER 0 (mockup daría NaN → NO VIABLE, artefacto JS; aquí viable):
  const both = computeBreakEven(
    { ...GOLD_DEAL, feeEur: 0 },
    { ...GOLD_FUNNEL, engagementRatePct: 0 },
  );
  assert.equal(both.ratio, Infinity);
  assert.equal(both.veredicto, "viable");
});

test("edge: ER 0 → ajuste 0, alcanzable 0, NO VIABLE, contraoferta 0€", () => {
  const r = computeBreakEven(GOLD_DEAL, { ...GOLD_FUNNEL, engagementRatePct: 0 });
  assert.equal(r.erAdjustment, 0);
  assert.equal(r.alcanzable, 0);
  assert.equal(r.ratio, 0);
  assert.deepEqual([r.veredicto, r.veredictoColor], ["no-viable", "red"]);
  assert.equal(r.contraofertaEur, 0);
});

test("ER ausente → ajuste neutro ×1 + señal 'engagementRate'", () => {
  const r = computeBreakEven(GOLD_DEAL, { followers: 142_000 });
  assert.equal(r.erAdjustment, 1);
  assert.ok(r.missingSignals.includes("engagementRate"));
  closeTo(r.alcanzable, 51.52896); // mismo resultado que ajuste ×1,00
});

test("sin erBenchmarkPct usa el benchmark del tier (Mid 4.0 → ajuste ×1,20)", () => {
  // Documentado: el mockup fija el benchmark del nicho en 4.8 (ajuste ×1,00);
  // sin él, el motor cae al benchmark del tier de la config.
  const r = computeBreakEven(GOLD_DEAL, { followers: 142_000, engagementRatePct: 4.8 });
  closeTo(r.erAdjustment, 4.8 / 4.0);
  closeTo(r.alcanzable, 51.52896 * 1.2); // 61.834752
  assert.equal(r.veredicto, "viable");
});

test("config sin tier resoluble → ajuste ×1 + señal 'erBenchmark'", () => {
  const config = { ...DEFAULT_CREATOR_MODEL_CONFIG, tiers: [] };
  const r = computeBreakEven(GOLD_DEAL, { followers: 142_000, engagementRatePct: 4.8 }, config);
  assert.equal(r.erAdjustment, 1);
  assert.ok(r.missingSignals.includes("erBenchmark"));
});

// ── Deal editable: formatos y clamps ─────────────────────────────────────

test("CTR por formato configurable: story 0.6% reduce clicks a la mitad de reel", () => {
  const reel = gold();
  const story = gold({ format: "story" });
  closeTo(story.clicks, reel.clicks / 2); // 1.2% → 0.6%
  closeTo(story.alcanzableBase, 25.76448);
  assert.equal(story.deal.ctrPct, 0.6);
  const video = gold({ format: "video" });
  closeTo(video.clicks, 127_800 * 0.014);
});

test("normalizeDealFormat: alias del settings/mockup y desconocidos", () => {
  assert.equal(normalizeDealFormat("reel"), "reel");
  assert.equal(normalizeDealFormat("REELS "), "reel");
  assert.equal(normalizeDealFormat("Vídeo"), "video");
  assert.equal(normalizeDealFormat("video largo"), "video"); // format de settings.html
  assert.equal(normalizeDealFormat("carousel"), "carrusel");
  assert.equal(normalizeDealFormat("stories"), "story");
  assert.equal(normalizeDealFormat("podcast"), null);
  assert.equal(normalizeDealFormat(undefined), null);
});

test("formato: default reel, alias 'video largo' acepta, desconocido lanza TypeError", () => {
  const noFormat = computeBreakEven({ posts: 3, feeEur: 3500, targetCacEur: 80 }, GOLD_FUNNEL);
  assert.equal(noFormat.deal.format, "reel");
  const largo = gold({ format: "video largo" });
  assert.equal(largo.deal.format, "video");
  assert.equal(largo.deal.ctrPct, 1.4);
  assert.throws(() => gold({ format: "podcast" }), /Formato de deal desconocido/);
});

test("clamps espejo del mockup: posts ≥1 · fee ≥0 · CAC ≥1 · CPA ≥0 · mult inválido → 1", () => {
  const r = computeBreakEven(
    {
      posts: 0,
      feeEur: -500,
      targetCacEur: 0,
      structure: "mixto",
      variableCpaEur: -10,
      incentiveMultiplier: 0,
    },
    GOLD_FUNNEL,
  );
  assert.equal(r.deal.posts, 1);
  assert.equal(r.deal.feeEur, 0);
  assert.equal(r.deal.targetCacEur, 1);
  assert.equal(r.deal.variableCpaEur, 0);
  assert.equal(r.deal.incentiveMultiplier, 1);
  // CAC default de la config cuando no se pasa:
  const def = computeBreakEven({ posts: 3, feeEur: 3500 }, GOLD_FUNNEL);
  assert.equal(def.deal.targetCacEur, 80);
});

test("entradas imposibles lanzan TypeError (followers/ER/benchmark/overrides)", () => {
  assert.throws(() => computeBreakEven(GOLD_DEAL, { followers: NaN }), TypeError);
  assert.throws(() => computeBreakEven(GOLD_DEAL, { followers: -5 }), TypeError);
  assert.throws(
    () => computeBreakEven(GOLD_DEAL, { ...GOLD_FUNNEL, engagementRatePct: -1 }),
    TypeError,
  );
  assert.throws(() => computeBreakEven(GOLD_DEAL, { ...GOLD_FUNNEL, erBenchmarkPct: 0 }), TypeError);
  assert.throws(() => computeBreakEven(GOLD_DEAL, { ...GOLD_FUNNEL, reachRatePct: -3 }), TypeError);
});

test("overrides del funnel se aplican (reach 15% → mitad de alcanzable)", () => {
  const r = computeBreakEven(GOLD_DEAL, { ...GOLD_FUNNEL, reachRatePct: 15 });
  closeTo(r.alcanzableBase, 51.52896 / 2);
  const funnelTight = computeBreakEven(GOLD_DEAL, { ...GOLD_FUNNEL, clickToSignupPct: 4 });
  closeTo(funnelTight.alcanzableBase, 51.52896 / 2);
});

// ── Tool MCP `yalc_breakeven` (wrapper fino, lógica pura sin transporte) ──

test("yalc_breakeven: deal+funnel explícitos reproducen el caso de oro", async () => {
  assert.equal(YALC_BREAKEVEN_TOOL_NAME, "yalc_breakeven");
  const payload = await runYalcBreakeven({
    clientSlug: "monzo",
    posts: 3,
    format: "reel",
    feeEur: 3500,
    targetCacEur: 80,
    followers: 142_000,
    engagementRatePct: 4.8,
    erBenchmarkPct: 4.8,
  });
  assert.equal(payload.ok, true);
  assert.equal(payload.lead, null);
  const breakeven = payload.breakeven as BreakEvenResult;
  assert.equal(breakeven.necesarias, 44);
  assert.equal(Math.round(breakeven.alcanzable), 52);
  assert.equal(breakeven.veredictoLabel, "VIABLE");
  assert.equal(breakeven.contraofertaEur, 4100);
});

test("yalc_breakeven: leadId lee followers/ER vía Yalc (SAN-77) y ecoa el lead", async () => {
  const calls: string[] = [];
  const payload = await runYalcBreakeven(
    {
      clientSlug: "monzo",
      leadId: "lead-lucia",
      posts: 3,
      feeEur: 3500,
      targetCacEur: 80,
      erBenchmarkPct: 4.8,
    },
    async (clientSlug, leadId) => {
      calls.push(`${clientSlug}/${leadId}`);
      return { followers: 142_000, engagementRatePct: 4.8, handle: "@finanzasconlucia" };
    },
  );
  assert.deepEqual(calls, ["monzo/lead-lucia"]);
  assert.deepEqual(payload.lead, { id: "lead-lucia", handle: "@finanzasconlucia" });
  const breakeven = payload.breakeven as BreakEvenResult;
  assert.equal(breakeven.necesarias, 44);
  assert.equal(breakeven.veredicto, "viable");
});

test("yalc_breakeven: followers/ER explícitos evitan la lectura del lead", async () => {
  const payload = await runYalcBreakeven(
    {
      clientSlug: "monzo",
      leadId: "lead-lucia",
      followers: 142_000,
      engagementRatePct: 4.8,
      erBenchmarkPct: 4.8,
      posts: 3,
      feeEur: 3500,
      targetCacEur: 80,
    },
    async () => {
      throw new Error("no debería llamarse: followers y ER vienen explícitos");
    },
  );
  assert.equal(payload.ok, true);
  assert.equal((payload.breakeven as BreakEvenResult).necesarias, 44);
});

test("yalc_breakeven: errores explicativos sin lector de leads o sin followers", async () => {
  await assert.rejects(
    runYalcBreakeven({ clientSlug: "monzo", leadId: "x", posts: 1, feeEur: 100 }),
    /requires SAN-77 Yalc lead endpoints/,
  );
  await assert.rejects(
    runYalcBreakeven({ clientSlug: "monzo", posts: 1, feeEur: 100 }),
    /Provide either followers or leadId/,
  );
  await assert.rejects(
    runYalcBreakeven(
      { clientSlug: "monzo", leadId: "lead-sin-metricas", posts: 1, feeEur: 100 },
      async () => ({ followers: null, engagementRatePct: null, handle: null }),
    ),
    /has no followers metric/,
  );
});
