import { test } from "node:test";
import assert from "node:assert/strict";

const {
  canonicalThreadId,
  isValidTenantSlug,
  parseThreadId,
  sanitizeShortId,
} = await import("../thread-id");

// The storage layer's sanitization, inlined here as the ground truth the util
// must reproduce. If mc-chat.threadFile() ever changes, this battery is the
// canary (both now import the same util, so they cannot drift — this guards
// the contract itself).
const storageSanitize = (shortId: string) =>
  shortId.replace(/:/g, "-").replace(/[^a-zA-Z0-9\-_]/g, "");

test("sanitizeShortId matches the storage-layer sanitization byte-for-byte", () => {
  for (const s of [
    "discovery:new-123",
    "discovery:CAMP_abc",
    "task:p14-t01",
    "content:p-content-semana-24-t05-c02",
    "od-generate:poster maker×ds",
    "skill:my-skill",
    "general",
    "weird/slash:and space!",
  ]) {
    assert.equal(sanitizeShortId(s), storageSanitize(s), `mismatch for "${s}"`);
  }
});

test("canonicalThreadId collapses the inner colon to the on-disk dash form", () => {
  assert.equal(canonicalThreadId("acme:discovery:new-123"), "acme:discovery-new-123");
  assert.equal(canonicalThreadId("acme:task:p14-t01"), "acme:task-p14-t01");
});

test("colon-shaped and dash-shaped ids canonicalize to the SAME id (the dedup invariant)", () => {
  assert.equal(canonicalThreadId("acme:task:p14-t01"), canonicalThreadId("acme:task-p14-t01"));
  assert.equal(canonicalThreadId("acme:discovery:new-1"), canonicalThreadId("acme:discovery-new-1"));
});

test("canonicalThreadId is idempotent and leaves the slug + first colon intact", () => {
  for (const id of ["acme:task-p14-t01", "acme:general", "acme:discovery-new-9", "acme:project-p3"]) {
    assert.equal(canonicalThreadId(id), id, `not idempotent: ${id}`);
    assert.ok(canonicalThreadId(id).startsWith("acme:"));
  }
});

test("ids without a colon are returned unchanged", () => {
  assert.equal(canonicalThreadId("general"), "general");
  assert.equal(canonicalThreadId(""), "");
});

test("tenant and thread parsing rejects traversal and empty storage ids", () => {
  assert.equal(isValidTenantSlug("acme-2"), true);
  assert.equal(isValidTenantSlug("../acme"), false);
  assert.equal(isValidTenantSlug(`a${"b".repeat(120)}`), false);
  assert.equal(parseThreadId("../acme:general"), null);
  assert.equal(parseThreadId("acme:../../"), null);
  assert.equal(parseThreadId("acme:"), null);
  assert.deepEqual(parseThreadId("acme:task:p01"), {
    slug: "acme",
    shortId: "task:p01",
  });
});
