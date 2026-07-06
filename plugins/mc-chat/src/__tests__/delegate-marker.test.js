import { test } from "node:test";
import assert from "node:assert/strict";
import { parseDelegateMarkers, DELEGATE_AGENTS, slugForThread } from "../delegate-marker.js";

const ALLOWED = new Set(["hamete", "rocinante", "dulcinea"]);

test("returns text unchanged with no delegations when there is no marker", () => {
  const text = "Claro, te ayudo con eso. ¿Quieres que lo organice?";
  const out = parseDelegateMarkers(text, ALLOWED);
  assert.equal(out.text, text);
  assert.deepEqual(out.delegations, []);
  assert.deepEqual(out.malformed, []);
});

test("parses a well-formed delegate block and strips it from the text", () => {
  const text =
    'Te paso esto a Hamete.\n\n:::delegate\n{"agent":"hamete","name":"Influencers Itnig","brief":"Busca influencers/podcasts B2B; Itnig primero, con fuentes."}\n:::\n\nTe aviso cuando vuelva.';
  const out = parseDelegateMarkers(text, ALLOWED);
  assert.equal(out.delegations.length, 1);
  assert.deepEqual(out.delegations[0], {
    agent: "hamete",
    name: "Influencers Itnig",
    brief: "Busca influencers/podcasts B2B; Itnig primero, con fuentes.",
  });
  // marker block removed, surrounding prose preserved (no leftover blank gaps)
  assert.equal(out.text, "Te paso esto a Hamete.\n\nTe aviso cuando vuelva.");
  assert.deepEqual(out.malformed, []);
});

test("name is optional → omitted when absent", () => {
  const text = ':::delegate\n{"agent":"rocinante","brief":"Contacta a los 5 podcasts del shortlist."}\n:::';
  const out = parseDelegateMarkers(text, ALLOWED);
  assert.equal(out.delegations.length, 1);
  assert.equal(out.delegations[0].agent, "rocinante");
  assert.equal(out.delegations[0].brief, "Contacta a los 5 podcasts del shortlist.");
  assert.equal(out.delegations[0].name, undefined);
});

test("collects multiple delegate blocks in order", () => {
  const text =
    ':::delegate\n{"agent":"hamete","brief":"research"}\n:::\nluego\n:::delegate\n{"agent":"rocinante","brief":"outreach"}\n:::';
  const out = parseDelegateMarkers(text, ALLOWED);
  assert.equal(out.delegations.length, 2);
  assert.equal(out.delegations[0].agent, "hamete");
  assert.equal(out.delegations[1].agent, "rocinante");
  assert.equal(out.text, "luego");
});

test("rejects a disallowed agent → no delegation, block recorded as malformed and stripped", () => {
  const text = 'pre\n:::delegate\n{"agent":"sancho","brief":"do it"}\n:::\npost';
  const out = parseDelegateMarkers(text, ALLOWED);
  assert.deepEqual(out.delegations, []);
  assert.equal(out.malformed.length, 1);
  assert.equal(out.text, "pre\n\npost");
});

test("rejects a block with empty brief → malformed, no delegation", () => {
  const text = ':::delegate\n{"agent":"hamete","brief":"   "}\n:::';
  const out = parseDelegateMarkers(text, ALLOWED);
  assert.deepEqual(out.delegations, []);
  assert.equal(out.malformed.length, 1);
});

test("rejects invalid JSON inside the block → malformed, no delegation", () => {
  const text = ':::delegate\n{not valid json}\n:::';
  const out = parseDelegateMarkers(text, ALLOWED);
  assert.deepEqual(out.delegations, []);
  assert.equal(out.malformed.length, 1);
  assert.equal(out.text, "");
});

test("does NOT touch :::ask blocks", () => {
  const text = 'pre\n:::ask\n{"id":"q_tone","prompt":"¿Tono?","mode":"single","options":[]}\n:::\npost';
  const out = parseDelegateMarkers(text, ALLOWED);
  assert.equal(out.text, text);
  assert.deepEqual(out.delegations, []);
});

test("trims whitespace in agent/brief and lowercases the agent slug", () => {
  const text = ':::delegate\n{"agent":" Hamete ","brief":"  con espacios  "}\n:::';
  const out = parseDelegateMarkers(text, ALLOWED);
  assert.equal(out.delegations.length, 1);
  assert.equal(out.delegations[0].agent, "hamete");
  assert.equal(out.delegations[0].brief, "con espacios");
});

test("exports the canonical delegate agent set, excluding the orchestrator sancho", () => {
  assert.ok(DELEGATE_AGENTS instanceof Set);
  assert.ok(DELEGATE_AGENTS.has("hamete"));
  assert.ok(DELEGATE_AGENTS.has("rocinante"));
  assert.equal(DELEGATE_AGENTS.has("sancho"), false);
});

test("slugForThread kebab-cases, strips accents, and bounds length", () => {
  assert.equal(slugForThread("Influencers Itnig & Podcasts"), "influencers-itnig-podcasts");
  assert.equal(slugForThread("  Búsqueda ES  "), "busqueda-es");
  assert.equal(slugForThread(""), "task");
  assert.equal(slugForThread(null), "task");
  assert.ok(slugForThread("x".repeat(100)).length <= 48);
});
