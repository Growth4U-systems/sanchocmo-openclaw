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
 * Formato de post del deal (keys del select del mockup drawer-partner).
 * `normalizeDealFormat` acepta alias ("vídeo", "video largo", "carousel").
 */
export type DealFormat = "reel" | "post" | "story" | "video" | "carrusel";

/** Estructura del deal: solo fijo, o fijo + CPA variable por conversión. */
export type DealStructure = "fijo" | "mixto";

/**
 * Config sembrada del break-even (SAN-75b · Ola 2) — espejo EXACTO del
 * `<script>` de `drawer-partner.html`: alcance 30%/post × CTR por formato ×
 * ajuste ER × funnel 8/60/70. (La semilla provisional de la pasada A usaba
 * `clickRatePct: 15`; el mockup final lo sustituyó por reach × CTR.)
 */
export interface BreakEvenSeedConfig {
  /** Alcance medio por post como % de followers (mockup: 30, IG). */
  reachRatePct: number;
  /** CTR estimado por formato, en % (mockup: reel 1.2 · post 0.9 · story 0.6 · video 1.4 · carrusel 1.0). */
  ctrByFormatPct: Record<DealFormat, number>;
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

// ═════ Break-even (SAN-75b · Ola 2) ════════════════════════════════════════

/**
 * Deal editable (lado izquierdo de la calc del drawer).
 * Clamps espejo del mockup: posts ≥ 1 · fee ≥ 0 · CAC ≥ 1 · CPA ≥ 0.
 */
export interface BreakEvenDeal {
  /** Nº de posts del paquete (se clampa a ≥ 1). */
  posts: number;
  /** Formato del post; acepta alias ("vídeo", "video largo"). Default "reel" (el del mockup). */
  format?: DealFormat | string;
  /** Precio total del deal en € (se clampa a ≥ 0). */
  feeEur: number;
  /** Estructura: "fijo" (default) o "mixto" (fijo + variable). */
  structure?: DealStructure;
  /** CPA variable en € (solo mixto; se clampa a ≥ 0). */
  variableCpaEur?: number;
  /** CAC objetivo en € (default `config.breakEven.defaultTargetCacEur`; clamp ≥ 1). */
  targetCacEur?: number;
  /** Multiplicador de incentivo (canónicos ×1/×1.5/×2/×3; inválido → 1). */
  incentiveMultiplier?: number;
}

/**
 * Lado alcanzable: audiencia del creator + tasas del funnel (overrides de la
 * config sembrada). El ajuste ER = `engagementRatePct / erBenchmarkPct`; si no
 * se pasa benchmark se usa el del tier resuelto por followers. OJO paridad: el
 * mockup fija el benchmark de nicho en 4.8 (= ER de Lucía) → ajuste ×1,00.
 */
export interface BreakEvenFunnel {
  /** Seguidores del creator (requerido, finito ≥ 0). */
  followers: number;
  /** ER del creator en % (p.ej. 4.8). Ausente → ajuste 1 + señal ausente. */
  engagementRatePct?: number;
  /** Benchmark de ER del nicho en %. Default: benchmark del tier (config). */
  erBenchmarkPct?: number;
  /** Overrides de la config sembrada (en %). */
  reachRatePct?: number;
  clickToSignupPct?: number;
  signupToKycPct?: number;
  kycToFirstTxPct?: number;
}

/** Veredicto del break-even (mockup: VIABLE · AJUSTADO · NO VIABLE · INVIABLE). */
export type BreakEvenVerdict = "viable" | "ajustado" | "no-viable" | "inviable";

/** Color del sello del veredicto (verde ≥ viableMinRatio · ámbar ≥ tightMinRatio · rojo). */
export type BreakEvenVerdictColor = "green" | "amber" | "red";

/** Paso del desglose del funnel (filas para pintar la calc del drawer). */
export interface BreakEvenFunnelStep {
  key: "audience" | "reach" | "clicks" | "signups" | "kycs" | "firstTx" | "incentive";
  /** Etiqueta es-ES ("Alcance", "Clicks", "Signups", …). */
  label: string;
  /** Valor exacto del paso (float, sin redondear). */
  value: number;
  /** Valor redondeado para pintar (Math.round, como el mockup). */
  rounded: number;
  /** Tasa/factor aplicado en este paso ("×30% alcance × 3 posts", "×8%", "×1,5"). */
  detail: string;
}

/** Eco del deal normalizado (tras clamps y defaults) que usó el cálculo. */
export interface BreakEvenDealEcho {
  posts: number;
  format: DealFormat;
  /** CTR aplicado al formato, en %. */
  ctrPct: number;
  feeEur: number;
  /** €/post derivado (fee / posts), sin redondear. */
  perPostEur: number;
  structure: DealStructure;
  /** CPA variable aplicado (solo mixto; `null` en fijo). */
  variableCpaEur: number | null;
  targetCacEur: number;
  incentiveMultiplier: number;
}

/** Salida del motor de break-even (todo lo que pinta la calc del drawer). */
export interface BreakEvenResult {
  deal: BreakEvenDealEcho;
  /** First_tx necesarias, redondeadas HACIA ARRIBA (ceil). `Infinity` si la estructura rompe. */
  necesarias: number;
  /** fee / (CAC − CPA) sin redondear. `Infinity` si la estructura rompe. */
  necesariasExactas: number;
  /** Texto de la fórmula aplicada, estilo mockup ("3.500€ ÷ 80€ CAC"). */
  formulaNecesarias: string;
  /** `true` si mixto con CPA variable ≥ CAC objetivo (cada conversión pierde dinero). */
  structureBroken: boolean;
  /** Ajuste ER aplicado (ER / benchmark; 1 si falta señal). */
  erAdjustment: number;
  /** Clicks estimados (followers × reach% × posts × CTR × ajuste ER). */
  clicks: number;
  /** First_tx alcanzables SIN multiplicador (float). */
  alcanzableBase: number;
  /** First_tx alcanzables CON multiplicador de incentivo (float). */
  alcanzable: number;
  /** alcanzable / necesarias (ya redondeadas). `Infinity` si necesarias = 0; 0 si rompe. */
  ratio: number;
  veredicto: BreakEvenVerdict;
  /** Sello del mockup: "VIABLE" | "AJUSTADO" | "NO VIABLE" | "INVIABLE". */
  veredictoLabel: string;
  veredictoColor: BreakEvenVerdictColor;
  /** Frase del veredicto, espejo del mockup. */
  frase: string;
  /** Contraoferta = alcanzable × (CAC − CPA var.), floor a la centena. `null` si rompe. */
  contraofertaEur: number | null;
  /** Nota de la contraoferta (espejo del hint del mockup). */
  contraofertaNota: string;
  /** Línea "Modelo: …" del mockup (funnel-mini), lista para pintar. */
  modelo: string;
  /** Desglose paso a paso del funnel (filas de la calc). */
  funnel: BreakEvenFunnelStep[];
  /** Señales ausentes (p.ej. "engagementRate" → ajuste ER neutro ×1). */
  missingSignals: string[];
}
