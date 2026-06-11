import { test } from "node:test";
import assert from "node:assert/strict";
import * as mod from "../comments-file";

const {
  commentedDocPathFamily,
  getCommentedDocPath,
  isCommentedDocPath,
  getOriginalDocPath,
  formatCommentBlock,
  findCommentBlockRange,
  resolveBrandDocAbsPath,
  commentedFileHasAnyComment,
  deleteCommentedFileIfEmpty,
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

// commentedFileHasAnyComment / deleteCommentedFileIfEmpty round-trip via
// temp file. These touch the FS so they live separately from the pure-fn
// tests above.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

function setupTempBrand(slug: string, filename: string, content: string) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "san15-"));
  const docDir = path.join(base, "brand", slug);
  fs.mkdirSync(docDir, { recursive: true });
  const docPath = `brand/${slug}/${filename}`;
  fs.writeFileSync(path.join(base, docPath), content);
  return { base, docPath };
}

test("commentedFileHasAnyComment: true when at least one marker present", () => {
  const block = formatCommentBlock({
    id: "cmt_alive",
    author: "X",
    createdAt: new Date("2026-05-28T10:00:00Z"),
    body: "still here",
  });
  const { base, docPath } = setupTempBrand(
    "ttest",
    "current.commented.md",
    `body\n\n---\n\n## Comentarios\n\n${block}`,
  );
  assert.equal(commentedFileHasAnyComment(base, docPath), true);
  fs.rmSync(base, { recursive: true });
});

test("commentedFileHasAnyComment: false when no markers in file", () => {
  const { base, docPath } = setupTempBrand(
    "ttest",
    "current.commented.md",
    "just body, no comments\n",
  );
  assert.equal(commentedFileHasAnyComment(base, docPath), false);
  fs.rmSync(base, { recursive: true });
});

test("commentedFileHasAnyComment: false when file does not exist", () => {
  const { base } = setupTempBrand("ttest", "other.md", "x");
  assert.equal(
    commentedFileHasAnyComment(base, "brand/ttest/missing.commented.md"),
    false,
  );
  fs.rmSync(base, { recursive: true });
});

test("deleteCommentedFileIfEmpty: unlinks the file when no markers remain", () => {
  const { base, docPath } = setupTempBrand(
    "ttest",
    "current.commented.md",
    "original body, no markers\n",
  );
  const removed = deleteCommentedFileIfEmpty(base, docPath);
  assert.equal(removed, true);
  assert.equal(fs.existsSync(path.join(base, docPath)), false);
  fs.rmSync(base, { recursive: true });
});

test("deleteCommentedFileIfEmpty: leaves the file alone when markers remain", () => {
  const block = formatCommentBlock({
    id: "cmt_x",
    author: "X",
    createdAt: new Date("2026-05-28T10:00:00Z"),
    body: "still here",
  });
  const { base, docPath } = setupTempBrand(
    "ttest",
    "current.commented.md",
    `body\n\n---\n\n## Comentarios\n\n${block}`,
  );
  const removed = deleteCommentedFileIfEmpty(base, docPath);
  assert.equal(removed, false);
  assert.equal(fs.existsSync(path.join(base, docPath)), true);
  fs.rmSync(base, { recursive: true });
});

test("deleteCommentedFileIfEmpty: no-op when file missing", () => {
  const { base } = setupTempBrand("ttest", "other.md", "x");
  const removed = deleteCommentedFileIfEmpty(
    base,
    "brand/ttest/missing.commented.md",
  );
  assert.equal(removed, false);
  fs.rmSync(base, { recursive: true });
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

// ── v2 (SAN-148): reply blocks, resolved mark, tolerant marker matching ──

test("formatCommentBlock: reply block carries parent attr and citation line", () => {
  const block = formatCommentBlock({
    id: "cmt_r1",
    author: "Sancho",
    createdAt: "2026-06-11T10:00:00.000Z",
    body: "Aplicado: actualicé la cifra.",
    parentId: "cmt_root1",
    parentAuthor: "Philippe",
  });
  assert.ok(block.startsWith("<!-- cmt:cmt_r1 parent:cmt_root1 -->"));
  assert.ok(block.includes("> ↳ en respuesta a Philippe (cmt_root1)"));
  assert.ok(block.includes("<!-- /cmt:cmt_r1 -->"));
  // replies never quote an anchor and never get the resolved mark
  assert.ok(!block.includes("RESUELTO"));
});

test("formatCommentBlock: resolved root gets RESUELTO mark", () => {
  const block = formatCommentBlock({
    id: "cmt_x",
    author: "Philippe",
    createdAt: "2026-06-11T10:00:00.000Z",
    body: "ok",
    anchorText: "tres fases",
    resolved: true,
  });
  assert.ok(block.includes("· RESUELTO"));
  assert.ok(block.includes('> "tres fases"'));
});

test("findCommentBlockRange matches both v1 and v2 reply markers", () => {
  const v1 = formatCommentBlock({
    id: "cmt_a",
    author: "A",
    createdAt: "2026-06-11T10:00:00.000Z",
    body: "v1 style",
  });
  const v2 = formatCommentBlock({
    id: "cmt_b",
    author: "B",
    createdAt: "2026-06-11T10:00:00.000Z",
    body: "v2 reply",
    parentId: "cmt_a",
  });
  const content = "# Doc\n\n---\n\n## Comentarios\n\n" + v1 + v2;
  const ra = findCommentBlockRange(content, "cmt_a");
  const rb = findCommentBlockRange(content, "cmt_b");
  assert.ok(ra.start >= 0 && ra.end > ra.start);
  assert.ok(rb.start >= 0 && rb.end > rb.start);
  // excising cmt_a must not touch cmt_b's block
  const excised = content.slice(0, ra.start) + content.slice(ra.end);
  assert.ok(!excised.includes("cmt:cmt_a "));
  assert.ok(excised.includes("cmt:cmt_b parent:cmt_a"));
});

test("findCommentBlockRange does not match an id-prefix collision", () => {
  const block = formatCommentBlock({
    id: "cmt_ab2",
    author: "A",
    createdAt: "2026-06-11T10:00:00.000Z",
    body: "x",
  });
  const r = findCommentBlockRange("intro\n" + block, "cmt_ab");
  assert.equal(r.start, -1);
});

// ── SAN-149: commented docPath family (md/html canonical pair) ──────────

test("commentedDocPathFamily covers both md and html commented siblings", () => {
  assert.deepEqual(
    commentedDocPathFamily("brand/x/market/market.current.md"),
    ["brand/x/market/market.current.commented.md", "brand/x/market/market.current.commented.html"],
  );
  assert.deepEqual(
    commentedDocPathFamily("brand/x/market/market.current.html"),
    ["brand/x/market/market.current.commented.html", "brand/x/market/market.current.commented.md"],
  );
  // accepts a commented member and normalizes through the original
  assert.deepEqual(
    commentedDocPathFamily("brand/x/market/market.current.commented.md"),
    ["brand/x/market/market.current.commented.md", "brand/x/market/market.current.commented.html"],
  );
});
