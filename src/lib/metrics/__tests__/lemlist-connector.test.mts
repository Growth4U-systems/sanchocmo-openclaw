import { test } from "node:test";
import assert from "node:assert/strict";
import * as mod from "../connectors/lemlist";

const {
  collectLemlistMetrics,
  lemlistBasicAuthHeader,
  lemlistDateWindow,
  mapLemlistStatsToMetrics,
} = (mod as unknown as { default: typeof mod }).default ?? mod;

test("lemlistDateWindow builds a UTC daily stats window", () => {
  assert.deepEqual(lemlistDateWindow("2026-06-27"), {
    date: "2026-06-27",
    startDate: "2026-06-27T00:00:00.000Z",
    endDate: "2026-06-27T23:59:59.999Z",
  });
});

test("mapLemlistStatsToMetrics emits rollup and campaign-dimension metrics", () => {
  const metrics = mapLemlistStatsToMetrics({
    date: "2026-06-27",
    campaigns: [
      { _id: "cam_a", name: "Alpha", status: "running" },
      { _id: "cam_b", name: "Beta", status: "paused" },
    ],
    stats: [
      { campaignId: "cam_a", messagesSent: 10, opened: 6, clicked: 1, replied: 2, meetingBooked: 1 },
      { campaignId: "cam_b", messagesSent: 5, opened: 2, clicked: 0, replied: 1, meetingBooked: 0 },
    ],
  });

  assert.deepEqual(metrics.find((metric) => metric.name === "campaigns" && !metric.dimensions), {
    name: "campaigns",
    value: 2,
    date: "2026-06-27",
  });
  assert.deepEqual(metrics.find((metric) => metric.name === "sent" && !metric.dimensions), {
    name: "sent",
    value: 15,
    date: "2026-06-27",
  });
  assert.deepEqual(metrics.find((metric) => metric.name === "replies" && metric.dimensions?.campaignId === "cam_a"), {
    name: "replies",
    value: 2,
    date: "2026-06-27",
    dimensions: { campaignId: "cam_a", campaignName: "Alpha", campaignStatus: "running" },
  });
});

test("collectLemlistMetrics paginates campaigns and calls batch stats with Basic auth", async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fetchImpl = async (input: string | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    if (url.includes("/campaigns?")) {
      return jsonResponse([
        { _id: "cam_a", name: "Alpha", status: "running" },
        { _id: "cam_draft", name: "Draft", status: "draft" },
      ]);
    }
    assert.equal(url, "https://api.lemlist.com/api/v2/campaigns/stats/batch");
    assert.equal((init?.headers as Record<string, string>).Authorization, lemlistBasicAuthHeader("sekret"));
    assert.deepEqual(JSON.parse(String(init?.body)), {
      campaignIds: ["cam_a"],
      startDate: "2026-06-27T00:00:00.000Z",
      endDate: "2026-06-27T23:59:59.999Z",
    });
    return jsonResponse({ results: [{ campaignId: "cam_a", messagesSent: 7, replied: 3 }], errors: [] });
  };

  const collection = await collectLemlistMetrics({ apiKey: "sekret", date: "2026-06-27", fetchImpl });

  assert.equal(calls.length, 2);
  assert.equal(collection.campaignCount, 1);
  assert.equal(collection.statsCount, 1);
  assert.equal(collection.metrics.find((metric) => metric.name === "sent" && !metric.dimensions)?.value, 7);
  assert.equal(collection.metrics.find((metric) => metric.name === "replies" && !metric.dimensions)?.value, 3);
});

function jsonResponse(value: unknown) {
  return {
    ok: true,
    status: 200,
    text: async () => JSON.stringify(value),
  };
}
