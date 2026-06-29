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
    definitionVersion: 1,
    computedAt: "2026-06-30T01:00:00.000Z",
    ...overrides,
  };
}

test("builds dashboard stage totals and rates from persisted rollups", () => {
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
  assert.equal(model.rates.find((rate) => rate.fromStageId === "sessions")?.displayValue, "20%");
  assert.equal(model.rates.find((rate) => rate.fromStageId === "sessions")?.qualityStatus, "partial");
  assert.equal(model.channels.length, 2);
  assert.equal(model.channels.find((channel) => channel.channel === "crm")?.qualityStatus, "dirty");
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
        stageLabel: "Deals",
        stageOrder: 4,
        channel: "crm",
        source: "ghl",
        metricName: "totalOpportunities",
        value: 218,
        qualityStatus: "dirty",
      }),
    ],
  });

  const rate = model.rates.find((item) => item.fromStageId === "meetings");
  assert.equal(rate?.value, null);
  assert.equal(rate?.displayValue, "-");
  assert.equal(rate?.qualityStatus, "missing");
});
