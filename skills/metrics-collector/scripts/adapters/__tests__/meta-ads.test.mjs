import assert from 'node:assert/strict';
import test from 'node:test';

import { collect } from '../meta-ads.js';

async function collectMetaWithTotalRow(totalRow, options) {
  return collectMetaWithTotalsPayload({ data: [totalRow] }, options);
}

async function collectMetaWithTotalsPayload(payload, { config = {}, inspectRequest } = {}) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    const href = String(url);
    inspectRequest?.(href, init);
    const isTotal = !href.includes('level=') && !href.includes('breakdowns=');
    return Response.json(isTotal ? payload : { data: [] });
  };

  try {
    return await collect(
      { _slug: 'growth4u', accountId: 'act_123', ...config },
      { GROWTH4U_META_ADS_ACCESS_TOKEN: 'token' },
      { from: '2026-07-01', to: '2026-07-01' },
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
}

test('Meta Ads emits explicit zero outcomes and ROAS for a valid spend row', async () => {
  const result = await collectMetaWithTotalRow({
    spend: '100',
    impressions: '1000',
    clicks: '10',
    ctr: '1',
    cpc: '10',
  });
  const totals = Object.fromEntries(
    result.metrics.filter((metric) => !metric.dimensions).map((metric) => [metric.name, metric.value]),
  );

  assert.equal(totals.spend, 100);
  assert.equal(totals.conversions, 0);
  assert.equal(totals.leads, 0);
  assert.equal(totals.revenue, 0);
  assert.equal(totals.roas, 0);
});

test('Meta Ads keeps platform conversions, lead subset, revenue and ROAS distinct', async () => {
  const result = await collectMetaWithTotalRow({
    spend: '100',
    impressions: '1000',
    clicks: '10',
    ctr: '1',
    cpc: '10',
    actions: [
      { action_type: 'lead', value: '3' },
      { action_type: 'purchase', value: '2' },
    ],
    action_values: [{ action_type: 'purchase', value: '250' }],
  });
  const totals = Object.fromEntries(
    result.metrics.filter((metric) => !metric.dimensions).map((metric) => [metric.name, metric.value]),
  );

  assert.equal(totals.conversions, 5);
  assert.equal(totals.leads, 3);
  assert.equal(totals.revenue, 250);
  assert.equal(totals.roas, 2.5);
});

test('Meta Ads treats equivalent action aliases by precedence instead of double-counting them', async () => {
  const row = {
    spend: '100',
    impressions: '1000',
    clicks: '10',
    ctr: '1',
    cpc: '10',
    actions: [
      { action_type: 'lead', value: '3' },
      { action_type: 'onsite_conversion.lead_grouped', value: '30' },
      { action_type: 'purchase', value: '2' },
      { action_type: 'offsite_conversion.fb_pixel_purchase', value: '20' },
    ],
    action_values: [
      { action_type: 'purchase', value: '250' },
      { action_type: 'offsite_conversion.fb_pixel_purchase', value: '2500' },
    ],
  };

  const canonical = await collectMetaWithTotalRow(row);
  const canonicalTotals = Object.fromEntries(
    canonical.metrics.filter((metric) => !metric.dimensions).map((metric) => [metric.name, metric.value]),
  );
  assert.equal(canonicalTotals.leads, 3);
  assert.equal(canonicalTotals.conversions, 5);
  assert.equal(canonicalTotals.revenue, 250);

  const configured = await collectMetaWithTotalRow(row, {
    config: {
      actionTypePrecedence: {
        leads: ['onsite_conversion.lead_grouped', 'lead'],
        purchases: ['offsite_conversion.fb_pixel_purchase', 'purchase'],
      },
    },
  });
  const configuredTotals = Object.fromEntries(
    configured.metrics.filter((metric) => !metric.dimensions).map((metric) => [metric.name, metric.value]),
  );
  assert.equal(configuredTotals.leads, 30);
  assert.equal(configuredTotals.conversions, 50);
  assert.equal(configuredTotals.revenue, 2500);
});

test('Meta Ads rejects malformed account and action values instead of coercing them to zero', async () => {
  await assert.rejects(
    collectMetaWithTotalRow({
      spend: 'not-a-number',
      impressions: '1000',
      clicks: '10',
    }),
    /malformed account insights\.spend/,
  );

  await assert.rejects(
    collectMetaWithTotalRow({
      spend: '100',
      impressions: '1000',
      clicks: '10',
      actions: [{ action_type: 'lead', value: '3 leads' }],
    }),
    /malformed account insights\.actions\[0\]\.value/,
  );
});

test('Meta Ads rejects multiple account-total rows as ambiguous', async () => {
  const row = { spend: '10', impressions: '100', clicks: '5' };
  await assert.rejects(
    collectMetaWithTotalsPayload({ data: [row, row] }),
    /returned 2 rows; expected at most one/,
  );
});

test('Meta Ads omits reported rates when their denominators are zero', async () => {
  const result = await collectMetaWithTotalRow({
    spend: '0',
    impressions: '0',
    clicks: '0',
    ctr: '0',
    cpc: '0',
    frequency: '0',
  });
  const totals = Object.fromEntries(
    result.metrics.filter((metric) => !metric.dimensions).map((metric) => [metric.name, metric.value]),
  );

  assert.equal(totals.ctr, undefined);
  assert.equal(totals.cpc, undefined);
  assert.equal(totals.frequency, undefined);
  assert.equal(totals.roas, undefined);
});

test('Meta Ads authenticates with Bearer and does not request campaign_name in account totals', async () => {
  const requests = [];
  await collectMetaWithTotalsPayload({ data: [] }, {
    inspectRequest: (href, init) => requests.push({ href, init }),
  });

  assert.ok(requests.length > 0);
  for (const request of requests) {
    assert.equal(new URL(request.href).searchParams.has('access_token'), false);
    assert.equal(request.href.includes('token'), false);
    assert.equal(request.init?.headers?.Authorization, 'Bearer token');
  }
  const totalRequest = requests.find(({ href }) => {
    const url = new URL(href);
    return !url.searchParams.has('level') && !url.searchParams.has('breakdowns');
  });
  assert.ok(totalRequest);
  assert.equal(new URL(totalRequest.href).searchParams.get('fields')?.includes('campaign_name'), false);
});

test('Meta Ads rejects multi-day ranges instead of storing an aggregate on the first day', async () => {
  await assert.rejects(
    collect(
      { _slug: 'growth4u', accountId: 'act_123' },
      { GROWTH4U_META_ADS_ACCESS_TOKEN: 'token' },
      { from: '2026-07-01', to: '2026-07-02' },
    ),
    /collect one day at a time/,
  );
});

test('Meta Ads emits additive zeros for a valid empty Insights day', async () => {
  const result = await collectMetaWithTotalsPayload({ data: [] });
  const totals = Object.fromEntries(
    result.metrics.filter((metric) => !metric.dimensions).map((metric) => [metric.name, metric.value]),
  );

  assert.deepEqual(totals, {
    spend: 0,
    impressions: 0,
    clicks: 0,
    conversions: 0,
    leads: 0,
    revenue: 0,
  });
  assert.equal(totals.ctr, undefined);
  assert.equal(totals.cpc, undefined);
  assert.equal(totals.roas, undefined);
});

test('Meta Ads rejects a successful account response without a data array', async () => {
  await assert.rejects(
    collectMetaWithTotalsPayload({ data: { spend: '0' } }),
    /missing data array/,
  );
});

test('Meta Ads follows every Insights page without leaking paging tokens', async (t) => {
  const requests = [];
  const campaignRow = (name, spend) => ({
    campaign_id: `id-${name}`,
    campaign_name: name,
    spend: String(spend),
    impressions: '100',
    clicks: '10',
  });
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    const parsed = new URL(String(url));
    requests.push({ parsed, init });
    const level = parsed.searchParams.get('level');
    if (level === 'campaign' && parsed.searchParams.get('after') === 'page-2') {
      return Response.json({ data: [campaignRow('Campaign B', 20)] });
    }
    if (level === 'campaign') {
      return Response.json({
        data: [campaignRow('Campaign A', 10)],
        paging: {
          next: 'https://graph.facebook.com/v21.0/act_123/insights?level=campaign&after=page-2&access_token=secret-in-page',
        },
      });
    }
    return Response.json({ data: [] });
  });

  const result = await collect(
    { _slug: 'growth4u', accountId: 'act_123' },
    { GROWTH4U_META_ADS_ACCESS_TOKEN: 'token' },
    { from: '2026-07-01', to: '2026-07-01' },
  );
  assert.deepEqual(
    result.metrics
      .filter((metric) => metric.name === 'spend' && metric.dimensions?.campaign)
      .map((metric) => [metric.dimensions.campaign, metric.value]),
    [['Campaign A', 10], ['Campaign B', 20]],
  );
  assert.ok(requests.every(({ parsed }) => !parsed.searchParams.has('access_token')));
  assert.ok(requests.every(({ init }) => init.headers.Authorization === 'Bearer token'));
});

test('Meta Ads keeps homonymous campaign, ad set and ad rows distinct with provider IDs', async (t) => {
  const requestedFields = new Map();
  const core = { spend: '10', impressions: '100', clicks: '5' };
  t.mock.method(globalThis, 'fetch', async (url) => {
    const parsed = new URL(String(url));
    const level = parsed.searchParams.get('level');
    if (level) requestedFields.set(level, parsed.searchParams.get('fields') || '');
    if (level === 'campaign') {
      return Response.json({ data: [
        { ...core, campaign_id: 'campaign-1', campaign_name: 'Always On' },
        { ...core, campaign_id: 'campaign-2', campaign_name: 'Always On' },
      ] });
    }
    if (level === 'adset') {
      return Response.json({ data: [
        { ...core, campaign_id: 'campaign-1', campaign_name: 'Always On', adset_id: 'adset-1', adset_name: 'Broad' },
        { ...core, campaign_id: 'campaign-1', campaign_name: 'Always On', adset_id: 'adset-2', adset_name: 'Broad' },
      ] });
    }
    if (level === 'ad') {
      return Response.json({ data: [
        { ...core, campaign_id: 'campaign-1', campaign_name: 'Always On', adset_id: 'adset-1', adset_name: 'Broad', ad_id: 'ad-1', ad_name: 'Founder' },
        { ...core, campaign_id: 'campaign-1', campaign_name: 'Always On', adset_id: 'adset-1', adset_name: 'Broad', ad_id: 'ad-2', ad_name: 'Founder' },
      ] });
    }
    return Response.json({ data: [] });
  });

  const result = await collect(
    { _slug: 'growth4u', accountId: 'act_123' },
    { GROWTH4U_META_ADS_ACCESS_TOKEN: 'token' },
    { from: '2026-07-01', to: '2026-07-01' },
  );
  const spendRows = result.metrics.filter((metric) => metric.name === 'spend' && metric.dimensions);
  assert.deepEqual(
    spendRows.filter((metric) => metric.dimensions.campaign && !metric.dimensions.adset)
      .map((metric) => metric.dimensions.campaignId),
    ['campaign-1', 'campaign-2'],
  );
  assert.deepEqual(
    spendRows.filter((metric) => metric.dimensions.adset && !metric.dimensions.ad)
      .map((metric) => metric.dimensions.adsetId),
    ['adset-1', 'adset-2'],
  );
  assert.deepEqual(
    spendRows.filter((metric) => metric.dimensions.ad)
      .map((metric) => metric.dimensions.adId),
    ['ad-1', 'ad-2'],
  );
  assert.match(requestedFields.get('campaign'), /campaign_id/);
  assert.match(requestedFields.get('adset'), /campaign_id/);
  assert.match(requestedFields.get('adset'), /adset_id/);
  assert.match(requestedFields.get('ad'), /campaign_id/);
  assert.match(requestedFields.get('ad'), /adset_id/);
  assert.match(requestedFields.get('ad'), /ad_id/);
});

test('Meta Ads retains its totals but marks an incomplete optional breakdown partial', async (t) => {
  t.mock.method(console, 'warn', () => {});
  t.mock.method(globalThis, 'fetch', async (url) => {
    const parsed = new URL(String(url));
    if (parsed.searchParams.get('level') === 'campaign') {
      return Response.json({ data: [{ spend: '1', impressions: '10', clicks: '1' }] });
    }
    return Response.json({ data: [] });
  });
  const result = await collect(
    { _slug: 'growth4u', accountId: 'act_123' },
    { GROWTH4U_META_ADS_ACCESS_TOKEN: 'token' },
    { from: '2026-07-01', to: '2026-07-01' },
  );
  assert.equal(result.quality, 'partial');
  assert.equal(result.metrics.some((metric) => metric.dimensions?.campaign), false);
  assert.equal(result.metrics.find((metric) =>
    metric.name === 'spend' && !metric.dimensions)?.value, 0);
  assert.ok(result.restatedScopes.some((scope) =>
    scope.metricDate === '2026-07-01' && scope.metricName === 'spend'));
});

test('Meta Ads rejects impossible dates before making a provider request', async (t) => {
  const fetchMock = t.mock.method(globalThis, 'fetch', async () => {
    throw new Error('network should not be called');
  });
  await assert.rejects(
    () => collect(
      { _slug: 'growth4u', accountId: 'act_123' },
      { GROWTH4U_META_ADS_ACCESS_TOKEN: 'token' },
      { from: '2026-02-30', to: '2026-02-30' },
    ),
    /invalid date range/,
  );
  assert.equal(fetchMock.mock.callCount(), 0);
});
