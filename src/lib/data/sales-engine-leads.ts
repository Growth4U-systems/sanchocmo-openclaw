/**
 * Live GHL reads behind `GET /api/metrics/sales-engine-leads` (SAN-326).
 *
 * ONE scan layer feeds BOTH modes of the endpoint:
 *   - list mode (`fetchSalesEngineLeads`): the drill-down behind a matrix cell —
 *     one stage × bucket, newest rows first, capped at 100 visible rows;
 *   - counts mode (`fetchSalesEngineCounts`): the whole matrix in one call —
 *     every bucket of every stage tallied from the SAME scans.
 * A matrix cell and its drill-down list therefore agree by construction: the
 * count is exactly `rows.length` of the scan the list renders (the row cap only
 * limits what the list shows, never what gets counted).
 *
 * The request/filter semantics deliberately mirror the metrics-collector
 * adapter (`skills/metrics-collector/scripts/adapters/ghl.js`): same endpoints,
 * same Version headers, and the same contactId→contact join for records that
 * embed no source. Safety caps: list mode keeps the adapter-aligned paging caps
 * and throws when the contact join would exceed its cap; counts mode uses
 * higher caps and, when one is still hit, STOPS scanning and marks the stage
 * `truncated` (counts become honest lower bounds — the UI renders "≥N").
 *
 * PII: lead rows flow through to the response only. Nothing here logs contact
 * data, and provider errors carry status+operation, never the API key or
 * response bodies.
 */

import {
  channelMatchesBucket,
  SALES_ENGINE_DRILLDOWN_ROW_LIMIT,
  shapeLeadRow,
  shapeMeetingRow,
  shapeOpportunityRow,
  type SalesEngineDrilldownStage,
  type SalesEngineLeadRow,
  type SalesEngineLeadsResult,
} from "@/lib/metrics/sales-engine-drilldown";
import {
  CHANNEL_BUCKETS,
  mapChannelToBucket,
  type ChannelBucketKey,
} from "@/lib/metrics/channel-buckets";

const BASE_URL = "https://services.leadconnectorhq.com";
const CONTACTS_VERSION = "2021-07-28";
const CALENDARS_VERSION = "2021-04-15";
const OPPORTUNITIES_VERSION = "v3";
// List-mode paging caps aligned with the adapter's safety limits.
const CONTACTS_PAGE_CAP = 10;
const OPPORTUNITIES_PAGE_CAP = 5;
const CONTACT_JOIN_CAP = 500;
// Counts mode reads every stage in one request, so it loops further before
// giving up: enough for real volumes (hundreds–low thousands) per window.
const COUNTS_CONTACTS_PAGE_CAP = 20; // ×100 = 2 000 contacts
const COUNTS_OPPORTUNITIES_PAGE_CAP = 10; // ×100 = 1 000 opportunities
const COUNTS_CONTACT_JOIN_CAP = 1500;
const DAY_MS = 86_400_000;

export type FetchLike = (
  url: string,
  init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
  },
) => Promise<{
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
}>;

/** Provider failure (HTTP error or safety-limit refusal). The API route maps
 * this to a 502 with `message`; it never contains credentials or lead data. */
export class SalesEngineGhlError extends Error {
  constructor(message: string, readonly ghlStatus?: number) {
    super(message);
    this.name = "SalesEngineGhlError";
  }
}

export interface SalesEngineLeadsQuery {
  stage: SalesEngineDrilldownStage;
  bucket: ChannelBucketKey | null;
  /** Required for leads/meetings/opportunities; ignored for won (stock). */
  from?: string;
  to?: string;
  locationId: string;
  apiKey: string;
  /** IANA timezone of the GHL location; resolved from the location when absent. */
  timezone?: string;
  fetchImpl?: FetchLike;
}

// ── Location-timezone day bounds (same approach as the adapter) ─────────────

function timezoneOffsetMs(timestamp: number, timezone: string): number {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(timestamp));
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const asUtc = Date.UTC(
    Number(value.year),
    Number(value.month) - 1,
    Number(value.day),
    Number(value.hour),
    Number(value.minute),
    Number(value.second),
  );
  return asUtc - Math.floor(timestamp / 1000) * 1000;
}

function localMidnightUtc(date: string, timezone: string): number {
  const [year, month, day] = date.split("-").map(Number);
  const localTimestamp = Date.UTC(year, month - 1, day);
  let candidate = localTimestamp;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    candidate = localTimestamp - timezoneOffsetMs(candidate, timezone);
  }
  return candidate;
}

function nextCalendarDate(date: string): string {
  return new Date(Date.parse(`${date}T00:00:00.000Z`) + DAY_MS)
    .toISOString()
    .slice(0, 10);
}

/** Inclusive [from..to] calendar range → UTC instants of local midnight bounds. */
export function zonedRangeBounds(
  from: string,
  to: string,
  timezone: string,
): { fromTs: number; toTs: number; fromIso: string; toIso: string } {
  const fromTs = localMidnightUtc(from, timezone);
  const toTs = localMidnightUtc(nextCalendarDate(to), timezone) - 1;
  return {
    fromTs,
    toTs,
    fromIso: new Date(fromTs).toISOString(),
    toIso: new Date(toTs).toISOString(),
  };
}

function toMMDDYYYY(isoDate: string): string {
  const [y, m, d] = isoDate.split("-");
  return `${m}-${d}-${y}`;
}

// ── GHL plumbing ─────────────────────────────────────────────────────────────

interface GhlContext {
  locationId: string;
  headers: Record<string, string>;
  fetchImpl: FetchLike;
}

function buildContext(query: { locationId: string; apiKey: string; fetchImpl?: FetchLike }): GhlContext {
  return {
    locationId: query.locationId,
    fetchImpl: query.fetchImpl ?? (fetch as unknown as FetchLike),
    headers: {
      Authorization: `Bearer ${query.apiKey}`,
      "Content-Type": "application/json",
      Version: CONTACTS_VERSION,
    },
  };
}

async function ghlJson(
  ctx: GhlContext,
  operation: string,
  url: string,
  init?: { method?: string; body?: string; version?: string },
): Promise<Record<string, unknown>> {
  const response = await ctx.fetchImpl(url, {
    method: init?.method ?? "GET",
    headers: init?.version ? { ...ctx.headers, Version: init.version } : ctx.headers,
    ...(init?.body ? { body: init.body } : {}),
  });
  if (!response.ok) {
    throw new SalesEngineGhlError(
      `GoHighLevel respondió HTTP ${response.status} en ${operation}`,
      response.status,
    );
  }
  return (await response.json()) as Record<string, unknown>;
}

function asArray(value: unknown, operation: string, field: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new SalesEngineGhlError(
      `GoHighLevel devolvió una respuesta sin el array ${field} en ${operation}`,
    );
  }
  return value;
}

type GhlContact = Parameters<typeof shapeLeadRow>[0] & { id?: string };

async function resolveTimezone(ctx: GhlContext, configured?: string): Promise<string> {
  const candidate = (configured ?? "").trim();
  if (candidate) {
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: candidate }).format(new Date(0));
      return candidate;
    } catch {
      // Fall through to the location lookup — a bad configured value should
      // not break a read-only drill-down.
    }
  }
  try {
    const data = await ghlJson(
      ctx,
      "location",
      `${BASE_URL}/locations/${encodeURIComponent(ctx.locationId)}`,
      { version: OPPORTUNITIES_VERSION },
    );
    const discovered = String(
      (data.location as { timezone?: string } | undefined)?.timezone
      ?? (data as { timezone?: string }).timezone
      ?? "",
    ).trim();
    if (discovered) {
      new Intl.DateTimeFormat("en-US", { timeZone: discovered }).format(new Date(0));
      return discovered;
    }
  } catch {
    // Approximate day bounds are acceptable for the drill-down list.
  }
  return "UTC";
}

/** Returned by the counts-mode contact resolver when the join cap is reached:
 * the scan stops and reports `truncated` instead of failing the whole matrix. */
const CONTACT_JOIN_CAPPED = Symbol("sales-engine-contact-join-capped");

type ContactResolver = (
  contactId: string | null | undefined,
) => Promise<GhlContact | null | typeof CONTACT_JOIN_CAPPED>;

/** contactId→contact join with a per-request cache. 404 → null (deleted
 * contact reads as 'Unknown', matching the adapter). At the cap, list mode
 * throws (acota el rango) while counts mode flags so the scan can stop and
 * report an honest lower bound. Already-cached contacts keep resolving. */
function createContactResolver(
  ctx: GhlContext,
  options: { cap: number; onCap: "throw" | "flag" },
): ContactResolver {
  const cache = new Map<string, GhlContact | null>();
  return async function resolveContact(contactId) {
    if (!contactId) return null;
    if (cache.has(contactId)) return cache.get(contactId) ?? null;
    if (cache.size >= options.cap) {
      if (options.onCap === "flag") return CONTACT_JOIN_CAPPED;
      throw new SalesEngineGhlError(
        `La consulta supera el límite de ${options.cap} contactos por lista; acota el rango de fechas`,
      );
    }
    const response = await ctx.fetchImpl(
      `${BASE_URL}/contacts/${encodeURIComponent(contactId)}`,
      { headers: ctx.headers },
    );
    if (response.status === 404) {
      cache.set(contactId, null);
      return null;
    }
    if (!response.ok) {
      throw new SalesEngineGhlError(
        `GoHighLevel respondió HTTP ${response.status} en la lectura de un contacto`,
        response.status,
      );
    }
    const data = (await response.json()) as { contact?: GhlContact } & GhlContact;
    const contact = data?.contact ?? data;
    cache.set(contactId, contact ?? null);
    return contact ?? null;
  };
}

// ── Stage scans (shared by list mode and counts mode) ───────────────────────
//
// Each scan reads a full stage window from GHL and shapes EVERY record into a
// `SalesEngineLeadRow` whose `source` is the collapsed acquisition channel.
// List mode filters/sorts/caps those rows; counts mode tallies them. Both see
// the same records, so cell counts and drill-down lists cannot diverge.

interface StageScan {
  rows: SalesEngineLeadRow[];
  /** True when a paging or contact-join cap stopped the scan early. */
  truncated: boolean;
}

async function scanLeads(
  ctx: GhlContext,
  fromIso: string,
  toIso: string,
  pageCap: number,
): Promise<StageScan> {
  const rows: SalesEngineLeadRow[] = [];
  let page = 1;
  let hasMore = true;
  while (hasMore && page <= pageCap) {
    const data = await ghlJson(ctx, "contacts/search", `${BASE_URL}/contacts/search`, {
      method: "POST",
      body: JSON.stringify({
        locationId: ctx.locationId,
        page,
        pageLimit: 100,
        filters: [
          {
            field: "dateAdded",
            operator: "range",
            value: { gte: fromIso, lte: toIso },
          },
        ],
      }),
    });
    const contacts = asArray(data.contacts, "contacts/search", "contacts") as GhlContact[];
    for (const contact of contacts) rows.push(shapeLeadRow(contact));
    hasMore = contacts.length === 100;
    page += 1;
  }
  return { rows, truncated: hasMore };
}

async function scanMeetings(
  ctx: GhlContext,
  resolveContact: ContactResolver,
  fromTs: number,
  toTs: number,
): Promise<StageScan> {
  const calendarsData = await ghlJson(
    ctx,
    "calendars",
    `${BASE_URL}/calendars/?locationId=${encodeURIComponent(ctx.locationId)}`,
    { version: CALENDARS_VERSION },
  );
  const calendars = asArray(calendarsData.calendars, "calendars", "calendars") as Array<{ id?: string }>;

  type GhlEvent = Parameters<typeof shapeMeetingRow>[0] & {
    contactId?: string | null;
    contact?: { id?: string } | null;
  };
  const events: GhlEvent[] = [];
  for (const calendar of calendars) {
    if (!calendar?.id) continue;
    const eventsData = await ghlJson(
      ctx,
      `calendars/events (${calendar.id})`,
      `${BASE_URL}/calendars/events?locationId=${encodeURIComponent(ctx.locationId)}&calendarId=${encodeURIComponent(calendar.id)}&startTime=${fromTs}&endTime=${toTs}`,
      { version: CALENDARS_VERSION },
    );
    events.push(
      ...(asArray(eventsData.events, `calendars/events (${calendar.id})`, "events") as GhlEvent[]),
    );
  }

  const rows: SalesEngineLeadRow[] = [];
  let truncated = false;
  for (const event of events) {
    const contact = await resolveContact(event.contactId || event.contact?.id || null);
    if (contact === CONTACT_JOIN_CAPPED) {
      truncated = true;
      break;
    }
    rows.push(shapeMeetingRow(event, contact));
  }
  return { rows, truncated };
}

async function pipelineStageNames(ctx: GhlContext): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  try {
    const data = await ghlJson(
      ctx,
      "opportunities/pipelines",
      `${BASE_URL}/opportunities/pipelines?locationId=${encodeURIComponent(ctx.locationId)}`,
    );
    for (const pipeline of (Array.isArray(data.pipelines) ? data.pipelines : []) as Array<{
      stages?: Array<{ id?: string; name?: string }>;
    }>) {
      for (const stage of pipeline?.stages ?? []) {
        if (stage?.id && stage?.name) names.set(stage.id, stage.name);
      }
    }
  } catch {
    // Stage names are cosmetic; fall back to the raw stage id per row.
  }
  return names;
}

async function scanOpportunities(
  ctx: GhlContext,
  resolveContact: ContactResolver,
  options: {
    wonOnly: boolean;
    from?: string;
    to?: string;
    pageCap: number;
    stageNames: Map<string, string>;
  },
): Promise<StageScan> {
  type GhlOpportunity = Parameters<typeof shapeOpportunityRow>[0] & {
    status?: string | null;
    contactId?: string | null;
    contact?: { id?: string } | null;
  };
  const opportunities: GhlOpportunity[] = [];
  let page = 1;
  let hasMore = true;
  const dateFilter = !options.wonOnly && options.from && options.to
    ? `&date=${toMMDDYYYY(options.from)}&endDate=${toMMDDYYYY(options.to)}`
    : "";
  const status = options.wonOnly ? "won" : "all";
  while (hasMore && page <= options.pageCap) {
    const data = await ghlJson(
      ctx,
      "opportunities/search",
      `${BASE_URL}/opportunities/search?locationId=${encodeURIComponent(ctx.locationId)}${dateFilter}&status=${status}&limit=100&page=${page}`,
      { version: OPPORTUNITIES_VERSION },
    );
    const pageRows = asArray(data.opportunities, "opportunities/search", "opportunities") as GhlOpportunity[];
    opportunities.push(...pageRows);
    hasMore = pageRows.length === 100;
    page += 1;
  }

  const rows: SalesEngineLeadRow[] = [];
  let truncated = hasMore;
  for (const opportunity of opportunities) {
    // The won stage mirrors the adapter: trust only status === 'won'.
    if (options.wonOnly && (opportunity.status || "").toLowerCase() !== "won") continue;
    const contact = await resolveContact(
      opportunity.contact?.id || opportunity.contactId || null,
    );
    if (contact === CONTACT_JOIN_CAPPED) {
      truncated = true;
      break;
    }
    rows.push(shapeOpportunityRow(
      opportunity,
      contact,
      opportunity.pipelineStageId ? options.stageNames.get(opportunity.pipelineStageId) : null,
    ));
  }
  return { rows, truncated };
}

// ── List mode (drill-down) ───────────────────────────────────────────────────

export async function fetchSalesEngineLeads(
  query: SalesEngineLeadsQuery,
): Promise<SalesEngineLeadsResult> {
  const ctx = buildContext(query);
  const resolveContact = createContactResolver(ctx, {
    cap: CONTACT_JOIN_CAP,
    onCap: "throw",
  });

  let scan: StageScan;
  if (query.stage === "won") {
    scan = await scanOpportunities(ctx, resolveContact, {
      wonOnly: true,
      pageCap: OPPORTUNITIES_PAGE_CAP,
      stageNames: await pipelineStageNames(ctx),
    });
  } else {
    if (!query.from || !query.to) {
      throw new Error(`sales-engine-leads: stage ${query.stage} requires from/to`);
    }
    if (query.stage === "opportunities") {
      scan = await scanOpportunities(ctx, resolveContact, {
        wonOnly: false,
        from: query.from,
        to: query.to,
        pageCap: OPPORTUNITIES_PAGE_CAP,
        stageNames: await pipelineStageNames(ctx),
      });
    } else {
      const timezone = await resolveTimezone(ctx, query.timezone);
      const bounds = zonedRangeBounds(query.from, query.to, timezone);
      scan = query.stage === "leads"
        ? await scanLeads(ctx, bounds.fromIso, bounds.toIso, CONTACTS_PAGE_CAP)
        : await scanMeetings(ctx, resolveContact, bounds.fromTs, bounds.toTs);
    }
  }

  // The bucket filter runs on the shaped row's collapsed channel — the same
  // value counts mode tallies — so list totals equal matrix cells.
  const matching = scan.rows.filter((row) => channelMatchesBucket(row.source, query.bucket));
  // Newest first — the drill-down is a "who just came in" list. The row cap
  // only limits the visible rows; `total` counts the full matching set.
  const rows = [...matching]
    .sort((left, right) => right.date.localeCompare(left.date))
    .slice(0, SALES_ENGINE_DRILLDOWN_ROW_LIMIT);
  return {
    stage: query.stage,
    bucket: query.bucket,
    rows,
    total: matching.length,
    truncated: scan.truncated,
  };
}

// ── Counts mode (whole matrix in one call) ───────────────────────────────────

export type SalesEngineCountsStageKey = "leads" | "meetings" | "opportunities" | "won";

export interface SalesEngineStageCounts {
  stage: SalesEngineCountsStageKey;
  buckets: Record<ChannelBucketKey, number>;
  total: number;
  /** True when a safety cap stopped the scan: counts are lower bounds (≥N). */
  truncated: boolean;
}

export interface SalesEngineWonValueCounts {
  buckets: Record<ChannelBucketKey, number>;
  total: number;
  truncated: boolean;
}

export interface SalesEngineCountsResult {
  from: string;
  to: string;
  stages: SalesEngineStageCounts[];
  /** € sum of the won stock's monetaryValue, split by the same buckets. */
  wonValue: SalesEngineWonValueCounts;
  truncated: boolean;
}

export interface SalesEngineCountsQuery {
  from: string;
  to: string;
  locationId: string;
  apiKey: string;
  timezone?: string;
  fetchImpl?: FetchLike;
  /** Test/QA hook only — production callers use the module defaults. */
  limits?: Partial<{
    contactsPageCap: number;
    opportunitiesPageCap: number;
    contactJoinCap: number;
  }>;
}

function emptyBucketCounts(): Record<ChannelBucketKey, number> {
  const buckets = {} as Record<ChannelBucketKey, number>;
  for (const bucket of CHANNEL_BUCKETS) buckets[bucket.key] = 0;
  return buckets;
}

function tallyStage(stage: SalesEngineCountsStageKey, scan: StageScan): SalesEngineStageCounts {
  const buckets = emptyBucketCounts();
  for (const row of scan.rows) buckets[mapChannelToBucket(row.source)] += 1;
  return { stage, buckets, total: scan.rows.length, truncated: scan.truncated };
}

function tallyWonValue(scan: StageScan): SalesEngineWonValueCounts {
  const buckets = emptyBucketCounts();
  let total = 0;
  for (const row of scan.rows) {
    const value = Number.isFinite(row.monetaryValue) ? Number(row.monetaryValue) : 0;
    buckets[mapChannelToBucket(row.source)] += value;
    total += value;
  }
  return { buckets, total, truncated: scan.truncated };
}

/**
 * The whole sales-engine matrix, live from GHL: contacts by dateAdded window,
 * appointments in window, opportunities created in window, won = current CRM
 * stock (with € value). Same scans as the drill-down lists — a cell always
 * equals `rows.length` of the list it opens.
 */
export async function fetchSalesEngineCounts(
  query: SalesEngineCountsQuery,
): Promise<SalesEngineCountsResult> {
  const ctx = buildContext(query);
  const limits = {
    contactsPageCap: COUNTS_CONTACTS_PAGE_CAP,
    opportunitiesPageCap: COUNTS_OPPORTUNITIES_PAGE_CAP,
    contactJoinCap: COUNTS_CONTACT_JOIN_CAP,
    ...query.limits,
  };
  // One resolver across meetings/opportunities/won: the join cache is shared,
  // so a contact appearing in several stages costs one GHL read.
  const resolveContact = createContactResolver(ctx, {
    cap: limits.contactJoinCap,
    onCap: "flag",
  });
  // Stage names are cosmetic (only the list view shows them) — skip the fetch.
  const stageNames = new Map<string, string>();

  const timezone = await resolveTimezone(ctx, query.timezone);
  const bounds = zonedRangeBounds(query.from, query.to, timezone);
  const leads = await scanLeads(ctx, bounds.fromIso, bounds.toIso, limits.contactsPageCap);
  const meetings = await scanMeetings(ctx, resolveContact, bounds.fromTs, bounds.toTs);
  const opportunities = await scanOpportunities(ctx, resolveContact, {
    wonOnly: false,
    from: query.from,
    to: query.to,
    pageCap: limits.opportunitiesPageCap,
    stageNames,
  });
  const won = await scanOpportunities(ctx, resolveContact, {
    wonOnly: true,
    pageCap: limits.opportunitiesPageCap,
    stageNames,
  });

  const stages = [
    tallyStage("leads", leads),
    tallyStage("meetings", meetings),
    tallyStage("opportunities", opportunities),
    tallyStage("won", won),
  ];
  const wonValue = tallyWonValue(won);
  return {
    from: query.from,
    to: query.to,
    stages,
    wonValue,
    truncated: stages.some((stage) => stage.truncated) || wonValue.truncated,
  };
}

// ── Counts cache (in-process, per slug+window) ──────────────────────────────
//
// The matrix re-requests its counts on every tab switch; a short TTL keeps
// those from hammering GHL while staying "live enough" (the drill-down lists
// remain uncached). In-flight promises are shared so concurrent requests for
// the same window trigger a single GHL read. Failures are never cached.

export const SALES_ENGINE_COUNTS_CACHE_TTL_MS = 60_000;
const COUNTS_CACHE_MAX_ENTRIES = 256;

const countsCache = new Map<string, { at: number; promise: Promise<SalesEngineCountsResult> }>();

export function clearSalesEngineCountsCache(): void {
  countsCache.clear();
}

export async function fetchSalesEngineCountsCached(
  cacheKey: string,
  query: SalesEngineCountsQuery,
  now: () => number = Date.now,
): Promise<SalesEngineCountsResult> {
  const cached = countsCache.get(cacheKey);
  if (cached && now() - cached.at < SALES_ENGINE_COUNTS_CACHE_TTL_MS) {
    return cached.promise;
  }
  const promise = fetchSalesEngineCounts(query);
  countsCache.set(cacheKey, { at: now(), promise });
  promise.catch(() => {
    // Never serve a cached failure; the next request retries GHL.
    if (countsCache.get(cacheKey)?.promise === promise) countsCache.delete(cacheKey);
  });
  if (countsCache.size > COUNTS_CACHE_MAX_ENTRIES) {
    for (const [key, entry] of countsCache) {
      if (now() - entry.at >= SALES_ENGINE_COUNTS_CACHE_TTL_MS) countsCache.delete(key);
    }
  }
  return promise;
}
