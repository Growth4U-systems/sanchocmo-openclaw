/**
 * resolveUploadMime — MIME/extension resolution for chat uploads (SAN-117).
 * classifyUploadError — maps an upload failure to an HTTP status (SAN-305/371).
 * Pure functions: no network, no env, no R2 client construction on import.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import * as mod from "../upload-r2";

// upload-r2 is a .ts (CJS) module imported from a .mts (ESM) test; named
// bindings come through the interop `default` wrapper — match the convention
// used by the other tests in this folder (e.g. anchoring.test.mts).
const { resolveUploadMime, classifyUploadError } =
  (mod as unknown as { default: typeof mod }).default ?? mod;

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

test("classifyUploadError: missing R2 config surfaces as 503 with the actionable message", () => {
  const err = new Error("R2 not configured: missing R2_PUBLIC_URL. Set these in ~/.openclaw/.env.local");
  const res = classifyUploadError(err);
  assert.equal(res.status, 503);
  assert.match(res.error, /R2 not configured: missing R2_PUBLIC_URL/);
});

test("classifyUploadError: oversized file (formidable) surfaces as 413", () => {
  const byMessage = classifyUploadError(new Error("options.maxFileSize (20971520 bytes) exceeded"));
  assert.equal(byMessage.status, 413);
  assert.match(byMessage.error, /límite de 20 MB/);

  const byHttpCode = classifyUploadError(Object.assign(new Error("Request Entity Too Large"), { httpCode: 413 }));
  assert.equal(byHttpCode.status, 413);
});

test("classifyUploadError: unknown failure stays a generic 500 (preserves existing behavior)", () => {
  const res = classifyUploadError(new Error("connection reset by peer"));
  assert.equal(res.status, 500);
  assert.equal(res.error, "Failed to upload file");
});
