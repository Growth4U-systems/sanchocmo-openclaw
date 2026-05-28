import { test } from "node:test";
import assert from "node:assert/strict";
import * as mod from "../comments-file";

const {
  getCommentedDocPath,
  isCommentedDocPath,
  getOriginalDocPath,
  formatCommentBlock,
  findCommentBlockRange,
  resolveBrandDocAbsPath,
} = (mod as unknown as { default: typeof mod }).default ?? mod;

test("getCommentedDocPath: adds .commented before the extension", () => {
  assert.equal(getCommentedDocPath("current.md"), "current.commented.md");
  assert.equal(
    getCommentedDocPath("foo/bar.html"),
    "foo/bar.commented.html",
  );
  assert.equal(
    getCommentedDocPath("brand/xhype/market-and-us/market/current.md"),
    "brand/xhype/market-and-us/market/current.commented.md",
  );
});

test("getCommentedDocPath: idempotent on already-commented paths", () => {
  assert.equal(
    getCommentedDocPath("current.commented.md"),
    "current.commented.md",
  );
  assert.equal(
    getCommentedDocPath("foo/bar.commented.html"),
    "foo/bar.commented.html",
  );
});

test("getCommentedDocPath: handles paths with no extension", () => {
  assert.equal(getCommentedDocPath("noext"), "noext.commented");
});

test("isCommentedDocPath identifies commented sibling paths", () => {
  assert.equal(isCommentedDocPath("current.commented.md"), true);
  assert.equal(isCommentedDocPath("current.md"), false);
  assert.equal(isCommentedDocPath("foo/bar.commented.html"), true);
  assert.equal(isCommentedDocPath("foo/bar.html"), false);
});

test("getOriginalDocPath: inverts getCommentedDocPath", () => {
  assert.equal(getOriginalDocPath("current.commented.md"), "current.md");
  assert.equal(
    getOriginalDocPath("foo/bar.commented.html"),
    "foo/bar.html",
  );
  // Idempotent on non-commented paths.
  assert.equal(getOriginalDocPath("current.md"), "current.md");
});

test("formatCommentBlock: wraps body in id markers and includes heading", () => {
  const block = formatCommentBlock({
    id: "cmt_abc123",
    author: "Sergi",
    createdAt: "2026-05-28T14:53:09.029Z",
    body: "prueba",
    anchorText: "1. Mercado: Tamaño y Momentum",
  });
  assert.ok(block.includes("<!-- cmt:cmt_abc123 -->"));
  assert.ok(block.includes("<!-- /cmt:cmt_abc123 -->"));
  assert.ok(block.includes("### Sergi · 2026-05-28 14:53"));
  assert.ok(block.includes('> "1. Mercado: Tamaño y Momentum"'));
  assert.ok(block.includes("prueba"));
});

test("formatCommentBlock: omits the quote when no anchorText", () => {
  const block = formatCommentBlock({
    id: "cmt_x",
    author: "Anon",
    createdAt: new Date("2026-05-28T10:00:00Z"),
    body: "doc-level comment",
  });
  // No markdown blockquote line (the HTML comment markers do contain `>`,
  // so we check for the leading `> ` blockquote prefix specifically).
  assert.equal(/^> /m.test(block), false);
  assert.ok(block.includes("doc-level comment"));
});

test("formatCommentBlock: trims trailing whitespace on body", () => {
  const block = formatCommentBlock({
    id: "cmt_x",
    author: "X",
    createdAt: new Date("2026-05-28T10:00:00Z"),
    body: "hello\n\n",
  });
  // The block ends with the close marker + newline; no extra blank
  // lines between body and close marker.
  assert.ok(block.includes("hello\n<!-- /cmt:cmt_x -->"));
});

test("formatCommentBlock: truncates a very long anchor quote", () => {
  const long = "x".repeat(2000);
  const block = formatCommentBlock({
    id: "cmt_x",
    author: "X",
    createdAt: new Date("2026-05-28T10:00:00Z"),
    body: "body",
    anchorText: long,
  });
  // 600 cap + ellipsis = 601 chars inside the quote.
  assert.ok(block.includes("xxx…"));
});

test("findCommentBlockRange: returns -1 when id not present", () => {
  const r = findCommentBlockRange("plain doc with no comments", "cmt_missing");
  assert.equal(r.start, -1);
  assert.equal(r.end, -1);
});

test("findCommentBlockRange: returns the inclusive byte range covering the block", () => {
  const block = formatCommentBlock({
    id: "cmt_target",
    author: "X",
    createdAt: new Date("2026-05-28T10:00:00Z"),
    body: "target body",
  });
  const doc = `original content\n\n---\n\n## Comentarios\n\n${block}`;
  const r = findCommentBlockRange(doc, "cmt_target");
  assert.notEqual(r.start, -1);
  // The slice that the range identifies must contain the start marker
  // and the close marker.
  const sliced = doc.slice(r.start, r.end);
  assert.ok(sliced.includes("<!-- cmt:cmt_target -->"));
  assert.ok(sliced.includes("<!-- /cmt:cmt_target -->"));
});

test("findCommentBlockRange: range swallows trailing newlines so excision is clean", () => {
  const block = formatCommentBlock({
    id: "cmt_target",
    author: "X",
    createdAt: new Date("2026-05-28T10:00:00Z"),
    body: "target",
  });
  const before = "before\n";
  const after = "after\n";
  const doc = before + block + after;
  const r = findCommentBlockRange(doc, "cmt_target");
  const removed = doc.slice(0, r.start) + doc.slice(r.end);
  assert.equal(removed, before + after);
});

test("findCommentBlockRange: ignores nested markers belonging to other ids", () => {
  const a = formatCommentBlock({
    id: "cmt_a",
    author: "A",
    createdAt: new Date("2026-05-28T10:00:00Z"),
    body: "alpha",
  });
  const b = formatCommentBlock({
    id: "cmt_b",
    author: "B",
    createdAt: new Date("2026-05-28T10:01:00Z"),
    body: "beta",
  });
  const doc = a + b;
  const ra = findCommentBlockRange(doc, "cmt_a");
  const rb = findCommentBlockRange(doc, "cmt_b");
  assert.ok(ra.end <= rb.start, "block A must end before block B starts");
  assert.ok(doc.slice(ra.start, ra.end).includes("alpha"));
  assert.ok(doc.slice(rb.start, rb.end).includes("beta"));
});

test("resolveBrandDocAbsPath: blocks path traversal", () => {
  assert.throws(
    () => resolveBrandDocAbsPath("/tmp/workspace", "../../../etc/passwd"),
    /Path traversal blocked/,
  );
});

test("resolveBrandDocAbsPath: allows normal brand paths", () => {
  const out = resolveBrandDocAbsPath(
    "/tmp/workspace",
    "brand/xhype/market-and-us/market/current.md",
  );
  assert.ok(out.endsWith("brand/xhype/market-and-us/market/current.md"));
});
