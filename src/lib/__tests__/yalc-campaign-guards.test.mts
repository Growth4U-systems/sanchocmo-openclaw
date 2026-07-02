import assert from "node:assert/strict";
import { test } from "node:test";
import * as guardsModule from "../yalc/campaign-guards";

const guards = (guardsModule as unknown as { default?: typeof guardsModule }).default ?? guardsModule;

test("expectedCampaignKindFromInput normalizes B2B and Partnerships aliases", () => {
  assert.equal(guards.expectedCampaignKindFromInput({ expectedKind: "b2b" }), "b2b");
  assert.equal(guards.expectedCampaignKindFromInput({ type: "B2B" }), "b2b");
  assert.equal(guards.expectedCampaignKindFromInput({ expectedKind: "creator" }), "creator");
  assert.equal(guards.expectedCampaignKindFromInput({ type: "Partnerships" }), "creator");
  assert.equal(guards.expectedCampaignKindFromInput({}), "unknown");
});

test("campaignLocksLeadEdits locks launched campaigns and externally synced leads", () => {
  assert.equal(guards.campaignLocksLeadEdits({ status: "draft" }, []), false);
  assert.equal(guards.campaignLocksLeadEdits({ status: "running" }, []), false);
  assert.equal(guards.campaignLocksLeadEdits({ status: "live" }, []), true);
  assert.equal(guards.campaignLocksLeadEdits({ status: "draft" }, [{ instantlyCampaignId: "inst-1" }]), true);
  assert.equal(guards.campaignLocksLeadEdits({ status: "draft" }, [{ lifecycleStatus: "Replied" }]), true);
  assert.equal(guards.campaignLocksLeadEdits({ status: "draft" }, [{ lastMessage: { body: "hi" } }]), true);
  assert.equal(guards.campaignLocksLeadEdits({ status: "draft" }, [{ emailStatus: "opened" }]), true);
});
