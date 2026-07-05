/**
 * Per-source collection cadence (SAN-300). The daily "Morning Metrics" cron asks
 * `isDueToday()` for each connected source and collects only those due today.
 *
 * Defaults live here (overridable per client via the metric_collection_schedule
 * table): most sources are daily; trust_score & pagespeed default to weekly
 * (Mondays) since they're slow-moving / expensive. `daysOfWeek` uses JS
 * getDay() — 0=Sun … 6=Sat.
 *
 * NOTE on timezone: isDueToday uses the passed Date's LOCAL day. The collector
 * and MC run in the same container (UTC by default), so "due today" and the
 * snapshot's date agree. If a container ever sets TZ, the weekday is that TZ's —
 * pin a fixed TZ here if the cron's locale must drive the calendar day.
 */

export type Cadence = "daily" | "weekly" | "twice_weekly" | "custom";
export const CADENCES: Cadence[] = ["daily", "weekly", "twice_weekly", "custom"];

export interface CollectionSchedule {
  source: string;
  cadence: Cadence;
  daysOfWeek: number[];
  cronExpr: string | null;
  enabled: boolean;
}

const MONDAY = 1;

/** Source → default cadence when the client hasn't set an override. */
const DEFAULTS: Record<string, { cadence: Cadence; daysOfWeek: number[] }> = {
  trust_score: { cadence: "weekly", daysOfWeek: [MONDAY] },
  pagespeed: { cadence: "weekly", daysOfWeek: [MONDAY] },
};

export function defaultScheduleFor(source: string): CollectionSchedule {
  const preset = DEFAULTS[source];
  return {
    source,
    cadence: preset?.cadence ?? "daily",
    daysOfWeek: preset?.daysOfWeek ?? [],
    cronExpr: null,
    enabled: true,
  };
}

export function normalizeCadence(value: unknown): Cadence {
  return (CADENCES as string[]).includes(value as string) ? (value as Cadence) : "daily";
}

/**
 * Sources with a known instrumentation problem — surfaced as a data-health flag
 * (`getMetricsHealth` → `DataHealthBadge`), never silently shown as a clean number.
 * Keep this list small and evidence-based; ordinary missing days should be `partial`
 * or `stale`, not `dirty`.
 */
export const KNOWN_DIRTY: Record<string, string> = {};

/** Per-source data-health flag: known-dirty (with reason) or clean. Pure, no DB. */
export function getKnownDirty(source: string): { knownDirty: boolean; dirtyReason?: string } {
  const reason = KNOWN_DIRTY[source];
  return reason ? { knownDirty: true, dirtyReason: reason } : { knownDirty: false };
}

/** True when `source` should be collected on `date` per its schedule. */
export function isDueToday(
  schedule: Pick<CollectionSchedule, "cadence" | "daysOfWeek" | "cronExpr" | "enabled">,
  date: Date,
): boolean {
  if (!schedule.enabled) return false;
  switch (schedule.cadence) {
    case "daily":
      return true;
    case "weekly":
    case "twice_weekly":
      return (schedule.daysOfWeek ?? []).includes(date.getDay());
    case "custom":
      return schedule.cronExpr ? cronDueOnDate(schedule.cronExpr, date) : false;
    default:
      return false;
  }
}

/**
 * Date-level cron match for the "custom" cadence. The morning cron only decides
 * due-or-not for a DATE, so we evaluate the day-of-month, month and day-of-week
 * fields (minute/hour are ignored). Honours cron's quirk: when BOTH dom and dow
 * are restricted, it fires if EITHER matches.
 */
export function cronDueOnDate(expr: string, date: Date): boolean {
  const parts = expr.trim().split(/\s+/);
  if (parts.length < 5) return false;
  const [, , domF, monthF, dowF] = parts;
  if (!matchField(monthF, date.getMonth() + 1, 1, 12)) return false;
  const domRestricted = domF !== "*";
  const dowRestricted = dowF !== "*";
  const domOk = matchField(domF, date.getDate(), 1, 31);
  const dowOk = matchField(normalizeDow(dowF), date.getDay(), 0, 6);
  if (domRestricted && dowRestricted) return domOk || dowOk;
  if (domRestricted) return domOk;
  if (dowRestricted) return dowOk;
  return true;
}

/** Cron allows 7 for Sunday; JS getDay() uses 0. */
function normalizeDow(field: string): string {
  return field.replace(/\b7\b/g, "0");
}

function matchField(field: string, value: number, min: number, max: number): boolean {
  return field.split(",").some((part) => matchPart(part.trim(), value, min, max));
}

function matchPart(part: string, value: number, min: number, max: number): boolean {
  let range = part;
  let step = 1;
  const slash = part.indexOf("/");
  if (slash >= 0) {
    range = part.slice(0, slash) || "*";
    step = Number(part.slice(slash + 1)) || 1;
  }
  let lo = min;
  let hi = max;
  if (range !== "*") {
    const dash = range.indexOf("-");
    if (dash >= 0) {
      lo = Number(range.slice(0, dash));
      hi = Number(range.slice(dash + 1));
    } else {
      lo = hi = Number(range);
    }
    if (!Number.isFinite(lo) || !Number.isFinite(hi)) return false;
  }
  if (value < lo || value > hi) return false;
  return (value - lo) % step === 0;
}
