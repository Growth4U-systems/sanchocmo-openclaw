export type YalcCampaignKind = "b2b" | "creator" | "unknown";

type RecordLike = Record<string, unknown>;

const CREATOR_MARKERS = [
  "partnership",
  "partnerships",
  "creator",
  "creators",
  "creador",
  "creadores",
  "influencer",
  "influencers",
  "scrapecreators",
  "co-marketing",
  "post patrocinado",
] as const;

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asRecord(value: unknown): RecordLike {
  return value && typeof value === "object" ? (value as RecordLike) : {};
}

function kindFromType(value: unknown): YalcCampaignKind {
  const type = text(value).toLowerCase();
  if (type === "b2b") return "b2b";
  if (type === "partnerships" || type === "partnership" || type === "creator" || type === "creators") return "creator";
  return "unknown";
}

function includesCreatorMarker(value: string): boolean {
  const lower = value.toLowerCase();
  return CREATOR_MARKERS.some((marker) => lower.includes(marker));
}

function campaignText(row: RecordLike): string {
  const channels = row.channels;
  return [
    row.type,
    row.campaignType,
    row.title,
    row.campaignTitle,
    row.targetSegment,
    row.hypothesis,
    Array.isArray(channels) ? channels.join(" ") : channels,
    row.source,
    Array.isArray(row.tags) ? row.tags.join(" ") : null,
  ]
    .map(text)
    .filter(Boolean)
    .join(" ");
}

export function campaignKindLabel(kind: YalcCampaignKind): string {
  if (kind === "b2b") return "Campaña B2B";
  if (kind === "creator") return "Campaña creator";
  return "Campaña";
}

export function resolveCampaignKind(value: unknown, fallback: YalcCampaignKind = "unknown"): YalcCampaignKind {
  const row = asRecord(value);
  const explicit = [row.campaignKind, row.type, row.campaignType]
    .map(kindFromType)
    .find((kind) => kind !== "unknown") ?? "unknown";
  if (explicit !== "unknown") return explicit;
  if (includesCreatorMarker(campaignText(row))) return "creator";
  return fallback;
}

export function normalizeYalcCampaign<T extends RecordLike>(
  campaign: T,
  fallback: YalcCampaignKind = "unknown",
): T & { campaignKind: YalcCampaignKind; campaignKindLabel: string } {
  const campaignKind = resolveCampaignKind(campaign, fallback);
  return {
    ...campaign,
    campaignKind,
    campaignKindLabel: campaignKindLabel(campaignKind),
  };
}

export function normalizeYalcCampaignPayload<T extends RecordLike>(
  payload: T,
  fallback: YalcCampaignKind = "unknown",
): T {
  const campaigns = payload.campaigns;
  if (!Array.isArray(campaigns)) return payload;
  return {
    ...payload,
    campaigns: campaigns
      .filter((campaign): campaign is RecordLike => Boolean(campaign) && typeof campaign === "object")
      .map((campaign) => normalizeYalcCampaign(campaign, fallback)),
  };
}

export function normalizeYalcLead<T extends RecordLike>(
  lead: T,
  fallback: YalcCampaignKind = "unknown",
): T & { campaignKind: YalcCampaignKind; campaignKindLabel: string } {
  const campaignKind = resolveCampaignKind(lead, fallback);
  return {
    ...lead,
    campaignKind,
    campaignKindLabel: campaignKindLabel(campaignKind),
  };
}

export function normalizeYalcLeadPayload<T extends RecordLike>(
  payload: T,
  fallback: YalcCampaignKind = "unknown",
): T {
  const leads = payload.leads;
  if (!Array.isArray(leads)) return payload;
  return {
    ...payload,
    leads: leads
      .filter((lead): lead is RecordLike => Boolean(lead) && typeof lead === "object")
      .map((lead) => normalizeYalcLead(lead, fallback)),
  };
}

export function isCampaignKind(row: unknown, kind: Exclude<YalcCampaignKind, "unknown">): boolean {
  return Boolean(row && resolveCampaignKind(row) === kind);
}
