/**
 * Metricool Adapter — Social media analytics via Metricool API v2
 *
 * Auth: X-Mc-Auth header with API token.
 * Pulls: posts with engagement per connected network.
 * Uses /v2/analytics/posts/{network} endpoint (reliable, returns per-post data).
 * Also checks /admin/simpleProfiles to detect connected networks.
 *
 * API docs: https://app.metricool.com/api/swagger.json
 */

import { pointInTimeMetricDate } from '../adapter-date-range.js';

const BASE_URL = 'https://app.metricool.com/api';
const BASE_ORIGIN = new URL(BASE_URL).origin;
const MAX_POST_PAGES = 100;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Networks to check via v2 analytics
const V2_NETWORKS = ['linkedin', 'instagram', 'facebook', 'twitter', 'tiktok'];

// The post schemas are not uniform across networks. These aliases mirror the
// provider's OpenAPI models instead of treating an absent field as a real zero.
const POST_FIELDS = {
  instagram: {
    impressions: ['impressionsTotal', 'impressions'],
    clicks: ['clicks'],
    likes: ['likes'],
    comments: ['comments'],
    engagement: ['engagement'],
    reach: ['reach'],
    shares: ['shares'],
    saves: ['saved', 'saves'],
    videoViews: ['videoViewsTotal', 'views', 'videoViews'],
  },
  facebook: {
    impressions: ['impressions'],
    clicks: ['clicks'],
    likes: ['reactions', 'likes'],
    comments: ['comments'],
    engagement: ['engagement'],
    reach: ['impressionsUnique', 'reach'],
    shares: ['shares'],
    videoViews: ['videoViews'],
  },
  linkedin: {
    impressions: ['impressions'],
    clicks: ['clicks'],
    likes: ['likes'],
    comments: ['comments'],
    engagement: ['engagement'],
    reach: ['uniqueImpressions', 'reach'],
    shares: ['shares'],
    videoViews: ['videoViews'],
  },
  twitter: {
    impressions: ['totalImpressions', 'impressions'],
    clicks: ['totalLinkClicks', 'clicks'],
    likes: ['totalLikes', 'likes'],
    comments: ['totalReplies', 'comments'],
    engagement: ['totalEngagement', 'engagement'],
    shares: ['totalRetweets', 'shares'],
    saves: ['totalBookmarks', 'saves'],
    videoViews: ['totalVideoViews', 'videoViews'],
  },
  tiktok: {
    likes: ['likeCount', 'likes'],
    comments: ['commentCount', 'comments'],
    engagement: ['engagement'],
    reach: ['reach'],
    shares: ['shareCount', 'shares'],
    videoViews: ['viewCount', 'views', 'videoViews'],
  },
};

const METRICOOL_POST_METRIC_NAMES = [
  'posts',
  'postsWithEngagement',
  'avgEngagement',
  'impressions',
  'clicks',
  'likes',
  'comments',
  'reach',
  'shares',
  'saves',
  'videoViews',
  'postDetail',
  'postLikes',
  'postClicks',
  'postShares',
  'postSaves',
  'postReach',
  'postVideoViews',
  'postEngagement',
];

function normalizedKey(value) {
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/gi, '')
    .toLowerCase();
}

function isCalendarDate(value) {
  if (!ISO_DATE_RE.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function valueAt(obj, key) {
  if (Object.prototype.hasOwnProperty.call(obj || {}, key)) return obj[key];
  const wanted = normalizedKey(key);
  const matchingKey = Object.keys(obj || {}).find((candidate) => normalizedKey(candidate) === wanted);
  return matchingKey == null ? undefined : obj[matchingKey];
}

function numberFrom(obj, keys, label = keys[0] || 'value') {
  for (const key of keys) {
    const value = valueAt(obj, key);
    if (value == null || value === '') continue;
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0) {
      throw new Error(`Metricool: invalid numeric ${label}`);
    }
    return n;
  }
  return null;
}

function textFrom(obj, keys) {
  for (const key of keys) {
    const value = valueAt(obj, key);
    if (value == null) continue;
    const text = String(value).trim();
    if (text) return text;
  }
  return '';
}

function publishedDateOf(post) {
  const candidate =
    post?.created?.dateTime ||
    post?.publishedAt?.dateTime ||
    post?.createdAt?.dateTime ||
    post?.publishedAt ||
    post?.createdAt ||
    post?.createTime;
  if (typeof candidate !== 'string') return '';
  const date = candidate.slice(0, 10);
  return isCalendarDate(date) ? date : '';
}

function pushEmptyNetworkMetrics(metrics, network, date, followersByNetwork, followersDate) {
  const dims = { network };
  metrics.push(
    { name: 'posts', value: 0, date, dimensions: dims },
    { name: 'postsWithEngagement', value: 0, date, dimensions: dims },
  );
  for (const field of Object.keys(POST_FIELDS[network] || {})) {
    // An average has no denominator when there are no posts. Additive activity
    // is a legitimate zero; avgEngagement must remain missing.
    if (field === 'engagement') continue;
    const name = field === 'engagement' ? 'avgEngagement' : field;
    metrics.push({ name, value: 0, date, dimensions: dims });
  }
  if (followersByNetwork.has(network)) {
    metrics.push({ name: 'followers', value: followersByNetwork.get(network), date: followersDate, dimensions: dims });
  }
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  const firstLine = text.split(/\r?\n/, 1)[0] || '';
  const delimiter = (firstLine.match(/;/g) || []).length > (firstLine.match(/,/g) || []).length ? ';' : ',';

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (char === '"') quoted = false;
      else field += char;
      continue;
    }
    if (char === '"') quoted = true;
    else if (char === delimiter) {
      row.push(field);
      field = '';
    } else if (char === '\n') {
      row.push(field.replace(/\r$/, ''));
      rows.push(row);
      row = [];
      field = '';
    } else field += char;
  }
  if (field || row.length) {
    row.push(field.replace(/\r$/, ''));
    rows.push(row);
  }
  if (quoted) throw new Error('Metricool: malformed CSV response');
  const [headers, ...values] = rows.filter((candidate) => candidate.some((cell) => cell !== ''));
  if (!headers) return [];
  return values.map((cells) => Object.fromEntries(headers.map((header, index) => [header.trim(), cells[index] ?? ''])));
}

async function readPostsResponse(response, network) {
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('json')) return response.json();
  const text = await response.text();
  const trimmed = text.trim();
  if (!trimmed) return [];
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      return JSON.parse(trimmed);
    } catch {
      throw new Error(`Metricool ${network}: malformed JSON response`);
    }
  }
  return parseCsv(text);
}

function validatedPostsPageUrl(rawUrl, currentUrl, network) {
  let parsed;
  try {
    parsed = new URL(rawUrl, currentUrl || `${BASE_URL}/`);
  } catch {
    throw new Error(`Metricool ${network}: malformed page.next URL`);
  }
  if (
    parsed.origin !== BASE_ORIGIN ||
    (parsed.pathname !== '/api' && !parsed.pathname.startsWith('/api/')) ||
    parsed.username ||
    parsed.password
  ) {
    throw new Error(`Metricool ${network}: unsafe page.next URL`);
  }
  parsed.hash = '';
  return parsed.toString();
}

async function collectPostPages(initialUrl, headers, network) {
  const posts = [];
  const visited = new Set();
  let nextUrl = validatedPostsPageUrl(initialUrl, `${BASE_URL}/`, network);

  for (let page = 1; nextUrl; page += 1) {
    if (page > MAX_POST_PAGES) {
      throw new Error(`Metricool ${network}: pagination exceeded ${MAX_POST_PAGES} pages`);
    }
    if (visited.has(nextUrl)) {
      throw new Error(`Metricool ${network}: repeated pagination URL`);
    }
    visited.add(nextUrl);

    const response = await fetch(nextUrl, { headers });
    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`Metricool ${network} HTTP ${response.status}: ${body.slice(0, 160)}`);
    }
    const payload = await readPostsResponse(response, network);
    if (Array.isArray(payload)) {
      posts.push(...payload);
      nextUrl = '';
      continue;
    }
    if (!payload || typeof payload !== 'object' || !Array.isArray(payload.data)) {
      throw new Error(`Metricool ${network}: posts response was not an array`);
    }
    posts.push(...payload.data);

    const pageInfo = payload.page;
    if (pageInfo == null) {
      nextUrl = '';
      continue;
    }
    if (typeof pageInfo !== 'object' || Array.isArray(pageInfo)) {
      throw new Error(`Metricool ${network}: malformed page metadata`);
    }
    const rawNext = pageInfo.next;
    if (rawNext == null || rawNext === '') {
      nextUrl = '';
    } else if (typeof rawNext === 'string') {
      nextUrl = validatedPostsPageUrl(rawNext, nextUrl, network);
    } else {
      throw new Error(`Metricool ${network}: malformed page.next URL`);
    }
  }
  return posts;
}

function followerNetwork(key) {
  const normalized = normalizedKey(key);
  if (normalized.includes('linkedin')) return 'linkedin';
  if (normalized === 'x' || normalized.includes('twitter')) return 'twitter';
  return V2_NETWORKS.find((network) => normalized.includes(network)) || null;
}

async function collectFollowers({ userId, blogId, headers }) {
  const params = new URLSearchParams({ userId: String(userId), blogId: String(blogId) });
  const response = await fetch(`${BASE_URL}/explore/followers/${encodeURIComponent(blogId)}?${params}`, { headers });
  if (!response.ok) {
    console.warn(`  Warning: Metricool followers skipped (HTTP ${response.status})`);
    return { followers: new Map(), partial: true };
  }
  const data = await response.json();
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('Metricool followers response was not an object');
  }
  const followers = new Map();
  for (const [key, raw] of Object.entries(data)) {
    const network = followerNetwork(key);
    if (!network) continue;
    const value = numberFrom({ value: raw }, ['value'], `followers.${key}`);
    if (value != null) followers.set(network, value);
  }
  return { followers, partial: false };
}

/**
 * @param {object} config - From integrations.json (e.g. { METRICOOL_URL: "..." })
 * @param {object} env - { METRICOOL_API_TOKEN, METRICOOL_USER_ID, METRICOOL_BLOG_ID }
 * @param {{ from: string, to: string }} dateRange
 */
export async function collect(config, env, dateRange) {
  if (!isCalendarDate(dateRange.from) || !isCalendarDate(dateRange.to)) {
    throw new Error(`Metricool: invalid date range ${dateRange.from || '?'}..${dateRange.to || '?'}`);
  }
  if (dateRange.from !== dateRange.to) {
    throw new Error('Metricool: multi-day ranges are not supported safely; collect one day at a time');
  }
  const observationDate = pointInTimeMetricDate(config, dateRange);
  if (config._explicitRange === true && observationDate !== dateRange.from) {
    throw new Error(
      'Metricool: historical backfill is not supported safely; post analytics are current cumulative counters for posts created in the requested period',
    );
  }
  const userToken = env.METRICOOL_USER_TOKEN || env.METRICOOL_API_TOKEN || env.METRICOOL_API_KEY;
  let userId = env.METRICOOL_USER_ID;
  let blogId = env.METRICOOL_BLOG_ID;

  // Parse blogId/userId from METRICOOL_URL config if not in env
  const mcUrl = config.METRICOOL_URL || config.metricoolUrl;
  if (mcUrl && (!blogId || !userId)) {
    try {
      const parsed = new URL(mcUrl.startsWith('http') ? mcUrl : `https://${mcUrl}`);
      blogId = blogId || parsed.searchParams.get('blogId');
      userId = userId || parsed.searchParams.get('userId');
    } catch (_) {}
  }

  if (!userToken || !userId || !blogId) {
    throw new Error('Metricool: missing API token, userId, or blogId. Set METRICOOL_API_TOKEN (or legacy METRICOOL_API_KEY) in .env and METRICOOL_URL in config.');
  }

  const headers = {
    'X-Mc-Auth': userToken,
    'Content-Type': 'application/json',
    'Accept': 'application/json, text/csv',
  };

  const metrics = [];
  let incompleteEngagementCoverage = false;
  const from = `${dateRange.from}T00:00:00`;
  const to = `${dateRange.to}T23:59:59`;

  // --- Detect connected networks ---
  const connectedNetworks = new Set();
  let followersByNetwork = new Map();
  let followersCollectionPartial = false;
  const profileResp = await fetch(
    `${BASE_URL}/admin/simpleProfiles?userId=${userId}&blogId=${blogId}`,
    { headers }
  );
  if (!profileResp.ok) {
    const body = await profileResp.text().catch(() => '');
    throw new Error(`Metricool profiles HTTP ${profileResp.status}: ${body.slice(0, 160)}`);
  }
  const profiles = await profileResp.json();
  if (!Array.isArray(profiles)) {
    throw new Error('Metricool profiles response was not an array');
  }
  const brand = profiles.find(p => String(p.id ?? p.blogId) === String(blogId));
  if (!brand) {
    throw new Error(`Metricool: blogId ${blogId} not found in simpleProfiles`);
  }
  if (brand.instagram) connectedNetworks.add('instagram');
  if (brand.facebook || brand.facebookPageId) connectedNetworks.add('facebook');
  if (brand.twitter) connectedNetworks.add('twitter');
  if (brand.linkedinCompany) connectedNetworks.add('linkedin');
  if (brand.tiktok) connectedNetworks.add('tiktok');
  if (brand.youtube) connectedNetworks.add('youtube');
  const followersResult = await collectFollowers({ userId, blogId, headers });
  followersByNetwork = followersResult.followers;
  followersCollectionPartial = followersResult.partial;

  if (connectedNetworks.size === 0) {
    throw new Error('Metricool: no social networks connected for this brand');
  }

  console.log(`  📡 Connected networks: ${[...connectedNetworks].join(', ')}`);
  const unsupportedNetworks = [...connectedNetworks].filter(
    (network) => !V2_NETWORKS.includes(network),
  );
  if (unsupportedNetworks.length) {
    console.warn(`  Warning: Metricool networks not covered by post analytics: ${unsupportedNetworks.join(', ')}`);
  }

  // --- Pull posts per network via v2 API ---
  for (const network of connectedNetworks) {
    if (!V2_NETWORKS.includes(network)) continue;

    const params = new URLSearchParams({
      userId: String(userId),
      blogId: String(blogId),
      from,
      to,
    });
    const timezone = config.timezone || config.TIMEZONE || brand.timezone;
    if (timezone) params.set('timezone', timezone);
    const url = `${BASE_URL}/v2/analytics/posts/${network}?${params}`;
    const posts = await collectPostPages(url, headers, network);
    const dims = { network };

    if (posts.length === 0) {
      pushEmptyNetworkMetrics(
        metrics,
        network,
        dateRange.from,
        followersByNetwork,
        observationDate,
      );
      console.log(`  ✅ ${network}: 0 posts`);
      continue;
    }

    // Aggregate only fields that the provider actually returned. Metricool's
    // schemas vary by network (for example Facebook uses `reactions`, X uses
    // `totalLikes`, and TikTok uses `likeCount`). Missing is not zero.
    const aliases = POST_FIELDS[network] || {};
    const totals = Object.fromEntries(Object.keys(aliases).map((name) => [name, 0]));
    const observed = new Set();
    let postsWithEngagement = 0;
    for (const post of posts) {
      for (const [name, keys] of Object.entries(aliases)) {
        let value = numberFrom(post, keys, `${network}.${name}`);
        // X quotes are a second, non-overlapping share action in the provider
        // schema. Include them alongside retweets when the canonical `shares`
        // field is not present.
        if (network === 'twitter' && name === 'shares' && value != null && valueAt(post, 'shares') == null) {
          value += numberFrom(post, ['totalQuotes'], 'twitter.totalQuotes') ?? 0;
        }
        if (value == null) continue;
        totals[name] += value;
        observed.add(name);
        if (name === 'engagement') postsWithEngagement += 1;
      }
    }

    const engagementCoverageIncomplete = postsWithEngagement < posts.length;
    if (engagementCoverageIncomplete) incompleteEngagementCoverage = true;
    metrics.push(
      { name: 'posts', value: posts.length, date: dateRange.from, dimensions: dims },
      {
        name: 'postsWithEngagement',
        value: postsWithEngagement,
        date: dateRange.from,
        dimensions: dims,
      },
    );
    for (const name of observed) {
      const metricName = name === 'engagement' ? 'avgEngagement' : name;
      const value = name === 'engagement'
        ? Math.round((totals[name] / postsWithEngagement) * 100) / 100
        : totals[name];
      metrics.push({
        name: metricName,
        value,
        date: dateRange.from,
        dimensions: dims,
        ...(name === 'engagement' && engagementCoverageIncomplete ? { quality: 'partial' } : {}),
      });
    }
    if (followersByNetwork.has(network)) {
      metrics.push({ name: 'followers', value: followersByNetwork.get(network), date: observationDate, dimensions: dims });
    }

    // Also add per-post detail (top 5 by impressions)
    const primaryDetailValue = (post) => numberFrom(
      post,
      aliases.impressions || aliases.videoViews || [],
      `${network}.detail`,
    );
    const sortedPosts = [...posts].sort(
      (a, b) => (primaryDetailValue(b) ?? -1) - (primaryDetailValue(a) ?? -1),
    );
    for (const post of sortedPosts.slice(0, 5)) {
        const detailValue = primaryDetailValue(post);
        // A post-level row needs an observed headline measurement. Skipping it
        // is more accurate than inventing zero impressions/views.
        if (detailValue == null) continue;
        const publishedDate = publishedDateOf(post);
        const postId = textFrom(post, [
          'id',
          'postId',
          'publicationId',
          'mediaId',
          'tweetId',
          'videoId',
          'itemId',
        ]);
        const url = textFrom(post, ['url', 'link', 'shareUrl', 'permalink']);
        const text = textFrom(
          post,
          ['comment', 'text', 'content', 'caption', 'videoDescription'],
        ).slice(0, 80);
        // Without at least one provider-stable identity field two unrelated
        // posts could overwrite one another. Aggregate network totals remain
        // available; only the unreliable detail row is skipped.
        if (!postId && !url && !text) continue;

        let detailShares = numberFrom(post, aliases.shares || [], `${network}.shares`);
        if (network === 'twitter' && detailShares != null && valueAt(post, 'shares') == null) {
          detailShares += numberFrom(post, ['totalQuotes'], 'twitter.totalQuotes') ?? 0;
        }
        const detailSaves = numberFrom(post, aliases.saves || [], `${network}.saves`);
        const detailReach = numberFrom(post, aliases.reach || [], `${network}.reach`);
        const detailVideoViews = numberFrom(post, aliases.videoViews || [], `${network}.videoViews`);
        const detailEngagement = numberFrom(post, aliases.engagement || [], `${network}.engagement`);
        const detailLikes = numberFrom(post, aliases.likes || [], `${network}.likes`);
        const detailClicks = numberFrom(post, aliases.clicks || [], `${network}.clicks`);
        const dimensions = {
          network,
          ...(postId ? { postId } : {}),
          ...(url ? { url } : {}),
          ...(text ? { text } : {}),
          ...(publishedDate ? { publishedDate } : {}),
        };
        const detailMetrics = [
          ['postDetail', detailValue],
          ['postLikes', detailLikes],
          ['postClicks', detailClicks],
          ['postShares', detailShares],
          ['postSaves', detailSaves],
          ['postReach', detailReach],
          ['postVideoViews', detailVideoViews],
          ['postEngagement', detailEngagement],
        ];
        for (const [name, value] of detailMetrics) {
          if (value == null) continue;
          metrics.push({
            name,
            value: name === 'postEngagement'
              ? Math.round(value * 100) / 100
              : value,
            // Publication date is stable identity metadata; the snapshot date
            // is the provider observation day requested by the collector.
            date: dateRange.from,
            dimensions,
          });
        }
    }

    console.log(`  ✅ ${network}: ${posts.length} posts, ${totals.impressions ?? 0} impressions`);
  }

  if (!metrics.length) {
    throw new Error('Metricool: connected profiles contain no networks supported by the metrics collector');
  }

  return {
    source: 'metricool',
    date: dateRange.from,
    metrics,
    attemptedDates: [...new Set([dateRange.from, observationDate])].sort(),
    restatedScopes: [
      ...METRICOOL_POST_METRIC_NAMES.map((metricName) => ({
        metricDate: dateRange.from,
        metricName,
      })),
      { metricDate: observationDate, metricName: 'followers' },
    ],
    // The collected values are still real, but they do not cover every connected
    // network. Propagate that limitation into KPI quality badges.
    ...(
      unsupportedNetworks.length ||
      incompleteEngagementCoverage ||
      followersCollectionPartial
        ? { quality: 'partial' }
        : {}
    ),
  };
}
