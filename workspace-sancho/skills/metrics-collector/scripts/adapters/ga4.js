/**
 * GA4 Adapter — Google Analytics 4 Data API
 *
 * Uses service account auth + REST API to analyticsdata.googleapis.com
 * Pulls: sessions, totalUsers, newUsers, bounceRate, averageSessionDuration, conversions
 */

import { GoogleAuth } from 'google-auth-library';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SA_PATH = path.resolve(__dirname, '..', '..', '..', '..', '.secrets', 'google-service-account.json');

const METRICS = [
  'sessions',
  'totalUsers',
  'newUsers',
  'bounceRate',
  'averageSessionDuration',
  'conversions',
];

/**
 * @param {object} config - From integrations.json (e.g. { propertyId: "123456789" })
 * @param {object} env - From .env
 * @param {{ from: string, to: string }} dateRange
 * @returns {{ metrics: Array<{ name: string, value: number, date: string }> }}
 */
export async function collect(config, env, dateRange) {
  const propertyId = config.propertyId;
  if (!propertyId) {
    throw new Error('GA4: missing propertyId in integrations.json');
  }

  const auth = new GoogleAuth({
    keyFile: SA_PATH,
    scopes: ['https://www.googleapis.com/auth/analytics.readonly'],
  });

  const client = await auth.getClient();
  const token = await client.getAccessToken();

  const url = `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`;

  const body = {
    dateRanges: [
      {
        startDate: dateRange.from,
        endDate: dateRange.to,
      },
    ],
    metrics: METRICS.map((m) => ({ name: m })),
    dimensions: [{ name: 'date' }],
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`GA4 API ${response.status}: ${text}`);
  }

  const data = await response.json();
  const metrics = [];

  if (data.rows) {
    for (const row of data.rows) {
      const date = row.dimensionValues?.[0]?.value; // YYYYMMDD format
      const formattedDate = date
        ? `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}`
        : dateRange.from;

      row.metricValues?.forEach((val, idx) => {
        metrics.push({
          name: METRICS[idx],
          value: parseFloat(val.value) || 0,
          date: formattedDate,
        });
      });
    }
  }

  return { source: 'ga4', date: dateRange.from, metrics };
}
