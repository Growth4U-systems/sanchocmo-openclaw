import { test, before } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "mc-publish-target-"));
process.env.MC_WORKSPACE = tmp;

function seedBrand(slug: string, cfg: unknown) {
  const dir = path.join(tmp, "brand", slug);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "client-config.json"), JSON.stringify(cfg, null, 2));
}

type Mod = typeof import("../publish/target");
let mod: Mod;

before(async () => {
  seedBrand("alpha", {
    crons: {
      daily_pulse: { publish_transport: "slack", publish_channel: "C-pulse" },
      no_transport: { publish_channel: "C-default" },
      empty: {},
    },
  });
  seedBrand("beta", {
    publish: { default_transport: "discord" },
    crons: { x: { publish_channel: "C-x" } },
  });
  mod = await import("../publish/target");
});

test("resolves explicit transport + channel", () => {
  const t = mod.resolvePublishTarget("alpha", "daily_pulse");
  assert.deepEqual(t, { transport: "slack", channel: "C-pulse" });
});

test("defaults transport to slack when cron omits it and no brand default", () => {
  const t = mod.resolvePublishTarget("alpha", "no_transport");
  assert.deepEqual(t, { transport: "slack", channel: "C-default" });
});

test("honors brand-level default_transport", () => {
  const t = mod.resolvePublishTarget("beta", "x");
  assert.deepEqual(t, { transport: "discord", channel: "C-x" });
});

test("throws when publish_channel missing", () => {
  assert.throws(() => mod.resolvePublishTarget("alpha", "empty"), /publish_channel/);
});

test("throws when cron key absent", () => {
  assert.throws(() => mod.resolvePublishTarget("alpha", "ghost"), /ghost/);
});
