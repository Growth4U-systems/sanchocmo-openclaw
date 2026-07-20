/**
 * Channel bucket mapping for the "Motor de ventas" matrix (SAN-326) — pure.
 * Raw GHL contact channels collapse onto the six acquisition buckets without
 * inventing data: unknown strings land in "Otros", never in a real channel.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import * as mod from "../channel-buckets";

// .mts→.ts interop: named imports across the boundary fail under tsx, so unwrap
// the namespace's default (mirrors every other test in this repo).
const { CHANNEL_BUCKETS, channelBucketLabel, mapChannelToBucket } =
  (mod as unknown as { default: typeof mod }).default ?? mod;

test("los buckets salen en el orden de columnas con etiquetas en español", () => {
  assert.deepEqual(
    CHANNEL_BUCKETS.map(({ key, label }) => [key, label]),
    [
      ["web", "Web"],
      ["paid", "Paid"],
      ["linkedin", "LinkedIn"],
      ["email", "Email/Outbound"],
      ["trust", "Trust Score"],
      ["otros", "Otros"],
    ],
  );
  assert.equal(channelBucketLabel("email"), "Email/Outbound");
});

test("LinkedIn agrupa cualquier touch de LinkedIn, incluso vía utm", () => {
  for (const raw of ["LinkedIn", "linkedin_dm", "social/linkedin.com", "LinkedIn Outreach"]) {
    assert.equal(mapChannelToBucket(raw), "linkedin", raw);
  }
});

test("Explee y las herramientas de cold email caen en Email/Outbound", () => {
  for (const raw of ["Explee AutoGTM", "explee", "Instantly", "lemlist seq 3", "email/newsletter", "Cold Email"]) {
    assert.equal(mapChannelToBucket(raw), "email", raw);
  }
});

test("Trust Score agrupa los touchpoints del Trust Engine", () => {
  for (const raw of ["trust-bridge", "Trust Score Analyzer", "trust_score_widget"]) {
    assert.equal(mapChannelToBucket(raw), "trust", raw);
  }
});

test("Paid agrupa ads de Meta y Google sin robarle el orgánico a Web", () => {
  for (const raw of ["facebook", "Meta Ads", "google / cpc", "google-ads", "Paid Social"]) {
    assert.equal(mapChannelToBucket(raw), "paid", raw);
  }
  assert.equal(mapChannelToBucket("google / organic"), "web");
});

test("Web agrupa calendarios, formularios de Reunión/demo y orgánico", () => {
  for (const raw of ["calendar booking", "Reunión", "demo form", "website contact form", "organic", "web"]) {
    assert.equal(mapChannelToBucket(raw), "web", raw);
  }
});

test("lo no clasificable cae en Otros sin fabricar un canal", () => {
  for (const raw of ["Unknown", "referral", "podcast", "", "   "]) {
    assert.equal(mapChannelToBucket(raw), "otros", JSON.stringify(raw));
  }
});
