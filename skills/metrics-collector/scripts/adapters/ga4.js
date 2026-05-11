/**
 * GA4 Adapter — Google Analytics 4 Data API
 *
 * Uses service account auth + REST API to analyticsdata.googleapis.com
 * Collects:
 *   - Totals: sessions, users, newUsers, bounceRate, avgDuration, conversions, pageviews, engagedSessions
 *   - By channel group: sessions, users per channel (Direct, Organic Social, Organic Search, Paid Social, Referral...)
 *   - Top pages: pageviews, duration, engagement rate
 *   - By device: sessions, bounce rate
 */

import { GoogleAuth } from 'google-auth-library';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SA_PATH = path.resolve(__dirname, '..', '..', '..', '..', '.secrets', 'google-service-account.json');

async function runReport(token, propertyId, body) {
  const url = `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`GA4 API ${resp.status}: ${text.slice(0, 200)}`);
  }
  return resp.json();
}

export async function collect(config, env, dateRange) {
  const propertyId = config.propertyId || config.PROPERTY_ID;
  if (!propertyId) throw new Error('GA4: missing propertyId in integrations.json');

  const auth = new GoogleAuth({ keyFile: SA_PATH, scopes: ['https://www.googleapis.com/auth/analytics.readonly'] });
  const client = await auth.getClient();
  const token = (await client.getAccessToken()).token;

  const dr = [{ startDate: dateRange.from, endDate: dateRange.to }];
  const metrics = [];

  // --- Totals ---
  const TOTAL_METRICS = ['sessions', 'totalUsers', 'newUsers', 'bounceRate', 'averageSessionDuration', 'conversions', 'screenPageViews', 'engagedSessions', 'engagementRate'];
  const totals = await runReport(token, propertyId, {
    dateRanges: dr,
    metrics: TOTAL_METRICS.map(m => ({ name: m })),
  });
  if (totals.rows?.[0]) {
    totals.rows[0].metricValues?.forEach((val, idx) => {
      metrics.push({ name: TOTAL_METRICS[idx], value: parseFloat(val.value) || 0, date: dateRange.from });
    });
  }

  // --- By Channel Group ---
  try {
    const byChannel = await runReport(token, propertyId, {
      dateRanges: dr,
      metrics: [{ name: 'sessions' }, { name: 'totalUsers' }, { name: 'newUsers' }, { name: 'engagedSessions' }, { name: 'screenPageViews' }],
      dimensions: [{ name: 'sessionDefaultChannelGroup' }],
      orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
      limit: 10,
    });
    for (const row of byChannel.rows || []) {
      const channel = row.dimensionValues[0].value;
      const [ses, usr, nu, eng, pv] = row.metricValues.map(v => parseFloat(v.value) || 0);
      metrics.push(
        { name: 'sessions', value: ses, date: dateRange.from, dimensions: { channel } },
        { name: 'totalUsers', value: usr, date: dateRange.from, dimensions: { channel } },
        { name: 'newUsers', value: nu, date: dateRange.from, dimensions: { channel } },
        { name: 'engagedSessions', value: eng, date: dateRange.from, dimensions: { channel } },
        { name: 'screenPageViews', value: pv, date: dateRange.from, dimensions: { channel } },
      );
    }
  } catch (err) {
    console.warn(`  ⚠️  GA4 channel breakdown error: ${err.message}`);
  }

  // --- Top Pages ---
  try {
    const topPages = await runReport(token, propertyId, {
      dateRanges: dr,
      metrics: [{ name: 'screenPageViews' }, { name: 'averageSessionDuration' }, { name: 'engagementRate' }],
      dimensions: [{ name: 'pagePath' }],
      orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }],
      limit: 15,
    });
    for (const row of topPages.rows || []) {
      const page = row.dimensionValues[0].value;
      const [pv, dur, eng] = row.metricValues.map(v => parseFloat(v.value) || 0);
      metrics.push({
        name: 'topPage',
        value: pv,
        date: dateRange.from,
        dimensions: { page, duration: Math.round(dur), engagementRate: Math.round(eng * 100) },
      });
    }
  } catch (err) {
    console.warn(`  ⚠️  GA4 top pages error: ${err.message}`);
  }

  // --- By Device ---
  try {
    const byDevice = await runReport(token, propertyId, {
      dateRanges: dr,
      metrics: [{ name: 'sessions' }, { name: 'bounceRate' }, { name: 'engagementRate' }],
      dimensions: [{ name: 'deviceCategory' }],
    });
    for (const row of byDevice.rows || []) {
      const device = row.dimensionValues[0].value;
      const [ses, bounce, eng] = row.metricValues.map(v => parseFloat(v.value) || 0);
      metrics.push(
        { name: 'sessions', value: ses, date: dateRange.from, dimensions: { device } },
        { name: 'bounceRate', value: bounce, date: dateRange.from, dimensions: { device } },
        { name: 'engagementRate', value: eng, date: dateRange.from, dimensions: { device } },
      );
    }
  } catch (err) {
    console.warn(`  ⚠️  GA4 device breakdown error: ${err.message}`);
  }

  return { source: 'ga4', date: dateRange.from, metrics };
}
