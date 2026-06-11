/**
 * calc-creator-core · tipos públicos (SAN-75)
 *
 * Paquete TS puro: sin DOM, sin Next, sin DB. Contrato compartido por:
 *  - SAN-77 (`/api/qualify` + tool MCP `yalc_qualify_lead`)
 *  - SAN-79 (discovery-search-runner / qualify-enrich)
 *  - SAN-78 (drawer del partner: desglose por componente)
 *  - SAN-76 (Model settings: edita `CreatorModelConfig`)
 */

export type TierKey = "nano" | "micro" | "mid" | "macro";

export interface TierConfig {
  key: TierKey;
  label: string;
  /** Límite inferior de seguidores (incluido). */
  minFollowers: number;
  /** Límite superior (excluido). `null` = sin tope (último tier). */
  maxFollowers: number | null;
  /** Benchmark de engagement rate (%) del tier — alimenta "ER vs tier". */
  erBenchmarkPct: number;
}

export type QualityComponentKey =
  | "erVsTier"
  | "authenticity"
  | "sectorFit"
  | "audienceEs"
  | "consistency";

/** Pesos por componente. Se normalizan al calcular (no hace falta que sumen 1). */
export type QualityWeights = Record<QualityComponentKey, number>;

/**
 * Modo de cualificación por campaña (decisión Alfonso 2026-06-11, SAN-77):
 *  - `auto`: umbral de score cualifica solo (B2B a volumen).
 *  - `manual`: solo el humano decide.
 *  - `hybrid` (default Partnerships): score < umbral → Disqualified automático;
 *    el resto entra como Sourced ya scoreado y el humano decide el Shortlist.
 */
export type QualificationMode = "auto" | "manual" | "hybrid";

export interface QualificationConfig {
  defaultMode: QualificationMode;
  /** Umbral 0-100. Por debajo → Disqualified automático en auto/hybrid. */
  threshold: number;
}

/** Cortes de banda visual del score (lista: q-hi ≥ high, q-mid ≥ medium). */
export interface ScoreBandsConfig {
  high: number;
  medium: number;
}

export type ScoreBand = "high" | "medium" | "low";

/**
 * Config sembrada del break-even (SAN-75b · Ola 2 — el motor aún NO existe).
 * Se tipa ya para que SAN-76 la haga editable y la Ola 2 solo añada el motor.
 */
export interface BreakEvenSeedConfig {
  /** % de la audiencia engaged que clica (proxy). */
  clickRatePct: number;
  /** Funnel Monzo sembrado: click→signup · signup→KYC · KYC→first_tx (en %). */
  clickToSignupPct: number;
  signupToKycPct: number;
  kycToFirstTxPct: number;
  /** CAC objetivo por defecto (€) — en producción viene de Metrics. */
  defaultTargetCacEur: number;
  /** Multiplicador de incentivo (sin códigos promo): empuja lo alcanzable. */
  incentiveMultipliers: readonly number[];
  /** Veredicto por ratio alcanzable/necesario: verde ≥ viable · ámbar ≥ tight. */
  verdict: {
    viableMinRatio: number;
    tightMinRatio: number;
  };
}

/** Config completa del modelo de creators (espejo de settings.html, v1 hardcode). */
export interface CreatorModelConfig {
  tiers: readonly TierConfig[];
  verticals: readonly string[];
  formats: readonly string[];
  weights: QualityWeights;
  qualification: QualificationConfig;
  scoreBands: ScoreBandsConfig;
  breakEven: BreakEvenSeedConfig;
}

/** Promo de un competidor detectada vía ad-library (revealed preference). */
export interface CompetitorPromo {
  brand: string;
  /** Nº de promos detectadas en la ventana. ≥2 = "repeat" (les funciona). */
  count: number;
  windowMonths?: number;
}

/** Señales escaneadas del perfil (ScrapeCreators + ad-library). Todas opcionales. */
export interface CreatorSignals {
  /** Proxy de fake-followers estimado, 0-100 (%). */
  fakeFollowersPct?: number;
  /** Picos sospechosos de compra de seguidores. */
  suspiciousGrowthSpikes?: boolean;
  /** Cuota 0-1 de contenido en los verticals objetivo de la campaña. */
  verticalMatchShare?: number;
  /** ¿Se consultó la ad-library? Si no, el track record no puntúa. */
  adLibraryChecked?: boolean;
  /** Promos de competidores detectadas (ad-library). */
  competitorPromos?: readonly CompetitorPromo[];
  /** Conflicto activo (exclusividad/colaboración vigente con un competidor). */
  activeConflict?: boolean;
  /** Proxy idioma: % comentarios en español, 0-100. */
  spanishAudiencePct?: number;
  /** Alineación horaria CET de publicación, 0-100. */
  cetAlignmentPct?: number;
  /** Cadencia media de publicación. */
  postsPerWeek?: number;
  /** Parones de 10+ días en los últimos 6 meses. */
  longGapsLast6Months?: number;
}

/** Entrada del motor de quality score. */
export interface CreatorMetrics {
  handle?: string;
  network?: string;
  followers?: number;
  /** Engagement rate en % (p.ej. 4.8). */
  engagementRatePct?: number;
  signals?: CreatorSignals;
}

/** Resultado por componente (fila del desglose del drawer). */
export interface QualityComponent {
  key: QualityComponentKey;
  label: string;
  /** 0-100, entero. */
  score: number;
  /** Peso normalizado aplicado al total. */
  weight: number;
  /** Nota explicativa (es-ES), estilo drawer-partner. */
  note: string;
  /** `true` si faltó la señal primaria y se aplicó neutro 50. */
  missingData: boolean;
}

/** Salida del motor: total + desglose (lo que pinta el drawer). */
export interface QualityScoreResult {
  /** 0-100, entero. */
  total: number;
  band: ScoreBand;
  /** Tier resuelto desde followers con la config. `null` = desconocido. */
  tier: TierKey | null;
  tierLabel: string | null;
  /** Benchmark de ER aplicado. `null` si el tier es desconocido. */
  erBenchmarkPct: number | null;
  components: QualityComponent[];
  /** Señales ausentes detectadas (p.ej. "adLibrary", "followers"). */
  missingSignals: string[];
}
