#!/usr/bin/env tsx
/**
 * Cron/manual runner for the Metrics v2 KPI read model.
 *
 * Examples:
 *   npm run compute:metric-kpis -- --slug growth4u --trigger manual
 *   npm run compute:metric-kpis -- --all --trigger cron --json
 *   npm run compute:metric-kpis -- --slug growth4u --dashboard-ranges --force --trigger san-366
 */
import { loadClients } from "@/lib/data/clients";
import {
  runMetricKpis,
  type RunMetricKpisInput,
  type RunMetricKpisResult,
} from "@/lib/data/metric-kpi-runner";

export interface MetricKpiCliArgs {
  slugs: string[];
  all: boolean;
  from?: string;
  to?: string;
  asOf?: string;
  dashboardRanges: boolean;
  trigger: string;
  force: boolean;
  json: boolean;
  definitionVersion?: number;
}

export interface MetricKpiCliRunResult {
  results: RunMetricKpisResult[];
  exitCode: number;
}

export interface MetricKpiCliDeps {
  run?: typeof runMetricKpis;
  loadSlugs?: () => string[];
  stdout?: (line: string) => void;
  stderr?: (line: string) => void;
}

function valueAfter(argv: string[], index: number, flag: string): string {
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`${flag} requires a value`);
  }
  return value;
}

function splitSlugs(raw: string): string[] {
  return raw
    .split(",")
    .map((slug) => slug.trim())
    .filter(Boolean);
}

export function parseMetricKpiCliArgs(
  argv = process.argv.slice(2),
): MetricKpiCliArgs {
  const args: MetricKpiCliArgs = {
    slugs: [],
    all: false,
    dashboardRanges: false,
    trigger: "manual",
    force: false,
    json: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    switch (flag) {
      case "--slug":
      case "-s":
        args.slugs.push(...splitSlugs(valueAfter(argv, i, flag)));
        i++;
        break;
      case "--all":
        args.all = true;
        break;
      case "--from":
        args.from = valueAfter(argv, i, flag);
        i++;
        break;
      case "--to":
        args.to = valueAfter(argv, i, flag);
        i++;
        break;
      case "--as-of":
        args.asOf = valueAfter(argv, i, flag);
        i++;
        break;
      case "--dashboard-ranges":
        args.dashboardRanges = true;
        break;
      case "--trigger":
        args.trigger = valueAfter(argv, i, flag);
        i++;
        break;
      case "--definition-version": {
        const raw = valueAfter(argv, i, flag);
        const n = Number(raw);
        if (!Number.isFinite(n)) {
          throw new Error("--definition-version must be a number");
        }
        args.definitionVersion = n;
        i++;
        break;
      }
      case "--force":
        args.force = true;
        break;
      case "--json":
        args.json = true;
        break;
      default:
        throw new Error(`Unknown flag: ${flag}`);
    }
  }

  if (args.all && args.slugs.length) {
    throw new Error("Use either --all or --slug, not both");
  }
  if (!args.all && args.slugs.length === 0) {
    throw new Error("Provide --slug <slug> or --all");
  }
  if (args.dashboardRanges && (args.from || args.to)) {
    throw new Error("Use either --dashboard-ranges or --from/--to, not both");
  }
  if (args.asOf && !/^\d{4}-\d{2}-\d{2}$/.test(args.asOf)) {
    throw new Error("--as-of must be YYYY-MM-DD");
  }
  return args;
}

function defaultLoadSlugs(): string[] {
  return loadClients().map((client) => client.slug).filter(Boolean);
}

function formatResult(result: RunMetricKpisResult): string {
  const status = result.ok
    ? result.skipped
      ? `skipped:${result.skipReason}`
      : "ok"
    : "error";
  const runId = result.run?.id ?? "-";
  const error = result.error ? ` error="${result.error}"` : "";
  return [
    `[metric-kpis] ${result.slug}`,
    `${result.range.from}..${result.range.to}`,
    status,
    `run=${runId}`,
    `values=${result.valuesCount}`,
    error,
  ].join(" ");
}

const DAY_MS = 86_400_000;
const DASHBOARD_RANGE_DAYS = [
  ["1d", 1],
  ["7d", 7],
  ["30d", 30],
  ["90d", 90],
] as const;

function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function utcDay(value: string | undefined): Date {
  if (value) return new Date(`${value}T00:00:00.000Z`);
  const now = new Date();
  return new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
  ));
}

export function dashboardMetricKpiRanges(asOf?: string): Array<{ from: string; to: string }> {
  const end = utcDay(asOf);
  const to = isoDay(end);
  return DASHBOARD_RANGE_DAYS.map(([, days]) => ({
    from: isoDay(new Date(end.getTime() - (days - 1) * DAY_MS)),
    to,
  }));
}

export async function runMetricKpiCli(
  args: MetricKpiCliArgs,
  deps: MetricKpiCliDeps = {},
): Promise<MetricKpiCliRunResult> {
  const run = deps.run ?? runMetricKpis;
  const stdout = deps.stdout ?? ((line: string) => console.log(line));
  const slugs = args.all ? (deps.loadSlugs ?? defaultLoadSlugs)() : args.slugs;
  if (slugs.length === 0) {
    throw new Error("No client slugs found");
  }

  const results: RunMetricKpisResult[] = [];
  const ranges = args.dashboardRanges
    ? dashboardMetricKpiRanges(args.asOf)
    : [{ from: args.from, to: args.to }];
  for (const slug of slugs) {
    for (const range of ranges) {
      const input: RunMetricKpisInput = {
        slug,
        range,
        trigger: args.trigger,
        force: args.force,
        definitionVersion: args.definitionVersion,
      };
      const result = await run(input);
      results.push(result);
      if (!args.json) stdout(formatResult(result));
    }
  }

  if (args.json) stdout(JSON.stringify({ ok: results.every((r) => r.ok), results }, null, 2));

  return {
    results,
    exitCode: results.every((result) => result.ok) ? 0 : 1,
  };
}

async function main(): Promise<void> {
  const args = parseMetricKpiCliArgs();
  const { exitCode } = await runMetricKpiCli(args);
  process.exit(exitCode);
}

if (require.main === module) {
  main().catch((err) => {
    console.error(`metric-kpis: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  });
}
