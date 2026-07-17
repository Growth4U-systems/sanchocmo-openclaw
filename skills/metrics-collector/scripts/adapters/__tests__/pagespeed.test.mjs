import assert from 'node:assert/strict';
import test from 'node:test';

import { collect } from '../pagespeed.js';

const ONE_DAY = { from: '2026-06-27', to: '2026-06-27' };

function psiPayload(performance, seo, lcpMs, cls, tbtMs, extra = {}) {
  const payload = {
    lighthouseResult: {
      categories: {
        performance: { score: performance / 100 },
        seo: { score: seo / 100 },
        accessibility: { score: 0.9 },
        'best-practices': { score: 0.8 },
      },
      audits: {
        'largest-contentful-paint': { numericValue: lcpMs },
        'cumulative-layout-shift': { numericValue: cls },
        'total-blocking-time': { numericValue: tbtMs },
      },
    },
  };
  return { ...payload, ...extra };
}

test('PageSpeed adapter emits dashboard metric names for mobile and desktop', async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url) => {
    const href = String(url);
    calls.push(href);
    if (href.includes('strategy=mobile')) {
      const payload = psiPayload(76, 91, 2400, 0.023, 180, {
        loadingExperience: { metrics: { INTERACTION_TO_NEXT_PAINT: { percentile: 235 } } },
      });
      payload.lighthouseResult.audits['interaction-to-next-paint'] = { numericValue: 301.4 };
      return Response.json(payload);
    }
    if (href.includes('strategy=desktop')) {
      const payload = psiPayload(94, 98, 1100, 0.01, 40, {
        originLoadingExperience: { metrics: { INTERACTION_TO_NEXT_PAINT: { percentile: 123 } } },
      });
      payload.lighthouseResult.audits['interaction-to-next-paint'] = { numericValue: 189.2 };
      return Response.json(payload);
    }
    return new Response('', { status: 400 });
  };

  try {
    const result = await collect(
      { _slug: 'growth4u', _client: { url: 'growth4u.io' } },
      { PAGESPEED_API_KEY: 'key' },
      ONE_DAY,
    );

    assert.equal(result.source, 'pagespeed');
    assert.equal(result.date, ONE_DAY.from);
    assert.ok(result.metrics.every((metric) => metric.date === ONE_DAY.from));
    assert.equal(calls.length, 2);
    const byName = new Map(result.metrics.map((metric) => [metric.name, metric.value]));
    assert.equal(byName.get('performance_mobile'), 76);
    assert.equal(byName.get('seo_mobile'), 91);
    assert.equal(byName.get('lcp_mobile'), 2.4);
    assert.equal(byName.get('cls_mobile'), 0.023);
    assert.equal(byName.get('tbt_mobile'), 180);
    assert.equal(byName.get('inp_mobile'), 301);
    assert.equal(byName.get('performance_desktop'), 94);
    assert.equal(byName.get('seo_desktop'), 98);
    assert.equal(byName.get('inp_desktop'), 189);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('PageSpeed omits INP when unavailable instead of substituting TBT or zero', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => Response.json(psiPayload(80, 90, 2000, 0.02, 175));

  try {
    const result = await collect(
      { _slug: 'growth4u', _client: { url: 'growth4u.io' } },
      {},
      ONE_DAY,
    );
    const names = new Set(result.metrics.map((metric) => metric.name));
    assert.equal(names.has('inp_mobile'), false);
    assert.equal(names.has('inp_desktop'), false);
    assert.equal(result.metrics.find((metric) => metric.name === 'tbt_mobile')?.value, 175);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('PageSpeed omits every unavailable audit or category instead of emitting false zeroes', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => Response.json({ lighthouseResult: {} });

  try {
    const result = await collect(
      { _slug: 'growth4u', _client: { url: 'growth4u.io' } },
      {},
      ONE_DAY,
    );
    assert.deepEqual(result.metrics, []);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('PageSpeed uses Lighthouse INP and never substitutes CrUX field data', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    const payload = psiPayload(80, 90, 2000, 0.02, 175);
    payload.loadingExperience = {
      metrics: { INTERACTION_TO_NEXT_PAINT: { percentile: 111 } },
    };
    payload.originLoadingExperience = {
      metrics: { INTERACTION_TO_NEXT_PAINT: { percentile: 222 } },
    };
    payload.lighthouseResult.audits['interaction-to-next-paint'] = { numericValue: 287.6 };
    return Response.json(payload);
  };

  try {
    const result = await collect(
      { _slug: 'growth4u', _client: { url: 'growth4u.io' } },
      {},
      ONE_DAY,
    );
    assert.equal(result.metrics.find((metric) => metric.name === 'inp_mobile')?.value, 288);
    assert.equal(result.metrics.find((metric) => metric.name === 'inp_desktop')?.value, 288);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('PageSpeed explicit repair persists the point-in-time snapshot on observation day', async (t) => {
  t.mock.method(globalThis, 'fetch', async () =>
    Response.json(psiPayload(80, 90, 2000, 0.02, 175)));

  const result = await collect(
    {
      _slug: 'growth4u',
      _client: { url: 'growth4u.io' },
      _pointInTimeDate: '2026-07-17',
    },
    {},
    { from: '2026-04-01', to: '2026-04-01' },
  );
  assert.equal(result.date, '2026-07-17');
  assert.ok(result.metrics.length > 0);
  assert.ok(result.metrics.every((metric) => metric.date === '2026-07-17'));
  assert.deepEqual(result.attemptedDates, ['2026-07-17']);
  assert.ok(result.restatedScopes.every((scope) => scope.metricDate === '2026-07-17'));
});

test('PageSpeed rejects missing, impossible, reversed and multi-day date ranges before fetching', async () => {
  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;
  globalThis.fetch = async () => {
    fetchCalls += 1;
    return Response.json(psiPayload(80, 90, 2000, 0.02, 175));
  };

  const config = { _slug: 'growth4u', _client: { url: 'growth4u.io' } };
  try {
    await assert.rejects(() => collect(config, {}, undefined), /invalid date range/);
    await assert.rejects(
      () => collect(config, {}, { from: '2026-02-30', to: '2026-02-30' }),
      /invalid date range/,
    );
    await assert.rejects(
      () => collect(config, {}, { from: '2026-06-28', to: '2026-06-27' }),
      /from must not be after to/,
    );
    await assert.rejects(
      () => collect(config, {}, { from: '2026-06-27', to: '2026-06-28' }),
      /multi-day ranges are not supported safely/,
    );
    assert.equal(fetchCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
