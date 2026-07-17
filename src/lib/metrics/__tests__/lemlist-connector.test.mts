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
  assert.throws(() => lemlistDateWindow("2026-02-30"), /Invalid Lemlist date/);
});

test("mapLemlistStatsToMetrics emits rollup and campaign-dimension metrics", () => {
  const metrics = mapLemlistStatsToMetrics({
    date: "2026-06-27",
    campaigns: [
      { _id: "cam_a", name: "Alpha", status: "running" },
      { _id: "cam_b", name: "Beta", status: "archived" },
    ],
    stats: [
      { campaignId: "cam_a", messagesSent: 10, opened: 6, clicked: 1, replied: 2, meetingBooked: 1 },
      { campaignId: "cam_b", messagesSent: 5, opened: 2, clicked: 0, replied: 1, meetingBooked: 0 },
    ],
  });

  assert.deepEqual(metrics.find((metric) => metric.name === "campaigns" && !metric.dimensions), {
    name: "campaigns",
    value: 1,
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
        { _id: "cam_archived", name: "Archived", status: "archived" },
        { _id: "cam_draft", name: "Draft", status: "draft" },
      ]);
    }
    assert.equal(url, "https://api.lemlist.com/api/v2/campaigns/stats/batch");
    assert.equal((init?.headers as Record<string, string>).Authorization, lemlistBasicAuthHeader("sekret"));
    assert.deepEqual(JSON.parse(String(init?.body)), {
      campaignIds: ["cam_a", "cam_archived"],
      startDate: "2026-06-27T00:00:00.000Z",
      endDate: "2026-06-27T23:59:59.999Z",
    });
    return jsonResponse({
      results: [
        { campaignId: "cam_a", messagesSent: 7, replied: 3 },
        { campaignId: "cam_archived", messagesSent: 2, replied: 1 },
      ],
      errors: [],
    });
  };

  const collection = await collectLemlistMetrics({ apiKey: "sekret", date: "2026-06-27", fetchImpl });

  assert.equal(calls.length, 2);
  assert.equal(collection.campaignCount, 2);
  assert.equal(collection.statsCount, 2);
  assert.equal(collection.metrics.some((metric) => metric.name === "campaigns"), false);
  assert.equal(collection.metrics.find((metric) => metric.name === "sent" && !metric.dimensions)?.value, 9);
  assert.equal(collection.metrics.find((metric) => metric.name === "replies" && !metric.dimensions)?.value, 4);
});

test("routine Lemlist collection emits active stock while retaining archived campaign activity", async () => {
  const fetchImpl = async (input: string | URL) => {
    const url = String(input);
    if (url.includes("/campaigns?")) {
      return jsonResponse([
        { _id: "cam_active", status: "running" },
        { _id: "cam_archived", status: "archived" },
      ]);
    }
    return jsonResponse({
      results: [
        { campaignId: "cam_active", messagesSent: 3 },
        { campaignId: "cam_archived", messagesSent: 4 },
      ],
      errors: [],
    });
  };

  const collection = await collectLemlistMetrics({ apiKey: "sekret", fetchImpl });
  assert.equal(collection.metrics.find((metric) => metric.name === "campaigns")?.value, 1);
  assert.equal(collection.metrics.find((metric) => metric.name === "sent" && !metric.dimensions)?.value, 7);
});

test("Lemlist collection fails atomically on batch errors or a truncated campaign catalogue", async () => {
  await assert.rejects(
    () => collectLemlistMetrics({
      apiKey: "sekret",
      date: "2026-06-27",
      campaignIds: ["cam_a"],
      fetchImpl: async () => jsonResponse({
        results: [],
        errors: [{ campaignId: "cam_a", message: "unavailable" }],
      }),
    }),
    /returned 1 campaign error/,
  );

  await assert.rejects(
    () => collectLemlistMetrics({
      apiKey: "sekret",
      date: "2026-06-27",
      pageLimit: 1,
      maxCampaigns: 1,
      fetchImpl: async () => jsonResponse([{ _id: "cam_a", status: "running" }]),
    }),
    /campaign listing exceeded the 1-record safety limit/,
  );
});

function jsonResponse(value: unknown) {
  return {
    ok: true,
    status: 200,
    text: async () => JSON.stringify(value),
  };
}
