import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// client-access reads/writes clients.json under MC_WORKSPACE, resolved at
// import time by paths.ts. Point it at a throwaway workspace BEFORE importing
// the module (via dynamic import below).
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "mc-client-access-"));
process.env.MC_WORKSPACE = tmp;

const CLIENTS_FILE = path.join(tmp, "clients.json");

function seed() {
  fs.writeFileSync(
    CLIENTS_FILE,
    JSON.stringify({
      clients: [
        { slug: "alpha", name: "Alpha", active: true },
        { slug: "beta", name: "Beta", active: true },
        { slug: "gamma", name: "Gamma", active: true },
      ],
      adminToken: "x".repeat(20),
      adminEmails: ["external-admin@acme.com"],
      clientAccess: {},
    })
  );
}

type Mod = typeof import("../client-access");
let mod: Mod;

before(async () => {
  seed();
  mod = await import("../client-access");
});

after(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

test("getSlugsForEmail normalizes case and returns [] when missing", () => {
  seed();
  assert.deepEqual(mod.getSlugsForEmail("nobody@acme.com"), []);
  mod.setClientAccess("Manager@Acme.com", ["alpha"]);
  assert.deepEqual(mod.getSlugsForEmail("manager@acme.com"), ["alpha"]);
});

test("setClientAccess rejects @growth4u.io accounts", () => {
  seed();
  const r = mod.setClientAccess("someone@growth4u.io", ["alpha"]);
  assert.equal(r.ok, false);
  assert.match(r.error || "", /growth4u/);
});

test("setClientAccess rejects external admin emails", () => {
  seed();
  const r = mod.setClientAccess("external-admin@acme.com", ["alpha"]);
  assert.equal(r.ok, false);
  assert.match(r.error || "", /admin/i);
});

test("setClientAccess rejects unknown slugs", () => {
  seed();
  const r = mod.setClientAccess("m@acme.com", ["alpha", "ghost"]);
  assert.equal(r.ok, false);
  assert.match(r.error || "", /ghost/);
});

test("setClientAccess with empty list removes the entry", () => {
  seed();
  mod.setClientAccess("m@acme.com", ["alpha", "beta"]);
  assert.deepEqual(mod.getSlugsForEmail("m@acme.com"), ["alpha", "beta"]);
  const r = mod.setClientAccess("m@acme.com", []);
  assert.equal(r.ok, true);
  assert.equal(r.access["m@acme.com"], undefined);
});

test("add/remove mutate the list and remove drops the key when empty", () => {
  seed();
  mod.addClientAccess("m@acme.com", "alpha");
  mod.addClientAccess("m@acme.com", "beta");
  assert.deepEqual(mod.getSlugsForEmail("m@acme.com").sort(), ["alpha", "beta"]);

  mod.removeClientAccess("m@acme.com", "alpha");
  assert.deepEqual(mod.getSlugsForEmail("m@acme.com"), ["beta"]);

  mod.removeClientAccess("m@acme.com", "beta");
  assert.deepEqual(mod.getSlugsForEmail("m@acme.com"), []);
  assert.equal(mod.loadClientAccess()["m@acme.com"], undefined);
});

test("add rejects a duplicate slug", () => {
  seed();
  mod.addClientAccess("m@acme.com", "alpha");
  const r = mod.addClientAccess("m@acme.com", "alpha");
  assert.equal(r.ok, false);
});
