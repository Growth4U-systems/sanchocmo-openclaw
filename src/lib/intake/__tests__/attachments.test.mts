import { test } from "node:test";
import assert from "node:assert/strict";
// attachments.ts is consumed as CommonJS (root package.json has no
// "type": "module"), so under tsx --test the named exports live on the
// `default` namespace — mirror the interop dance used in other tests.
import * as mod from "../attachments";
const { sanitizeAttachments, MAX_ATTACHMENTS } = (
  mod as unknown as { default: typeof mod }
).default ?? mod;

test("valid array returns sanitized items", () => {
  const result = sanitizeAttachments([
    { url: "https://cdn.example.com/file.pdf", filename: "document.pdf", mimeType: "application/pdf", size: 12345 },
    { url: "https://cdn.example.com/img.png", filename: "image.png", mimeType: "image/png" },
  ]);
  assert.equal(result.length, 2);
  assert.equal(result[0].url, "https://cdn.example.com/file.pdf");
  assert.equal(result[0].filename, "document.pdf");
  assert.equal(result[0].mimeType, "application/pdf");
  assert.equal(result[0].size, 12345);
  assert.equal(result[1].url, "https://cdn.example.com/img.png");
  assert.equal(result[1].filename, "image.png");
  assert.equal(result[1].size, undefined);
});

test("non-array returns empty array", () => {
  assert.deepEqual(sanitizeAttachments(null), []);
  assert.deepEqual(sanitizeAttachments(undefined), []);
  assert.deepEqual(sanitizeAttachments("string"), []);
  assert.deepEqual(sanitizeAttachments(42), []);
  assert.deepEqual(sanitizeAttachments({}), []);
});

test("non-https urls are dropped", () => {
  const result = sanitizeAttachments([
    { url: "http://insecure.com/file.pdf", filename: "insecure.pdf" },
    { url: "ftp://files.com/data.csv", filename: "data.csv" },
    { url: "", filename: "empty-url.txt" },
    { url: "https://secure.com/ok.pdf", filename: "ok.pdf" },
  ]);
  assert.equal(result.length, 1);
  assert.equal(result[0].filename, "ok.pdf");
});

test("items missing url or filename are dropped", () => {
  const result = sanitizeAttachments([
    { url: "https://cdn.example.com/file.pdf" }, // no filename
    { filename: "no-url.pdf" }, // no url
    { url: "https://cdn.example.com/valid.pdf", filename: "valid.pdf" },
    null,
    undefined,
    42,
    "string",
  ]);
  assert.equal(result.length, 1);
  assert.equal(result[0].filename, "valid.pdf");
});

test("caps at MAX_ATTACHMENTS", () => {
  const items = Array.from({ length: MAX_ATTACHMENTS + 5 }, (_, i) => ({
    url: `https://cdn.example.com/file-${i}.pdf`,
    filename: `file-${i}.pdf`,
  }));
  const result = sanitizeAttachments(items);
  assert.equal(result.length, MAX_ATTACHMENTS);
});

test("filename too long is dropped", () => {
  const longName = "a".repeat(257);
  const result = sanitizeAttachments([
    { url: "https://cdn.example.com/long.pdf", filename: longName },
    { url: "https://cdn.example.com/ok.pdf", filename: "ok.pdf" },
  ]);
  assert.equal(result.length, 1);
  assert.equal(result[0].filename, "ok.pdf");
});
