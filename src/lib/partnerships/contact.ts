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
import { assertCampaignKind } from "@/lib/yalc/campaign-guards";
import {
  contactDraftPreviewsFromResponse,
  contactGateDraftsFromResponse,
  unresolvedVariablesFromDrafts,
  type ContactDraftPreview,
  type ContactGateDraft,
} from "./contact-preview";
import { findSearchByCampaign, findSearchSequence } from "./template-store";
import {
  findInvalidTemplateExpressions,
  findUnsupportedTemplateFallbacks,
  findUnsupportedTemplateVariables,
  toYalcTemplateText,
} from "./templates";
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
  drafts: ContactGateDraft[];
  unresolvedVariables: string[];
  canApprove: boolean;
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
  sequence?: Array<{
    subject?: string | null;
    body: string;
    delayDays?: number;
  }>;
  sequenceName?: string;
  /** dry-run obligatorio salvo `false` explícito (se reenvía a Yalc tal cual). */
  dryRun?: boolean;
  /**
   * Cuenta remitente de Unipile elegida en la UI (SAN-480). Contrato hacia
   * delante: se propaga tal cual a Yalc en el payload de `partner-contact`;
   * el daemon actual la ignora hasta que implemente la selección de cuenta.
   */
  senderAccountId?: string;
}

/**
 * Lanza el contacto. Devuelve un gate POR CAMPAÑA (lo normal es 1).
 * Falla con mensaje accionable si una búsqueda no tiene secuencia asignada.
 */
export async function contactPartnerLeads(
  input: ContactLeadsInput,
): Promise<ContactGateResult[]> {
  const { slug } = input;
  const leads = (input.leads || []).filter(
    (lead) => lead?.id && lead?.campaignId,
  );
  if (leads.length === 0)
    throw new PartnerContactError("Ningún lead válido para contactar.");

  const byCampaign = new Map<string, string[]>();
  for (const lead of leads) {
    const list = byCampaign.get(lead.campaignId) ?? [];
    list.push(lead.id);
    byCampaign.set(lead.campaignId, list);
  }

  const config = resolveYalcConfig(slug);
  const results: ContactGateResult[] = [];

  for (const [campaignId, leadIds] of byCampaign) {
    await assertCampaignKind(config, campaignId, "creator");

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
      // Valida primero los tokens públicos de la plantilla. Los merge-fields
      // internos (`nombre_perfil`/`sector_plan`) se introducen solo después.
      sequence = instance.steps.map((step) => ({
        subject: step.subject,
        body: step.body,
        delayDays: step.delayDays,
      }));
      sequenceName = sequenceName || instance.name;
    }

    const invalidExpressions = findInvalidTemplateExpressions(sequence);
    if (invalidExpressions.length > 0) {
      throw new PartnerContactError(
        `La secuencia contiene sintaxis de variable no válida: ${invalidExpressions.join(", ")}. ` +
          "Usa exactamente {{campo}} desde el catálogo.",
        409,
      );
    }
    const unsupported = findUnsupportedTemplateVariables(sequence);
    if (unsupported.length > 0) {
      throw new PartnerContactError(
        `La secuencia usa variables que no existen: ${unsupported.map((key) => `{{${key}}}`).join(", ")}. ` +
          "Edítala desde Plantillas y usa únicamente campos del catálogo.",
        409,
      );
    }
    const unsupportedFallbacks = findUnsupportedTemplateFallbacks(sequence);
    if (unsupportedFallbacks.length > 0) {
      throw new PartnerContactError(
        `La secuencia usa fallbacks que el envío no puede renderizar: ` +
          unsupportedFallbacks.map((key) => `{{${key} | "…"}}`).join(", ") +
          ". Usa variables simples del catálogo y revisa el preview por lead.",
        409,
      );
    }

    // Los tokens públicos nombre/sector se traducen a merge-fields literales
    // para evitar fallbacks inventados por el renderer actual de Yalc.
    sequence = sequence.map((step) => ({
      ...step,
      subject: step.subject ? toYalcTemplateText(step.subject) : step.subject,
      body: toYalcTemplateText(step.body),
    }));

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
          // SAN-480: cuenta remitente elegida (Unipile). El daemon actual la
          // ignora; el contrato queda tendido para cuando la implemente.
          ...(input.senderAccountId
            ? { senderAccountId: input.senderAccountId }
            : {}),
        },
      },
    );
    if (!response?.ok || !response.runId) {
      throw new PartnerContactError(
        response?.error || "Yalc no devolvió el gate del contacto.",
        502,
      );
    }
    const drafts = contactGateDraftsFromResponse(response.drafts);
    const unresolvedVariables = unresolvedVariablesFromDrafts(drafts);
    const returnedLeadIds = new Set(
      drafts
        .map((draft) => draft.leadId)
        .filter((leadId): leadId is string => Boolean(leadId)),
    );
    const hasPreviewForEveryLead =
      drafts.length === leadIds.length &&
      leadIds.every((leadId) => returnedLeadIds.has(leadId));
    if (
      !hasPreviewForEveryLead &&
      !unresolvedVariables.includes("preview_incompleto")
    ) {
      unresolvedVariables.push("preview_incompleto");
      unresolvedVariables.sort();
    }
    results.push({
      campaignId,
      runId: response.runId,
      gateId: response.gateId || "approve-send",
      prompt: response.prompt || "",
      queuedLeads: response.queuedLeads ?? leadIds.length,
      dryRun: response.dryRun !== false,
      sequenceName: sequenceName || "Secuencia de partners",
      draftCount: Array.isArray(response.drafts)
        ? response.drafts.length
        : leadIds.length,
      previews: contactDraftPreviewsFromResponse(response.drafts),
      drafts,
      unresolvedVariables,
      canApprove: hasPreviewForEveryLead && unresolvedVariables.length === 0,
    });
  }

  return results;
}
