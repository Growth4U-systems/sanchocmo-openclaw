import { test } from "node:test";
import assert from "node:assert/strict";
// format-elapsed.ts is consumed as CommonJS by Next.js (root package.json has
// no "type": "module"), so under tsx --test the named exports live on the
// `default` namespace. Matches the mc-chat.test.mts pattern.
import * as mod from "../format-elapsed";
const { formatElapsed, formatRelative } =
  (mod as unknown as { default: typeof mod }).default ?? mod;

test("formatElapsed: under a minute → seconds", () => {
  assert.equal(formatElapsed(0), "0s");
  assert.equal(formatElapsed(999), "0s");
  assert.equal(formatElapsed(1000), "1s");
  assert.equal(formatElapsed(45_500), "45s");
  assert.equal(formatElapsed(59_999), "59s");
});

test("formatElapsed: under an hour → Nm Ms (no leading zero on minutes)", () => {
  assert.equal(formatElapsed(60_000), "1m 0s");
  assert.equal(formatElapsed(83_000), "1m 23s");
  assert.equal(formatElapsed(150_000), "2m 30s");
  assert.equal(formatElapsed(3_599_000), "59m 59s");
});

test("formatElapsed: an hour or more → Nh MMm", () => {
  assert.equal(formatElapsed(3_600_000), "1h 00m");
  assert.equal(formatElapsed(3_660_000), "1h 01m");
  assert.equal(formatElapsed(7_320_000), "2h 02m");
});

test("formatElapsed: defends against negative input by clamping to 0", () => {
  assert.equal(formatElapsed(-100), "0s");
});

test("formatRelative: under 5 seconds → 'recién'", () => {
  assert.equal(formatRelative(0), "recién");
  assert.equal(formatRelative(4_999), "recién");
});

test("formatRelative: 5-59 seconds → 'hace Ns'", () => {
  assert.equal(formatRelative(5_000), "hace 5s");
  assert.equal(formatRelative(45_000), "hace 45s");
});

test("formatRelative: minute-grade → 'hace Nm Ms'", () => {
  assert.equal(formatRelative(60_000), "hace 1m 0s");
  assert.equal(formatRelative(140_000), "hace 2m 20s");
});

test("formatRelative: hour-grade → 'hace Nh MMm'", () => {
  assert.equal(formatRelative(3_600_000), "hace 1h 00m");
  assert.equal(formatRelative(7_320_000), "hace 2h 02m");
});

test("formatRelative: negative deltas (future ts) → 'recién'", () => {
  assert.equal(formatRelative(-100), "recién");
});
