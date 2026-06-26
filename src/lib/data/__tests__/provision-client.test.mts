import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// paths.ts computes BASE from MC_WORKSPACE at module-load, so set it BEFORE any
// dynamic import of the code under test (which transitively imports paths).
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "provision-client-"));
process.env.MC_WORKSPACE = TMP;

const REPO_ROOT = path.resolve(import.meta.dirname, "../../../..");

before(() => {
  // _system/cron-templates.json drives the onboarding crons seeded per brand.
  fs.mkdirSync(path.join(TMP, "_system"), { recursive: true });
  fs.copyFileSync(
    path.join(REPO_ROOT, "workspace-sancho/_system/cron-templates.json"),
    path.join(TMP, "_system/cron-templates.json"),
  );
  // clients.json (CLIENTS_FILE = BASE/clients.json) — two brands, as the wizard
  // would write: just the entry, no provisioning.
  fs.writeFileSync(
    path.join(TMP, "clients.json"),
    JSON.stringify({
      clients: [
        { slug: "acme", name: "Acme Inc", language: "es" },
        { slug: "beta", name: "Beta Co" },
      ],
    }),
  );
});

after(() => {
  fs.rmSync(TMP, { recursive: true, force: true });
});

test("ensureAllClientsProvisioned backfills a wizard-style (unprovisioned) brand", async () => {
  const { ensureAllClientsProvisioned, isClientProvisioned } = await import("../provision-client.ts");

  assert.equal(isClientProvisioned("acme"), false, "starts unprovisioned");

  const r = ensureAllClientsProvisioned();
  assert.deepEqual(r.provisioned.sort(), ["acme", "beta"], "both brands provisioned");

  const brand = path.join(TMP, "brand", "acme");
  // dir tree
  for (const d of ["chat", "projects", "metrics", "market-and-us/competitors"]) {
    assert.ok(fs.existsSync(path.join(brand, d)), `created brand/acme/${d}`);
  }
  // chat-config seeded
  assert.ok(fs.existsSync(path.join(brand, "chat-config.json")), "chat-config.json seeded");
  // Foundation projects with tasks
  const projects = fs.readdirSync(path.join(brand, "projects"));
  assert.ok(projects.length >= 5, `>=5 foundation projects (got ${projects.length})`);
  const cb = path.join(brand, "projects", "P00-Company-Brief", "tasks.json");
  assert.ok(fs.existsSync(cb), "P00-Company-Brief/tasks.json exists");
  assert.ok(JSON.parse(fs.readFileSync(cb, "utf-8")).length >= 1, "company-brief has tasks");
  // onboarding crons seeded
  const cc = JSON.parse(fs.readFileSync(path.join(brand, "client-config.json"), "utf-8"));
  assert.ok(Object.keys(cc.crons || {}).length >= 1, "auto-onboarding crons seeded");

  assert.equal(isClientProvisioned("acme"), true, "now provisioned");
});

test("is idempotent — a second run provisions nothing and preserves data", async () => {
  const { ensureAllClientsProvisioned } = await import("../provision-client.ts");

  // user edits a seeded file; re-run must not clobber it
  const chatCfg = path.join(TMP, "brand", "acme", "chat-config.json");
  fs.writeFileSync(chatCfg, JSON.stringify({ pillars: { custom: true } }));

  const r = ensureAllClientsProvisioned();
  assert.deepEqual(r.provisioned, [], "nothing re-provisioned");
  assert.equal(r.skipped, 2, "both brands skipped");
  assert.deepEqual(JSON.parse(fs.readFileSync(chatCfg, "utf-8")), { pillars: { custom: true } }, "user edit preserved");
});
