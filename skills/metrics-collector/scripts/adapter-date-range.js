export const GSC_LAG_DAYS = 3;

const ISO_DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

function isRealIsoDay(value) {
  if (typeof value !== 'string' || !ISO_DAY_RE.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function isoDateDaysAgo(days, now = new Date()) {
  const date = new Date(now);
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

/**
 * GSC data is routinely available with a three-day lag. Collect exactly one
 * lagged day so consecutive daily runs never persist overlapping aggregates.
 * Explicit ranges are preserved for controlled backfills.
 */
export function resolveAdapterDateRange(
  adapterName,
  requestedRange,
  { explicitRange = false, now = new Date() } = {},
) {
  if (adapterName !== 'gsc' || explicitRange) return requestedRange;
  const metricDate = isoDateDaysAgo(GSC_LAG_DAYS, now);
  return { from: metricDate, to: metricDate };
}

/**
 * Current-state measurements are observations made when the collector runs,
 * regardless of whether the provider-flow range is yesterday or a historical
 * repair. They must never be retrodated to the requested provider day.
 */
export function resolveCollectionObservationDate(
  _requestedRange,
  { collectedAt = new Date() } = {},
) {
  const collected = collectedAt instanceof Date ? collectedAt : new Date(collectedAt);
  const value = Number.isNaN(collected.getTime())
    ? ''
    : collected.toISOString().slice(0, 10);
  if (!isRealIsoDay(value)) {
    throw new Error(`Invalid point-in-time observation date: ${value || '?'}`);
  }
  return value;
}

/** Adapter-side guard for the internal date injected by collect.js. */
export function pointInTimeMetricDate(config, requestedRange) {
  const value = config?._pointInTimeDate ?? requestedRange?.from;
  if (!isRealIsoDay(value)) {
    throw new Error(`Invalid point-in-time observation date: ${value || '?'}`);
  }
  return value;
}

export function validateReplaceOptions({
  replace = false,
  sourceFilter = null,
  collectAll = false,
  fromDate = null,
  toDate = null,
} = {}) {
  if (!replace) return;
  if (!sourceFilter || collectAll || !fromDate || !toDate) {
    throw new Error('--replace requires --source plus explicit --from and --to dates (and cannot be combined with --all)');
  }
}

export function shouldDeleteStale(options = {}) {
  validateReplaceOptions(options);
  return Boolean(
    options.replace ||
    (options.collectAll && !options.fromDate && !options.toDate),
  );
}
