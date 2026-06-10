import { test, before } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "mc-cron-pub-cfg-"));
process.env.MC_WORKSPACE = tmp;

function brandFile(slug: string) {
  return path.join(tmp, "brand", slug, "client-config.json");
}
function seed(slug: string, cfg: unknown) {
  fs.mkdirSync(path.dirname(brandFile(slug)), { recursive: true });
  fs.writeFileSync(brandFile(slug), JSON.stringify(cfg, null, 2));
}

type Mod = typeof import("../publish/cron-publish-config");
let mod: Mod;

before(async () => {
  seed("alpha", {
    name: "Alpha",
    crons: {
      daily_pulse: { enabled: true, schedule: "0 9 * * *", publish_transport: "slack", publish_channel: "C-pulse", publish_channel_name: "pulse" },
      empty: { enabled: true },
    },
  });
  mod = await import("../publish/cron-publish-config");
});

test("getCronPublishConfig returns the stored destination", () => {
  const c = mod.getCronPublishConfig("alpha", "daily_pulse");
  assert.deepEqual(c, { transport: "slack", channel_id: "C-pulse", channel_name: "pulse" });
});

test("getCronPublishConfig returns null when no channel set", () => {
  assert.equal(mod.getCronPublishConfig("alpha", "empty"), null);
});

test("setCronPublishConfig writes channel and preserves other cron fields", () => {
  mod.setCronPublishConfig("alpha", "empty", { transport: "slack", channel_id: "C-new", channel_name: "new" });
  const raw = JSON.parse(fs.readFileSync(brandFile("alpha"), "utf-8"));
  // preserved
  assert.equal(raw.crons.empty.enabled, true);
  // written
  assert.equal(raw.crons.empty.publish_transport, "slack");
  assert.equal(raw.crons.empty.publish_channel, "C-new");
  assert.equal(raw.crons.empty.publish_channel_name, "new");
  // and reads back
  assert.deepEqual(mod.getCronPublishConfig("alpha", "empty"), { transport: "slack", channel_id: "C-new", channel_name: "new" });
});

test("setCronPublishConfig creates crons object and entry when absent", () => {
  seed("beta", { name: "Beta" });
  mod.setCronPublishConfig("beta", "weekly_synthesis", { transport: "slack", channel_id: "C-w", channel_name: "weekly" });
  const raw = JSON.parse(fs.readFileSync(brandFile("beta"), "utf-8"));
  assert.equal(raw.crons.weekly_synthesis.publish_channel, "C-w");
  assert.equal(raw.name, "Beta"); // untouched
});
