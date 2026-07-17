import assert from 'node:assert/strict';
import test from 'node:test';

import { collect } from '../yalc.js';

const CONFIG = { _slug: 'growth4u', _mcBaseUrl: 'https://sancho.test', _adminToken: 'admin-token' };

const VALID_REPORT = {
  from: '2026-07-02T00:00:00.000Z',
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
  tracking: {
    status: 'real',
    sources: ['impact'],
    recordCount: 1,
  },
};

async function withReport(report, run) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options = {}) => {
    assert.equal(String(url), 'https://sancho.test/api/partnerships/report?slug=growth4u&from=2026-07-02&to=2026-07-02');
    assert.equal(options.headers['x-admin-token'], 'admin-token');
    return Response.json(report);
  };
  try {
    return await run();
  } finally {
    globalThis.fetch = originalFetch;
  }
}

test('YALC adapter maps Partnerships report totals and creator dimensions', async () => {
  await withReport(VALID_REPORT, async () => {
    const result = await collect(CONFIG, {}, { from: '2026-07-02', to: '2026-07-02' });
    assert.equal(result.source, 'yalc');
    assert.equal(result.provenance, 'impact');
    assert.equal(result.quality, undefined);
    const rollups = result.metrics.filter((metric) => !metric.dimensions);
    const byName = new Map(rollups.map((metric) => [metric.name, metric.value]));
    assert.equal(byName.get('clicksDaily'), 1200);
    assert.equal(byName.get('signupsDaily'), 96);
    assert.equal(byName.get('kycDaily'), 58);
    assert.equal(byName.get('firstTxDaily'), 40);
    assert.equal(byName.get('valueDaily'), 3200);
    assert.equal(byName.has('totalCost'), false);
    assert.equal(byName.has('cpaReal'), false);
    assert.equal(byName.has('roi'), false);

    const creatorValue = result.metrics.find((metric) => metric.name === 'valueDaily' && metric.dimensions?.leadId === 'lead-1');
    assert.equal(creatorValue?.value, 2240);
    assert.equal(creatorValue?.dimensions?.creator, '@lucia');
  });
});

test('YALC preserves unknown fees as null and marks the financial snapshot partial', async () => {
  const zeroReport = {
    ...VALID_REPORT,
    targetCacEur: 0,
    totals: {
      postsLive: 0,
      clicks: 0,
      signups: 0,
      kyc: 0,
      conversions: 0,
      investedEur: null,
      totalCostEur: null,
      cpaRealEur: null,
      roi: null,
    },
    creators: [{
      handle: '@lucia',
      leadId: 'lead-1',
      network: 'tiktok',
      clicks: 0,
      signups: 0,
      kyc: 0,
      conversions: 0,
      feeEur: null,
    }],
  };
  await withReport(zeroReport, async () => {
    const result = await collect(CONFIG, {}, { from: '2026-07-02', to: '2026-07-02' });
    assert.equal(result.date, '2026-07-02');
    assert.equal(result.metrics.find((metric) => metric.name === 'clicksDaily')?.value, 0);
    assert.equal(result.metrics.find((metric) => metric.name === 'valueDaily')?.value, 0);
    assert.equal(
      result.metrics.find((metric) => metric.name === 'invested' && !metric.dimensions)?.value,
      null,
    );
    assert.equal(
      result.metrics.find((metric) => metric.name === 'invested' && metric.dimensions)?.value,
      null,
    );
    assert.equal(result.quality, 'partial');
    assert.equal(result.provenance, 'impact');
  });
});

test('YALC preserves a verified zero fee as a real numeric zero', async () => {
  const zeroFeeReport = {
    ...VALID_REPORT,
    totals: {
      ...VALID_REPORT.totals,
      investedEur: 0,
      totalCostEur: 0,
      cpaRealEur: null,
      roi: null,
    },
    creators: [{ ...VALID_REPORT.creators[0], feeEur: 0 }],
  };
  await withReport(zeroFeeReport, async () => {
    const result = await collect(CONFIG, {}, { from: '2026-07-02', to: '2026-07-02' });
    assert.equal(
      result.metrics.find((metric) => metric.name === 'invested' && !metric.dimensions)?.value,
      0,
    );
    assert.equal(
      result.metrics.find((metric) => metric.name === 'invested' && metric.dimensions)?.value,
      0,
    );
    assert.equal(result.quality, undefined);
  });
});

test('YALC keeps a reachable roster without real tracking out of metric snapshots', async () => {
  const unavailableReport = {
    ...VALID_REPORT,
    totals: {
      postsLive: 0,
      clicks: 0,
      signups: 0,
      kyc: 0,
      conversions: 0,
      investedEur: 0,
      totalCostEur: 0,
      cpaRealEur: null,
      roi: null,
    },
    creators: [],
    tracking: { status: 'unavailable', sources: [], recordCount: 0 },
  };
  await withReport(unavailableReport, async () => {
    const result = await collect(CONFIG, {}, { from: '2026-07-02', to: '2026-07-02' });
    assert.deepEqual(result.metrics, []);
    assert.equal(result.status, 'connected_no_data');
    assert.deepEqual(result.restatedDates, ['2026-07-02']);
    assert.equal(result.quality, 'partial');
    assert.equal(result.provenance, undefined);
  });
});

test('YALC rejects malformed core report fields instead of converting them to zero', async () => {
  const cases = [
    [{ ...VALID_REPORT, to: 'not-a-date' }, /valid to date/],
    [{ ...VALID_REPORT, targetCacEur: '80' }, /targetCacEur must be a finite number/],
    [{ ...VALID_REPORT, totals: { ...VALID_REPORT.totals, clicks: undefined } }, /totals\.clicks/],
    [{ ...VALID_REPORT, totals: { ...VALID_REPORT.totals, investedEur: '1200' } }, /totals\.investedEur/],
    [{ ...VALID_REPORT, creators: null }, /creators must be an array/],
    [{ ...VALID_REPORT, tracking: undefined }, /tracking must be an object/],
    [{ ...VALID_REPORT, tracking: { status: 'real', sources: ['impact'], recordCount: 0 } }, /recordCount must match/],
  ];

  for (const [report, pattern] of cases) {
    await withReport(report, async () => {
      await assert.rejects(
        () => collect(CONFIG, {}, { from: '2026-07-02', to: '2026-07-02' }),
        pattern,
      );
    });
  }
});

test('YALC requires an explicit real date range and rejects mismatched report windows', async () => {
  await assert.rejects(() => collect(CONFIG), /dateRange\.from/);
  await assert.rejects(
    () => collect(CONFIG, {}, { from: '2026-02-30', to: '2026-02-30' }),
    /real calendar date/,
  );
  await withReport({ ...VALID_REPORT, from: '2026-07-01T00:00:00.000Z' }, async () => {
    await assert.rejects(
      () => collect(CONFIG, {}, { from: '2026-07-02', to: '2026-07-02' }),
      /does not match requested day/,
    );
  });
});
