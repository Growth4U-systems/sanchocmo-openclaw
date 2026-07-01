/**
 * Contacto de partners (SAN-80) · UNA lógica para las tres superficies.
 *
 * "Contactar" (bulk en Contactos · Shortlist→Contacted · Enviar del Inbox):
 * agrupa los leads por campaña, localiza la búsqueda de cada campaña y su
 * SECUENCIA instanciada (plantilla asignada, SAN-80) y llama al motor de
 * envío de Yalc (`POST /api/campaigns/:id/partner-contact`), que renderiza
 * draft-per-lead, mueve a Queued y crea el GateItem humano. El envío real
 * solo ocurre al aprobar el gate (dry-run salvo opt-out explícito).
 *
 * Consumidores: `POST /api/partnerships/contact`, el Inbox (reply única) y
 * el camino Shortlist→Contacted de la UI. El MCP usa los gates existentes
 * (`yalc_list_gates` + `yalc_approve_gate`).
 */

import { resolveYalcConfig, yalcFetch } from "@/lib/yalc/client";
import { contactDraftPreviewsFromResponse, type ContactDraftPreview } from "./contact-preview";
import { findSearchByCampaign, findSearchSequence } from "./template-store";
import { toYalcSequence } from "./templates";
import type { PartnershipLead } from "./types";

export class PartnerContactError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = "PartnerContactError";
    this.status = status;
  }
}

export interface ContactGateResult {
  campaignId: string;
  runId: string;
  gateId: string;
  prompt: string;
  queuedLeads: number;
  dryRun: boolean;
  sequenceName: string;
  draftCount: number;
  previews: ContactDraftPreview[];
}

interface YalcPartnerContactResponse {
  ok?: boolean;
  runId?: string;
  gateId?: string;
  prompt?: string;
  queuedLeads?: number;
  dryRun?: boolean;
  drafts?: unknown[];
  error?: string;
}

export interface ContactLeadsInput {
  slug: string;
  /** Leads ya cargados (la UI los tiene; el endpoint los pide a Yalc). */
  leads: Array<Pick<PartnershipLead, "id" | "campaignId">>;
  /**
   * Secuencia explícita (Inbox: la respuesta del borrador como paso único).
   * Sin ella se usa la plantilla de secuencia instanciada en la búsqueda.
   */
  sequence?: Array<{ subject?: string | null; body: string; delayDays?: number }>;
  sequenceName?: string;
  /** dry-run obligatorio salvo `false` explícito (se reenvía a Yalc tal cual). */
  dryRun?: boolean;
}

/**
 * Lanza el contacto. Devuelve un gate POR CAMPAÑA (lo normal es 1).
 * Falla con mensaje accionable si una búsqueda no tiene secuencia asignada.
 */
export async function contactPartnerLeads(input: ContactLeadsInput): Promise<ContactGateResult[]> {
  const { slug } = input;
  const leads = (input.leads || []).filter((lead) => lead?.id && lead?.campaignId);
  if (leads.length === 0) throw new PartnerContactError("Ningún lead válido para contactar.");

  const byCampaign = new Map<string, string[]>();
  for (const lead of leads) {
    const list = byCampaign.get(lead.campaignId) ?? [];
    list.push(lead.id);
    byCampaign.set(lead.campaignId, list);
  }

  const config = resolveYalcConfig(slug);
  const results: ContactGateResult[] = [];

  for (const [campaignId, leadIds] of byCampaign) {
    let sequence = input.sequence;
    let sequenceName = input.sequenceName;

    if (!sequence || sequence.length === 0) {
      const search = findSearchByCampaign(slug, campaignId);
      const instance = search ? findSearchSequence(search) : null;
      if (!instance) {
        throw new PartnerContactError(
          `La búsqueda de la campaña ${campaignId} no tiene una secuencia asignada — ` +
            `asigna una plantilla desde Plantillas o el chip "＋ asignar plantilla" de Encuentra.`,
          409,
        );
      }
      sequence = toYalcSequence(instance);
      sequenceName = sequenceName || instance.name;
    }

    const response = await yalcFetch<YalcPartnerContactResponse>(
      config,
      `/api/campaigns/${encodeURIComponent(campaignId)}/partner-contact`,
      {
        method: "POST",
        body: {
          leadIds,
          sequence,
          sequenceName: sequenceName || "Secuencia de partners",
          // NUNCA envío real salvo opt-out explícito del caller.
          dryRun: input.dryRun === false ? false : true,
        },
      },
    );
    if (!response?.ok || !response.runId) {
      throw new PartnerContactError(response?.error || "Yalc no devolvió el gate del contacto.", 502);
    }
    results.push({
      campaignId,
      runId: response.runId,
      gateId: response.gateId || "approve-send",
      prompt: response.prompt || "",
      queuedLeads: response.queuedLeads ?? leadIds.length,
      dryRun: response.dryRun !== false,
      sequenceName: sequenceName || "Secuencia de partners",
      draftCount: Array.isArray(response.drafts) ? response.drafts.length : leadIds.length,
      previews: contactDraftPreviewsFromResponse(response.drafts).slice(0, 3),
    });
  }

  return results;
}
