/**
 * GSC Adapter — Google Search Console API
 *
 * Uses service account auth. Pulls: clicks, impressions, ctr, position by query and page.
 */

import { GoogleAuth } from 'google-auth-library';
import { resolveGoogleServiceAccountPath } from './google-auth-path.js';
import {
  buildGscQueryBody,
  gscDatesInRange,
  gscRestatementScopes,
  gscRowsToMetrics,
} from '../gsc-metrics.js';

const SA_PATH = resolveGoogleServiceAccountPath(import.meta.url);

/**
 * @param {object} config - { siteUrl: "https://example.com" }
 * @param {object} env
 * @param {{ from: string, to: string }} dateRange
 */
export async function collect(config, env, dateRange) {
  const siteUrl = config.siteUrl || config.SITE_URL || config.site_url;
  if (!siteUrl) {
    throw new Error('GSC: missing siteUrl in integrations.json');
  }

  const auth = new GoogleAuth({
    keyFile: SA_PATH,
    scopes: ['https://www.googleapis.com/auth/webmasters.readonly'],
  });

  const client = await auth.getClient();
  const token = await client.getAccessToken();

  const metrics = [];

  // --- Totals ---
  const totalsData = await queryGSC(token.token, siteUrl, dateRange);
  metrics.push(...gscRowsToMetrics(totalsData.rows, dateRange, null, { fillMissingDates: true }));

  // --- By query (top 20) ---
  const queryData = await queryGSC(token.token, siteUrl, dateRange, 'query');
  metrics.push(...gscRowsToMetrics(queryData.rows, dateRange, 'query'));

  // --- By page (top 20) ---
  const pageData = await queryGSC(token.token, siteUrl, dateRange, 'page');
  metrics.push(...gscRowsToMetrics(pageData.rows, dateRange, 'page'));

  return {
    source: 'gsc',
    date: dateRange.from,
    metrics,
    attemptedDates: gscDatesInRange(dateRange),
    // CTR/position are undefined on a zero-impression day. The explicit owned
    // scopes let a clean empty result remove yesterday's stale derived values.
    restatedScopes: gscRestatementScopes(dateRange),
  };
}

async function queryGSC(token, siteUrl, dateRange, breakdown = null) {
  const encodedSite = encodeURIComponent(siteUrl);
  const url = `https://www.googleapis.com/webmasters/v3/sites/${encodedSite}/searchAnalytics/query`;

  const body = buildGscQueryBody(dateRange, breakdown);

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`GSC API ${response.status}: ${text}`);
  }

  return response.json();
}
