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
const { resolveUploadMime } = (mod as unknown as { default: typeof mod }).default ?? mod;

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
  assert.equal(resolveUploadMime(null, "noextension"), null);
});
