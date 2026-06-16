/**
 * calc-creator-core · motor de BREAK-EVEN (SAN-75, pasada B · Ola 2)
 *
 * Le da la vuelta a la calc: no predice cuánto traerá el creator, sino
 * CUÁNTO debe producir para salir rentable a tu CAC objetivo.
 *
 * Espejo EXACTO del `<script>` de `drawer-partner.html` (spec de comportamiento):
 *  - Solo fijo:        necesarias = fee / CAC_objetivo
 *  - Fijo + variable:  necesarias = fee / (CAC_objetivo − CPA_variable)
 *                      (CPA ≥ CAC → estructura rota: ∞ necesarias, INVIABLE)
 *  - Alcanzable: followers × alcance 30%/post × posts × CTR(formato) ×
 *                ajuste ER (ER/benchmark) × funnel (signup × KYC × first_tx)
 *                × multiplicador de incentivo (×1/×1.5/×2/×3) — el
 *                multiplicador SOLO empuja el lado alcanzable.
 *  - Redondeos del mockup: necesarias = ceil · ratio sobre la necesaria YA
 *    redondeada · alcanzable se pinta con round · contraoferta = floor a la
 *    centena de alcanzable × (CAC − CPA var.).
 *  - Veredicto: verde ratio ≥ 1 · ámbar ≥ 0.6 · rojo < 0.6 · INVIABLE si rompe.
 *
 * Divergencias documentadas respecto al mockup:
 *  - `necesarias = 0` (fee 0): el mockup hace `attain/0` (Infinity → VIABLE,
 *    o NaN → NO VIABLE si attain también es 0 — artefacto JS). Aquí se
 *    normaliza: necesarias 0 ⇒ ratio Infinity ⇒ viable (un deal gratis no
 *    puede perder dinero).
 *  - El mockup fija el benchmark ER del nicho en 4.8 (= ER de Lucía → ajuste
 *    ×1,00). El motor acepta `erBenchmarkPct` explícito y, en su ausencia,
 *    usa el benchmark del tier de la config (Mid = 4.0 → ajuste ×1,20).
 */

import { DEFAULT_CREATOR_MODEL_CONFIG, resolveTier } from "./config";
import type {
  BreakEvenDeal,
  BreakEvenDealEcho,
  BreakEvenFunnel,
  BreakEvenFunnelStep,
  BreakEvenResult,
  BreakEvenVerdict,
  BreakEvenVerdictColor,
  CreatorModelConfig,
  DealFormat,
  DealStructure,
} from "./types";

/** Sellos del mockup por veredicto. */
export const BREAK_EVEN_VERDICT_LABELS: Record<BreakEvenVerdict, string> = {
  viable: "VIABLE",
  ajustado: "AJUSTADO",
  "no-viable": "NO VIABLE",
  inviable: "INVIABLE",
};

const VERDICT_COLORS: Record<BreakEvenVerdict, BreakEvenVerdictColor> = {
  viable: "green",
  ajustado: "amber",
  "no-viable": "red",
  inviable: "red",
};

const DEAL_FORMATS: readonly DealFormat[] = ["reel", "post", "story", "video", "carrusel"];

/** Alias aceptados → formato canónico (keys del select del mockup). */
const FORMAT_ALIASES: Record<string, DealFormat> = {
  reel: "reel",
  reels: "reel",
  post: "post",
  story: "story",
  stories: "story",
  video: "video",
  "video largo": "video",
  carrusel: "carrusel",
  carousel: "carrusel",
};

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

// ── Formato es-ES determinista (sin ICU): el mockup pinta "1.534", "3.500€",
// "1,2%", "×1,5" — agrupamos miles con "." siempre (como el diseño estático).
function fmtIntEs(value: number): string {
  const rounded = Math.round(value);
  const sign = rounded < 0 ? "-" : "";
  return sign + Math.abs(rounded).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

function fmtEur(value: number): string {
  return `${fmtIntEs(value)}€`;
}

/** Decimales con coma, sin ceros sobrantes (1.2 → "1,2" · 30 → "30"). */
function fmtDecEs(value: number, maxDecimals = 1): string {
  const fixed = value.toFixed(maxDecimals).replace(/\.?0+$/, "");
  return fixed.replace(".", ",");
}

/** Multiplicador estilo mockup: 1 → "×1" · 1.5 → "×1,5". */
function fmtMult(value: number): string {
  return `×${String(value).replace(".", ",")}`;
}

/** Followers compactos para la línea "Modelo:" (142000 → "142K"). */
function fmtFollowersCompact(value: number): string {
  if (value >= 1_000_000) return `${fmtDecEs(value / 1_000_000)}M`;
  if (value >= 1_000) return `${fmtDecEs(value / 1_000)}K`;
  return fmtIntEs(value);
}

/**
 * Normaliza un formato de deal a su key canónica (acepta alias y acentos).
 * Devuelve `null` si no se reconoce.
 */
export function normalizeDealFormat(format: string | undefined | null): DealFormat | null {
  if (format === undefined || format === null) return null;
  const cleaned = String(format)
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  return FORMAT_ALIASES[cleaned] ?? null;
}

function clamp(value: unknown, min: number, fallback: number): number {
  return Math.max(min, isFiniteNumber(value) ? value : fallback);
}

/** Override de % del funnel: undefined → config; inválido → TypeError. */
function resolvePct(name: string, override: number | undefined, seeded: number): number {
  if (override === undefined) return seeded;
  if (!isFiniteNumber(override) || override < 0) {
    throw new TypeError(`${name} debe ser un número finito ≥ 0 (en %); recibido: ${String(override)}`);
  }
  return override;
}

interface ErAdjustment {
  value: number;
  benchmarkPct: number | null;
  missingSignals: string[];
}

/** Ajuste ER = ER/benchmark; sin señal → neutro ×1 + flag (nunca NaN). */
function resolveErAdjustment(
  funnel: BreakEvenFunnel,
  config: CreatorModelConfig,
): ErAdjustment {
  const missingSignals: string[] = [];
  const er = funnel.engagementRatePct;
  if (er !== undefined && (!isFiniteNumber(er) || er < 0)) {
    throw new TypeError(`engagementRatePct debe ser un número finito ≥ 0; recibido: ${String(er)}`);
  }
  let benchmark: number | null = null;
  if (funnel.erBenchmarkPct !== undefined) {
    if (!isFiniteNumber(funnel.erBenchmarkPct) || funnel.erBenchmarkPct <= 0) {
      throw new TypeError(
        `erBenchmarkPct debe ser un número finito > 0; recibido: ${String(funnel.erBenchmarkPct)}`,
      );
    }
    benchmark = funnel.erBenchmarkPct;
  } else {
    benchmark = resolveTier(funnel.followers, config.tiers)?.erBenchmarkPct ?? null;
    if (benchmark === null) missingSignals.push("erBenchmark");
  }

  if (er === undefined) {
    missingSignals.push("engagementRate");
    return { value: 1, benchmarkPct: benchmark, missingSignals };
  }
  if (benchmark === null) {
    return { value: 1, benchmarkPct: null, missingSignals };
  }
  return { value: er / benchmark, benchmarkPct: benchmark, missingSignals };
}

/**
 * Calcula el break-even de un deal con un creator. Determinista, sin efectos
 * secundarios. Lanza `TypeError` con entradas imposibles (followers/format).
 */
export function computeBreakEven(
  deal: BreakEvenDeal,
  funnel: BreakEvenFunnel,
  config: CreatorModelConfig = DEFAULT_CREATOR_MODEL_CONFIG,
): BreakEvenResult {
  const seed = config.breakEven;

  // ── Audiencia ──
  if (!isFiniteNumber(funnel.followers) || funnel.followers < 0) {
    throw new TypeError(
      `followers debe ser un número finito ≥ 0; recibido: ${String(funnel.followers)}`,
    );
  }
  const followers = funnel.followers;

  // ── Deal normalizado (clamps espejo del mockup) ──
  const posts = clamp(deal.posts, 1, 1);
  const feeEur = clamp(deal.feeEur, 0, 0);
  const targetCacEur = clamp(deal.targetCacEur ?? seed.defaultTargetCacEur, 1, 1);
  const structure: DealStructure = deal.structure === "mixto" ? "mixto" : "fijo";
  const variableCpaEur = structure === "mixto" ? clamp(deal.variableCpaEur, 0, 0) : null;
  const incentiveMultiplier =
    isFiniteNumber(deal.incentiveMultiplier) && deal.incentiveMultiplier > 0
      ? deal.incentiveMultiplier
      : 1;

  const format = deal.format === undefined ? "reel" : normalizeDealFormat(String(deal.format));
  if (format === null) {
    throw new TypeError(
      `Formato de deal desconocido: "${String(deal.format)}". Válidos: ${DEAL_FORMATS.join(", ")} (alias: vídeo, video largo, carousel).`,
    );
  }
  const ctrPct = seed.ctrByFormatPct[format];

  // ── Tasas del funnel (overrides → config sembrada) ──
  const reachRatePct = resolvePct("reachRatePct", funnel.reachRatePct, seed.reachRatePct);
  const clickToSignupPct = resolvePct(
    "clickToSignupPct",
    funnel.clickToSignupPct,
    seed.clickToSignupPct,
  );
  const signupToKycPct = resolvePct("signupToKycPct", funnel.signupToKycPct, seed.signupToKycPct);
  const kycToFirstTxPct = resolvePct(
    "kycToFirstTxPct",
    funnel.kycToFirstTxPct,
    seed.kycToFirstTxPct,
  );

  // ── NECESARIAS (las fórmulas, tal cual el mockup) ──
  let necesariasExactas: number;
  let formulaNecesarias: string;
  let structureBroken = false;
  if (structure === "fijo") {
    necesariasExactas = feeEur / targetCacEur;
    formulaNecesarias = `${fmtEur(feeEur)} ÷ ${fmtEur(targetCacEur)} CAC`;
  } else if ((variableCpaEur as number) >= targetCacEur) {
    structureBroken = true;
    necesariasExactas = Infinity;
    formulaNecesarias = "CPA variable ≥ CAC objetivo";
  } else {
    necesariasExactas = feeEur / (targetCacEur - (variableCpaEur as number));
    formulaNecesarias = `${fmtEur(feeEur)} ÷ (${fmtEur(targetCacEur)} − ${fmtEur(variableCpaEur as number)} CPA var.)`;
  }
  const necesarias = structureBroken ? Infinity : Math.ceil(necesariasExactas);

  // ── ALCANZABLES: base × multiplicador (el incentivo empuja SOLO este lado) ──
  const erAdj = resolveErAdjustment(funnel, config);
  const reach = followers * (reachRatePct / 100) * posts;
  const clicks = reach * (ctrPct / 100) * erAdj.value;
  const signups = clicks * (clickToSignupPct / 100);
  const kycs = signups * (signupToKycPct / 100);
  const alcanzableBase = kycs * (kycToFirstTxPct / 100);
  const alcanzable = alcanzableBase * incentiveMultiplier;

  // ── RATIO + VEREDICTO (ratio sobre la necesaria YA redondeada, como el mockup) ──
  let ratio: number;
  if (structureBroken) {
    ratio = 0;
  } else if (necesarias === 0) {
    ratio = Infinity; // normalización documentada (mockup: Infinity o NaN)
  } else {
    ratio = alcanzable / necesarias;
  }

  let veredicto: BreakEvenVerdict;
  if (structureBroken) veredicto = "inviable";
  else if (ratio >= seed.verdict.viableMinRatio) veredicto = "viable";
  else if (ratio >= seed.verdict.tightMinRatio) veredicto = "ajustado";
  else veredicto = "no-viable";
  const veredictoLabel = BREAK_EVEN_VERDICT_LABELS[veredicto];
  const veredictoColor = VERDICT_COLORS[veredicto];

  const frase = structureBroken
    ? `El CPA variable (${fmtEur(variableCpaEur as number)}) iguala o supera el CAC objetivo (${fmtEur(targetCacEur)}) — cada conversión pierde dinero. Reestructura el deal.`
    : `Necesita ${fmtIntEs(necesarias)} first_tx · alcanzable ~${fmtIntEs(alcanzable)} → ${veredictoLabel}` +
      (veredicto === "viable"
        ? ""
        : veredicto === "ajustado"
          ? " · negocia precio o sube incentivo"
          : " · muy lejos del break-even");

  // ── CONTRAOFERTA: alcanzable × unidad, floor a la centena ──
  const counterUnit = structure === "fijo" ? targetCacEur : Math.max(0, targetCacEur - (variableCpaEur as number));
  const contraofertaEur = structureBroken
    ? null
    : Math.floor((alcanzable * counterUnit) / 100) * 100;
  const contraofertaNota =
    structure === "fijo"
      ? "(precio máx. = alcanzable × CAC objetivo, redondeado)"
      : "(precio máx. fijo = alcanzable × (CAC − CPA var.), redondeado)";

  // ── Desglose paso a paso (filas de la calc del drawer) ──
  const funnelSteps: BreakEvenFunnelStep[] = [
    {
      key: "audience",
      label: "Audiencia",
      value: followers,
      rounded: Math.round(followers),
      detail: `${fmtIntEs(followers)} seguidores`,
    },
    {
      key: "reach",
      label: "Alcance",
      value: reach,
      rounded: Math.round(reach),
      detail: `×${fmtDecEs(reachRatePct)}% alcance × ${fmtIntEs(posts)} posts`,
    },
    {
      key: "clicks",
      label: "Clicks",
      value: clicks,
      rounded: Math.round(clicks),
      detail: `CTR ${fmtDecEs(ctrPct)}% × ajuste ER ×${erAdj.value.toFixed(2).replace(".", ",")}`,
    },
    {
      key: "signups",
      label: "Signups",
      value: signups,
      rounded: Math.round(signups),
      detail: `×${fmtDecEs(clickToSignupPct)}% signup`,
    },
    {
      key: "kycs",
      label: "KYC",
      value: kycs,
      rounded: Math.round(kycs),
      detail: `×${fmtDecEs(signupToKycPct)}% KYC`,
    },
    {
      key: "firstTx",
      label: "First_tx (base)",
      value: alcanzableBase,
      rounded: Math.round(alcanzableBase),
      detail: `×${fmtDecEs(kycToFirstTxPct)}% first_tx`,
    },
    {
      key: "incentive",
      label: "Con incentivo",
      value: alcanzable,
      rounded: Math.round(alcanzable),
      detail: `${fmtMult(incentiveMultiplier)} incentivo`,
    },
  ];

  // Línea "Modelo:" del funnel-mini del mockup, generalizada a los inputs.
  const modelo =
    `Modelo: ${fmtIntEs(posts)} posts × alcance ~${fmtDecEs(reachRatePct)}% de ` +
    `${fmtFollowersCompact(followers)} seguidores → ${fmtIntEs(clicks)} clicks ` +
    `(CTR ${fmtDecEs(ctrPct)}%, ajuste ER ×${erAdj.value.toFixed(2).replace(".", ",")}) → ` +
    `signup ${fmtDecEs(clickToSignupPct)}% → KYC ${fmtDecEs(signupToKycPct)}% → ` +
    `first_tx ${fmtDecEs(kycToFirstTxPct)}%`;

  const dealEcho: BreakEvenDealEcho = {
    posts,
    format,
    ctrPct,
    feeEur,
    perPostEur: posts > 0 ? feeEur / posts : 0,
    structure,
    variableCpaEur,
    targetCacEur,
    incentiveMultiplier,
  };

  return {
    deal: dealEcho,
    necesarias,
    necesariasExactas,
    formulaNecesarias,
    structureBroken,
    erAdjustment: erAdj.value,
    clicks,
    alcanzableBase,
    alcanzable,
    ratio,
    veredicto,
    veredictoLabel,
    veredictoColor,
    frase,
    contraofertaEur,
    contraofertaNota,
    modelo,
    funnel: funnelSteps,
    missingSignals: erAdj.missingSignals,
  };
}
