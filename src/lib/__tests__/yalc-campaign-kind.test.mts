import assert from "node:assert/strict";
import { test } from "node:test";
import campaignKindModule from "../yalc/campaign-kind";

const {
  isCampaignKind,
  normalizeYalcCampaign,
  normalizeYalcCampaignPayload,
  normalizeYalcLeadPayload,
} = campaignKindModule;

test("normalizeYalcCampaign adds explicit B2B campaign kind", () => {
  const campaign = normalizeYalcCampaign({ id: "c1", type: "B2B" });
  assert.equal(campaign.campaignKind, "b2b");
  assert.equal(campaign.campaignKindLabel, "Campaña B2B");
  assert.equal(isCampaignKind(campaign, "b2b"), true);
});

test("normalizeYalcCampaign maps Partnerships to creator campaign kind", () => {
  const campaign = normalizeYalcCampaign({ id: "c2", type: "Partnerships" });
  assert.equal(campaign.campaignKind, "creator");
  assert.equal(campaign.campaignKindLabel, "Campaña creator");
  assert.equal(isCampaignKind(campaign, "creator"), true);
});

test("creator wording wins when legacy campaigns are missing type", () => {
  const payload = normalizeYalcCampaignPayload(
    {
      campaigns: [
        { id: "b2b", title: "Ventas fintech CFOs" },
        { id: "creator", title: "QA UI Partnerships", targetSegment: "Creators macro España" },
      ],
    },
    "b2b",
  );
  const campaigns = payload.campaigns as Array<{ campaignKind: string }>;

  assert.equal(campaigns[0].campaignKind, "b2b");
  assert.equal(campaigns[1].campaignKind, "creator");
});

test("normalizeYalcLeadPayload exposes campaign kind on leads", () => {
  const payload = normalizeYalcLeadPayload(
    {
      leads: [
        { id: "l1", campaignType: "B2B" },
        { id: "l2", campaignTitle: "Creators finanzas Instagram" },
      ],
    },
    "unknown",
  );
  const leads = payload.leads as Array<{ campaignKind: string }>;

  assert.equal(leads[0].campaignKind, "b2b");
  assert.equal(leads[1].campaignKind, "creator");
});
