/**
 * calc-creator-core · seeds de calibración (SAN-75)
 *
 * Los 7 creators canónicos del mockup `contactos-lista.html` (+2 descartados).
 * Las señales están calibradas para que `computeQualityScore` con la config
 * por defecto reproduzca EXACTAMENTE la columna `quality` del mockup, y para
 * que @finanzasconlucia reproduzca el desglose del drawer (92/88/95/84/76 → 87).
 *
 * Usos:
 *  - Tests de calibración/paridad de este paquete.
 *  - Siembra manual de la UI (SAN-78) y demos antes del discovery real (SAN-79).
 *
 * NOTA: el tier NO se siembra: lo deriva la config (settings.html es la fuente
 * de verdad de rangos; algunas etiquetas de tier del mockup eran decorativas).
 */

import type { CreatorMetrics } from "./types";

export interface SeedCreator {
  /** Entrada del motor de quality score. */
  metrics: CreatorMetrics;
  /** Valor de la columna `quality` del mockup (objetivo de calibración). */
  expectedQuality: number;
  /** Metadatos de pipeline del mockup, para sembrar la UI (SAN-78). */
  stage:
    | "Discovered"
    | "Shortlist"
    | "Contacted"
    | "Replied"
    | "Negotiating"
    | "Signed"
    | "Active"
    | "Discarded";
  busqueda: "finanzas-es" | "youtubers-inversion";
  feeEur: number | null;
  feeNote?: string;
  discardNote?: string;
}

export const SEED_CREATORS: readonly SeedCreator[] = [
  {
    metrics: {
      handle: "@finanzasconlucia",
      network: "Instagram",
      followers: 142_000,
      engagementRatePct: 4.8,
      signals: {
        fakeFollowersPct: 6,
        suspiciousGrowthSpikes: false,
        verticalMatchShare: 1,
        adLibraryChecked: true,
        competitorPromos: [{ brand: "Revolut", count: 2, windowMonths: 6 }],
        activeConflict: false,
        spanishAudiencePct: 91,
        cetAlignmentPct: 68,
        postsPerWeek: 3.5,
        longGapsLast6Months: 2,
      },
    },
    expectedQuality: 87,
    stage: "Negotiating",
    busqueda: "finanzas-es",
    feeEur: 3500,
    feeNote: "ofertado",
  },
  {
    metrics: {
      handle: "@elinversorprudente",
      network: "YouTube",
      followers: 89_000,
      engagementRatePct: 6.2,
      signals: {
        fakeFollowersPct: 4,
        verticalMatchShare: 1,
        adLibraryChecked: true,
        competitorPromos: [{ brand: "MyInvestor", count: 2, windowMonths: 6 }],
        spanishAudiencePct: 95,
        cetAlignmentPct: 90,
        postsPerWeek: 3,
        longGapsLast6Months: 0,
      },
    },
    expectedQuality: 91,
    stage: "Signed",
    busqueda: "youtubers-inversion",
    feeEur: 2800,
    feeNote: "firmado",
  },
  {
    metrics: {
      handle: "@ahorroconmarta",
      network: "TikTok",
      followers: 230_000,
      engagementRatePct: 3.1,
      signals: {
        fakeFollowersPct: 12,
        verticalMatchShare: 0.85,
        adLibraryChecked: true,
        competitorPromos: [{ brand: "Vivid", count: 1, windowMonths: 6 }],
        spanishAudiencePct: 85,
        cetAlignmentPct: 70,
        postsPerWeek: 4,
        longGapsLast6Months: 1,
      },
    },
    expectedQuality: 74,
    stage: "Contacted",
    busqueda: "finanzas-es",
    feeEur: null,
  },
  {
    metrics: {
      handle: "@davidfintech",
      network: "Instagram",
      followers: 45_000,
      engagementRatePct: 7.4,
      signals: {
        fakeFollowersPct: 7,
        verticalMatchShare: 0.8,
        adLibraryChecked: true,
        competitorPromos: [],
        spanishAudiencePct: 93,
        cetAlignmentPct: 85,
        postsPerWeek: 2.6,
        longGapsLast6Months: 0,
      },
    },
    expectedQuality: 82,
    stage: "Replied",
    busqueda: "finanzas-es",
    feeEur: 1200,
    feeNote: "pedido",
  },
  {
    metrics: {
      handle: "@cuentasclaras_es",
      network: "YouTube",
      followers: 310_000,
      engagementRatePct: 2.2,
      signals: {
        fakeFollowersPct: 14,
        verticalMatchShare: 0.45,
        adLibraryChecked: true,
        competitorPromos: [],
        spanishAudiencePct: 75,
        cetAlignmentPct: 65,
        postsPerWeek: 2,
        longGapsLast6Months: 2,
      },
    },
    expectedQuality: 58,
    stage: "Discovered",
    busqueda: "youtubers-inversion",
    feeEur: null,
  },
  {
    metrics: {
      handle: "@lauraylasfinanzas",
      network: "Instagram",
      followers: 67_000,
      engagementRatePct: 5.5,
      signals: {
        fakeFollowersPct: 8,
        verticalMatchShare: 0.9,
        adLibraryChecked: true,
        competitorPromos: [{ brand: "N26", count: 1, windowMonths: 6 }],
        spanishAudiencePct: 90,
        cetAlignmentPct: 80,
        postsPerWeek: 3,
        longGapsLast6Months: 2,
      },
    },
    expectedQuality: 79,
    stage: "Shortlist",
    busqueda: "finanzas-es",
    feeEur: null,
  },
  {
    metrics: {
      handle: "@money_pau",
      network: "TikTok",
      followers: 510_000,
      engagementRatePct: 4.0,
      signals: {
        fakeFollowersPct: 8,
        verticalMatchShare: 0.95,
        adLibraryChecked: true,
        competitorPromos: [{ brand: "Revolut", count: 3, windowMonths: 6 }],
        spanishAudiencePct: 87,
        cetAlignmentPct: 75,
        postsPerWeek: 5,
        longGapsLast6Months: 1,
      },
    },
    expectedQuality: 88,
    stage: "Active",
    busqueda: "finanzas-es",
    feeEur: 5000,
    feeNote: "firmado",
  },
  {
    metrics: {
      handle: "@pelotazo_cripto",
      network: "TikTok",
      followers: 88_000,
      engagementRatePct: 1.1,
      signals: {
        fakeFollowersPct: 30,
        suspiciousGrowthSpikes: true,
        verticalMatchShare: 0.15,
        adLibraryChecked: true,
        competitorPromos: [],
        spanishAudiencePct: 63,
        cetAlignmentPct: 50,
        postsPerWeek: 2,
        longGapsLast6Months: 2,
      },
    },
    expectedQuality: 31,
    stage: "Discarded",
    busqueda: "finanzas-es",
    feeEur: null,
    discardNote: "auto · hybrid: score < 40",
  },
  {
    metrics: {
      handle: "@cuentasclaras_es2",
      network: "YouTube",
      followers: 12_000,
      engagementRatePct: 3.0,
      signals: {
        fakeFollowersPct: 10,
        verticalMatchShare: 0.5,
        adLibraryChecked: true,
        competitorPromos: [],
        spanishAudiencePct: 80,
        cetAlignmentPct: 70,
        postsPerWeek: 1.5,
        longGapsLast6Months: 1,
      },
    },
    expectedQuality: 52,
    stage: "Discarded",
    busqueda: "youtubers-inversion",
    feeEur: null,
    discardNote: "manual · 11 jun",
  },
];
