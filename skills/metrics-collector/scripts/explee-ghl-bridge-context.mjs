/**
 * explee-ghl-bridge-context.mjs — conversation context for the Explee→GHL
 * bridge (SAN-488). Pure helpers, imported by explee-ghl-bridge.mjs and unit
 * tests; no I/O here.
 *
 * GHL is the source of truth for ALL lead information, so the bridge keeps a
 * LIVING conversation on each contact: one `[Explee]` note holding the last
 * few messages in BOTH directions (our sends "→ nosotros" and the lead's
 * replies "← lead"), plus the evolving status/summary custom fields. Explee
 * exposes the thread at GET /autogtm/campaigns/{campaign_id}/inbox/{person_id}:
 *   { latest_intent, can_reply, messages: [{ type, from_email, to_email,
 *     subject, body_text, ts, intent, ... }] }
 * threadHash() fingerprints that thread so the bridge only writes to GHL when
 * the conversation (or its latest_intent) actually changed.
 */

import { createHash } from 'node:crypto';

const SUMMARY_FIELD_NAME = 'Explee Resumen';
const STATUS_FIELD_NAME = 'Explee Status';
const HOT_SINCE_FIELD_NAME = 'Explee Hot Desde';
const NOTE_MARKER = '[Explee]';
/** The living note keeps at most this many messages (both directions). */
const MAX_NOTE_MESSAGES = 10;

export { SUMMARY_FIELD_NAME, STATUS_FIELD_NAME, HOT_SINCE_FIELD_NAME, NOTE_MARKER, MAX_NOTE_MESSAGES };

function clean(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function trimText(text, max) {
  const t = clean(text).replace(/\s+/g, ' ');
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

function tsDate(ts) {
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
}

function isReplyMessage(message, leadEmail) {
  const from = clean(message?.from_email).toLowerCase();
  return message?.type === 'reply' || (Boolean(leadEmail) && from === leadEmail);
}

/** Replies are messages coming FROM the lead. */
export function splitMessages(messages, leadEmail) {
  const email = clean(leadEmail).toLowerCase();
  const replies = [];
  const outbound = [];
  for (const m of Array.isArray(messages) ? messages : []) {
    if (!m || typeof m !== 'object') continue;
    if (isReplyMessage(m, email)) replies.push(m);
    else outbound.push(m);
  }
  return { replies, outbound };
}

/**
 * Stable fingerprint of a thread: sha1 over latest_intent + one line per
 * message (id|ts|type), sorted so API ordering quirks don't produce spurious
 * "changes". Returns null when the thread is missing/unfetchable — callers
 * treat null as "unknown, don't overwrite".
 */
export function threadHash(thread) {
  if (!thread || !Array.isArray(thread.messages)) return null;
  const lines = [];
  for (const m of thread.messages) {
    if (!m || typeof m !== 'object') continue;
    lines.push(`${m.id ?? m.message_id ?? ''}|${m.ts ?? ''}|${m.type ?? ''}`);
  }
  lines.sort();
  return createHash('sha1').update([clean(thread.latest_intent), ...lines].join('\n')).digest('hex');
}

/** became_hot_at → YYYY-MM-DD for the "Explee Hot Desde" DATE field. */
export function hotSinceValue(becameHotAt) {
  const d = new Date(becameHotAt ?? '');
  return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
}

/**
 * Build the three artifacts from a lead + its thread:
 * - statusText: short, for the "Explee Status" field (drives Slack template)
 * - summaryText: compact, for the "Explee Resumen" field (drives Slack template)
 * - noteText: the LIVING conversation note (starts with NOTE_MARKER so the
 *   bridge can find and update it in place): last MAX_NOTE_MESSAGES messages,
 *   both directions, chronological, dated, "→ nosotros" / "← lead" markers.
 * Thread may be null (fetch failed) — falls back to why_hot only.
 */
export function buildLeadContext(lead, thread) {
  const status = clean(thread?.latest_intent) || 'hot_lead';
  const email = clean(lead?.email).toLowerCase();
  const { replies, outbound } = splitMessages(thread?.messages, lead?.email);
  const lastReply = replies[replies.length - 1];
  const why = trimText(lead?.why_hot, 300);

  const summaryParts = [`Status: ${status} · ${outbound.length} enviados / ${replies.length} respuestas`];
  if (why) summaryParts.push(`Por qué es hot: ${why}`);
  if (lastReply) {
    summaryParts.push(`Última respuesta (${tsDate(lastReply.ts)}): "${trimText(lastReply.body_text, 400)}"`);
  }
  const summaryText = summaryParts.join('\n');

  const noteLines = [
    `${NOTE_MARKER} Hot lead de Explee — campaña ${lead?.campaign_id ?? '-'} · status: ${status}`,
  ];
  if (why) noteLines.push(`Por qué es hot: ${why}`);
  if (lead?.job_title || lead?.company_name) {
    noteLines.push(`Perfil: ${clean(lead?.job_title) || '-'} @ ${clean(lead?.company_name) || clean(lead?.company_domain) || '-'}`);
  }
  if (lead?.linkedin_url) noteLines.push(`LinkedIn: ${clean(lead.linkedin_url)}`);

  const ordered = (Array.isArray(thread?.messages) ? thread.messages : [])
    .filter((m) => m && typeof m === 'object')
    .slice()
    .sort((a, b) => String(a.ts ?? '').localeCompare(String(b.ts ?? '')));
  const shown = ordered.slice(-MAX_NOTE_MESSAGES);
  const window = shown.length < ordered.length ? ` · últimos ${shown.length} de ${ordered.length} mensajes` : '';
  noteLines.push(`Conversación: ${outbound.length} email(s) enviados, ${replies.length} respuesta(s).${window}`);
  for (const m of shown) {
    const marker = isReplyMessage(m, email) ? '← lead' : '→ nosotros';
    const subject = clean(m.subject) ? ` · ${trimText(m.subject, 80)}` : '';
    noteLines.push(`— ${tsDate(m.ts) || 's/f'} ${marker}${subject}: ${trimText(m.body_text, 500)}`);
  }
  const noteText = noteLines.join('\n');

  return { statusText: status, summaryText, noteText };
}

/**
 * Resolve the three custom-field ids from a GHL customFields listing, matching
 * by (normalized) name. Returns { summary, status, hotSince } with null for
 * missing.
 */
export function findContextFields(customFields) {
  const norm = (s) => clean(s).toLowerCase();
  let summary = null;
  let status = null;
  let hotSince = null;
  for (const field of Array.isArray(customFields) ? customFields : []) {
    if (norm(field?.name) === norm(SUMMARY_FIELD_NAME)) summary = field.id;
    if (norm(field?.name) === norm(STATUS_FIELD_NAME)) status = field.id;
    if (norm(field?.name) === norm(HOT_SINCE_FIELD_NAME)) hotSince = field.id;
  }
  return { summary, status, hotSince };
}
