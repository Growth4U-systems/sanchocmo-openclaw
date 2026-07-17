/**
 * GA4 Adapter — Google Analytics 4 Data API
 *
 * Uses service account auth + REST API to analyticsdata.googleapis.com.
 * Each requested GA4 property-calendar day is queried independently so multi-day backfills never
 * assign a range aggregate to the first day. See ../ga4-metrics.js.
 */

import { GoogleAuth } from 'google-auth-library';
import { collectGa4Result } from '../ga4-metrics.js';
import { resolveGoogleServiceAccountPath } from './google-auth-path.js';

const SA_PATH = resolveGoogleServiceAccountPath(import.meta.url);

async function runReport(token, propertyId, body) {
  const url = `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
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
  if (!propertyId) {
    throw new Error('GA4: missing propertyId in integrations.json');
  }

  const auth = new GoogleAuth({
    keyFile: SA_PATH,
    scopes: ['https://www.googleapis.com/auth/analytics.readonly'],
  });
  const client = await auth.getClient();
  const token = (await client.getAccessToken()).token;
  if (!token) {
    throw new Error('GA4: service account did not return an access token');
  }

  const result = await collectGa4Result(
    token,
    propertyId,
    dateRange,
    runReport,
  );
  return {
    source: 'ga4',
    date: dateRange.from,
    metrics: result.metrics,
    attemptedDates: result.attemptedDates,
    restatedScopes: result.restatedScopes,
    ...(result.quality ? { quality: result.quality } : {}),
  };
}
