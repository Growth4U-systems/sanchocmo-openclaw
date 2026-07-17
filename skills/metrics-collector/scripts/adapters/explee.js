/**
 * Explee AutoGTM adapter — project-level lifetime/current snapshot.
 *
 * Explee analytics only supports provider-native windows (`today`, `7d`,
 * `30d`, `all`), not exact calendar ranges. To avoid presenting rolling
 * windows as Sancho period flows, this adapter reads `period=all` and persists
 * explicitly named lifetime/current metrics at the collection observation day.
 * Historical `--from/--to` repairs are rejected.
 *
 * Auth: X-API-Key from {SLUG}_EXPLEE_API_KEY / EXPLEE_API_KEY.
 */

import { pointInTimeMetricDate } from '../adapter-date-range.js';

const BASE_URL = 'https://api.explee.com/public/api/v1';
const SNAPSHOT_METRICS = [
  'campaignsCurrent',
  'emailsSentLifetime',
  'repliesLifetime',
  'replyRatePctLifetime',
  'hotLeadsLifetime',
  'spendUsdLifetime',
  'costPerHotLeadUsdLifetime',
];

function firstPresent(...values) {
  for (const value of values) {
    if (value != null && String(value).trim() !== '') return String(value).trim();
  }
  return '';
}

function requireRecord(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label}: response was not an object`);
  }
  return value;
}

function requireArray(value, label) {
  if (!Array.isArray(value)) throw new Error(`${label}: response missing array`);
  return value;
}

function requireNonEmptyString(value, label) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${label} must be a non-empty string`);
  }
  return value.trim();
}

function requireNonNegative(value, label, { integer = false } = {}) {
  if (value == null || value === '') {
    throw new Error(`${label} must be a non-negative${integer ? ' integer' : ' number'}`);
  }
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0 || (integer && !Number.isInteger(numeric))) {
    throw new Error(`${label} must be a non-negative${integer ? ' integer' : ' number'}`);
  }
  return numeric;
}

function requireClose(actual, expected, label, tolerance = 0.51) {
  if (Math.abs(actual - expected) > tolerance) {
    throw new Error(`${label} does not match its reported numerator and denominator`);
  }
}

async function getJson(url, headers, label) {
  const response = await fetch(url, {
    headers,
    redirect: 'error',
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) {
    throw new Error(`${label} HTTP ${response.status}`);
  }
  try {
    return await response.json();
  } catch {
    throw new Error(`${label}: invalid JSON response`);
  }
}

function validateCampaignRollup(campaign) {
  const row = requireRecord(campaign, 'Explee campaign analytics item');
  const campaignId = requireNonNegative(
    row.campaign_id,
    'Explee campaign campaign_id',
    { integer: true },
  );
  if (campaignId < 1) throw new Error('Explee campaign campaign_id must be positive');
  requireNonEmptyString(row.name, 'Explee campaign name');
  requireNonEmptyString(row.status, 'Explee campaign status');
  if (row.status_reason != null) {
    requireNonEmptyString(row.status_reason, 'Explee campaign status_reason');
  }
  for (const field of ['emails_sent', 'total_replies', 'hot_leads', 'leads_pool_used', 'leads_pool_total']) {
    requireNonNegative(row[field], `Explee campaign ${field}`, { integer: true });
  }
  for (const field of ['reply_rate_pct', 'spend_usd', 'cost_per_lead_usd', 'daily_budget_usd']) {
    requireNonNegative(row[field], `Explee campaign ${field}`);
  }
  if (row.manual_status_counts != null) {
    const statuses = requireRecord(row.manual_status_counts, 'Explee campaign manual_status_counts');
    for (const [status, count] of Object.entries(statuses)) {
      requireNonEmptyString(status, 'Explee campaign manual status');
      requireNonNegative(count, `Explee campaign manual status ${status}`, { integer: true });
    }
  }
}

function selectProject(projects, configuredProjectId) {
  for (const project of projects) {
    requireRecord(project, 'Explee projects item');
    requireNonNegative(project.id, 'Explee project id', { integer: true });
    if (Number(project.id) < 1) throw new Error('Explee project id must be positive');
  }

  if (configuredProjectId) {
    const selected = projects.find((project) => String(project.id) === configuredProjectId);
    if (!selected) {
      throw new Error(`Explee project ${configuredProjectId} is not available to this API key`);
    }
    return selected;
  }
  if (projects.length === 1) return projects[0];
  if (projects.length === 0) throw new Error('Explee has no active AutoGTM projects');
  throw new Error(`Explee returned ${projects.length} projects; configure PROJECT_ID explicitly`);
}

/**
 * @param {object} config - integrations.json config plus collector internals.
 * @param {object} env - runtime/provider env values.
 * @param {{ from: string, to: string }} dateRange - ignored as a flow window;
 *   required only for the collector contract and point-in-time fallback.
 */
export async function collect(config = {}, env = {}, dateRange) {
  if (config._explicitRange === true) {
    throw new Error('Explee does not support exact historical ranges; run collection without --from/--to');
  }
  const observationDate = pointInTimeMetricDate(config, dateRange);
  const slugUpper = firstPresent(config._slug).toUpperCase().replace(/-/g, '_');
  const apiKey = firstPresent(
    slugUpper ? env[`${slugUpper}_EXPLEE_API_KEY`] : '',
    env.EXPLEE_API_KEY,
  );
  if (!apiKey) throw new Error('Explee: missing EXPLEE_API_KEY in .env');

  const configuredProjectId = firstPresent(
    config.PROJECT_ID,
    config.projectId,
    config.project_id,
    slugUpper ? env[`${slugUpper}_EXPLEE_PROJECT_ID`] : '',
    env.EXPLEE_PROJECT_ID,
  );
  if (configuredProjectId && !/^\d+$/.test(configuredProjectId)) {
    throw new Error('Explee PROJECT_ID must be a numeric project id');
  }

  const headers = { 'X-API-Key': apiKey, Accept: 'application/json' };
  const projectsPayload = requireRecord(
    await getJson(`${BASE_URL}/autogtm/projects`, headers, 'Explee projects'),
    'Explee projects',
  );
  const projects = requireArray(projectsPayload.projects, 'Explee projects');
  requireNonNegative(projectsPayload.total, 'Explee projects total', { integer: true });
  if (Number(projectsPayload.total) !== projects.length) {
    throw new Error('Explee projects total does not match projects array');
  }
  const project = selectProject(projects, configuredProjectId);
  const projectId = String(project.id);

  const analytics = requireRecord(
    await getJson(
      `${BASE_URL}/autogtm/projects/${encodeURIComponent(projectId)}/analytics?period=all`,
      headers,
      'Explee project analytics',
    ),
    'Explee project analytics',
  );
  if (String(analytics.project_id) !== projectId || analytics.period !== 'all') {
    throw new Error('Explee project analytics did not match the requested project and period');
  }

  const emailsSent = requireNonNegative(
    analytics.total_emails_sent,
    'Explee total_emails_sent',
    { integer: true },
  );
  const replies = requireNonNegative(
    analytics.total_replies,
    'Explee total_replies',
    { integer: true },
  );
  const reportedReplyRate = requireNonNegative(
    analytics.overall_reply_rate_pct,
    'Explee overall_reply_rate_pct',
  );
  const hotLeads = requireNonNegative(
    analytics.total_hot_leads,
    'Explee total_hot_leads',
    { integer: true },
  );
  const spendUsd = requireNonNegative(analytics.total_spend_usd, 'Explee total_spend_usd');
  const campaigns = requireArray(analytics.campaigns, 'Explee project analytics campaigns');
  for (const campaign of campaigns) validateCampaignRollup(campaign);
  if (emailsSent > 0) {
    requireClose(
      reportedReplyRate,
      (replies / emailsSent) * 100,
      'Explee overall_reply_rate_pct',
    );
  }

  const metrics = [
    { name: 'campaignsCurrent', value: campaigns.length, date: observationDate },
    { name: 'emailsSentLifetime', value: emailsSent, date: observationDate },
    { name: 'repliesLifetime', value: replies, date: observationDate },
    { name: 'hotLeadsLifetime', value: hotLeads, date: observationDate },
    { name: 'spendUsdLifetime', value: spendUsd, date: observationDate },
  ];
  // Provider returns zero for undefined ratios. Recompute from real components
  // and omit the metric when the denominator is zero; scope evidence below
  // makes that omission authoritative rather than falling back to an old ratio.
  if (emailsSent > 0) {
    metrics.push({
      name: 'replyRatePctLifetime',
      value: (replies / emailsSent) * 100,
      date: observationDate,
    });
  }
  if (hotLeads > 0) {
    metrics.push({
      name: 'costPerHotLeadUsdLifetime',
      value: spendUsd / hotLeads,
      date: observationDate,
    });
  }

  return {
    source: 'explee',
    date: observationDate,
    metrics,
    attemptedDates: [observationDate],
    restatedScopes: SNAPSHOT_METRICS.map((metricName) => ({
      metricDate: observationDate,
      metricName,
    })),
    provenance: 'Explee AutoGTM · provider-native lifetime snapshot',
  };
}
