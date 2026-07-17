import type { RawMetric } from "@/lib/data/metrics-snapshots";

const API_BASE = "https://api.lemlist.com/api";
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;
const DEFAULT_PAGE_LIMIT = 100;
const DEFAULT_MAX_CAMPAIGNS = 1000;

type JsonRecord = Record<string, unknown>;

export type LemlistFetch = (
  input: string | URL,
  init?: RequestInit,
) => Promise<{ ok: boolean; status: number; text: () => Promise<string> }>;

export interface LemlistCampaign {
  _id: string;
  name?: string;
  status?: string;
}

export interface LemlistCampaignStats {
  campaignId?: string;
  nbLeads?: number;
  nbLeadsLaunched?: number;
  nbLeadsReached?: number;
  nbLeadsOpened?: number;
  nbLeadsInteracted?: number;
  nbLeadsAnswered?: number;
  nbLeadsInterested?: number;
  nbLeadsNotInterested?: number;
  nbLeadsUnsubscribed?: number;
  nbLeadsInterrupted?: number;
  messagesSent?: number;
  messagesNotSent?: number;
  messagesBounced?: number;
  delivered?: number;
  opened?: number;
  clicked?: number;
  replied?: number;
  invitationAccepted?: number;
  meetingBooked?: number;
}

export interface CollectLemlistOptions {
  apiKey: string;
  date?: string | Date;
  campaignIds?: string[];
  fetchImpl?: LemlistFetch;
  pageLimit?: number;
  maxCampaigns?: number;
}

export interface LemlistCollection {
  source: "lemlist";
  date: string;
  startDate: string;
  endDate: string;
  collectedAt: string;
  campaignCount: number;
  statsCount: number;
  errors: JsonRecord[];
  metrics: RawMetric[];
}

const STAT_METRICS: Array<[name: string, field: keyof LemlistCampaignStats]> = [
  ["sent", "messagesSent"],
  ["delivered", "delivered"],
  ["opens", "opened"],
  ["clicks", "clicked"],
  ["replies", "replied"],
  ["bounced", "messagesBounced"],
  ["notSent", "messagesNotSent"],
  ["meetings", "meetingBooked"],
  ["leads", "nbLeads"],
  ["launched", "nbLeadsLaunched"],
  ["reached", "nbLeadsReached"],
  ["interacted", "nbLeadsInteracted"],
  ["answered", "nbLeadsAnswered"],
  ["interested", "nbLeadsInterested"],
  ["notInterested", "nbLeadsNotInterested"],
  ["unsubscribed", "nbLeadsUnsubscribed"],
  ["interrupted", "nbLeadsInterrupted"],
  ["invitationAccepted", "invitationAccepted"],
];

export function lemlistDateWindow(
  input: string | Date = new Date(Date.now() - DAY_MS),
): { date: string; startDate: string; endDate: string } {
  const parsedInput = typeof input === "string" ? new Date(
    DATE_RE.test(input) ? `${input}T00:00:00.000Z` : input,
  ) : input;
  if (Number.isNaN(parsedInput.getTime())) throw new Error(`Invalid Lemlist date: ${String(input)}`);
  const date = parsedInput.toISOString().slice(0, 10);
  if (typeof input === "string" && DATE_RE.test(input) && date !== input) {
    throw new Error(`Invalid Lemlist date: ${input}`);
  }
  const start = new Date(`${date}T00:00:00.000Z`);
  const end = new Date(start.getTime() + DAY_MS - 1);
  return { date, startDate: start.toISOString(), endDate: end.toISOString() };
}

export function lemlistBasicAuthHeader(apiKey: string): string {
  return `Basic ${Buffer.from(`:${apiKey}`).toString("base64")}`;
}

export function mapLemlistStatsToMetrics(args: {
  date: string;
  campaigns: LemlistCampaign[];
  stats: LemlistCampaignStats[];
  includeCampaignStock?: boolean;
}): RawMetric[] {
  const campaignById = new Map(args.campaigns.map((campaign) => [campaign._id, campaign]));
  const metrics: RawMetric[] = args.includeCampaignStock === false
    ? []
    : [{
      name: "campaigns",
      value: args.campaigns.filter((campaign) => campaign.status !== "archived").length,
      date: args.date,
    }];
  const totals = new Map<string, number>();

  for (const stat of args.stats) {
    const campaignId = typeof stat.campaignId === "string" ? stat.campaignId : "";
    const campaign = campaignById.get(campaignId);
    const dimensions = cleanDimensions({
      campaignId,
      campaignName: campaign?.name,
      campaignStatus: campaign?.status,
    });

    for (const [name, field] of STAT_METRICS) {
      const value = asFiniteNumber(stat[field]);
      if (value == null) continue;
      totals.set(name, (totals.get(name) ?? 0) + value);
      if (dimensions) metrics.push({ name, value, date: args.date, dimensions });
    }
  }

  for (const [name] of STAT_METRICS) {
    metrics.push({ name, value: totals.get(name) ?? 0, date: args.date });
  }

  return metrics;
}

export async function collectLemlistMetrics(options: CollectLemlistOptions): Promise<LemlistCollection> {
  if (!options.apiKey) throw new Error("Missing Lemlist API key");
  const fetchImpl = options.fetchImpl ?? (globalThis.fetch as unknown as LemlistFetch | undefined);
  if (!fetchImpl) throw new Error("No fetch implementation available for Lemlist collector");

  const window = lemlistDateWindow(options.date);
  const explicitIds = normalizeCampaignIds(options.campaignIds ?? []);
  const campaigns = explicitIds.length
    ? explicitIds.map((id) => ({ _id: id }))
    : await listCollectableCampaigns({
      apiKey: options.apiKey,
      fetchImpl,
      pageLimit: options.pageLimit,
      maxCampaigns: options.maxCampaigns,
    });

  const statsResult = campaigns.length
    ? await fetchBatchStats({
      apiKey: options.apiKey,
      fetchImpl,
      campaignIds: campaigns.map((campaign) => campaign._id),
      startDate: window.startDate,
      endDate: window.endDate,
    })
    : { results: [] as LemlistCampaignStats[], errors: [] as JsonRecord[] };

  return {
    source: "lemlist",
    ...window,
    collectedAt: new Date().toISOString(),
    campaignCount: campaigns.length,
    statsCount: statsResult.results.length,
    errors: statsResult.errors,
    metrics: mapLemlistStatsToMetrics({
      date: window.date,
      campaigns,
      stats: statsResult.results,
      // Campaign status is current state. Do not fabricate a historical stock,
      // and do not call a configured subset the account-wide campaign count.
      includeCampaignStock: options.date == null && explicitIds.length === 0,
    }),
  };
}

async function listCollectableCampaigns(args: {
  apiKey: string;
  fetchImpl: LemlistFetch;
  pageLimit?: number;
  maxCampaigns?: number;
}): Promise<LemlistCampaign[]> {
  const limit = clampInt(args.pageLimit ?? DEFAULT_PAGE_LIMIT, 1, DEFAULT_PAGE_LIMIT);
  const maxCampaigns = clampInt(args.maxCampaigns ?? DEFAULT_MAX_CAMPAIGNS, 1, DEFAULT_MAX_CAMPAIGNS);
  const campaigns: LemlistCampaign[] = [];

  for (let offset = 0; offset < maxCampaigns; offset += limit) {
    const page = await lemlistRequest<LemlistCampaign[]>({
      apiKey: args.apiKey,
      fetchImpl: args.fetchImpl,
      path: `/campaigns?${new URLSearchParams({
        version: "v2",
        limit: String(limit),
        offset: String(offset),
        sortBy: "createdAt",
        sortOrder: "desc",
      })}`,
    });
    if (!Array.isArray(page)) throw new Error("Lemlist campaigns response was not an array");
    const collectable = page.filter((campaign) => campaign?._id && isCollectableStatus(campaign.status));
    campaigns.push(...collectable);
    if (page.length < limit) return campaigns;
    if (offset + limit >= maxCampaigns) {
      throw new Error(`Lemlist campaign listing exceeded the ${maxCampaigns}-record safety limit`);
    }
  }

  throw new Error(`Lemlist campaign listing exceeded the ${maxCampaigns}-record safety limit`);
}

async function fetchBatchStats(args: {
  apiKey: string;
  fetchImpl: LemlistFetch;
  campaignIds: string[];
  startDate: string;
  endDate: string;
}): Promise<{ results: LemlistCampaignStats[]; errors: JsonRecord[] }> {
  const results: LemlistCampaignStats[] = [];
  const errors: JsonRecord[] = [];
  for (let i = 0; i < args.campaignIds.length; i += DEFAULT_PAGE_LIMIT) {
    const campaignIds = args.campaignIds.slice(i, i + DEFAULT_PAGE_LIMIT);
    const body = await lemlistRequest<{ results?: LemlistCampaignStats[]; errors?: JsonRecord[] }>({
      apiKey: args.apiKey,
      fetchImpl: args.fetchImpl,
      path: "/v2/campaigns/stats/batch",
      init: {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campaignIds, startDate: args.startDate, endDate: args.endDate }),
      },
    });
    if (!body || !Array.isArray(body.results)) {
      throw new Error("Lemlist stats response was missing the results array");
    }
    if (Array.isArray(body.errors) && body.errors.length) {
      throw new Error(
        `Lemlist stats returned ${body.errors.length} campaign error(s): ${JSON.stringify(body.errors.slice(0, 3))}`,
      );
    }
    results.push(...body.results);
  }
  return { results, errors };
}

async function lemlistRequest<T>(args: {
  apiKey: string;
  fetchImpl: LemlistFetch;
  path: string;
  init?: RequestInit;
}): Promise<T> {
  const headers = {
    Authorization: lemlistBasicAuthHeader(args.apiKey),
    Accept: "application/json",
    ...(args.init?.headers ?? {}),
  };
  const response = await args.fetchImpl(`${API_BASE}${args.path}`, { ...args.init, headers });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Lemlist ${args.init?.method ?? "GET"} ${args.path} failed (${response.status}): ${text.slice(0, 240)}`);
  }
  return (text.trim() ? JSON.parse(text) : null) as T;
}

function normalizeCampaignIds(ids: string[]): string[] {
  return [...new Set(ids.map((id) => id.trim()).filter(Boolean))];
}

function isCollectableStatus(status: unknown): boolean {
  if (typeof status !== "string") return true;
  // Archived campaigns can still own real activity inside the requested day.
  // Only drafts, which were never launched, are outside the stats universe.
  return status !== "draft";
}

function asFiniteNumber(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return value;
}

function cleanDimensions(input: Record<string, unknown>): Record<string, string> | null {
  const entries = Object.entries(input)
    .filter(([, value]) => value != null && value !== "")
    .map(([key, value]) => [key, String(value)] as [string, string]);
  return entries.length ? Object.fromEntries(entries) : null;
}

function clampInt(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, Math.floor(value)));
}
