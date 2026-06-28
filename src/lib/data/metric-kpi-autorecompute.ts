import {
  runMetricKpis,
  type RunMetricKpisResult,
} from "@/lib/data/metric-kpi-runner";
import type { IngestResult } from "@/lib/data/metrics-snapshots";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;

export type MetricKpiAutoRecomputeSkipReason =
  | "disabled"
  | "no-rows"
  | "ingest-failed"
  | "storage-not-configured";

export interface MetricKpiAutoRecomputeRange {
  from: string;
  to: string;
  label: string;
}

export interface MetricKpiAutoRecomputeInput {
  slug: string;
  ingest: IngestResult;
  date: string;
  metricDates?: string[];
  enabled?: boolean;
  trigger?: string;
  now?: Date;
  force?: boolean;
}

export interface MetricKpiAutoRecomputeResult {
  attempted: boolean;
  ok: boolean;
  skipped: boolean;
  skipReason?: MetricKpiAutoRecomputeSkipReason;
  trigger: string;
  ranges: MetricKpiAutoRecomputeRange[];
  results: RunMetricKpisResult[];
  errors: string[];
}

export interface MetricKpiAutoRecomputeDeps {
  run?: typeof runMetricKpis;
}

const DASHBOARD_RANGE_DAYS = [
  ["1d", 1],
  ["7d", 7],
  ["30d", 30],
  ["90d", 90],
] as const;

function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function utcDay(value: string | Date): Date {
  if (typeof value === "string") return new Date(`${value}T00:00:00.000Z`);
  return new Date(Date.UTC(
    value.getUTCFullYear(),
    value.getUTCMonth(),
    value.getUTCDate(),
  ));
}

function rangeEndingAt(label: string, days: number, endDate: string): MetricKpiAutoRecomputeRange {
  const end = utcDay(endDate).getTime();
  const start = end - (days - 1) * DAY_MS;
  return {
    from: isoDay(new Date(start)),
    to: endDate,
    label,
  };
}

function validDates(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value && DATE_RE.test(value))))].sort();
}

export function buildMetricKpiAutoRecomputeRanges(args: {
  date: string;
  metricDates?: string[];
  now?: Date;
}): MetricKpiAutoRecomputeRange[] {
  const today = isoDay(utcDay(args.now ?? new Date()));
  const ranges = DASHBOARD_RANGE_DAYS.map(([label, days]) =>
    rangeEndingAt(label, days, today),
  );
  const dates = validDates([args.date, ...(args.metricDates ?? [])]);
  if (dates.length) {
    ranges.push({
      from: dates[0],
      to: dates.at(-1) ?? dates[0],
      label: "ingest-window",
    });
  }

  const deduped = new Map<string, MetricKpiAutoRecomputeRange>();
  for (const range of ranges) {
    if (!DATE_RE.test(range.from) || !DATE_RE.test(range.to) || range.from > range.to) continue;
    const key = `${range.from}..${range.to}`;
    const existing = deduped.get(key);
    deduped.set(key, existing ? { ...existing, label: `${existing.label}+${range.label}` } : range);
  }
  return [...deduped.values()];
}

function skipResult(args: {
  reason: MetricKpiAutoRecomputeSkipReason;
  trigger: string;
  ranges?: MetricKpiAutoRecomputeRange[];
}): MetricKpiAutoRecomputeResult {
  return {
    attempted: false,
    ok: args.reason === "disabled" || args.reason === "no-rows",
    skipped: true,
    skipReason: args.reason,
    trigger: args.trigger,
    ranges: args.ranges ?? [],
    results: [],
    errors: [],
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function recomputeMetricKpisAfterIngest(
  input: MetricKpiAutoRecomputeInput,
  deps: MetricKpiAutoRecomputeDeps = {},
): Promise<MetricKpiAutoRecomputeResult> {
  const trigger = input.trigger?.trim() || "ingest:auto";
  const ranges = buildMetricKpiAutoRecomputeRanges({
    date: input.date,
    metricDates: input.metricDates,
    now: input.now,
  });

  if (input.enabled === false) return skipResult({ reason: "disabled", trigger, ranges });
  if (!input.ingest.storage.configured) {
    return skipResult({ reason: "storage-not-configured", trigger, ranges });
  }
  if (!input.ingest.ok) return skipResult({ reason: "ingest-failed", trigger, ranges });
  if (input.ingest.rows <= 0) return skipResult({ reason: "no-rows", trigger, ranges });

  const run = deps.run ?? runMetricKpis;
  const results: RunMetricKpisResult[] = [];
  const errors: string[] = [];

  for (const range of ranges) {
    try {
      const result = await run({
        slug: input.slug,
        range,
        trigger,
        force: input.force !== false,
      });
      results.push(result);
      if (!result.ok) errors.push(result.error || `${range.from}..${range.to} failed`);
    } catch (error) {
      errors.push(errorMessage(error));
    }
  }

  return {
    attempted: true,
    ok: errors.length === 0 && results.every((result) => result.ok),
    skipped: false,
    trigger,
    ranges,
    results,
    errors,
  };
}
