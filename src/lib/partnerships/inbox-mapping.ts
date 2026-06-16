/**
 * Inbox de negociación (SAN-80) · estados derivados + filtros — lógica PURA.
 *
 * Los 8 chips del mockup `inbox.html` mapeados a los estados REALES del
 * enum `lifecycleStatus` de Yalc (`transitions.ts`) + el email tracking que
 * expone el serializer (emailSentAt / emailRepliedAt / emailBouncedAt /
 * emailStatus). Los que no existen como lifecycle se DERIVAN:
 *
 *   En cola     → Queued sin envío (gate pendiente)               [derivado]
 *   Contactado  → primer toque enviado: Queued+emailSentAt ·
 *                 Connect_Sent · Connected                        [derivado]
 *   Pendiente   → follow-ups en curso sin respuesta: DM1/DM2_Sent [derivado]
 *   Respondió   → Replied
 *   Reunión     → Demo_Booked
 *   Negociando  → Negotiating
 *   Parado      → No_Reply · Expired
 *   Rebotado    → emailBouncedAt / emailStatus 'bounced'          [derivado,
 *                 PRIORIDAD máxima: un rebote eclipsa el lifecycle]
 *
 * Los estados de cierre (Deal_Created/Closed_Won/Closed_Lost) salen del
 * Inbox: el deal vive ya en el Roster/kanban. Sourced/Qualified/Disqualified
 * aún no son conversación.
 *
 * CLIENT-SAFE: sin Node — testeable con tsx --test.
 */

import type { PartnershipLead } from "./types";

export type InboxStateKey =
  | "en-cola"
  | "contactado"
  | "pendiente"
  | "respondio"
  | "reunion"
  | "negociando"
  | "parado"
  | "rebotado";

export interface InboxStateMeta {
  key: InboxStateKey;
  /** Etiqueta del chip (mockup). */
  label: string;
  /** Clase de color del stchip (paridad estilos del mockup → tokens reales). */
  tone: "paper" | "blue" | "pale" | "yellow" | "navy" | "rust" | "aged" | "red";
  /** De dónde sale (tooltip honesto: enum real o derivado). */
  source: string;
}

export const INBOX_STATES: readonly InboxStateMeta[] = [
  { key: "en-cola", label: "En cola", tone: "paper", source: "yalc: Queued (sin envío — gate pendiente)" },
  { key: "contactado", label: "Contactado", tone: "blue", source: "derivado: Queued+enviado · Connect_Sent · Connected" },
  { key: "pendiente", label: "Pendiente", tone: "pale", source: "derivado: DM1_Sent · DM2_Sent (follow-ups sin respuesta)" },
  { key: "respondio", label: "Respondió", tone: "yellow", source: "yalc: Replied" },
  { key: "reunion", label: "Reunión", tone: "navy", source: "yalc: Demo_Booked" },
  { key: "negociando", label: "Negociando", tone: "rust", source: "yalc: Negotiating" },
  { key: "parado", label: "Parado", tone: "aged", source: "yalc: No_Reply · Expired" },
  { key: "rebotado", label: "Rebotado", tone: "red", source: "derivado: email bounced" },
];

export const INBOX_STATE_LABELS: Record<InboxStateKey, string> = Object.fromEntries(
  INBOX_STATES.map((state) => [state.key, state.label]),
) as Record<InboxStateKey, string>;

/** Subset del lead que necesita el mapeo (serializer de Yalc + SAN-80). */
export interface InboxLeadLike {
  lifecycleStatus?: string | null;
  emailSentAt?: string | null;
  emailRepliedAt?: string | null;
  emailBouncedAt?: string | null;
  emailStatus?: string | null;
}

/**
 * Estado del Inbox para un lead. `null` = no es una conversación del Inbox
 * (triaje previo o deal cerrado).
 */
export function inboxStateForLead(lead: InboxLeadLike): InboxStateKey | null {
  // 1 · Rebote: prioridad máxima — da igual el lifecycle.
  if (lead.emailBouncedAt || lead.emailStatus === "bounced") return "rebotado";

  const status = lead.lifecycleStatus || "";
  switch (status) {
    case "Queued":
      return lead.emailSentAt ? "contactado" : "en-cola";
    case "Connect_Sent":
    case "Connected":
      return "contactado";
    case "DM1_Sent":
    case "DM2_Sent":
      return "pendiente";
    case "Replied":
      return "respondio";
    case "Demo_Booked":
      return "reunion";
    case "Negotiating":
      return "negociando";
    case "No_Reply":
    case "Expired":
      return "parado";
    default:
      return null; // Sourced/Qualified/Disqualified/Deal_Created/Closed_* …
  }
}

/** Conversaciones del Inbox = leads con estado mapeado (orden: actividad reciente). */
export function inboxConversations<T extends InboxLeadLike & Pick<PartnershipLead, "updatedAt">>(
  leads: readonly T[],
): Array<T & { inboxState: InboxStateKey }> {
  return leads
    .map((lead) => ({ ...lead, inboxState: inboxStateForLead(lead) }))
    .filter((lead): lead is T & { inboxState: InboxStateKey } => lead.inboxState !== null)
    .sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""));
}

/** Contadores por chip (los 8 siempre presentes — count 0 → chip atenuado). */
export function inboxStateCounts(leads: readonly InboxLeadLike[]): Record<InboxStateKey, number> {
  const counts = Object.fromEntries(INBOX_STATES.map((state) => [state.key, 0])) as Record<
    InboxStateKey,
    number
  >;
  for (const lead of leads) {
    const state = inboxStateForLead(lead);
    if (state) counts[state] += 1;
  }
  return counts;
}
