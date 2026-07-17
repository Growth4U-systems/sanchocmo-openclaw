import assert from 'node:assert/strict';
import test from 'node:test';

import { collect } from '../google-ads.js';

const BASE_CONFIG = { _slug: 'growth4u', customerId: '123-456-7890' };
const BASE_ENV = {
  GROWTH4U_GOOGLE_ADS_DEVELOPER_TOKEN: 'dev-token',
  GROWTH4U_GOOGLE_ADS_CLIENT_ID: 'client-id',
  GROWTH4U_GOOGLE_ADS_CLIENT_SECRET: 'client-secret',
  GROWTH4U_GOOGLE_ADS_REFRESH_TOKEN: 'refresh-token',
};
const ONE_DAY = { from: '2026-06-27', to: '2026-06-27' };

test('Google Ads adapter collects totals, campaign rows and share metrics', async () => {
  const calls = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    if (String(url).includes('oauth2.googleapis.com/token')) {
      assert.match(String(options.body), /refresh_token=refresh-token/);
      return Response.json({ access_token: 'access-token' });
    }
    assert.equal(options.headers.Authorization, 'Bearer access-token');
    assert.equal(options.headers['developer-token'], 'dev-token');
    assert.equal(options.headers['login-customer-id'], '9998887777');

    const body = JSON.parse(String(options.body));
    if (body.query.includes('FROM customer')) {
      return Response.json([
        {
          results: [
            {
              metrics: {
                costMicros: '150000000',
                impressions: '1500',
                clicks: '150',
                conversions: 5,
                conversionsValue: 450,
                searchImpressionShare: 0.5,
                searchRankLostImpressionShare: 0.1,
                searchBudgetLostImpressionShare: 0.05,
              },
            },
          ],
        },
      ]);
    }
    return Response.json([
      {
        results: [
          {
            campaign: { id: '1', name: 'Search A', advertisingChannelType: 'SEARCH' },
            metrics: {
              costMicros: '100000000',
              impressions: '1000',
              clicks: '100',
              conversions: 4,
              conversionsValue: 400,
              searchImpressionShare: 0.6,
              searchRankLostImpressionShare: 0.08,
              searchBudgetLostImpressionShare: 0.04,
            },
          },
          {
            campaign: { id: '2', name: 'Search B', advertisingChannelType: 'SEARCH' },
            metrics: {
              costMicros: '40000000',
              impressions: '400',
              clicks: '40',
              conversions: 1,
              conversionsValue: 50,
            },
          },
        ],
      },
    ]);
  };

  try {
    const result = await collect(
      { _slug: 'growth4u', customerId: '123-456-7890', loginCustomerId: '999-888-7777' },
      {
        GROWTH4U_GOOGLE_ADS_DEVELOPER_TOKEN: 'dev-token',
        GROWTH4U_GOOGLE_ADS_CLIENT_ID: 'client-id',
        GROWTH4U_GOOGLE_ADS_CLIENT_SECRET: 'client-secret',
        GROWTH4U_GOOGLE_ADS_REFRESH_TOKEN: 'refresh-token',
      },
      { from: '2026-06-27', to: '2026-06-27' },
    );

    assert.equal(result.source, 'google_ads');
    const totals = result.metrics.filter((m) => !m.dimensions);
    assert.equal(totals.find((m) => m.name === 'spend')?.value, 150);
    assert.equal(totals.find((m) => m.name === 'clicks')?.value, 150);
    assert.equal(totals.find((m) => m.name === 'ctr')?.value, 10);
    assert.equal(totals.find((m) => m.name === 'conversions')?.value, 5);
    assert.equal(totals.find((m) => m.name === 'leads')?.value, 5);
    assert.equal(totals.find((m) => m.name === 'revenue')?.value, 450);
    assert.equal(totals.find((m) => m.name === 'roas')?.value, 3);
    assert.equal(totals.find((m) => m.name === 'impressionShare')?.value, 50);
    assert.equal(totals.find((m) => m.name === 'lostImpressionShare')?.value, 15);

    const campaignSpend = result.metrics.find((m) => m.name === 'spend' && m.dimensions?.campaign === 'Search A');
    assert.equal(campaignSpend?.value, 100);
    assert.ok(calls.some((call) => call.url.includes('/v24/customers/1234567890/googleAds:searchStream')));
    const queryBodies = calls
      .filter((call) => call.url.includes('googleAds:searchStream'))
      .map((call) => JSON.parse(String(call.options.body)).query);
    assert.ok(queryBodies.every((query) => query.includes('segments.date')));
    assert.ok(queryBodies.every((query) => !query.includes('LIMIT 100')));
    assert.ok(queryBodies.some((query) => query.includes('FROM customer')));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Google Ads emits account and campaign metrics on each real day of a multi-day range', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options = {}) => {
    if (String(url).includes('oauth2.googleapis.com/token')) {
      return Response.json({ access_token: 'access-token' });
    }
    const query = JSON.parse(String(options.body)).query;
    if (query.includes('FROM customer')) {
      return Response.json([{
        results: [
          {
            segments: { date: '2026-06-27' },
            metrics: { costMicros: '100000000', impressions: '1000', clicks: '100' },
          },
          {
            segments: { date: '2026-06-28' },
            metrics: { costMicros: '50000000', impressions: '500', clicks: '50', conversionsValue: 100 },
          },
        ],
      }]);
    }
    return Response.json([{
      results: [
        {
          campaign: { id: '1', name: 'Search A', advertisingChannelType: 'SEARCH' },
          segments: { date: '2026-06-27' },
          metrics: { costMicros: '100000000', impressions: '1000', clicks: '100' },
        },
        {
          campaign: { id: '1', name: 'Search A', advertisingChannelType: 'SEARCH' },
          segments: { date: '2026-06-28' },
          metrics: { costMicros: '50000000', impressions: '500', clicks: '50', conversionsValue: 100 },
        },
      ],
    }]);
  };

  try {
    const result = await collect(
      { _slug: 'growth4u', customerId: '123-456-7890' },
      {
        GROWTH4U_GOOGLE_ADS_DEVELOPER_TOKEN: 'dev-token',
        GROWTH4U_GOOGLE_ADS_CLIENT_ID: 'client-id',
        GROWTH4U_GOOGLE_ADS_CLIENT_SECRET: 'client-secret',
        GROWTH4U_GOOGLE_ADS_REFRESH_TOKEN: 'refresh-token',
      },
      { from: '2026-06-27', to: '2026-06-28' },
    );
    assert.deepEqual(
      result.metrics.filter((metric) => metric.name === 'spend' && !metric.dimensions)
        .map((metric) => [metric.date, metric.value]),
      [['2026-06-27', 100], ['2026-06-28', 50]],
    );
    assert.deepEqual(
      result.metrics.filter((metric) => metric.name === 'roas' && !metric.dimensions)
        .map((metric) => [metric.date, metric.value]),
      [['2026-06-27', 0], ['2026-06-28', 2]],
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Google Ads emits explicit zero outcomes and ROAS for valid rows with spend', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options = {}) => {
    if (String(url).includes('oauth2.googleapis.com/token')) {
      return Response.json({ access_token: 'access-token' });
    }
    const body = JSON.parse(String(options.body));
    if (body.query.includes('FROM customer')) {
      return Response.json([{
        results: [{
          metrics: { costMicros: '100000000', impressions: '1000', clicks: '100' },
        }],
      }]);
    }
    return Response.json([{
      results: [{
        campaign: { id: '1', name: 'Search A', advertisingChannelType: 'SEARCH' },
        metrics: {
          costMicros: '100000000',
          impressions: '1000',
          clicks: '100',
          // Zero-valued protobuf fields may be absent from the REST JSON row.
        },
      }],
    }]);
  };

  try {
    const result = await collect(
      { _slug: 'growth4u', customerId: '123-456-7890' },
      {
        GROWTH4U_GOOGLE_ADS_DEVELOPER_TOKEN: 'dev-token',
        GROWTH4U_GOOGLE_ADS_CLIENT_ID: 'client-id',
        GROWTH4U_GOOGLE_ADS_CLIENT_SECRET: 'client-secret',
        GROWTH4U_GOOGLE_ADS_REFRESH_TOKEN: 'refresh-token',
      },
      { from: '2026-06-27', to: '2026-06-27' },
    );
    const totals = Object.fromEntries(
      result.metrics.filter((metric) => !metric.dimensions).map((metric) => [metric.name, metric.value]),
    );

    assert.equal(totals.spend, 100);
    assert.equal(totals.conversions, 0);
    assert.equal(totals.leads, 0);
    assert.equal(totals.revenue, 0);
    assert.equal(totals.roas, 0);

    const campaign = Object.fromEntries(
      result.metrics
        .filter((metric) => metric.dimensions?.campaign === 'Search A')
        .map((metric) => [metric.name, metric.value]),
    );
    assert.equal(campaign.conversions, 0);
    assert.equal(campaign.leads, 0);
    assert.equal(campaign.revenue, 0);
    assert.equal(campaign.roas, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Google Ads emits additive account zeros for a missing day in a multi-day response', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options = {}) => {
    if (String(url).includes('oauth2.googleapis.com/token')) {
      return Response.json({ access_token: 'access-token' });
    }
    const query = JSON.parse(String(options.body)).query;
    if (query.includes('FROM customer')) {
      return Response.json([{ results: [{
        segments: { date: '2026-06-27' },
        metrics: { costMicros: '1000000', impressions: '10', clicks: '1' },
      }] }]);
    }
    return Response.json([{ results: [{
      campaign: { id: '1', name: 'Search A', advertisingChannelType: 'SEARCH' },
      segments: { date: '2026-06-27' },
      metrics: { costMicros: '1000000', impressions: '10', clicks: '1' },
    }] }]);
  };

  try {
    const result = await collect(
      { _slug: 'growth4u', customerId: '123-456-7890' },
      {
        GROWTH4U_GOOGLE_ADS_DEVELOPER_TOKEN: 'dev-token',
        GROWTH4U_GOOGLE_ADS_CLIENT_ID: 'client-id',
        GROWTH4U_GOOGLE_ADS_CLIENT_SECRET: 'client-secret',
        GROWTH4U_GOOGLE_ADS_REFRESH_TOKEN: 'refresh-token',
      },
      { from: '2026-06-27', to: '2026-06-28' },
    );
    const missingDay = Object.fromEntries(
      result.metrics
        .filter((metric) => metric.date === '2026-06-28' && !metric.dimensions)
        .map((metric) => [metric.name, metric.value]),
    );
    assert.deepEqual(missingDay, {
      spend: 0,
      impressions: 0,
      clicks: 0,
      conversions: 0,
      leads: 0,
      revenue: 0,
    });
    assert.equal(missingDay.ctr, undefined);
    assert.equal(missingDay.cpc, undefined);
    assert.equal(missingDay.roas, undefined);
    assert.deepEqual(result.attemptedDates, ['2026-06-27', '2026-06-28']);
    const missingDayScopes = result.restatedScopes
      .filter((scope) => scope.metricDate === '2026-06-28')
      .map((scope) => scope.metricName);
    for (const metricName of ['ctr', 'cpc', 'roas', 'impressionShare', 'lostImpressionShare']) {
      assert.equal(missingDayScopes.includes(metricName), true, `${metricName} must be restated`);
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Google Ads rejects malformed provider numbers instead of coercing them to zero', async (t) => {
  t.mock.method(globalThis, 'fetch', async (url, options = {}) => {
    if (String(url).includes('oauth2.googleapis.com/token')) {
      return Response.json({ access_token: 'access-token' });
    }
    const query = JSON.parse(String(options.body)).query;
    if (query.includes('FROM customer')) {
      return Response.json([{ results: [{ metrics: {
        costMicros: 'not-a-number', impressions: '10', clicks: '1',
      } }] }]);
    }
    return Response.json([{ results: [] }]);
  });

  await assert.rejects(
    () => collect(BASE_CONFIG, BASE_ENV, ONE_DAY),
    /invalid metrics\.costMicros/,
  );
});

test('Google Ads rejects malformed stream shapes and ambiguous account totals', async (t) => {
  t.mock.method(globalThis, 'fetch', async (url, options = {}) => {
    if (String(url).includes('oauth2.googleapis.com/token')) {
      return Response.json({ access_token: 'access-token' });
    }
    const query = JSON.parse(String(options.body)).query;
    if (query.includes('FROM customer')) return Response.json({ results: [] });
    return Response.json([{ results: [] }]);
  });
  await assert.rejects(
    () => collect(BASE_CONFIG, BASE_ENV, ONE_DAY),
    /malformed searchStream payload/,
  );

  t.mock.restoreAll();
  t.mock.method(globalThis, 'fetch', async (url, options = {}) => {
    if (String(url).includes('oauth2.googleapis.com/token')) {
      return Response.json({ access_token: 'access-token' });
    }
    const query = JSON.parse(String(options.body)).query;
    if (query.includes('FROM customer')) {
      return Response.json([{ results: [
        { metrics: { costMicros: '1', impressions: '1', clicks: '1' } },
        { metrics: { costMicros: '2', impressions: '2', clicks: '2' } },
      ] }]);
    }
    return Response.json([{ results: [] }]);
  });
  await assert.rejects(
    () => collect(BASE_CONFIG, BASE_ENV, ONE_DAY),
    /ambiguous account rows/,
  );
});

test('Google Ads validates real calendar dates before making a network request', async (t) => {
  const fetchMock = t.mock.method(globalThis, 'fetch', async () => {
    throw new Error('network should not be called');
  });
  await assert.rejects(
    () => collect(BASE_CONFIG, BASE_ENV, { from: '2026-02-30', to: '2026-02-30' }),
    /invalid date range/,
  );
  assert.equal(fetchMock.mock.callCount(), 0);
});

test('Google Ads preserves a legitimate zero lost-impression share', async (t) => {
  t.mock.method(globalThis, 'fetch', async (url, options = {}) => {
    if (String(url).includes('oauth2.googleapis.com/token')) {
      return Response.json({ access_token: 'access-token' });
    }
    const query = JSON.parse(String(options.body)).query;
    if (query.includes('FROM customer')) {
      return Response.json([{ results: [{ metrics: {
        costMicros: '0', impressions: '0', clicks: '0',
        searchImpressionShare: 1,
        // Protobuf JSON omits the two selected scalar fields when both are 0.
      } }] }]);
    }
    return Response.json([{ results: [] }]);
  });
  const result = await collect(BASE_CONFIG, BASE_ENV, ONE_DAY);
  const lost = result.metrics.find(
    (metric) => metric.name === 'lostImpressionShare' && !metric.dimensions,
  );
  assert.equal(lost?.value, 0);
});
