/**
 * PageSpeed Adapter — Google PageSpeed Insights.
 *
 * Point-in-time source for Web/SEO health. The collector stores the latest
 * snapshot under `source=pagespeed`; aggregation rules keep these metrics as
 * `latest`, so weekly collection does not sum scores across days.
 */

import { pointInTimeMetricDate } from '../adapter-date-range.js';

const PSI_BASE = 'https://www.googleapis.com/pagespeedonline/v5/runPagespeed';
const CATEGORIES = ['performance', 'seo', 'accessibility', 'best-practices'];
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isCalendarDate(value) {
  if (!ISO_DATE_RE.test(value || '')) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function resolveUrl(config, env) {
  const slugUpper = (config._slug || '').toUpperCase().replace(/-/g, '_');
  return (
    config.url ||
    config.clientUrl ||
    config.siteUrl ||
    config.website ||
    config._client?.url ||
    config._client?.website ||
    env[`${slugUpper}_PAGESPEED_URL`] ||
    env[`${slugUpper}_CLIENT_URL`] ||
    env[`${slugUpper}_SITE_URL`] ||
    env[`${slugUpper}_WEBSITE_URL`] ||
    env.PAGESPEED_URL ||
    env.CLIENT_URL ||
    env.SITE_URL ||
    env.WEBSITE_URL ||
    ''
  ).trim();
}

function normalizeUrl(value) {
  if (!value) return '';
  return value.startsWith('http') ? value : `https://${value}`;
}

function firstFinite(...values) {
  for (const value of values) {
    if (value == null || value === '') continue;
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function scoreToPercent(value) {
  const score = firstFinite(value);
  return score == null ? null : Math.round(score * 100);
}

function secondsFromMs(value) {
  const milliseconds = firstFinite(value);
  return milliseconds == null ? null : Number((milliseconds / 1000).toFixed(1));
}

async function fetchStrategy(url, strategy, apiKey) {
  const params = new URLSearchParams({ url, strategy });
  for (const category of CATEGORIES) params.append('category', category);
  if (apiKey) params.set('key', apiKey);

  const resp = await fetch(`${PSI_BASE}?${params.toString()}`);
  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error(`PageSpeed ${strategy} ${resp.status}: ${text.slice(0, 200)}`);
  }
  const data = await resp.json();
  const cats = data.lighthouseResult?.categories || {};
  const audits = data.lighthouseResult?.audits || {};
  // Keep every value in this payload on one provenance contract: Lighthouse
  // laboratory measurements from this exact pull. CrUX `loadingExperience`
  // is a rolling field-data window and must never silently replace a missing
  // Lighthouse audit under the same metric name.
  const inp = firstFinite(audits['interaction-to-next-paint']?.numericValue);
  return {
    performance: scoreToPercent(cats.performance?.score),
    seo: scoreToPercent(cats.seo?.score),
    accessibility: scoreToPercent(cats.accessibility?.score),
    bestPractices: scoreToPercent(cats['best-practices']?.score),
    lcp: secondsFromMs(audits['largest-contentful-paint']?.numericValue),
    cls: (() => {
      const value = firstFinite(audits['cumulative-layout-shift']?.numericValue);
      return value == null ? null : Number(value.toFixed(3));
    })(),
    tbt: (() => {
      const value = firstFinite(audits['total-blocking-time']?.numericValue);
      return value == null ? null : Math.round(value);
    })(),
    inp: inp == null ? null : Math.round(inp),
  };
}

function metricIfFinite(name, value, date) {
  return Number.isFinite(value) ? [{ name, value, date }] : [];
}

/**
 * @param {object} config
 * @param {Record<string, string>} env
 * @param {{ from: string, to: string }} dateRange
 */
export async function collect(config, env, dateRange) {
  const from = dateRange?.from;
  const to = dateRange?.to;
  if (!isCalendarDate(from) || !isCalendarDate(to)) {
    throw new Error(`PageSpeed: invalid date range ${from || '?'}..${to || '?'}`);
  }
  if (from > to) {
    throw new Error(`PageSpeed: invalid date range ${from}..${to}; from must not be after to`);
  }
  if (from !== to) {
    throw new Error('PageSpeed: multi-day ranges are not supported safely; collect one day at a time');
  }

  const clientUrl = normalizeUrl(resolveUrl(config, env));
  if (!clientUrl) {
    throw new Error('PageSpeed: missing client URL in clients.json, integrations.json or *_SITE_URL env');
  }

  const slugUpper = (config._slug || '').toUpperCase().replace(/-/g, '_');
  const apiKey = env[`${slugUpper}_PAGESPEED_API_KEY`] || env.PAGESPEED_API_KEY || '';
  const metricDate = pointInTimeMetricDate(config, dateRange);
  const [mobile, desktop] = await Promise.all([
    fetchStrategy(clientUrl, 'mobile', apiKey),
    fetchStrategy(clientUrl, 'desktop', apiKey),
  ]);

  const metricNames = [
    'performance_mobile',
    'seo_mobile',
    'accessibility_mobile',
    'best_practices_mobile',
    'lcp_mobile',
    'cls_mobile',
    'tbt_mobile',
    'inp_mobile',
    'performance_desktop',
    'seo_desktop',
    'accessibility_desktop',
    'best_practices_desktop',
    'lcp_desktop',
    'cls_desktop',
    'tbt_desktop',
    'inp_desktop',
  ];
  const metrics = [
    ...metricIfFinite('performance_mobile', mobile.performance, metricDate),
    ...metricIfFinite('seo_mobile', mobile.seo, metricDate),
    ...metricIfFinite('accessibility_mobile', mobile.accessibility, metricDate),
    ...metricIfFinite('best_practices_mobile', mobile.bestPractices, metricDate),
    ...metricIfFinite('lcp_mobile', mobile.lcp, metricDate),
    ...metricIfFinite('cls_mobile', mobile.cls, metricDate),
    ...metricIfFinite('tbt_mobile', mobile.tbt, metricDate),
    ...metricIfFinite('inp_mobile', mobile.inp, metricDate),
    ...metricIfFinite('performance_desktop', desktop.performance, metricDate),
    ...metricIfFinite('seo_desktop', desktop.seo, metricDate),
    ...metricIfFinite('accessibility_desktop', desktop.accessibility, metricDate),
    ...metricIfFinite('best_practices_desktop', desktop.bestPractices, metricDate),
    ...metricIfFinite('lcp_desktop', desktop.lcp, metricDate),
    ...metricIfFinite('cls_desktop', desktop.cls, metricDate),
    ...metricIfFinite('tbt_desktop', desktop.tbt, metricDate),
    ...metricIfFinite('inp_desktop', desktop.inp, metricDate),
  ];

  return {
    source: 'pagespeed',
    date: metricDate,
    metrics,
    // PageSpeed is point-in-time. During an explicit historical repair its real
    // observation day differs from the requested range and must stay exact.
    attemptedDates: [metricDate],
    restatedScopes: metricNames.map((metricName) => ({ metricDate, metricName })),
  };
}
