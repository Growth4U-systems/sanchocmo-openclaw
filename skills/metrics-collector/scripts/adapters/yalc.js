/**
 * YALC / Partnerships Adapter.
 *
 * Pulls the normalized Sancho Partnerships report and persists the aggregate
 * program snapshot into `metric_snapshots` as `source=yalc`. This closes the
 * Metrics surface while deeper lead/message drilldown continues to read YALC.
 *
 * `value` is deliberately kept for storage compatibility, but it is a derived
 * break-even reference (`conversions × target CAC`), not observed revenue.
 */

function metricDateFromReport(report) {
  const raw = typeof report?.to === 'string' ? report.to : '';
  const date = raw.slice(0, 10);
  const parsed = Date.parse(raw);
  const day = Date.parse(`${date}T00:00:00Z`);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    !Number.isFinite(parsed) ||
    !Number.isFinite(day) ||
    new Date(day).toISOString().slice(0, 10) !== date
  ) {
    throw new Error('YALC report: missing valid to date');
  }
  return date;
}

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function requireFiniteField(object, field, area) {
  const value = object?.[field];
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`YALC report: ${area}.${field} must be a finite number`);
  }
  return value;
}

function requireNullableFiniteField(object, field, area) {
  const value = object?.[field];
  if (value !== null && (typeof value !== 'number' || !Number.isFinite(value))) {
    throw new Error(`YALC report: ${area}.${field} must be a finite number or null`);
  }
  return value;
}

function validateReport(report) {
  if (!report || typeof report !== 'object' || Array.isArray(report)) {
    throw new Error('YALC report: response must be an object');
  }
  const date = metricDateFromReport(report);
  const targetCac = requireFiniteField(report, 'targetCacEur', 'response');
  if (!report.totals || typeof report.totals !== 'object' || Array.isArray(report.totals)) {
    throw new Error('YALC report: totals must be an object');
  }
  const totalFields = [
    'postsLive',
    'clicks',
    'signups',
    'kyc',
    'conversions',
  ];
  for (const field of totalFields) requireFiniteField(report.totals, field, 'totals');
  requireNullableFiniteField(report.totals, 'investedEur', 'totals');
  requireNullableFiniteField(report.totals, 'totalCostEur', 'totals');
  requireNullableFiniteField(report.totals, 'cpaRealEur', 'totals');
  requireNullableFiniteField(report.totals, 'roi', 'totals');

  const tracking = report.tracking;
  if (!tracking || typeof tracking !== 'object' || Array.isArray(tracking)) {
    throw new Error('YALC report: tracking must be an object');
  }
  if (!['real', 'demo', 'unavailable'].includes(tracking.status)) {
    throw new Error('YALC report: tracking.status must be real, demo, or unavailable');
  }
  if (!Array.isArray(tracking.sources) || tracking.sources.some((source) => !['impact', 'seed'].includes(source))) {
    throw new Error('YALC report: tracking.sources contains an unsupported source');
  }
  if (!Number.isSafeInteger(tracking.recordCount) || tracking.recordCount < 0) {
    throw new Error('YALC report: tracking.recordCount must be a non-negative integer');
  }

  if (!Array.isArray(report.creators)) {
    throw new Error('YALC report: creators must be an array');
  }
  for (const [index, creator] of report.creators.entries()) {
    if (!creator || typeof creator !== 'object' || Array.isArray(creator)) {
      throw new Error(`YALC report: creators[${index}] must be an object`);
    }
    for (const field of ['clicks', 'signups', 'kyc', 'conversions']) {
      requireFiniteField(creator, field, `creators[${index}]`);
    }
    requireNullableFiniteField(creator, 'feeEur', `creators[${index}]`);
  }

  if (tracking.recordCount !== report.creators.length) {
    throw new Error('YALC report: tracking.recordCount must match creators length');
  }
  if (tracking.status === 'real' && !tracking.sources.includes('impact')) {
    throw new Error('YALC report: real tracking must identify an impact source');
  }
  if (tracking.status === 'demo' && !tracking.sources.includes('seed')) {
    throw new Error('YALC report: demo tracking must identify a seed source');
  }
  if (tracking.status === 'unavailable' && (tracking.recordCount !== 0 || tracking.sources.length !== 0)) {
    throw new Error('YALC report: unavailable tracking cannot contain records or sources');
  }

  return { date, targetCac, totals: report.totals, creators: report.creators, tracking };
}

function parseIsoDay(value, label) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`YALC: ${label} must be YYYY-MM-DD`);
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new Error(`YALC: ${label} must be a real calendar date`);
  }
  return parsed;
}

function exactDays(dateRange) {
  const from = parseIsoDay(dateRange?.from, 'dateRange.from');
  const to = parseIsoDay(dateRange?.to, 'dateRange.to');
  if (from > to) throw new Error('YALC: dateRange.from must not be after dateRange.to');

  const days = [];
  for (let cursor = from; cursor <= to; cursor = new Date(cursor.getTime() + 86_400_000)) {
    days.push(cursor.toISOString().slice(0, 10));
  }
  return days;
}

async function fetchReport(config, day) {
  const base = (config._mcBaseUrl || process.env.MC_BASE_URL || 'http://localhost:3000').replace(/\/+$/, '');
  const slug = config._slug;
  const token = config._adminToken || process.env.MC_ADMIN_TOKEN || '';
  if (!slug) throw new Error('YALC: missing slug');
  if (!token) throw new Error('YALC: missing admin token for Sancho report proxy');

  const url = `${base}/api/partnerships/report?slug=${encodeURIComponent(slug)}&from=${day}&to=${day}`;
  const resp = await fetch(url, { headers: { Accept: 'application/json', 'x-admin-token': token } });
  const payload = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    const error = payload?.error || `HTTP ${resp.status}`;
    throw new Error(`YALC report: ${error}`);
  }
  return payload;
}

function metricsFromReport(report, expectedDay) {
  const { date, targetCac, totals, creators, tracking } = validateReport(report);
  if (date !== expectedDay || String(report.from ?? '').slice(0, 10) !== expectedDay) {
    throw new Error(`YALC report: response window does not match requested day ${expectedDay}`);
  }
  if (tracking.status === 'unavailable') {
    const observedTotal = [
      totals.postsLive,
      totals.clicks,
      totals.signups,
      totals.kyc,
      totals.conversions,
      totals.investedEur,
      totals.totalCostEur,
    ].reduce((sum, value) => sum + (value == null ? 0 : Math.abs(value)), 0);
    if (observedTotal !== 0) {
      throw new Error('YALC report: unavailable tracking cannot expose observed totals');
    }
    return { date, metrics: [], trackingStatus: tracking.status, financialsPartial: false };
  }
  const conversions = finite(totals.conversions);
  // Derived break-even reference only. Do not interpret or label as revenue.
  const value = conversions * targetCac;

  const metrics = [
    { name: 'postsLiveDaily', value: finite(totals.postsLive), date },
    { name: 'clicksDaily', value: finite(totals.clicks), date },
    { name: 'signupsDaily', value: finite(totals.signups), date },
    { name: 'kycDaily', value: finite(totals.kyc), date },
    { name: 'firstTxDaily', value: conversions, date },
    { name: 'invested', value: totals.investedEur, date },
    { name: 'valueDaily', value, date },
  ];

  for (const creator of creators) {
    const dimensions = {
      creator: String(creator.handle || creator.leadId || 'unknown'),
      leadId: String(creator.leadId || ''),
      network: String(creator.network || ''),
    };
    metrics.push(
      { name: 'clicksDaily', value: finite(creator.clicks), date, dimensions },
      { name: 'signupsDaily', value: finite(creator.signups), date, dimensions },
      { name: 'kycDaily', value: finite(creator.kyc), date, dimensions },
      { name: 'firstTxDaily', value: finite(creator.conversions), date, dimensions },
      { name: 'invested', value: creator.feeEur, date, dimensions },
      // Same derived CAC-target reference as the account rollup; not revenue.
      { name: 'valueDaily', value: finite(creator.conversions) * targetCac, date, dimensions },
    );
  }

  return {
    date,
    metrics,
    trackingStatus: tracking.status,
    financialsPartial: totals.investedEur === null
      || totals.totalCostEur === null
      || creators.some((creator) => creator.feeEur === null),
  };
}

export async function collect(config, _env, dateRange) {
  const days = exactDays(dateRange);
  const batches = [];
  // Keep backfills gentle on both the Sancho proxy and YALC. A default run is
  // one request; explicit ranges remain deterministic without a request burst.
  for (const day of days) {
    const report = await fetchReport(config, day);
    batches.push(metricsFromReport(report, day));
  }
  const statuses = new Set(batches.map((batch) => batch.trackingStatus));
  const financialsPartial = batches.some((batch) => batch.financialsPartial);
  if (statuses.has('unavailable') && statuses.size > 1) {
    throw new Error('YALC report: tracking availability changed inside the requested range');
  }
  const metrics = batches.flatMap((batch) => batch.metrics);
  const restatedDates = batches
    .filter((batch) => batch.trackingStatus === 'unavailable')
    .map((batch) => batch.date);
  return {
    source: 'yalc',
    date: days.at(-1),
    status: restatedDates.length ? 'connected_no_data' : 'ok',
    metrics,
    ...(restatedDates.length ? { restatedDates } : {}),
    ...(statuses.has('demo') ? { provenance: 'seed' } : {}),
    ...(statuses.has('unavailable') || financialsPartial
      ? { quality: 'partial' }
      : statuses.has('demo')
        ? { quality: 'demo' }
        : {}),
    ...(statuses.size === 1 && statuses.has('real') ? { provenance: 'impact' } : {}),
  };
}
