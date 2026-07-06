import assert from 'node:assert/strict';
import test from 'node:test';

import { collect } from '../google-ads.js';

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
    if (body.query.includes('search_impression_share')) {
      return Response.json([
        {
          results: [
            {
              campaign: { id: '1', name: 'Search A', advertisingChannelType: 'SEARCH' },
              metrics: {
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
              ctr: 0.1,
              averageCpc: '1000000',
              conversions: 4,
              conversionsValue: 400,
            },
          },
          {
            campaign: { id: '2', name: 'Search B', advertisingChannelType: 'SEARCH' },
            metrics: {
              costMicros: '50000000',
              impressions: '500',
              clicks: '50',
              ctr: 0.1,
              averageCpc: '1000000',
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
  } finally {
    globalThis.fetch = originalFetch;
  }
});
