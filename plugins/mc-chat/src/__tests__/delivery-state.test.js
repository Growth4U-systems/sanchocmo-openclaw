import { test } from "node:test";
import assert from "node:assert/strict";
import {
  canonicalThreadKey,
  hasRecentVisibleDelivery,
  markVisibleDelivery,
  resetVisibleDeliveriesForTest,
} from "../delivery-state.js";

test("canonicalThreadKey prefixes short thread ids with the slug", () => {
  assert.equal(canonicalThreadKey("growth4u", "brief"), "growth4u:brief");
  assert.equal(canonicalThreadKey("growth4u", "growth4u:brief"), "growth4u:brief");
});

test("visible delivery lookup matches short and prefixed thread ids", () => {
  resetVisibleDeliveriesForTest();
  markVisibleDelivery("growth4u", "growth4u:delegate-hamete-nichos", 10_000);

  assert.equal(hasRecentVisibleDelivery("growth4u", "delegate-hamete-nichos", 9_000, 10_500), true);
  assert.equal(hasRecentVisibleDelivery("growth4u", "growth4u:delegate-hamete-nichos", 9_000, 10_500), true);
  assert.equal(hasRecentVisibleDelivery("growth4u", "other-thread", 9_000, 10_500), false);
});

test("visible delivery lookup ignores deliveries before the current turn", () => {
  resetVisibleDeliveriesForTest();
  markVisibleDelivery("growth4u", "brief", 10_000);

  assert.equal(hasRecentVisibleDelivery("growth4u", "brief", 10_001, 10_500), false);
});
