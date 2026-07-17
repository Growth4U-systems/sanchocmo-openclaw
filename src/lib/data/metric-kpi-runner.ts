import {
  computeMetricKpis,
  defaultMetricKpiRange,
  findMetricKpiRunForRange,
  type ComputeMetricKpisResult,
  type MetricKpiRunLookupOptions,
  type MetricKpiRunRow,
} from "@/lib/data/metric-kpis";
import { getDashboardDefinition } from "@/lib/data/metric-dashboard";
import type { CustomMetric } from "@/lib/metrics/dashboard-schema";
import { composeMetricKpiDefinitionVersion } from "@/lib/metrics/kpi-definition-version";
import { METRIC_KPI_DEFINITION_VERSION } from "@/lib/metrics/semantic-kpis";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DEFAULT_RUNNING_TTL_MS = 30 * 60 * 1000;

function isCalendarDate(value: string): boolean {
  if (!DATE_RE.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export type MetricKpiRunnerSkipReason =
  | "already-computed"
  | "already-running"
  | "database-not-configured";

export interface MetricKpiRunnerRangeInput {
  from?: string | null;
  to?: string | null;
}

export interface RunMetricKpisInput {
  slug: string;
  range?: MetricKpiRunnerRangeInput | null;
  trigger?: string;
  force?: boolean;
  /** Optional semantic-catalogue component. The active dashboard version is
   * always packed into the persisted effective version separately. */
  definitionVersion?: number;
  runningTtlMs?: number;
  now?: Date;
}

export interface RunMetricKpisResult {
  ok: boolean;
  configured: boolean;
  skipped: boolean;
  skipReason?: MetricKpiRunnerSkipReason;
  slug: string;
  range: { from: string; to: string };
  trigger: string;
  force: boolean;
  definitionVersion: number;
  run: MetricKpiRunRow | null;
  valuesCount: number;
  error?: string;
}

export type ComputeMetricKpisFn = (
  slug: string,
  opts: {
    from: string;
    to: string;
    trigger: string;
    definitionVersion: number;
    dashboardVersion: number;
    customMetrics: CustomMetric[];
    observationAsOf: string;
  },
) => Promise<ComputeMetricKpisResult>;

export type FindMetricKpiRunFn = (
  slug: string,
  opts: MetricKpiRunLookupOptions,
) => Promise<MetricKpiRunRow | null>;

export interface RunMetricKpisDeps {
  compute?: ComputeMetricKpisFn;
  findRun?: FindMetricKpiRunFn;
  getDashboard?: typeof getDashboardDefinition;
  now?: () => Date;
}

export function resolveMetricKpiRunnerRange(
  range: MetricKpiRunnerRangeInput | null | undefined,
  now = new Date(),
): { from: string; to: string } {
  const fallback = defaultMetricKpiRange(now);
  const from = range?.from?.trim() || fallback.from;
  const to = range?.to?.trim() || fallback.to;

  if (!isCalendarDate(from)) {
    throw new Error(`Invalid metric KPI range.from: ${from}`);
  }
  if (!isCalendarDate(to)) {
    throw new Error(`Invalid metric KPI range.to: ${to}`);
  }
  if (from > to) {
    throw new Error(`Invalid metric KPI range: ${from} is after ${to}`);
  }

  return { from, to };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isRecentRunningRun(
  run: MetricKpiRunRow,
  now: Date,
  ttlMs: number,
): boolean {
  const startedAt = run.startedAt instanceof Date
    ? run.startedAt
    : new Date(run.startedAt);
  const ageMs = now.getTime() - startedAt.getTime();
  return Number.isFinite(ageMs) && ageMs >= 0 && ageMs <= ttlMs;
}

function skippedResult(args: {
  input: Required<Pick<RunMetricKpisInput, "slug" | "trigger" | "force">>;
  range: { from: string; to: string };
  definitionVersion: number;
  run: MetricKpiRunRow | null;
  reason: MetricKpiRunnerSkipReason;
  configured?: boolean;
}): RunMetricKpisResult {
  return {
    ok: args.configured === false ? false : true,
    configured: args.configured !== false,
    skipped: true,
    skipReason: args.reason,
    slug: args.input.slug,
    range: args.range,
    trigger: args.input.trigger,
    force: args.input.force,
    definitionVersion: args.definitionVersion,
    run: args.run,
    valuesCount: args.run?.valuesCount ?? 0,
  };
}

export async function runMetricKpis(
  input: RunMetricKpisInput,
  deps: RunMetricKpisDeps = {},
): Promise<RunMetricKpisResult> {
  const now = input.now ?? deps.now?.() ?? new Date();
  const slug = input.slug.trim();
  if (!slug) throw new Error("slug is required to run metric KPIs");

  const trigger = input.trigger?.trim() || "manual";
  const force = input.force === true;
  const semanticDefinitionVersion =
    input.definitionVersion ?? METRIC_KPI_DEFINITION_VERSION;
  const getDashboard = deps.getDashboard ?? getDashboardDefinition;
  const dashboard = await getDashboard(slug);
  const dashboardVersion = dashboard.version;
  const customMetrics = dashboard.definition?.customMetrics ?? [];
  const definitionVersion = composeMetricKpiDefinitionVersion(
    semanticDefinitionVersion,
    dashboardVersion,
  );
  const range = resolveMetricKpiRunnerRange(input.range, now);
  const findRun = deps.findRun ?? findMetricKpiRunForRange;
  const compute = deps.compute ?? computeMetricKpis;

  const runnerInput = { slug, trigger, force };

  if (!force) {
    const existingOk = await findRun(slug, {
      ...range,
      statuses: ["ok"],
      definitionVersion,
    });
    if (existingOk) {
      return skippedResult({
        input: runnerInput,
        range,
        definitionVersion,
        run: existingOk,
        reason: "already-computed",
      });
    }

    const running = await findRun(slug, {
      ...range,
      statuses: ["running"],
      definitionVersion,
    });
    if (
      running &&
      isRecentRunningRun(
        running,
        now,
        input.runningTtlMs ?? DEFAULT_RUNNING_TTL_MS,
      )
    ) {
      return skippedResult({
        input: runnerInput,
        range,
        definitionVersion,
        run: running,
        reason: "already-running",
      });
    }
  }

  try {
    const result = await compute(slug, {
      ...range,
      observationAsOf: now.toISOString().slice(0, 10),
      trigger,
      definitionVersion,
      dashboardVersion,
      customMetrics,
    });
    if (!result.configured) {
      return skippedResult({
        input: runnerInput,
        range,
        definitionVersion,
        run: null,
        reason: "database-not-configured",
        configured: false,
      });
    }

    return {
      ok: true,
      configured: true,
      skipped: false,
      slug,
      range,
      trigger,
      force,
      definitionVersion,
      run: result.run,
      valuesCount: result.values.length,
    };
  } catch (error) {
    let run: MetricKpiRunRow | null = null;
    try {
      run = await findRun(slug, {
        ...range,
        statuses: ["error"],
        definitionVersion,
      });
    } catch {
      run = null;
    }

    return {
      ok: false,
      configured: true,
      skipped: false,
      slug,
      range,
      trigger,
      force,
      definitionVersion,
      run,
      valuesCount: run?.valuesCount ?? 0,
      error: errorMessage(error),
    };
  }
}
