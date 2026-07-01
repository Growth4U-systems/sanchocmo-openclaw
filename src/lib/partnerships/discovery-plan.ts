/**
 * Partnerships discovery · parser del plan + payload de campaign (SAN-79)
 *
 * Una sola lógica para las tres superficies: la skill `discovery-plan-builder`
 * produce el JSON, este módulo lo valida y lo convierte en el payload del
 * `POST /api/campaigns` de Yalc (type=Partnerships, modo hybrid por defecto).
 */

import { DEFAULT_CREATOR_MODEL_CONFIG } from "@/lib/calc-creator-core";
import type { CreatorModelConfig, QualificationMode, TierKey } from "@/lib/calc-creator-core";
import type { DiscoveryPlan } from "./discovery-types";

export class DiscoveryPlanError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DiscoveryPlanError";
  }
}

const TIER_KEYS: readonly TierKey[] = ["nano", "micro", "mid", "macro"];
const QUALIFICATION_MODES: readonly QualificationMode[] = ["auto", "manual", "hybrid"];

const NETWORK_ALIASES: Record<string, string> = {
  ig: "instagram",
  insta: "instagram",
  instagram: "instagram",
  tt: "tiktok",
  tiktok: "tiktok",
  yt: "youtube",
  youtube: "youtube",
  x: "twitter",
  twitter: "twitter",
  twitch: "twitch",
  linkedin: "linkedin",
};

export function normalizeNetwork(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const key = value.trim().toLowerCase();
  if (!key) return null;
  return NETWORK_ALIASES[key] ?? key;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

/**
 * Valida y normaliza el plan de la skill/MCP/UI. Reglas mínimas: título,
 * al menos un sector y una red. Tiers desconocidos o vacíos → todos.
 *
 * `config` (SAN-76): config EFECTIVA del modelo (defaults + overrides de
 * Yalc) — de ahí salen el modo de cualificación y el umbral cuando el plan
 * no los trae. Default: la sembrada (caminos sin slug o Yalc caído).
 */
export function parseDiscoveryPlan(
  input: unknown,
  config: CreatorModelConfig = DEFAULT_CREATOR_MODEL_CONFIG,
): DiscoveryPlan {
  if (!isRecord(input)) {
    throw new DiscoveryPlanError("plan must be a JSON object");
  }

  const title = typeof input.title === "string" ? input.title.trim() : "";
  if (!title) throw new DiscoveryPlanError("plan.title is required");

  const sectors = stringList(input.sectors).map((sector) => sector.toLowerCase());
  if (sectors.length === 0) {
    throw new DiscoveryPlanError("plan.sectors must include at least one sector");
  }

  const networks = stringList(input.networks)
    .map((network) => normalizeNetwork(network))
    .filter((network): network is string => Boolean(network));
  if (networks.length === 0) {
    throw new DiscoveryPlanError("plan.networks must include at least one network (instagram/tiktok/youtube/...)");
  }

  const tiers = stringList(input.tiers)
    .map((tier) => tier.toLowerCase())
    .filter((tier): tier is TierKey => (TIER_KEYS as readonly string[]).includes(tier));

  const rawMode = typeof input.qualificationMode === "string" ? input.qualificationMode.toLowerCase() : undefined;
  if (rawMode !== undefined && !(QUALIFICATION_MODES as readonly string[]).includes(rawMode)) {
    throw new DiscoveryPlanError("plan.qualificationMode must be 'auto', 'manual' or 'hybrid'");
  }

  const threshold = finiteNumber(input.disqualifyThreshold);
  if (threshold !== undefined && (threshold < 0 || threshold > 100)) {
    throw new DiscoveryPlanError("plan.disqualifyThreshold must be between 0 and 100");
  }

  const signalsInput = isRecord(input.signals) ? input.signals : {};
  const competitorBrands = stringList(signalsInput.competitorBrands);

  return {
    title,
    sectors,
    networks: Array.from(new Set(networks)),
    tiers: tiers.length > 0 ? Array.from(new Set(tiers)) : [...TIER_KEYS],
    audienceEsMinPct: finiteNumber(input.audienceEsMinPct),
    targetVolume: finiteNumber(input.targetVolume),
    signals: {
      adLibrary: signalsInput.adLibrary !== false,
      competitorBrands,
    },
    templates: stringList(input.templates),
    qualificationMode: (rawMode as QualificationMode | undefined) ?? config.qualification.defaultMode,
    disqualifyThreshold: threshold ?? config.qualification.threshold,
    notes: typeof input.notes === "string" && input.notes.trim() ? input.notes.trim() : undefined,
  };
}

/** Payload del `POST /api/campaigns` de Yalc para una búsqueda Partnerships. */
export function buildCampaignPayload(plan: DiscoveryPlan): {
  title: string;
  hypothesis: string;
  targetSegment: string;
  channels: string[];
  type: "Partnerships";
  campaignKind: "creator";
  qualificationMode: QualificationMode;
  disqualifyThreshold: number;
} {
  const tierLabel = plan.tiers.join("/");
  return {
    title: plan.title,
    hypothesis:
      `Creators de ${plan.sectors.join(", ")} en ${plan.networks.join("+")} (tiers ${tierLabel}) ` +
      `producen partnerships rentables para la marca.`,
    targetSegment: `${plan.sectors.join(", ")} · ${plan.networks.join("+")} · tiers ${tierLabel}`,
    channels: plan.networks,
    type: "Partnerships",
    campaignKind: "creator",
    qualificationMode: plan.qualificationMode ?? "hybrid",
    disqualifyThreshold: plan.disqualifyThreshold ?? DEFAULT_CREATOR_MODEL_CONFIG.qualification.threshold,
  };
}

/** Resumen humano del plan (descripcion de la tarea Outreach + chat). */
export function describePlan(plan: DiscoveryPlan): string {
  const rows = [
    `Sectores: ${plan.sectors.join(" · ")}`,
    `Redes: ${plan.networks.join(" + ")}`,
    `Tiers: ${plan.tiers.join(" / ")}`,
  ];
  if (plan.audienceEsMinPct !== undefined) rows.push(`Audiencia: ≥ ${plan.audienceEsMinPct}% España`);
  if (plan.targetVolume !== undefined) rows.push(`Volumen: ~${plan.targetVolume} candidatos`);
  if (plan.signals?.competitorBrands?.length) {
    rows.push(`Señales: repeat vía ad-library (${plan.signals.competitorBrands.join(", ")})`);
  }
  if (plan.templates?.length) rows.push(`Plantillas: ${plan.templates.join(" · ")}`);
  return rows.join("\n");
}
