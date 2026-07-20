#!/usr/bin/env node
/**
 * explee-ghl-bridge.mjs — CONTINUOUS sync of Explee AutoGTM hot leads into
 * GoHighLevel (SAN-488).
 *
 * GHL is the single source of truth for ALL lead information; channel tools
 * only report activity. Explee marks "hot leads" (real-interest replies) but
 * offers no outbound webhooks, so this bridge polls GET /autogtm/hot-leads and
 * keeps each lead's GHL contact in sync as the conversation evolves — not just
 * on first migration:
 * - NEW hot leads are upserted immediately on every tick (source "Explee",
 *   tag "explee"), with the "Explee Hot Desde" DATE field set once.
 * - KNOWN leads get a full thread sweep at most once per UTC day
 *   (state.lastSweepDay): the thread is re-fetched and, only when its
 *   threadHash changed, the status/summary custom fields are refreshed and the
 *   ONE living `[Explee]` note is UPDATED in place
 *   (PUT /contacts/{contactId}/notes/{noteId}) with the latest conversation.
 * Any opportunity creation stays inside GHL (a workflow on the "explee" tag),
 * so the commercial process remains editable there without code.
 *
 * Safety: writes are OPT-IN per brand. The bridge only applies changes when
 * integrations.json has dataSources.explee.config.PUSH_HOT_LEADS_TO_GHL === true;
 * otherwise it runs dry (logs what it would do; dry-run only sweeps known
 * leads with --refresh, since it cannot persist the daily stamp). Per-person
 * sync state ({ threadHash, status, noteId }) lives in workspace _system state;
 * the GHL contact call is an upsert by email, so retries never duplicate.
 *
 * Invoked on an interval by docker/entrypoint.sh (same loop family as
 * autocollect-tick). Manual run: MC_WORKSPACE=... node explee-ghl-bridge.mjs
 * [--slug growth4u] [--apply] [--limit N] [--refresh]
 */

import fs from 'node:fs';
import path from 'node:path';
import {
  buildLeadContext,
  findContextFields,
  threadHash,
  hotSinceValue,
  NOTE_MARKER,
  SUMMARY_FIELD_NAME,
  STATUS_FIELD_NAME,
  HOT_SINCE_FIELD_NAME,
} from './explee-ghl-bridge-context.mjs';

const EXPLEE_BASE = 'https://api.explee.com/public/api/v1';
const GHL_BASE = 'https://services.leadconnectorhq.com';
const PAGE_LIMIT = 100;

function firstPresent(...values) {
  for (const value of values) {
    if (value != null && String(value).trim() !== '') return String(value).trim();
  }
  return '';
}

export function slugEnvPrefix(slug) {
  return String(slug || '').toUpperCase().replace(/-/g, '_');
}

/** Brand .env + process.env layering, same precedence collect.js uses. */
export function loadBrandEnv(workspaceDir, slug, fsImpl = fs) {
  const env = { ...process.env };
  const envPath = path.join(workspaceDir, 'brand', slug, '.env');
  let raw = '';
  try {
    raw = fsImpl.readFileSync(envPath, 'utf-8');
  } catch {
    return env;
  }
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    env[trimmed.slice(0, eq)] = trimmed.slice(eq + 1);
  }
  return env;
}

/**
 * A brand is eligible when both explee and ghl are configured. Writes apply
 * only with the explicit per-brand opt-in flag.
 */
export function bridgeConfig(integrations) {
  const explee = integrations?.dataSources?.explee;
  const ghl = integrations?.dataSources?.ghl;
  if (!explee || !ghl) return null;
  return {
    apply: explee.config?.PUSH_HOT_LEADS_TO_GHL === true,
    ghlLocationId: firstPresent(ghl.config?.locationId, ghl.config?.LOCATION_ID),
  };
}

/** Split a display name for GHL (firstName = first word, lastName = rest). */
export function splitName(name) {
  const clean = String(name || '').trim().replace(/\s+/g, ' ');
  if (!clean) return { firstName: '', lastName: '' };
  const [firstName, ...rest] = clean.split(' ');
  return { firstName, lastName: rest.join(' ') };
}

/** Map one Explee hot lead to a GHL upsert payload. */
export function toGhlContact(lead, locationId) {
  const { firstName, lastName } = splitName(lead.name);
  const payload = {
    locationId,
    email: String(lead.email || '').trim().toLowerCase(),
    firstName,
    lastName,
    source: 'Explee',
    tags: ['explee'],
  };
  const phone = firstPresent(lead.phone);
  if (phone) payload.phone = phone;
  const company = firstPresent(lead.company_name, lead.company_domain);
  if (company) payload.companyName = company;
  return payload;
}

/** Leads not yet known to state, oldest first so state grows in became_hot_at order. */
export function selectNewLeads(leads, knownIds) {
  const done = new Set(knownIds);
  return leads
    .filter((lead) => lead && lead.person_id != null && !done.has(String(lead.person_id)))
    .filter((lead) => firstPresent(lead.email))
    .sort((a, b) => String(a.became_hot_at || '').localeCompare(String(b.became_hot_at || '')));
}

function statePath(workspaceDir, slug) {
  return path.join(workspaceDir, '_system', `explee-ghl-bridge.${slug}.json`);
}

/**
 * State v3: { contacts: { <personId>: { threadHash, status, noteId? } },
 * fieldIds, lastSweepDay }. Older files (v1/v2: bare processedIds array)
 * upgrade in place: each processed id becomes an empty contacts entry — known
 * (so it is NOT re-pushed as new), but without a threadHash, so the first
 * daily sweep re-fetches its thread and adopts the existing [Explee] note.
 */
export function readState(workspaceDir, slug, fsImpl = fs) {
  let data = {};
  try {
    data = JSON.parse(fsImpl.readFileSync(statePath(workspaceDir, slug), 'utf-8'));
  } catch {
    data = {};
  }
  const contacts = {};
  if (data.contacts && typeof data.contacts === 'object') {
    for (const [personId, entry] of Object.entries(data.contacts)) {
      contacts[String(personId)] = entry && typeof entry === 'object' ? entry : {};
    }
  }
  if (Array.isArray(data.processedIds)) {
    for (const id of data.processedIds) {
      if (!contacts[String(id)]) contacts[String(id)] = {};
    }
  }
  return {
    contacts,
    fieldIds: data.fieldIds && typeof data.fieldIds === 'object' ? data.fieldIds : {},
    lastSweepDay: typeof data.lastSweepDay === 'string' ? data.lastSweepDay : null,
  };
}

export function writeState(workspaceDir, slug, state, fsImpl = fs) {
  const contacts = state.contacts && typeof state.contacts === 'object' ? state.contacts : {};
  const payload = {
    // Kept in sync with contacts so a rollback to the pre-v3 bridge still
    // sees every pushed lead as processed (no duplicate notes).
    processedIds: Object.keys(contacts),
    fieldIds: state.fieldIds || {},
    contacts,
  };
  if (state.lastSweepDay) payload.lastSweepDay = state.lastSweepDay;
  const file = statePath(workspaceDir, slug);
  fsImpl.mkdirSync(path.dirname(file), { recursive: true });
  fsImpl.writeFileSync(file, `${JSON.stringify(payload, null, 2)}\n`);
}

function log(message) {
  console.log(`[${new Date().toISOString()}] ${message}`);
}

async function fetchJson(url, options, label) {
  const response = await fetch(url, { ...options, signal: AbortSignal.timeout(30_000) });
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`${label} HTTP ${response.status}${body ? ` — ${body.slice(0, 160)}` : ''}`);
  }
  return response.json();
}

async function fetchHotLeads(apiKey) {
  const headers = { 'X-API-Key': apiKey, Accept: 'application/json' };
  const leads = [];
  let offset = 0;
  for (;;) {
    const page = await fetchJson(
      `${EXPLEE_BASE}/autogtm/hot-leads?limit=${PAGE_LIMIT}&offset=${offset}`,
      { headers },
      'Explee hot-leads',
    );
    leads.push(...(page.leads || []));
    if (!page.has_more) break;
    offset = page.next_offset ?? offset + PAGE_LIMIT;
    if (leads.length > 10_000) throw new Error('Explee hot-leads: pagination runaway');
  }
  return leads;
}

async function upsertGhlContact(apiKey, payload) {
  return fetchJson(`${GHL_BASE}/contacts/upsert`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Version: '2021-07-28',
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(payload),
  }, 'GHL contacts/upsert');
}

async function fetchThread(apiKey, campaignId, personId) {
  try {
    return await fetchJson(
      `${EXPLEE_BASE}/autogtm/campaigns/${encodeURIComponent(campaignId)}/inbox/${encodeURIComponent(personId)}`,
      { headers: { 'X-API-Key': apiKey, Accept: 'application/json' } },
      'Explee thread',
    );
  } catch (error) {
    log(`thread fetch failed for person ${personId} — ${error.message}`);
    return null;
  }
}

function ghlHeaders(apiKey) {
  return {
    Authorization: `Bearer ${apiKey}`,
    Version: '2021-07-28',
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
}

const CONTEXT_FIELD_SPECS = [
  ['summary', SUMMARY_FIELD_NAME, 'LARGE_TEXT'],
  ['status', STATUS_FIELD_NAME, 'TEXT'],
  ['hotSince', HOT_SINCE_FIELD_NAME, 'DATE'],
];

async function createCustomField(apiKey, locationId, name, dataType) {
  const created = await fetchJson(
    `${GHL_BASE}/locations/${encodeURIComponent(locationId)}/customFields`,
    { method: 'POST', headers: ghlHeaders(apiKey), body: JSON.stringify({ name, dataType }) },
    `GHL customFields create ${name}`,
  );
  return created.customField?.id || created.id;
}

/** Find-or-create the three Explee context custom fields; ids cached in state. */
async function ensureContextFields(apiKey, locationId, state) {
  if (CONTEXT_FIELD_SPECS.every(([key]) => state.fieldIds[key])) return state.fieldIds;
  const listing = await fetchJson(
    `${GHL_BASE}/locations/${encodeURIComponent(locationId)}/customFields`,
    { headers: ghlHeaders(apiKey) },
    'GHL customFields list',
  );
  const found = findContextFields(listing.customFields);
  for (const [key, name, dataType] of CONTEXT_FIELD_SPECS) {
    if (found[key]) continue;
    try {
      found[key] = await createCustomField(apiKey, locationId, name, dataType);
    } catch (error) {
      if (dataType !== 'DATE') throw error;
      // Some plans/locations may reject DATE — degrade to TEXT rather than fail.
      log(`custom field ${name} como DATE rechazado (${error.message}) — reintento como TEXT`);
      found[key] = await createCustomField(apiKey, locationId, name, 'TEXT');
    }
    log(`custom field creado en GHL: ${name} (${found[key]})`);
  }
  state.fieldIds = found;
  return found;
}

/**
 * Maintain the ONE living [Explee] note on the contact: update the known note
 * in place (PUT /contacts/{contactId}/notes/{noteId}, verified in the GHL API
 * 2.0 spec); if we don't know its id yet (pre-v3 state) or it was deleted,
 * find it by the NOTE_MARKER prefix and adopt it, else create it. Returns the
 * note id for state.
 */
export async function syncConversationNote(apiKey, contactId, noteText, knownNoteId = null, fetchJsonImpl = fetchJson) {
  const notesUrl = `${GHL_BASE}/contacts/${encodeURIComponent(contactId)}/notes`;
  const putNote = (noteId) => fetchJsonImpl(
    `${notesUrl}/${encodeURIComponent(noteId)}`,
    { method: 'PUT', headers: ghlHeaders(apiKey), body: JSON.stringify({ body: noteText }) },
    'GHL note update',
  );
  if (knownNoteId) {
    try {
      await putNote(knownNoteId);
      return knownNoteId;
    } catch (error) {
      log(`nota ${knownNoteId} no actualizable (${error.message}) — busco/creo la nota [Explee]`);
    }
  }
  const listing = await fetchJsonImpl(notesUrl, { headers: ghlHeaders(apiKey) }, 'GHL notes list');
  const existing = (listing.notes || []).find((n) => String(n.body || '').startsWith(NOTE_MARKER));
  if (existing?.id) {
    await putNote(existing.id);
    return existing.id;
  }
  const created = await fetchJsonImpl(
    notesUrl,
    { method: 'POST', headers: ghlHeaders(apiKey), body: JSON.stringify({ body: noteText }) },
    'GHL note create',
  );
  return created.note?.id || created.id || null;
}

async function runBrand(workspaceDir, slug, { applyOverride = false, limit = Infinity, refresh = false } = {}) {
  const intPath = path.join(workspaceDir, 'brand', slug, 'integrations.json');
  let integrations;
  try {
    integrations = JSON.parse(fs.readFileSync(intPath, 'utf-8'));
  } catch {
    return;
  }
  const config = bridgeConfig(integrations);
  if (!config) return;

  const env = loadBrandEnv(workspaceDir, slug);
  const prefix = slugEnvPrefix(slug);
  const expleeKey = firstPresent(env[`${prefix}_EXPLEE_API_KEY`], env.EXPLEE_API_KEY);
  const ghlKey = firstPresent(env[`${prefix}_GHL_API_KEY`], env.GHL_API_KEY);
  if (!expleeKey || !ghlKey) {
    log(`${slug}: skip (missing ${!expleeKey ? 'Explee' : 'GHL'} API key)`);
    return;
  }
  if (!config.ghlLocationId) {
    log(`${slug}: skip (missing GHL locationId in integrations.json)`);
    return;
  }

  const apply = config.apply || applyOverride;
  const state = readState(workspaceDir, slug);
  const hotLeads = await fetchHotLeads(expleeKey);

  // Cadence: NEW leads sync immediately on every tick; KNOWN leads get a full
  // thread sweep at most once per UTC day (or always with --refresh). Dry-run
  // cannot persist lastSweepDay, so it only sweeps with an explicit --refresh.
  const today = new Date().toISOString().slice(0, 10);
  const newLeads = selectNewLeads(hotLeads, Object.keys(state.contacts));
  const sweep = refresh || (apply && state.lastSweepDay !== today);
  const knownLeads = sweep
    ? hotLeads.filter((lead) => lead && lead.person_id != null && state.contacts[String(lead.person_id)] && firstPresent(lead.email))
    : [];
  const queue = [
    ...newLeads.map((lead) => ({ lead, isNew: true })),
    ...knownLeads.map((lead) => ({ lead, isNew: false })),
  ].slice(0, limit);
  log(`${slug}: ${hotLeads.length} hot lead(s) en Explee — ${newLeads.length} nuevo(s), ${knownLeads.length} conocido(s) a revisar${sweep ? ' (sweep)' : ''} ${apply ? '(APPLY)' : '(dry-run)'}`);

  let fieldIds = { summary: null, status: null, hotSince: null };
  if (apply) {
    try {
      fieldIds = await ensureContextFields(ghlKey, config.ghlLocationId, state);
    } catch (error) {
      log(`${slug}: custom fields no disponibles (${error.message}) — sigo sin resumen/status en campos`);
    }
  }

  let batchFailed = false;
  for (const { lead, isNew } of queue) {
    const personId = String(lead.person_id);
    const entry = state.contacts[personId];
    const thread = await fetchThread(expleeKey, lead.campaign_id, lead.person_id);
    const hash = threadHash(thread);
    if (!isNew) {
      if (hash == null) continue; // thread unavailable — keep what GHL has
      if (entry?.threadHash === hash) continue; // unchanged — skip all writes
    }
    const context = buildLeadContext(lead, thread);
    const payload = toGhlContact(lead, config.ghlLocationId);
    const customFields = [];
    if (fieldIds.status) customFields.push({ id: fieldIds.status, value: context.statusText });
    if (fieldIds.summary) customFields.push({ id: fieldIds.summary, value: context.summaryText });
    if (isNew && fieldIds.hotSince) {
      const hotSince = hotSinceValue(lead.became_hot_at);
      if (hotSince) customFields.push({ id: fieldIds.hotSince, value: hotSince });
    }
    if (customFields.length) payload.customFields = customFields;
    if (!apply) {
      log(`${slug}: [dry] ${isNew ? 'upsert' : 'update'} ${payload.email} — ${payload.firstName} ${payload.lastName} @ ${payload.companyName || '-'} (status ${context.statusText})`);
      continue;
    }
    try {
      const result = await upsertGhlContact(ghlKey, payload);
      const contactId = result.contact?.id || result.id;
      let noteId = entry?.noteId || null;
      if (contactId) {
        try {
          noteId = await syncConversationNote(ghlKey, contactId, context.noteText, noteId);
        } catch (error) {
          log(`${slug}: nota falló para ${payload.email} — ${error.message}`);
        }
      }
      state.contacts[personId] = { threadHash: hash, status: context.statusText };
      if (noteId) state.contacts[personId].noteId = noteId;
      log(`${slug}: ${isNew ? 'upserted' : 'conversación actualizada'} ${payload.email} (person ${personId}, status ${context.statusText})`);
    } catch (error) {
      // Stop the batch on the first failure: state only records confirmed
      // upserts, so the next tick (or sweep) retries this lead without
      // skipping it.
      log(`${slug}: ERROR upserting ${payload.email} — ${error.message}`);
      batchFailed = true;
      break;
    }
  }

  if (apply) {
    // Stamp the daily sweep only when it completed; a broken batch retries on
    // the next tick instead of waiting a day.
    if (sweep && !batchFailed) state.lastSweepDay = today;
    writeState(workspaceDir, slug, state);
  }
}

function listBridgeBrands(workspaceDir) {
  const brandRoot = path.join(workspaceDir, 'brand');
  let entries = [];
  try {
    entries = fs.readdirSync(brandRoot);
  } catch {
    return [];
  }
  return entries.filter((entry) => !entry.startsWith('.') && !entry.startsWith('_')).sort();
}

async function main() {
  const args = process.argv.slice(2);
  const getArg = (name) => {
    const idx = args.indexOf(`--${name}`);
    return idx !== -1 && args[idx + 1] ? args[idx + 1] : null;
  };
  const workspaceDir = process.env.MC_WORKSPACE;
  if (!workspaceDir) {
    console.error('explee-ghl-bridge: MC_WORKSPACE is required');
    process.exit(1);
  }
  const onlySlug = getArg('slug');
  const applyOverride = args.includes('--apply');
  const refresh = args.includes('--refresh');
  const limit = Number.parseInt(getArg('limit') || '', 10) || Infinity;

  const slugs = onlySlug ? [onlySlug] : listBridgeBrands(workspaceDir);
  for (const slug of slugs) {
    try {
      await runBrand(workspaceDir, slug, { applyOverride, limit, refresh });
    } catch (error) {
      log(`${slug}: ERROR — ${error.message}`);
    }
  }
}

if (process.argv[1] && path.resolve(process.argv[1]).endsWith('explee-ghl-bridge.mjs')) {
  await main();
}
