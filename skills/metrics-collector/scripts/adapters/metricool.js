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

const BASE_URL = 'https://app.metricool.com/api';

// Networks to check via v2 analytics
const V2_NETWORKS = ['linkedin', 'instagram', 'facebook', 'twitter', 'tiktok'];

function numberFrom(obj, keys) {
  for (const key of keys) {
    const value = obj?.[key];
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function nestedNumberFrom(obj, pathOptions) {
  for (const path of pathOptions) {
    const parts = path.split('.');
    let cur = obj;
    for (const part of parts) cur = cur?.[part];
    const n = Number(cur);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function metricIfObserved(metrics, name, value, date, dimensions, observed) {
  if (observed || value > 0) {
    metrics.push({ name, value, date, dimensions });
  }
}

function pushEmptyNetworkMetrics(metrics, network, date, followersByNetwork) {
  const dims = { network };
  metrics.push(
    { name: 'posts', value: 0, date, dimensions: dims },
    { name: 'impressions', value: 0, date, dimensions: dims },
    { name: 'clicks', value: 0, date, dimensions: dims },
    { name: 'likes', value: 0, date, dimensions: dims },
    { name: 'comments', value: 0, date, dimensions: dims },
    { name: 'avgEngagement', value: 0, date, dimensions: dims },
    { name: 'reach', value: 0, date, dimensions: dims },
    { name: 'shares', value: 0, date, dimensions: dims },
    { name: 'saves', value: 0, date, dimensions: dims },
    { name: 'videoViews', value: 0, date, dimensions: dims },
  );
  if (followersByNetwork.has(network)) {
    metrics.push({ name: 'followers', value: followersByNetwork.get(network), date, dimensions: dims });
  }
}

function profileFollowers(brand, network) {
  const prefixed = [
    `${network}Followers`,
    `${network}FollowersCount`,
    `${network}_followers`,
    `${network}_followers_count`,
  ];
  const direct = numberFrom(brand, prefixed);
  if (direct != null) return direct;
  return nestedNumberFrom(brand, [
    `${network}.followers`,
    `${network}.followersCount`,
    `${network}.followers_count`,
    `${network}.fanCount`,
    `${network}.fans`,
    `${network}.subscribers`,
  ]);
}

/**
 * @param {object} config - From integrations.json (e.g. { METRICOOL_URL: "..." })
 * @param {object} env - { METRICOOL_API_TOKEN, METRICOOL_USER_ID, METRICOOL_BLOG_ID }
 * @param {{ from: string, to: string }} dateRange
 */
export async function collect(config, env, dateRange) {
  const userToken = env.METRICOOL_USER_TOKEN || env.METRICOOL_API_TOKEN;
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
    throw new Error('Metricool: missing API token, userId, or blogId. Set METRICOOL_API_TOKEN in .env and METRICOOL_URL in config.');
  }

  const headers = {
    'X-Mc-Auth': userToken,
    'Content-Type': 'application/json',
  };

  const metrics = [];
  const from = `${dateRange.from}T00:00:00`;
  const to = `${dateRange.to}T23:59:59`;

  // --- Detect connected networks ---
  let connectedNetworks = new Set();
  const followersByNetwork = new Map();
  try {
    const profileResp = await fetch(
      `${BASE_URL}/admin/simpleProfiles?userId=${userId}&blogId=${blogId}`,
      { headers }
    );
    if (profileResp.ok) {
      const profiles = await profileResp.json();
      const brand = profiles.find(p => String(p.id) === String(blogId));
      if (brand) {
        if (brand.instagram) connectedNetworks.add('instagram');
        if (brand.facebook || brand.facebookPageId) connectedNetworks.add('facebook');
        if (brand.twitter) connectedNetworks.add('twitter');
        if (brand.linkedinCompany) connectedNetworks.add('linkedin');
        if (brand.tiktok) connectedNetworks.add('tiktok');
        if (brand.youtube) connectedNetworks.add('youtube');
        for (const network of connectedNetworks) {
          const followers = profileFollowers(brand, network);
          if (followers != null) followersByNetwork.set(network, followers);
        }
      }
    }
  } catch (err) {
    // If detection fails, try all networks
    connectedNetworks = new Set(V2_NETWORKS);
  }

  if (connectedNetworks.size === 0) {
    console.warn('  ⚠️  Metricool: no social networks connected for this brand');
    return { source: 'metricool', date: dateRange.from, metrics: [] };
  }

  console.log(`  📡 Connected networks: ${[...connectedNetworks].join(', ')}`);

  // --- Pull posts per network via v2 API ---
  for (const network of connectedNetworks) {
    if (!V2_NETWORKS.includes(network)) continue;

    try {
      const url = `${BASE_URL}/v2/analytics/posts/${network}?userId=${userId}&blogId=${blogId}&from=${from}&to=${to}`;
      const resp = await fetch(url, { headers });

      if (!resp.ok) {
        const body = await resp.text().catch(() => '');
        if (resp.status === 403) {
          console.warn(`  ⚠️  Metricool ${network}: not connected (403)`);
        } else {
          console.warn(`  ⚠️  Metricool ${network} ${resp.status}: ${body.slice(0, 100)}`);
        }
        continue;
      }

      const data = await resp.json();
      const posts = data.data || (Array.isArray(data) ? data : []);
      const dims = { network };

      if (posts.length === 0) {
        pushEmptyNetworkMetrics(metrics, network, dateRange.from, followersByNetwork);
        console.log(`  ✅ ${network}: 0 posts`);
        continue;
      }

      // Aggregate metrics for the period
      let totalImpressions = 0, totalClicks = 0, totalLikes = 0, totalComments = 0;
      let totalEngagement = 0;
      let totalReach = 0, totalShares = 0, totalSaves = 0, totalVideoViews = 0;
      let hasReach = false, hasShares = false, hasSaves = false, hasVideoViews = false;

      for (const post of posts) {
        totalImpressions += post.impressions || 0;
        totalClicks += post.clicks || 0;
        totalLikes += post.likes || post.likeCount || 0;
        totalComments += post.comments || post.commentCount || 0;
        totalEngagement += post.engagement || 0;
        const reach = numberFrom(post, ['reach', 'totalReach', 'accountsReached']);
        const shares = numberFrom(post, ['shares', 'shareCount', 'shared']);
        const saves = numberFrom(post, ['saves', 'saved', 'saveCount']);
        const videoViews = numberFrom(post, ['videoViews', 'video_views', 'views', 'reproductions', 'plays']);
        if (reach != null) { totalReach += reach; hasReach = true; }
        if (shares != null) { totalShares += shares; hasShares = true; }
        if (saves != null) { totalSaves += saves; hasSaves = true; }
        if (videoViews != null) { totalVideoViews += videoViews; hasVideoViews = true; }
      }

      const avgEngagement = posts.length > 0 ? Math.round(totalEngagement / posts.length * 100) / 100 : 0;
      metrics.push(
        { name: 'posts', value: posts.length, date: dateRange.from, dimensions: dims },
        { name: 'impressions', value: totalImpressions, date: dateRange.from, dimensions: dims },
        { name: 'clicks', value: totalClicks, date: dateRange.from, dimensions: dims },
        { name: 'likes', value: totalLikes, date: dateRange.from, dimensions: dims },
        { name: 'comments', value: totalComments, date: dateRange.from, dimensions: dims },
        { name: 'avgEngagement', value: avgEngagement, date: dateRange.from, dimensions: dims },
      );
      metricIfObserved(metrics, 'reach', totalReach, dateRange.from, dims, hasReach);
      metricIfObserved(metrics, 'shares', totalShares, dateRange.from, dims, hasShares);
      metricIfObserved(metrics, 'saves', totalSaves, dateRange.from, dims, hasSaves);
      metricIfObserved(metrics, 'videoViews', totalVideoViews, dateRange.from, dims, hasVideoViews);
      if (followersByNetwork.has(network)) {
        metrics.push({ name: 'followers', value: followersByNetwork.get(network), date: dateRange.from, dimensions: dims });
      }

      // Also add per-post detail (top 5 by impressions)
      const sortedPosts = [...posts].sort((a, b) => (b.impressions || 0) - (a.impressions || 0));
      for (const post of sortedPosts.slice(0, 5)) {
        const date = post.created?.dateTime?.slice(0, 10) || dateRange.from;
        const text = (post.comment || post.text || post.caption || '').slice(0, 80);
        metrics.push({
          name: 'postDetail',
          value: post.impressions || 0,
          date,
          dimensions: {
            network,
            url: post.url || '',
            likes: post.likes || 0,
            clicks: post.clicks || 0,
            shares: numberFrom(post, ['shares', 'shareCount', 'shared']) || 0,
            saves: numberFrom(post, ['saves', 'saved', 'saveCount']) || 0,
            reach: numberFrom(post, ['reach', 'totalReach', 'accountsReached']) || 0,
            videoViews: numberFrom(post, ['videoViews', 'video_views', 'views', 'reproductions', 'plays']) || 0,
            engagement: Math.round((post.engagement || 0) * 100) / 100,
            text: text,
          },
        });
      }

      console.log(`  ✅ ${network}: ${posts.length} posts, ${totalImpressions} impressions, avg eng ${avgEngagement}%`);
    } catch (err) {
      console.warn(`  ⚠️  Metricool ${network} error: ${err.message}`);
    }
  }

  return { source: 'metricool', date: dateRange.from, metrics };
}
