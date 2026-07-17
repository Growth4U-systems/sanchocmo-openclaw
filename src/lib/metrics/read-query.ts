const CALENDAR_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Strict UTC calendar date check; rejects normalized overflows such as 02-30. */
export function isMetricCalendarDate(value: string): boolean {
  if (!CALENDAR_DATE_RE.test(value)) return false;
  const timestamp = Date.parse(`${value}T00:00:00.000Z`);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === value;
}

export interface MetricCalendarRange {
  from?: string;
  to?: string;
}

/**
 * Return a user-facing validation error, or null for a valid inclusive range.
 * Metrics snapshots use a DATE-shaped text key, so accepting timestamps would
 * make the database's lexical comparisons subtly incorrect.
 */
export function metricCalendarRangeError(
  range: MetricCalendarRange,
  options: { requireBoth?: boolean } = {},
): string | null {
  const { from, to } = range;
  if (options.requireBoth && (!from || !to)) {
    return "from and to are required calendar dates (YYYY-MM-DD)";
  }
  if (from != null && !isMetricCalendarDate(from)) {
    return "from must be a valid calendar date (YYYY-MM-DD)";
  }
  if (to != null && !isMetricCalendarDate(to)) {
    return "to must be a valid calendar date (YYYY-MM-DD)";
  }
  if (from && to && from > to) {
    return "from must be on or before to";
  }
  return null;
}

export function assertMetricCalendarRange(
  range: MetricCalendarRange,
  options: { requireBoth?: boolean } = {},
): void {
  const error = metricCalendarRangeError(range, options);
  if (error) throw new RangeError(error);
}
