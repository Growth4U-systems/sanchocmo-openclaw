import { assertCampaignKind, assertCampaignLeadEditsUnlocked } from "./campaign-guards";
import { ingestB2BContacts } from "@/lib/partnerships/b2b-ingest";
import { buildPhaseOneLinkedInTemplate } from "@/lib/outreach/phase-one-message";
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
  | "outbound.personalize"
  | "outbound.draft_sequence"
  | "outbound.linkedin_autopilot.plan"
  | "outbound.linkedin_autopilot.execute"
  | "outbound.workflow.prepare"
  | "outbound.workflow.approve"
  | "outbound.workflow.execute"
  | "outbound.workflow.status"
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

const SIMULATED_MARKER_KEYS = new Set(["mock", "simulated", "fixture", "fixtures", "demo"]);
const SIMULATED_MARKER_VALUES = new Set(["mock", "simulated", "simulation", "fixture", "fixtures", "demo"]);

function containsSimulatedOutboundData(value: unknown, depth = 0, seen = new Set<object>()): boolean {
  if (depth > 5 || value === null || typeof value !== "object") return false;
  if (seen.has(value)) return false;
  seen.add(value);

  if (Array.isArray(value)) {
    return value.some((item) => containsSimulatedOutboundData(item, depth + 1, seen));
  }

  for (const [rawKey, item] of Object.entries(value as RecordLike)) {
    const key = rawKey.toLowerCase().replace(/[_-]/g, "");
    if (SIMULATED_MARKER_KEYS.has(key) && item === true) return true;
    if (
      (key === "mode" || key === "source" || key === "provenance" || key === "datamode") &&
      typeof item === "string" &&
      SIMULATED_MARKER_VALUES.has(item.trim().toLowerCase())
    ) {
      return true;
    }
    if (containsSimulatedOutboundData(item, depth + 1, seen)) return true;
  }
  return false;
}

function assertRealOutboundData(value: unknown, operation: string): void {
  if (!containsSimulatedOutboundData(value)) return;
  throw new OutboundCommandError(
    `YALC devolvi\u00f3 datos simulados para ${operation}. Configura un proveedor real o aporta registros reales; Sancho no continuar\u00e1 con mocks, fixtures ni demos.`,
    502,
  );
}

function callbackFields(input: RecordLike): RecordLike {
  const callbackUrl = text(input.callbackUrl);
  const callbackContext = asRecord(input.callbackContext);
  return {
    ...(callbackUrl ? { callbackUrl } : {}),
    ...(Object.keys(callbackContext).length > 0 ? { callbackContext } : {}),
  };
}

function queuedJob(value: unknown): { jobId: string; statusUrl: string | null } | null {
  const row = asRecord(value);
  const jobId = text(row.jobId);
  const status = text(row.status).toLowerCase();
  if (!jobId || (status !== "queued" && status !== "running")) return null;
  return { jobId, statusUrl: text(row.statusUrl) || null };
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

const SOURCE_CRITERIA_ALIASES: ReadonlyArray<readonly [string, readonly string[]]> = [
  ["titles", ["titles", "person_titles", "roles", "title_keywords", "job_titles"]],
  ["seniorities", ["seniorities", "person_seniorities"]],
  ["personLocations", ["personLocations", "person_locations", "person_geo", "person_country"]],
  ["organizationLocations", [
    "organizationLocations",
    "organization_locations",
    "companyLocations",
    "company_locations",
  ]],
  ["organizationDomains", [
    "organizationDomains",
    "organization_domains",
    "companyDomains",
    "company_domains",
    "q_organization_domains_list",
  ]],
  ["employeeRanges", [
    "employeeRanges",
    "employee_ranges",
    "company_num_employees_ranges",
    "organization_num_employees_ranges",
    "company_employee_ranges",
  ]],
  ["emailStatuses", [
    "emailStatuses",
    "email_statuses",
    "contact_email_status",
    "contact_email_statuses",
  ]],
];

function sourceCriteriaValues(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(text).filter(Boolean);
  const single = text(value);
  return single ? [single] : [];
}

function normalizeSourceCriteria(value: unknown): RecordLike {
  const raw = asRecord(value);
  const normalized: RecordLike = { ...raw };
  for (const [canonical, aliases] of SOURCE_CRITERIA_ALIASES) {
    for (const alias of aliases) {
      const values = sourceCriteriaValues(raw[alias]);
      if (values.length === 0) continue;
      normalized[canonical] = values;
      break;
    }
  }
  return normalized;
}

function commandName(value: unknown): OutboundCommandName {
  const name = text(value) as OutboundCommandName;
  const allowed: OutboundCommandName[] = [
    "outbound.plan",
    "outbound.source",
    "outbound.enrich",
    "outbound.score",
    "outbound.personalize",
    "outbound.draft_sequence",
    "outbound.linkedin_autopilot.plan",
    "outbound.linkedin_autopilot.execute",
    "outbound.workflow.prepare",
    "outbound.workflow.approve",
    "outbound.workflow.execute",
    "outbound.workflow.status",
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
  const criteria = normalizeSourceCriteria(input.criteria);
  const limit = finiteLimit(input.limit);
  const payload = {
    ...criteria,
    criteria,
    provider: selectedProvider,
    profileKind: pKind,
    ...(limit ? { limit } : {}),
    ...kindPayload(kind),
    source: "outbound.command",
    ...callbackFields(input),
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
    assertRealOutboundData(result, "la carga de personas");
    return { ok: true, command, httpStatus: 201, campaignId, profileKind: pKind, provider: selectedProvider, result };
  }

  if (selectedProvider === "company-db") {
    if (kind !== "b2b") {
      throw new OutboundCommandError("company-db outbound.source is only valid for profileKind b2b_contact");
    }
    const result = await ingestB2BContacts(config, { ...input, campaignId });
    assertRealOutboundData(result, "la carga de personas");
    return { ok: true, command, httpStatus: 201, campaignId, profileKind: pKind, provider: selectedProvider, result };
  }

  await assertCampaignLeadEditsUnlocked(config, campaignId, kind);
  const result = await yalcFetch<RecordLike>(
    config,
    `/api/campaigns/${encodeURIComponent(campaignId)}/leads/search`,
    { method: "POST", body: payload },
  );
  assertRealOutboundData(result, "la b\u00fasqueda de personas");
  const queued = queuedJob(result);
  if (queued) {
    return {
      ok: true,
      command,
      httpStatus: 202,
      async: true,
      campaignId,
      profileKind: pKind,
      provider: selectedProvider,
      jobId: queued.jobId,
      statusUrl: queued.statusUrl,
      result,
    };
  }
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
  assertRealOutboundData(result, "el enriquecimiento");
  const queued = queuedJob(result);
  if (queued) {
    return {
      ok: true,
      command,
      httpStatus: 202,
      async: true,
      campaignId,
      providers,
      entityIds,
      jobId: queued.jobId,
      statusUrl: queued.statusUrl,
      result,
    };
  }
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

async function personalize(config: YalcRuntimeConfig, input: RecordLike, command: OutboundCommandName): Promise<OutboundCommandResult> {
  const campaignId = requiredText(input, "campaignId");
  const pKind = profileKind(input.profileKind);
  const kind = kindFromProfileKind(pKind);
  const requestedChannel = text(input.channel);
  if (requestedChannel && requestedChannel !== "email" && requestedChannel !== "linkedin") {
    throw new OutboundCommandError("channel must be email or linkedin");
  }
  const campaign = kind === "b2b"
    ? await assertCampaignLeadEditsUnlocked(config, campaignId, kind)
    : null;
  const result = await yalcFetch<RecordLike>(
    config,
    `/api/campaigns/${encodeURIComponent(campaignId)}/leads/personalize`,
    {
      method: "POST",
      body: {
        ...input,
        channel: requestedChannel || undefined,
        profileKind: pKind,
        ...kindPayload(kind),
        source: "outbound.command",
      },
    },
  );
  assertRealOutboundData(result, "la personalizaci\u00f3n");
  const queued = queuedJob(result);
  if (queued) {
    return {
      ok: true,
      command,
      httpStatus: 202,
      async: true,
      campaignId,
      profileKind: pKind,
      channel: requestedChannel || null,
      jobId: queued.jobId,
      statusUrl: queued.statusUrl,
      result,
    };
  }
  let preview: unknown = null;
  if (kind === "b2b" && requestedChannel === "linkedin") {
    const suppliedConnectMessage = text(input.connectMessage ?? input.connect_message);
    const contactReason = text(input.contactReason) || text(campaign?.hypothesis);
    const defaultConnectMessage = suppliedConnectMessage || buildPhaseOneLinkedInTemplate(contactReason);
    const previewResult = await yalcFetch<RecordLike>(config, "/api/outbound/command", {
      method: "POST",
      body: {
        command: "outbound.linkedin_autopilot.plan",
        campaignId,
        expectedKind: "b2b",
        profileKind: "b2b_contact",
        type: "B2B",
        source: "outbound.command",
        limit: finiteLimit(input.previewLimit) ?? 3,
        ...(defaultConnectMessage ? { connectMessage: defaultConnectMessage } : {}),
      },
    });
    assertRealOutboundData(previewResult, "la vista previa de LinkedIn");
    preview = previewResult.plan ?? previewResult;
  }
  return {
    ok: true,
    command,
    campaignId,
    profileKind: pKind,
    channel: requestedChannel || null,
    result,
    ...(preview ? { preview } : {}),
  };
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
  const campaign = await assertCampaignKind(config, campaignId, "b2b");
  const suppliedConnectMessage = text(input.connectMessage ?? input.connect_message);
  const contactReason = text(input.contactReason) || text(campaign.hypothesis);
  const defaultConnectMessage = command === "outbound.linkedin_autopilot.plan" && !suppliedConnectMessage
    ? buildPhaseOneLinkedInTemplate(contactReason)
    : "";
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
      ...(defaultConnectMessage ? { connectMessage: defaultConnectMessage } : {}),
    },
  });
  assertRealOutboundData(
    result,
    command === "outbound.linkedin_autopilot.execute" ? "el contacto por LinkedIn" : "el plan de LinkedIn",
  );
  return { ok: true, command, campaignId, ...result };
}

async function outboundWorkflow(
  config: YalcRuntimeConfig,
  input: RecordLike,
  command: Extract<
    OutboundCommandName,
    | "outbound.workflow.prepare"
    | "outbound.workflow.approve"
    | "outbound.workflow.execute"
    | "outbound.workflow.status"
  >,
): Promise<OutboundCommandResult> {
  const campaignId = text(input.campaignId ?? input.campaign_id);
  const runId = text(input.runId ?? input.run_id);
  if (!campaignId && !runId) {
    throw new OutboundCommandError("campaignId or runId is required");
  }
  if (campaignId) await assertCampaignKind(config, campaignId, "b2b");

  const result = await yalcFetch<RecordLike>(config, "/api/outbound/command", {
    method: "POST",
    body: {
      ...input,
      command,
      ...(campaignId ? { campaignId } : {}),
      ...(runId ? { runId } : {}),
      expectedKind: "b2b",
      profileKind: "b2b_contact",
      type: "B2B",
      source: "outbound.workflow",
    },
  });
  assertRealOutboundData(result, "el workflow de outbound");
  const queued = queuedJob(result);
  return {
    ok: true,
    command,
    ...(queued ? { httpStatus: 202, async: true } : {}),
    ...(campaignId ? { campaignId } : {}),
    ...(runId ? { runId } : {}),
    ...result,
  };
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
    case "outbound.personalize":
      return personalize(config, input, command);
    case "outbound.draft_sequence":
      return draftSequence(config, input, command);
    case "outbound.linkedin_autopilot.plan":
    case "outbound.linkedin_autopilot.execute":
      return linkedinAutopilot(config, input, command);
    case "outbound.workflow.prepare":
    case "outbound.workflow.approve":
    case "outbound.workflow.execute":
    case "outbound.workflow.status":
      return outboundWorkflow(config, input, command);
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
