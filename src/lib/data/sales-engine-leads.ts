/**
 * Live GHL reads behind `GET /api/metrics/sales-engine-leads` (SAN-326).
 *
 * The sales-engine matrix counts come from persisted `metric_snapshots`; the
 * drill-down instead asks GoHighLevel directly so the list is current. The
 * request/filter semantics deliberately mirror the metrics-collector adapter
 * (`skills/metrics-collector/scripts/adapters/ghl.js`): same endpoints, same
 * Version headers, same paging caps, and the same contactId→contact join for
 * records that embed no source — so lists reconcile with the counts.
 *
 * PII: lead rows flow through to the response only. Nothing here logs contact
 * data, and provider errors carry status+operation, never the API key or
 * response bodies.
 */

import {
  channelMatchesBucket,
  contactChannel,
  SALES_ENGINE_DRILLDOWN_ROW_LIMIT,
  shapeLeadRow,
  shapeMeetingRow,
  shapeOpportunityRow,
  type SalesEngineDrilldownStage,
  type SalesEngineLeadRow,
  type SalesEngineLeadsResult,
} from "@/lib/metrics/sales-engine-drilldown";
import type { ChannelBucketKey } from "@/lib/metrics/channel-buckets";

const BASE_URL = "https://services.leadconnectorhq.com";
const CONTACTS_VERSION = "2021-07-28";
const CALENDARS_VERSION = "2021-04-15";
const OPPORTUNITIES_VERSION = "v3";
// Paging caps aligned with the adapter's safety limits.
const CONTACTS_PAGE_CAP = 10;
const OPPORTUNITIES_PAGE_CAP = 5;
const CONTACT_JOIN_CAP = 500;
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

/** contactId→contact join with a per-request cache. 404 → null (deleted
 * contact reads as 'Unknown', matching the adapter). */
function createContactResolver(ctx: GhlContext) {
  const cache = new Map<string, GhlContact | null>();
  return async function resolveContact(contactId: string | null | undefined): Promise<GhlContact | null> {
    if (!contactId) return null;
    if (cache.has(contactId)) return cache.get(contactId) ?? null;
    if (cache.size >= CONTACT_JOIN_CAP) {
      throw new SalesEngineGhlError(
        `La consulta supera el límite de ${CONTACT_JOIN_CAP} contactos por lista; acota el rango de fechas`,
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

// ── Stage readers ────────────────────────────────────────────────────────────

async function listLeads(
  ctx: GhlContext,
  bucket: ChannelBucketKey | null,
  fromIso: string,
  toIso: string,
): Promise<{ rows: SalesEngineLeadRow[]; total: number; truncated: boolean }> {
  const rows: SalesEngineLeadRow[] = [];
  let total = 0;
  let page = 1;
  let hasMore = true;
  while (hasMore && page <= CONTACTS_PAGE_CAP) {
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
    for (const contact of contacts) {
      if (!channelMatchesBucket(contactChannel(contact), bucket)) continue;
      total += 1;
      if (rows.length < SALES_ENGINE_DRILLDOWN_ROW_LIMIT) rows.push(shapeLeadRow(contact));
    }
    hasMore = contacts.length === 100;
    page += 1;
  }
  return { rows, total, truncated: hasMore };
}

async function listMeetings(
  ctx: GhlContext,
  bucket: ChannelBucketKey | null,
  fromTs: number,
  toTs: number,
): Promise<{ rows: SalesEngineLeadRow[]; total: number; truncated: boolean }> {
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

  const resolveContact = createContactResolver(ctx);
  const rows: SalesEngineLeadRow[] = [];
  let total = 0;
  for (const event of events) {
    const contact = await resolveContact(event.contactId || event.contact?.id || null);
    const channel = contact ? contactChannel(contact) : "Unknown";
    if (!channelMatchesBucket(channel, bucket)) continue;
    total += 1;
    if (rows.length < SALES_ENGINE_DRILLDOWN_ROW_LIMIT) rows.push(shapeMeetingRow(event, contact));
  }
  return { rows, total, truncated: false };
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

async function listOpportunities(
  ctx: GhlContext,
  bucket: ChannelBucketKey | null,
  options: { wonOnly: boolean; from?: string; to?: string },
): Promise<{ rows: SalesEngineLeadRow[]; total: number; truncated: boolean }> {
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
  while (hasMore && page <= OPPORTUNITIES_PAGE_CAP) {
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

  const stageNames = await pipelineStageNames(ctx);
  const resolveContact = createContactResolver(ctx);
  const rows: SalesEngineLeadRow[] = [];
  let total = 0;
  for (const opportunity of opportunities) {
    // The won list mirrors the adapter: trust only status === 'won'.
    if (options.wonOnly && (opportunity.status || "").toLowerCase() !== "won") continue;
    const contact = await resolveContact(
      opportunity.contact?.id || opportunity.contactId || null,
    );
    const channel = contact ? contactChannel(contact) : "Unknown";
    if (!channelMatchesBucket(channel, bucket)) continue;
    total += 1;
    if (rows.length < SALES_ENGINE_DRILLDOWN_ROW_LIMIT) {
      rows.push(shapeOpportunityRow(
        opportunity,
        contact,
        opportunity.pipelineStageId ? stageNames.get(opportunity.pipelineStageId) : null,
      ));
    }
  }
  return { rows, total, truncated: hasMore };
}

// ── Entry point ──────────────────────────────────────────────────────────────

export async function fetchSalesEngineLeads(
  query: SalesEngineLeadsQuery,
): Promise<SalesEngineLeadsResult> {
  const fetchImpl = query.fetchImpl ?? (fetch as unknown as FetchLike);
  const ctx: GhlContext = {
    locationId: query.locationId,
    fetchImpl,
    headers: {
      Authorization: `Bearer ${query.apiKey}`,
      "Content-Type": "application/json",
      Version: CONTACTS_VERSION,
    },
  };

  let result: { rows: SalesEngineLeadRow[]; total: number; truncated: boolean };
  if (query.stage === "won") {
    result = await listOpportunities(ctx, query.bucket, { wonOnly: true });
  } else {
    if (!query.from || !query.to) {
      throw new Error(`sales-engine-leads: stage ${query.stage} requires from/to`);
    }
    if (query.stage === "opportunities") {
      result = await listOpportunities(ctx, query.bucket, {
        wonOnly: false,
        from: query.from,
        to: query.to,
      });
    } else {
      const timezone = await resolveTimezone(ctx, query.timezone);
      const bounds = zonedRangeBounds(query.from, query.to, timezone);
      result = query.stage === "leads"
        ? await listLeads(ctx, query.bucket, bounds.fromIso, bounds.toIso)
        : await listMeetings(ctx, query.bucket, bounds.fromTs, bounds.toTs);
    }
  }

  // Newest first — the drill-down is a "who just came in" list.
  const rows = [...result.rows].sort((left, right) => right.date.localeCompare(left.date));
  return {
    stage: query.stage,
    bucket: query.bucket,
    rows,
    total: result.total,
    truncated: result.truncated,
  };
}
