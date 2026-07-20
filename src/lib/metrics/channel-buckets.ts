/**
 * Channel buckets for the "Motor de ventas" funnel×channel matrix (SAN-326).
 *
 * GHL is the single source of truth for people-numbers; a lead's raw channel
 * comes from the GHL contact source/attribution (see the GHL adapter's channel
 * collapse). This module maps those raw provider strings onto the six
 * acquisition buckets the sales-engine matrix presents as columns. Pure and
 * client-safe: no DB, no provider calls.
 */

export type ChannelBucketKey =
  | "web"
  | "paid"
  | "linkedin"
  | "email"
  | "trust"
  | "otros";

export interface ChannelBucket {
  key: ChannelBucketKey;
  label: string;
}

/** Column order of the sales-engine matrix. */
export const CHANNEL_BUCKETS: ChannelBucket[] = [
  { key: "web", label: "Web" },
  { key: "paid", label: "Paid" },
  { key: "linkedin", label: "LinkedIn" },
  { key: "email", label: "Email/Outbound" },
  { key: "trust", label: "Trust Score" },
  { key: "otros", label: "Otros" },
];

const BUCKET_LABELS: Record<ChannelBucketKey, string> = Object.fromEntries(
  CHANNEL_BUCKETS.map((bucket) => [bucket.key, bucket.label]),
) as Record<ChannelBucketKey, string>;

export function channelBucketLabel(key: ChannelBucketKey): string {
  return BUCKET_LABELS[key];
}

/**
 * First-match-wins mapping from a raw GHL channel string to a bucket.
 * Order matters: LinkedIn before Email (a LinkedIn outreach touch stays
 * LinkedIn even if it belongs to an email-tool sequence), tools before broad
 * medium words, and Paid before Web so ad-sourced form fills stay Paid.
 */
const BUCKET_RULES: Array<{ bucket: ChannelBucketKey; pattern: RegExp }> = [
  { bucket: "linkedin", pattern: /linkedin/i },
  // Explee AutoGTM and the cold-email tools are Email/Outbound.
  { bucket: "email", pattern: /explee|instantly|lemlist|email/i },
  // Trust Engine touchpoints (trust-bridge, Trust Score Analyzer…).
  { bucket: "trust", pattern: /trust/i },
  { bucket: "paid", pattern: /facebook|meta|google.*(cpc|ads)|paid/i },
  // Calendars, "Reunión"/demo forms and organic web forms.
  { bucket: "web", pattern: /calendar|reuni|demo|form|organic|website|web/i },
];

export function mapChannelToBucket(raw: string): ChannelBucketKey {
  const channel = (raw ?? "").trim();
  if (!channel) return "otros";
  for (const rule of BUCKET_RULES) {
    if (rule.pattern.test(channel)) return rule.bucket;
  }
  return "otros";
}
