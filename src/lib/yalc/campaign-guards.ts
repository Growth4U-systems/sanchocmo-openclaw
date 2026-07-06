import { yalcFetch, type YalcRuntimeConfig } from "./client";
import {
  normalizeYalcCampaign,
  resolveCampaignKind,
  type YalcCampaignKind,
} from "./campaign-kind";

type RecordLike = Record<string, unknown>;

const CAMPAIGN_LAUNCHED_STATUS_RE = /(^|[\s_-])(published|live|sent|launched|completed|done|closed)([\s_-]|$)/;
const EXTERNAL_EMAIL_STATUS_RE = /\b(sent|delivered|opened|clicked|replied|bounced|unsubscribed|failed)\b/i;
const EXTERNAL_LIFECYCLE_STATUSES = new Set([
  "Connect_Sent",
  "Connected",
  "DM1_Sent",
  "DM2_Sent",
  "No_Reply",
  "Replied",
  "Negotiating",
  "Demo_Booked",
  "Deal_Created",
  "Closed_Won",
  "Closed_Lost",
  "Expired",
]);

export const LEAD_LOCKED_MESSAGE =
  "Esta campaña ya fue lanzada o sincronizada con Instantly/Unipile. Los leads quedan bloqueados; duplica la campaña para cambios.";

export class YalcGuardError extends Error {
  status: number;

  constructor(message: string, status = 409) {
    super(message);
    this.name = "YalcGuardError";
    this.status = status;
  }
}

function asRecord(value: unknown): RecordLike {
  return value && typeof value === "object" && !Array.isArray(value) ? value as RecordLike : {};
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function expectedKindFromText(value: unknown): YalcCampaignKind {
  const raw = text(value).toLowerCase();
  if (raw === "b2b") return "b2b";
  if (raw === "partnerships" || raw === "partnership" || raw === "creator" || raw === "creators") {
    return "creator";
  }
  return "unknown";
}

export function expectedCampaignKindFromInput(input: unknown): YalcCampaignKind {
  const row = asRecord(input);
  return [row.expectedKind, row.campaignKind, row.type]
    .map(expectedKindFromText)
    .find((kind) => kind !== "unknown") ?? "unknown";
}

function hasExternalSendSignal(lead: RecordLike): boolean {
  if (
    lead.instantlyCampaignId ||
    lead.connectSentAt ||
    lead.connectedAt ||
    lead.dm1SentAt ||
    lead.dm2SentAt ||
    lead.repliedAt
  ) {
    return true;
  }
  const lastMessage = asRecord(lead.lastMessage);
  if (Object.keys(lastMessage).length > 0 && text(lastMessage.status).toLowerCase() !== "dry_run") return true;
  const lifecycleStatus = text(lead.lifecycleStatus);
  if (lifecycleStatus && EXTERNAL_LIFECYCLE_STATUSES.has(lifecycleStatus)) return true;
  if (EXTERNAL_EMAIL_STATUS_RE.test(text(lead.emailStatus))) return true;
  return false;
}

export function campaignLocksLeadEdits(campaign: unknown, leads: unknown[] = []): boolean {
  const row = asRecord(campaign);
  const status = text(row.status).toLowerCase();
  if (CAMPAIGN_LAUNCHED_STATUS_RE.test(` ${status} `)) return true;
  return leads.map(asRecord).some(hasExternalSendSignal);
}

export async function assertCampaignKind(
  config: YalcRuntimeConfig,
  campaignId: string,
  expectedKind: YalcCampaignKind,
): Promise<RecordLike> {
  const campaign = await yalcFetch<RecordLike>(
    config,
    `/api/campaigns/${encodeURIComponent(campaignId)}`,
  );
  const normalized = normalizeYalcCampaign(campaign);
  const actualKind = resolveCampaignKind(normalized);
  if (expectedKind !== "unknown" && actualKind !== expectedKind) {
    const expectedLabel = expectedKind === "b2b" ? "B2B" : "Partnerships";
    const actualLabel = actualKind === "b2b" ? "B2B" : actualKind === "creator" ? "Partnerships" : "desconocida";
    throw new YalcGuardError(`La campaña pertenece a ${actualLabel}; no se puede modificar desde ${expectedLabel}.`);
  }
  return normalized;
}

export async function fetchCampaignLeads(
  config: YalcRuntimeConfig,
  campaignId: string,
): Promise<RecordLike[]> {
  const payload = await yalcFetch<RecordLike>(
    config,
    `/api/leads?campaignId=${encodeURIComponent(campaignId)}&include=lastMessage`,
  );
  return Array.isArray(payload.leads)
    ? payload.leads.filter((lead): lead is RecordLike => Boolean(lead) && typeof lead === "object")
    : [];
}

export async function assertCampaignLeadEditsUnlocked(
  config: YalcRuntimeConfig,
  campaignId: string,
  expectedKind: YalcCampaignKind,
): Promise<void> {
  const campaign = await assertCampaignKind(config, campaignId, expectedKind);
  const leads = await fetchCampaignLeads(config, campaignId);
  if (campaignLocksLeadEdits(campaign, leads)) {
    throw new YalcGuardError(LEAD_LOCKED_MESSAGE);
  }
}

export function yalcGuardErrorResponse(err: unknown) {
  if (err instanceof YalcGuardError) {
    return {
      status: err.status,
      body: { error: err.message },
    };
  }
  return null;
}
