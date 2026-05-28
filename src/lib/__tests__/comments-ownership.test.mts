import { test } from "node:test";
import assert from "node:assert/strict";
import * as mod from "../comments-ownership";

const {
  markCommentAsMine,
  unmarkCommentAsMine,
  isMyComment,
  getMyCommentIds,
  clearMyComments,
} = (mod as unknown as { default: typeof mod }).default ?? mod;

type StorageLike = {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
  removeItem(k: string): void;
};

function makeStorage(): StorageLike {
  const data = new Map<string, string>();
  return {
    getItem: (k) => (data.has(k) ? (data.get(k) as string) : null),
    setItem: (k, v) => {
      data.set(k, v);
    },
    removeItem: (k) => {
      data.delete(k);
    },
  };
}

test("isMyComment false on empty storage", () => {
  const s = makeStorage();
  assert.equal(isMyComment("cmt_abc", s), false);
});

test("markCommentAsMine + isMyComment roundtrip", () => {
  const s = makeStorage();
  markCommentAsMine("cmt_abc", s);
  assert.equal(isMyComment("cmt_abc", s), true);
  assert.equal(isMyComment("cmt_xyz", s), false);
});

test("markCommentAsMine is idempotent (no duplicates)", () => {
  const s = makeStorage();
  markCommentAsMine("cmt_abc", s);
  markCommentAsMine("cmt_abc", s);
  markCommentAsMine("cmt_abc", s);
  assert.deepEqual(getMyCommentIds(s), ["cmt_abc"]);
});

test("getMyCommentIds returns all marked ids", () => {
  const s = makeStorage();
  markCommentAsMine("a", s);
  markCommentAsMine("b", s);
  markCommentAsMine("c", s);
  assert.deepEqual(getMyCommentIds(s).sort(), ["a", "b", "c"]);
});

test("unmarkCommentAsMine removes the id", () => {
  const s = makeStorage();
  markCommentAsMine("a", s);
  markCommentAsMine("b", s);
  unmarkCommentAsMine("a", s);
  assert.equal(isMyComment("a", s), false);
  assert.equal(isMyComment("b", s), true);
});

test("unmarkCommentAsMine on unknown id is a no-op", () => {
  const s = makeStorage();
  markCommentAsMine("a", s);
  unmarkCommentAsMine("nonexistent", s);
  assert.equal(isMyComment("a", s), true);
});

test("clearMyComments wipes everything", () => {
  const s = makeStorage();
  markCommentAsMine("a", s);
  markCommentAsMine("b", s);
  clearMyComments(s);
  assert.deepEqual(getMyCommentIds(s), []);
});

test("empty id is rejected silently", () => {
  const s = makeStorage();
  markCommentAsMine("", s);
  unmarkCommentAsMine("", s);
  assert.deepEqual(getMyCommentIds(s), []);
  assert.equal(isMyComment("", s), false);
});

test("survives corrupt storage value", () => {
  const s = makeStorage();
  s.setItem("sancho:my-comments", "not-json");
  assert.deepEqual(getMyCommentIds(s), []);
  // Should be able to recover by writing fresh data
  markCommentAsMine("a", s);
  assert.equal(isMyComment("a", s), true);
});

test("survives non-array stored value", () => {
  const s = makeStorage();
  s.setItem("sancho:my-comments", JSON.stringify({ foo: "bar" }));
  assert.deepEqual(getMyCommentIds(s), []);
});

test("filters out non-string entries", () => {
  const s = makeStorage();
  s.setItem("sancho:my-comments", JSON.stringify(["a", 1, null, "b", { x: 1 }]));
  assert.deepEqual(getMyCommentIds(s).sort(), ["a", "b"]);
});

test("no-op when storage is unavailable (no window, no injected)", () => {
  // Without storage argument and no window in Node, all calls are no-ops.
  // Confirm they don't throw.
  assert.doesNotThrow(() => markCommentAsMine("a"));
  assert.doesNotThrow(() => unmarkCommentAsMine("a"));
  assert.equal(isMyComment("a"), false);
  assert.deepEqual(getMyCommentIds(), []);
});
