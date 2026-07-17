/**
 * Meta Ads Adapter — Facebook/Instagram Ads via Graph API
 *
 * Pulls: spend, impressions, clicks, ctr, cpc, leads. By campaign and total.
 */

const GRAPH_API_VERSION = 'v21.0';
const BASE_URL = `https://graph.facebook.com/${GRAPH_API_VERSION}`;
const GRAPH_ORIGIN = 'https://graph.facebook.com';
const MAX_PAGES = 1000;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const TOTAL_FIELDS = 'spend,impressions,clicks,ctr,cpc,frequency,actions,action_values';
const CAMPAIGN_FIELDS = `campaign_id,campaign_name,${TOTAL_FIELDS}`;
const ADSET_FIELDS = `campaign_id,campaign_name,adset_id,adset_name,${TOTAL_FIELDS}`;
const AD_FIELDS = 'campaign_id,campaign_name,adset_id,adset_name,ad_id,ad_name,spend,impressions,clicks,ctr,cpc,frequency,actions,action_values';
const DEFAULT_ACTION_TYPE_PRECEDENCE = Object.freeze({
  // Meta can return the same attributed outcome under more than one alias.
  // The first present type wins; aliases are alternatives, never additive.
  leads: Object.freeze([
    'lead',
    'onsite_conversion.lead_grouped',
    'offsite_complete_registration_add_meta_leads',
  ]),
  purchases: Object.freeze([
    'purchase',
    'offsite_conversion.fb_pixel_purchase',
  ]),
});
const ZERO_DAY_METRICS = ['spend', 'impressions', 'clicks', 'conversions', 'leads', 'revenue'];
const META_RESTATED_METRICS = [
  'spend',
  'impressions',
  'clicks',
  'ctr',
  'cpc',
  'conversions',
  'leads',
  'revenue',
  'frequency',
  'roas',
  'linkClicks',
  'engagement',
];

function parseNumber(value, label, { integer = false, optional = false } = {}) {
  if (value == null) {
    if (optional) return null;
    throw new Error(`Meta Ads API: missing ${label}`);
  }
  if ((typeof value !== 'string' && typeof value !== 'number') ||
      (typeof value === 'string' && value.trim() === '')) {
    throw new Error(`Meta Ads API: malformed ${label}`);
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || (integer && !Number.isSafeInteger(parsed))) {
    throw new Error(`Meta Ads API: malformed ${label}`);
  }
  return parsed;
}

function validatePrecedence(value, fallback, label) {
  if (value == null) return [...fallback];
  if (!Array.isArray(value) || value.length === 0 ||
      value.some((type) => typeof type !== 'string' || type.trim() === '')) {
    throw new Error(`Meta Ads: actionTypePrecedence.${label} must be a non-empty string array`);
  }
  const normalized = value.map((type) => type.trim());
  if (new Set(normalized).size !== normalized.length) {
    throw new Error(`Meta Ads: actionTypePrecedence.${label} contains duplicate action types`);
  }
  return normalized;
}

function actionTypePrecedence(config) {
  const configured = config.actionTypePrecedence;
  if (configured != null && (typeof configured !== 'object' || Array.isArray(configured))) {
    throw new Error('Meta Ads: actionTypePrecedence must be an object');
  }
  const leads = validatePrecedence(configured?.leads, DEFAULT_ACTION_TYPE_PRECEDENCE.leads, 'leads');
  const purchases = validatePrecedence(
    configured?.purchases,
    DEFAULT_ACTION_TYPE_PRECEDENCE.purchases,
    'purchases',
  );
  const overlap = leads.find((type) => purchases.includes(type));
  if (overlap) {
    throw new Error(`Meta Ads: action type ${overlap} cannot be both a lead and a purchase`);
  }
  return { leads, purchases };
}

function indexedActions(value, label) {
  if (value == null) return new Map();
  if (!Array.isArray(value)) throw new Error(`Meta Ads API: malformed ${label}`);

  const indexed = new Map();
  value.forEach((entry, index) => {
    if (!entry || typeof entry !== 'object' ||
        typeof entry.action_type !== 'string' || entry.action_type.trim() === '') {
      throw new Error(`Meta Ads API: malformed ${label}[${index}]`);
    }
    const type = entry.action_type.trim();
    if (indexed.has(type)) {
      throw new Error(`Meta Ads API: duplicate ${label} action_type ${type}`);
    }
    indexed.set(type, parseNumber(entry.value, `${label}[${index}].value`));
  });
  return indexed;
}

function preferredActionValue(indexed, precedence) {
  for (const type of precedence) {
    if (indexed.has(type)) return indexed.get(type);
  }
  return 0;
}

function authRequest(accessToken) {
  return { headers: { Authorization: `Bearer ${accessToken}` } };
}

function isCalendarDate(value) {
  if (!ISO_DATE_RE.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function requiredText(row, key, label) {
  const value = row?.[key];
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`Meta Ads API: missing ${label}.${key}`);
  }
  return value.trim();
}

function insightsUrl(accountId, fields, dateRange, extra = {}) {
  const url = new URL(`${BASE_URL}/${encodeURIComponent(accountId)}/insights`);
  url.searchParams.set('fields', fields);
  url.searchParams.set('time_range', JSON.stringify({ since: dateRange.from, until: dateRange.to }));
  for (const [key, value] of Object.entries(extra)) url.searchParams.set(key, String(value));
  return url.toString();
}

async function fetchRows(url, accessToken, label) {
  const rows = [];
  const visited = new Set();
  let next = url;

  for (let page = 1; next; page += 1) {
    if (page > MAX_PAGES) {
      throw new Error(`Meta Ads API: ${label} exceeded ${MAX_PAGES} pages`);
    }
    const requestUrl = new URL(next);
    if (requestUrl.origin !== GRAPH_ORIGIN) {
      throw new Error(`Meta Ads API: unsafe ${label} paging URL`);
    }
    // Graph can echo a token in paging.next. Bearer auth is already attached;
    // remove it from the URL so credentials never reach logs or error messages.
    requestUrl.searchParams.delete('access_token');
    const href = requestUrl.toString();
    if (visited.has(href)) {
      throw new Error(`Meta Ads API: repeated ${label} paging URL`);
    }
    visited.add(href);

    const response = await fetch(href, authRequest(accessToken));
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Meta Ads API ${response.status} (${label}): ${text}`);
    }
    const payload = await response.json();
    if (!payload || typeof payload !== 'object' || !Array.isArray(payload.data)) {
      throw new Error(`Meta Ads API: ${label} response missing data array`);
    }
    rows.push(...payload.data);

    const pagingNext = payload.paging?.next;
    if (pagingNext == null || pagingNext === '') next = null;
    else if (typeof pagingNext === 'string') next = pagingNext;
    else throw new Error(`Meta Ads API: malformed ${label} paging.next`);
  }
  return rows;
}

/**
 * Platform-reported outcomes from Meta's actions/action_values — frequency,
 * conversions, revenue and platform ROAS. This is the AD PLATFORM's OWN pixel
 * attribution (flagged `dedup` in the Paid surface), NOT CRM-verified: the real
 * cita/revenue lives in Conversión/Atribución, never inside Paid.
 * Returns bare { name, value }[]; the caller adds date + dimensions.
 */
function platformOutcomes(row, precedence, context, spend, impressions) {
  const actions = indexedActions(row.actions, `${context}.actions`);
  const values = indexedActions(row.action_values, `${context}.action_values`);
  const leads = preferredActionValue(actions, precedence.leads);
  const purchases = preferredActionValue(actions, precedence.purchases);
  const revenue = preferredActionValue(values, precedence.purchases);
  const out = [
    { name: 'conversions', value: leads + purchases },
    { name: 'leads', value: leads },
    { name: 'revenue', value: revenue },
  ];
  const frequency = parseNumber(row.frequency, `${context}.frequency`, { optional: true });
  if (frequency != null && impressions > 0) out.push({ name: 'frequency', value: frequency });
  if (spend > 0) out.push({ name: 'roas', value: Math.round((revenue / spend) * 100) / 100 });
  return out;
}

function metricsForRow(row, date, dimensions, precedence, context) {
  if (!row || typeof row !== 'object' || Array.isArray(row)) {
    throw new Error(`Meta Ads API: malformed ${context} row`);
  }
  const spend = parseNumber(row.spend, `${context}.spend`);
  const impressions = parseNumber(row.impressions, `${context}.impressions`, { integer: true });
  const clicks = parseNumber(row.clicks, `${context}.clicks`, { integer: true });
  const ctr = parseNumber(row.ctr, `${context}.ctr`, { optional: true });
  const cpc = parseNumber(row.cpc, `${context}.cpc`, { optional: true });
  const common = dimensions ? { date, dimensions } : { date };
  const metrics = [
    { name: 'spend', value: spend, ...common },
    { name: 'impressions', value: impressions, ...common },
    { name: 'clicks', value: clicks, ...common },
  ];
  // Meta omits rates when there is no denominator. Do not manufacture a zero.
  if (impressions > 0 && ctr != null) metrics.push({ name: 'ctr', value: ctr, ...common });
  if (clicks > 0 && cpc != null) metrics.push({ name: 'cpc', value: cpc, ...common });
  for (const outcome of platformOutcomes(row, precedence, context, spend, impressions)) {
    metrics.push({ ...outcome, ...common });
  }
  return metrics;
}

/** Fetch one insights breakdown (placement/audience) and push rows with `dims`. */
async function collectBreakdown(baseUrl, breakdowns, accessToken, dateRange, dimOf, into, precedence) {
  const url = new URL(baseUrl);
  url.searchParams.set('breakdowns', breakdowns);
  const rows = await fetchRows(url.toString(), accessToken, `${breakdowns} breakdown`);
  for (const [index, row] of rows.entries()) {
    const dims = dimOf(row);
    into.push(...metricsForRow(
      row,
      dateRange.from,
      dims,
      precedence,
      `${breakdowns}[${index}]`,
    ));
  }
}

/**
 * @param {object} config - { accountId, actionTypePrecedence?: { leads?: string[], purchases?: string[] } }
 * @param {object} env - { {SLUG}_META_ADS_ACCESS_TOKEN: "..." }
 * @param {{ from: string, to: string }} dateRange
 */
export async function collect(config, env, dateRange) {
  if (!isCalendarDate(dateRange.from) || !isCalendarDate(dateRange.to)) {
    throw new Error(`Meta Ads: invalid date range ${dateRange.from || '?'}..${dateRange.to || '?'}`);
  }
  if (dateRange.from !== dateRange.to) {
    throw new Error('Meta Ads: multi-day ranges are not supported safely; collect one day at a time');
  }
  const slugUpper = (config._slug || '').toUpperCase().replace(/-/g, '_');
  const accountId =
    env[`${slugUpper}_META_ADS_ACCOUNT_ID`] ||
    env[`${slugUpper}_META_ACCOUNT_ID`] ||
    env.META_ADS_ACCOUNT_ID ||
    env.META_ACCOUNT_ID ||
    config.accountId ||
    config.ACCOUNT_ID;
  if (!accountId) {
    throw new Error('Meta Ads: missing accountId in integrations.json or META_ADS_ACCOUNT_ID env');
  }

  // Find access token — try slug-prefixed first, then the canonical generic name,
  // then the legacy/deploy-secret name (the GitHub `staging`/`prod` Environments
  // ship META_ACCESS_TOKEN, not META_ADS_ACCESS_TOKEN).
  const accessToken =
    env[`${slugUpper}_META_ADS_ACCESS_TOKEN`] ||
    env[`${slugUpper}_META_ACCESS_TOKEN`] ||
    env.META_ADS_ACCESS_TOKEN ||
    env.META_ACCESS_TOKEN;

  if (!accessToken) {
    throw new Error('Meta Ads: missing META_ADS_ACCESS_TOKEN (or META_ACCESS_TOKEN) in env');
  }

  const precedence = actionTypePrecedence(config);
  const metrics = [];
  let optionalQualityPartial = false;

  // --- Account-level totals ---
  const totalsRows = await fetchRows(
    insightsUrl(accountId, TOTAL_FIELDS, dateRange),
    accessToken,
    'account insights',
  );
  if (totalsRows.length > 1) {
    throw new Error(`Meta Ads API: account insights returned ${totalsRows.length} rows; expected at most one`);
  }
  if (totalsRows.length === 1) {
    metrics.push(...metricsForRow(
      totalsRows[0],
      dateRange.from,
      undefined,
      precedence,
      'account insights',
    ));
  } else {
    // A valid empty Insights day means zero delivery, not a failed collection.
    // Persist additive zeros so convergence removes any stale prior snapshot;
    // rates and unit costs remain absent because their denominators are zero.
    for (const name of ZERO_DAY_METRICS) {
      metrics.push({ name, value: 0, date: dateRange.from });
    }
  }

  // --- By campaign ---
  try {
    const campaignRows = await fetchRows(
      insightsUrl(accountId, CAMPAIGN_FIELDS, dateRange, { level: 'campaign', limit: 50 }),
      accessToken,
      'campaign insights',
    );
    for (const [index, row] of campaignRows.entries()) {
      const campaign = requiredText(row, 'campaign_name', `campaign insights[${index}]`);
      const campaignId = requiredText(row, 'campaign_id', `campaign insights[${index}]`);
      metrics.push(...metricsForRow(
        row,
        dateRange.from,
        { campaign, campaignId },
        precedence,
        `campaign insights[${index}]`,
      ));
    }
  } catch (error) {
    optionalQualityPartial = true;
    console.warn(`  ⚠️  Meta Ads campaign breakdown error: ${error.message}`);
  }

  // --- By Ad Set ---
  try {
    const adsetRows = await fetchRows(
      insightsUrl(accountId, ADSET_FIELDS, dateRange, { level: 'adset', limit: 50 }),
      accessToken,
      'ad set insights',
    );
    for (const [index, row] of adsetRows.entries()) {
      const dims = {
        adset: requiredText(row, 'adset_name', `ad set insights[${index}]`),
        adsetId: requiredText(row, 'adset_id', `ad set insights[${index}]`),
        campaign: requiredText(row, 'campaign_name', `ad set insights[${index}]`),
        campaignId: requiredText(row, 'campaign_id', `ad set insights[${index}]`),
      };
      metrics.push(...metricsForRow(
        row,
        dateRange.from,
        dims,
        precedence,
        `ad set insights[${index}]`,
      ));
    }
  } catch (error) {
    optionalQualityPartial = true;
    console.warn(`  ⚠️  Meta Ads ad-set breakdown error: ${error.message}`);
  }

  // --- By Ad Creative ---
  try {
    const adRows = await fetchRows(
      insightsUrl(accountId, AD_FIELDS, dateRange, { level: 'ad', limit: 50 }),
      accessToken,
      'ad insights',
    );
    for (const [index, row] of adRows.entries()) {
      const dims = {
        ad: requiredText(row, 'ad_name', `ad insights[${index}]`),
        adId: requiredText(row, 'ad_id', `ad insights[${index}]`),
        adset: requiredText(row, 'adset_name', `ad insights[${index}]`),
        adsetId: requiredText(row, 'adset_id', `ad insights[${index}]`),
        campaign: requiredText(row, 'campaign_name', `ad insights[${index}]`),
        campaignId: requiredText(row, 'campaign_id', `ad insights[${index}]`),
      };
      const context = `ad insights[${index}]`;
      metrics.push(...metricsForRow(row, dateRange.from, dims, precedence, context));

      const actions = indexedActions(row.actions, `${context}.actions`);
      if (actions.has('link_click')) {
        metrics.push({ name: 'linkClicks', value: actions.get('link_click'), date: dateRange.from, dimensions: dims });
      }
      if (actions.has('post_engagement')) {
        metrics.push({ name: 'engagement', value: actions.get('post_engagement'), date: dateRange.from, dimensions: dims });
      }
    }
  } catch (error) {
    optionalQualityPartial = true;
    console.warn(`  ⚠️  Meta Ads ad breakdown error: ${error.message}`);
  }

  // --- Breakdowns: placement & audience (account-level) ---
  const breakdownBase = insightsUrl(accountId, TOTAL_FIELDS, dateRange, { limit: 100 });
  try {
    await collectBreakdown(
      breakdownBase,
      'publisher_platform,platform_position',
      accessToken,
      dateRange,
      (row) => ({
        placement: `${requiredText(row, 'publisher_platform', 'placement breakdown')} · ${requiredText(row, 'platform_position', 'placement breakdown')}`,
      }),
      metrics,
      precedence,
    );
  } catch (error) {
    optionalQualityPartial = true;
    console.warn(`  ⚠️  Meta Ads placement breakdown error: ${error.message}`);
  }
  try {
    await collectBreakdown(
      breakdownBase,
      'age,gender',
      accessToken,
      dateRange,
      (row) => ({
        audience: `${requiredText(row, 'age', 'audience breakdown')} · ${requiredText(row, 'gender', 'audience breakdown')}`,
      }),
      metrics,
      precedence,
    );
  } catch (error) {
    optionalQualityPartial = true;
    console.warn(`  ⚠️  Meta Ads audience breakdown error: ${error.message}`);
  }

  return {
    source: 'meta-ads',
    date: dateRange.from,
    metrics,
    attemptedDates: [dateRange.from],
    restatedScopes: META_RESTATED_METRICS.map((metricName) => ({
      metricDate: dateRange.from,
      metricName,
    })),
    ...(optionalQualityPartial ? { quality: 'partial' } : {}),
  };
}
