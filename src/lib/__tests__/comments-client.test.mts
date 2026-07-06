import { test } from "node:test";
import assert from "node:assert/strict";
import * as mod from "../comments-client";

const {
  ANCHOR_CONTEXT_PADDING,
  buildAnchorPayload,
  validateCommentForm,
  formatCommentDate,
  deriveDocTitle,
  stripCommentMarkers,
  EMAIL_RE,
} = (mod as unknown as { default: typeof mod }).default ?? mod;

test("buildAnchorPayload returns null for empty selection", () => {
  assert.equal(buildAnchorPayload("doc", ""), null);
  assert.equal(buildAnchorPayload("doc", "   "), null);
});

test("buildAnchorPayload finds offset and grabs padded context", () => {
  const full = "Before the selection target. The selection lives HERE in the middle. After the selection.";
  const sel = "HERE";
  const out = buildAnchorPayload(full, sel, 10);
  assert.ok(out);
  assert.equal(out!.anchorText, "HERE");
  assert.equal(out!.anchorDocOffset, full.indexOf("HERE"));
  assert.ok(out!.anchorContext.includes("HERE"));
  // 10 chars of padding either side
  assert.ok(out!.anchorContext.length <= "HERE".length + 20);
});

test("buildAnchorPayload uses default padding when not specified", () => {
  const full = "x".repeat(500) + "MATCH" + "y".repeat(500);
  const out = buildAnchorPayload(full, "MATCH");
  assert.ok(out);
  // selection (5) + 80 before + 80 after
  assert.equal(out!.anchorContext.length, 5 + ANCHOR_CONTEXT_PADDING * 2);
  assert.equal(out!.anchorDocOffset, 500);
});

test("buildAnchorPayload falls back to selection-only when text not in doc", () => {
  const out = buildAnchorPayload("nothing matches", "ghost text");
  assert.ok(out);
  assert.equal(out!.anchorText, "ghost text");
  assert.equal(out!.anchorContext, "ghost text");
  assert.equal(out!.anchorDocOffset, null);
});

test("buildAnchorPayload trims the selection text", () => {
  const full = "this is the selection lives here";
  const out = buildAnchorPayload(full, "  selection  ");
  assert.ok(out);
  assert.equal(out!.anchorText, "selection");
});

test("buildAnchorPayload handles selection at start of doc", () => {
  const out = buildAnchorPayload("hello world", "hello", 50);
  assert.ok(out);
  assert.equal(out!.anchorDocOffset, 0);
  // Cannot go before index 0
  assert.equal(out!.anchorContext.startsWith("hello"), true);
});

test("buildAnchorPayload handles selection at end of doc", () => {
  const out = buildAnchorPayload("foo bar baz", "baz", 50);
  assert.ok(out);
  assert.equal(out!.anchorDocOffset, "foo bar ".length);
  assert.equal(out!.anchorContext.endsWith("baz"), true);
});

test("validateCommentForm accepts valid form", () => {
  const v = validateCommentForm({
    author: "Phil",
    email: "phil@example.com",
    body: "Looks good",
    anchor: null,
  });
  assert.equal(v.ok, true);
  assert.deepEqual(v.errors, {});
});

test("validateCommentForm allows empty email", () => {
  const v = validateCommentForm({ author: "Phil", email: "", body: "hi", anchor: null });
  assert.equal(v.ok, true);
});

test("validateCommentForm rejects empty author", () => {
  const v = validateCommentForm({ author: "  ", email: "", body: "hi", anchor: null });
  assert.equal(v.ok, false);
  assert.ok(v.errors.author);
});

test("validateCommentForm rejects empty body", () => {
  const v = validateCommentForm({ author: "Phil", email: "", body: "", anchor: null });
  assert.equal(v.ok, false);
  assert.ok(v.errors.body);
});

test("validateCommentForm rejects malformed email", () => {
  const v = validateCommentForm({
    author: "Phil",
    email: "not-an-email",
    body: "hi",
    anchor: null,
  });
  assert.equal(v.ok, false);
  assert.ok(v.errors.email);
});

test("validateCommentForm rejects oversized body", () => {
  const v = validateCommentForm({
    author: "Phil",
    email: "",
    body: "x".repeat(5001),
    anchor: null,
  });
  assert.equal(v.ok, false);
  assert.ok(v.errors.body);
});

test("validateCommentForm rejects oversized author", () => {
  const v = validateCommentForm({
    author: "x".repeat(121),
    email: "",
    body: "hi",
    anchor: null,
  });
  assert.equal(v.ok, false);
  assert.ok(v.errors.author);
});

test("EMAIL_RE matches the server-side regex", () => {
  assert.equal(EMAIL_RE.test("a@b.co"), true);
  assert.equal(EMAIL_RE.test("invalid"), false);
});

test("formatCommentDate returns 'hace un momento' for very recent", () => {
  const iso = new Date(Date.now() - 30 * 1000).toISOString();
  assert.equal(formatCommentDate(iso), "hace un momento");
});

test("formatCommentDate returns minutes for recent", () => {
  const iso = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  assert.equal(formatCommentDate(iso), "hace 5 min");
});

test("formatCommentDate returns hours for several hours ago", () => {
  const iso = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
  assert.equal(formatCommentDate(iso), "hace 3 h");
});

test("formatCommentDate returns days for under a week", () => {
  const iso = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
  assert.equal(formatCommentDate(iso), "hace 2 d");
});

test("formatCommentDate falls back to date for older", () => {
  const iso = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const out = formatCommentDate(iso);
  assert.ok(/\d/.test(out), `expected date-like fallback, got ${out}`);
  assert.notEqual(out, iso);
});

test("formatCommentDate returns input for non-date string", () => {
  assert.equal(formatCommentDate("not a date"), "not a date");
});

test("stripCommentMarkers: removes start + end cmt markers", () => {
  const md = "foo\n<!-- cmt:cmt_abc -->\nbody\n<!-- /cmt:cmt_abc -->\nbar";
  const out = stripCommentMarkers(md);
  assert.equal(out.includes("<!-- cmt:"), false);
  assert.equal(out.includes("body"), true);
  assert.equal(out.includes("foo"), true);
  assert.equal(out.includes("bar"), true);
});

test("stripCommentMarkers: tolerates whitespace inside the marker", () => {
  const md = "<!--  cmt:cmt_x  -->\nbody\n<!-- /cmt:cmt_x -->";
  const out = stripCommentMarkers(md);
  assert.equal(out.includes("cmt:"), false);
});

test("stripCommentMarkers: leaves unrelated HTML comments intact", () => {
  const md = "<!-- TODO finish this -->\ntext";
  const out = stripCommentMarkers(md);
  assert.equal(out.includes("<!-- TODO finish this -->"), true);
});

test("stripCommentMarkers: handles multiple markers in a single string", () => {
  const md = "<!-- cmt:a -->A<!-- /cmt:a --><!-- cmt:b -->B<!-- /cmt:b -->";
  const out = stripCommentMarkers(md);
  assert.equal(out, "AB");
});

test("deriveDocTitle: uses originalDocPath when provided (strips .commented)", () => {
  assert.equal(
    deriveDocTitle("current.commented.md", "brand/x/y/current.md"),
    "Current",
  );
});

test("deriveDocTitle: strips .commented from filename when no originalDocPath", () => {
  assert.equal(deriveDocTitle("current.commented.md", undefined), "Current");
});

test("deriveDocTitle: plain markdown filename", () => {
  assert.equal(deriveDocTitle("foundation-report.md", undefined), "Foundation Report");
});

test("deriveDocTitle: title-cases each word + replaces hyphens/underscores", () => {
  assert.equal(deriveDocTitle("market-and-us_overview.md", undefined), "Market And Us Overview");
});

test("deriveDocTitle: HTML/txt extensions also stripped", () => {
  assert.equal(deriveDocTitle("foo.commented.html", undefined), "Foo");
  assert.equal(deriveDocTitle("notes.txt", undefined), "Notes");
});

test("deriveDocTitle: falls back to 'Documento' when both inputs are empty", () => {
  assert.equal(deriveDocTitle(undefined, undefined), "Documento");
  assert.equal(deriveDocTitle("", ""), "Documento");
});

test("stripCommentMarkers also strips v2 reply markers with parent attr", () => {
  const input = "texto\n<!-- cmt:cmt_a parent:cmt_root -->\nbloque\n<!-- /cmt:cmt_a -->\nfin";
  const out = stripCommentMarkers(input);
  assert.ok(!out.includes("cmt:"));
  assert.ok(out.includes("texto"));
  assert.ok(out.includes("fin"));
});
