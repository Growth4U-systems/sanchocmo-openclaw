/**
 * GHL Adapter — GoHighLevel CRM API v2
 *
 * Pulls: new contacts (with pagination), appointments from all calendars, pipeline value.
 * Auth: Bearer token (Private Integration Token) + locationId.
 * API base: https://services.leadconnectorhq.com
 */

const BASE_URL = 'https://services.leadconnectorhq.com';

/**
 * @param {object} config - { locationId: "..." }
 * @param {object} env - { GHL_API_KEY: "pit-..." }
 * @param {{ from: string, to: string }} dateRange
 */
export async function collect(config, env, dateRange) {
  const locationId = config.locationId || config.LOCATION_ID;
  if (!locationId) throw new Error('GHL: missing locationId in integrations.json');

  const apiKey = env.GHL_API_KEY;
  if (!apiKey) throw new Error('GHL: missing GHL_API_KEY in .env');

  const headers = {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
    Version: '2021-07-28',
  };

  const metrics = [];

  // --- New contacts (paginated) ---
  try {
    let newContacts = 0;
    let totalContacts = 0;
    let url = `${BASE_URL}/contacts/?locationId=${locationId}&limit=100`;
    const fromTs = new Date(dateRange.from).getTime();
    const toTs = new Date(dateRange.to + 'T23:59:59Z').getTime();
    let pages = 0;

    while (url && pages < 10) {
      const resp = await fetch(url, { headers });
      if (!resp.ok) {
        console.warn(`  ⚠️  GHL contacts ${resp.status}: ${await resp.text().catch(() => '')}`);
        break;
      }
      const data = await resp.json();
      const contacts = data.contacts || [];
      totalContacts = data.meta?.total || totalContacts;

      for (const c of contacts) {
        const created = new Date(c.dateAdded || c.createdAt).getTime();
        if (created >= fromTs && created <= toTs) newContacts++;
        // If contact is older than our range, stop paginating
        if (created < fromTs) { url = null; break; }
      }

      url = data.meta?.nextPageUrl || null;
      pages++;
    }

    metrics.push(
      { name: 'newContacts', value: newContacts, date: dateRange.from },
      { name: 'totalContacts', value: totalContacts, date: dateRange.from },
    );
  } catch (err) {
    console.warn(`  ⚠️  GHL contacts error: ${err.message}`);
  }

  // --- Appointments from all calendars ---
  try {
    // First get all calendar IDs
    const calListResp = await fetch(`${BASE_URL}/calendars/?locationId=${locationId}`, { headers });
    if (!calListResp.ok) {
      console.warn(`  ⚠️  GHL calendars list ${calListResp.status}`);
    } else {
      const calData = await calListResp.json();
      const calendars = calData.calendars || [];
      let totalAppointments = 0;
      const statuses = {};

      for (const cal of calendars) {
        const eventsUrl = `${BASE_URL}/calendars/events?locationId=${locationId}&calendarId=${cal.id}&startTime=${dateRange.from}T00:00:00Z&endTime=${dateRange.to}T23:59:59Z`;
        const evResp = await fetch(eventsUrl, { headers });
        if (!evResp.ok) continue;
        const evData = await evResp.json();
        const events = evData.events || [];
        totalAppointments += events.length;

        for (const e of events) {
          const status = e.status || e.appointmentStatus || 'unknown';
          statuses[status] = (statuses[status] || 0) + 1;
        }
      }

      metrics.push({ name: 'appointments', value: totalAppointments, date: dateRange.from });
      for (const [status, count] of Object.entries(statuses)) {
        metrics.push({ name: 'appointments', value: count, date: dateRange.from, dimensions: { status } });
      }
    }
  } catch (err) {
    console.warn(`  ⚠️  GHL appointments error: ${err.message}`);
  }

  // --- Pipeline / Opportunities ---
  try {
    const pipeUrl = `${BASE_URL}/opportunities/search?location_id=${locationId}`;
    const pipeResp = await fetch(pipeUrl, { headers });
    if (pipeResp.ok) {
      const data = await pipeResp.json();
      const opportunities = data.opportunities || [];
      let totalValue = 0;
      const byStage = {};

      for (const opp of opportunities) {
        totalValue += opp.monetaryValue || 0;
        const stage = opp.pipelineStageId || opp.status || 'unknown';
        byStage[stage] = (byStage[stage] || 0) + 1;
      }

      metrics.push(
        { name: 'opportunities', value: opportunities.length, date: dateRange.from },
        { name: 'pipelineValue', value: totalValue, date: dateRange.from },
      );
    } else {
      console.warn(`  ⚠️  GHL pipeline ${pipeResp.status}`);
    }
  } catch (err) {
    console.warn(`  ⚠️  GHL pipeline error: ${err.message}`);
  }

  // --- Recent leads (last 15 with full detail) ---
  try {
    const leadsUrl = `${BASE_URL}/contacts/?locationId=${locationId}&limit=15`;
    const leadsResp = await fetch(leadsUrl, { headers });
    if (leadsResp.ok) {
      const data = await leadsResp.json();
      const contacts = data.contacts || [];
      for (const c of contacts) {
        const attr = c.attributions?.[0] || {};
        metrics.push({
          name: 'recentLead',
          value: 1,
          date: (c.dateAdded || '').slice(0, 10),
          dimensions: {
            id: c.id,
            name: c.contactName || [c.firstName, c.lastName].filter(Boolean).join(' ') || '?',
            email: c.email || '',
            phone: c.phone || '',
            source: c.source || '',
            channel: attr.medium || '',
            utmSource: attr.utmSessionSource || '',
            tags: (c.tags || []).join(', '),
            company: c.companyName || '',
            website: c.website || '',
            dateAdded: c.dateAdded || '',
          },
        });
      }
    }
  } catch (err) {
    console.warn(`  ⚠️  GHL recent leads error: ${err.message}`);
  }

  // --- Pipeline stages with counts ---
  try {
    const pipesResp = await fetch(`${BASE_URL}/opportunities/pipelines?locationId=${locationId}`, { headers });
    if (pipesResp.ok) {
      const pipesData = await pipesResp.json();
      for (const pipe of pipesData.pipelines || []) {
        // Get opportunities for this pipeline
        const oppsResp = await fetch(`${BASE_URL}/opportunities/search?location_id=${locationId}&pipeline_id=${pipe.id}&limit=100`, { headers });
        if (!oppsResp.ok) continue;
        const oppsData = await oppsResp.json();
        const opps = oppsData.opportunities || [];

        // Count by stage
        const stageCounts = {};
        const stageNames = {};
        for (const stage of pipe.stages || []) {
          stageNames[stage.id] = stage.name;
          stageCounts[stage.id] = 0;
        }
        for (const opp of opps) {
          const sid = opp.pipelineStageId;
          if (sid) stageCounts[sid] = (stageCounts[sid] || 0) + 1;
        }

        metrics.push({
          name: 'pipeline',
          value: opps.length,
          date: dateRange.from,
          dimensions: {
            pipelineId: pipe.id,
            pipelineName: pipe.name,
            stages: (pipe.stages || []).map(s => ({
              id: s.id,
              name: s.name,
              count: stageCounts[s.id] || 0,
            })),
          },
        });
      }
    }
  } catch (err) {
    console.warn(`  ⚠️  GHL pipelines error: ${err.message}`);
  }

  // --- Recent conversations (last 5) ---
  try {
    const convoResp = await fetch(
      `${BASE_URL}/conversations/search?locationId=${locationId}&limit=5&sortBy=last_message_date&sortOrder=desc`,
      { headers }
    );
    if (convoResp.ok) {
      const convoData = await convoResp.json();
      for (const c of convoData.conversations || []) {
        metrics.push({
          name: 'recentConversation',
          value: c.unreadCount || 0,
          date: dateRange.from,
          dimensions: {
            contactId: c.contactId || '',
            type: c.type || '',
            lastMessage: (c.lastMessageBody || '').slice(0, 120),
            lastMessageDate: c.lastMessageDate ? new Date(parseInt(c.lastMessageDate)).toISOString().slice(0, 16) : '',
            unread: c.unreadCount || 0,
          },
        });
      }
    }
  } catch (err) {
    console.warn(`  ⚠️  GHL conversations error: ${err.message}`);
  }

  // --- Source breakdown (from all contacts) ---
  try {
    let sourceUrl = `${BASE_URL}/contacts/?locationId=${locationId}&limit=100`;
    const sourceResp = await fetch(sourceUrl, { headers });
    if (sourceResp.ok) {
      const data = await sourceResp.json();
      const srcCounts = {};
      const channelCounts = {};
      for (const c of data.contacts || []) {
        const src = c.source || 'Unknown';
        srcCounts[src] = (srcCounts[src] || 0) + 1;
        const attr = c.attributions?.[0];
        if (attr?.medium) {
          const ch = attr.medium + (attr.utmSessionSource ? `/${attr.utmSessionSource}` : '');
          channelCounts[ch] = (channelCounts[ch] || 0) + 1;
        }
      }
      metrics.push({
        name: 'sourceBreakdown',
        value: data.meta?.total || Object.values(srcCounts).reduce((a, b) => a + b, 0),
        date: dateRange.from,
        dimensions: { sources: srcCounts, channels: channelCounts },
      });
    }
  } catch (err) {
    console.warn(`  ⚠️  GHL source breakdown error: ${err.message}`);
  }

  return { source: 'ghl', date: dateRange.from, metrics };
}
