import assert from 'node:assert/strict';
import test from 'node:test';

import { collect } from '../pagespeed.js';

function psiPayload(performance, seo, lcpMs, cls, tbtMs) {
  return {
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
}

test('PageSpeed adapter emits dashboard metric names for mobile and desktop', async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url) => {
    const href = String(url);
    calls.push(href);
    if (href.includes('strategy=mobile')) return Response.json(psiPayload(76, 91, 2400, 0.023, 180));
    if (href.includes('strategy=desktop')) return Response.json(psiPayload(94, 98, 1100, 0.01, 40));
    return new Response('', { status: 400 });
  };

  try {
    const result = await collect(
      { _slug: 'growth4u', _client: { url: 'growth4u.io' } },
      { PAGESPEED_API_KEY: 'key' },
      { from: '2026-06-27', to: '2026-06-27' },
    );

    assert.equal(result.source, 'pagespeed');
    assert.equal(calls.length, 2);
    const byName = new Map(result.metrics.map((metric) => [metric.name, metric.value]));
    assert.equal(byName.get('performance_mobile'), 76);
    assert.equal(byName.get('seo_mobile'), 91);
    assert.equal(byName.get('lcp_mobile'), 2.4);
    assert.equal(byName.get('cls_mobile'), 0.023);
    assert.equal(byName.get('tbt_mobile'), 180);
    assert.equal(byName.get('performance_desktop'), 94);
    assert.equal(byName.get('seo_desktop'), 98);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
