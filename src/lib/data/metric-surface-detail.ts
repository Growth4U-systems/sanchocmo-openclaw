import {
  and,
  eq,
  gt,
  gte,
  inArray,
  lte,
  max,
  or,
  type SQL,
} from "drizzle-orm";
import { getDb, hasDatabase } from "@/db/drizzle";
import {
  metricCollectionSchedule,
  metricSnapshots,
  metricSourceRuns,
} from "@/db/schema";
import { ensureMetricsStorage } from "@/lib/data/metrics-snapshots";
import {
  aggFor,
  latestMetricNamesForSources,
  reduceMetricSeries,
  weightMetricFor,
  type AggStrategy,
  type AggregationQuality,
  type DatedMetricValue,
} from "@/lib/metrics/aggregation";
import {
  isDemoQualityMetadata,
  isMetricMetadataDimensionKey,
  metricScopeEvidenceStatus,
} from "@/lib/metrics/provenance";
import {
  assertMetricCalendarRange,
  type MetricCalendarRange,
} from "@/lib/metrics/read-query";
import {
  defaultScheduleFor,
  isDueToday,
  normalizeCadence,
  type Cadence,
  type CollectionSchedule,
} from "@/lib/metrics/collection-schedule";
import { normalizeSourceId } from "@/lib/metrics/semantic-kpis";
import { getSurface, type SurfaceKey } from "@/lib/metrics/surfaces";

const DAY_MS = 86_400_000;
const LATEST_STALE_AFTER_DAYS = 7;

/**
 * A detail request intentionally stays bounded. Snapshot rows are read in
 * deterministic pages so ordinary Meta histories do not fail at 20k rows. If
 * the hard safety cap is ever reached, `complete=false` makes the partial result
 * explicit instead of presenting a silently truncated campaign/post list.
 */
export const MAX_SURFACE_DETAIL_DAYS = 366;
export const SURFACE_DETAIL_PAGE_ROWS = 5_000;
export const MAX_SURFACE_DETAIL_ROWS = 250_000;
export const MAX_SURFACE_DETAIL_GROUPS = 10_000;

export type MetricSurfaceDetailQuality = Exclude<AggregationQuality, "missing">
  | "demo"
  | "dirty"
  | "stale";

export interface MetricSurfaceDetailMetric {
  metric: string;
  value: number;
  aggregation: AggStrategy;
  quality: MetricSurfaceDetailQuality;
  dimensions: Record<string, string> | null;
}

export interface MetricSurfaceDetailSource {
  source: string;
  coverage: MetricSurfaceDetailCoverage;
  metrics: MetricSurfaceDetailMetric[];
}

export type MetricSurfaceDetailIncompleteReason =
  | "row_limit"
  | "group_limit"
  | "storage_unconfigured";

export interface MetricSurfaceDetailCompleteness {
  rowsRead: number;
  groups: number;
  rowLimit: number;
  groupLimit: number;
  reason: MetricSurfaceDetailIncompleteReason | null;
}

export interface MetricSurfaceDetailCoverage {
  cadence: Cadence;
  enabled: boolean;
  /** UTC calendar day used to decide whether provider data is publishable. */
  asOf: string;
  /** Last provider day expected to be available after the source-specific lag. */
  availableThrough: string;
  expectedDates: string[];
  /** Scheduled provider days still inside the provider's publication lag. */
  pendingDates: string[];
  observedDates: string[];
  missingDates: string[];
  failedDates: string[];
  ratio: number | null;
  lastObservedDate: string | null;
  latestExpectedDate: string | null;
}

export interface MetricSurfaceDetailResult {
  configured: boolean;
  complete: boolean;
  completeness: MetricSurfaceDetailCompleteness;
  surface: SurfaceKey;
  from: string;
  to: string;
  sources: MetricSurfaceDetailSource[];
}

export interface MetricSurfaceDetailSnapshotRow {
  id?: string | null;
  date: string;
  source: string;
  metric: string;
  value: number | null;
  dimsKey: string | null;
  dimensions: Record<string, unknown> | null;
  collectedAt?: Date | string | null;
  updatedAt?: Date | string | null;
}

export interface MetricSurfaceDetailScheduleRow {
  source: string;
  cadence: string | null;
  daysOfWeek: number[] | null;
  cronExpr: string | null;
  enabled: boolean;
  updatedAt?: Date | string | null;
}

export interface MetricSurfaceDetailRunRow {
  source: string;
  metricDate: string;
  status: string;
  dateBasis?: string | null;
  rowCount?: number | null;
  collectedAt?: Date | string | null;
  updatedAt?: Date | string | null;
}

export interface MetricSurfaceDetailBuildOptions {
  schedules?: ReadonlyArray<MetricSurfaceDetailScheduleRow>;
  runs?: ReadonlyArray<MetricSurfaceDetailRunRow>;
  /** Injectable UTC as-of instant/day for deterministic availability checks. */
  asOf?: Date | string;
  inputComplete?: boolean;
  rowsRead?: number;
  limitReason?: MetricSurfaceDetailIncompleteReason | null;
}

interface LogicalDimensions {
  dimensions: Record<string, string> | null;
  key: string;
}

interface GroupedSeries {
  source: string;
  metric: string;
  dimensions: Record<string, string> | null;
  dimensionKey: string;
  displayEvidence: MetricSurfaceDetailSnapshotRow;
  points: DatedMetricValue[];
  rowQualities: StoredQuality[];
}

type StoredQuality = "ok" | "partial" | "missing" | "dirty" | "stale" | "demo";

const STORED_QUALITIES = new Set<StoredQuality>([
  "ok",
  "partial",
  "missing",
  "dirty",
  "stale",
  "demo",
]);

const STORED_SOURCE_ALIASES: Record<string, string[]> = {
  meta_ads: ["meta", "meta-ads", "meta_ads", "metaads"],
  google_ads: ["google", "google-ads", "google_ads", "googleads"],
  ga4: ["ga4", "google-analytics", "google_analytics", "google_analytics_4"],
  gsc: ["gsc", "google-search-console", "google_search_console"],
  ghl: ["ghl", "go-high-level", "go_high_level", "gohighlevel"],
  trust_score: [
    "trust_score",
    "trust-score",
    "trust core",
    "trust_core",
    "trust-core",
    "trust engine",
    "trust_engine",
  ],
};

function canonicalSurfaceSource(source: string): string {
  const semantic = normalizeSourceId(source);
  const raw = source.trim().toLowerCase();
  for (const [canonical, aliases] of Object.entries(STORED_SOURCE_ALIASES)) {
    if (aliases.some((alias) => alias.toLowerCase() === raw)) return canonical;
  }
  return semantic;
}

export function metricSurfaceStoredSources(
  registrySources: ReadonlyArray<string>,
): string[] {
  const canonical = [...new Set(registrySources.map(canonicalSurfaceSource))];
  return [...new Set([
    ...registrySources,
    ...canonical,
    ...canonical.flatMap((source) => STORED_SOURCE_ALIASES[source] ?? [source]),
  ])];
}

function utcDay(value: string): number {
  return Date.parse(`${value}T00:00:00.000Z`);
}

export function assertMetricSurfaceDetailRange(range: MetricCalendarRange): asserts range is {
  from: string;
  to: string;
} {
  assertMetricCalendarRange(range, { requireBoth: true });
  const days = Math.floor((utcDay(range.to!) - utcDay(range.from!)) / DAY_MS) + 1;
  if (days > MAX_SURFACE_DETAIL_DAYS) {
    throw new RangeError(
      `surface detail range cannot exceed ${MAX_SURFACE_DETAIL_DAYS} days`,
    );
  }
}

function logicalDimensions(
  dimensions: Record<string, unknown> | null | undefined,
): LogicalDimensions {
  const entries = Object.entries(dimensions ?? {})
    .filter(([key, value]) =>
      !isMetricMetadataDimensionKey(key) && value != null && String(value) !== "")
    .map(([key, value]) => [key, String(value)] as const)
    .sort(([left], [right]) => left.localeCompare(right));
  if (!entries.length) return { dimensions: null, key: "" };
  const normalized = Object.fromEntries(entries);
  return { dimensions: normalized, key: JSON.stringify(entries) };
}

function dimensionIdentityKey(
  source: string,
  metric: string,
  display: LogicalDimensions,
): string {
  const dimensions = display.dimensions;
  if (!dimensions) return display.key;
  let identityKeys: string[] = [];

  if (source === "ghl" && metric === "pipeline" && dimensions.pipelineId) {
    identityKeys = ["pipelineId"];
  } else if (
    source === "ghl"
    && metric === "pipelineStage"
    && dimensions.pipelineId
    && dimensions.stageId
  ) {
    identityKeys = ["pipelineId", "stageId"];
  } else if (
    source === "meta_ads"
    && ["campaignId", "adsetId", "adId"].some((key) => dimensions[key])
  ) {
    // Labels can be renamed while Meta's IDs remain stable. Keep every
    // non-label breakdown dimension so placement/audience rows stay distinct.
    const mutableLabels = new Set([
      "campaign",
      "campaignName",
      "adset",
      "adsetName",
      "ad",
      "adName",
    ]);
    identityKeys = Object.keys(dimensions).filter((key) => !mutableLabels.has(key));
  } else if (source === "google_ads" && dimensions.campaignId) {
    const mutableLabels = new Set(["campaign", "campaignName"]);
    identityKeys = Object.keys(dimensions).filter((key) => !mutableLabels.has(key));
  } else if (
    source === "metricool"
    && metric.startsWith("post")
    && dimensions.postId
  ) {
    identityKeys = dimensions.network
      ? ["network", "postId"]
      : ["postId"];
  } else if (
    source === "posthog"
    && metric === "funnel_step_reached"
    && dimensions.step
  ) {
    // Funnel order and expectedSteps are mutable display/config metadata. The
    // event name is the stable identity whose daily reached counts add up.
    identityKeys = ["step"];
  }

  if (!identityKeys.length) return display.key;
  return JSON.stringify(identityKeys.map((key) => [key, dimensions[key]]));
}

function storedQuality(
  dimensions: Record<string, unknown> | null | undefined,
): StoredQuality {
  if (isDemoQualityMetadata(dimensions)) return "demo";
  const raw = dimensions?.__quality ?? dimensions?.quality;
  const normalized = String(raw ?? "ok").trim().toLowerCase();
  return STORED_QUALITIES.has(normalized as StoredQuality)
    ? (normalized as StoredQuality)
    : "ok";
}

function groupKey(source: string, metric: string, dimensionKey: string): string {
  return JSON.stringify([source, metric, dimensionKey]);
}

function snapshotEvidenceKey(
  source: string,
  date: string,
  metric: string,
  dimensionKey: string,
): string {
  return JSON.stringify([source, date, metric, dimensionKey]);
}

function timestamp(value: Date | string | null | undefined): number {
  if (!value) return 0;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function newerEvidence<
  T extends {
    source: string;
    collectedAt?: Date | string | null;
    updatedAt?: Date | string | null;
    id?: string | null;
    date?: string;
    metricDate?: string;
  },
>(candidate: T, current: T, canonicalSource: string): boolean {
  const collectedDelta = timestamp(candidate.collectedAt) - timestamp(current.collectedAt);
  if (collectedDelta) return collectedDelta > 0;
  const updatedDelta = timestamp(candidate.updatedAt) - timestamp(current.updatedAt);
  if (updatedDelta) return updatedDelta > 0;
  const candidateDate = candidate.date ?? candidate.metricDate ?? "";
  const currentDate = current.date ?? current.metricDate ?? "";
  const dateComparison = candidateDate.localeCompare(currentDate);
  if (dateComparison) return dateComparison > 0;
  const candidateCanonical = candidate.source === canonicalSource;
  const currentCanonical = current.source === canonicalSource;
  if (candidateCanonical !== currentCanonical) return candidateCanonical;
  const sourceComparison = candidate.source.localeCompare(current.source);
  if (sourceComparison) return sourceComparison > 0;
  return String(candidate.id ?? "").localeCompare(String(current.id ?? "")) > 0;
}

interface PreparedSnapshotRow {
  row: MetricSurfaceDetailSnapshotRow;
  source: string;
  display: LogicalDimensions;
  identityKey: string;
  quality: StoredQuality;
}

interface SnapshotSetPolicy {
  /** A clean source snapshot on this date is authoritative for membership. */
  authoritativeDate: string | null;
  /** Quality applied when the latest source evidence cannot authorize removal. */
  retainedQuality: MetricSurfaceDetailQuality | null;
}

const SNAPSHOT_SET_METRICS: Readonly<Record<string, ReadonlySet<string>>> = {
  ghl: new Set(["pipeline", "pipelineStage"]),
  metricool: new Set(["followers"]),
};

function prepareSnapshotRows(
  allowedSources: ReadonlySet<string>,
  range: { from: string; to: string },
  rows: ReadonlyArray<MetricSurfaceDetailSnapshotRow>,
  asOf: string,
): PreparedSnapshotRow[] {
  const deduped = new Map<string, PreparedSnapshotRow>();
  for (const row of rows) {
    const source = canonicalSurfaceSource(row.source);
    if (!allowedSources.has(source)) continue;
    const insideFlowRange = row.date >= range.from && row.date <= range.to;
    const isLatestObservation = aggFor(source, row.metric) === "latest"
      && row.date <= asOf;
    if (!insideFlowRange && !isLatestObservation) continue;
    const display = logicalDimensions(row.dimensions);
    const identityKey = dimensionIdentityKey(source, row.metric, display);
    const key = snapshotEvidenceKey(source, row.date, row.metric, identityKey);
    const candidate = {
      row,
      source,
      display,
      identityKey,
      quality: storedQuality(row.dimensions),
    };
    const current = deduped.get(key);
    if (!current || newerEvidence(row, current.row, source)) deduped.set(key, candidate);
  }
  return [...deduped.values()];
}

function addDays(value: string, days: number): string {
  return new Date(utcDay(value) + days * DAY_MS).toISOString().slice(0, 10);
}

function asOfDay(value: Date | string | undefined): string {
  const parsed = value instanceof Date
    ? value
    : value == null
      ? new Date()
      : new Date(value.length === 10 ? `${value}T00:00:00.000Z` : value);
  if (Number.isNaN(parsed.getTime())) {
    throw new RangeError(`Invalid surface detail asOf: ${String(value)}`);
  }
  const day = parsed.toISOString().slice(0, 10);
  if (typeof value === "string" && value.length === 10 && value !== day) {
    throw new RangeError(`Invalid surface detail asOf: ${value}`);
  }
  return day;
}

function providerLagDays(source: string): number {
  if (source === "gsc") return 3;
  if (source === "trust_score") return 0;
  return 1;
}

function providerDateAvailability(
  range: { from: string; to: string },
  source: string,
  schedule: CollectionSchedule,
  asOf: string,
): { availableThrough: string; expectedDates: string[]; pendingDates: string[] } {
  const lag = providerLagDays(source);
  const availableThrough = addDays(asOf, -lag);
  if (!schedule.enabled) return { availableThrough, expectedDates: [], pendingDates: [] };
  const expectedDates: string[] = [];
  const pendingDates: string[] = [];
  for (let time = utcDay(range.from); time <= utcDay(range.to); time += DAY_MS) {
    const providerDate = new Date(time).toISOString().slice(0, 10);
    const collectionDate = addDays(providerDate, lag);
    if (isDueToday(schedule, new Date(`${collectionDate}T12:00:00.000Z`))) {
      (providerDate <= availableThrough ? expectedDates : pendingDates).push(providerDate);
    }
  }
  return { availableThrough, expectedDates, pendingDates };
}

function resolvedSchedules(
  sources: ReadonlyArray<string>,
  rows: ReadonlyArray<MetricSurfaceDetailScheduleRow>,
): Map<string, CollectionSchedule> {
  const sourceSet = new Set(sources);
  const selected = new Map<string, MetricSurfaceDetailScheduleRow>();
  for (const row of rows) {
    const source = canonicalSurfaceSource(row.source);
    if (!sourceSet.has(source)) continue;
    const current = selected.get(source);
    if (!current || newerEvidence(row, current, source)) selected.set(source, row);
  }
  return new Map(sources.map((source) => {
    const stored = selected.get(source);
    if (!stored) return [source, defaultScheduleFor(source)] as const;
    return [source, {
      source,
      cadence: normalizeCadence(stored.cadence),
      daysOfWeek: Array.isArray(stored.daysOfWeek) ? stored.daysOfWeek : [],
      cronExpr: stored.cronExpr ?? null,
      enabled: stored.enabled,
    }] as const;
  }));
}

function latestCanonicalRuns(
  sources: ReadonlySet<string>,
  rows: ReadonlyArray<MetricSurfaceDetailRunRow>,
): Array<MetricSurfaceDetailRunRow & { canonicalSource: string }> {
  const selected = new Map<string, MetricSurfaceDetailRunRow & { canonicalSource: string }>();
  for (const row of rows) {
    const canonicalSource = canonicalSurfaceSource(row.source);
    if (!sources.has(canonicalSource)) continue;
    const dateBasis = row.dateBasis === "provider" ? "provider" : "collection";
    const key = JSON.stringify([canonicalSource, dateBasis, row.metricDate]);
    const candidate = { ...row, canonicalSource };
    const current = selected.get(key);
    if (!current || newerEvidence(row, current, canonicalSource)) selected.set(key, candidate);
  }
  return [...selected.values()];
}

function sourceCoverage(
  source: string,
  range: { from: string; to: string },
  schedule: CollectionSchedule,
  rows: ReadonlyArray<PreparedSnapshotRow>,
  runs: ReadonlyArray<MetricSurfaceDetailRunRow & { canonicalSource: string }>,
  asOf: string,
): MetricSurfaceDetailCoverage {
  const availability = providerDateAvailability(range, source, schedule, asOf);
  const { availableThrough, expectedDates } = availability;
  const expected = new Set(expectedDates);
  const observed = new Set<string>();
  const failed = new Set<string>();
  const completeScopeDates = new Set<string>();
  const providerCollectionEvidence = new Set(runs
    .filter((run) => run.dateBasis === "provider" && timestamp(run.collectedAt) > 0)
    .map((run) => JSON.stringify([
      run.canonicalSource,
      timestamp(run.collectedAt),
    ])));

  for (const prepared of rows) {
    const scopeStatus = metricScopeEvidenceStatus(prepared.row.dimensions);
    if (
      prepared.source === source
      && prepared.row.date >= range.from
      && prepared.row.date <= range.to
      && scopeStatus === "complete"
    ) {
      // A complete empty metric scope is real provider evidence, not a missing
      // day. Its sentinel deliberately has no numeric value so reducers remain
      // honest while coverage can still distinguish zero rows from no attempt.
      observed.add(prepared.row.date);
      completeScopeDates.add(prepared.row.date);
    } else if (
      prepared.source === source
      && prepared.row.date >= range.from
      && prepared.row.date <= range.to
      && scopeStatus === "partial"
    ) {
      failed.add(prepared.row.date);
    }
    if (
      prepared.source === source
      && prepared.row.date >= range.from
      && prepared.row.date <= range.to
      && prepared.row.value != null
      && Number.isFinite(Number(prepared.row.value))
      && prepared.quality !== "missing"
    ) {
      observed.add(prepared.row.date);
    }
  }
  for (const run of runs) {
    if (run.canonicalSource !== source) continue;
    const status = run.status.trim().toLowerCase();
    const exactProviderDate = run.dateBasis === "provider"
      || status === "connected_no_data";
    // New collectors write both one execution/health row and exact provider
    // evidence with the same collectedAt. Do not project that paired collection
    // row by D-lag as well — that would make a historical backfill failure look
    // like a failure for yesterday. Unpaired rows remain the legacy fallback.
    if (
      !exactProviderDate
      && timestamp(run.collectedAt) > 0
      && providerCollectionEvidence.has(JSON.stringify([
        run.canonicalSource,
        timestamp(run.collectedAt),
      ]))
    ) {
      continue;
    }
    const providerDate = exactProviderDate
      ? run.metricDate
      : addDays(run.metricDate, -providerLagDays(source));
    if (providerDate < range.from || providerDate > range.to) continue;
    if (status === "connected_no_data") {
      // This ledger status is intentionally persisted on the exact restated
      // provider day. Ordinary ok/error/skipped rows use collection day; an ok
      // backfill does not reveal which provider dates it covered, so snapshots
      // (not a blind D-N mapping) remain the positive coverage evidence.
      observed.add(providerDate);
    } else if (
      status === "error"
      || status === "partial"
      || status === "skipped"
      || (
        status === "ok"
        && run.rowCount != null
        && run.rowCount <= 0
        && !completeScopeDates.has(providerDate)
      )
    ) {
      failed.add(providerDate);
    }
  }

  const observedDates = [...observed].sort();
  const missingDates = expectedDates.filter((date) => !observed.has(date));
  const pendingDates = availability.pendingDates.filter((date) => !observed.has(date));
  const failedDates = [...failed].sort();
  const observedExpected = expectedDates.filter((date) => observed.has(date)).length;
  return {
    cadence: schedule.cadence,
    enabled: schedule.enabled,
    asOf,
    availableThrough,
    expectedDates,
    pendingDates,
    observedDates,
    missingDates,
    failedDates,
    ratio: expected.size ? observedExpected / expected.size : null,
    lastObservedDate: observedDates.at(-1) ?? null,
    latestExpectedDate: expectedDates.at(-1) ?? null,
  };
}

function isUsableSnapshotValue(prepared: PreparedSnapshotRow): boolean {
  return prepared.row.value != null
    && Number.isFinite(Number(prepared.row.value))
    && prepared.quality !== "missing";
}

/**
 * Some provider rows describe a complete daily set, not independent entities
 * that live forever: GHL pipelines/stages and Metricool followers by network.
 * Their adapters propagate a source-level `partial` marker when collection is
 * incomplete. Consequently, a clean latest source snapshot may remove
 * identities that disappeared; partial, failed, truncated or absent evidence
 * must retain the previous set instead.
 */
function sourceSnapshotSetPolicy(
  source: string,
  rows: ReadonlyArray<PreparedSnapshotRow>,
  coverage: MetricSurfaceDetailCoverage | undefined,
  inputComplete: boolean,
): SnapshotSetPolicy {
  const snapshotFamily = SNAPSHOT_SET_METRICS[source] ?? new Set<string>();
  // Membership evidence is metric-family scoped. Unrelated clean flow rows on
  // the same provider day cannot prove that a retained stock set disappeared.
  const sourceRows = rows.filter((prepared) =>
    prepared.source === source && snapshotFamily.has(prepared.row.metric));
  const latestSourceDate = sourceRows
    .map((prepared) => prepared.row.date)
    .sort()
    .at(-1) ?? null;
  // The provider's current-state observation may legitimately be newer than
  // the flow window (for example a 1d preset ends yesterday but GHL state was
  // observed today). Conversely, a due flow day with no family evidence must
  // prevent an older set from becoming authoritative. Use the newer boundary.
  const candidateDate = [coverage?.latestExpectedDate ?? null, latestSourceDate]
    .filter((date): date is string => Boolean(date))
    .sort()
    .at(-1) ?? null;
  if (!candidateDate) {
    return { authoritativeDate: null, retainedQuality: null };
  }

  const candidateRows = sourceRows.filter((prepared) =>
    prepared.row.date === candidateDate);
  const candidateFailed = coverage?.failedDates.includes(candidateDate) ?? false;
  const candidateHasPartialScope = candidateRows.some((prepared) =>
    metricScopeEvidenceStatus(prepared.row.dimensions) === "partial");
  const candidateClean = !candidateHasPartialScope
    && [...snapshotFamily].every((metric) => {
      const metricRows = candidateRows.filter((prepared) =>
        prepared.row.metric === metric);
      if (!metricRows.length) return false;
      const hasCompleteScope = metricRows.some((prepared) =>
        metricScopeEvidenceStatus(prepared.row.dimensions) === "complete");
      const valueRows = metricRows.filter((prepared) =>
        metricScopeEvidenceStatus(prepared.row.dimensions) == null);
      return (hasCompleteScope || valueRows.length > 0)
        && valueRows.every((prepared) =>
          isUsableSnapshotValue(prepared) && prepared.quality === "ok");
    });

  if (inputComplete && !candidateFailed && candidateClean) {
    return { authoritativeDate: candidateDate, retainedQuality: null };
  }

  if (!inputComplete) {
    return { authoritativeDate: null, retainedQuality: "partial" };
  }
  if (candidateHasPartialScope) {
    return { authoritativeDate: null, retainedQuality: "partial" };
  }
  if (candidateFailed || candidateRows.length === 0) {
    return { authoritativeDate: null, retainedQuality: "stale" };
  }
  if (candidateRows.some((prepared) => prepared.quality === "dirty")) {
    return { authoritativeDate: null, retainedQuality: "dirty" };
  }
  if (candidateRows.some((prepared) => prepared.quality === "stale")) {
    return { authoritativeDate: null, retainedQuality: "stale" };
  }
  return { authoritativeDate: null, retainedQuality: "partial" };
}

function isSnapshotSetGroup(group: Pick<GroupedSeries, "source" | "metric">): boolean {
  return SNAPSHOT_SET_METRICS[group.source]?.has(group.metric) ?? false;
}

function mergeRetainedSnapshotQuality(
  quality: MetricSurfaceDetailQuality,
  retainedQuality: MetricSurfaceDetailQuality | null,
): MetricSurfaceDetailQuality {
  if (!retainedQuality) return quality;
  if (quality === "dirty" || retainedQuality === "dirty") return "dirty";
  if (quality === "stale" || retainedQuality === "stale") return "stale";
  if (quality === "partial" || retainedQuality === "partial") return "partial";
  if (quality === "demo" || retainedQuality === "demo") return "demo";
  return "ok";
}

function combinedQuality(
  aggregationQuality: AggregationQuality,
  valueQualities: StoredQuality[],
  weightQualities: StoredQuality[],
): MetricSurfaceDetailQuality {
  const qualities = [...valueQualities, ...weightQualities];
  if (qualities.includes("dirty")) return "dirty";
  if (qualities.includes("stale")) return "stale";

  const demoCount = qualities.filter((quality) => quality === "demo").length;
  const nonDemoCount = qualities.filter((quality) => quality !== "demo").length;
  if (demoCount > 0 && nonDemoCount === 0) return "demo";
  if (
    aggregationQuality === "partial"
    || qualities.includes("partial")
    || qualities.includes("missing")
    || (demoCount > 0 && nonDemoCount > 0)
  ) {
    return "partial";
  }
  return "ok";
}

function valueQualitiesForReduction(
  group: GroupedSeries,
  aggregation: AggStrategy,
): StoredQuality[] {
  if (aggregation !== "latest") return group.rowQualities;
  const latestDate = group.points.reduce(
    (latest, point) => point.date > latest ? point.date : latest,
    "",
  );
  return group.rowQualities.filter((_, index) =>
    group.points[index]?.date === latestDate);
}

function weightQualitiesForReduction(
  valueGroup: GroupedSeries,
  weightGroup: GroupedSeries | undefined,
): StoredQuality[] {
  if (!weightGroup) return [];
  const valueDates = new Set(valueGroup.points.map((point) => point.date));
  return weightGroup.rowQualities.filter((_, index) => {
    const point = weightGroup.points[index];
    return Boolean(point && valueDates.has(point.date));
  });
}

function qualityWithCoverage(
  quality: MetricSurfaceDetailQuality,
  aggregation: AggStrategy,
  coverage: MetricSurfaceDetailCoverage,
  complete: boolean,
  points: ReadonlyArray<DatedMetricValue>,
): MetricSurfaceDetailQuality {
  if (quality === "dirty") return quality;
  const latestPointDate = points.map((point) => point.date).sort().at(-1) ?? null;
  if (
    aggregation === "latest"
    && coverage.latestExpectedDate
    && coverage.missingDates.includes(coverage.latestExpectedDate)
    && (!latestPointDate || latestPointDate < coverage.latestExpectedDate)
  ) {
    return "stale";
  }
  if (quality === "stale" || quality === "demo") return quality;
  if (
    aggregation === "latest"
    && latestPointDate
    && coverage.latestExpectedDate
    && latestPointDate >= coverage.latestExpectedDate
  ) {
    return complete ? quality : "partial";
  }
  if (
    !complete
    || coverage.missingDates.length > 0
    || coverage.failedDates.length > 0
  ) {
    return "partial";
  }
  return quality;
}

function qualityWithObservationAge(
  quality: MetricSurfaceDetailQuality,
  aggregation: AggStrategy,
  points: ReadonlyArray<DatedMetricValue>,
  asOf: string,
): MetricSurfaceDetailQuality {
  if (quality === "dirty" || aggregation !== "latest" || points.length === 0) {
    return quality;
  }
  const latest = points.map((point) => point.date).sort().at(-1);
  if (latest && (utcDay(asOf) - utcDay(latest)) / DAY_MS > LATEST_STALE_AFTER_DAYS) {
    return "stale";
  }
  return quality;
}

/**
 * Pure surface-detail reducer. It repeats the storage filters defensively so a
 * caller cannot accidentally leak a different tenant window/surface into the
 * response even when rows were loaded by another mechanism (tests, MCP, etc.).
 */
export function buildMetricSurfaceDetail(
  surface: SurfaceKey,
  range: { from: string; to: string },
  rows: ReadonlyArray<MetricSurfaceDetailSnapshotRow>,
  options: MetricSurfaceDetailBuildOptions = {},
): MetricSurfaceDetailResult {
  assertMetricSurfaceDetailRange(range);
  const asOf = asOfDay(options.asOf);
  const definition = getSurface(surface);
  if (!definition) throw new RangeError(`Unknown metrics surface: ${surface}`);

  let complete = options.inputComplete !== false;
  let limitReason = options.limitReason ?? null;
  const boundedRows = rows.length > MAX_SURFACE_DETAIL_ROWS
    ? rows.slice(0, MAX_SURFACE_DETAIL_ROWS)
    : rows;
  if (boundedRows.length !== rows.length) {
    complete = false;
    limitReason ??= "row_limit";
  }

  const canonicalSources = [...new Set(definition.sources.map(canonicalSurfaceSource))];
  const allowedSources = new Set(canonicalSources);
  const preparedRows = prepareSnapshotRows(allowedSources, range, boundedRows, asOf);
  const schedules = resolvedSchedules(canonicalSources, options.schedules ?? []);
  const runs = latestCanonicalRuns(allowedSources, options.runs ?? []);
  const coverageBySource = new Map(canonicalSources.map((source) => [
    source,
    sourceCoverage(
      source,
      range,
      schedules.get(source) ?? defaultScheduleFor(source),
      preparedRows,
      runs,
      asOf,
    ),
  ] as const));
  const snapshotSetPolicies = new Map(
    Object.keys(SNAPSHOT_SET_METRICS)
      .filter((source) => allowedSources.has(source))
      .map((source) => [
        source,
        sourceSnapshotSetPolicy(
          source,
          preparedRows,
          coverageBySource.get(source),
          complete,
        ),
      ] as const),
  );
  const authoritativeSnapshotSetGroups = new Set<string>();
  for (const prepared of preparedRows) {
    const policy = snapshotSetPolicies.get(prepared.source);
    if (
      policy?.authoritativeDate
      && SNAPSHOT_SET_METRICS[prepared.source]?.has(prepared.row.metric)
      && prepared.row.date === policy.authoritativeDate
      && isUsableSnapshotValue(prepared)
    ) {
      authoritativeSnapshotSetGroups.add(groupKey(
        prepared.source,
        prepared.row.metric,
        prepared.identityKey,
      ));
    }
  }

  const grouped = new Map<string, GroupedSeries>();
  for (const prepared of preparedRows) {
    const { row, source, display, identityKey, quality } = prepared;
    if (row.value == null || !Number.isFinite(Number(row.value))) continue;
    if (quality === "missing") continue;

    const key = groupKey(source, row.metric, identityKey);
    if (
      snapshotSetPolicies.get(source)?.authoritativeDate
      && SNAPSHOT_SET_METRICS[source]?.has(row.metric)
      && !authoritativeSnapshotSetGroups.has(key)
    ) {
      continue;
    }
    let group = grouped.get(key);
    if (!group) {
      if (grouped.size >= MAX_SURFACE_DETAIL_GROUPS) {
        complete = false;
        limitReason ??= "group_limit";
        continue;
      }
      group = {
        source,
        metric: row.metric,
        dimensions: display.dimensions,
        dimensionKey: identityKey,
        displayEvidence: row,
        points: [],
        rowQualities: [],
      };
      grouped.set(key, group);
    } else if (newerEvidence(row, group.displayEvidence, source)) {
      group.dimensions = display.dimensions;
      group.displayEvidence = row;
    }
    group.points.push({ date: row.date, value: Number(row.value) });
    group.rowQualities.push(quality);
  }

  const bySource = new Map<string, MetricSurfaceDetailMetric[]>();
  for (const group of grouped.values()) {
    const aggregation = aggFor(group.source, group.metric);
    const weightMetric = weightMetricFor(group.source, group.metric);
    const weightGroup = weightMetric
      ? grouped.get(groupKey(group.source, weightMetric, group.dimensionKey))
      : undefined;
    const reduced = reduceMetricSeries(
      aggregation,
      group.points,
      weightMetric,
      weightGroup?.points ?? [],
    );
    // `reduceMetricSeries` uses zero internally for its missing sentinel. Never
    // expose that sentinel as provider evidence; a genuine observed zero has
    // quality=ok and remains in the response.
    if (reduced.quality === "missing") continue;
    const rawQuality = combinedQuality(
      reduced.quality,
      valueQualitiesForReduction(group, aggregation),
      weightQualitiesForReduction(group, weightGroup),
    );
    const coveredQuality = qualityWithCoverage(
      rawQuality,
      aggregation,
      coverageBySource.get(group.source)
        ?? sourceCoverage(
          group.source,
          range,
          defaultScheduleFor(group.source),
          preparedRows,
          runs,
          asOf,
        ),
      complete,
      group.points,
    );
    const observationQuality = qualityWithObservationAge(
      coveredQuality,
      aggregation,
      group.points,
      asOf,
    );
    const metric: MetricSurfaceDetailMetric = {
      metric: group.metric,
      value: reduced.value,
      aggregation,
      quality: isSnapshotSetGroup(group)
        ? mergeRetainedSnapshotQuality(
          observationQuality,
          snapshotSetPolicies.get(group.source)?.retainedQuality ?? null,
        )
        : observationQuality,
      dimensions: group.dimensions,
    };
    const metrics = bySource.get(group.source) ?? [];
    metrics.push(metric);
    bySource.set(group.source, metrics);
  }

  const sources = canonicalSources.map((source) => ({
      source,
      coverage: coverageBySource.get(source)
        ?? sourceCoverage(
          source,
          range,
          defaultScheduleFor(source),
          preparedRows,
          runs,
          asOf,
        ),
      metrics: (bySource.get(source) ?? []).sort((left, right) =>
        left.metric.localeCompare(right.metric)
        || JSON.stringify(left.dimensions).localeCompare(JSON.stringify(right.dimensions))),
    }));

  return {
    configured: true,
    complete,
    completeness: {
      rowsRead: options.rowsRead ?? boundedRows.length,
      groups: grouped.size,
      rowLimit: MAX_SURFACE_DETAIL_ROWS,
      groupLimit: MAX_SURFACE_DETAIL_GROUPS,
      reason: complete ? null : limitReason ?? "row_limit",
    },
    surface,
    from: range.from,
    to: range.to,
    sources,
  };
}

/** Tenant- and range-scoped read over real metric_snapshots rows. */
export async function getMetricSurfaceDetail(
  slug: string,
  query: { surface: SurfaceKey; from: string; to: string },
): Promise<MetricSurfaceDetailResult> {
  assertMetricSurfaceDetailRange(query);
  const definition = getSurface(query.surface);
  if (!definition) throw new RangeError(`Unknown metrics surface: ${query.surface}`);
  if (!hasDatabase) {
    return {
      configured: false,
      complete: false,
      completeness: {
        rowsRead: 0,
        groups: 0,
        rowLimit: MAX_SURFACE_DETAIL_ROWS,
        groupLimit: MAX_SURFACE_DETAIL_GROUPS,
        reason: "storage_unconfigured",
      },
      surface: query.surface,
      from: query.from,
      to: query.to,
      sources: [],
    };
  }

  await ensureMetricsStorage();
  const database = getDb();
  const storedSources = metricSurfaceStoredSources(definition.sources);
  const asOf = asOfDay(undefined);
  const baseConditions: SQL[] = [
    eq(metricSnapshots.slug, slug),
    inArray(metricSnapshots.source, storedSources),
    gte(metricSnapshots.metricDate, query.from),
    lte(metricSnapshots.metricDate, query.to),
  ];
  const rows: Array<MetricSurfaceDetailSnapshotRow & { id: string }> = [];
  let cursor: string | null = null;
  let inputComplete = true;
  while (rows.length <= MAX_SURFACE_DETAIL_ROWS) {
    const remainingWithProbe = MAX_SURFACE_DETAIL_ROWS + 1 - rows.length;
    const limit = Math.min(SURFACE_DETAIL_PAGE_ROWS, remainingWithProbe);
    const conditions: SQL[] = cursor
      ? [...baseConditions, gt(metricSnapshots.id, cursor)]
      : baseConditions;
    const page: Array<MetricSurfaceDetailSnapshotRow & { id: string }> = await database
      .select({
        id: metricSnapshots.id,
        date: metricSnapshots.metricDate,
        source: metricSnapshots.source,
        metric: metricSnapshots.metricName,
        value: metricSnapshots.value,
        dimsKey: metricSnapshots.dimsKey,
        dimensions: metricSnapshots.dimensions,
        collectedAt: metricSnapshots.collectedAt,
        updatedAt: metricSnapshots.updatedAt,
      })
      .from(metricSnapshots)
      .where(and(...conditions))
      .orderBy(metricSnapshots.id)
      .limit(limit);
    rows.push(...page.map((row) => ({ ...row, date: String(row.date) })));
    if (rows.length > MAX_SURFACE_DETAIL_ROWS) {
      rows.length = MAX_SURFACE_DETAIL_ROWS;
      inputComplete = false;
      break;
    }
    if (page.length < limit) break;
    cursor = page.at(-1)?.id ?? null;
    if (!cursor) break;
  }

  // Flow metrics above remain range-bound. Point-in-time metrics instead need
  // the newest provider snapshot at/before today, even when it sits before the
  // selected window (weekly PageSpeed) or on today's observation day while a
  // 1d preset ends yesterday (GHL/Metricool state). First resolve one exact
  // source+metric date, then page only those rows so dimensional catalogues do
  // not turn into an unbounded historical read.
  if (inputComplete) {
    const latestMetricNames = latestMetricNamesForSources(definition.sources);
    const latestDates = latestMetricNames.length
      ? await database
        .select({
          source: metricSnapshots.source,
          metric: metricSnapshots.metricName,
          date: max(metricSnapshots.metricDate),
        })
        .from(metricSnapshots)
        .where(and(
          eq(metricSnapshots.slug, slug),
          inArray(metricSnapshots.source, storedSources),
          inArray(metricSnapshots.metricName, latestMetricNames),
          lte(metricSnapshots.metricDate, asOf),
        ))
        .groupBy(metricSnapshots.source, metricSnapshots.metricName)
      : [];
    const snapshotSetMetricNames = [...new Set(
      Object.entries(SNAPSHOT_SET_METRICS)
        .filter(([source]) => definition.sources
          .map(canonicalSurfaceSource)
          .includes(source))
        .flatMap(([, metrics]) => [...metrics]),
    )];
    const latestDimensionDates = snapshotSetMetricNames.length
      ? await database
        .select({
          source: metricSnapshots.source,
          metric: metricSnapshots.metricName,
          dimsKey: metricSnapshots.dimsKey,
          date: max(metricSnapshots.metricDate),
        })
        .from(metricSnapshots)
        .where(and(
          eq(metricSnapshots.slug, slug),
          inArray(metricSnapshots.source, storedSources),
          inArray(metricSnapshots.metricName, snapshotSetMetricNames),
          lte(metricSnapshots.metricDate, asOf),
        ))
        .groupBy(
          metricSnapshots.source,
          metricSnapshots.metricName,
          metricSnapshots.dimsKey,
        )
      : [];
    const latestPairs = [
      ...latestDates
        .filter((pair): pair is typeof pair & { date: string } =>
          Boolean(pair.date)
          && (String(pair.date) < query.from || String(pair.date) > query.to)
          && aggFor(canonicalSurfaceSource(pair.source), pair.metric) === "latest"
          && !SNAPSHOT_SET_METRICS[canonicalSurfaceSource(pair.source)]
            ?.has(pair.metric))
        .map((pair) => ({ ...pair, dimsKey: null as string | null })),
      ...latestDimensionDates.filter(
        (pair): pair is typeof pair & { date: string; dimsKey: string } =>
          Boolean(pair.date)
          && typeof pair.dimsKey === "string"
          && (String(pair.date) < query.from || String(pair.date) > query.to)
          && (SNAPSHOT_SET_METRICS[canonicalSurfaceSource(pair.source)]
            ?.has(pair.metric) ?? false),
      ),
    ];

    for (let offset = 0; offset < latestPairs.length && inputComplete; offset += 40) {
      const pairChunk = latestPairs.slice(offset, offset + 40);
      let latestCursor: string | null = null;
      while (rows.length <= MAX_SURFACE_DETAIL_ROWS) {
        const remainingWithProbe = MAX_SURFACE_DETAIL_ROWS + 1 - rows.length;
        const limit = Math.min(SURFACE_DETAIL_PAGE_ROWS, remainingWithProbe);
        const exactPairCondition = or(...pairChunk.map((pair) => and(
          eq(metricSnapshots.source, pair.source),
          eq(metricSnapshots.metricName, pair.metric),
          eq(metricSnapshots.metricDate, pair.date),
          ...(pair.dimsKey != null
            ? [eq(metricSnapshots.dimsKey, pair.dimsKey)]
            : []),
        )));
        if (!exactPairCondition) break;
        const conditions: SQL[] = [
          eq(metricSnapshots.slug, slug),
          exactPairCondition,
          ...(latestCursor ? [gt(metricSnapshots.id, latestCursor)] : []),
        ];
        const page: Array<MetricSurfaceDetailSnapshotRow & { id: string }> = await database
          .select({
            id: metricSnapshots.id,
            date: metricSnapshots.metricDate,
            source: metricSnapshots.source,
            metric: metricSnapshots.metricName,
            value: metricSnapshots.value,
            dimsKey: metricSnapshots.dimsKey,
            dimensions: metricSnapshots.dimensions,
            collectedAt: metricSnapshots.collectedAt,
            updatedAt: metricSnapshots.updatedAt,
          })
          .from(metricSnapshots)
          .where(and(...conditions))
          .orderBy(metricSnapshots.id)
          .limit(limit);
        rows.push(...page.map((row) => ({ ...row, date: String(row.date) })));
        if (rows.length > MAX_SURFACE_DETAIL_ROWS) {
          rows.length = MAX_SURFACE_DETAIL_ROWS;
          inputComplete = false;
          break;
        }
        if (page.length < limit) break;
        latestCursor = page.at(-1)?.id ?? null;
        if (!latestCursor) break;
      }
    }
  }

  const [scheduleRows, runRows] = await Promise.all([
    database
      .select({
        source: metricCollectionSchedule.source,
        cadence: metricCollectionSchedule.cadence,
        daysOfWeek: metricCollectionSchedule.daysOfWeek,
        cronExpr: metricCollectionSchedule.cronExpr,
        enabled: metricCollectionSchedule.enabled,
        updatedAt: metricCollectionSchedule.updatedAt,
      })
      .from(metricCollectionSchedule)
      .where(and(
        eq(metricCollectionSchedule.slug, slug),
        inArray(metricCollectionSchedule.source, storedSources),
      )),
    database
      .select({
        source: metricSourceRuns.source,
        metricDate: metricSourceRuns.metricDate,
        status: metricSourceRuns.status,
        dateBasis: metricSourceRuns.dateBasis,
        rowCount: metricSourceRuns.rowCount,
        collectedAt: metricSourceRuns.collectedAt,
        updatedAt: metricSourceRuns.updatedAt,
      })
      .from(metricSourceRuns)
      .where(and(
        eq(metricSourceRuns.slug, slug),
        inArray(metricSourceRuns.source, storedSources),
        gte(metricSourceRuns.metricDate, query.from),
        lte(metricSourceRuns.metricDate, addDays(query.to, 3)),
      )),
  ]);

  return buildMetricSurfaceDetail(query.surface, query, rows, {
    schedules: scheduleRows,
    runs: runRows.map((row) => ({ ...row, metricDate: String(row.metricDate) })),
    inputComplete,
    rowsRead: rows.length,
    limitReason: inputComplete ? null : "row_limit",
    asOf,
  });
}
