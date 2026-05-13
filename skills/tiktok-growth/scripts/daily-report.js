#!/usr/bin/env node
/**
 * Daily Marketing Report (Metricool Edition)
 * 
 * Cross-references TikTok post analytics (via Metricool) with RevenueCat conversions
 * to identify which hooks drive views AND revenue.
 * 
 * Data sources:
 * 1. Metricool API → per-post TikTok analytics (impressions, likes, comments, engagement)
 * 2. RevenueCat API (optional) → trials, conversions, revenue
 * 
 * The diagnostic framework:
 * - High views + High conversions → SCALE (make variations of winning hooks)
 * - High views + Low conversions → FIX CTA (hook works, downstream is broken)  
 * - Low views + High conversions → FIX HOOKS (content converts, needs more eyeballs)
 * - Low views + Low conversions → FULL RESET (try radically different approach)
 * 
 * METRICOOL LIMITATIONS vs Postiz:
 * - No platform-level deltas (followers, total views) — Metricool v2 API only provides per-post data
 * - No release ID matching for TikTok videos
 * - Only tracks posts created/scheduled via Metricool
 * 
 * Usage: node daily-report.js --config <config.json> [--days 3]
 * Output: tiktok-marketing/reports/YYYY-MM-DD.md
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
  console.error('Usage: node daily-report.js --config <config.json> [--days 3]');
  process.exit(1);
}

const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
const baseDir = path.dirname(configPath);

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

// RevenueCat API (if configured)
async function getRevenueCatMetrics(startDate, endDate) {
  if (!config.revenuecat?.enabled || !config.revenuecat?.v2SecretKey) {
    return null;
  }
  
  const RC_URL = 'https://api.revenuecat.com/v2';
  const rcHeaders = {
    'Authorization': `Bearer ${config.revenuecat.v2SecretKey}`,
    'Content-Type': 'application/json'
  };

  try {
    // Get overview metrics
    const overviewRes = await fetch(`${RC_URL}/projects/${config.revenuecat.projectId}/metrics/overview`, {
      headers: rcHeaders
    });
    const overview = await overviewRes.json();

    // Get recent transactions for conversion attribution
    const txRes = await fetch(`${RC_URL}/projects/${config.revenuecat.projectId}/transactions?start_from=${startDate.toISOString()}&limit=100`, {
      headers: rcHeaders
    });
    const transactions = await txRes.json();

    // Extract key metrics from overview array
    const metricsMap = {};
    if (overview.metrics) {
      overview.metrics.forEach(m => { metricsMap[m.id] = m.value; });
    }

    return {
      overview,
      transactions: transactions.items || [],
      mrr: metricsMap.mrr || 0,
      activeTrials: metricsMap.active_trials || 0,
      activeSubscribers: metricsMap.active_subscriptions || 0,
      activeUsers: metricsMap.active_users || 0,
      newCustomers: metricsMap.new_customers || 0,
      revenue: metricsMap.revenue || 0
    };
  } catch (e) {
    console.log(`  ⚠️ RevenueCat API error: ${e.message}`);
    return null;
  }
}

// Load previous day's snapshot for delta tracking
function loadPreviousSnapshot() {
  const snapshotPath = path.join(baseDir, 'analytics-snapshot.json');
  if (fs.existsSync(snapshotPath)) {
    return JSON.parse(fs.readFileSync(snapshotPath, 'utf-8'));
  }
  return null;
}

(async () => {
  const now = new Date();
  const startDate = new Date(now - days * 86400000);
  const dateStr = now.toISOString().slice(0, 10);
  const from = `${startDate.toISOString().split('T')[0]}T00:00:00`;
  const to = `${now.toISOString().split('T')[0]}T23:59:59`;

  console.log(`📊 Daily Report — ${dateStr} (last ${days} days)\n`);

  // ==========================================
  // 1. METRICOOL: Per-post TikTok analytics
  // ==========================================
  const url = `${BASE_URL}/v2/analytics/posts/tiktok?userId=${config.metricool.userId}&blogId=${config.metricool.blogId}&from=${from}&to=${to}`;
  
  let posts = [];
  try {
    const resp = await fetch(url, { headers });
    if (!resp.ok) {
      console.error(`❌ Metricool API error ${resp.status}`);
      process.exit(1);
    }
    const data = await resp.json();
    posts = data.data || (Array.isArray(data) ? data : []);
  } catch (e) {
    console.error(`❌ Error fetching TikTok analytics: ${e.message}`);
    process.exit(1);
  }

  console.log(`  📱 Found ${posts.length} TikTok posts from Metricool\n`);

  const postResults = [];
  for (const post of posts) {
    const date = post.created?.dateTime?.slice(0, 10) || startDate.toISOString().slice(0, 10);
    const text = (post.comment || post.text || post.caption || '').slice(0, 70);
    const impressions = post.impressions || 0;
    const likes = post.likes || post.likeCount || 0;
    const comments = post.comments || post.commentCount || 0;
    const shares = post.shares || post.shareCount || 0;
    const engagement = Math.round((post.engagement || 0) * 100) / 100;
    const url = post.url || '';

    postResults.push({
      date,
      hook: text,
      impressions,
      likes,
      comments,
      shares,
      engagement,
      url
    });
  }

  // ==========================================
  // 2. REVENUECAT: Conversion metrics (optional)
  // ==========================================
  let rcMetrics = null;
  let rcPrevMetrics = null;
  
  if (config.revenuecat?.enabled) {
    console.log(`  💰 Fetching RevenueCat metrics...`);
    rcMetrics = await getRevenueCatMetrics(startDate, now);
    
    // Load previous RC snapshot for deltas
    const rcSnapshotPath = path.join(baseDir, 'rc-snapshot.json');
    if (fs.existsSync(rcSnapshotPath)) {
      rcPrevMetrics = JSON.parse(fs.readFileSync(rcSnapshotPath, 'utf-8'));
    }
    if (rcMetrics) {
      fs.writeFileSync(rcSnapshotPath, JSON.stringify({ date: dateStr, ...rcMetrics }, null, 2));
    }
  }

  // ==========================================
  // 3. GENERATE REPORT
  // ==========================================
  let report = `# Daily Marketing Report — ${dateStr}\n\n`;
  report += `**Source:** Metricool API v2 (TikTok only)\n\n`;

  // Per-post breakdown
  postResults.sort((a, b) => b.impressions - a.impressions);

  report += `## TikTok Posts (last ${days} days)\n\n`;
  report += `| Date | Hook | Impressions | Likes | Comments | Shares | Engagement |\n`;
  report += `|------|------|------------:|------:|---------:|-------:|-----------:|\n`;
  
  for (const p of postResults) {
    const impStr = p.impressions > 1000 ? `${(p.impressions / 1000).toFixed(1)}K` : `${p.impressions}`;
    report += `| ${p.date} | ${p.hook.substring(0, 45)}... | ${impStr} | ${p.likes} | ${p.comments} | ${p.shares} | ${p.engagement}% |\n`;
  }

  const totalImpressions = postResults.reduce((s, p) => s + p.impressions, 0);
  const avgImpressions = postResults.length > 0 ? Math.round(totalImpressions / postResults.length) : 0;
  const totalLikes = postResults.reduce((s, p) => s + p.likes, 0);
  const avgEngagement = postResults.length > 0 
    ? Math.round((postResults.reduce((s, p) => s + p.engagement, 0) / postResults.length) * 100) / 100
    : 0;

  report += `\n**Total impressions:** ${totalImpressions.toLocaleString()} | **Avg per post:** ${avgImpressions.toLocaleString()}\n`;
  report += `**Total likes:** ${totalLikes.toLocaleString()} | **Avg engagement:** ${avgEngagement}%\n\n`;

  // RevenueCat section
  if (rcMetrics) {
    report += `## Conversions (RevenueCat)\n\n`;
    report += `- **MRR:** $${rcMetrics.mrr}\n`;
    report += `- **Active subscribers:** ${rcMetrics.activeSubscribers}\n`;
    report += `- **Active trials:** ${rcMetrics.activeTrials}\n`;
    report += `- **Active users (28d):** ${rcMetrics.activeUsers}\n`;
    report += `- **New customers (28d):** ${rcMetrics.newCustomers}\n`;
    report += `- **Revenue (28d):** $${rcMetrics.revenue}\n`;

    if (rcPrevMetrics) {
      const mrrDelta = rcMetrics.mrr - (rcPrevMetrics.mrr || 0);
      const subDelta = rcMetrics.activeSubscribers - (rcPrevMetrics.activeSubscribers || 0);
      const trialDelta = rcMetrics.activeTrials - (rcPrevMetrics.activeTrials || 0);
      const userDelta = rcMetrics.activeUsers - (rcPrevMetrics.activeUsers || 0);
      const customerDelta = rcMetrics.newCustomers - (rcPrevMetrics.newCustomers || 0);

      report += `\n**Changes since last report:**\n`;
      report += `- MRR: ${mrrDelta >= 0 ? '+' : ''}$${mrrDelta}\n`;
      report += `- Subscribers: ${subDelta >= 0 ? '+' : ''}${subDelta}\n`;
      report += `- Trials: ${trialDelta >= 0 ? '+' : ''}${trialDelta}\n`;
      report += `- Active users: ${userDelta >= 0 ? '+' : ''}${userDelta}\n`;
      report += `- New customers: ${customerDelta >= 0 ? '+' : ''}${customerDelta}\n`;

      // Funnel diagnostic
      report += `\n**Funnel health:**\n`;
      if (customerDelta > 10 && subDelta === 0) {
        report += `- ⚠️ Users are downloading (${customerDelta > 0 ? '+' : ''}${customerDelta} new customers) but nobody is subscribing → **App issue** (onboarding/paywall/pricing)\n`;
      } else if (customerDelta > 10 && subDelta > 0) {
        report += `- ✅ Funnel working: +${customerDelta} customers → +${subDelta} subscribers (${((subDelta / customerDelta) * 100).toFixed(1)}% conversion)\n`;
      } else if (customerDelta <= 5) {
        report += `- ⚠️ Few new customers (${customerDelta > 0 ? '+' : ''}${customerDelta}) → **Marketing issue** (views not converting to downloads — check App Store page, link in bio)\n`;
      }
      if (userDelta > 20 && subDelta === 0) {
        report += `- 🔴 ${userDelta} active users but zero new subs → Users are trying the app but not paying. Check: Is the paywall too aggressive? Is the free experience too good? Is the value proposition clear?\n`;
      }
    }

    // Attribution: compare conversion spikes with post timing
    if (rcMetrics.transactions?.length > 0) {
      report += `\n### Conversion Attribution (last ${days} days)\n\n`;
      report += `Found ${rcMetrics.transactions.length} transactions. Cross-referencing with post timing:\n\n`;

      for (const p of postResults.slice(0, 10)) { // top 10 posts
        const postDate = new Date(p.date);
        const windowEnd = new Date(postDate.getTime() + 72 * 3600000);
        const nearbyTx = rcMetrics.transactions.filter(tx => {
          const txDate = new Date(tx.purchase_date || tx.created_at);
          return txDate >= postDate && txDate <= windowEnd;
        });
        if (nearbyTx.length > 0) {
          report += `- "${p.hook.substring(0, 40)}..." (${p.impressions.toLocaleString()} impressions) → **${nearbyTx.length} conversions within 72h**\n`;
        }
      }
    }
    report += '\n';
  }

  // ==========================================
  // 4. HOOK PERFORMANCE TRACKING
  // ==========================================
  const hookPath = path.join(baseDir, 'hook-performance.json');
  let hookData = { hooks: [] };
  if (fs.existsSync(hookPath)) {
    hookData = JSON.parse(fs.readFileSync(hookPath, 'utf-8'));
  }

  // Merge new data with historical tracking
  if (rcMetrics) {
    for (const p of postResults) {
      // Estimate conversions from attribution window
      const postDate = new Date(p.date);
      const windowEnd = new Date(postDate.getTime() + 72 * 3600000);
      const nearbyTx = rcMetrics.transactions?.filter(tx => {
        const txDate = new Date(tx.purchase_date || tx.created_at);
        return txDate >= postDate && txDate <= windowEnd;
      }) || [];
      const conversions = nearbyTx.length;

      // Check if hook already exists
      const existing = hookData.hooks.find(h => h.text === p.hook && h.date === p.date);
      if (existing) {
        existing.impressions = p.impressions;
        existing.likes = p.likes;
        existing.comments = p.comments;
        existing.shares = p.shares;
        existing.conversions = conversions;
        existing.lastChecked = dateStr;
      } else {
        hookData.hooks.push({
          date: p.date,
          text: p.hook,
          impressions: p.impressions,
          likes: p.likes,
          comments: p.comments,
          shares: p.shares,
          conversions,
          cta: '', // agent should tag this when creating posts
          lastChecked: dateStr
        });
      }
    }
  }
  fs.writeFileSync(hookPath, JSON.stringify(hookData, null, 2));

  // ==========================================
  // 5. AUTOMATED FUNNEL DIAGNOSIS PER POST
  // ==========================================
  report += `## Per-Post Funnel Diagnosis\n\n`;

  const hasRC = rcMetrics && rcPrevMetrics;
  const allHooks = hookData.hooks.filter(h => h.lastChecked === dateStr);

  if (allHooks.length > 0 && hasRC) {
    // Sort by impressions descending
    const sorted = [...allHooks].sort((a, b) => b.impressions - a.impressions);
    const impMedian = sorted[Math.floor(sorted.length / 2)]?.impressions || 1000;

    for (const h of sorted) {
      const highImpressions = h.impressions > impMedian && h.impressions > 5000;
      const hasConversions = h.conversions > 0;

      report += `**"${h.text.substring(0, 55)}..."** — ${h.impressions.toLocaleString()} impressions, ${h.conversions} conversions\n`;

      if (highImpressions && hasConversions) {
        report += `  🟢 Hook + CTA both working → SCALE this hook, keep the CTA\n`;
      } else if (highImpressions && !hasConversions) {
        report += `  🟡 High impressions but no conversions → Hook is good, CTA needs changing. Try a different slide 6 CTA.\n`;
      } else if (!highImpressions && hasConversions) {
        report += `  🟡 Low impressions but people who saw it converted → CTA is great, hook needs work. Try a stronger hook with the same CTA.\n`;
      } else {
        report += `  🔴 Low impressions + no conversions → Drop this hook and CTA combination\n`;
      }
      report += '\n';
    }

    // Check for systemic app issues
    const totalRecentImpressions = sorted.reduce((s, h) => s + h.impressions, 0);
    const totalConversions = sorted.reduce((s, h) => s + h.conversions, 0);
    const subDelta = rcMetrics.activeSubscribers - (rcPrevMetrics.activeSubscribers || 0);
    const customerDelta = rcMetrics.newCustomers - (rcPrevMetrics.newCustomers || 0);

    if (totalRecentImpressions > 50000 && customerDelta > 10 && subDelta <= 0) {
      report += `### 🔴 APP ISSUE DETECTED\n\n`;
      report += `Impressions are high (${totalRecentImpressions.toLocaleString()}) and people are downloading (+${customerDelta} new customers), but nobody is paying (${subDelta >= 0 ? '+' : ''}${subDelta} subscribers).\n`;
      report += `This is NOT a marketing problem — the content is working. The app onboarding, paywall, or pricing needs attention.\n`;
      report += `- Is the paywall shown at the right time?\n`;
      report += `- Is the free experience too generous?\n`;
      report += `- Is the value proposition clear before the paywall?\n`;
      report += `- Does the onboarding guide users to the "aha moment"?\n\n`;
    } else if (totalRecentImpressions > 50000 && customerDelta <= 3) {
      report += `### 🟡 CTA ISSUE DETECTED\n\n`;
      report += `Impressions are high (${totalRecentImpressions.toLocaleString()}) but very few people are downloading (+${customerDelta} new customers).\n`;
      report += `The hooks are working but the CTAs aren't driving action. Rotate to a different CTA style.\n\n`;
    }
  } else if (!hasRC) {
    report += `⚠️ No RevenueCat data — can only diagnose hooks (impressions), not CTAs (conversions). Connect RevenueCat for full funnel intelligence.\n\n`;
  }

  // ==========================================
  // 6. AUTO-GENERATED HOOKS & CTAs
  // ==========================================
  report += `## Auto-Generated Recommendations\n\n`;

  // Analyse all historical hooks to find patterns
  const allHistorical = hookData.hooks.filter(h => h.impressions > 0);

  if (allHistorical.length > 0) {
    allHistorical.sort((a, b) => b.impressions - a.impressions);
    const winners = allHistorical.filter(h => h.impressions >= 10000);
    const losers = allHistorical.filter(h => h.impressions < 1000);

    // Identify winning patterns from actual hook text
    if (winners.length > 0) {
      report += `**Winning hooks (10K+ impressions):**\n`;
      for (const w of winners.slice(0, 5)) {
        report += `- "${w.text.substring(0, 60)}..." — ${w.impressions.toLocaleString()} impressions, ${w.conversions || 0} conversions\n`;
      }
      report += '\n';

      // Extract patterns from winners
      const winnerTexts = winners.map(w => w.text.toLowerCase());
      const patterns = {
        personConflict: winnerTexts.filter(t => /\b(showed|told|said|asked)\b/.test(t) && /\b(my |mum|mom|dad|landlord|boyfriend|girlfriend|friend|sister|brother|boss|nan)\b/.test(t)).length,
        pov: winnerTexts.filter(t => t.startsWith('pov')).length,
        question: winnerTexts.filter(t => t.includes('?')).length,
        emotion: winnerTexts.filter(t => /\b(obsessed|can't believe|shocked|never thought|didn't expect)\b/.test(t)).length
      };

      const topPattern = Object.entries(patterns).sort((a, b) => b[1] - a[1])[0];

      report += `**Strongest pattern:** ${topPattern[0]} (${topPattern[1]}/${winners.length} winners use this)\n\n`;

      // Generate new hooks based on winning patterns
      report += `**🔥 Generated hooks (based on your winners):**\n`;
      report += `\n`;
      report += `The agent should now generate 3-5 NEW hooks that follow the "${topPattern[0]}" pattern, using:\n`;
      report += `- The app's product description from config\n`;
      report += `- The winning hook structures above as templates\n`;
      report += `- Different people/scenarios to keep it fresh\n\n`;

      // Specific generation instructions for the agent
      report += `**AGENT INSTRUCTION:** Read the winning hooks above. Identify the structure (who + conflict + reveal). `;
      report += `Generate 3 new hooks that follow the SAME structure but with different people and scenarios. `;
      report += `Example: if "I showed my landlord..." won, try "I showed my nan...", "I showed my boss...", "My flatmate didn't believe..."\n\n`;
    }

    if (losers.length > 0) {
      report += `**Drop these patterns (< 1K impressions):**\n`;
      for (const l of losers.slice(0, 3)) {
        report += `- "${l.text.substring(0, 60)}..." — ${l.impressions} impressions\n`;
      }
      report += '\n';
    }

    // CTA recommendations based on conversion data
    if (hasRC) {
      const highImpLowConvert = allHistorical.filter(h => h.impressions > 10000 && (h.conversions || 0) === 0);
      const lowImpHighConvert = allHistorical.filter(h => h.impressions < 5000 && (h.conversions || 0) > 0);

      if (highImpLowConvert.length > 0) {
        report += `**🔄 CTA rotation needed** — ${highImpLowConvert.length} posts got 10K+ impressions but zero conversions.\n`;
        report += `Current CTAs aren't driving downloads. Try rotating through:\n`;
        report += `- "Download [app] — link in bio"\n`;
        report += `- "[app] is free to try — link in bio"\n`;
        report += `- "I used [app] for this — link in bio"\n`;
        report += `- "Search [app] on the App Store"\n`;
        report += `- No explicit CTA (just app name visible on slide 6)\n`;
        report += `Track which CTA each post uses in hook-performance.json to identify what converts.\n\n`;
      }

      if (lowImpHighConvert.length > 0) {
        report += `**💎 Hidden gems** — ${lowImpHighConvert.length} posts got low impressions but high conversions.\n`;
        report += `The CTA on these posts is working. Reuse that CTA with stronger hooks.\n`;
        for (const g of lowImpHighConvert) {
          report += `- "${g.text.substring(0, 50)}..." — ${g.impressions} impressions, ${g.conversions} conversions (CTA: ${g.cta || 'unknown'})\n`;
        }
        report += '\n';
      }
    }
  }

  // ==========================================
  // 7. METRICOOL LIMITATIONS NOTICE
  // ==========================================
  report += `---\n\n`;
  report += `### ⚠️ Metricool Limitations\n\n`;
  report += `This report uses Metricool API v2, which has some limitations compared to Postiz:\n\n`;
  report += `- **No platform-level deltas:** Cannot track follower growth or total view changes over time\n`;
  report += `- **No release ID matching:** Cannot retroactively connect posts to TikTok video IDs\n`;
  report += `- **Only Metricool-created posts:** Posts created directly on TikTok or via other tools won't appear\n`;
  report += `- **Limited per-post detail:** Some metrics may not be available for all posts\n\n`;
  report += `For full funnel intelligence, ensure all posts are created via Metricool and RevenueCat is connected.\n\n`;

  // ==========================================
  // 8. SAVE REPORT
  // ==========================================
  const reportsDir = path.join(baseDir, 'reports');
  fs.mkdirSync(reportsDir, { recursive: true });
  const reportPath = path.join(reportsDir, `${dateStr}.md`);
  fs.writeFileSync(reportPath, report);
  console.log(`\n📋 Report saved to ${reportPath}`);
  console.log('\n' + report);
})();
