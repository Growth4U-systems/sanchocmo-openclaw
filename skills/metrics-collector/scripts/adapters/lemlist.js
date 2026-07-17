/** Lemlist campaign-performance adapter for the unified daily collector. */

import { pointInTimeMetricDate } from '../adapter-date-range.js';

const API_BASE = 'https://api.lemlist.com/api';
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;
const PAGE_LIMIT = 100;
const MAX_CAMPAIGNS = 1000;

const STAT_METRICS = [
  ['sent', 'messagesSent'],
  ['delivered', 'delivered'],
  ['opens', 'opened'],
  ['clicks', 'clicked'],
  ['replies', 'replied'],
  ['bounced', 'messagesBounced'],
  ['notSent', 'messagesNotSent'],
  ['meetings', 'meetingBooked'],
  ['leads', 'nbLeads'],
  ['launched', 'nbLeadsLaunched'],
  ['reached', 'nbLeadsReached'],
  ['interacted', 'nbLeadsInteracted'],
  ['answered', 'nbLeadsAnswered'],
  ['interested', 'nbLeadsInterested'],
  ['notInterested', 'nbLeadsNotInterested'],
  ['unsubscribed', 'nbLeadsUnsubscribed'],
  ['interrupted', 'nbLeadsInterrupted'],
  ['invitationAccepted', 'invitationAccepted'],
];

function apiKeyFor(config, env) {
  const slug = (config._slug || '').toUpperCase().replace(/-/g, '_');
  return env[`${slug}_LEMLIST_API_KEY`] || env.LEMLIST_API_KEY || '';
}

function basicAuth(apiKey) {
  return `Basic ${Buffer.from(`:${apiKey}`).toString('base64')}`;
}

function csv(value) {
  if (Array.isArray(value)) return value.flatMap(csv);
  if (typeof value !== 'string') return [];
  return value.split(',').map((part) => part.trim()).filter(Boolean);
}

function isCalendarDate(value) {
  if (!DATE_RE.test(value || '')) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function datesInRange(dateRange) {
  if (!isCalendarDate(dateRange.from) || !isCalendarDate(dateRange.to) || dateRange.from > dateRange.to) {
    throw new Error(`Lemlist: invalid date range ${dateRange.from}..${dateRange.to}`);
  }
  const start = Date.parse(`${dateRange.from}T00:00:00Z`);
  const end = Date.parse(`${dateRange.to}T00:00:00Z`);
  const days = Math.floor((end - start) / DAY_MS) + 1;
  if (days > 366) throw new Error('Lemlist: date range cannot exceed 366 days');
  return Array.from({ length: days }, (_, index) =>
    new Date(start + index * DAY_MS).toISOString().slice(0, 10));
}

function dateWindow(date) {
  const start = new Date(`${date}T00:00:00.000Z`);
  return {
    startDate: start.toISOString(),
    endDate: new Date(start.getTime() + DAY_MS - 1).toISOString(),
  };
}

async function request(apiKey, path, init = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: basicAuth(apiKey),
      Accept: 'application/json',
      ...(init.headers || {}),
    },
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Lemlist ${init.method || 'GET'} ${path} failed (${response.status}): ${text.slice(0, 240)}`);
  }
  try {
    return text.trim() ? JSON.parse(text) : null;
  } catch {
    throw new Error(`Lemlist ${init.method || 'GET'} ${path}: invalid JSON response`);
  }
}

async function listCampaigns(apiKey) {
  const campaigns = [];
  for (let offset = 0; offset < MAX_CAMPAIGNS; offset += PAGE_LIMIT) {
    const query = new URLSearchParams({
      version: 'v2',
      limit: String(PAGE_LIMIT),
      offset: String(offset),
      sortBy: 'createdAt',
      sortOrder: 'desc',
    });
    const page = await request(apiKey, `/campaigns?${query}`);
    if (!Array.isArray(page)) throw new Error('Lemlist campaigns response was not an array');
    // Archived campaigns can still own real activity inside the requested day
    // (including yesterday if they were archived before today's pull). Keep
    // them in the stats universe; only never-launched drafts are excluded.
    campaigns.push(...page.filter((campaign) =>
      campaign?._id && campaign.status !== 'draft'));
    if (page.length < PAGE_LIMIT) return campaigns;
  }
  throw new Error(`Lemlist: campaign listing exceeded the ${MAX_CAMPAIGNS}-campaign safety limit`);
}

async function statsForDay(apiKey, campaignIds, date) {
  if (!campaignIds.length) return { stats: [], partial: false };
  const { startDate, endDate } = dateWindow(date);
  const stats = [];
  let partial = false;
  for (let index = 0; index < campaignIds.length; index += PAGE_LIMIT) {
    const requestedIds = campaignIds.slice(index, index + PAGE_LIMIT);
    const body = await request(apiKey, '/v2/campaigns/stats/batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        campaignIds: requestedIds,
        startDate,
        endDate,
      }),
    });
    if (!body || !Array.isArray(body.results)) {
      throw new Error('Lemlist stats response was missing the results array');
    }
    if (Array.isArray(body.errors) && body.errors.length) {
      throw new Error(`Lemlist stats returned ${body.errors.length} campaign error(s): ${JSON.stringify(body.errors.slice(0, 3))}`);
    }

    // A successful HTTP response is not necessarily a complete batch. Only one
    // result for every requested campaign is unambiguous; unknown, missing or
    // duplicate identities must not be summed and later used to delete the last
    // complete dimensional snapshot.
    const requested = new Set(requestedIds);
    const counts = new Map();
    for (const result of body.results) {
      const campaignId = typeof result?.campaignId === 'string' ? result.campaignId : '';
      if (!campaignId || !requested.has(campaignId)) {
        partial = true;
        continue;
      }
      counts.set(campaignId, (counts.get(campaignId) || 0) + 1);
    }
    if (requestedIds.some((campaignId) => counts.get(campaignId) !== 1)) partial = true;

    stats.push(...body.results.filter((result) => {
      const campaignId = typeof result?.campaignId === 'string' ? result.campaignId : '';
      return requested.has(campaignId) && counts.get(campaignId) === 1;
    }));
  }
  return { stats, partial };
}

function finiteNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function mapStats(date, campaigns, stats) {
  const campaignById = new Map(campaigns.map((campaign) => [campaign._id, campaign]));
  const totals = new Map();
  const metrics = [];
  let partial = false;

  // An empty campaign catalogue is authoritative: there can be no activity.
  if (!campaigns.length) {
    return {
      metrics: STAT_METRICS.map(([name]) => ({ name, value: 0, date })),
      partial: false,
    };
  }

  for (const stat of stats) {
    const campaignId = typeof stat.campaignId === 'string' ? stat.campaignId : '';
    const campaign = campaignById.get(campaignId);
    const dimensions = {
      ...(campaignId ? { campaignId } : {}),
      ...(campaign?.name ? { campaignName: campaign.name } : {}),
      ...(campaign?.status ? { campaignStatus: campaign.status } : {}),
    };
    for (const [name, field] of STAT_METRICS) {
      if (!Object.hasOwn(stat, field) || stat[field] == null || stat[field] === '') {
        partial = true;
        continue;
      }
      const value = finiteNumber(stat[field]);
      if (value == null) {
        partial = true;
        continue;
      }
      totals.set(name, (totals.get(name) || 0) + value);
      if (Object.keys(dimensions).length) metrics.push({ name, value, date, dimensions });
    }
  }

  for (const [name] of STAT_METRICS) {
    if (totals.has(name)) metrics.push({ name, value: totals.get(name), date });
  }
  return { metrics, partial };
}

export async function collect(config, env, dateRange) {
  const apiKey = apiKeyFor(config, env);
  if (!apiKey) throw new Error('Lemlist: missing LEMLIST_API_KEY');

  const observationDate = pointInTimeMetricDate(config, dateRange);
  const includeCurrentState = config._explicitRange !== true;
  const requestedDates = datesInRange(dateRange);

  const configuredIds = [...new Set(csv(
    config.CAMPAIGN_IDS ?? config.campaignIds ?? config.campaign_ids,
  ))];
  const campaigns = configuredIds.length
    ? configuredIds.map((_id) => ({ _id }))
    : await listCampaigns(apiKey);
  const activeCampaignCount = campaigns.filter(
    (campaign) => campaign.status !== 'archived',
  ).length;
  // The campaign list/status is queried now; it is not a historical count for
  // every day in a multi-day stats repair. A routine run records it once.
  const metrics = includeCurrentState && configuredIds.length === 0
    ? [{ name: 'campaigns', value: activeCampaignCount, date: observationDate }]
    : [];
  let partial = false;
  for (const date of requestedDates) {
    const result = await statsForDay(apiKey, campaigns.map((campaign) => campaign._id), date);
    const mapped = mapStats(date, campaigns, result.stats);
    partial = partial || result.partial || mapped.partial;
    metrics.push(...mapped.metrics);
  }

  return {
    source: 'lemlist',
    date: dateRange.from,
    metrics,
    attemptedDates: [...new Set([
      ...requestedDates,
      ...(includeCurrentState && configuredIds.length === 0 ? [observationDate] : []),
    ])].sort(),
    restatedScopes: [
      ...requestedDates.flatMap((metricDate) =>
        STAT_METRICS.map(([metricName]) => ({ metricDate, metricName }))),
      ...(includeCurrentState && configuredIds.length === 0
        ? [{ metricDate: observationDate, metricName: 'campaigns' }]
        : []),
    ],
    ...(partial ? { quality: 'partial' } : {}),
  };
}
