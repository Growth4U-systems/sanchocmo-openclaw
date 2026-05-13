/**
 * GSC Adapter — Google Search Console API
 *
 * Uses service account auth. Pulls: clicks, impressions, ctr, position by query and page.
 */

import { GoogleAuth } from 'google-auth-library';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SA_PATH = path.resolve(__dirname, '..', '..', '..', '..', '.secrets', 'google-service-account.json');

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
  const totalsData = await queryGSC(token.token, siteUrl, dateRange, []);
  if (totalsData.rows?.length) {
    for (const row of totalsData.rows) {
      metrics.push(
        { name: 'clicks', value: row.clicks, date: dateRange.from },
        { name: 'impressions', value: row.impressions, date: dateRange.from },
        { name: 'ctr', value: Math.round(row.ctr * 10000) / 100, date: dateRange.from },
        { name: 'position', value: Math.round(row.position * 100) / 100, date: dateRange.from },
      );
    }
  }

  // --- By query (top 20) ---
  const queryData = await queryGSC(token.token, siteUrl, dateRange, ['query'], 20);
  if (queryData.rows) {
    for (const row of queryData.rows) {
      const query = row.keys?.[0] || 'unknown';
      metrics.push(
        { name: 'clicks', value: row.clicks, date: dateRange.from, dimensions: { query } },
        { name: 'impressions', value: row.impressions, date: dateRange.from, dimensions: { query } },
        { name: 'ctr', value: Math.round(row.ctr * 10000) / 100, date: dateRange.from, dimensions: { query } },
        { name: 'position', value: Math.round(row.position * 100) / 100, date: dateRange.from, dimensions: { query } },
      );
    }
  }

  // --- By page (top 20) ---
  const pageData = await queryGSC(token.token, siteUrl, dateRange, ['page'], 20);
  if (pageData.rows) {
    for (const row of pageData.rows) {
      const page = row.keys?.[0] || 'unknown';
      metrics.push(
        { name: 'clicks', value: row.clicks, date: dateRange.from, dimensions: { page } },
        { name: 'impressions', value: row.impressions, date: dateRange.from, dimensions: { page } },
        { name: 'ctr', value: Math.round(row.ctr * 10000) / 100, date: dateRange.from, dimensions: { page } },
        { name: 'position', value: Math.round(row.position * 100) / 100, date: dateRange.from, dimensions: { page } },
      );
    }
  }

  return { source: 'gsc', date: dateRange.from, metrics };
}

async function queryGSC(token, siteUrl, dateRange, dimensions = [], rowLimit = 1) {
  const encodedSite = encodeURIComponent(siteUrl);
  const url = `https://www.googleapis.com/webmasters/v3/sites/${encodedSite}/searchAnalytics/query`;

  const body = {
    startDate: dateRange.from,
    endDate: dateRange.to,
    dimensions,
    rowLimit,
  };

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
