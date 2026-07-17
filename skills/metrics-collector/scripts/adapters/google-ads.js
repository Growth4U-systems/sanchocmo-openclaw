/**
 * Google Ads Adapter — Google Ads API via REST searchStream.
 *
 * Pulls account totals and campaign breakdowns for the selected date range:
 * spend, impressions, clicks, CTR, CPC, conversions, platform revenue,
 * platform ROAS, leads, impression share and lost impression share.
 *
 * Auth:
 *   - {SLUG}_GOOGLE_ADS_DEVELOPER_TOKEN / GOOGLE_ADS_DEVELOPER_TOKEN
 *   - {SLUG}_GOOGLE_ADS_CLIENT_ID / GOOGLE_ADS_CLIENT_ID
 *   - {SLUG}_GOOGLE_ADS_CLIENT_SECRET / GOOGLE_ADS_CLIENT_SECRET
 *   - {SLUG}_GOOGLE_ADS_REFRESH_TOKEN / GOOGLE_ADS_REFRESH_TOKEN
 *
 * Config/env:
 *   - google-ads.customerId / google_ads.customerId / GOOGLE_ADS_CUSTOMER_ID
 *   - google-ads.loginCustomerId / GOOGLE_ADS_LOGIN_CUSTOMER_ID / GOOGLE_ADS_MCC_ID
 */

const GOOGLE_ADS_API_VERSION = 'v24';
const BASE_URL = `https://googleads.googleapis.com/${GOOGLE_ADS_API_VERSION}`;
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;
export const GOOGLE_ADS_METRIC_NAMES = [
  'spend',
  'impressions',
  'clicks',
  'ctr',
  'cpc',
  'conversions',
  'leads',
  'revenue',
  'roas',
  'impressionShare',
  'lostImpressionShare',
];

function slugUpper(config) {
  return (config._slug || '').toUpperCase().replace(/-/g, '_');
}

function firstPresent(...values) {
  for (const value of values) {
    if (value != null && String(value).trim() !== '') return String(value).trim();
  }
  return '';
}

function envValue(env, slug, key) {
  return firstPresent(slug ? env[`${slug}_${key}`] : '', env[key]);
}

function cleanCustomerId(value, label) {
  const cleaned = String(value || '').replace(/\D/g, '');
  if (!cleaned) throw new Error(`Google Ads: missing ${label}`);
  return cleaned;
}

function metricNumber(row, key, { min, integer = false, defaultZero = true } = {}) {
  const raw = metric(row, key);
  if (raw == null || raw === '') {
    if (defaultZero) return 0;
    return null;
  }
  const value = Number(raw);
  if (
    !Number.isFinite(value) ||
    (integer && !Number.isSafeInteger(value)) ||
    (min != null && value < min)
  ) {
    throw new Error(`Google Ads: invalid metrics.${key}`);
  }
  return value;
}

function round(value, digits = 2) {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function ratioPercent(row, key) {
  const value = metricNumber(row, key, { min: 0, defaultZero: false });
  if (value == null) return null;
  if (value > 1) throw new Error(`Google Ads: invalid ratio metrics.${key}`);
  return round(value * 100, 4);
}

function metric(row, key) {
  const metrics = row.metrics || {};
  return metrics[key] ?? metrics[key.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`)];
}

async function refreshAccessToken({ clientId, clientSecret, refreshToken }) {
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
  });
  const resp = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error(`Google Ads OAuth ${resp.status}: ${text.slice(0, 200)}`);
  }
  const data = await resp.json();
  if (typeof data.access_token !== 'string' || !data.access_token.trim()) {
    throw new Error('Google Ads OAuth: missing access_token');
  }
  return data.access_token.trim();
}

async function searchStream({ customerId, developerToken, loginCustomerId, accessToken, query }) {
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
    'developer-token': developerToken,
  };
  if (loginCustomerId && loginCustomerId !== customerId) {
    headers['login-customer-id'] = loginCustomerId;
  }

  const resp = await fetch(`${BASE_URL}/customers/${customerId}/googleAds:searchStream`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ query }),
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error(`Google Ads API ${resp.status}: ${text.slice(0, 300)}`);
  }
  const payload = await resp.json();
  if (!Array.isArray(payload)) {
    throw new Error('Google Ads API: malformed searchStream payload');
  }
  const rows = [];
  for (const chunk of payload) {
    if (!chunk || typeof chunk !== 'object' || !Array.isArray(chunk.results)) {
      throw new Error('Google Ads API: malformed searchStream chunk');
    }
    rows.push(...chunk.results);
  }
  return rows;
}

function campaignDims(row) {
  const campaign = row.campaign || {};
  const id = campaign.id;
  const name = campaign.name;
  const channelType = campaign.advertisingChannelType || campaign.advertising_channel_type;
  if (id == null || id === '' || typeof name !== 'string' || !name || typeof channelType !== 'string' || !channelType) {
    throw new Error('Google Ads: malformed campaign identity');
  }
  return {
    campaign: name,
    campaignId: String(id),
    channelType,
  };
}

function metricDate(row, dateRange) {
  const date = row.segments?.date || row.segments?.date_value;
  if (date) {
    if (date < dateRange.from || date > dateRange.to) {
      throw new Error(`Google Ads: row date ${date} outside ${dateRange.from}..${dateRange.to}`);
    }
    return date;
  }
  if (dateRange.from === dateRange.to) return dateRange.from;
  throw new Error('Google Ads: multi-day response row missing segments.date');
}

function rowsByMetricDate(rows, dateRange) {
  const grouped = new Map();
  for (const row of rows) {
    const date = metricDate(row, dateRange);
    const bucket = grouped.get(date) || [];
    bucket.push(row);
    grouped.set(date, bucket);
  }
  return grouped;
}

function datesInRange(dateRange) {
  if (!DATE_RE.test(dateRange.from) || !DATE_RE.test(dateRange.to) || dateRange.from > dateRange.to) {
    throw new Error(`Google Ads: invalid date range ${dateRange.from}..${dateRange.to}`);
  }
  const start = Date.parse(`${dateRange.from}T00:00:00Z`);
  const end = Date.parse(`${dateRange.to}T00:00:00Z`);
  if (
    !Number.isFinite(start) ||
    !Number.isFinite(end) ||
    new Date(start).toISOString().slice(0, 10) !== dateRange.from ||
    new Date(end).toISOString().slice(0, 10) !== dateRange.to
  ) {
    throw new Error(`Google Ads: invalid date range ${dateRange.from}..${dateRange.to}`);
  }
  const days = Math.floor((end - start) / DAY_MS) + 1;
  if (days > 366) throw new Error('Google Ads: date range cannot exceed 366 days');
  return Array.from({ length: days }, (_, index) =>
    new Date(start + index * DAY_MS).toISOString().slice(0, 10));
}

export function googleAdsRestatementScopes(dateRange) {
  return datesInRange(dateRange).flatMap((metricDate) =>
    GOOGLE_ADS_METRIC_NAMES.map((metricName) => ({ metricDate, metricName })));
}

function addZeroDayMetrics(metrics, date) {
  for (const name of ['spend', 'impressions', 'clicks', 'conversions', 'leads', 'revenue']) {
    metrics.push({ name, value: 0, date });
  }
}

function addCoreMetrics(metrics, row, date, dimensions = null) {
  const costMicros = metricNumber(row, 'costMicros', { min: 0, integer: true });
  const spend = round(costMicros / 1_000_000, 2);
  const impressions = metricNumber(row, 'impressions', { min: 0, integer: true });
  const clicks = metricNumber(row, 'clicks', { min: 0, integer: true });
  const conversions = metricNumber(row, 'conversions');
  const revenue = round(metricNumber(row, 'conversionsValue'), 2);
  const dims = dimensions ? { dimensions } : {};

  metrics.push(
    { name: 'spend', value: spend, date, ...dims },
    { name: 'impressions', value: impressions, date, ...dims },
    { name: 'clicks', value: clicks, date, ...dims },
  );

  if (impressions > 0) {
    metrics.push({ name: 'ctr', value: round((clicks / impressions) * 100, 4), date, ...dims });
  }
  if (clicks > 0) {
    metrics.push({ name: 'cpc', value: round(spend / clicks, 2), date, ...dims });
  }
  metrics.push(
    { name: 'conversions', value: round(conversions, 2), date, ...dims },
    // Google Ads platform conversions are the closest paid lead signal. Real
    // closed-won/revenue still belongs to the revenue source.
    { name: 'leads', value: round(conversions, 2), date, ...dims },
    { name: 'revenue', value: revenue, date, ...dims },
  );
  // A valid row with spend and no revenue has a real ROAS of zero. Omitting it
  // would remove bad days from weighted range calculations and bias ROAS up.
  if (spend > 0) metrics.push({ name: 'roas', value: round(revenue / spend, 2), date, ...dims });
}

function addShareMetrics(metrics, row, date, dimensions = null) {
  const impressionShare = ratioPercent(row, 'searchImpressionShare');
  let rankLost = ratioPercent(row, 'searchRankLostImpressionShare');
  let budgetLost = ratioPercent(row, 'searchBudgetLostImpressionShare');
  const dims = dimensions ? { dimensions } : {};

  if (impressionShare != null) {
    metrics.push({ name: 'impressionShare', value: impressionShare, date, ...dims });
    // REST omits protobuf scalar fields at their default 0. Once search
    // impression share proves the row is applicable, an omitted loss component
    // is therefore a real zero rather than an unknown metric.
    rankLost ??= 0;
    budgetLost ??= 0;
  }
  // "Lost share" means rank + budget. Reporting only one available component
  // would understate the total, so publish it only when both are present.
  if (rankLost != null && budgetLost != null) {
    const lost = rankLost + budgetLost;
    if (lost > 100.01) {
      throw new Error('Google Ads: inconsistent lost impression share components');
    }
    metrics.push({ name: 'lostImpressionShare', value: round(lost, 4), date, ...dims });
  }
}

/**
 * @param {object} config
 * @param {object} env
 * @param {{ from: string, to: string }} dateRange
 */
export async function collect(config, env, dateRange) {
  const slug = slugUpper(config);
  // Validate the calendar window before OAuth or reporting requests. A malformed
  // range must never be normalized by JavaScript or sent to the provider.
  const requestedDates = datesInRange(dateRange);
  const developerToken = envValue(env, slug, 'GOOGLE_ADS_DEVELOPER_TOKEN');
  const clientId = envValue(env, slug, 'GOOGLE_ADS_CLIENT_ID');
  const clientSecret = envValue(env, slug, 'GOOGLE_ADS_CLIENT_SECRET');
  const refreshToken = envValue(env, slug, 'GOOGLE_ADS_REFRESH_TOKEN');
  if (!developerToken) throw new Error('Google Ads: missing GOOGLE_ADS_DEVELOPER_TOKEN');
  if (!clientId) throw new Error('Google Ads: missing GOOGLE_ADS_CLIENT_ID');
  if (!clientSecret) throw new Error('Google Ads: missing GOOGLE_ADS_CLIENT_SECRET');
  if (!refreshToken) throw new Error('Google Ads: missing GOOGLE_ADS_REFRESH_TOKEN');

  const customerId = cleanCustomerId(
    firstPresent(
      config.customerId,
      config.CUSTOMER_ID,
      config.customer_id,
      envValue(env, slug, 'GOOGLE_ADS_CUSTOMER_ID'),
    ),
    'customerId',
  );
  const loginCustomerIdRaw = firstPresent(
    config.loginCustomerId,
    config.LOGIN_CUSTOMER_ID,
    config.mccId,
    config.MCC_ID,
    envValue(env, slug, 'GOOGLE_ADS_LOGIN_CUSTOMER_ID'),
    envValue(env, slug, 'GOOGLE_ADS_MCC_ID'),
  );
  const loginCustomerId = loginCustomerIdRaw ? cleanCustomerId(loginCustomerIdRaw, 'loginCustomerId') : '';
  const accessToken = await refreshAccessToken({ clientId, clientSecret, refreshToken });

  const ctx = { customerId, developerToken, loginCustomerId, accessToken };
  const dateWhere = `segments.date BETWEEN '${dateRange.from}' AND '${dateRange.to}'`;
  // Account-level rows are the provider's Account report. Do not reconstruct
  // headline totals or impression share by averaging campaign rows: campaign
  // filtering and unequal eligibility can make that disagree with Google Ads.
  const accountQuery = `
    SELECT
      segments.date,
      metrics.cost_micros,
      metrics.impressions,
      metrics.clicks,
      metrics.conversions,
      metrics.conversions_value,
      metrics.search_impression_share,
      metrics.search_rank_lost_impression_share,
      metrics.search_budget_lost_impression_share
    FROM customer
    WHERE ${dateWhere}
  `;
  const campaignQuery = `
    SELECT
      campaign.id,
      campaign.name,
      campaign.status,
      campaign.advertising_channel_type,
      segments.date,
      metrics.cost_micros,
      metrics.impressions,
      metrics.clicks,
      metrics.conversions,
      metrics.conversions_value,
      metrics.search_impression_share,
      metrics.search_rank_lost_impression_share,
      metrics.search_budget_lost_impression_share
    FROM campaign
    WHERE ${dateWhere}
      AND campaign.status != 'REMOVED'
    ORDER BY metrics.cost_micros DESC
  `;

  const [accountRows, campaignRows] = await Promise.all([
    searchStream({ ...ctx, query: accountQuery }),
    searchStream({ ...ctx, query: campaignQuery }),
  ]);
  const metrics = [];
  const accountRowsByDate = rowsByMetricDate(accountRows, dateRange);
  const campaignRowsByDate = rowsByMetricDate(campaignRows, dateRange);
  for (const date of requestedDates) {
    const dailyAccountRows = accountRowsByDate.get(date) || [];
    if (dailyAccountRows.length > 1) {
      throw new Error(`Google Ads: ambiguous account rows for ${date}`);
    }
    if (!dailyAccountRows.length) {
      // searchStream legitimately has no account row on a zero-delivery day.
      // Keep additive account totals explicit so a re-pull can clear stale data;
      // CTR/CPC/ROAS are undefined without a denominator and remain omitted.
      addZeroDayMetrics(metrics, date);
    } else {
      addCoreMetrics(metrics, dailyAccountRows[0], date);
      addShareMetrics(metrics, dailyAccountRows[0], date);
    }

    for (const row of campaignRowsByDate.get(date) || []) {
      const dimensions = campaignDims(row);
      addCoreMetrics(metrics, row, date, dimensions);
      addShareMetrics(metrics, row, date, dimensions);
    }
  }

  return {
    source: 'google_ads',
    date: dateRange.from,
    metrics,
    attemptedDates: requestedDates,
    // Denominator-based and share metrics can be legitimately absent. A clean
    // account+campaign response still authoritatively restates those scopes.
    restatedScopes: googleAdsRestatementScopes(dateRange),
  };
}
