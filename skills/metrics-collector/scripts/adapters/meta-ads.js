/**
 * Meta Ads Adapter — Facebook/Instagram Ads via Graph API
 *
 * Pulls: spend, impressions, clicks, ctr, cpc, leads. By campaign and total.
 */

const GRAPH_API_VERSION = 'v21.0';
const BASE_URL = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

const FIELDS = 'campaign_name,spend,impressions,clicks,ctr,cpc,actions';
const AD_FIELDS = 'campaign_name,adset_name,ad_name,spend,impressions,clicks,ctr,cpc,actions';

/**
 * @param {object} config - { accountId: "act_123456" }
 * @param {object} env - { {SLUG}_META_ADS_ACCESS_TOKEN: "..." }
 * @param {{ from: string, to: string }} dateRange
 */
export async function collect(config, env, dateRange) {
  const accountId = config.accountId;
  if (!accountId) {
    throw new Error('Meta Ads: missing accountId in integrations.json');
  }

  // Find access token — try slug-prefixed first, then generic
  const slugUpper = (config._slug || '').toUpperCase().replace(/-/g, '_');
  const accessToken =
    env[`${slugUpper}_META_ADS_ACCESS_TOKEN`] ||
    env.META_ADS_ACCESS_TOKEN;

  if (!accessToken) {
    throw new Error('Meta Ads: missing META_ADS_ACCESS_TOKEN in .env');
  }

  const metrics = [];

  // --- Account-level totals ---
  const totalsUrl =
    `${BASE_URL}/${accountId}/insights?` +
    `fields=${FIELDS}` +
    `&time_range={"since":"${dateRange.from}","until":"${dateRange.to}"}` +
    `&access_token=${accessToken}`;

  const totalsResp = await fetch(totalsUrl);
  if (!totalsResp.ok) {
    const text = await totalsResp.text();
    throw new Error(`Meta Ads API ${totalsResp.status}: ${text}`);
  }

  const totalsData = await totalsResp.json();
  if (totalsData.data?.length) {
    const row = totalsData.data[0];
    metrics.push(
      { name: 'spend', value: parseFloat(row.spend) || 0, date: dateRange.from },
      { name: 'impressions', value: parseInt(row.impressions) || 0, date: dateRange.from },
      { name: 'clicks', value: parseInt(row.clicks) || 0, date: dateRange.from },
      { name: 'ctr', value: parseFloat(row.ctr) || 0, date: dateRange.from },
      { name: 'cpc', value: parseFloat(row.cpc) || 0, date: dateRange.from },
    );

    // Extract leads from actions array
    const leads = row.actions?.find((a) => a.action_type === 'lead');
    if (leads) {
      metrics.push({ name: 'leads', value: parseInt(leads.value) || 0, date: dateRange.from });
    }
  }

  // --- By campaign ---
  const campaignUrl =
    `${BASE_URL}/${accountId}/insights?` +
    `fields=${FIELDS}` +
    `&time_range={"since":"${dateRange.from}","until":"${dateRange.to}"}` +
    `&level=campaign` +
    `&limit=50` +
    `&access_token=${accessToken}`;

  try {
    const campaignResp = await fetch(campaignUrl);
    if (campaignResp.ok) {
      const campaignData = await campaignResp.json();
      if (campaignData.data) {
        for (const row of campaignData.data) {
          const campaign = row.campaign_name || 'unknown';
          metrics.push(
            { name: 'spend', value: parseFloat(row.spend) || 0, date: dateRange.from, dimensions: { campaign } },
            { name: 'impressions', value: parseInt(row.impressions) || 0, date: dateRange.from, dimensions: { campaign } },
            { name: 'clicks', value: parseInt(row.clicks) || 0, date: dateRange.from, dimensions: { campaign } },
            { name: 'ctr', value: parseFloat(row.ctr) || 0, date: dateRange.from, dimensions: { campaign } },
            { name: 'cpc', value: parseFloat(row.cpc) || 0, date: dateRange.from, dimensions: { campaign } },
          );

          const leads = row.actions?.find((a) => a.action_type === 'lead');
          if (leads) {
            metrics.push({ name: 'leads', value: parseInt(leads.value) || 0, date: dateRange.from, dimensions: { campaign } });
          }
        }
      }
    }
  } catch (err) {
    console.warn(`  ⚠️  Meta Ads campaign-level error: ${err.message}`);
  }

  // --- By Ad Set ---
  try {
    const adsetUrl =
      `${BASE_URL}/${accountId}/insights?` +
      `fields=${FIELDS}` +
      `&time_range={"since":"${dateRange.from}","until":"${dateRange.to}"}` +
      `&level=adset` +
      `&limit=50` +
      `&access_token=${accessToken}`;

    const adsetResp = await fetch(adsetUrl);
    if (adsetResp.ok) {
      const adsetData = await adsetResp.json();
      if (adsetData.data) {
        for (const row of adsetData.data) {
          const adset = row.campaign_name ? `${row.campaign_name} → ${row.adset_name || 'unknown'}` : (row.adset_name || 'unknown');
          metrics.push(
            { name: 'spend', value: parseFloat(row.spend) || 0, date: dateRange.from, dimensions: { adset: row.adset_name || 'unknown', campaign: row.campaign_name || 'unknown' } },
            { name: 'impressions', value: parseInt(row.impressions) || 0, date: dateRange.from, dimensions: { adset: row.adset_name || 'unknown', campaign: row.campaign_name || 'unknown' } },
            { name: 'clicks', value: parseInt(row.clicks) || 0, date: dateRange.from, dimensions: { adset: row.adset_name || 'unknown', campaign: row.campaign_name || 'unknown' } },
            { name: 'ctr', value: parseFloat(row.ctr) || 0, date: dateRange.from, dimensions: { adset: row.adset_name || 'unknown', campaign: row.campaign_name || 'unknown' } },
            { name: 'cpc', value: parseFloat(row.cpc) || 0, date: dateRange.from, dimensions: { adset: row.adset_name || 'unknown', campaign: row.campaign_name || 'unknown' } },
          );
        }
      }
    }
  } catch (err) {
    console.warn(`  ⚠️  Meta Ads adset-level error: ${err.message}`);
  }

  // --- By Ad Creative ---
  try {
    const adUrl =
      `${BASE_URL}/${accountId}/insights?` +
      `fields=${AD_FIELDS}` +
      `&time_range={"since":"${dateRange.from}","until":"${dateRange.to}"}` +
      `&level=ad` +
      `&limit=50` +
      `&access_token=${accessToken}`;

    const adResp = await fetch(adUrl);
    if (adResp.ok) {
      const adData = await adResp.json();
      if (adData.data) {
        for (const row of adData.data) {
          const dims = {
            ad: row.ad_name || 'unknown',
            adset: row.adset_name || 'unknown',
            campaign: row.campaign_name || 'unknown',
          };

          metrics.push(
            { name: 'spend', value: parseFloat(row.spend) || 0, date: dateRange.from, dimensions: dims },
            { name: 'impressions', value: parseInt(row.impressions) || 0, date: dateRange.from, dimensions: dims },
            { name: 'clicks', value: parseInt(row.clicks) || 0, date: dateRange.from, dimensions: dims },
            { name: 'ctr', value: parseFloat(row.ctr) || 0, date: dateRange.from, dimensions: dims },
            { name: 'cpc', value: parseFloat(row.cpc) || 0, date: dateRange.from, dimensions: dims },
          );

          // Extract key actions
          const actions = row.actions || [];
          const linkClicks = actions.find(a => a.action_type === 'link_click');
          const leads = actions.find(a => a.action_type === 'lead' || a.action_type === 'offsite_complete_registration_add_meta_leads');
          const engagement = actions.find(a => a.action_type === 'post_engagement');

          if (linkClicks) metrics.push({ name: 'linkClicks', value: parseInt(linkClicks.value) || 0, date: dateRange.from, dimensions: dims });
          if (leads) metrics.push({ name: 'leads', value: parseInt(leads.value) || 0, date: dateRange.from, dimensions: dims });
          if (engagement) metrics.push({ name: 'engagement', value: parseInt(engagement.value) || 0, date: dateRange.from, dimensions: dims });
        }
      }
    }
  } catch (err) {
    console.warn(`  ⚠️  Meta Ads ad-level error: ${err.message}`);
  }

  return { source: 'meta-ads', date: dateRange.from, metrics };
}
