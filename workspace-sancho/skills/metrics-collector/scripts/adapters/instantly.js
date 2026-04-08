/**
 * Instantly Adapter — Cold email analytics via Instantly.ai API
 *
 * Pulls: emails sent, opens, replies, meetings.
 * Auth: API key from {SLUG}_INSTANTLY_API_KEY
 */

const BASE_URL = 'https://api.instantly.ai/api/v2';

/**
 * @param {object} config - From integrations.json
 * @param {object} env - { {SLUG}_INSTANTLY_API_KEY: "..." }
 * @param {{ from: string, to: string }} dateRange
 */
export async function collect(config, env, dateRange) {
  const slugUpper = (config._slug || '').toUpperCase().replace(/-/g, '_');
  const apiKey = env[`${slugUpper}_INSTANTLY_API_KEY`] || env.INSTANTLY_API_KEY;

  if (!apiKey) {
    throw new Error('Instantly: missing INSTANTLY_API_KEY in .env');
  }

  const headers = {
    'Authorization': `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  };

  const metrics = [];

  // --- Campaign analytics ---
  try {
    const campaignsResp = await fetch(`${BASE_URL}/campaigns?limit=100`, { headers });
    if (!campaignsResp.ok) {
      throw new Error(`Instantly campaigns ${campaignsResp.status}`);
    }

    const campaigns = await campaignsResp.json();
    let totalSent = 0;
    let totalOpens = 0;
    let totalReplies = 0;

    for (const campaign of campaigns || []) {
      const campaignId = campaign.id;
      if (!campaignId) continue;

      try {
        const params = new URLSearchParams({
          start_date: dateRange.from,
          end_date: dateRange.to,
        });
        const summaryResp = await fetch(
          `${BASE_URL}/campaigns/${campaignId}/analytics?${params.toString()}`,
          { headers }
        );

        if (summaryResp.ok) {
          const summary = await summaryResp.json();
          const sent = summary.sent || 0;
          const opens = summary.opened || 0;
          const replies = summary.replied || 0;

          totalSent += sent;
          totalOpens += opens;
          totalReplies += replies;

          // Per-campaign breakdown
          metrics.push(
            { name: 'emailsSent', value: sent, date: dateRange.from, dimensions: { campaign: campaign.name || campaignId } },
            { name: 'opens', value: opens, date: dateRange.from, dimensions: { campaign: campaign.name || campaignId } },
            { name: 'replies', value: replies, date: dateRange.from, dimensions: { campaign: campaign.name || campaignId } },
          );
        }
      } catch (err) {
        console.warn(`  ⚠️  Instantly campaign ${campaignId} error: ${err.message}`);
      }
    }

    // Totals
    metrics.push(
      { name: 'emailsSent', value: totalSent, date: dateRange.from },
      { name: 'opens', value: totalOpens, date: dateRange.from },
      { name: 'replies', value: totalReplies, date: dateRange.from },
    );
  } catch (err) {
    console.warn(`  ⚠️  Instantly campaigns error: ${err.message}`);
    throw err;
  }

  return { source: 'instantly', date: dateRange.from, metrics };
}
