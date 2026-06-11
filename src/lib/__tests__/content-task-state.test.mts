import { test } from "node:test";
import assert from "node:assert/strict";
import * as mod from "../content-task-state";

const { aggregateChannelPhases, computeRollbackPreview, deriveStatusFromPhase, isForwardMove } =
  (mod as unknown as { default: typeof mod }).default ?? mod;

test("aggregateChannelPhases: least-advanced channel wins", () => {
  assert.equal(aggregateChannelPhases({ a: "draft", b: "researching" }), "researching");
  assert.equal(aggregateChannelPhases({ a: "published" }), "published");
  assert.equal(aggregateChannelPhases({}), null);
  assert.equal(aggregateChannelPhases(undefined), null);
});

test("deriveStatusFromPhase + isForwardMove: ratchet semantics", () => {
  assert.deepEqual(deriveStatusFromPhase("draft"), { status: "Draft", pipeline_state: null });
  assert.equal(isForwardMove({ status: "Approved", pipeline_state: "drafting" }, deriveStatusFromPhase("draft")), true);
  assert.equal(isForwardMove({ status: "Draft" }, deriveStatusFromPhase("drafting")), false);
  // Within Approved: pipeline ranks advance, Pending Media never auto-advances.
  assert.equal(
    isForwardMove({ status: "Approved", pipeline_state: "researching" }, deriveStatusFromPhase("drafting")),
    true,
  );
  assert.equal(
    isForwardMove({ status: "Pending Media", pipeline_state: "generating-media" }, deriveStatusFromPhase("approved")),
    false,
  );
});

test("computeRollbackPreview: caps phases above the target status", () => {
  assert.deepEqual(
    computeRollbackPreview({ linkedin: "approved", twitter: "drafting" }, "Approved"),
    [{ channel: "linkedin", from: "approved", to: "drafting" }],
  );
  // Target Draft caps published → draft, leaves draft as-is.
  assert.deepEqual(
    computeRollbackPreview({ a: "published", b: "draft" }, "Draft"),
    [{ channel: "a", from: "published", to: "draft" }],
  );
  // Target New clears everything (to: null).
  assert.deepEqual(
    computeRollbackPreview({ a: "draft" }, "New"),
    [{ channel: "a", from: "draft", to: null }],
  );
  // Nothing above the cap → empty.
  assert.deepEqual(computeRollbackPreview({ a: "researching" }, "Approved"), []);
  assert.deepEqual(computeRollbackPreview(undefined, "Approved"), []);
});
