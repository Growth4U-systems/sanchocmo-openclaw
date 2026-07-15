import { yalcFetch, type YalcRuntimeConfig } from "@/lib/yalc/client";
import {
  contactGateDraftsFromResponse,
  unresolvedVariablesFromDrafts,
} from "./contact-preview";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

export interface PartnerContactGatePreflight {
  isPartnerContact: boolean;
  hasPreview: boolean;
  unresolvedVariables: string[];
  canApprove: boolean;
}

/** Preflight compartido por UI y MCP; ninguna vía puede saltarse el gate. */
export async function preflightPartnerContactGate(
  config: YalcRuntimeConfig,
  runId: string,
  edits: unknown,
): Promise<PartnerContactGatePreflight | null> {
  const awaiting = await yalcFetch<{ items?: unknown[] }>(config, "/api/gates/awaiting");
  const gate = (awaiting.items || [])
    .filter(isRecord)
    .find((item) => item.run_id === runId || item.runId === runId);
  if (!gate) return null;
  const payload = isRecord(gate.payload) ? gate.payload : {};
  if (payload.kind !== "partner-contact") return {
    isPartnerContact: false,
    hasPreview: true,
    unresolvedVariables: [],
    canApprove: true,
  };

  const editedPayload = isRecord(edits) ? edits : {};
  const rawDrafts = Array.isArray(editedPayload.drafts) ? editedPayload.drafts : payload.drafts;
  const drafts = contactGateDraftsFromResponse(rawDrafts);
  const unresolvedVariables = unresolvedVariablesFromDrafts(drafts);
  const hasPreview = drafts.length > 0;
  return {
    isPartnerContact: true,
    hasPreview,
    unresolvedVariables,
    canApprove: hasPreview && unresolvedVariables.length === 0,
  };
}

export function partnerContactPreflightError(
  preflight: PartnerContactGatePreflight | null,
): string | null {
  if (!preflight?.isPartnerContact || preflight.canApprove) return null;
  if (!preflight.hasPreview) {
    return "No se puede aprobar: Yalc no devolvió un preview verificable para este gate.";
  }
  return `No se puede aprobar: faltan ${preflight.unresolvedVariables
    .map((key) => `{{${key}}}`)
    .join(", ")}.`;
}
