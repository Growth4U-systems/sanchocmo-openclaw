/**
 * Comments v2 (SAN-148): threads, resolve/reopen, TextQuoteSelector
 * affixes and honeypot — validation-layer tests (no DB).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import * as commentsMod from "../comments";
const {
  CommentValidationError,
  MAX_ANCHOR_AFFIX,
  isHoneypotTripped,
  validateCommentInput,
  validateCommentPatch,
} = (commentsMod as unknown as { default: typeof commentsMod }).default ?? commentsMod;

// ── parentId / replies ──────────────────────────────────────────────────

test("validateCommentInput accepts a reply without anchor", () => {
  const out = validateCommentInput({
    author: "Cliente",
    body: "De acuerdo con este punto",
    parentId: "cmt_5a4c2b1d-0000-0000-0000-000000000000",
  });
  assert.equal(out.parentId, "cmt_5a4c2b1d-0000-0000-0000-000000000000");
  assert.equal(out.anchorText, null);
});

test("validateCommentInput rejects a reply WITH anchor fields", () => {
  assert.throws(
    () =>
      validateCommentInput({
        author: "Cliente",
        body: "reply",
        parentId: "cmt_abc",
        anchorText: "quoted",
      }),
    CommentValidationError,
  );
  assert.throws(
    () =>
      validateCommentInput({
        author: "Cliente",
        body: "reply",
        parentId: "cmt_abc",
        anchorDocOffset: 12,
      }),
    CommentValidationError,
  );
});

test("validateCommentInput rejects malformed parentId", () => {
  assert.throws(
    () => validateCommentInput({ author: "A", body: "b", parentId: "not-a-cmt-id" }),
    CommentValidationError,
  );
  assert.throws(
    () => validateCommentInput({ author: "A", body: "b", parentId: "cmt_abc; DROP TABLE" }),
    CommentValidationError,
  );
});

// ── TextQuoteSelector affixes ───────────────────────────────────────────

test("validateCommentInput passes through anchorPrefix/anchorSuffix and truncates at the cap", () => {
  const long = "x".repeat(MAX_ANCHOR_AFFIX + 50);
  const out = validateCommentInput({
    author: "A",
    body: "b",
    anchorText: "exact words",
    anchorPrefix: long,
    anchorSuffix: "after ",
  });
  assert.equal(out.anchorPrefix?.length, MAX_ANCHOR_AFFIX);
  assert.equal(out.anchorSuffix, "after");
});

// ── resolve/reopen patch ────────────────────────────────────────────────

test("validateCommentPatch accepts resolved=true and stamps resolvedAt", () => {
  const patch = validateCommentPatch({ resolved: true, resolvedBy: "Sancho" });
  assert.equal(patch.resolved, true);
  assert.ok(patch.resolvedAt instanceof Date);
  assert.equal(patch.resolvedBy, "Sancho");
});

test("validateCommentPatch resolved=false clears resolvedAt/resolvedBy", () => {
  const patch = validateCommentPatch({ resolved: false, resolvedBy: "Sancho" });
  assert.equal(patch.resolved, false);
  assert.equal(patch.resolvedAt, null);
  assert.equal(patch.resolvedBy, null);
});

test("validateCommentPatch rejects non-boolean resolved and orphan resolvedBy", () => {
  assert.throws(() => validateCommentPatch({ resolved: "yes" }), CommentValidationError);
  assert.throws(() => validateCommentPatch({ resolvedBy: "Sancho" }), CommentValidationError);
});

// ── honeypot ────────────────────────────────────────────────────────────

test("isHoneypotTripped detects filled website field", () => {
  assert.equal(isHoneypotTripped({ author: "Bot", body: "spam", website: "http://spam.io" }), true);
  assert.equal(isHoneypotTripped({ author: "Human", body: "hola", website: "" }), false);
  assert.equal(isHoneypotTripped({ author: "Human", body: "hola" }), false);
  assert.equal(isHoneypotTripped(null), false);
});
