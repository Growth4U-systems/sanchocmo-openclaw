import { test, before } from "node:test";
import assert from "node:assert/strict";

// Source modules are CJS under this tsx test runner; import dynamically
// (repo convention — see persona-loops.test.mts).
type Mod = typeof import("../voice-routing");
let pickVoiceMetricoolProfileId: Mod["pickVoiceMetricoolProfileId"];

before(async () => {
  ({ pickVoiceMetricoolProfileId } = await import("../voice-routing"));
});

const channels = {
  linkedin: {
    profiles: [
      { id: "alfonso", name: "Alfonso", metricool_profile_id: "li-alfonso" },
      { id: "martin", name: "Martín", metricool_profile_id: "li-martin" },
    ],
  },
  twitter: {
    profiles: [{ id: "alfonso", name: "Alfonso", metricool_profile_id: "x-alfonso" }],
  },
  blog: {},
};

test("SAN-162 · routes a voice to its own metricool_profile_id per (person, network)", () => {
  assert.equal(pickVoiceMetricoolProfileId(channels, "linkedin", "alfonso"), "li-alfonso");
  assert.equal(pickVoiceMetricoolProfileId(channels, "twitter", "alfonso"), "x-alfonso");
  assert.equal(pickVoiceMetricoolProfileId(channels, "linkedin", "martin"), "li-martin");
});

test("SAN-162 · null when author / voice / account is missing (default account)", () => {
  assert.equal(pickVoiceMetricoolProfileId(channels, "linkedin", null), null);
  assert.equal(pickVoiceMetricoolProfileId(channels, "linkedin", undefined), null);
  assert.equal(pickVoiceMetricoolProfileId(channels, "linkedin", "nobody"), null);
  assert.equal(pickVoiceMetricoolProfileId(channels, "blog", "alfonso"), null);
});

test("SAN-162 · matches by name-slug when a profile has no explicit id", () => {
  const ch = { linkedin: { profiles: [{ name: "Mía", metricool_profile_id: "li-mia" }] } };
  assert.equal(pickVoiceMetricoolProfileId(ch, "linkedin", "mia"), "li-mia");
});

test("SAN-162 · a voice without an account returns null (won't publish blindly)", () => {
  const ch = { linkedin: { profiles: [{ id: "noacct", name: "No Acct" }] } };
  assert.equal(pickVoiceMetricoolProfileId(ch, "linkedin", "noacct"), null);
});
