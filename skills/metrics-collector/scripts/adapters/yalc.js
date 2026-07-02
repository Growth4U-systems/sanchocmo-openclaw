/**
 * YALC / Partnerships Adapter.
 *
 * Pulls the normalized Sancho Partnerships report and persists the aggregate
 * program snapshot into `metric_snapshots` as `source=yalc`. This closes the
 * Metrics surface while deeper lead/message drilldown continues to read YALC.
 */

function metricDateFromReport(report) {
  const raw = typeof report?.to === 'string' ? report.to : '';
  return /^\d{4}-\d{2}-\d{2}/.test(raw) ? raw.slice(0, 10) : new Date().toISOString().slice(0, 10);
}

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

async function fetchReport(config) {
  const base = (config._mcBaseUrl || process.env.MC_BASE_URL || 'http://localhost:3000').replace(/\/+$/, '');
  const slug = config._slug;
  const token = config._adminToken || process.env.MC_ADMIN_TOKEN || '';
  if (!slug) throw new Error('YALC: missing slug');
  if (!token) throw new Error('YALC: missing admin token for Sancho report proxy');

  const url = `${base}/api/partnerships/report?slug=${encodeURIComponent(slug)}&period=30`;
  const resp = await fetch(url, { headers: { Accept: 'application/json', 'x-admin-token': token } });
  const payload = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    const error = payload?.error || `HTTP ${resp.status}`;
    throw new Error(`YALC report: ${error}`);
  }
  return payload;
}

export async function collect(config) {
  const report = await fetchReport(config);
  const date = metricDateFromReport(report);
  const totals = report.totals || {};
  const targetCac = finite(report.targetCacEur, 0);
  const conversions = finite(totals.conversions);
  const value = conversions * targetCac;

  const metrics = [
    { name: 'postsLive', value: finite(totals.postsLive), date },
    { name: 'clicks', value: finite(totals.clicks), date },
    { name: 'signups', value: finite(totals.signups), date },
    { name: 'kyc', value: finite(totals.kyc), date },
    { name: 'firstTx', value: conversions, date },
    { name: 'invested', value: finite(totals.investedEur), date },
    { name: 'totalCost', value: finite(totals.totalCostEur), date },
    { name: 'value', value, date },
  ];

  if (Number.isFinite(totals.cpaRealEur)) metrics.push({ name: 'cpaReal', value: finite(totals.cpaRealEur), date });
  if (Number.isFinite(totals.roi)) metrics.push({ name: 'roi', value: finite(totals.roi), date });

  for (const creator of Array.isArray(report.creators) ? report.creators : []) {
    const dimensions = {
      creator: String(creator.handle || creator.leadId || 'unknown'),
      leadId: String(creator.leadId || ''),
      network: String(creator.network || ''),
    };
    metrics.push(
      { name: 'clicks', value: finite(creator.clicks), date, dimensions },
      { name: 'signups', value: finite(creator.signups), date, dimensions },
      { name: 'kyc', value: finite(creator.kyc), date, dimensions },
      { name: 'firstTx', value: finite(creator.conversions), date, dimensions },
      { name: 'invested', value: finite(creator.feeEur), date, dimensions },
      { name: 'value', value: finite(creator.conversions) * targetCac, date, dimensions },
    );
  }

  return { source: 'yalc', date, metrics };
}
