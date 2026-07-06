import assert from 'node:assert/strict';
import test from 'node:test';

import { collect } from '../yalc.js';

test('YALC adapter maps Partnerships report totals and creator dimensions', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options = {}) => {
    assert.equal(String(url), 'https://sancho.test/api/partnerships/report?slug=growth4u&period=30');
    assert.equal(options.headers['x-admin-token'], 'admin-token');
    return Response.json({
      to: '2026-07-02T10:00:00.000Z',
      targetCacEur: 80,
      totals: {
        postsLive: 3,
        clicks: 1200,
        signups: 96,
        kyc: 58,
        conversions: 40,
        investedEur: 1200,
        totalCostEur: 1600,
        cpaRealEur: 40,
        roi: 2,
      },
      creators: [
        {
          handle: '@lucia',
          leadId: 'lead-1',
          network: 'tiktok',
          clicks: 800,
          signups: 64,
          kyc: 38,
          conversions: 28,
          feeEur: 900,
        },
      ],
    });
  };

  try {
    const result = await collect({ _slug: 'growth4u', _mcBaseUrl: 'https://sancho.test', _adminToken: 'admin-token' });
    assert.equal(result.source, 'yalc');
    const rollups = result.metrics.filter((metric) => !metric.dimensions);
    const byName = new Map(rollups.map((metric) => [metric.name, metric.value]));
    assert.equal(byName.get('clicks'), 1200);
    assert.equal(byName.get('signups'), 96);
    assert.equal(byName.get('kyc'), 58);
    assert.equal(byName.get('firstTx'), 40);
    assert.equal(byName.get('value'), 3200);

    const creatorValue = result.metrics.find((metric) => metric.name === 'value' && metric.dimensions?.leadId === 'lead-1');
    assert.equal(creatorValue?.value, 2240);
    assert.equal(creatorValue?.dimensions?.creator, '@lucia');
  } finally {
    globalThis.fetch = originalFetch;
  }
});
