/**
 * negotiation-assist (SAN-80) · detección de precio + análisis — lógica PURA.
 *
 * Sobre cada reply entrante el Inbox detecta cantidades en € (formatos
 * es-ES) y dispara el panel "Sancho ha detectado un precio" con el
 * break-even REAL de `calc-creator-core` (necesarias vs alcanzable,
 * veredicto, contraoferta). El mismo cálculo alimenta la calc del drawer.
 *
 * PARIDAD con los mockups (decisión SAN-75b): el benchmark de ER del nicho
 * está fijado en 4.8 (= ER de @finanzasconlucia → ajuste ×1,00). El motor
 * sin benchmark explícito caería al del tier (Mid 4.0 → ~62 alcanzables en
 * vez de ~52); las superficies de SAN-80 pasan SIEMPRE este valor hasta que
 * SAN-76 lo haga editable en Settings.
 *
 * CLIENT-SAFE: importa solo calc-creator-core (TS puro).
 */

import { computeBreakEven } from "@/lib/calc-creator-core";
import type { BreakEvenResult } from "@/lib/calc-creator-core";

/** Benchmark ER del nicho fintech-ES de los mockups (settings de SAN-76 lo hará editable). */
export const NICHE_ER_BENCHMARK_PCT = 4.8;

// ── Detección de precios en texto (formatos es-ES) ──────────────────────────

export interface DetectedPrice {
  /** Cantidad en euros. */
  amountEur: number;
  /** Texto original que dio el match ("3.500€", "2k €", "950 euros"). */
  raw: string;
  /** Posición del match (para resaltar). */
  index: number;
}

// "3.500€" · "3.500 €" · "€3500" · "1.200,50 €" · "950 euros" · "2k€" · "2,5k €"
const PRICE_PATTERN =
  /(?:€\s*([\d.,]+[\d])\s*(k)?|([\d.,]*\d)\s*(k)?\s*(?:€|euros?\b))/gi;

function parseEsAmount(raw: string, thousands: boolean): number | null {
  let text = raw.trim();
  if (!text) return null;
  // es-ES: '.' = miles, ',' = decimal. "3.500" → 3500 · "1.200,50" → 1200.5
  // Caso ambiguo "3.5" (sin más puntos): con sufijo k es decimal; sin k y con
  // grupo de 3 dígitos tras el punto = miles.
  const hasComma = text.includes(",");
  if (hasComma) {
    text = text.replace(/\./g, "").replace(",", ".");
  } else if (/\.\d{3}(?:\D|$)/.test(text + " ") && /^\d{1,3}(?:\.\d{3})+$/.test(text)) {
    text = text.replace(/\./g, "");
  } else if (thousands) {
    // "2.5k" → 2.5 (el punto es decimal)
  } else if (/^\d+\.\d{1,2}$/.test(text)) {
    // "3.5" sin k: demasiado ambiguo para un precio — se acepta como decimal.
  }
  const value = Number(text);
  if (!Number.isFinite(value)) return null;
  return thousands ? value * 1000 : value;
}

/**
 * Detecta precios en € dentro de un texto. Devuelve todos los matches en
 * orden de aparición; el panel usa el ÚLTIMO de la última reply entrante
 * (lo más cercano a la oferta vigente). Cantidades < 10€ se descartan
 * (ruido tipo "5€ de descuento" no es un fee de colaboración).
 */
export function detectPrices(text: string, minAmountEur = 10): DetectedPrice[] {
  const out: DetectedPrice[] = [];
  if (!text) return out;
  PRICE_PATTERN.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = PRICE_PATTERN.exec(text)) !== null) {
    const rawAmount = match[1] ?? match[3] ?? "";
    const isK = Boolean(match[2] || match[4]);
    const amount = parseEsAmount(rawAmount, isK);
    if (amount === null || amount < minAmountEur) continue;
    out.push({ amountEur: Math.round(amount * 100) / 100, raw: match[0].trim(), index: match.index });
  }
  return out;
}

/** Último precio detectado (la oferta sobre la mesa) o null. */
export function detectLatestPrice(text: string): DetectedPrice | null {
  const prices = detectPrices(text);
  return prices.length > 0 ? prices[prices.length - 1] : null;
}

// ── Break-even de negociación (mismo motor que el drawer) ───────────────────

export interface NegotiationCalcInput {
  feeEur: number;
  followers?: number | null;
  engagementRatePct?: number | null;
  posts?: number;
  format?: string;
  structure?: "fijo" | "mixto";
  variableCpaEur?: number;
  targetCacEur?: number;
  incentiveMultiplier?: number;
  /** Override del benchmark (default: NICHE_ER_BENCHMARK_PCT por paridad). */
  erBenchmarkPct?: number;
}

/** Wrapper fino del motor con los defaults de paridad del mockup. */
export function negotiationBreakEven(input: NegotiationCalcInput): BreakEvenResult {
  return computeBreakEven(
    {
      posts: input.posts ?? 3,
      format: input.format ?? "reel",
      feeEur: input.feeEur,
      structure: input.structure ?? "fijo",
      variableCpaEur: input.variableCpaEur,
      targetCacEur: input.targetCacEur,
      incentiveMultiplier: input.incentiveMultiplier ?? 1,
    },
    {
      followers: typeof input.followers === "number" ? input.followers : 0,
      engagementRatePct: input.engagementRatePct ?? undefined,
      erBenchmarkPct: input.erBenchmarkPct ?? NICHE_ER_BENCHMARK_PCT,
    },
  );
}

// ── "Insertar análisis en la respuesta" (párrafo P.D.) ──────────────────────

const PD_PATTERN = /\n\nP\.D\.[\s\S]*$/;

function fmtIntEs(value: number): string {
  const raw = String(Math.abs(Math.round(value)));
  let out = "";
  for (let i = 0; i < raw.length; i++) {
    const fromEnd = raw.length - i;
    out += raw[i];
    if (fromEnd > 1 && (fromEnd - 1) % 3 === 0) out += ".";
  }
  return (value < 0 ? "-" : "") + out;
}

/**
 * Añade (o sustituye) el párrafo P.D. con los números del break-even al
 * borrador — espejo de `insertAnalysis()` del mockup inbox.html, con los
 * valores del motor real.
 */
export function insertAnalysisParagraph(draft: string, result: BreakEvenResult): string {
  const fee = fmtIntEs(result.deal.feeEur);
  const cac = fmtIntEs(result.deal.targetCacEur);
  const nec = Number.isFinite(result.necesarias) ? fmtIntEs(result.necesarias) : "∞";
  const alc = fmtIntEs(Math.round(result.alcanzable));
  const paragraph =
    `\n\nP.D. Te comparto nuestros números para que veas que la propuesta va en serio: con un fee de ${fee}€ ` +
    `necesitaríamos ${nec} cuentas nuevas para cubrir coste (nuestro CAC objetivo es ${cac}€), y con tu audiencia ` +
    `estimamos ~${alc} alcanzables. ` +
    (result.veredicto === "viable"
      ? "Los números salen — la estructura solo busca alinear incentivos para que tú también ganes más si funciona."
      : "Con una parte variable por cuenta verificada los números cierran para los dos — por eso la propuesta mixta.");
  return draft.replace(PD_PATTERN, "") + paragraph;
}
