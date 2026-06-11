/**
 * Partnerships (SAN-78) · mapeo kanban ↔ `lifecycleStatus` de Yalc + helpers puros.
 *
 * Fuente de verdad del mapeo: comment "Decisiones de diseño 2026-06-11" en SAN-77
 * (espejo de Yalc src/lib/qualification/transitions.ts):
 *
 *   Discovered  ↔ Sourced            (nuevo)
 *   Shortlist   ↔ Qualified
 *   Contacted   ↔ Queued · *sent
 *   Replied     ↔ Replied
 *   Negotiating ↔ Negotiating        (nuevo)
 *   Signed      ↔ Deal_Created
 *   Active      ↔ Closed_Won
 *   Closed      ↔ Closed_Lost · Expired
 *   (oculto)    ↔ Disqualified       (nuevo — consultable y reversible, NUNCA columna)
 *
 * CLIENT-SAFE: lógica pura, sin DOM ni Node — testeable con tsx --test.
 */

import type { PartnershipLead } from "./types";

export type PipelineStageKey =
  | "Discovered"
  | "Shortlist"
  | "Contacted"
  | "Replied"
  | "Negotiating"
  | "Signed"
  | "Active"
  | "Closed";

/** Pseudo-stage: Descartado no es columna — estado oculto consultable en la Lista. */
export const DISCARDED_STAGE = "Discarded" as const;
export type StageFilterKey = PipelineStageKey | typeof DISCARDED_STAGE;

export const DISQUALIFIED_STATUS = "Disqualified";

export interface PipelineStage {
  key: PipelineStageKey;
  label: string;
  /** Estados Yalc que caen en esta columna. */
  statuses: readonly string[];
  /** Estado canónico que se persiste (PATCH stage) al mover una card aquí. */
  canonicalStatus: string;
  /** Sublabel/tooltip bajo la cabecera de columna (decisión de diseño nº 4). */
  yalcSublabel: string;
  /** Tooltip de la cabecera (mockup contactos-kanban). */
  headTooltip?: string;
}

export const PIPELINE_STAGES: readonly PipelineStage[] = [
  {
    key: "Discovered",
    label: "Discovered",
    statuses: ["Sourced"],
    canonicalStatus: "Sourced",
    yalcSublabel: "yalc: Sourced",
    headTooltip: "Candidatos recién llegados de las búsquedas — pendientes de triaje",
  },
  {
    key: "Shortlist",
    label: "Shortlist",
    statuses: ["Qualified"],
    canonicalStatus: "Qualified",
    yalcSublabel: "yalc: Qualified",
    headTooltip: "Seleccionados tras revisar su quality — listos para contactar",
  },
  {
    key: "Contacted",
    label: "Contacted",
    statuses: ["Queued", "Connect_Sent", "Connected", "DM1_Sent", "DM2_Sent", "No_Reply"],
    canonicalStatus: "Queued",
    yalcSublabel: "yalc: Queued · Sent",
  },
  {
    key: "Replied",
    label: "Replied",
    statuses: ["Replied"],
    canonicalStatus: "Replied",
    yalcSublabel: "yalc: Replied",
  },
  {
    key: "Negotiating",
    label: "Negotiating",
    statuses: ["Negotiating", "Demo_Booked"],
    canonicalStatus: "Negotiating",
    yalcSublabel: "yalc: Negotiating",
  },
  {
    key: "Signed",
    label: "Signed",
    statuses: ["Deal_Created"],
    canonicalStatus: "Deal_Created",
    yalcSublabel: "yalc: Deal_Created",
  },
  {
    key: "Active",
    label: "Active",
    statuses: ["Closed_Won"],
    canonicalStatus: "Closed_Won",
    yalcSublabel: "yalc: Closed_Won",
  },
  {
    key: "Closed",
    label: "Closed",
    statuses: ["Closed_Lost", "Expired"],
    canonicalStatus: "Closed_Lost",
    yalcSublabel: "yalc: Closed_Lost · Expired",
  },
];

/** Roster = el mismo kanban filtrado a Signed + Active (no es otra pantalla). */
export const ROSTER_STAGES: readonly PipelineStageKey[] = ["Signed", "Active"];

const STATUS_TO_STAGE: Record<string, PipelineStageKey> = Object.fromEntries(
  PIPELINE_STAGES.flatMap((stage) => stage.statuses.map((status) => [status, stage.key])),
) as Record<string, PipelineStageKey>;

/** Columna del kanban para un `lifecycleStatus` de Yalc. Disqualified → "Discarded". */
export function stageForStatus(status?: string | null): StageFilterKey | null {
  if (!status) return null;
  if (status === DISQUALIFIED_STATUS) return DISCARDED_STAGE;
  return STATUS_TO_STAGE[status] ?? null;
}

/** Estado canónico a persistir cuando un humano mueve a una columna/stage. */
export function canonicalStatusForStage(stage: StageFilterKey): string {
  if (stage === DISCARDED_STAGE) return DISQUALIFIED_STATUS;
  const found = PIPELINE_STAGES.find((s) => s.key === stage);
  // Todas las keys de StageFilterKey están cubiertas; el fallback es defensivo.
  return found ? found.canonicalStatus : DISQUALIFIED_STATUS;
}

export function isDiscarded(lead: Pick<PartnershipLead, "lifecycleStatus">): boolean {
  return lead.lifecycleStatus === DISQUALIFIED_STATUS;
}

// ── Quality bands (paridad mockup contactos-lista: verde ≥85 · ámbar 70-84 · rojo <70) ──

export type QualityBand = "high" | "medium" | "low";

export function qualityBand(score?: number | null): QualityBand | null {
  if (typeof score !== "number" || !Number.isFinite(score)) return null;
  if (score >= 85) return "high";
  if (score >= 70) return "medium";
  return "low";
}

// ── Display helpers ──

export function leadDisplayName(lead: PartnershipLead): string {
  if (lead.handle && lead.handle.trim()) return lead.handle.trim();
  const name = [lead.firstName, lead.lastName].filter(Boolean).join(" ").trim();
  return name || lead.email || lead.id;
}

export type NetworkKey = "instagram" | "youtube" | "tiktok" | "other";

export function normalizeNetwork(network?: string | null): NetworkKey {
  const value = (network || "").trim().toLowerCase();
  if (value.startsWith("insta") || value === "ig") return "instagram";
  if (value.startsWith("you") || value === "yt") return "youtube";
  if (value.startsWith("tik") || value === "tt") return "tiktok";
  return "other";
}

export function formatFollowers(followers?: number | null): string {
  if (typeof followers !== "number" || !Number.isFinite(followers)) return "—";
  if (followers >= 1_000_000) return `${(followers / 1_000_000).toFixed(1).replace(".0", "")}M`;
  if (followers >= 1_000) return `${Math.round(followers / 1_000)}K`;
  return String(followers);
}

/**
 * Enteros es-ES con separador de miles SIEMPRE ("3.500", "1.534"). No vale
 * `toLocaleString("es-ES")` a secas: CLDR aplica `minimumGroupingDigits: 2`
 * al español y omite el punto entre 1.000–9.999 (4100 → "4100"). Mismo
 * formato determinista (sin ICU) que usa calc-creator-core en sus frases,
 * para que todos los importes de las superficies Partnerships coincidan.
 */
export function formatIntEs(value: number): string {
  const rounded = Math.round(value);
  const sign = rounded < 0 ? "-" : "";
  return sign + Math.abs(rounded).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

export function formatEur(value?: number | null): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return `${formatIntEs(value)}€`;
}

export function formatTier(tier?: string | null): string | null {
  const value = (tier || "").trim();
  if (!value) return null;
  return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
}

/**
 * Nota junto al precio según el punto del pipeline (paridad mockup:
 * "ofertado" en Negotiating · "pedido" en Replied · "firmado" en Signed/Active).
 */
export function feeStageNote(stage: StageFilterKey | null): string | null {
  if (stage === "Negotiating") return "ofertado";
  if (stage === "Replied") return "pedido";
  if (stage === "Signed" || stage === "Active") return "firmado";
  return null;
}

// ── Filtro + orden de la vista Lista (lógica pura, paridad mockup contactos-lista) ──

export type ListSortKey = "quality" | "fee";

export interface ListFilterState {
  /** Buscador por handle/nombre/empresa (case-insensitive). */
  search: string;
  /** "" = todos (sin descartados). DISCARDED_STAGE = solo descartados. */
  stage: StageFilterKey | "";
  /** Redes activas (normalizadas). Vacío = todas. */
  networks: NetworkKey[];
  /** campaignId de la búsqueda activa (?busqueda=). "" = todas. */
  busqueda: string;
  sortKey: ListSortKey | null;
  /** -1 desc (lo más alto arriba, default del mockup) · 1 asc. */
  sortDir: 1 | -1;
}

export const EMPTY_LIST_FILTER: ListFilterState = {
  search: "",
  stage: "",
  networks: [],
  busqueda: "",
  sortKey: null,
  sortDir: -1,
};

function sortValue(lead: PartnershipLead, key: ListSortKey): number {
  if (key === "quality") return typeof lead.qualityScore === "number" ? lead.qualityScore : -1;
  return typeof lead.offeredPrice === "number" ? lead.offeredPrice : -1;
}

/**
 * Filtra + ordena los leads para la vista Lista.
 * Reglas (mockup contactos-lista.html):
 *  - los Descartados quedan FUERA salvo filtro stage explícito "Discarded";
 *  - ?busqueda= restringe a la campaña/búsqueda;
 *  - buscador sobre handle / nombre / empresa;
 *  - chips de red filtran por red normalizada;
 *  - orden estable por quality o precio (null → al final en desc).
 */
export function filterAndSortLeads(
  leads: readonly PartnershipLead[],
  state: ListFilterState,
): PartnershipLead[] {
  const search = state.search.trim().toLowerCase();
  const filtered = leads.filter((lead) => {
    if (state.busqueda && lead.campaignId !== state.busqueda) return false;
    const stage = stageForStatus(lead.lifecycleStatus);
    if (!state.stage && stage === DISCARDED_STAGE) return false; // ocultos por defecto
    if (state.stage && stage !== state.stage) return false;
    if (search) {
      const haystack = [lead.handle, lead.firstName, lead.lastName, lead.company, lead.email]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      if (!haystack.includes(search)) return false;
    }
    if (state.networks.length > 0 && !state.networks.includes(normalizeNetwork(lead.network))) {
      return false;
    }
    return true;
  });

  if (!state.sortKey) return filtered;
  const key = state.sortKey;
  return filtered
    .slice()
    .sort((a, b) => (sortValue(a, key) - sortValue(b, key)) * state.sortDir);
}

/** Agrupa leads por columna del kanban (los Descartados no aparecen — no son columna). */
export function groupLeadsByStage(
  leads: readonly PartnershipLead[],
): Record<PipelineStageKey, PartnershipLead[]> {
  const groups = Object.fromEntries(
    PIPELINE_STAGES.map((stage) => [stage.key, [] as PartnershipLead[]]),
  ) as Record<PipelineStageKey, PartnershipLead[]>;
  for (const lead of leads) {
    const stage = stageForStatus(lead.lifecycleStatus);
    if (stage && stage !== DISCARDED_STAGE) groups[stage].push(lead);
  }
  return groups;
}
