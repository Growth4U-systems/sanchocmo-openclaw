/**
 * GHL Adapter — GoHighLevel CRM API v2
 *
 * Uses proper API endpoints with server-side date filtering:
 * - Contacts: POST /contacts/search with filters.dateAdded
 * - Calendar Events: GET /calendars/events with startTime/endTime (epoch ms)
 * - Opportunities: current v3 GET /opportunities/search with camelCase filters
 *
 * Auth: Bearer token (Private Integration Token) + locationId.
 * API base: https://services.leadconnectorhq.com
 */

import { pointInTimeMetricDate } from '../adapter-date-range.js';

const BASE_URL = 'https://services.leadconnectorhq.com';
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const GHL_DAILY_METRIC_NAMES = [
  'newContacts',
  'appointments',
  'appointmentsByChannel',
  'opportunities',
  'opportunitiesByChannel',
  'pipelineValue',
];
const GHL_OPTIONAL_SNAPSHOT_METRIC_NAMES = ['pipeline', 'pipelineStage'];
// Won totals are all-time CRM state observed once per routine run (SAN-326):
// point-in-time like totalContacts, skipped on explicit-range backfills.
const GHL_WON_SNAPSHOT_METRIC_NAMES = [
  'wonOpportunities',
  'wonValue',
  'wonByChannel',
  'wonValueByChannel',
];
// Hard cap on contactId→contact lookups per run, aligned with the 500-row
// safety limits used elsewhere in this adapter.
const CONTACT_CHANNEL_JOIN_LIMIT = 500;

function firstEnv(env, keys) {
  for (const key of keys) {
    const value = env[key];
    if (typeof value === 'string' && value.trim() !== '') return value.trim();
  }
  return '';
}

async function requireOk(response, operation) {
  if (response.ok) return;
  const detail = await response.text().catch(() => '');
  throw new Error(
    `GHL ${operation} HTTP ${response.status}${detail ? `: ${detail.slice(0, 200)}` : ''}`,
  );
}

function requireArray(value, operation, field) {
  if (!Array.isArray(value)) {
    throw new Error(`GHL ${operation}: response missing ${field} array`);
  }
  return value;
}

function requireCount(value, operation, field) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`GHL ${operation}: response missing numeric ${field}`);
  }
  return parsed;
}

function requireText(value, operation, field) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`GHL ${operation}: response missing ${field}`);
  }
  return value.trim();
}

/**
 * Collapse a GHL contact's acquisition channel: explicit source first, then the
 * first attribution (medium/utmSessionSource), else 'Unknown'. Single shared
 * rule so contacts, appointments, opportunities and won splits agree (SAN-326).
 */
export function contactChannel(contact) {
  const source = contact?.source || '';
  const attr = contact?.attributions?.[0];
  const medium = attr?.medium || '';
  const utmSource = attr?.utmSessionSource || '';
  return source || (utmSource ? `${medium}/${utmSource}` : medium) || 'Unknown';
}

/**
 * contactId→channel join for records that embed no source (calendar events,
 * opportunities). Caches per run so the same contact is fetched once across
 * appointments/opportunities/won. A 404 (deleted contact) is an honest
 * 'Unknown'; any other failure throws so the area fails instead of persisting
 * a silently wrong split.
 */
function createContactChannelResolver(headers) {
  const cache = new Map();
  return async function resolveContactChannels(contactIds) {
    const unique = [...new Set(contactIds.filter(Boolean))];
    const pending = unique.filter((id) => !cache.has(id));
    if (cache.size + pending.length > CONTACT_CHANNEL_JOIN_LIMIT) {
      throw new Error(
        `GHL contact channel join exceeded the ${CONTACT_CHANNEL_JOIN_LIMIT}-contact safety limit; refusing a partial channel split`,
      );
    }
    for (const id of pending) {
      const response = await fetch(`${BASE_URL}/contacts/${encodeURIComponent(id)}`, { headers });
      if (response.status === 404) {
        cache.set(id, 'Unknown');
        continue;
      }
      await requireOk(response, `contact lookup (${id})`);
      const data = await response.json();
      cache.set(id, contactChannel(data?.contact ?? data));
    }
    return new Map(unique.map((id) => [id, cache.get(id)]));
  };
}

/** Count records per channel via the contactId join; no contact → 'Unknown'. */
async function channelCountsFor(contactIds, resolveContactChannels) {
  const channels = await resolveContactChannels(contactIds);
  const counts = {};
  for (const id of contactIds) {
    const channel = (id && channels.get(id)) || 'Unknown';
    counts[channel] = (counts[channel] || 0) + 1;
  }
  return counts;
}

function isCalendarDate(value) {
  if (!ISO_DATE_RE.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function requireIanaTimezone(value) {
  const timezone = typeof value === 'string' ? value.trim() : '';
  if (!timezone) return '';
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format(new Date(0));
    return timezone;
  } catch {
    throw new Error(`GHL: invalid IANA timezone ${timezone}`);
  }
}

function timezoneOffsetMs(timestamp, timezone) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(timestamp));
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const asUtc = Date.UTC(
    Number(value.year),
    Number(value.month) - 1,
    Number(value.day),
    Number(value.hour),
    Number(value.minute),
    Number(value.second),
  );
  return asUtc - Math.floor(timestamp / 1000) * 1000;
}

function localMidnightUtc(date, timezone) {
  const [year, month, day] = date.split('-').map(Number);
  const localTimestamp = Date.UTC(year, month - 1, day);
  let candidate = localTimestamp;
  // Offset can change around DST. Re-evaluating against the corrected instant
  // converges on the UTC instant representing local 00:00 for this calendar day.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    candidate = localTimestamp - timezoneOffsetMs(candidate, timezone);
  }
  return candidate;
}

function nextCalendarDate(date) {
  return new Date(Date.parse(`${date}T00:00:00.000Z`) + 86_400_000)
    .toISOString()
    .slice(0, 10);
}

export function zonedDayBounds(date, timezone) {
  if (!isCalendarDate(date)) throw new Error(`GHL: invalid calendar day ${date}`);
  const zone = requireIanaTimezone(timezone);
  if (!zone) throw new Error('GHL: missing IANA timezone');
  const fromTs = localMidnightUtc(date, zone);
  const toTs = localMidnightUtc(nextCalendarDate(date), zone) - 1;
  return {
    timezone: zone,
    fromTs,
    toTs,
    fromIso: new Date(fromTs).toISOString(),
    toIso: new Date(toTs).toISOString(),
  };
}

async function resolveLocationTimezone(config, env, slugUpper, locationId, headers) {
  const configured = requireIanaTimezone(
    config.timezone
      || config.timeZone
      || config.locationTimezone
      || config._client?.timezone
      || firstEnv(env, [
        ...(slugUpper ? [`${slugUpper}_GHL_TIMEZONE`] : []),
        'GHL_TIMEZONE',
      ]),
  );
  if (configured) return configured;

  const response = await fetch(`${BASE_URL}/locations/${encodeURIComponent(locationId)}`, {
    headers: { ...headers, Version: 'v3' },
  });
  await requireOk(response, 'location timezone');
  const data = await response.json();
  const discovered = data?.location?.timezone ?? data?.timezone;
  try {
    return requireIanaTimezone(discovered)
      || (() => { throw new Error('empty timezone'); })();
  } catch {
    throw new Error(
      'GHL location timezone: response missing a valid IANA timezone; set ghl.timezone explicitly',
    );
  }
}

function rethrowCollectionError(area, error) {
  const message = error instanceof Error ? error.message : String(error);
  throw new Error(`GHL ${area} collection failed: ${message}`);
}

/**
 * @param {object} config - { locationId, timezone?, calendarId? }
 * @param {object} env - { {SLUG}_GHL_API_KEY or GHL_API_KEY }
 * @param {{ from: string, to: string }} dateRange - YYYY-MM-DD
 */
export async function collect(config, env, dateRange) {
  if (!isCalendarDate(dateRange.from) || !isCalendarDate(dateRange.to)) {
    throw new Error(`GHL: invalid date range ${dateRange.from || '?'}..${dateRange.to || '?'}`);
  }
  if (dateRange.from !== dateRange.to) {
    throw new Error('GHL: multi-day ranges are not supported safely; collect one day at a time');
  }
  const observationDate = pointInTimeMetricDate(config, dateRange);
  const includeCurrentState = config._explicitRange !== true;
  const slugUpper = (config._slug || '').toUpperCase().replace(/-/g, '_');
  const locationId =
    config.locationId ||
    config.LOCATION_ID ||
    firstEnv(env, [
      ...(slugUpper ? [`${slugUpper}_GHL_LOCATION_ID`] : []),
      'GHL_LOCATION_ID',
      'GHL_G4U_LOCATION',
      'GOHIGHLEVEL_LOCATION_ID',
    ]);
  if (!locationId) throw new Error('GHL: missing locationId in integrations.json or GHL_LOCATION_ID env');

  const apiKey = firstEnv(env, [
    ...(slugUpper
      ? [
          `${slugUpper}_GHL_API_KEY`,
          `${slugUpper}_GHL_PRIVATE_INTEGRATION_TOKEN`,
          `${slugUpper}_GHL_APIKEY`,
          `${slugUpper}_GOHIGHLEVEL_API_KEY`,
        ]
      : []),
    'GHL_API_KEY',
    'GHL_PRIVATE_INTEGRATION_TOKEN',
    'GHL_APIKEY',
    'GOHIGHLEVEL_API_KEY',
  ]);
  if (!apiKey) throw new Error('GHL: missing GHL API key/private integration token from UI or env');

  const headers = {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
    Version: '2021-07-28',
  };
  const opportunityHeaders = { ...headers, Version: 'v3' };
  // Shared per-run contactId→channel join (appointments, opportunities, won).
  const resolveContactChannels = createContactChannelResolver(headers);

  const metrics = [];
  const timezone = await resolveLocationTimezone(config, env, slugUpper, locationId, headers);
  const { fromTs, toTs, fromIso, toIso } = zonedDayBounds(dateRange.from, timezone);

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
    let totalContacts = null;
    const channelCounts = {};
    let page = 1;
    let hasMore = true;
    let usedFallback = false;

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
                gte: fromIso,
                lte: toIso,
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
          const fallbackResult = await collectContactsFallback(
            locationId,
            headers,
            fromTs,
            toTs,
            { requireTotal: includeCurrentState },
          );
          newContacts = fallbackResult.newContacts;
          totalContacts = fallbackResult.totalContacts;
          Object.assign(channelCounts, fallbackResult.channelCounts);
          usedFallback = true;
          hasMore = false;
          break;
        }
        throw new Error(`GHL contacts/search HTTP ${resp.status}${errText ? `: ${errText.slice(0, 200)}` : ''}`);
      }

      const data = await resp.json();
      const contacts = requireArray(data.contacts, 'contacts/search', 'contacts');

      for (const c of contacts) {
        newContacts++;
        const channel = contactChannel(c);
        channelCounts[channel] = (channelCounts[channel] || 0) + 1;
      }

      hasMore = contacts.length === 100;
      page++;
    }

    if (hasMore) {
      throw new Error('GHL contacts/search exceeded the 1,000-row safety limit; refusing to persist a partial count');
    }

    if (!usedFallback && includeCurrentState) {
      const totalResp = await fetch(`${BASE_URL}/contacts/search`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ locationId, page: 1, pageLimit: 1 }),
      });
      await requireOk(totalResp, 'contacts total');
      const totalData = await totalResp.json();
      totalContacts = requireCount(totalData.total ?? totalData.meta?.total, 'contacts total', 'total');
    }

    metrics.push({ name: 'newContacts', value: newContacts, date: dateRange.from });
    if (includeCurrentState) {
      // All-time totals are current-state snapshots, not historical facts for
      // the requested repair day.
      metrics.push({ name: 'totalContacts', value: totalContacts, date: observationDate });
    }

    for (const [channel, count] of Object.entries(channelCounts)) {
      metrics.push({ name: 'newContacts', value: count, date: dateRange.from, dimensions: { channel } });
    }
  } catch (err) {
    rethrowCollectionError('contacts', err);
  }

  // ═══════════════════════════════════════════════════════════
  // 2. CALENDAR EVENTS — GET /calendars/events (native date filter)
  // ═══════════════════════════════════════════════════════════
  try {
    let totalAppointments = 0;
    const statuses = {};
    const appointmentContactIds = [];

    // Get all calendars for this location
    const calResp = await fetch(`${BASE_URL}/calendars/?locationId=${locationId}`, {
      headers: { ...headers, Version: '2021-04-15' },
    });

    await requireOk(calResp, 'calendars');
    const calData = await calResp.json();
    const calendars = requireArray(calData.calendars, 'calendars', 'calendars');

    for (const cal of calendars) {
      const eventsResp = await fetch(
        `${BASE_URL}/calendars/events?locationId=${locationId}&calendarId=${cal.id}&startTime=${fromTs}&endTime=${toTs}`,
        { headers: { ...headers, Version: '2021-04-15' } }
      );

      await requireOk(eventsResp, `calendar events (${cal.id})`);
      const eventsData = await eventsResp.json();
      const events = requireArray(eventsData.events, `calendar events (${cal.id})`, 'events');

      for (const e of events) {
        totalAppointments++;
        const status = e.appointmentStatus || e.status || 'scheduled';
        statuses[status] = (statuses[status] || 0) + 1;
        appointmentContactIds.push(e.contactId || e.contact?.id || null);
      }
    }

    metrics.push({ name: 'appointments', value: totalAppointments, date: dateRange.from });
    for (const [status, count] of Object.entries(statuses)) {
      metrics.push({ name: 'appointments', value: count, date: dateRange.from, dimensions: { status } });
    }

    // Channel split (SAN-326): calendar events only carry contactId, so the
    // acquisition channel comes from the contact join. Rollup row first, then
    // one row per observed channel (same emission pattern as newContacts).
    const appointmentChannelCounts = await channelCountsFor(
      appointmentContactIds,
      resolveContactChannels,
    );
    metrics.push({ name: 'appointmentsByChannel', value: totalAppointments, date: dateRange.from });
    for (const [channel, count] of Object.entries(appointmentChannelCounts)) {
      metrics.push({ name: 'appointmentsByChannel', value: count, date: dateRange.from, dimensions: { channel } });
    }
  } catch (err) {
    rethrowCollectionError('appointments', err);
  }

  // ═══════════════════════════════════════════════════════════
  // 3. OPPORTUNITIES — GET /opportunities/search (native date filter)
  // ═══════════════════════════════════════════════════════════
  try {
    let newOpps = 0;
    let newValue = 0;
    const opportunityContactIds = [];
    let page = 1;
    let hasMore = true;

    while (hasMore && page <= 5) {
      const url = `${BASE_URL}/opportunities/search?locationId=${locationId}&date=${toMMDDYYYY(dateRange.from)}&endDate=${toMMDDYYYY(dateRange.to)}&status=all&limit=100&page=${page}`;
      const resp = await fetch(url, { headers: opportunityHeaders });

      await requireOk(resp, 'opportunities/search');

      const data = await resp.json();
      const opportunities = requireArray(data.opportunities, 'opportunities/search', 'opportunities');

      for (const opp of opportunities) {
        newOpps++;
        newValue += requireCount(opp.monetaryValue ?? 0, 'opportunities/search', 'monetaryValue');
        // v3 embeds contact without source; the channel needs the contact join.
        opportunityContactIds.push(opp.contact?.id || opp.contactId || null);
      }

      hasMore = opportunities.length === 100;
      page++;
    }

    if (hasMore) {
      throw new Error('GHL opportunities/search exceeded the 500-row safety limit; refusing to persist partial totals');
    }

    metrics.push(
      { name: 'opportunities', value: newOpps, date: dateRange.from },
      { name: 'pipelineValue', value: newValue, date: dateRange.from },
    );

    // Channel split (SAN-326): rollup row first, then one row per channel.
    const opportunityChannelCounts = await channelCountsFor(
      opportunityContactIds,
      resolveContactChannels,
    );
    metrics.push({ name: 'opportunitiesByChannel', value: newOpps, date: dateRange.from });
    for (const [channel, count] of Object.entries(opportunityChannelCounts)) {
      metrics.push({ name: 'opportunitiesByChannel', value: count, date: dateRange.from, dimensions: { channel } });
    }

    if (includeCurrentState) {
      // Current total is deliberately not queried once per historical day.
      const totalResp = await fetch(`${BASE_URL}/opportunities/search?locationId=${locationId}&status=all&limit=1`, { headers: opportunityHeaders });
      await requireOk(totalResp, 'opportunities total');
      const totalData = await totalResp.json();
      const totalOpps = requireCount(totalData.meta?.total, 'opportunities total', 'meta.total');
      metrics.push({ name: 'totalOpportunities', value: totalOpps, date: observationDate });

      // Won totals (SAN-326): all-time CRM state, observation-dated like
      // totalOpportunities. Zeros are legitimate while the team starts marking
      // won/lost; a failed query fails the source instead of writing zeros.
      const wonOpps = [];
      let wonPage = 1;
      let wonHasMore = true;
      while (wonHasMore && wonPage <= 5) {
        const wonResp = await fetch(
          `${BASE_URL}/opportunities/search?locationId=${locationId}&status=won&limit=100&page=${wonPage}`,
          { headers: opportunityHeaders },
        );
        await requireOk(wonResp, 'opportunities/search (won)');
        const wonData = await wonResp.json();
        const pageRows = requireArray(wonData.opportunities, 'opportunities/search (won)', 'opportunities');
        wonOpps.push(...pageRows);
        wonHasMore = pageRows.length === 100;
        wonPage++;
      }
      if (wonHasMore) {
        throw new Error('GHL won opportunities exceeded the 500-row safety limit; refusing to persist partial won totals');
      }

      const wonEntries = [];
      for (const opp of wonOpps) {
        if ((opp.status || '').toLowerCase() !== 'won') continue;
        wonEntries.push({
          value: requireCount(opp.monetaryValue ?? 0, 'opportunities/search (won)', 'monetaryValue'),
          contactId: opp.contact?.id || opp.contactId || null,
        });
      }
      const wonChannels = await resolveContactChannels(
        wonEntries.map((entry) => entry.contactId),
      );
      let wonTotalValue = 0;
      const wonByChannel = {};
      const wonValueByChannel = {};
      for (const entry of wonEntries) {
        const channel = (entry.contactId && wonChannels.get(entry.contactId)) || 'Unknown';
        wonTotalValue += entry.value;
        wonByChannel[channel] = (wonByChannel[channel] || 0) + 1;
        wonValueByChannel[channel] = (wonValueByChannel[channel] || 0) + entry.value;
      }
      metrics.push(
        { name: 'wonOpportunities', value: wonEntries.length, date: observationDate },
        { name: 'wonValue', value: wonTotalValue, date: observationDate },
      );
      for (const [channel, count] of Object.entries(wonByChannel)) {
        metrics.push({ name: 'wonByChannel', value: count, date: observationDate, dimensions: { channel } });
      }
      for (const [channel, value] of Object.entries(wonValueByChannel)) {
        metrics.push({ name: 'wonValueByChannel', value, date: observationDate, dimensions: { channel } });
      }
    }
  } catch (err) {
    rethrowCollectionError('opportunities', err);
  }

  // ═══════════════════════════════════════════════════════════
  // 4. RECENT LEADS (last 15, for dashboard feed)
  // ═══════════════════════════════════════════════════════════
  if (includeCurrentState) try {
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
  let pipelineSnapshotPartial = false;
  if (includeCurrentState) try {
    const pipelineMetrics = [];
    const pipesResp = await fetch(`${BASE_URL}/opportunities/pipelines?locationId=${locationId}`, { headers });
    await requireOk(pipesResp, 'opportunities/pipelines');
    const pipesData = await pipesResp.json();
    const pipelines = requireArray(pipesData.pipelines, 'opportunities/pipelines', 'pipelines');
    for (const [pipelineIndex, pipe] of pipelines.entries()) {
        const operation = `opportunities/pipelines[${pipelineIndex}]`;
        const pipelineId = requireText(pipe?.id, operation, 'id');
        const pipelineName = requireText(pipe?.name, operation, 'name');
        const rawStages = requireArray(pipe?.stages, operation, 'stages');
        const seenStageIds = new Set();
        const stages = rawStages.map((stage, stageIndex) => {
          const stageOperation = `${operation}.stages[${stageIndex}]`;
          const stageId = requireText(stage?.id, stageOperation, 'id');
          const stageName = requireText(stage?.name, stageOperation, 'name');
          if (seenStageIds.has(stageId)) {
            throw new Error(`GHL ${operation}: duplicate stage id ${stageId}`);
          }
          seenStageIds.add(stageId);
          return { stageId, stageName, stageOrder: stageIndex + 1 };
        });
        const opps = [];
        let page = 1;
        let hasMore = true;
        while (hasMore && page <= 5) {
          const oppsResp = await fetch(
            `${BASE_URL}/opportunities/search?locationId=${locationId}&pipelineId=${pipelineId}&status=all&limit=100&page=${page}`,
            { headers: opportunityHeaders },
          );
          await requireOk(oppsResp, `pipeline opportunities (${pipelineId})`);
          const oppsData = await oppsResp.json();
          const pageRows = requireArray(
            oppsData.opportunities,
            `pipeline opportunities (${pipelineId})`,
            'opportunities',
          );
          opps.push(...pageRows);
          hasMore = pageRows.length === 100;
          page += 1;
        }
        if (hasMore) {
          throw new Error(
            `GHL pipeline ${pipelineId} exceeded the 500-row safety limit; refusing a partial stage snapshot`,
          );
        }

        const stageCounts = Object.fromEntries(stages.map(({ stageId }) => [stageId, 0]));
        for (const opp of opps) {
          const stageId = requireText(
            opp?.pipelineStageId,
            `pipeline opportunities (${pipelineId})`,
            'pipelineStageId',
          );
          if (!seenStageIds.has(stageId)) {
            throw new Error(
              `GHL pipeline ${pipelineId}: opportunity references unknown stage ${stageId}`,
            );
          }
          stageCounts[stageId] += 1;
        }

        pipelineMetrics.push({
          name: 'pipeline',
          value: opps.length,
          date: observationDate,
          dimensions: {
            pipelineId,
            pipelineName,
          },
        });
        for (const { stageId, stageName, stageOrder } of stages) {
          pipelineMetrics.push({
            name: 'pipelineStage',
            value: stageCounts[stageId],
            date: observationDate,
            dimensions: {
              pipelineId,
              pipelineName,
              stageId,
              stageName,
              stageOrder,
            },
          });
        }
    }
    // Commit the optional snapshot atomically only after every pipeline page
    // and identity validates, so one failed/truncated pipeline cannot look complete.
    metrics.push(...pipelineMetrics);
  } catch (err) {
    pipelineSnapshotPartial = true;
    console.warn(`  ⚠️  GHL pipelines error: ${err.message}`);
  }

  // ═══════════════════════════════════════════════════════════
  // 6. RECENT CONVERSATIONS (last 5, for dashboard feed)
  // ═══════════════════════════════════════════════════════════
  if (includeCurrentState) try {
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
          date: observationDate,
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

  return {
    source: 'ghl',
    date: dateRange.from,
    metrics,
    attemptedDates: [...new Set([
      dateRange.from,
      ...(includeCurrentState ? [observationDate] : []),
    ])].sort(),
    restatedScopes: [
      ...GHL_DAILY_METRIC_NAMES.map((metricName) => ({
        metricDate: dateRange.from,
        metricName,
      })),
      ...(includeCurrentState
        ? [...GHL_OPTIONAL_SNAPSHOT_METRIC_NAMES, ...GHL_WON_SNAPSHOT_METRIC_NAMES].map(
            (metricName) => ({
              metricDate: observationDate,
              metricName,
            }),
          )
        : []),
    ],
    ...(pipelineSnapshotPartial ? { quality: 'partial' } : {}),
  };
}

/**
 * Fallback: GET /contacts/ with client-side date filtering
 * Used if POST /contacts/search is not available
 */
async function collectContactsFallback(
  locationId,
  headers,
  fromTs,
  toTs,
  { requireTotal = true } = {},
) {
  let newContacts = 0;
  let totalContacts = null;
  const channelCounts = {};
  let url = `${BASE_URL}/contacts/?locationId=${locationId}&limit=100`;
  let pages = 0;

  while (url && pages < 10) {
    const resp = await fetch(url, { headers });
    await requireOk(resp, 'contacts fallback');
    const data = await resp.json();
    const contacts = requireArray(data.contacts, 'contacts fallback', 'contacts');
    if (data.meta?.total != null) {
      totalContacts = requireCount(data.meta.total, 'contacts fallback', 'meta.total');
    }

    let reachedBeforeRange = false;
    for (const c of contacts) {
      const created = new Date(c.dateAdded || c.createdAt).getTime();
      if (created >= fromTs && created <= toTs) {
        newContacts++;
        const channel = contactChannel(c);
        channelCounts[channel] = (channelCounts[channel] || 0) + 1;
      }
      if (created < fromTs) {
        reachedBeforeRange = true;
        break;
      }
    }

    url = reachedBeforeRange ? null : data.meta?.nextPageUrl || null;
    pages++;
  }

  if (url) {
    throw new Error('GHL contacts fallback exceeded the 1,000-row safety limit; refusing to persist a partial count');
  }
  if (requireTotal && totalContacts == null) {
    throw new Error('GHL contacts fallback: response missing numeric meta.total');
  }

  return { newContacts, totalContacts, channelCounts };
}
