import { test } from "node:test";
import assert from "node:assert/strict";
// comments.ts is consumed as CommonJS by Next.js (root package.json has no
// "type": "module"), so under tsx --test the named exports live on the
// `default` namespace — mirror the interop dance used in api-middleware.test.mts.
import * as commentsMod from "../comments";
const {
  CommentValidationError,
  EMAIL_RE,
  MAX_ANCHOR_CONTEXT,
  MAX_ANCHOR_TEXT,
  MAX_AUTHOR,
  MAX_BODY,
  validateCommentInput,
} = (commentsMod as unknown as { default: typeof commentsMod }).default ?? commentsMod;

test("validateCommentInput accepts a full valid input", () => {
  const out = validateCommentInput({
    author: "Philippe",
    email: "philippe@growth4u.io",
    body: "Looks great, ship it.",
    anchorText: "TAM Estimation",
    anchorContext: "...the TAM Estimation section says...",
    anchorDocOffset: 1234,
    docVersion: 2,
  });
  assert.equal(out.author, "Philippe");
  assert.equal(out.email, "philippe@growth4u.io");
  assert.equal(out.body, "Looks great, ship it.");
  assert.equal(out.anchorText, "TAM Estimation");
  assert.equal(out.anchorContext, "...the TAM Estimation section says...");
  assert.equal(out.anchorDocOffset, 1234);
  assert.equal(out.docVersion, 2);
  // slug + docPath are NOT taken from the body — they come from the verified token.
  assert.equal(out.slug, "");
  assert.equal(out.docPath, "");
});

test("validateCommentInput trims author and body", () => {
  const out = validateCommentInput({ author: "  Phil  ", body: "  hello  " });
  assert.equal(out.author, "Phil");
  assert.equal(out.body, "hello");
});

test("validateCommentInput treats missing email as null", () => {
  const out = validateCommentInput({ author: "Phil", body: "hi" });
  assert.equal(out.email, null);
});

test("validateCommentInput treats empty / whitespace email as null", () => {
  const a = validateCommentInput({ author: "Phil", body: "hi", email: "  " });
  assert.equal(a.email, null);
  const b = validateCommentInput({ author: "Phil", body: "hi", email: "" });
  assert.equal(b.email, null);
});

test("validateCommentInput rejects malformed email", () => {
  assert.throws(
    () => validateCommentInput({ author: "Phil", body: "hi", email: "not-an-email" }),
    CommentValidationError,
  );
  assert.throws(
    () => validateCommentInput({ author: "Phil", body: "hi", email: "missing@tld" }),
    CommentValidationError,
  );
});

test("validateCommentInput rejects missing or empty author", () => {
  assert.throws(() => validateCommentInput({ body: "hi" }), CommentValidationError);
  assert.throws(() => validateCommentInput({ author: "", body: "hi" }), CommentValidationError);
  assert.throws(() => validateCommentInput({ author: "  ", body: "hi" }), CommentValidationError);
});

test("validateCommentInput rejects missing or empty body", () => {
  assert.throws(() => validateCommentInput({ author: "Phil" }), CommentValidationError);
  assert.throws(() => validateCommentInput({ author: "Phil", body: "" }), CommentValidationError);
  assert.throws(() => validateCommentInput({ author: "Phil", body: "   " }), CommentValidationError);
});

test("validateCommentInput rejects author over MAX_AUTHOR", () => {
  assert.throws(
    () => validateCommentInput({ author: "x".repeat(MAX_AUTHOR + 1), body: "hi" }),
    CommentValidationError,
  );
});

test("validateCommentInput rejects body over MAX_BODY", () => {
  assert.throws(
    () => validateCommentInput({ author: "Phil", body: "x".repeat(MAX_BODY + 1) }),
    CommentValidationError,
  );
});

test("validateCommentInput truncates oversized anchorText", () => {
  const huge = "x".repeat(MAX_ANCHOR_TEXT + 500);
  const out = validateCommentInput({ author: "Phil", body: "hi", anchorText: huge });
  assert.equal(out.anchorText?.length, MAX_ANCHOR_TEXT);
});

test("validateCommentInput truncates oversized anchorContext", () => {
  const huge = "x".repeat(MAX_ANCHOR_CONTEXT + 500);
  const out = validateCommentInput({ author: "Phil", body: "hi", anchorContext: huge });
  assert.equal(out.anchorContext?.length, MAX_ANCHOR_CONTEXT);
});

test("validateCommentInput normalizes empty anchor fields to null", () => {
  const out = validateCommentInput({
    author: "Phil",
    body: "hi",
    anchorText: "  ",
    anchorContext: "",
  });
  assert.equal(out.anchorText, null);
  assert.equal(out.anchorContext, null);
});

test("validateCommentInput rejects negative or non-numeric anchorDocOffset", () => {
  assert.throws(
    () => validateCommentInput({ author: "Phil", body: "hi", anchorDocOffset: -1 }),
    CommentValidationError,
  );
  assert.throws(
    () => validateCommentInput({ author: "Phil", body: "hi", anchorDocOffset: "abc" }),
    CommentValidationError,
  );
  assert.throws(
    () => validateCommentInput({ author: "Phil", body: "hi", anchorDocOffset: Infinity }),
    CommentValidationError,
  );
});

test("validateCommentInput floors decimal anchorDocOffset", () => {
  const out = validateCommentInput({ author: "Phil", body: "hi", anchorDocOffset: 12.7 });
  assert.equal(out.anchorDocOffset, 12);
});

test("validateCommentInput rejects negative or non-numeric docVersion", () => {
  assert.throws(
    () => validateCommentInput({ author: "Phil", body: "hi", docVersion: -2 }),
    CommentValidationError,
  );
  assert.throws(
    () => validateCommentInput({ author: "Phil", body: "hi", docVersion: NaN }),
    CommentValidationError,
  );
});

test("validateCommentInput rejects non-object input", () => {
  assert.throws(() => validateCommentInput(null), CommentValidationError);
  assert.throws(() => validateCommentInput(undefined), CommentValidationError);
  assert.throws(() => validateCommentInput("string"), CommentValidationError);
  assert.throws(() => validateCommentInput(42), CommentValidationError);
  assert.throws(() => validateCommentInput([]), CommentValidationError);
});

test("EMAIL_RE accepts common formats and rejects junk", () => {
  assert.equal(EMAIL_RE.test("a@b.co"), true);
  assert.equal(EMAIL_RE.test("first.last+tag@sub.example.com"), true);
  assert.equal(EMAIL_RE.test("UPPER@CASE.IO"), true);
  assert.equal(EMAIL_RE.test("no-at-sign"), false);
  assert.equal(EMAIL_RE.test("nope@nope"), false);
  assert.equal(EMAIL_RE.test("@nodomain.co"), false);
});
