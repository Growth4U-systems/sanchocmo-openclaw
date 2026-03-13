/**
 * GHL Adapter — GoHighLevel CRM API
 *
 * Pulls: new contacts, appointments, pipeline value.
 * Auth: Bearer token from {SLUG}_GHL_API_KEY + locationId from config.
 */

const BASE_URL = 'https://services.leadconnectorhq.com';

/**
 * @param {object} config - { locationId: "loc_abc123" }
 * @param {object} env - { {SLUG}_GHL_API_KEY: "..." }
 * @param {{ from: string, to: string }} dateRange
 */
export async function collect(config, env, dateRange) {
  const locationId = config.locationId;
  if (!locationId) {
    throw new Error('GHL: missing locationId in integrations.json');
  }

  const slugUpper = (config._slug || '').toUpperCase().replace(/-/g, '_');
  const apiKey = env[`${slugUpper}_GHL_API_KEY`] || env.GHL_API_KEY;

  if (!apiKey) {
    throw new Error('GHL: missing GHL_API_KEY in .env');
  }

  const headers = {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
    Version: '2021-07-28',
  };

  const metrics = [];

  // --- New contacts ---
  try {
    const contactsUrl =
      `${BASE_URL}/contacts/?locationId=${locationId}` +
      `&startAfter=${dateRange.from}T00:00:00Z` +
      `&limit=100`;

    const contactsResp = await fetch(contactsUrl, { headers });
    if (contactsResp.ok) {
      const data = await contactsResp.json();
      const contacts = data.contacts || [];
      // Filter contacts created within date range
      const fromTs = new Date(dateRange.from).getTime();
      const toTs = new Date(dateRange.to + 'T23:59:59Z').getTime();
      const filtered = contacts.filter((c) => {
        const created = new Date(c.dateAdded || c.createdAt).getTime();
        return created >= fromTs && created <= toTs;
      });
      metrics.push({
        name: 'newContacts',
        value: filtered.length,
        date: dateRange.from,
      });
    } else {
      console.warn(`  ⚠️  GHL contacts ${contactsResp.status}`);
    }
  } catch (err) {
    console.warn(`  ⚠️  GHL contacts error: ${err.message}`);
  }

  // --- Appointments ---
  try {
    const calUrl =
      `${BASE_URL}/calendars/events?locationId=${locationId}` +
      `&startTime=${dateRange.from}T00:00:00Z` +
      `&endTime=${dateRange.to}T23:59:59Z`;

    const calResp = await fetch(calUrl, { headers });
    if (calResp.ok) {
      const data = await calResp.json();
      const events = data.events || [];
      metrics.push({
        name: 'appointments',
        value: events.length,
        date: dateRange.from,
      });

      // Count by status
      const statuses = {};
      for (const e of events) {
        const status = e.status || 'unknown';
        statuses[status] = (statuses[status] || 0) + 1;
      }
      for (const [status, count] of Object.entries(statuses)) {
        metrics.push({
          name: 'appointments',
          value: count,
          date: dateRange.from,
          dimensions: { status },
        });
      }
    } else {
      console.warn(`  ⚠️  GHL appointments ${calResp.status}`);
    }
  } catch (err) {
    console.warn(`  ⚠️  GHL appointments error: ${err.message}`);
  }

  // --- Pipeline value ---
  try {
    const pipeUrl =
      `${BASE_URL}/opportunities/search` +
      `?location_id=${locationId}` +
      `&date=${dateRange.from}` +
      `&endDate=${dateRange.to}`;

    const pipeResp = await fetch(pipeUrl, { headers });
    if (pipeResp.ok) {
      const data = await pipeResp.json();
      const opportunities = data.opportunities || [];
      let totalValue = 0;
      for (const opp of opportunities) {
        totalValue += opp.monetaryValue || 0;
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

  return { source: 'ghl', date: dateRange.from, metrics };
}
