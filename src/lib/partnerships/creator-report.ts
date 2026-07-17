/**
 * Reporting por creator (SAN-81) · agregación PURA — cierra el loop.
 *
 * Vive en METRICS (decisión del plan: la conversión es métricas): para cada
 * creator con deal y performance, agrega el funnel real post-activación
 * (posts live → clicks → signups → KYC → first_tx) en la ventana seleccionada
 * días y lo compara con lo que predijo la calc:
 *
 *  - CPA real    = coste total (fee + variable×conv) ÷ conversiones.
 *  - Break-even  = CAC objetivo (para CUALQUIER estructura, el coste por
 *    conversión en el punto de break-even es exactamente el CAC objetivo;
 *    en deals fijos además CPA break-even = CAC, como anota el mockup).
 *  - Necesarias  = `computeBreakEven` de calc-creator-core con su deal
 *    (vía `negotiationBreakEven`, mismos defaults de paridad que el drawer).
 *  - ROI         = valor a CAC objetivo (conv × CAC ÷ coste total).
 *  - Feedback    = delta SUGERIDO de quality score por creator (el ajuste
 *    real del componente "Sector fit & track record" es Fase 2 / SAN-82):
 *    `clamp(round((roi_creator − roi_programa) × 2), −5, +5)`.
 *
 * Los datos de tracking REALES llegan en Fase 2 (Impact, SAN-82); hasta
 * entonces los registros de performance vienen del seed
 * (`performance-seeds.ts` + `scripts/seed-partnerships-demo.ts`).
 *
 * Paridad UI = chat = MCP: la UI llama a GET /api/partnerships/report y la
 * tool MCP `yalc_creator_report` comparte `creatorReportForSlug`
 * (report-service.ts) — una sola agregación, tres superficies.
 *
 * CLIENT-SAFE: importa solo calc-creator-core y módulos puros.
 */

import { DEFAULT_CREATOR_MODEL_CONFIG } from "@/lib/calc-creator-core";
import { negotiationBreakEven } from "./negotiation";
import type { PartnershipLead } from "./types";

// ── Modelo de performance (Fase 2 lo alimentará Impact; hoy, el seed) ──────

export type PerformanceSource = "seed" | "impact";

export interface CreatorPerformancePost {
  id: string;
  /** Fecha ISO (yyyy-mm-dd). Para `scheduled` es la fecha programada (futura). */
  date: string;
  /** Formato del post ("Video TikTok", "Reel", "Short", …). */
  format: string;
  title: string;
  status: "live" | "scheduled";
  clicks: number;
  signups: number;
  kyc: number;
  /** first_tx (conversiones). */
  conversions: number;
}

export interface CreatorPerformanceRecord {
  /** Handle del creator — clave de join contra el lead de Yalc. */
  handle: string;
  source: PerformanceSource;
  posts: CreatorPerformancePost[];
  updatedAt?: string;
}

// ── Shape del report ────────────────────────────────────────────────────────

export type ReportPeriodDays = 1 | 7 | 30 | 90;

export const REPORT_SPARKLINE_BUCKETS = 12;

export interface CreatorReportPostRow {
  id: string;
  date: string;
  format: string;
  title: string;
  status: "live" | "scheduled";
  clicks: number;
  conversions: number;
}

export interface CreatorReportRow {
  handle: string;
  network: string | null;
  leadId: string;
  lifecycleStatus: string | null;
  /** Fee del deal (offeredPrice de Yalc). */
  feeEur: number | null;
  /** CPA variable si el deal es mixto (dealTerms.variableCpaEur). */
  variableCpaEur: number | null;
  postsLive: number;
  clicks: number;
  signups: number;
  kyc: number;
  conversions: number;
  /** fee + variable×conv (lo invertido de verdad en la ventana). */
  totalCostEur: number | null;
  /** Coste por first_tx real; null sin conversiones o sin fee. */
  cpaRealEur: number | null;
  /** El listón: CAC objetivo. */
  breakEvenCpaEur: number;
  /** Conversiones necesarias según la calc (ceil(fee/CAC) en deals fijos). */
  conversionsNeeded: number | null;
  /** true = CPA real por debajo del break-even (verde). */
  belowBreakEven: boolean | null;
  /** Valor a CAC objetivo ÷ coste (conv × CAC ÷ coste). */
  roi: number | null;
  qualityScore: number | null;
  /** Delta sugerido de quality score (informativo — ajuste real en Fase 2). */
  qualityDelta: number | null;
  qualityNext: number | null;
  /** Posts live de la ventana + programados (detalle expandible). */
  posts: CreatorReportPostRow[];
  /** Clicks por bucket temporal (REPORT_SPARKLINE_BUCKETS sobre la ventana). */
  sparkline: number[];
}

export interface CreatorReportTotals {
  /** Null when at least one matched deal has no verified fee. */
  investedEur: number | null;
  postsLive: number;
  clicks: number;
  signups: number;
  kyc: number;
  conversions: number;
  /** Null when the aggregate cost is incomplete because a fee is unknown. */
  totalCostEur: number | null;
  cpaRealEur: number | null;
  belowBreakEven: boolean | null;
  roi: number | null;
}

export interface CreatorReportFeedbackDelta {
  handle: string;
  current: number | null;
  delta: number;
  next: number | null;
}

export interface CreatorReportFeedback {
  /** Observación de Sancho generada de los datos (mejor CPA del programa). */
  note: string | null;
  deltas: CreatorReportFeedbackDelta[];
}

export interface CreatorReportTracking {
  /** `real` is provider-backed, `demo` is explicitly seeded, and
   * `unavailable` means the Yalc roster is reachable but no reportable
   * performance record matched it. */
  status: "real" | "demo" | "unavailable";
  sources: PerformanceSource[];
  recordCount: number;
}

export interface CreatorReport {
  periodDays: ReportPeriodDays;
  from: string;
  to: string;
  targetCacEur: number;
  totals: CreatorReportTotals;
  creators: CreatorReportRow[];
  feedback: CreatorReportFeedback;
  tracking: CreatorReportTracking;
}

export interface BuildCreatorReportOptions {
  periodDays: ReportPeriodDays;
  /** Referencia temporal de la ventana (default: ahora) — inyectable en tests. */
  now?: Date;
  /**
   * Ventana UTC exacta para collectors. La UI sigue usando `periodDays`, pero
   * los snapshots diarios no pueden depender de la hora a la que corra el job.
   */
  exactRange?: { from: Date; to: Date };
  /** CAC objetivo (default: config sembrada de calc-creator-core → 80€). */
  targetCacEur?: number;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

const DAY_MS = 86_400_000;

function normalizeHandle(handle: string | null | undefined): string {
  return (handle ?? "").trim().toLowerCase().replace(/^@/, "");
}

function clampDelta(value: number): number {
  return Math.max(-5, Math.min(5, value));
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/** "13,6" — decimal es-ES determinista para la nota de feedback. */
function fmtDecEs(value: number, decimals = 1): string {
  return value.toFixed(decimals).replace(".", ",");
}

function postTime(post: CreatorPerformancePost): number {
  const t = Date.parse(post.date);
  return Number.isFinite(t) ? t : NaN;
}

/** dealTerms.variableCpaEur si el deal es mixto; null en deals fijos. */
function resolveVariableCpa(lead: PartnershipLead): number | null {
  const terms = lead.dealTerms;
  if (!terms || typeof terms !== "object") return null;
  const structure = (terms as Record<string, unknown>).structure;
  const variable = (terms as Record<string, unknown>).variableCpaEur;
  if (structure === "mixto" && isFiniteNumber(variable) && variable > 0) return variable;
  return null;
}

// ── Agregación ──────────────────────────────────────────────────────────────

/**
 * Construye el report por creator: join performance ↔ leads de Yalc (por
 * handle normalizado), ventana de `periodDays`, métricas reales vs calc.
 * Determinista y sin I/O — los tests fijan `now`.
 *
 * Reglas de inclusión: entra todo registro de performance cuyo handle tenga
 * lead en Yalc (Yalc es la fuente de verdad del roster/deal). Sin posts en
 * la ventana ⇒ fila a cero (el creator sigue visible con sus programados).
 * Registros sin lead se omiten.
 */
export function buildCreatorReport(
  leads: PartnershipLead[],
  records: CreatorPerformanceRecord[],
  options: BuildCreatorReportOptions,
): CreatorReport {
  const now = options.now ?? new Date();
  const periodDays = options.periodDays;
  const targetCacEur =
    options.targetCacEur ?? DEFAULT_CREATOR_MODEL_CONFIG.breakEven.defaultTargetCacEur;

  const exactFromMs = options.exactRange?.from.getTime();
  const exactToMs = options.exactRange?.to.getTime();
  const hasExactRange = exactFromMs !== undefined || exactToMs !== undefined;
  if (
    hasExactRange &&
    (!Number.isFinite(exactFromMs) ||
      !Number.isFinite(exactToMs) ||
      (exactFromMs as number) > (exactToMs as number))
  ) {
    throw new Error("Invalid exact creator-report range");
  }
  const toMs = hasExactRange ? (exactToMs as number) : now.getTime();
  const fromMs = hasExactRange
    ? (exactFromMs as number)
    : toMs - periodDays * DAY_MS;
  const bucketMs = (toMs - fromMs) / REPORT_SPARKLINE_BUCKETS;

  const leadByHandle = new Map<string, PartnershipLead>();
  for (const lead of leads) {
    const key = normalizeHandle(lead.handle);
    if (key && !leadByHandle.has(key)) leadByHandle.set(key, lead);
  }

  const rows: CreatorReportRow[] = [];
  const matchedTrackingSources = new Set<PerformanceSource>();

  for (const record of records) {
    const lead = leadByHandle.get(normalizeHandle(record.handle));
    if (!lead) continue; // sin lead en Yalc no hay deal que reportar
    matchedTrackingSources.add(record.source);

    const liveInWindow = record.posts.filter((post) => {
      if (post.status !== "live") return false;
      const t = postTime(post);
      return Number.isFinite(t) && t >= fromMs && t <= toMs;
    });
    const scheduled = record.posts.filter((post) => post.status === "scheduled");

    const clicks = liveInWindow.reduce((sum, post) => sum + post.clicks, 0);
    const signups = liveInWindow.reduce((sum, post) => sum + post.signups, 0);
    const kyc = liveInWindow.reduce((sum, post) => sum + post.kyc, 0);
    const conversions = liveInWindow.reduce((sum, post) => sum + post.conversions, 0);

    const feeEur = isFiniteNumber(lead.offeredPrice) ? lead.offeredPrice : null;
    const variableCpaEur = resolveVariableCpa(lead);
    const totalCostEur = feeEur === null ? null : feeEur + (variableCpaEur ?? 0) * conversions;

    const cpaRealEur =
      totalCostEur !== null && conversions > 0 ? totalCostEur / conversions : null;
    const belowBreakEven = cpaRealEur === null ? null : cpaRealEur < targetCacEur;
    const roi =
      totalCostEur !== null && totalCostEur > 0 && conversions > 0
        ? (conversions * targetCacEur) / totalCostEur
        : null;

    // Necesarias según la calc (misma superficie que el drawer/inbox):
    // en deals fijos = ceil(fee / CAC) — p.ej. Lucía 3.500€/80€ → 44.
    let conversionsNeeded: number | null = null;
    if (feeEur !== null) {
      const breakEven = negotiationBreakEven({
        feeEur,
        targetCacEur,
        followers: lead.followers ?? 0,
        engagementRatePct: lead.engagementRate ?? undefined,
        ...(variableCpaEur !== null
          ? { structure: "mixto" as const, variableCpaEur }
          : { structure: "fijo" as const }),
        ...(liveInWindow.length > 0 ? { posts: liveInWindow.length } : {}),
      });
      conversionsNeeded = Number.isFinite(breakEven.necesarias) ? breakEven.necesarias : null;
    }

    // Sparkline: clicks por bucket temporal de la ventana.
    const sparkline = new Array<number>(REPORT_SPARKLINE_BUCKETS).fill(0);
    for (const post of liveInWindow) {
      const idx = Math.min(
        REPORT_SPARKLINE_BUCKETS - 1,
        Math.max(0, Math.floor((postTime(post) - fromMs) / bucketMs)),
      );
      sparkline[idx] += post.clicks;
    }

    const posts: CreatorReportPostRow[] = [...liveInWindow]
      .sort((a, b) => a.date.localeCompare(b.date))
      .concat([...scheduled].sort((a, b) => a.date.localeCompare(b.date)))
      .map((post) => ({
        id: post.id,
        date: post.date,
        format: post.format,
        title: post.title,
        status: post.status,
        clicks: post.clicks,
        conversions: post.conversions,
      }));

    rows.push({
      handle: lead.handle ?? record.handle,
      network: lead.network ?? null,
      leadId: lead.id,
      lifecycleStatus: lead.lifecycleStatus ?? null,
      feeEur,
      variableCpaEur,
      postsLive: liveInWindow.length,
      clicks,
      signups,
      kyc,
      conversions,
      totalCostEur,
      cpaRealEur,
      breakEvenCpaEur: targetCacEur,
      conversionsNeeded,
      belowBreakEven,
      roi,
      qualityScore: lead.qualityScore ?? null,
      qualityDelta: null, // se rellena tras conocer el ROI del programa
      qualityNext: null,
      posts,
      sparkline,
    });
  }

  rows.sort((a, b) => b.clicks - a.clicks || a.handle.localeCompare(b.handle));

  // ── Totales del programa ──
  const hasUnknownFee = rows.some((row) => row.feeEur === null);
  const hasUnknownTotalCost = rows.some((row) => row.totalCostEur === null);
  const invested = hasUnknownFee
    ? null
    : rows.reduce((sum, row) => sum + (row.feeEur ?? 0), 0);
  const totalCost = hasUnknownTotalCost
    ? null
    : rows.reduce((sum, row) => sum + (row.totalCostEur ?? 0), 0);
  const totals: CreatorReportTotals = {
    investedEur: invested,
    postsLive: rows.reduce((sum, row) => sum + row.postsLive, 0),
    clicks: rows.reduce((sum, row) => sum + row.clicks, 0),
    signups: rows.reduce((sum, row) => sum + row.signups, 0),
    kyc: rows.reduce((sum, row) => sum + row.kyc, 0),
    conversions: rows.reduce((sum, row) => sum + row.conversions, 0),
    totalCostEur: totalCost,
    cpaRealEur: null,
    belowBreakEven: null,
    roi: null,
  };
  if (totals.conversions > 0 && totalCost !== null && totalCost > 0) {
    totals.cpaRealEur = totalCost / totals.conversions;
    totals.belowBreakEven = totals.cpaRealEur < targetCacEur;
    totals.roi = (totals.conversions * targetCacEur) / totalCost;
  }

  // ── Feedback al quality score (sugerido; el ajuste real es Fase 2) ──
  const programRoi = totals.roi;
  const deltas: CreatorReportFeedbackDelta[] = [];
  for (const row of rows) {
    if (row.roi === null || programRoi === null) continue;
    const delta = clampDelta(Math.round((row.roi - programRoi) * 2));
    row.qualityDelta = delta;
    row.qualityNext =
      row.qualityScore === null ? null : Math.max(0, Math.min(100, row.qualityScore + delta));
    deltas.push({ handle: row.handle, current: row.qualityScore, delta, next: row.qualityNext });
  }

  let note: string | null = null;
  const best = rows
    .filter((row) => row.cpaRealEur !== null)
    .sort((a, b) => (a.cpaRealEur as number) - (b.cpaRealEur as number))[0];
  if (best && totals.cpaRealEur !== null) {
    note =
      `Sancho observa: los posts de ${best.handle}` +
      `${best.network ? ` (${best.network})` : ""} convierten al mejor CPA del programa ` +
      `(${fmtDecEs(best.cpaRealEur as number)}€ vs ${fmtDecEs(totals.cpaRealEur)}€ de media). ` +
      "Ese patrón sube de peso en el próximo descubrimiento.";
  }

  return {
    periodDays,
    from: new Date(fromMs).toISOString(),
    to: new Date(toMs).toISOString(),
    targetCacEur,
    totals,
    creators: rows,
    feedback: { note, deltas },
    tracking: {
      status: matchedTrackingSources.has("impact")
        ? "real"
        : matchedTrackingSources.has("seed")
          ? "demo"
          : "unavailable",
      sources: [...matchedTrackingSources].sort(),
      recordCount: rows.length,
    },
  };
}
