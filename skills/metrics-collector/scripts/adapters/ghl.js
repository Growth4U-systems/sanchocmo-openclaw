/**
 * GHL Adapter — GoHighLevel CRM API v2
 *
 * Uses proper API endpoints with server-side date filtering:
 * - Contacts: POST /contacts/search with filters.dateAdded
 * - Calendar Events: GET /calendars/events with startTime/endTime (epoch ms)
 * - Opportunities: GET /opportunities/search with date/endDate (mm-dd-yyyy)
 *
 * Auth: Bearer token (Private Integration Token) + locationId.
 * API base: https://services.leadconnectorhq.com
 */

const BASE_URL = 'https://services.leadconnectorhq.com';

/**
 * @param {object} config - { locationId, calendarId? }
 * @param {object} env - { GHL_API_KEY }
 * @param {{ from: string, to: string }} dateRange - YYYY-MM-DD
 */
export async function collect(config, env, dateRange) {
  const slugUpper = (config._slug || '').toUpperCase().replace(/-/g, '_');
  const locationId =
    config.locationId ||
    config.LOCATION_ID ||
    env.GHL_LOCATION_ID ||
    env.GHL_G4U_LOCATION ||
    (slugUpper ? env[`${slugUpper}_GHL_LOCATION_ID`] : undefined);
  if (!locationId) throw new Error('GHL: missing locationId in integrations.json or GHL_LOCATION_ID env');

  const apiKey = env.GHL_API_KEY;
  if (!apiKey) throw new Error('GHL: missing GHL_API_KEY in .env');

  const headers = {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
    Version: '2021-07-28',
  };

  const metrics = [];
  const fromTs = new Date(dateRange.from).getTime();
  const toTs = new Date(dateRange.to + 'T23:59:59Z').getTime();

  // Helper: mm-dd-yyyy format for opportunities API
  function toMMDDYYYY(isoDate) {
    const [y, m, d] = isoDate.split('-');
    return `${m}-${d}-${y}`;
  }

  // ═══════════════════════════════════════════════════════════
  // 1. CONTACTS — POST /contacts/search (server-side date filter)
  // ═══════════════════════════════════════════════════════════
  try {
    let newContacts = 0;
    let totalContacts = 0;
    const channelCounts = {};
    let page = 1;
    let hasMore = true;

    while (hasMore && page <= 10) {
      const resp = await fetch(`${BASE_URL}/contacts/search`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          locationId,
          page,
          pageLimit: 100,
          filters: [
            {
              field: 'dateAdded',
              operator: 'range',
              value: {
                gte: `${dateRange.from}T00:00:00Z`,
                lte: `${dateRange.to}T23:59:59Z`,
              },
            },
          ],
        }),
      });

      if (!resp.ok) {
        const errText = await resp.text().catch(() => '');
        // Fallback to deprecated GET if POST search not available
        if (resp.status === 400 || resp.status === 422) {
          console.warn(`  ⚠️  GHL contacts/search not available (${resp.status}), falling back to GET`);
          const fallbackResult = await collectContactsFallback(locationId, headers, fromTs, toTs, dateRange);
          newContacts = fallbackResult.newContacts;
          totalContacts = fallbackResult.totalContacts;
          Object.assign(channelCounts, fallbackResult.channelCounts);
          hasMore = false;
          break;
        }
        console.warn(`  ⚠️  GHL contacts ${resp.status}: ${errText}`);
        break;
      }

      const data = await resp.json();
      const contacts = data.contacts || [];

      for (const c of contacts) {
        newContacts++;
        const source = c.source || '';
        const attr = c.attributions?.[0];
        const medium = attr?.medium || '';
        const utmSource = attr?.utmSessionSource || '';
        const channel = source || (utmSource ? `${medium}/${utmSource}` : medium) || 'Unknown';
        channelCounts[channel] = (channelCounts[channel] || 0) + 1;
      }

      hasMore = contacts.length === 100;
      page++;
    }

    try {
      const totalResp = await fetch(`${BASE_URL}/contacts/search`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ locationId, page: 1, pageLimit: 1 }),
      });
      if (totalResp.ok) {
        const totalData = await totalResp.json();
        totalContacts = totalData.total || totalData.meta?.total || totalContacts;
      }
    } catch {}

    metrics.push(
      { name: 'newContacts', value: newContacts, date: dateRange.from },
      { name: 'totalContacts', value: totalContacts, date: dateRange.from },
    );

    for (const [channel, count] of Object.entries(channelCounts)) {
      metrics.push({ name: 'newContacts', value: count, date: dateRange.from, dimensions: { channel } });
    }
  } catch (err) {
    console.warn(`  ⚠️  GHL contacts error: ${err.message}`);
  }

  // ═══════════════════════════════════════════════════════════
  // 2. CALENDAR EVENTS — GET /calendars/events (native date filter)
  // ═══════════════════════════════════════════════════════════
  try {
    let totalAppointments = 0;
    const statuses = {};

    // Get all calendars for this location
    const calResp = await fetch(`${BASE_URL}/calendars/?locationId=${locationId}`, {
      headers: { ...headers, Version: '2021-04-15' },
    });

    if (calResp.ok) {
      const calData = await calResp.json();
      const calendars = calData.calendars || [];

      for (const cal of calendars) {
        const eventsResp = await fetch(
          `${BASE_URL}/calendars/events?locationId=${locationId}&calendarId=${cal.id}&startTime=${fromTs}&endTime=${toTs}`,
          { headers: { ...headers, Version: '2021-04-15' } }
        );

        if (!eventsResp.ok) continue;
        const eventsData = await eventsResp.json();
        const events = eventsData.events || [];

        for (const e of events) {
          totalAppointments++;
          const status = e.appointmentStatus || e.status || 'scheduled';
          statuses[status] = (statuses[status] || 0) + 1;
        }
      }
    }

    metrics.push({ name: 'appointments', value: totalAppointments, date: dateRange.from });
    for (const [status, count] of Object.entries(statuses)) {
      metrics.push({ name: 'appointments', value: count, date: dateRange.from, dimensions: { status } });
    }
  } catch (err) {
    console.warn(`  ⚠️  GHL appointments error: ${err.message}`);
  }

  // ═══════════════════════════════════════════════════════════
  // 3. OPPORTUNITIES — GET /opportunities/search (native date filter)
  // ═══════════════════════════════════════════════════════════
  try {
    let newOpps = 0;
    let newValue = 0;
    let page = 1;
    let hasMore = true;

    while (hasMore && page <= 5) {
      const url = `${BASE_URL}/opportunities/search?location_id=${locationId}&date=${toMMDDYYYY(dateRange.from)}&endDate=${toMMDDYYYY(dateRange.to)}&status=all&limit=100&page=${page}`;
      const resp = await fetch(url, { headers });

      if (!resp.ok) {
        console.warn(`  ⚠️  GHL opportunities ${resp.status}`);
        break;
      }

      const data = await resp.json();
      const opportunities = data.opportunities || [];

      for (const opp of opportunities) {
        newOpps++;
        newValue += opp.monetaryValue || 0;
      }

      hasMore = opportunities.length === 100;
      page++;
    }

    // Also get totals (all time) for pipeline overview
    let totalOpps = 0;
    let totalValue = 0;
    try {
      const totalResp = await fetch(`${BASE_URL}/opportunities/search?location_id=${locationId}&status=all&limit=1`, { headers });
      if (totalResp.ok) {
        const totalData = await totalResp.json();
        totalOpps = totalData.meta?.total || 0;
      }
    } catch {}

    metrics.push(
      { name: 'opportunities', value: newOpps, date: dateRange.from },
      { name: 'pipelineValue', value: newValue, date: dateRange.from },
      { name: 'totalOpportunities', value: totalOpps, date: dateRange.from },
    );
  } catch (err) {
    console.warn(`  ⚠️  GHL opportunities error: ${err.message}`);
  }

  // ═══════════════════════════════════════════════════════════
  // 4. RECENT LEADS (last 15, for dashboard feed)
  // ═══════════════════════════════════════════════════════════
  try {
    const resp = await fetch(`${BASE_URL}/contacts/search`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        locationId,
        page: 1,
        pageLimit: 15,
        sortBy: 'dateAdded',
        direction: 'desc',
      }),
    });

    if (resp.ok) {
      const data = await resp.json();
      for (const c of data.contacts || []) {
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

  // ═══════════════════════════════════════════════════════════
  // 5. PIPELINE STAGES (snapshot for dashboard)
  // ═══════════════════════════════════════════════════════════
  try {
    const pipesResp = await fetch(`${BASE_URL}/opportunities/pipelines?locationId=${locationId}`, { headers });
    if (pipesResp.ok) {
      const pipesData = await pipesResp.json();
      for (const pipe of pipesData.pipelines || []) {
        const oppsResp = await fetch(`${BASE_URL}/opportunities/search?location_id=${locationId}&pipeline_id=${pipe.id}&status=all&limit=100`, { headers });
        if (!oppsResp.ok) continue;
        const oppsData = await oppsResp.json();
        const opps = oppsData.opportunities || [];

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

  // ═══════════════════════════════════════════════════════════
  // 6. RECENT CONVERSATIONS (last 5, for dashboard feed)
  // ═══════════════════════════════════════════════════════════
  try {
    const resp = await fetch(
      `${BASE_URL}/conversations/search?locationId=${locationId}&limit=5&sortBy=last_message_date&sortOrder=desc`,
      { headers }
    );
    if (resp.ok) {
      const data = await resp.json();
      for (const c of data.conversations || []) {
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

  return { source: 'ghl', date: dateRange.from, metrics };
}

/**
 * Fallback: GET /contacts/ with client-side date filtering
 * Used if POST /contacts/search is not available
 */
async function collectContactsFallback(locationId, headers, fromTs, toTs, dateRange) {
  let newContacts = 0;
  let totalContacts = 0;
  const channelCounts = {};
  let url = `${BASE_URL}/contacts/?locationId=${locationId}&limit=100`;
  let pages = 0;

  while (url && pages < 10) {
    const resp = await fetch(url, { headers });
    if (!resp.ok) break;
    const data = await resp.json();
    const contacts = data.contacts || [];
    totalContacts = data.meta?.total || totalContacts;

    for (const c of contacts) {
      const created = new Date(c.dateAdded || c.createdAt).getTime();
      if (created >= fromTs && created <= toTs) {
        newContacts++;
        const source = c.source || '';
        const attr = c.attributions?.[0];
        const medium = attr?.medium || '';
        const utmSource = attr?.utmSessionSource || '';
        const channel = source || (utmSource ? `${medium}/${utmSource}` : medium) || 'Unknown';
        channelCounts[channel] = (channelCounts[channel] || 0) + 1;
      }
      if (created < fromTs) { url = null; break; }
    }

    url = data.meta?.nextPageUrl || null;
    pages++;
  }

  return { newContacts, totalContacts, channelCounts };
}
