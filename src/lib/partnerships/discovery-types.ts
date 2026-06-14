/**
 * Partnerships discovery · tipos compartidos (SAN-79)
 *
 * Contrato entre las tres superficies (paridad UI = chat = MCP):
 *  - `discovery-plan-builder` (skill de chat) produce un `DiscoveryPlan`.
 *  - `POST /api/partnerships/searches` (+ tool MCP `yalc_create_search`)
 *    crea la búsqueda: tarea Outreach + campaign `type=Partnerships` en Yalc
 *    + runner encolado.
 *  - `discovery-search-runner` (job agentic / fixtures) produce
 *    `RawDiscoveryCandidate[]` y los ingesta vía `runDiscoverySearch`.
 *
 * El estado vive en `brand/{slug}/outreach/searches/{searchId}.json`
 * (`DiscoverySearchRecord`), referenciado desde la tarea madre.
 */

import type { CreatorSignals, QualificationMode, QualityComponent, ScoreBand, TierKey } from "@/lib/calc-creator-core";

/** Plan estructurado de la búsqueda — espejo del plan-card de encuentra.html. */
export interface DiscoveryPlan {
  /** Título corto de la búsqueda, p.ej. "Finanzas personales ES · IG+TikTok". */
  title: string;
  /** Fila "Sectores": finanzas personales · ahorro · inversión básica. */
  sectors: string[];
  /** Fila "Redes": instagram | tiktok | youtube (normalizadas en minúscula). */
  networks: string[];
  /** Fila "Tiers": claves de tier objetivo (nano/micro/mid/macro). */
  tiers: TierKey[];
  /** Fila "Audiencia": % mínimo de audiencia España (proxy idioma). */
  audienceEsMinPct?: number;
  /** Fila "Volumen": nº de candidatos objetivo. */
  targetVolume?: number;
  /** Fila "Señales": ad-library + marcas competidoras a cruzar (repeat). */
  signals?: {
    adLibrary?: boolean;
    competitorBrands?: string[];
  };
  /** Fila "Plantillas": nombres de plantillas a instanciar al lanzar (SAN-80 las materializa). */
  templates?: string[];
  /** Modo de cualificación de la campaign Yalc (default hybrid, SAN-77). */
  qualificationMode?: QualificationMode;
  /** Umbral de descarte automático (default 40). */
  disqualifyThreshold?: number;
  /** Notas libres del plan (contexto para el runner agentic). */
  notes?: string;
}

/**
 * Candidato crudo que produce el scraping (agente con mcp__scrapecreators__*
 * o el fixture JSON). El normalizador tolera alias (`er`, `net`, snake_case).
 */
export interface RawDiscoveryCandidate {
  /** Handle social con @ (se añade si falta). Obligatorio. */
  handle: string;
  /** Red normalizada en minúscula (instagram/tiktok/youtube/...). Obligatorio. */
  network: string;
  name?: string;
  profileUrl?: string;
  email?: string;
  followers?: number;
  /** Engagement rate en % (4.8 = 4.8%). */
  engagementRatePct?: number;
  /** Señales para el quality score (calc-creator-core `CreatorSignals`). */
  signals?: CreatorSignals;
}

/** Desglose persistido en el Lead de Yalc (`quality_components`). */
export interface LeadQualityComponents {
  band: ScoreBand;
  tier: TierKey | null;
  tierLabel: string | null;
  erBenchmarkPct: number | null;
  components: QualityComponent[];
  missingSignals: string[];
  engine: "calc-creator-core";
}

/** Payload de Lead que el runner envía a Yalc (`POST /campaigns/:id/leads/assign`). */
export interface DiscoveryLeadPayload {
  name: string;
  handle: string;
  network: string;
  followers?: number;
  engagementRate?: number;
  tier?: string;
  email?: string;
  qualityScore: number;
  qualityComponents: LeadQualityComponents;
  source: "discovery";
  tags: string[];
}

export type DiscoveryRunnerStatus = "queued" | "running" | "done" | "error";
export type DiscoveryRunnerMode = "fixtures" | "live";

export interface DiscoveryRunnerStats {
  /** Candidatos crudos recibidos (tras normalizar). */
  candidates: number;
  /** Candidatos descartados por el normalizador (sin handle/red). */
  invalid: number;
  /** Leads insertados en Yalc. */
  inserted: number;
  /** Insertados como Sourced (o Qualified en modo auto). */
  sourced: number;
  /** Insertados como Disqualified (nota auto, hybrid). */
  disqualified: number;
  /** Descartados sin insertar (modo auto bajo umbral). */
  dropped: number;
  avgQuality: number | null;
}

export interface DiscoveryRunnerState {
  status: DiscoveryRunnerStatus;
  mode: DiscoveryRunnerMode | null;
  queuedAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  error: string | null;
  stats: DiscoveryRunnerStats | null;
}

/** Registro de la búsqueda — plan + campaignId + estado del runner (en la tarea). */
export interface DiscoverySearchRecord {
  id: string;
  slug: string;
  title: string;
  plan: DiscoveryPlan;
  /** Campaign Partnerships creada en Yalc. */
  campaignId: string;
  /** Proyecto de campaña sembrado para esta búsqueda (SAN-195, type=project). */
  projectId?: string | null;
  /** Tarea madre de la búsqueda (T01 del proyecto de campaña: el runner). */
  taskId: string | null;
  runner: DiscoveryRunnerState;
  /**
   * Plantillas INSTANCIADAS en esta búsqueda (SAN-80): copias congeladas de
   * la biblioteca (`AssignedTemplate` de ./templates). La biblioteca guarda
   * los originales; el motor de Contacto envía la secuencia de aquí.
   */
  templates?: import("./templates").AssignedTemplate[];
  createdAt: string;
  updatedAt: string;
}
