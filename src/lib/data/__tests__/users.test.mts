import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// users.ts orchestrates adminEmails + clientAccess in clients.json, resolved
// under MC_WORKSPACE at import time. Point it at a throwaway workspace first.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "mc-users-"));
process.env.MC_WORKSPACE = tmp;
process.env.ADMIN_EMAIL_DOMAIN = "growth4u.io";
const CLIENTS_FILE = path.join(tmp, "clients.json");

function seed() {
  fs.writeFileSync(
    CLIENTS_FILE,
    JSON.stringify({
      clients: [
        { slug: "alpha", name: "Alpha", active: true },
        { slug: "beta", name: "Beta", active: true },
      ],
      adminToken: "x".repeat(20),
      adminEmails: [],
      clientAccess: {},
    })
  );
}

type Mod = typeof import("../users");
let mod: Mod;

before(async () => {
  seed();
  mod = await import("../users");
});

after(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

test("setUserAccess admin adds to admins and lists the user", () => {
  seed();
  const r = mod.setUserAccess("a@acme.com", "admin");
  assert.equal(r.ok, true);
  const u = mod.loadUsers().find((x) => x.email === "a@acme.com");
  assert.deepEqual(u, { email: "a@acme.com", role: "admin", slugs: [] });
});

test("setUserAccess client stores scoped slugs", () => {
  seed();
  const r = mod.setUserAccess("c@acme.com", "client", ["alpha"]);
  assert.equal(r.ok, true);
  const u = mod.loadUsers().find((x) => x.email === "c@acme.com");
  assert.deepEqual(u, { email: "c@acme.com", role: "client", slugs: ["alpha"] });
});

test("promoting a scoped user to admin drops their clientAccess (mutual exclusivity)", () => {
  seed();
  mod.setUserAccess("m@acme.com", "client", ["alpha", "beta"]);
  mod.setUserAccess("m@acme.com", "admin");
  const users = mod.loadUsers().filter((x) => x.email === "m@acme.com");
  assert.equal(users.length, 1);
  assert.equal(users[0].role, "admin");
  assert.deepEqual(users[0].slugs, []);
});

test("demoting an admin to client drops them from admins", () => {
  seed();
  mod.setUserAccess("d@acme.com", "admin");
  mod.setUserAccess("d@acme.com", "client", ["beta"]);
  const users = mod.loadUsers().filter((x) => x.email === "d@acme.com");
  assert.equal(users.length, 1);
  assert.equal(users[0].role, "client");
  assert.deepEqual(users[0].slugs, ["beta"]);
});

test("setUserAccess rejects @growth4u.io accounts", () => {
  seed();
  const r = mod.setUserAccess("someone@growth4u.io", "admin");
  assert.equal(r.ok, false);
});

test("removeUser revokes both admin and scoped access", () => {
  seed();
  mod.setUserAccess("x@acme.com", "client", ["alpha"]);
  mod.removeUser("x@acme.com");
  assert.equal(mod.loadUsers().some((u) => u.email === "x@acme.com"), false);
});

test("client role with empty slugs removes the user", () => {
  seed();
  mod.setUserAccess("e@acme.com", "client", ["alpha"]);
  mod.setUserAccess("e@acme.com", "client", []);
  assert.equal(mod.loadUsers().some((u) => u.email === "e@acme.com"), false);
});
