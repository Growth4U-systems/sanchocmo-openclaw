import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildLeadContext,
  splitMessages,
  findContextFields,
  threadHash,
  hotSinceValue,
  NOTE_MARKER,
  MAX_NOTE_MESSAGES,
  HOT_SINCE_FIELD_NAME,
} from '../explee-ghl-bridge-context.mjs';

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
    { id: 'm1', type: 'outbound', from_email: 'us@growth4u.io', subject: 'Hola', body_text: 'Pitch inicial', ts: '2026-07-01T10:00:00Z' },
    { id: 'm2', type: 'reply', from_email: 'ana@acme.com', subject: 'RE: Hola', body_text: 'Me interesa, ¿podemos hablar el jueves?', ts: '2026-07-02T09:00:00Z' },
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

test('the living note lists BOTH directions chronologically with markers and dates', () => {
  const ctx = buildLeadContext(LEAD, THREAD);
  const lines = ctx.noteText.split('\n');
  const ours = lines.findIndex((l) => l.includes('→ nosotros'));
  const theirs = lines.findIndex((l) => l.includes('← lead'));
  assert.ok(ours !== -1, 'our message is in the note');
  assert.ok(theirs !== -1, "the lead's reply is in the note");
  assert.ok(ours < theirs, 'chronological order (our email first)');
  assert.match(lines[ours], /^— 2026-07-01 → nosotros · Hola: Pitch inicial$/);
  assert.match(lines[theirs], /^— 2026-07-02 ← lead · RE: Hola: Me interesa/);
});

test('the living note caps at the last MAX_NOTE_MESSAGES messages', () => {
  const many = {
    latest_intent: 'meeting_request',
    messages: Array.from({ length: MAX_NOTE_MESSAGES + 4 }, (_, i) => ({
      id: `m${i}`,
      type: i % 2 ? 'reply' : 'outbound',
      from_email: i % 2 ? 'ana@acme.com' : 'us@growth4u.io',
      body_text: `mensaje ${i}`,
      ts: `2026-07-${String(i + 1).padStart(2, '0')}T10:00:00Z`,
    })),
  };
  const ctx = buildLeadContext(LEAD, many);
  const messageLines = ctx.noteText.split('\n').filter((l) => l.startsWith('— '));
  assert.equal(messageLines.length, MAX_NOTE_MESSAGES);
  assert.match(ctx.noteText, new RegExp(`últimos ${MAX_NOTE_MESSAGES} de ${MAX_NOTE_MESSAGES + 4} mensajes`));
  assert.doesNotMatch(ctx.noteText, /mensaje 0$/m, 'oldest message dropped');
  assert.match(ctx.noteText, new RegExp(`mensaje ${MAX_NOTE_MESSAGES + 3}$`, 'm'), 'newest message kept');
});

test('buildLeadContext degrades gracefully without a thread', () => {
  const ctx = buildLeadContext(LEAD, null);
  assert.equal(ctx.statusText, 'hot_lead');
  assert.match(ctx.summaryText, /0 enviados \/ 0 respuestas/);
  assert.match(ctx.summaryText, /Pidió una demo/);
});

test('threadHash is stable across message order and null without a thread', () => {
  const shuffled = { ...THREAD, messages: [...THREAD.messages].reverse() };
  assert.equal(threadHash(THREAD), threadHash(shuffled));
  assert.equal(threadHash(null), null);
  assert.equal(threadHash({ latest_intent: 'x' }), null);
});

test('threadHash changes when a message arrives or latest_intent evolves', () => {
  const base = threadHash(THREAD);
  const withNew = threadHash({
    ...THREAD,
    messages: [...THREAD.messages, { id: 'm3', type: 'reply', ts: '2026-07-03T08:00:00Z' }],
  });
  const newIntent = threadHash({ ...THREAD, latest_intent: 'meeting_request' });
  assert.notEqual(base, withNew);
  assert.notEqual(base, newIntent);
});

test('hotSinceValue formats became_hot_at as YYYY-MM-DD and tolerates garbage', () => {
  assert.equal(hotSinceValue('2026-07-15T09:30:00Z'), '2026-07-15');
  assert.equal(hotSinceValue('not a date'), '');
  assert.equal(hotSinceValue(undefined), '');
});

test('findContextFields matches the three fields by name case-insensitively', () => {
  const ids = findContextFields([
    { id: 'a1', name: 'explee resumen' },
    { id: 'b2', name: 'Explee Status' },
    { id: 'c3', name: 'Otro' },
    { id: 'd4', name: 'EXPLEE HOT DESDE' },
  ]);
  assert.deepEqual(ids, { summary: 'a1', status: 'b2', hotSince: 'd4' });
  assert.equal(typeof HOT_SINCE_FIELD_NAME, 'string');
});
