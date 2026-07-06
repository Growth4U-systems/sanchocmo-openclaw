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

  // --- Daily campaign analytics (all campaigns) ---
  try {
    const params = new URLSearchParams({
      start_date: dateRange.from,
      end_date: dateRange.to,
    });
    const analyticsResp = await fetch(`${BASE_URL}/campaigns/analytics/daily?${params.toString()}`, { headers });
    if (!analyticsResp.ok) {
      throw new Error(`Instantly campaign analytics ${analyticsResp.status}`);
    }

    const rows = await analyticsResp.json();
    const byDate = new Map();
    for (const row of Array.isArray(rows) ? rows : []) {
      const date = row.date || dateRange.from;
      if (date < dateRange.from || date > dateRange.to) continue;
      const totals = byDate.get(date) || {};
      for (const [key, value] of Object.entries(row)) {
        if (key === 'date') continue;
        totals[key] = (Number(totals[key]) || 0) + (Number(value) || 0);
      }
      byDate.set(date, totals);
    }

    for (const [date, row] of byDate) {
      metrics.push(
        { name: 'emailsSent', value: Number(row.sent) || 0, date },
        { name: 'contacted', value: Number(row.contacted) || 0, date },
        { name: 'newLeadsContacted', value: Number(row.new_leads_contacted) || 0, date },
        { name: 'opens', value: Number(row.opened) || 0, date },
        { name: 'uniqueOpens', value: Number(row.unique_opened) || 0, date },
        { name: 'replies', value: Number(row.replies) || 0, date },
        { name: 'uniqueReplies', value: Number(row.unique_replies) || 0, date },
        { name: 'autoReplies', value: Number(row.replies_automatic) || 0, date },
        { name: 'clicks', value: Number(row.clicks) || 0, date },
        { name: 'uniqueClicks', value: Number(row.unique_clicks) || 0, date },
        { name: 'opportunities', value: Number(row.opportunities) || 0, date },
      );
    }
  } catch (err) {
    console.warn(`  ⚠️  Instantly campaign analytics error: ${err.message}`);
    throw err;
  }

  return { source: 'instantly', date: dateRange.from, metrics };
}
