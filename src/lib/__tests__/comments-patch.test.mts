import { test } from "node:test";
import assert from "node:assert/strict";
import * as mod from "../comments";

const { validateCommentPatch, CommentValidationError, MAX_BODY } =
  (mod as unknown as { default: typeof mod }).default ?? mod;

test("validateCommentPatch accepts body-only patch", () => {
  const p = validateCommentPatch({ body: "updated text" });
  assert.equal(p.body, "updated text");
  assert.equal(p.anchorText, undefined);
});

test("validateCommentPatch accepts anchor-only patch", () => {
  const p = validateCommentPatch({ anchorText: "new anchor" });
  assert.equal(p.anchorText, "new anchor");
  assert.equal(p.body, undefined);
});

test("validateCommentPatch trims body whitespace", () => {
  const p = validateCommentPatch({ body: "  hi  " });
  assert.equal(p.body, "hi");
});

test("validateCommentPatch rejects empty patch", () => {
  assert.throws(() => validateCommentPatch({}), CommentValidationError);
});

test("validateCommentPatch rejects empty body when present", () => {
  assert.throws(() => validateCommentPatch({ body: "" }), CommentValidationError);
  assert.throws(() => validateCommentPatch({ body: "  " }), CommentValidationError);
});

test("validateCommentPatch rejects oversized body", () => {
  assert.throws(
    () => validateCommentPatch({ body: "x".repeat(MAX_BODY + 1) }),
    CommentValidationError,
  );
});

test("validateCommentPatch allows setting anchorText to null (clears anchor)", () => {
  const p = validateCommentPatch({ anchorText: null });
  assert.equal(p.anchorText, null);
});

test("validateCommentPatch allows setting anchorDocOffset to null", () => {
  const p = validateCommentPatch({ anchorDocOffset: null });
  assert.equal(p.anchorDocOffset, null);
});

test("validateCommentPatch rejects negative anchorDocOffset", () => {
  assert.throws(
    () => validateCommentPatch({ anchorDocOffset: -5 }),
    CommentValidationError,
  );
});

test("validateCommentPatch rejects non-object input", () => {
  assert.throws(() => validateCommentPatch(null), CommentValidationError);
  assert.throws(() => validateCommentPatch("body"), CommentValidationError);
  assert.throws(() => validateCommentPatch([]), CommentValidationError);
});

test("validateCommentPatch coexists fields (body + anchor in one patch)", () => {
  const p = validateCommentPatch({
    body: "new body",
    anchorText: "new anchor",
    anchorContext: "ctx",
    anchorDocOffset: 42,
  });
  assert.equal(p.body, "new body");
  assert.equal(p.anchorText, "new anchor");
  assert.equal(p.anchorContext, "ctx");
  assert.equal(p.anchorDocOffset, 42);
});

test("validateCommentPatch ignores immutable fields silently (only validates mutables)", () => {
  // author/email/created_at must not be honored. They aren't surfaced on the
  // patch type, so they're simply ignored — but the patch must still be
  // non-empty on the mutable side.
  const p = validateCommentPatch({ body: "hi", author: "spoof", email: "x@y.co" });
  assert.equal(p.body, "hi");
  assert.equal(("author" in p) || ("email" in p), false);
});
