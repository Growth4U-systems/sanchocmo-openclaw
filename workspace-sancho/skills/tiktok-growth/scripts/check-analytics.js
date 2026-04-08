#!/usr/bin/env node
/**
 * TikTok Analytics Checker (Metricool Edition)
 * 
 * Pulls TikTok post analytics via Metricool API v2.
 * 
 * How it works:
 * 1. Calls Metricool /v2/analytics/posts/tiktok endpoint
 * 2. Retrieves per-post metrics: impressions, likes, comments, engagement
 * 3. Saves analytics snapshot to analytics-snapshot.json
 * 
 * IMPORTANT LIMITATIONS vs Postiz:
 * - No automatic post ID matching/linking (Metricool doesn't expose release IDs)
 * - Cannot retroactively connect posts to TikTok video IDs
 * - Per-post metrics depend on Metricool's post tracking
 * - If a post was created outside Metricool, it won't appear here
 * 
 * Usage: node check-analytics.js --config <config.json> [--days 3]
 */

const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
function getArg(name) {
  const idx = args.indexOf(`--${name}`);
  return idx !== -1 ? args[idx + 1] : null;
}

const configPath = getArg('config');
const days = parseInt(getArg('days') || '3');

if (!configPath) {
  console.error('Usage: node check-analytics.js --config <config.json> [--days 3]');
  process.exit(1);
}

const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

// Validate Metricool config
if (!config.metricool?.userToken || !config.metricool?.userId || !config.metricool?.blogId) {
  console.error('❌ Missing Metricool config. Required: config.metricool.userToken, userId, blogId');
  process.exit(1);
}

const BASE_URL = 'https://app.metricool.com/api';
const headers = {
  'X-Mc-Auth': config.metricool.userToken,
  'Content-Type': 'application/json',
};

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

(async () => {
  const now = new Date();
  const startDate = new Date(now - days * 86400000);
  const from = `${startDate.toISOString().split('T')[0]}T00:00:00`;
  const to = `${now.toISOString().split('T')[0]}T23:59:59`;

  console.log(`📊 Checking TikTok analytics via Metricool (last ${days} days)\n`);

  // Fetch TikTok posts from Metricool
  const url = `${BASE_URL}/v2/analytics/posts/tiktok?userId=${config.metricool.userId}&blogId=${config.metricool.blogId}&from=${from}&to=${to}`;
  
  try {
    const resp = await fetch(url, { headers });

    if (!resp.ok) {
      const body = await resp.text().catch(() => '');
      if (resp.status === 403) {
        console.error('❌ TikTok not connected to this Metricool account (403)');
      } else {
        console.error(`❌ Metricool API error ${resp.status}: ${body.slice(0, 200)}`);
      }
      process.exit(1);
    }

    const data = await resp.json();
    const posts = data.data || (Array.isArray(data) ? data : []);

    if (posts.length === 0) {
      console.log('  No TikTok posts found in this date range.');
      console.log('  ⚠️  Metricool only tracks posts created/scheduled through Metricool.');
      process.exit(0);
    }

    console.log(`Found ${posts.length} TikTok posts\n`);

    // Parse and display per-post analytics
    const results = [];
    for (const post of posts) {
      const date = post.created?.dateTime?.slice(0, 10) || startDate.toISOString().slice(0, 10);
      const text = (post.comment || post.text || post.caption || '').slice(0, 60);
      const impressions = post.impressions || 0;
      const likes = post.likes || post.likeCount || 0;
      const comments = post.comments || post.commentCount || 0;
      const shares = post.shares || post.shareCount || 0;
      const engagement = Math.round((post.engagement || 0) * 100) / 100;
      const url = post.url || '';

      const result = {
        date,
        hook: text,
        impressions,
        likes,
        comments,
        shares,
        engagement,
        url
      };
      results.push(result);

      const viewStr = impressions > 1000 ? `${(impressions / 1000).toFixed(1)}K` : impressions;
      console.log(`  ${date} | ${viewStr} views | ${likes} likes | ${comments} comments | ${shares} shares | ${engagement}% engagement`);
      console.log(`    "${text}..."`);
      if (url) console.log(`    ${url}`);
      console.log('');

      await sleep(200);
    }

    // Save results
    const baseDir = path.dirname(configPath);
    const analyticsPath = path.join(baseDir, 'analytics-snapshot.json');
    const snapshot = {
      date: now.toISOString(),
      source: 'metricool',
      posts: results
    };
    fs.writeFileSync(analyticsPath, JSON.stringify(snapshot, null, 2));
    console.log(`💾 Saved analytics snapshot to ${analyticsPath}`);

    // Summary
    console.log('\n📊 Summary:');
    const totalImpressions = results.reduce((s, r) => s + r.impressions, 0);
    const totalLikes = results.reduce((s, r) => s + r.likes, 0);
    const totalComments = results.reduce((s, r) => s + r.comments, 0);
    const totalShares = results.reduce((s, r) => s + r.shares, 0);
    const avgEngagement = results.length > 0 
      ? Math.round((results.reduce((s, r) => s + r.engagement, 0) / results.length) * 100) / 100
      : 0;

    console.log(`  Total impressions: ${totalImpressions.toLocaleString()}`);
    console.log(`  Total likes: ${totalLikes.toLocaleString()}`);
    console.log(`  Total comments: ${totalComments.toLocaleString()}`);
    console.log(`  Total shares: ${totalShares.toLocaleString()}`);
    console.log(`  Average engagement: ${avgEngagement}%`);
    console.log(`  Posts tracked: ${results.length}`);
    
    if (results.length > 0) {
      const best = results.reduce((a, b) => a.impressions > b.impressions ? a : b);
      const worst = results.reduce((a, b) => a.impressions < b.impressions ? a : b);
      console.log(`  Best: ${best.impressions.toLocaleString()} impressions — "${best.hook}..."`);
      console.log(`  Worst: ${worst.impressions.toLocaleString()} impressions — "${worst.hook}..."`);
    }

    console.log('\n⚠️  METRICOOL LIMITATION: Only posts created via Metricool are tracked.');
    console.log('   Posts created directly on TikTok or via other tools will not appear here.');

  } catch (e) {
    console.error(`❌ Error fetching TikTok analytics: ${e.message}`);
    process.exit(1);
  }
})();
