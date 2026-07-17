const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_GSC_ROWS = 25_000;
export const GSC_METRIC_NAMES = ['clicks', 'impressions', 'ctr', 'position'];

export function gscRangeDayCount(dateRange) {
  if (!DATE_RE.test(dateRange?.from || '') || !DATE_RE.test(dateRange?.to || '')) {
    throw new Error(`GSC: invalid date range ${dateRange?.from || '?'}..${dateRange?.to || '?'}`);
  }
  const from = Date.parse(`${dateRange.from}T00:00:00Z`);
  const to = Date.parse(`${dateRange.to}T00:00:00Z`);
  if (
    !Number.isFinite(from) ||
    !Number.isFinite(to) ||
    new Date(from).toISOString().slice(0, 10) !== dateRange.from ||
    new Date(to).toISOString().slice(0, 10) !== dateRange.to ||
    to < from
  ) {
    throw new Error(`GSC: invalid date range ${dateRange.from}..${dateRange.to}`);
  }
  return Math.floor((to - from) / 86_400_000) + 1;
}

export function gscDatesInRange(dateRange) {
  const start = Date.parse(`${dateRange.from}T00:00:00Z`);
  return Array.from({ length: gscRangeDayCount(dateRange) }, (_, index) =>
    new Date(start + index * 86_400_000).toISOString().slice(0, 10));
}

export function gscRestatementScopes(dateRange) {
  return gscDatesInRange(dateRange).flatMap((metricDate) =>
    GSC_METRIC_NAMES.map((metricName) => ({ metricDate, metricName })));
}

export function buildGscQueryBody(dateRange, breakdown = null) {
  const dimensions = ['date', ...(breakdown ? [breakdown] : [])];
  const rowsPerDay = breakdown ? 20 : 1;
  return {
    startDate: dateRange.from,
    endDate: dateRange.to,
    dimensions,
    rowLimit: Math.min(MAX_GSC_ROWS, gscRangeDayCount(dateRange) * rowsPerDay),
  };
}

function metricDate(row, dateRange) {
  const date = row?.keys?.[0];
  if (!DATE_RE.test(date || '') || date < dateRange.from || date > dateRange.to) {
    throw new Error(`GSC: response row missing a valid date dimension for ${dateRange.from}..${dateRange.to}`);
  }
  return date;
}

function numericMetric(row, name, { ratio = false } = {}) {
  const raw = row?.[name];
  const value = Number(raw);
  if (raw == null || raw === '' || !Number.isFinite(value) || value < 0) {
    throw new Error(`GSC: response row has invalid ${name}`);
  }
  if (ratio && value > 1) {
    throw new Error(`GSC: response row has invalid ${name} ratio`);
  }
  return value;
}

function roundedPercentage(value) {
  return Math.round(value * 10_000) / 100;
}

function rounded(value) {
  return Math.round(value * 100) / 100;
}

/** Map date-dimensioned GSC rows to one metric snapshot per actual day. */
export function gscRowsToMetrics(
  rows,
  dateRange,
  breakdown = null,
  { fillMissingDates = false } = {},
) {
  const metrics = [];
  const observedDates = new Set();
  for (const row of rows || []) {
    const date = metricDate(row, dateRange);
    observedDates.add(date);
    const dimensionValue = breakdown ? row.keys?.[1] : null;
    if (breakdown && (typeof dimensionValue !== 'string' || !dimensionValue)) {
      throw new Error(`GSC: response row missing ${breakdown} dimension`);
    }
    const dimensions = breakdown ? { [breakdown]: dimensionValue } : undefined;
    const clicks = numericMetric(row, 'clicks');
    const impressions = numericMetric(row, 'impressions');
    const ctr = numericMetric(row, 'ctr', { ratio: true });
    const position = numericMetric(row, 'position');
    metrics.push(
      { name: 'clicks', value: clicks, date, ...(dimensions ? { dimensions } : {}) },
      { name: 'impressions', value: impressions, date, ...(dimensions ? { dimensions } : {}) },
      { name: 'ctr', value: roundedPercentage(ctr), date, ...(dimensions ? { dimensions } : {}) },
      { name: 'position', value: rounded(position), date, ...(dimensions ? { dimensions } : {}) },
    );
  }

  // Search Console omits a date entirely when it has no impressions. Headline
  // totals still need explicit zero rows so a valid empty day replaces stale
  // data and is distinguishable from a failed collection. Position and CTR are
  // intentionally omitted because they are undefined with zero impressions.
  if (fillMissingDates && !breakdown) {
    for (const date of gscDatesInRange(dateRange)) {
      if (observedDates.has(date)) continue;
      metrics.push(
        { name: 'clicks', value: 0, date },
        { name: 'impressions', value: 0, date },
      );
    }
  }
  return metrics;
}
