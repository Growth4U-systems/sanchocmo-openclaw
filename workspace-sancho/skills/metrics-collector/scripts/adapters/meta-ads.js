/**
 * Meta Ads Adapter — Facebook/Instagram Ads via Graph API
 *
 * Pulls: spend, impressions, clicks, ctr, cpc, leads. By campaign and total.
 */

const GRAPH_API_VERSION = 'v21.0';
const BASE_URL = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

const FIELDS = 'campaign_name,spend,impressions,clicks,ctr,cpc,actions';

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

  return { source: 'meta-ads', date: dateRange.from, metrics };
}
