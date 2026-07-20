/**
 * Sales-engine drill-down (SAN-326): pure helpers behind
 * `GET /api/metrics/sales-engine-leads`. A matrix cell (stage × channel bucket)
 * opens the list of the actual GHL records behind the number, so the channel
 * attribution here MUST collapse exactly like the metrics-collector adapter
 * (`skills/metrics-collector/scripts/adapters/ghl.js` → `contactChannel()`);
 * otherwise the drill-down list would not reconcile with the counts.
 *
 * Pure and client-safe: no fs, no fetch, no DB.
 */

import {
  CHANNEL_BUCKETS,
  mapChannelToBucket,
  type ChannelBucketKey,
} from "@/lib/metrics/channel-buckets";

export const SALES_ENGINE_DRILLDOWN_STAGES = [
  "leads",
  "meetings",
  "opportunities",
  "won",
] as const;

export type SalesEngineDrilldownStage =
  (typeof SALES_ENGINE_DRILLDOWN_STAGES)[number];

/** Max rows returned by the drill-down endpoint. */
export const SALES_ENGINE_DRILLDOWN_ROW_LIMIT = 100;

/** One list row. `source` is the collapsed acquisition channel (the string the
 * bucket was derived from), so the user can always see why a record landed in
 * a bucket. Stage-specific fields are optional. */
export interface SalesEngineLeadRow {
  name: string;
  email: string;
  companyName: string;
  source: string;
  /** ISO date(time) of the record for the stage: dateAdded (leads), event
   * start (meetings), createdAt (opportunities/won). */
  date: string;
  /** meetings only — appointment status. */
  status?: string;
  /** opportunities/won only. */
  pipelineStage?: string;
  monetaryValue?: number;
}

export interface SalesEngineLeadsResult {
  stage: SalesEngineDrilldownStage;
  bucket: ChannelBucketKey | null;
  rows: SalesEngineLeadRow[];
  /** Total matching records seen (may exceed rows.length). */
  total: number;
  /** True when provider paging caps prevented reading every record. */
  truncated: boolean;
}

export function parseSalesEngineStage(
  value: unknown,
): SalesEngineDrilldownStage | null {
  return SALES_ENGINE_DRILLDOWN_STAGES.includes(value as SalesEngineDrilldownStage)
    ? (value as SalesEngineDrilldownStage)
    : null;
}

/**
 * Bucket param: a bucket id filters to that column; absent/"total" means the
 * Total column (no channel filter). Unknown ids are a caller error (null).
 */
export function parseSalesEngineBucket(
  value: unknown,
): { bucket: ChannelBucketKey | null } | null {
  if (value == null || value === "" || value === "total") return { bucket: null };
  const key = CHANNEL_BUCKETS.find((bucket) => bucket.key === value)?.key;
  return key ? { bucket: key } : null;
}

/**
 * Collapse a GHL contact's acquisition channel. TS port of the adapter's
 * `contactChannel()` — keep byte-for-byte semantics: explicit source first,
 * then first attribution (`medium/utmSessionSource` when both, else medium),
 * else 'Unknown'.
 */
export function contactChannel(contact: {
  source?: string | null;
  attributions?: Array<{
    medium?: string | null;
    utmSessionSource?: string | null;
  }> | null;
} | null | undefined): string {
  const source = contact?.source || "";
  const attr = contact?.attributions?.[0];
  const medium = attr?.medium || "";
  const utmSource = attr?.utmSessionSource || "";
  return source || (utmSource ? `${medium}/${utmSource}` : medium) || "Unknown";
}

/** True when a raw channel string belongs to the requested bucket (or when the
 * request is for the Total column). */
export function channelMatchesBucket(
  rawChannel: string,
  bucket: ChannelBucketKey | null,
): boolean {
  if (bucket == null) return true;
  return mapChannelToBucket(rawChannel) === bucket;
}

interface GhlContactLike {
  contactName?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  companyName?: string | null;
  dateAdded?: string | null;
  source?: string | null;
  attributions?: Array<{
    medium?: string | null;
    utmSessionSource?: string | null;
  }> | null;
}

export function contactDisplayName(contact: GhlContactLike | null | undefined): string {
  return (
    contact?.contactName
    || [contact?.firstName, contact?.lastName].filter(Boolean).join(" ")
    || "—"
  );
}

export function shapeLeadRow(contact: GhlContactLike): SalesEngineLeadRow {
  return {
    name: contactDisplayName(contact),
    email: contact.email || "",
    companyName: contact.companyName || "",
    source: contactChannel(contact),
    date: contact.dateAdded || "",
  };
}

export function shapeMeetingRow(
  event: {
    startTime?: string | number | null;
    appointmentStatus?: string | null;
    status?: string | null;
  },
  contact: GhlContactLike | null,
): SalesEngineLeadRow {
  return {
    name: contactDisplayName(contact),
    email: contact?.email || "",
    companyName: contact?.companyName || "",
    source: contact ? contactChannel(contact) : "Unknown",
    date: event.startTime != null ? String(event.startTime) : "",
    status: event.appointmentStatus || event.status || "scheduled",
  };
}

export function shapeOpportunityRow(
  opportunity: {
    createdAt?: string | null;
    dateAdded?: string | null;
    monetaryValue?: number | null;
    pipelineStageId?: string | null;
  },
  contact: GhlContactLike | null,
  stageName?: string | null,
): SalesEngineLeadRow {
  const monetary = Number(opportunity.monetaryValue ?? 0);
  return {
    name: contactDisplayName(contact),
    email: contact?.email || "",
    companyName: contact?.companyName || "",
    source: contact ? contactChannel(contact) : "Unknown",
    date: opportunity.createdAt || opportunity.dateAdded || "",
    pipelineStage: stageName || opportunity.pipelineStageId || "",
    monetaryValue: Number.isFinite(monetary) ? monetary : 0,
  };
}
