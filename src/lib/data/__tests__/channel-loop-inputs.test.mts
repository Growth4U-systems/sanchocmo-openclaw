import { before, test } from "node:test";
import assert from "node:assert/strict";

type Mod = typeof import("../../content/channel-loop-inputs");
let normalizeCadenceChannels: Mod["normalizeCadenceChannels"];
let toChannelList: Mod["toChannelList"];
let toStringArray: Mod["toStringArray"];

before(async () => {
  const mod = await import("../../content/channel-loop-inputs");
  const api = ("default" in mod ? mod.default : mod) as Mod;
  ({ normalizeCadenceChannels, toChannelList, toStringArray } = api);
});

test("normalizeCadenceChannels accepts map-shaped YAML with legacy scalar fields", () => {
  const channels = normalizeCadenceChannels({
    channels: {
      linkedin: {
        active: "true",
        frequency: "weekly",
        best_days: "monday, wednesday",
        best_times: "09:00\n15:30",
        content_types: "thought-leadership, carousel",
        mode: "always-on",
        label: "Founder Led",
        profiles: {
          alfonso: {
            name: "Alfonso",
            handle: "@alfonso",
            posts_per_week: "3",
            pillars_slant: "ai agents, growth ops",
            metricool_profile_id: "mc-1",
          },
          empty: null,
        },
      },
      broken: null,
    },
  });

  assert.equal(channels.linkedin.active, true);
  assert.deepEqual(channels.linkedin.best_days, ["monday", "wednesday"]);
  assert.deepEqual(channels.linkedin.best_times, ["09:00", "15:30"]);
  assert.deepEqual(channels.linkedin.content_types, ["thought-leadership", "carousel"]);
  assert.equal(channels.linkedin.mode, "always-on");
  assert.equal(channels.linkedin.profiles.length, 1);
  assert.equal(channels.linkedin.profiles[0].id, "alfonso");
  assert.equal(channels.linkedin.profiles[0].posts_per_week, 3);
  assert.deepEqual(channels.linkedin.profiles[0].pillars_slant, ["ai agents", "growth ops"]);
  assert.deepEqual(channels.broken.profiles, []);
});

test("normalizeCadenceChannels accepts array-shaped channel configs", () => {
  const channels = normalizeCadenceChannels({
    channels: [
      { key: "blog", active: true, best_days: ["friday"], metrics_provider: "gsc-pending" },
      { channel: "newsletter", active: false },
      { active: true },
    ],
  });

  assert.deepEqual(Object.keys(channels), ["blog", "newsletter"]);
  assert.equal(channels.blog.metrics_provider, "gsc-pending");
  assert.equal(channels.newsletter.active, false);
});

test("toStringArray and toChannelList tolerate scalar and malformed inputs", () => {
  assert.deepEqual(toStringArray("linkedin, twitter\nblog"), ["linkedin", "twitter", "blog"]);
  assert.deepEqual(toStringArray({ bad: true }), []);
  assert.deepEqual(toChannelList("linkedin", "twitter, blog"), ["linkedin", "twitter", "blog"]);
  assert.deepEqual(toChannelList("", { bad: true }), []);
});
