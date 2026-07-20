import test from 'node:test';
import assert from 'node:assert/strict';

import { buildLeadContext, splitMessages, findContextFields, NOTE_MARKER } from '../explee-ghl-bridge-context.mjs';

const LEAD = {
  email: 'ana@acme.com',
  why_hot: 'Pidió una demo para su equipo',
  campaign_id: 53894,
  job_title: 'CMO',
  company_name: 'ACME',
  linkedin_url: 'https://linkedin.com/in/ana',
};

const THREAD = {
  latest_intent: 'hot_lead',
  messages: [
    { type: 'outbound', from_email: 'us@growth4u.io', subject: 'Hola', body_text: 'Pitch inicial', ts: '2026-07-01T10:00:00Z' },
    { type: 'reply', from_email: 'ana@acme.com', subject: 'RE: Hola', body_text: 'Me interesa, ¿podemos hablar el jueves?', ts: '2026-07-02T09:00:00Z' },
  ],
};

test('splitMessages separates replies from outbound by type or sender', () => {
  const { replies, outbound } = splitMessages(THREAD.messages, 'ana@acme.com');
  assert.equal(replies.length, 1);
  assert.equal(outbound.length, 1);
  const bySender = splitMessages([{ from_email: 'ANA@acme.com', body_text: 'x' }], 'ana@acme.com');
  assert.equal(bySender.replies.length, 1);
});

test('buildLeadContext produces status, compact summary and marked note', () => {
  const ctx = buildLeadContext(LEAD, THREAD);
  assert.equal(ctx.statusText, 'hot_lead');
  assert.match(ctx.summaryText, /1 enviados \/ 1 respuestas/);
  assert.match(ctx.summaryText, /Pidió una demo/);
  assert.match(ctx.summaryText, /podemos hablar el jueves/);
  assert.ok(ctx.noteText.startsWith(NOTE_MARKER));
  assert.match(ctx.noteText, /CMO @ ACME/);
  assert.match(ctx.noteText, /linkedin.com\/in\/ana/);
});

test('buildLeadContext degrades gracefully without a thread', () => {
  const ctx = buildLeadContext(LEAD, null);
  assert.equal(ctx.statusText, 'hot_lead');
  assert.match(ctx.summaryText, /0 enviados \/ 0 respuestas/);
  assert.match(ctx.summaryText, /Pidió una demo/);
});

test('findContextFields matches by name case-insensitively', () => {
  const ids = findContextFields([
    { id: 'a1', name: 'explee resumen' },
    { id: 'b2', name: 'Explee Status' },
    { id: 'c3', name: 'Otro' },
  ]);
  assert.deepEqual(ids, { summary: 'a1', status: 'b2' });
});
