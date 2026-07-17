/**
 * Instantly Adapter — Cold email analytics via Instantly.ai API
 *
 * Pulls: emails sent, opens, replies, meetings.
 * Auth: API key from {SLUG}_INSTANTLY_API_KEY
 */

const BASE_URL = 'https://api.instantly.ai/api/v2';
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;

const DAILY_METRICS = [
  ['emailsSent', 'sent'],
  ['contacted', 'contacted'],
  ['newLeadsContacted', 'new_leads_contacted'],
  ['opens', 'opened'],
  ['uniqueOpens', 'unique_opened'],
  ['replies', 'replies'],
  ['uniqueReplies', 'unique_replies'],
  ['autoReplies', 'replies_automatic'],
  ['clicks', 'clicks'],
  ['uniqueClicks', 'unique_clicks'],
  ['opportunities', 'opportunities'],
];

function isCalendarDate(value) {
  if (typeof value !== 'string' || !DATE_RE.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function datesInRange(dateRange) {
  if (!isCalendarDate(dateRange.from) || !isCalendarDate(dateRange.to) || dateRange.from > dateRange.to) {
    throw new Error(`Instantly: invalid date range ${dateRange.from}..${dateRange.to}`);
  }
  const start = Date.parse(`${dateRange.from}T00:00:00Z`);
  const end = Date.parse(`${dateRange.to}T00:00:00Z`);
  const days = Math.floor((end - start) / DAY_MS) + 1;
  if (days > 366) throw new Error('Instantly: date range cannot exceed 366 days');
  return Array.from({ length: days }, (_, index) =>
    new Date(start + index * DAY_MS).toISOString().slice(0, 10));
}

function metricValue(row, field) {
  if (!Object.hasOwn(row, field)) return null;
  const raw = row[field];
  if (raw == null || raw === '') return null;
  const value = Number(raw);
  if (!Number.isFinite(value)) {
    throw new Error(`Instantly campaign analytics: invalid numeric ${field}`);
  }
  return value;
}

/**
 * @param {object} config - From integrations.json
 * @param {object} env - { {SLUG}_INSTANTLY_API_KEY: "..." }
 * @param {{ from: string, to: string }} dateRange
 */
export async function collect(config, env, dateRange) {
  const slugUpper = (config._slug || '').toUpperCase().replace(/-/g, '_');
  const apiKey = env[`${slugUpper}_INSTANTLY_API_KEY`] || env.INSTANTLY_API_KEY;

  if (!apiKey) {
    throw new Error('Instantly: missing INSTANTLY_API_KEY in .env');
  }

  const headers = {
    'Authorization': `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  };

  // --- Daily campaign analytics (all campaigns) ---
  const dates = datesInRange(dateRange);
  const params = new URLSearchParams({
    start_date: dateRange.from,
    end_date: dateRange.to,
  });
  const analyticsResp = await fetch(`${BASE_URL}/campaigns/analytics/daily?${params.toString()}`, { headers });
  if (!analyticsResp.ok) {
    const detail = await analyticsResp.text().catch(() => '');
    throw new Error(
      `Instantly campaign analytics HTTP ${analyticsResp.status}${detail ? `: ${detail.slice(0, 200)}` : ''}`,
    );
  }

  const rows = await analyticsResp.json();
  if (!Array.isArray(rows)) {
    throw new Error('Instantly campaign analytics: response was not an array');
  }

  const rowsByDate = new Map();
  for (const row of rows) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) {
      throw new Error('Instantly campaign analytics: row was not an object');
    }
    const date = row.date;
    if (!isCalendarDate(date) || date < dateRange.from || date > dateRange.to) {
      throw new Error(`Instantly campaign analytics: invalid row date ${String(date)}`);
    }
    const dateRows = rowsByDate.get(date) || [];
    dateRows.push(row);
    rowsByDate.set(date, dateRows);
  }

  // The daily endpoint legitimately omits days with no activity. Emit explicit
  // zeros for every requested day so a successful empty response is recorded as
  // healthy and can replace stale rows from an earlier bad import.
  const metrics = [];
  let partial = false;
  for (const date of dates) {
    const dateRows = rowsByDate.get(date) || [];
    if (!dateRows.length) {
      for (const [name] of DAILY_METRICS) metrics.push({ name, value: 0, date });
      continue;
    }
    // The endpoint is already daily and exposes no campaign identity. Multiple
    // rows for one day are therefore ambiguous, not campaign rows that can be
    // safely added together. Retain prior data as partial instead of inflating it.
    if (dateRows.length > 1) {
      partial = true;
      continue;
    }
    const row = dateRows[0];
    for (const [name, field] of DAILY_METRICS) {
      const value = metricValue(row, field);
      if (value == null) {
        partial = true;
        continue;
      }
      metrics.push({ name, value, date });
    }
  }

  return {
    source: 'instantly',
    date: dateRange.from,
    metrics,
    attemptedDates: dates,
    restatedScopes: dates.flatMap((metricDate) =>
      DAILY_METRICS.map(([metricName]) => ({ metricDate, metricName }))),
    ...(partial ? { quality: 'partial' } : {}),
  };
}
