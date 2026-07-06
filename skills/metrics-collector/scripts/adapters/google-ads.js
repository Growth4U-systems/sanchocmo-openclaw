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

function num(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function round(value, digits = 2) {
  const factor = 10 ** digits;
  return Math.round((num(value) + Number.EPSILON) * factor) / factor;
}

function percent(value) {
  const n = num(value, NaN);
  if (!Number.isFinite(n)) return null;
  // Google Ads REST returns ratios for percentage metrics. Keep already-percent
  // values safe for fixtures or future SDK-shaped payloads.
  return round(n >= 0 && n <= 1 ? n * 100 : n, 4);
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
  if (!data.access_token) throw new Error('Google Ads OAuth: missing access_token');
  return data.access_token;
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
  const chunks = Array.isArray(payload) ? payload : [payload];
  return chunks.flatMap((chunk) => Array.isArray(chunk.results) ? chunk.results : []);
}

function campaignDims(row) {
  const campaign = row.campaign || {};
  return {
    campaign: campaign.name || 'unknown',
    campaignId: String(campaign.id || ''),
    channelType: campaign.advertisingChannelType || campaign.advertising_channel_type || '',
  };
}

function addCoreMetrics(metrics, row, date, dimensions = null) {
  const costMicros = num(metric(row, 'costMicros'));
  const spend = round(costMicros / 1_000_000, 2);
  const impressions = num(metric(row, 'impressions'));
  const clicks = num(metric(row, 'clicks'));
  const conversions = num(metric(row, 'conversions'));
  const revenue = round(num(metric(row, 'conversionsValue')), 2);
  const cpcMicros = num(metric(row, 'averageCpc'));
  const dims = dimensions ? { dimensions } : {};

  metrics.push(
    { name: 'spend', value: spend, date, ...dims },
    { name: 'impressions', value: impressions, date, ...dims },
    { name: 'clicks', value: clicks, date, ...dims },
  );

  const ctr = percent(metric(row, 'ctr'));
  if (ctr != null) metrics.push({ name: 'ctr', value: ctr, date, ...dims });
  if (cpcMicros > 0) metrics.push({ name: 'cpc', value: round(cpcMicros / 1_000_000, 2), date, ...dims });
  if (conversions) {
    metrics.push(
      { name: 'conversions', value: round(conversions, 2), date, ...dims },
      // Google Ads platform conversions are the closest paid lead signal. Real
      // closed-won/revenue still belongs to the revenue source.
      { name: 'leads', value: round(conversions, 2), date, ...dims },
    );
  }
  if (revenue) {
    metrics.push({ name: 'revenue', value: revenue, date, ...dims });
    if (spend > 0) metrics.push({ name: 'roas', value: round(revenue / spend, 2), date, ...dims });
  }
}

function aggregateRows(rows) {
  const total = {
    metrics: {
      costMicros: 0,
      impressions: 0,
      clicks: 0,
      conversions: 0,
      conversionsValue: 0,
    },
  };
  for (const row of rows) {
    total.metrics.costMicros += num(metric(row, 'costMicros'));
    total.metrics.impressions += num(metric(row, 'impressions'));
    total.metrics.clicks += num(metric(row, 'clicks'));
    total.metrics.conversions += num(metric(row, 'conversions'));
    total.metrics.conversionsValue += num(metric(row, 'conversionsValue'));
  }
  total.metrics.ctr = total.metrics.impressions > 0
    ? total.metrics.clicks / total.metrics.impressions
    : 0;
  total.metrics.averageCpc = total.metrics.clicks > 0
    ? total.metrics.costMicros / total.metrics.clicks
    : 0;
  return total;
}

function addShareMetrics(metrics, rows, date) {
  const shares = [];
  const lostShares = [];
  for (const row of rows) {
    const dims = campaignDims(row);
    const impressionShare = percent(metric(row, 'searchImpressionShare'));
    const rankLost = percent(metric(row, 'searchRankLostImpressionShare'));
    const budgetLost = percent(metric(row, 'searchBudgetLostImpressionShare'));
    const lost = [rankLost, budgetLost].filter((v) => v != null).reduce((sum, v) => sum + v, 0);

    if (impressionShare != null) {
      shares.push(impressionShare);
      metrics.push({ name: 'impressionShare', value: impressionShare, date, dimensions: dims });
    }
    if (lost > 0) {
      const value = round(Math.min(lost, 100), 4);
      lostShares.push(value);
      metrics.push({ name: 'lostImpressionShare', value, date, dimensions: dims });
    }
  }
  if (shares.length) {
    metrics.push({ name: 'impressionShare', value: round(shares.reduce((a, b) => a + b, 0) / shares.length, 4), date });
  }
  if (lostShares.length) {
    metrics.push({ name: 'lostImpressionShare', value: round(lostShares.reduce((a, b) => a + b, 0) / lostShares.length, 4), date });
  }
}

/**
 * @param {object} config
 * @param {object} env
 * @param {{ from: string, to: string }} dateRange
 */
export async function collect(config, env, dateRange) {
  const slug = slugUpper(config);
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
  const campaignQuery = `
    SELECT
      campaign.id,
      campaign.name,
      campaign.status,
      campaign.advertising_channel_type,
      metrics.cost_micros,
      metrics.impressions,
      metrics.clicks,
      metrics.ctr,
      metrics.average_cpc,
      metrics.conversions,
      metrics.conversions_value
    FROM campaign
    WHERE ${dateWhere}
      AND campaign.status != 'REMOVED'
    ORDER BY metrics.cost_micros DESC
    LIMIT 100
  `;

  const rows = await searchStream({ ...ctx, query: campaignQuery });
  const metrics = [];
  if (rows.length) {
    addCoreMetrics(metrics, aggregateRows(rows), dateRange.from);
    for (const row of rows) addCoreMetrics(metrics, row, dateRange.from, campaignDims(row));
  }

  const shareQuery = `
    SELECT
      campaign.id,
      campaign.name,
      campaign.advertising_channel_type,
      metrics.search_impression_share,
      metrics.search_rank_lost_impression_share,
      metrics.search_budget_lost_impression_share
    FROM campaign
    WHERE ${dateWhere}
      AND campaign.status != 'REMOVED'
    LIMIT 100
  `;
  try {
    const shareRows = await searchStream({ ...ctx, query: shareQuery });
    addShareMetrics(metrics, shareRows, dateRange.from);
  } catch (err) {
    console.warn(`  Warning: Google Ads impression share skipped: ${err.message}`);
  }

  return { source: 'google_ads', date: dateRange.from, metrics };
}
