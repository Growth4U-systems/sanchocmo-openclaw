/**
 * explee-ghl-bridge-context.mjs — conversation context for the Explee→GHL
 * bridge (SAN-488). Pure helpers, imported by explee-ghl-bridge.mjs and unit
 * tests; no I/O here.
 *
 * The sales team asked every "nuevo lead" to arrive with WHY it is hot, the
 * conversation status and what the lead actually replied — both in Slack (via
 * the GHL workflow template reading the custom fields) and on the contact
 * itself (note). Explee exposes the thread at
 * GET /autogtm/campaigns/{campaign_id}/inbox/{person_id}:
 *   { latest_intent, can_reply, messages: [{ type, from_email, to_email,
 *     subject, body_text, ts, intent, ... }] }
 */

const SUMMARY_FIELD_NAME = 'Explee Resumen';
const STATUS_FIELD_NAME = 'Explee Status';
const NOTE_MARKER = '[Explee]';

export { SUMMARY_FIELD_NAME, STATUS_FIELD_NAME, NOTE_MARKER };

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

/** Replies are messages coming FROM the lead. */
export function splitMessages(messages, leadEmail) {
  const email = clean(leadEmail).toLowerCase();
  const replies = [];
  const outbound = [];
  for (const m of Array.isArray(messages) ? messages : []) {
    if (!m || typeof m !== 'object') continue;
    const from = clean(m.from_email).toLowerCase();
    if (m.type === 'reply' || (email && from === email)) replies.push(m);
    else outbound.push(m);
  }
  return { replies, outbound };
}

/**
 * Build the three artifacts from a lead + its thread:
 * - statusText: short, for the "Explee Status" field (drives Slack template)
 * - summaryText: compact, for the "Explee Resumen" field (drives Slack template)
 * - noteText: fuller, for the contact note (starts with NOTE_MARKER for dedupe)
 * Thread may be null (fetch failed) — falls back to why_hot only.
 */
export function buildLeadContext(lead, thread) {
  const status = clean(thread?.latest_intent) || 'hot_lead';
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
  noteLines.push(`Conversación: ${outbound.length} email(s) enviados, ${replies.length} respuesta(s).`);
  for (const reply of replies.slice(-3)) {
    noteLines.push(`— Respuesta (${tsDate(reply.ts)}${reply.subject ? ` · ${trimText(reply.subject, 80)}` : ''}): ${trimText(reply.body_text, 600)}`);
  }
  const noteText = noteLines.join('\n');

  return { statusText: status, summaryText, noteText };
}

/**
 * Resolve the two custom-field ids from a GHL customFields listing, matching
 * by (normalized) name. Returns { summary, status } with null for missing.
 */
export function findContextFields(customFields) {
  const norm = (s) => clean(s).toLowerCase();
  let summary = null;
  let status = null;
  for (const field of Array.isArray(customFields) ? customFields : []) {
    if (norm(field?.name) === norm(SUMMARY_FIELD_NAME)) summary = field.id;
    if (norm(field?.name) === norm(STATUS_FIELD_NAME)) status = field.id;
  }
  return { summary, status };
}
