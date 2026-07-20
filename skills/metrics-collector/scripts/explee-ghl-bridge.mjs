#!/usr/bin/env node
/**
 * explee-ghl-bridge.mjs — push Explee AutoGTM hot leads into GoHighLevel (SAN-488).
 *
 * GHL is the single source of truth for sales leads; channel tools only report
 * activity. Explee marks "hot leads" (real-interest replies) but offers no
 * outbound webhooks, so this bridge polls GET /autogtm/hot-leads and upserts
 * each lead as a GHL contact with source "Explee" + tag "explee" — mirroring
 * the existing trust-bridge pattern (quiz → GHL webhook → upsert by email).
 * Any opportunity creation stays inside GHL (a workflow on the "explee" tag),
 * so the commercial process remains editable there without code.
 *
 * Safety: writes are OPT-IN per brand. The bridge only applies changes when
 * integrations.json has dataSources.explee.config.PUSH_HOT_LEADS_TO_GHL === true;
 * otherwise it runs dry (logs what it would do). Processed person_ids are
 * remembered in workspace _system state so a lead is pushed once, and the GHL
 * call is an upsert by email, so retries never duplicate contacts.
 *
 * Invoked on an interval by docker/entrypoint.sh (same loop family as
 * autocollect-tick). Manual run: MC_WORKSPACE=... node explee-ghl-bridge.mjs
 * [--slug growth4u] [--apply] [--limit N]
 */

import fs from 'node:fs';
import path from 'node:path';
import { buildLeadContext, findContextFields, NOTE_MARKER, SUMMARY_FIELD_NAME, STATUS_FIELD_NAME } from './explee-ghl-bridge-context.mjs';

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

/** Leads not yet pushed, oldest first so state grows in became_hot_at order. */
export function selectNewLeads(leads, processedIds) {
  const done = new Set(processedIds);
  return leads
    .filter((lead) => lead && lead.person_id != null && !done.has(String(lead.person_id)))
    .filter((lead) => firstPresent(lead.email))
    .sort((a, b) => String(a.became_hot_at || '').localeCompare(String(b.became_hot_at || '')));
}

function statePath(workspaceDir, slug) {
  return path.join(workspaceDir, '_system', `explee-ghl-bridge.${slug}.json`);
}

export function readState(workspaceDir, slug, fsImpl = fs) {
  try {
    const data = JSON.parse(fsImpl.readFileSync(statePath(workspaceDir, slug), 'utf-8'));
    return {
      processedIds: Array.isArray(data.processedIds) ? data.processedIds.map(String) : [],
      fieldIds: data.fieldIds && typeof data.fieldIds === 'object' ? data.fieldIds : {},
    };
  } catch {
    return { processedIds: [], fieldIds: {} };
  }
}

export function writeState(workspaceDir, slug, state, fsImpl = fs) {
  const file = statePath(workspaceDir, slug);
  fsImpl.mkdirSync(path.dirname(file), { recursive: true });
  fsImpl.writeFileSync(file, `${JSON.stringify(state, null, 2)}\n`);
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

/** Find-or-create the two Explee context custom fields; ids cached in state. */
async function ensureContextFields(apiKey, locationId, state) {
  if (state.fieldIds.summary && state.fieldIds.status) return state.fieldIds;
  const listing = await fetchJson(
    `${GHL_BASE}/locations/${encodeURIComponent(locationId)}/customFields`,
    { headers: ghlHeaders(apiKey) },
    'GHL customFields list',
  );
  const found = findContextFields(listing.customFields);
  for (const [key, name] of [['summary', SUMMARY_FIELD_NAME], ['status', STATUS_FIELD_NAME]]) {
    if (found[key]) continue;
    const created = await fetchJson(
      `${GHL_BASE}/locations/${encodeURIComponent(locationId)}/customFields`,
      {
        method: 'POST',
        headers: ghlHeaders(apiKey),
        body: JSON.stringify({ name, dataType: key === 'summary' ? 'LARGE_TEXT' : 'TEXT' }),
      },
      `GHL customFields create ${name}`,
    );
    found[key] = created.customField?.id || created.id;
    log(`custom field creado en GHL: ${name} (${found[key]})`);
  }
  state.fieldIds = found;
  return found;
}

/** Add the conversation note unless the contact already has an Explee note. */
async function addNoteIfMissing(apiKey, contactId, noteText) {
  const listing = await fetchJson(
    `${GHL_BASE}/contacts/${encodeURIComponent(contactId)}/notes`,
    { headers: ghlHeaders(apiKey) },
    'GHL notes list',
  );
  const exists = (listing.notes || []).some((n) => String(n.body || '').startsWith(NOTE_MARKER));
  if (exists) return false;
  await fetchJson(
    `${GHL_BASE}/contacts/${encodeURIComponent(contactId)}/notes`,
    { method: 'POST', headers: ghlHeaders(apiKey), body: JSON.stringify({ body: noteText }) },
    'GHL note create',
  );
  return true;
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
  const fresh = refresh
    ? hotLeads.filter((lead) => firstPresent(lead?.email)).slice(0, limit)
    : selectNewLeads(hotLeads, state.processedIds).slice(0, limit);
  log(`${slug}: ${hotLeads.length} hot lead(s) en Explee, ${fresh.length} a procesar ${refresh ? '(refresh) ' : ''}${apply ? '(APPLY)' : '(dry-run)'}`);

  let fieldIds = { summary: null, status: null };
  if (apply) {
    try {
      fieldIds = await ensureContextFields(ghlKey, config.ghlLocationId, state);
    } catch (error) {
      log(`${slug}: custom fields no disponibles (${error.message}) — sigo sin resumen/status en campos`);
    }
  }

  for (const lead of fresh) {
    const payload = toGhlContact(lead, config.ghlLocationId);
    const thread = await fetchThread(expleeKey, lead.campaign_id, lead.person_id);
    const context = buildLeadContext(lead, thread);
    if (fieldIds.summary && fieldIds.status) {
      payload.customFields = [
        { id: fieldIds.status, value: context.statusText },
        { id: fieldIds.summary, value: context.summaryText },
      ];
    }
    if (!apply) {
      log(`${slug}: [dry] upsert ${payload.email} — ${payload.firstName} ${payload.lastName} @ ${payload.companyName || '-'} (status ${context.statusText})`);
      continue;
    }
    try {
      const result = await upsertGhlContact(ghlKey, payload);
      const contactId = result.contact?.id || result.id;
      if (contactId) {
        try {
          const added = await addNoteIfMissing(ghlKey, contactId, context.noteText);
          if (added) log(`${slug}: nota de conversación añadida a ${payload.email}`);
        } catch (error) {
          log(`${slug}: nota falló para ${payload.email} — ${error.message}`);
        }
      }
      if (!state.processedIds.includes(String(lead.person_id))) {
        state.processedIds.push(String(lead.person_id));
      }
      log(`${slug}: upserted ${payload.email} (person ${lead.person_id}, status ${context.statusText})`);
    } catch (error) {
      // Stop the batch on the first failure: state only records confirmed
      // upserts, so the next tick retries this lead without skipping it.
      log(`${slug}: ERROR upserting ${payload.email} — ${error.message}`);
      break;
    }
  }

  if (apply) writeState(workspaceDir, slug, state);
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
