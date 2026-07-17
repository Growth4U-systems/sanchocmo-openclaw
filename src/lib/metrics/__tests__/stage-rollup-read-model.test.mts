import { test } from "node:test";
import assert from "node:assert/strict";
import * as mod from "../stage-rollup-read-model";

const { buildMetricStageRollupReadModel } =
  (mod as unknown as { default: typeof mod }).default ?? mod;

type Row = mod.MetricStageRollupReadInput;

function row(overrides: Partial<Row>): Row {
  return {
    id: "rollup_1",
    stageId: "sessions",
    stageLabel: "Sessions",
    stageOrder: 0,
    stageDate: "2026-06-01",
    channel: "web",
    surface: "web",
    source: "ga4",
    metricName: "sessions",
    value: 1,
    qualityStatus: "ok",
    provenanceLabel: "ga4.sessions -> sessions",
    inputRefs: [{ source: "ga4" }],
    rangeFrom: "2026-06-01",
    rangeTo: "2026-06-30",
    definitionVersion: 2,
    computedAt: "2026-06-30T01:00:00.000Z",
    ...overrides,
  };
}

test("builds provider observations without deriving cross-stage conversion rates", () => {
  const model = buildMetricStageRollupReadModel({
    configured: true,
    range: { from: "2026-06-01", to: "2026-06-30" },
    rows: [
      row({ value: 100 }),
      row({
        id: "rollup_2",
        stageId: "leads",
        stageLabel: "Leads",
        stageOrder: 1,
        channel: "web",
        source: "ga4",
        metricName: "conversions",
        value: 20,
        qualityStatus: "partial",
      }),
      row({
        id: "rollup_3",
        stageId: "meetings",
        stageLabel: "Reuniones",
        stageOrder: 3,
        channel: "crm",
        surface: "pipeline",
        source: "ghl",
        metricName: "appointments",
        value: 4,
        qualityStatus: "dirty",
      }),
    ],
  });

  assert.equal(model.available, true);
  assert.equal(model.summary.totalRows, 3);
  assert.equal(model.summary.qualityStatus, "dirty");
  assert.equal(model.stages.find((stage) => stage.stageId === "sessions")?.value, 100);
  assert.equal(model.stages.find((stage) => stage.stageId === "leads")?.value, 20);
  assert.equal(model.stages.find((stage) => stage.stageId === "qualified")?.qualityStatus, "missing");
  assert.equal(model.rates.find((rate) => rate.fromStageId === "sessions")?.displayValue, "-");
  assert.equal(model.rates.find((rate) => rate.fromStageId === "sessions")?.value, null);
  assert.equal(model.rates.find((rate) => rate.fromStageId === "sessions")?.qualityStatus, "partial");
  assert.equal(
    model.rates.find((rate) => rate.fromStageId === "sessions")?.calculationStatus,
    "identity_not_available",
  );
  assert.equal(model.channels.length, 2);
  assert.equal(model.summary.aggregationMode, "provider_observations");
  assert.equal(model.summary.conversionRatesAvailable, false);
  assert.equal(model.channels.find((channel) => channel.channel === "crm")?.qualityStatus, "dirty");
});

test("keeps the same lead observed by GA4, Meta and GHL as three non-additive series", () => {
  const model = buildMetricStageRollupReadModel({
    configured: true,
    range: { from: "2026-06-01", to: "2026-06-30" },
    rows: [
      row({
        id: "ga4_session",
        stageId: "sessions",
        metricName: "sessions",
        source: "ga4",
        channel: "web",
        value: 100,
      }),
      row({
        id: "same_lead_ga4",
        stageId: "leads",
        stageLabel: "Leads",
        stageOrder: 1,
        metricName: "conversions",
        source: "ga4",
        channel: "web",
        value: 1,
      }),
      row({
        id: "same_lead_meta",
        stageId: "leads",
        stageLabel: "Leads",
        stageOrder: 1,
        metricName: "leads",
        source: "meta_ads",
        channel: "paid",
        value: 1,
      }),
      row({
        id: "same_lead_ghl",
        stageId: "leads",
        stageLabel: "Leads",
        stageOrder: 1,
        metricName: "newContacts",
        source: "ghl",
        channel: "crm",
        value: 1,
      }),
    ],
  });

  const leads = model.stages.find((stage) => stage.stageId === "leads");
  assert.equal(leads?.value, null);
  assert.equal(leads?.displayValue, "3 series separadas");
  assert.equal(leads?.seriesCount, 3);
  assert.equal(leads?.aggregationStatus, "non_additive");
  assert.equal(model.summary.providerSeriesCount, 3);
  assert.deepEqual(
    model.channels.map((series) => [series.channel, series.source]),
    [["crm", "ghl"], ["paid", "meta_ads"], ["web", "ga4"]],
  );
  assert.deepEqual(
    model.channels.map((series) =>
      series.stages.find((stage) => stage.stageId === "leads")?.value,
    ),
    [1, 1, 1],
  );
  assert.ok(model.rates.every((rate) => rate.value == null));
});

test("does not add overlapping custom maps from the same provider metric", () => {
  const model = buildMetricStageRollupReadModel({
    configured: true,
    range: { from: "2026-06-01", to: "2026-06-30" },
    rows: [
      row({
        id: "map_a_leads",
        mapId: "paid.meta.all_leads",
        stageId: "leads",
        stageLabel: "Leads",
        stageOrder: 1,
        channel: "paid",
        source: "meta_ads",
        metricName: "leads",
        value: 10,
      }),
      row({
        id: "map_b_leads",
        mapId: "paid.meta.priority_leads",
        stageId: "leads",
        stageLabel: "Leads",
        stageOrder: 1,
        channel: "paid",
        source: "meta_ads",
        metricName: "leads",
        value: 4,
      }),
    ],
  });

  const leads = model.stages.find((stage) => stage.stageId === "leads");
  assert.equal(leads?.value, null);
  assert.equal(leads?.seriesCount, 2);
  assert.equal(leads?.displayValue, "2 series separadas");
  assert.equal(
    model.channels[0]?.stages.find((stage) => stage.stageId === "leads")?.value,
    null,
  );
});

test("returns an honest empty state when no stage rollups exist", () => {
  const model = buildMetricStageRollupReadModel({
    configured: true,
    range: { from: "2026-06-01", to: "2026-06-30" },
    rows: [],
  });

  assert.equal(model.available, false);
  assert.equal(model.summary.emptyState, "missing_stage_rollups");
  assert.equal(model.summary.qualityStatus, "missing");
  assert.equal(model.stages.length, 5);
  assert.ok(model.stages.every((stage) => stage.value === null));
  assert.equal(model.stages.at(-1)?.label, "Oportunidades");
});

test("marks otherwise clean summary and channel partial when core stages are missing", () => {
  const model = buildMetricStageRollupReadModel({
    configured: true,
    range: { from: "2026-06-01", to: "2026-06-30" },
    rows: [
      row({ value: 100 }),
      row({
        id: "rollup_leads",
        stageId: "leads",
        stageLabel: "Leads",
        stageOrder: 1,
        value: 20,
      }),
    ],
  });

  assert.equal(model.available, true);
  assert.equal(model.summary.qualityStatus, "partial");
  assert.equal(model.channels[0]?.qualityStatus, "partial");
});

test("sums GHL opportunities created inside the selected period", () => {
  const model = buildMetricStageRollupReadModel({
    configured: true,
    range: { from: "2026-06-01", to: "2026-06-30" },
    rows: [
      row({
        id: "rollup_opportunities_1",
        stageId: "deals",
        stageLabel: "Oportunidades",
        stageOrder: 4,
        stageDate: "2026-06-01",
        channel: "crm",
        source: "ghl",
        metricName: "opportunities",
        value: 2,
      }),
      row({
        id: "rollup_opportunities_2",
        stageId: "deals",
        stageLabel: "Oportunidades",
        stageOrder: 4,
        stageDate: "2026-06-02",
        channel: "crm",
        source: "ghl",
        metricName: "opportunities",
        value: 3,
      }),
    ],
  });

  const opportunities = model.stages.find((stage) => stage.stageId === "deals");
  assert.equal(opportunities?.label, "Oportunidades");
  assert.equal(opportunities?.value, 5);
  assert.deepEqual(opportunities?.sources, ["ghl.opportunities"]);
});

test("does not publish impossible conversion rates over 100 percent", () => {
  const model = buildMetricStageRollupReadModel({
    configured: true,
    range: { from: "2026-06-01", to: "2026-06-30" },
    rows: [
      row({
        id: "rollup_meetings",
        stageId: "meetings",
        stageLabel: "Reuniones",
        stageOrder: 3,
        channel: "crm",
        source: "ghl",
        metricName: "appointments",
        value: 4,
        qualityStatus: "dirty",
      }),
      row({
        id: "rollup_deals",
        stageId: "deals",
        stageLabel: "Oportunidades",
        stageOrder: 4,
        channel: "crm",
        source: "ghl",
        metricName: "opportunities",
        value: 218,
        qualityStatus: "dirty",
      }),
    ],
  });

  const rate = model.rates.find((item) => item.fromStageId === "meetings");
  assert.equal(rate?.value, null);
  assert.equal(rate?.displayValue, "-");
  assert.equal(rate?.qualityStatus, "partial");
  assert.equal(rate?.calculationStatus, "identity_not_available");
});
