/**
 * resolveUploadMime — MIME/extension resolution for chat uploads (SAN-117).
 * Pure function: no network, no env, no R2 client construction on import.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import * as mod from "../upload-r2";

// upload-r2 is a .ts (CJS) module imported from a .mts (ESM) test; named
// bindings come through the interop `default` wrapper — match the convention
// used by the other tests in this folder (e.g. anchoring.test.mts).
const {
  R2ConfigError,
  assertR2Configured,
  getMissingR2Env,
  hasAllowedUploadSignature,
  resolveUploadMime,
} = (mod as unknown as { default: typeof mod }).default ?? mod;

test("keeps a specific, allowed declared MIME type", () => {
  assert.equal(resolveUploadMime("application/pdf", "doc.pdf"), "application/pdf");
  assert.equal(resolveUploadMime("image/png", "a.png"), "image/png");
});

test("PDF sent as application/octet-stream falls back to extension (the SAN-117 bug)", () => {
  assert.equal(resolveUploadMime("application/octet-stream", "report.pdf"), "application/pdf");
});

test("empty or missing MIME falls back to the extension", () => {
  assert.equal(resolveUploadMime("", "notes.txt"), "text/plain");
  assert.equal(resolveUploadMime(null, "data.csv"), "text/csv");
  assert.equal(
    resolveUploadMime(undefined, "sheet.xlsx"),
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  );
});

test("extension match is case-insensitive", () => {
  assert.equal(resolveUploadMime("application/octet-stream", "SCAN.PDF"), "application/pdf");
});

test("a generic declared MIME with an allowed extension normalizes to that extension", () => {
  assert.equal(resolveUploadMime("application/x-download", "quote.pdf"), "application/pdf");
});

test("rejects disallowed types (returns null)", () => {
  assert.equal(resolveUploadMime("application/zip", "archive.zip"), null);
  assert.equal(resolveUploadMime("application/octet-stream", "malware.exe"), null);
  assert.equal(resolveUploadMime("image/svg+xml", "active.svg"), null);
  assert.equal(resolveUploadMime(null, "noextension"), null);
});

test("validates file signatures instead of trusting browser MIME metadata", () => {
  assert.equal(
    hasAllowedUploadSignature(Buffer.from("%PDF-1.7\n"), "application/pdf"),
    true,
  );
  assert.equal(
    hasAllowedUploadSignature(Buffer.from("MZ executable"), "application/pdf"),
    false,
  );
  assert.equal(
    hasAllowedUploadSignature(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      "image/png",
    ),
    true,
  );
  assert.equal(
    hasAllowedUploadSignature(Buffer.from([0x50, 0x4b, 0x03, 0x04]), "application/vnd.openxmlformats-officedocument.wordprocessingml.document"),
    true,
  );
  assert.equal(
    hasAllowedUploadSignature(Buffer.from([0x50, 0x4b, 0x03, 0x06]), "application/vnd.openxmlformats-officedocument.wordprocessingml.document"),
    false,
  );
  assert.equal(hasAllowedUploadSignature(Buffer.from([0x41, 0x00, 0x42]), "text/plain"), false);
});

test("R2 configuration checks report missing env vars without constructing a client", () => {
  const keys = [
    "CLOUDFLARE_ACCOUNT_ID",
    "R2_UPLOAD_IMAGE_ACCESS_KEY_ID",
    "R2_UPLOAD_IMAGE_SECRET_ACCESS_KEY",
    "R2_UPLOAD_IMAGE_BUCKET_NAME",
    "R2_PUBLIC_URL",
  ] as const;
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));

  try {
    for (const key of keys) delete process.env[key];
    assert.deepEqual(getMissingR2Env({ hydrate: false }), [...keys]);
    assert.throws(
      () => assertR2Configured({ hydrate: false }),
      (err) =>
        err instanceof R2ConfigError &&
        err.missing.join(",") === keys.join(",") &&
        err.message.startsWith("Storage unavailable: missing "),
    );
  } finally {
    for (const key of keys) {
      const value = previous[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
