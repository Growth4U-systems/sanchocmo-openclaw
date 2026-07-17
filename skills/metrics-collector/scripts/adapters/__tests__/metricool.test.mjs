import assert from 'node:assert/strict';
import test from 'node:test';

import { collect } from '../metricool.js';

test('Metricool adapter emits extended social KPIs when API rows include them', async () => {
  const originalFetch = globalThis.fetch;
  const authHeaders = [];
  globalThis.fetch = async (url, options = {}) => {
    authHeaders.push(options.headers?.['X-Mc-Auth']);
    const href = String(url);
    if (href.includes('/admin/simpleProfiles')) {
      return Response.json([
        {
          id: 'blog-1',
          instagram: true,
          timezone: 'Europe/Madrid',
        },
      ]);
    }
    if (href.includes('/explore/followers/blog-1')) {
      return Response.json({ instagram: 1234 });
    }
    if (href.includes('/v2/analytics/posts/instagram')) {
      assert.match(href, /timezone=Europe%2FMadrid/);
      return Response.json({
        data: [
          {
            id: 'post-1',
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
            createdAt: '2026-06-26T10:00:00Z',
          },
        ],
      });
    }
    return new Response('', { status: 403 });
  };

  try {
    const result = await collect(
      { METRICOOL_URL: 'https://app.metricool.com/evolution/web?blogId=blog-1&userId=user-1' },
      { METRICOOL_API_KEY: 'legacy-token' },
      { from: '2026-06-27', to: '2026-06-27' },
    );

    const byName = new Map(result.metrics.map((metric) => [metric.name, metric]));
    assert.equal(byName.get('reach')?.value, 80);
    assert.equal(byName.get('shares')?.value, 4);
    assert.equal(byName.get('saves')?.value, 5);
    assert.equal(byName.get('videoViews')?.value, 60);
    assert.equal(byName.get('followers')?.value, 1234);

    const detail = result.metrics.find((metric) => metric.name === 'postDetail');
    assert.deepEqual(detail?.dimensions, {
      network: 'instagram',
      postId: 'post-1',
      url: 'https://example.com/post',
      text: 'A post',
      publishedDate: '2026-06-26',
    });
    assert.equal(byName.get('postShares')?.value, 4);
    assert.equal(byName.get('postSaves')?.value, 5);
    assert.equal(byName.get('postReach')?.value, 80);
    assert.equal(byName.get('postVideoViews')?.value, 60);
    assert.equal(byName.get('postLikes')?.value, 11);
    assert.equal(byName.get('postClicks')?.value, 7);
    assert.equal(byName.get('postEngagement')?.value, 3.5);
    for (const name of ['postDetail', 'postShares', 'postSaves', 'postReach', 'postVideoViews']) {
      assert.deepEqual(byName.get(name)?.dimensions, detail?.dimensions);
      assert.equal(byName.get(name)?.date, '2026-06-27');
    }
    assert.ok(authHeaders.length >= 2);
    assert.ok(authHeaders.every((header) => header === 'legacy-token'));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Metricool adapter fails when the profiles endpoint rejects credentials', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => Response.json({ message: 'unauthorized' }, { status: 401 });

  try {
    await assert.rejects(
      collect(
        { METRICOOL_URL: 'https://app.metricool.com/evolution/web?blogId=blog-1&userId=user-1' },
        { METRICOOL_API_TOKEN: 'bad-token' },
        { from: '2026-07-02', to: '2026-07-02' },
      ),
      /profiles HTTP 401/,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Metricool adapter fails atomically when a connected network request fails', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    if (String(url).includes('/admin/simpleProfiles')) {
      return Response.json([{ id: 'blog-1', instagram: true, linkedinCompany: true }]);
    }
    if (String(url).includes('/explore/followers/blog-1')) return Response.json({});
    if (String(url).includes('/v2/analytics/posts/instagram')) {
      return Response.json({ data: [] });
    }
    return Response.json({ message: 'upstream unavailable' }, { status: 503 });
  };

  try {
    await assert.rejects(
      collect(
        { METRICOOL_URL: 'https://app.metricool.com/evolution/web?blogId=blog-1&userId=user-1' },
        { METRICOOL_API_TOKEN: 'token' },
        { from: '2026-07-02', to: '2026-07-02' },
      ),
      /linkedin HTTP 503/,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Metricool marks valid post analytics partial when the followers subquery fails', async (t) => {
  t.mock.method(console, 'warn', () => {});
  t.mock.method(globalThis, 'fetch', async (url) => {
    const href = String(url);
    if (href.includes('/admin/simpleProfiles')) {
      return Response.json([{ id: 'blog-1', instagram: true }]);
    }
    if (href.includes('/explore/followers/blog-1')) {
      return Response.json({ message: 'unavailable' }, { status: 503 });
    }
    return Response.json({ data: [{
      id: 'post-1',
      impressions: 100,
      engagement: 2,
      url: 'https://example.com/post-1',
    }] });
  });

  const result = await collect(
    { METRICOOL_URL: 'https://app.metricool.com/evolution/web?blogId=blog-1&userId=user-1' },
    { METRICOOL_API_TOKEN: 'token' },
    { from: '2026-07-02', to: '2026-07-02' },
  );
  assert.equal(result.quality, 'partial');
  assert.equal(result.metrics.some((metric) => metric.name === 'followers'), false);
  assert.equal(result.metrics.find((metric) => metric.name === 'posts')?.value, 1);
  assert.equal(result.metrics.find((metric) => metric.name === 'impressions')?.value, 100);
});

test('Metricool adapter rejects a successful response with an invalid posts schema', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    if (String(url).includes('/admin/simpleProfiles')) {
      return Response.json([{ id: 'blog-1', instagram: true }]);
    }
    if (String(url).includes('/explore/followers/blog-1')) return Response.json({});
    return Response.json({ ok: true });
  };

  try {
    await assert.rejects(
      collect(
        { METRICOOL_URL: 'https://app.metricool.com/evolution/web?blogId=blog-1&userId=user-1' },
        { METRICOOL_API_TOKEN: 'token' },
        { from: '2026-07-02', to: '2026-07-02' },
      ),
      /posts response was not an array/,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Metricool adapter emits zero activity and followers for connected networks without posts', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const href = String(url);
    if (href.includes('/admin/simpleProfiles')) {
      return Response.json([
        {
          id: 'blog-1',
          linkedinCompany: true,
        },
      ]);
    }
    if (href.includes('/explore/followers/blog-1')) {
      return Response.json({ linkedinCompany: 321 });
    }
    if (href.includes('/v2/analytics/posts/linkedin')) {
      return Response.json({ data: [] });
    }
    return new Response('', { status: 403 });
  };

  try {
    const result = await collect(
      {
        METRICOOL_URL: 'https://app.metricool.com/evolution/web?blogId=blog-1&userId=user-1',
        _pointInTimeDate: '2026-07-03',
        _explicitRange: false,
      },
      { METRICOOL_API_TOKEN: 'token' },
      { from: '2026-07-02', to: '2026-07-02' },
    );

    const byName = new Map(result.metrics.map((metric) => [metric.name, metric]));
    assert.equal(byName.get('posts')?.value, 0);
    assert.equal(byName.get('postsWithEngagement')?.value, 0);
    assert.equal(byName.get('impressions')?.value, 0);
    assert.equal(byName.get('clicks')?.value, 0);
    assert.equal(byName.get('likes')?.value, 0);
    assert.equal(byName.get('comments')?.value, 0);
    assert.equal(byName.get('avgEngagement'), undefined);
    assert.equal(byName.get('reach')?.value, 0);
    assert.equal(byName.get('shares')?.value, 0);
    // LinkedIn's documented post schema has no saves field: absence stays
    // missing instead of becoming a fabricated zero.
    assert.equal(byName.get('saves'), undefined);
    assert.equal(byName.get('videoViews')?.value, 0);
    assert.equal(byName.get('followers')?.value, 321);
    assert.equal(byName.get('followers')?.date, '2026-07-03');
    assert.deepEqual(result.attemptedDates, ['2026-07-02', '2026-07-03']);
    assert.equal(result.restatedScopes.some((scope) =>
      scope.metricDate === '2026-07-02' && scope.metricName === 'avgEngagement'), true);
    assert.equal(result.restatedScopes.some((scope) =>
      scope.metricDate === '2026-07-03' && scope.metricName === 'followers'), true);
    assert.equal(byName.get('posts')?.dimensions?.network, 'linkedin');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Metricool refuses historical repair because post counters are current cumulative state', async (t) => {
  const fetchMock = t.mock.method(globalThis, 'fetch', async () => {
    throw new Error('network should not be called');
  });

  await assert.rejects(
    () => collect(
      {
        METRICOOL_URL: 'https://app.metricool.com/evolution/web?blogId=blog-1&userId=user-1',
        _pointInTimeDate: '2026-07-17',
        _explicitRange: true,
      },
      { METRICOOL_API_TOKEN: 'token' },
      { from: '2026-04-01', to: '2026-04-01' },
    ),
    /historical backfill is not supported safely/,
  );
  assert.equal(fetchMock.mock.callCount(), 0);
});

test('Metricool averages only observed engagement and persists its exact denominator', async (t) => {
  t.mock.method(globalThis, 'fetch', async (url) => {
    const href = String(url);
    if (href.includes('/admin/simpleProfiles')) {
      return Response.json([{ id: 'blog-1', instagram: true }]);
    }
    if (href.includes('/explore/followers/blog-1')) return Response.json({});
    return Response.json({ data: [
      { impressions: 100, engagement: 8 },
      { impressions: 50 },
    ] });
  });

  const result = await collect(
    { METRICOOL_URL: 'https://app.metricool.com/evolution/web?blogId=blog-1&userId=user-1' },
    { METRICOOL_API_TOKEN: 'token' },
    { from: '2026-07-02', to: '2026-07-02' },
  );
  const networkMetric = (name) => result.metrics.find(
    (metric) => metric.name === name && metric.dimensions?.network === 'instagram',
  );
  assert.equal(networkMetric('posts')?.value, 2);
  assert.equal(networkMetric('postsWithEngagement')?.value, 1);
  assert.equal(networkMetric('avgEngagement')?.value, 8);
  assert.equal(networkMetric('avgEngagement')?.quality, 'partial');
  assert.equal(result.quality, 'partial');
});

test('Metricool rejects multi-day ranges instead of storing a period aggregate on day one', async () => {
  await assert.rejects(
    () => collect(
      {},
      {},
      { from: '2026-07-14', to: '2026-07-15' },
    ),
    /collect one day at a time/,
  );
});

test('Metricool maps each provider post schema without converting missing fields to zero', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const href = String(url);
    if (href.includes('/admin/simpleProfiles')) {
      return Response.json([{ id: 'blog-1', facebook: 'page', twitter: 'account', tiktok: 'account' }]);
    }
    if (href.includes('/explore/followers/blog-1')) return Response.json({});
    if (href.includes('/posts/facebook')) {
      return Response.json({ data: [{ impressions: 100, clicks: 5, reactions: 9, comments: 2, shares: 3, impressionsUnique: 80, engagement: 4 }] });
    }
    if (href.includes('/posts/twitter')) {
      return Response.json({ data: [{ totalImpressions: 70, totalLinkClicks: 4, totalLikes: 6, totalReplies: 1, totalRetweets: 2, totalQuotes: 1, totalBookmarks: 3, totalEngagement: 2.5 }] });
    }
    if (href.includes('/posts/tiktok')) {
      return Response.json({ data: [{ viewCount: 200, likeCount: 20, commentCount: 4, shareCount: 5, reach: 150, engagement: 8 }] });
    }
    return new Response('', { status: 404 });
  };

  try {
    const result = await collect(
      { METRICOOL_URL: 'https://app.metricool.com/evolution/web?blogId=blog-1&userId=user-1' },
      { METRICOOL_API_TOKEN: 'token' },
      { from: '2026-07-02', to: '2026-07-02' },
    );
    const value = (network, name) => result.metrics.find((metric) => metric.dimensions?.network === network && metric.name === name)?.value;
    assert.equal(value('facebook', 'likes'), 9);
    assert.equal(value('facebook', 'reach'), 80);
    assert.equal(value('twitter', 'impressions'), 70);
    assert.equal(value('twitter', 'shares'), 3);
    assert.equal(value('twitter', 'saves'), 3);
    assert.equal(value('tiktok', 'videoViews'), 200);
    assert.equal(value('tiktok', 'likes'), 20);
    assert.equal(value('tiktok', 'impressions'), undefined);
    assert.equal(value('tiktok', 'clicks'), undefined);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Metricool rejects malformed numeric post data instead of persisting a false zero', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const href = String(url);
    if (href.includes('/admin/simpleProfiles')) return Response.json([{ id: 'blog-1', instagram: 'account' }]);
    if (href.includes('/explore/followers/blog-1')) return Response.json({});
    return Response.json({ data: [{ impressions: 'not-a-number' }] });
  };

  try {
    await assert.rejects(
      collect(
        { METRICOOL_URL: 'https://app.metricool.com/evolution/web?blogId=blog-1&userId=user-1' },
        { METRICOOL_API_TOKEN: 'token' },
        { from: '2026-07-02', to: '2026-07-02' },
      ),
      /invalid numeric instagram\.impressions/,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Metricool accepts the CSV download returned by LinkedIn/X post endpoints', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const href = String(url);
    if (href.includes('/admin/simpleProfiles')) return Response.json([{ id: 'blog-1', linkedinCompany: 'company' }]);
    if (href.includes('/explore/followers/blog-1')) return Response.json({});
    return new Response(
      'impressions,clicks,likes,comments,shares,engagement,url\r\n120,7,9,2,3,4.5,"https://example.com/post"\r\n',
      { headers: { 'content-type': 'text/csv' } },
    );
  };

  try {
    const result = await collect(
      { METRICOOL_URL: 'https://app.metricool.com/evolution/web?blogId=blog-1&userId=user-1' },
      { METRICOOL_API_TOKEN: 'token' },
      { from: '2026-07-02', to: '2026-07-02' },
    );
    const value = (name) => result.metrics.find((metric) => metric.name === name && metric.dimensions?.network === 'linkedin')?.value;
    assert.equal(value('impressions'), 120);
    assert.equal(value('clicks'), 7);
    assert.equal(value('likes'), 9);
    assert.equal(value('avgEngagement'), 4.5);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Metricool marks results partial when a connected network is unsupported', async (t) => {
  t.mock.method(globalThis, 'fetch', async (url) => {
    const href = String(url);
    if (href.includes('/admin/simpleProfiles')) {
      return Response.json([{ id: 'blog-1', instagram: true, youtube: true }]);
    }
    if (href.includes('/explore/followers/blog-1')) return Response.json({});
    if (href.includes('/posts/instagram')) return Response.json({ data: [] });
    return new Response('', { status: 404 });
  });
  const result = await collect(
    { METRICOOL_URL: 'https://app.metricool.com/evolution/web?blogId=blog-1&userId=user-1' },
    { METRICOOL_API_TOKEN: 'token' },
    { from: '2026-07-02', to: '2026-07-02' },
  );
  assert.equal(result.quality, 'partial');
  assert.ok(result.metrics.some((metric) => metric.dimensions?.network === 'instagram'));
  assert.ok(result.metrics.every((metric) => metric.dimensions?.network !== 'youtube'));
});

test('Metricool post detail keeps unsupported numeric fields absent', async (t) => {
  t.mock.method(globalThis, 'fetch', async (url) => {
    const href = String(url);
    if (href.includes('/admin/simpleProfiles')) {
      return Response.json([{ id: 'blog-1', instagram: true }]);
    }
    if (href.includes('/explore/followers/blog-1')) return Response.json({});
    return Response.json({ data: [{ impressions: 10, url: 'https://example.com/minimal' }] });
  });
  const result = await collect(
    { METRICOOL_URL: 'https://app.metricool.com/evolution/web?blogId=blog-1&userId=user-1' },
    { METRICOOL_API_TOKEN: 'token' },
    { from: '2026-07-02', to: '2026-07-02' },
  );
  const detail = result.metrics.find((metric) => metric.name === 'postDetail');
  assert.equal(detail?.value, 10);
  for (const key of ['likes', 'clicks', 'shares', 'saves', 'reach', 'videoViews', 'engagement']) {
    assert.equal(Object.hasOwn(detail?.dimensions ?? {}, key), false);
  }
  for (const name of ['postLikes', 'postClicks', 'postShares', 'postSaves', 'postReach', 'postVideoViews', 'postEngagement']) {
    assert.equal(result.metrics.some((metric) => metric.name === name), false);
  }
});

test('Metricool keeps one stable post identity while cumulative counters change', async (t) => {
  let observation = { impressions: 100, likes: 2, engagement: 1.5 };
  t.mock.method(globalThis, 'fetch', async (url) => {
    const href = String(url);
    if (href.includes('/admin/simpleProfiles')) {
      return Response.json([{ id: 'blog-1', instagram: true }]);
    }
    if (href.includes('/explore/followers/blog-1')) return Response.json({});
    return Response.json({ data: [{
      id: 'provider-post-7',
      url: 'https://example.com/stable-post',
      text: 'Stable copy',
      createdAt: '2026-06-30T09:00:00Z',
      ...observation,
    }] });
  });

  const config = {
    METRICOOL_URL: 'https://app.metricool.com/evolution/web?blogId=blog-1&userId=user-1',
  };
  const env = { METRICOOL_API_TOKEN: 'token' };
  const first = await collect(config, env, { from: '2026-07-01', to: '2026-07-01' });
  observation = { impressions: 160, likes: 5, engagement: 2.25 };
  const second = await collect(config, env, { from: '2026-07-02', to: '2026-07-02' });

  const firstDetail = first.metrics.find((metric) => metric.name === 'postDetail');
  const secondDetail = second.metrics.find((metric) => metric.name === 'postDetail');
  const identity = {
    network: 'instagram',
    postId: 'provider-post-7',
    url: 'https://example.com/stable-post',
    text: 'Stable copy',
    publishedDate: '2026-06-30',
  };
  assert.deepEqual(firstDetail?.dimensions, identity);
  assert.deepEqual(secondDetail?.dimensions, identity);
  assert.equal(firstDetail?.date, '2026-07-01');
  assert.equal(secondDetail?.date, '2026-07-02');
  assert.equal(firstDetail?.value, 100);
  assert.equal(secondDetail?.value, 160);
  assert.equal(first.metrics.find((metric) => metric.name === 'postLikes')?.value, 2);
  assert.equal(second.metrics.find((metric) => metric.name === 'postLikes')?.value, 5);
  assert.equal(first.metrics.find((metric) => metric.name === 'postEngagement')?.value, 1.5);
  assert.equal(second.metrics.find((metric) => metric.name === 'postEngagement')?.value, 2.25);
});

test('Metricool paginates every posts page before computing totals and top posts', async (t) => {
  let postRequests = 0;
  t.mock.method(globalThis, 'fetch', async (url) => {
    const href = String(url);
    if (href.includes('/admin/simpleProfiles')) {
      return Response.json([{ id: 'blog-1', instagram: true }]);
    }
    if (href.includes('/explore/followers/blog-1')) return Response.json({});
    postRequests += 1;
    if (new URL(href).searchParams.get('cursor') === 'page-2') {
      return Response.json({ data: [{
        id: 'post-2',
        impressions: 50,
        engagement: 3,
        url: 'https://example.com/post-2',
      }], page: { next: null } });
    }
    return Response.json({ data: [{
      id: 'post-1',
      impressions: 100,
      engagement: 1,
      url: 'https://example.com/post-1',
    }], page: {
      next: 'https://app.metricool.com/api/v2/analytics/posts/instagram?cursor=page-2',
    } });
  });

  const result = await collect(
    { METRICOOL_URL: 'https://app.metricool.com/evolution/web?blogId=blog-1&userId=user-1' },
    { METRICOOL_API_TOKEN: 'token' },
    { from: '2026-07-02', to: '2026-07-02' },
  );
  const metric = (name) => result.metrics.find(
    (row) => row.name === name && row.dimensions?.network === 'instagram' && !row.dimensions?.postId,
  );
  assert.equal(postRequests, 2);
  assert.equal(metric('posts')?.value, 2);
  assert.equal(metric('impressions')?.value, 150);
  assert.equal(metric('postsWithEngagement')?.value, 2);
  assert.equal(metric('avgEngagement')?.value, 2);
  assert.equal(result.metrics.filter((row) => row.name === 'postDetail').length, 2);
});

test('Metricool rejects cyclic and unsafe provider pagination links', async (t) => {
  t.mock.method(globalThis, 'fetch', async (url) => {
    const href = String(url);
    if (href.includes('/admin/simpleProfiles')) {
      return Response.json([{ id: 'blog-1', instagram: true }]);
    }
    if (href.includes('/explore/followers/blog-1')) return Response.json({});
    return Response.json({ data: [], page: { next: href } });
  });
  await assert.rejects(
    () => collect(
      { METRICOOL_URL: 'https://app.metricool.com/evolution/web?blogId=blog-1&userId=user-1' },
      { METRICOOL_API_TOKEN: 'token' },
      { from: '2026-07-02', to: '2026-07-02' },
    ),
    /repeated pagination URL/,
  );

  t.mock.restoreAll();
  t.mock.method(globalThis, 'fetch', async (url) => {
    const href = String(url);
    if (href.includes('/admin/simpleProfiles')) {
      return Response.json([{ id: 'blog-1', instagram: true }]);
    }
    if (href.includes('/explore/followers/blog-1')) return Response.json({});
    return Response.json({ data: [], page: { next: 'https://evil.example/api/posts' } });
  });
  await assert.rejects(
    () => collect(
      { METRICOOL_URL: 'https://app.metricool.com/evolution/web?blogId=blog-1&userId=user-1' },
      { METRICOOL_API_TOKEN: 'token' },
      { from: '2026-07-02', to: '2026-07-02' },
    ),
    /unsafe page\.next URL/,
  );
});

test('Metricool fails closed when provider pagination exceeds the safety cap', async (t) => {
  let postRequests = 0;
  t.mock.method(globalThis, 'fetch', async (url) => {
    const href = String(url);
    if (href.includes('/admin/simpleProfiles')) {
      return Response.json([{ id: 'blog-1', instagram: true }]);
    }
    if (href.includes('/explore/followers/blog-1')) return Response.json({});
    postRequests += 1;
    return Response.json({ data: [], page: {
      next: `https://app.metricool.com/api/v2/analytics/posts/instagram?cursor=${postRequests + 1}`,
    } });
  });
  await assert.rejects(
    () => collect(
      { METRICOOL_URL: 'https://app.metricool.com/evolution/web?blogId=blog-1&userId=user-1' },
      { METRICOOL_API_TOKEN: 'token' },
      { from: '2026-07-02', to: '2026-07-02' },
    ),
    /pagination exceeded 100 pages/,
  );
  assert.equal(postRequests, 100);
});

test('Metricool rejects impossible dates before making a request', async (t) => {
  const fetchMock = t.mock.method(globalThis, 'fetch', async () => {
    throw new Error('network should not be called');
  });
  await assert.rejects(
    () => collect({}, {}, { from: '2026-02-30', to: '2026-02-30' }),
    /invalid date range/,
  );
  assert.equal(fetchMock.mock.callCount(), 0);
});
