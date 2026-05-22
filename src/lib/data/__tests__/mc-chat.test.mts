import { test } from "node:test";
import assert from "node:assert/strict";
// mc-chat.ts is consumed as CommonJS by Next.js (root package.json has no
// "type": "module"), so under tsx --test the named exports live on the
// `default` namespace. The cast keeps the call site typed without coupling
// the test to tsx internals.
import * as mc from "../mc-chat";
import type { ErrorDetail } from "../mc-chat";
const { isStaleWatchdogAfterRecentSuccess } = (mc as unknown as { default: typeof mc }).default ?? mc;

const NOW = 10_000;
const W = 5_000;

const successBot = (ts: number) => ({ role: "bot", ts });
const errorBot = (ts: number, category: ErrorDetail["category"]) => ({
  role: "bot",
  ts,
  errorDetail: { category, raw: "x", classifiedAt: ts },
});
const userMsg = (ts: number) => ({ role: "user", ts });

test("returns true when last bot message is a recent success (within window)", () => {
  const msgs = [userMsg(0), successBot(NOW - 20)];
  assert.equal(isStaleWatchdogAfterRecentSuccess(msgs, NOW, W), true);
});

test("returns false when last bot message is older than the window", () => {
  const msgs = [userMsg(0), successBot(NOW - 10_000)];
  assert.equal(isStaleWatchdogAfterRecentSuccess(msgs, NOW, W), false);
});

test("returns false when last bot message itself carries an errorDetail", () => {
  const msgs = [userMsg(0), errorBot(NOW - 100, "rate_limit")];
  assert.equal(isStaleWatchdogAfterRecentSuccess(msgs, NOW, W), false);
});

test("walks past trailing user/system/handoff messages to find the last bot", () => {
  const msgs = [successBot(NOW - 200), userMsg(NOW - 50)];
  assert.equal(isStaleWatchdogAfterRecentSuccess(msgs, NOW, W), true);
});

test("returns false on an empty thread", () => {
  assert.equal(isStaleWatchdogAfterRecentSuccess([], NOW, W), false);
});

test("returns false when no bot messages exist at all", () => {
  const msgs = [userMsg(NOW - 10), userMsg(NOW - 5)];
  assert.equal(isStaleWatchdogAfterRecentSuccess(msgs, NOW, W), false);
});

test("treats success exactly at window edge as within window (inclusive)", () => {
  const msgs = [successBot(NOW - W)];
  assert.equal(isStaleWatchdogAfterRecentSuccess(msgs, NOW, W), true);
});

test("real fixture: 20ms gap matches the fellow-funders false positive", () => {
  // Exact pattern observed 2026-05-22 14:35:52 UTC on staging.
  const msgs = [
    successBot(1779460552049),
  ];
  assert.equal(isStaleWatchdogAfterRecentSuccess(msgs, 1779460552069, W), true);
});
