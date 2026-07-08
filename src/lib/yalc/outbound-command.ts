import { assertCampaignKind, assertCampaignLeadEditsUnlocked } from "./campaign-guards";
import { ingestB2BContacts } from "@/lib/partnerships/b2b-ingest";
import {
  normalizeYalcCampaign,
  resolveCampaignKind,
  type YalcCampaignKind,
} from "./campaign-kind";
import { yalcFetch, type YalcRuntimeConfig } from "./client";

type RecordLike = Record<string, unknown>;

export type OutboundCommandName =
  | "outbound.plan"
  | "outbound.source"
  | "outbound.enrich"
  | "outbound.score"
  | "outbound.draft_sequence"
  | "outbound.linkedin_autopilot.plan"
  | "outbound.linkedin_autopilot.execute"
  | "outbound.approve_and_publish"
  | "outbound.status";

type ProfileKind = "b2b_contact" | "creator";
type CampaignType = "B2B" | "Partnerships";
type Provider = "apollo" | "crustdata" | "manual" | "company-db";
type Channel = "email" | "linkedin";

export class OutboundCommandError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "OutboundCommandError";
    this.status = status;
  }
}

export interface OutboundCommandResult {
  ok: true;
  command: OutboundCommandName;
  httpStatus?: number;
  [key: string]: unknown;
}

function asRecord(value: unknown): RecordLike {
  return value && typeof value === "object" && !Array.isArray(value) ? value as RecordLike : {};
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function requiredText(input: RecordLike, key: string): string {
  const value = text(input[key]);
  if (!value) throw new OutboundCommandError(`${key} is required`);
  return value;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map(text).filter(Boolean)
    : [];
}

function commandName(value: unknown): OutboundCommandName {
  const name = text(value) as OutboundCommandName;
  const allowed: OutboundCommandName[] = [
    "outbound.plan",
    "outbound.source",
    "outbound.enrich",
    "outbound.score",
    "outbound.draft_sequence",
    "outbound.linkedin_autopilot.plan",
    "outbound.linkedin_autopilot.execute",
    "outbound.approve_and_publish",
    "outbound.status",
  ];
  if (!allowed.includes(name)) {
    throw new OutboundCommandError(`Unsupported outbound command: ${name || "(missing)"}`);
  }
  return name;
}

function campaignType(value: unknown): CampaignType {
  const raw = text(value);
  if (raw === "B2B") return "B2B";
  if (raw === "Partnerships") return "Partnerships";
  throw new OutboundCommandError("campaignType must be B2B or Partnerships");
}

function profileKind(value: unknown): ProfileKind {
  const raw = text(value);
  if (raw === "b2b_contact" || raw === "creator") return raw;
  throw new OutboundCommandError("profileKind must be b2b_contact or creator");
}

function provider(value: unknown): Provider {
  const raw = text(value) || "manual";
  if (raw === "apollo" || raw === "crustdata" || raw === "manual" || raw === "company-db") return raw;
  throw new OutboundCommandError("provider must be apollo, crustdata, manual, or company-db");
}

function channel(value: unknown): Channel {
  const raw = text(value);
  if (raw === "email" || raw === "linkedin") return raw;
  throw new OutboundCommandError("channel must be email or linkedin");
}

function finiteLimit(value: unknown): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n <= 0) throw new OutboundCommandError("limit must be a positive number");
  return Math.floor(n);
}

function kindFromCampaignType(type: CampaignType): Exclude<YalcCampaignKind, "unknown"> {
  return type === "B2B" ? "b2b" : "creator";
}

function kindFromProfileKind(kind: ProfileKind): Exclude<YalcCampaignKind, "unknown"> {
  return kind === "b2b_contact" ? "b2b" : "creator";
}

function campaignTypeFromKind(kind: Exclude<YalcCampaignKind, "unknown">): CampaignType {
  return kind === "b2b" ? "B2B" : "Partnerships";
}

function scoreKind(value: unknown): Exclude<YalcCampaignKind, "unknown"> {
  const raw = text(value);
  if (raw === "b2b_fit_v1") return "b2b";
  if (raw === "creator_quality_v1") return "creator";
  throw new OutboundCommandError("scoreModel must be b2b_fit_v1 or creator_quality_v1");
}

function kindPayload(kind: Exclude<YalcCampaignKind, "unknown">): RecordLike {
  return {
    expectedKind: kind,
    campaignKind: kind,
    type: campaignTypeFromKind(kind),
  };
}

function extractCampaignId(payload: unknown): string | null {
  const row = asRecord(payload);
  const nested = asRecord(row.campaign);
  return text(row.campaignId) || text(row.id) || text(nested.id) || null;
}

function targetSegment(target: RecordLike): string {
  for (const key of ["segment", "title", "name", "industry", "persona"]) {
    const value = text(target[key]);
    if (value) return value;
  }
  const entries = Object.entries(target)
    .filter(([, value]) => value !== undefined && value !== null && value !== "")
    .slice(0, 4);
  return entries.length ? entries.map(([key, value]) => `${key}: ${String(value)}`).join("; ") : "Outbound target";
}

function pickSequence(input: RecordLike): unknown[] {
  for (const key of ["sequence", "emails", "emailSequence", "email_sequence", "steps", "messages"]) {
    const value = input[key];
    if (Array.isArray(value) && value.length > 0) return value;
  }
  return [];
}

function pickManualLeads(input: RecordLike, criteria: RecordLike): unknown[] {
  for (const value of [input.leads, criteria.leads, criteria.candidates, criteria.items]) {
    if (Array.isArray(value) && value.length > 0) return value;
  }
  return [];
}

function extractRows(value: unknown, key: string): unknown[] {
  const row = asRecord(value);
  const direct = row[key];
  return Array.isArray(direct) ? direct : [];
}

function extractProviderRuns(...payloads: unknown[]): unknown[] {
  const out: unknown[] = [];
  for (const payload of payloads) {
    const row = asRecord(payload);
    for (const key of ["providerRuns", "provider_runs", "runs"]) {
      const value = row[key];
      if (Array.isArray(value)) out.push(...value);
    }
    const events = row.events;
    if (Array.isArray(events)) {
      out.push(
        ...events.filter((event) => {
          const evt = asRecord(event);
          return /\b(provider|apollo|crustdata|instantly|unipile)\b/i.test(
            [evt.type, evt.kind, evt.source, evt.provider, evt.name].map(text).filter(Boolean).join(" "),
          );
        }),
      );
    }
  }
  return out;
}

async function plan(config: YalcRuntimeConfig, input: RecordLike, command: OutboundCommandName): Promise<OutboundCommandResult> {
  const type = campaignType(input.campaignType);
  const kind = kindFromCampaignType(type);
  const goal = requiredText(input, "goal");
  const target = asRecord(input.target);
  const channels = stringArray(input.channels);
  if (channels.length === 0) throw new OutboundCommandError("channels must include at least one channel");

  const title = text(input.title) || text(input.name) || goal;
  const body = {
    ...input,
    command: undefined,
    type,
    campaignType: type,
    campaignKind: kind,
    title,
    hypothesis: text(input.hypothesis) || goal,
    goal,
    target,
    targetSegment: text(input.targetSegment) || targetSegment(target),
    channels,
    source: "outbound.command",
  };
  const campaign = normalizeYalcCampaign(
    await yalcFetch<RecordLike>(config, "/api/campaigns", { method: "POST", body }),
    kind,
  );
  const campaignId = extractCampaignId(campaign);
  if (!campaignId) throw new OutboundCommandError("YALC did not return a campaign id", 502);

  return { ok: true, command, httpStatus: 201, campaignId, campaign };
}

async function source(config: YalcRuntimeConfig, input: RecordLike, command: OutboundCommandName): Promise<OutboundCommandResult> {
  const campaignId = requiredText(input, "campaignId");
  const pKind = profileKind(input.profileKind);
  const kind = kindFromProfileKind(pKind);
  const selectedProvider = provider(input.provider);
  const criteria = asRecord(input.criteria);
  const limit = finiteLimit(input.limit);
  const payload = {
    ...criteria,
    criteria,
    provider: selectedProvider,
    profileKind: pKind,
    ...(limit ? { limit } : {}),
    ...kindPayload(kind),
    source: "outbound.command",
  };

  if (selectedProvider === "manual") {
    const leads = pickManualLeads(input, criteria);
    if (leads.length === 0) {
      throw new OutboundCommandError("manual outbound.source requires criteria.leads or leads");
    }
    if (kind === "b2b") {
      await assertCampaignLeadEditsUnlocked(config, campaignId, kind);
    }
    const result = await yalcFetch<RecordLike>(
      config,
      `/api/campaigns/${encodeURIComponent(campaignId)}/leads/assign`,
      { method: "POST", body: { ...payload, leads } },
    );
    return { ok: true, command, httpStatus: 201, campaignId, profileKind: pKind, provider: selectedProvider, result };
  }

  if (selectedProvider === "company-db") {
    if (kind !== "b2b") {
      throw new OutboundCommandError("company-db outbound.source is only valid for profileKind b2b_contact");
    }
    const result = await ingestB2BContacts(config, { ...input, campaignId });
    return { ok: true, command, httpStatus: 201, campaignId, profileKind: pKind, provider: selectedProvider, result };
  }

  await assertCampaignLeadEditsUnlocked(config, campaignId, kind);
  const result = await yalcFetch<RecordLike>(
    config,
    `/api/campaigns/${encodeURIComponent(campaignId)}/leads/search`,
    { method: "POST", body: payload },
  );
  return { ok: true, command, campaignId, profileKind: pKind, provider: selectedProvider, result };
}

async function enrich(config: YalcRuntimeConfig, input: RecordLike, command: OutboundCommandName): Promise<OutboundCommandResult> {
  const campaignId = text(input.campaignId);
  const providers = stringArray(input.providers);
  if (providers.length === 0) throw new OutboundCommandError("providers must include at least one provider");
  const entityIds = stringArray(input.entityIds);

  if (!campaignId) {
    throw new OutboundCommandError(
      "outbound.enrich with entityIds requires the entity store slice; pass campaignId in this repo version.",
      501,
    );
  }

  await assertCampaignLeadEditsUnlocked(config, campaignId, "unknown");
  const result = await yalcFetch<RecordLike>(
    config,
    `/api/campaigns/${encodeURIComponent(campaignId)}/leads/enrich`,
    { method: "POST", body: { ...input, providers, entityIds, source: "outbound.command" } },
  );
  return { ok: true, command, campaignId, providers, entityIds, result };
}

async function score(config: YalcRuntimeConfig, input: RecordLike, command: OutboundCommandName): Promise<OutboundCommandResult> {
  const campaignId = requiredText(input, "campaignId");
  const model = requiredText(input, "scoreModel");
  const kind = scoreKind(model);
  await assertCampaignLeadEditsUnlocked(config, campaignId, kind);
  const result = await yalcFetch<RecordLike>(
    config,
    `/api/campaigns/${encodeURIComponent(campaignId)}/score`,
    { method: "POST", body: { ...input, ...kindPayload(kind), source: "outbound.command" } },
  );
  return { ok: true, command, campaignId, scoreModel: model, result };
}

async function draftSequence(config: YalcRuntimeConfig, input: RecordLike, command: OutboundCommandName): Promise<OutboundCommandResult> {
  const campaignId = requiredText(input, "campaignId");
  const ch = channel(input.channel);
  const pKind = profileKind(input.profileKind);
  const kind = kindFromProfileKind(pKind);
  const sequence = pickSequence(input);
  if (sequence.length === 0) {
    throw new OutboundCommandError("outbound.draft_sequence requires a non-empty sequence/emails array");
  }
  if (kind === "b2b") {
    await assertCampaignLeadEditsUnlocked(config, campaignId, kind);
  }
  const result = await yalcFetch<RecordLike>(
    config,
    `/api/campaigns/${encodeURIComponent(campaignId)}/sequence/update`,
    {
      method: "POST",
      body: {
        ...input,
        channel: ch,
        profileKind: pKind,
        sequence,
        ...kindPayload(kind),
        source: "outbound.command",
      },
    },
  );
  return { ok: true, command, campaignId, channel: ch, profileKind: pKind, result };
}

async function linkedinAutopilot(
  config: YalcRuntimeConfig,
  input: RecordLike,
  command: Extract<OutboundCommandName, "outbound.linkedin_autopilot.plan" | "outbound.linkedin_autopilot.execute">,
): Promise<OutboundCommandResult> {
  const campaignId = requiredText(input, "campaignId");
  await assertCampaignKind(config, campaignId, "b2b");
  const result = await yalcFetch<RecordLike>(config, "/api/outbound/command", {
    method: "POST",
    body: {
      ...input,
      command,
      campaignId,
      expectedKind: "b2b",
      profileKind: "b2b_contact",
      type: "B2B",
      source: "outbound.command",
    },
  });
  return { ok: true, command, campaignId, ...result };
}

async function approveAndPublish(
  config: YalcRuntimeConfig,
  input: RecordLike,
  command: OutboundCommandName,
): Promise<OutboundCommandResult> {
  const campaignId = requiredText(input, "campaignId");
  const ch = channel(input.channel);
  const pKind = profileKind(input.profileKind);
  const kind = kindFromProfileKind(pKind);
  const dryRun = input.dryRun !== false;

  await assertCampaignKind(config, campaignId, kind);
  const baseBody = { ...input, channel: ch, profileKind: pKind, ...kindPayload(kind), source: "outbound.command" };
  const approval = await yalcFetch<RecordLike>(
    config,
    `/api/campaigns/${encodeURIComponent(campaignId)}/sequence/approve`,
    { method: "POST", body: baseBody },
  );
  const publishPath = dryRun ? "dry-run" : "publish";
  const publishBody = dryRun
    ? { ...baseBody, dryRun: true, confirmDryRun: true }
    : { ...baseBody, dryRun: false, confirmInstantlyPublish: true };
  const publish = await yalcFetch<RecordLike>(
    config,
    `/api/campaigns/${encodeURIComponent(campaignId)}/${publishPath}`,
    { method: "POST", body: publishBody },
  );
  return {
    ok: true,
    command,
    campaignId,
    channel: ch,
    profileKind: pKind,
    dryRun,
    approval,
    publish,
  };
}

async function status(config: YalcRuntimeConfig, input: RecordLike, command: OutboundCommandName): Promise<OutboundCommandResult> {
  const campaignId = requiredText(input, "campaignId");
  const encoded = encodeURIComponent(campaignId);
  const [campaign, leads, readiness, events] = await Promise.all([
    yalcFetch<RecordLike>(config, `/api/campaigns/${encoded}`),
    yalcFetch<RecordLike>(config, `/api/campaigns/${encoded}/leads`),
    yalcFetch<RecordLike>(config, `/api/campaigns/${encoded}/readiness`),
    yalcFetch<RecordLike>(config, `/api/campaigns/${encoded}/events`),
  ]);
  const normalizedCampaign = normalizeYalcCampaign(campaign);
  const leadRows = extractRows(leads, "leads");
  return {
    ok: true,
    command,
    campaignId,
    campaign: normalizedCampaign,
    campaignKind: resolveCampaignKind(normalizedCampaign),
    leads,
    leadsCount: leadRows.length,
    readiness,
    events,
    providerRuns: extractProviderRuns(readiness, events),
  };
}

export async function dispatchOutboundCommand(
  config: YalcRuntimeConfig,
  raw: unknown,
): Promise<OutboundCommandResult> {
  const input = asRecord(raw);
  const command = commandName(input.command);
  switch (command) {
    case "outbound.plan":
      return plan(config, input, command);
    case "outbound.source":
      return source(config, input, command);
    case "outbound.enrich":
      return enrich(config, input, command);
    case "outbound.score":
      return score(config, input, command);
    case "outbound.draft_sequence":
      return draftSequence(config, input, command);
    case "outbound.linkedin_autopilot.plan":
    case "outbound.linkedin_autopilot.execute":
      return linkedinAutopilot(config, input, command);
    case "outbound.approve_and_publish":
      return approveAndPublish(config, input, command);
    case "outbound.status":
      return status(config, input, command);
  }
}

export function outboundCommandErrorResponse(err: unknown) {
  if (err instanceof OutboundCommandError) {
    return { status: err.status, body: { error: err.message } };
  }
  return null;
}
