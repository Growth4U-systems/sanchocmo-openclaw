import assert from 'node:assert/strict';
import test from 'node:test';

import { collect } from '../metricool.js';

test('Metricool adapter emits extended social KPIs when API rows include them', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const href = String(url);
    if (href.includes('/admin/simpleProfiles')) {
      return Response.json([
        {
          id: 'blog-1',
          instagram: true,
          instagramFollowers: 1234,
        },
      ]);
    }
    if (href.includes('/v2/analytics/posts/instagram')) {
      return Response.json({
        data: [
          {
            impressions: 100,
            clicks: 7,
            likes: 11,
            comments: 2,
            engagement: 3.5,
            reach: 80,
            shares: 4,
            saves: 5,
            videoViews: 60,
            url: 'https://example.com/post',
            text: 'A post',
          },
        ],
      });
    }
    return new Response('', { status: 403 });
  };

  try {
    const result = await collect(
      { METRICOOL_URL: 'https://app.metricool.com/evolution/web?blogId=blog-1&userId=user-1' },
      { METRICOOL_API_TOKEN: 'token' },
      { from: '2026-06-27', to: '2026-06-27' },
    );

    const byName = new Map(result.metrics.map((metric) => [metric.name, metric]));
    assert.equal(byName.get('reach')?.value, 80);
    assert.equal(byName.get('shares')?.value, 4);
    assert.equal(byName.get('saves')?.value, 5);
    assert.equal(byName.get('videoViews')?.value, 60);
    assert.equal(byName.get('followers')?.value, 1234);

    const detail = result.metrics.find((metric) => metric.name === 'postDetail');
    assert.equal(detail?.dimensions?.shares, 4);
    assert.equal(detail?.dimensions?.saves, 5);
    assert.equal(detail?.dimensions?.reach, 80);
    assert.equal(detail?.dimensions?.videoViews, 60);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
