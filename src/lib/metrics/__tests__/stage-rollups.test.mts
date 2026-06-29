/**
 * Stage rollup layer (SAN-362) - pure, no DB.
 *
 * Guards that raw metric_snapshots map into pre-attribution funnel rows without
 * pretending they are deduped business truth.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import * as stageMod from "../stage-rollups";
import * as semanticMod from "../semantic-kpis";

const {
  buildStageRollupsAvailabilityKpi,
  computeMetricStageRollupsFromSnapshots,
} =
  (stageMod as unknown as { default: typeof stageMod }).default ?? stageMod;
const { METRIC_KPI_DEFINITIONS } =
  (semanticMod as unknown as { default: typeof semanticMod }).default ??
  semanticMod;

type SnapshotInput = semanticMod.MetricKpiSnapshotInput;

const oneDay = { from: "2026-06-01", to: "2026-06-01" };

function row(overrides: Partial<SnapshotInput>): SnapshotInput {
  return {
    id: `row_${Math.random().toString(16).slice(2)}`,
    source: "ga4",
    metricName: "sessions",
    value: 1,
    metricDate: "2026-06-01",
    dimensions: null,
    dimsKey: "",
    ...overrides,
  };
}

test("maps raw snapshots into stage/channel rollups without double-counting dimensions when a rollup exists", () => {
  const rollups = computeMetricStageRollupsFromSnapshots(
    [
      row({ source: "ga4", metricName: "sessions", value: 100 }),
      row({ source: "meta_ads", metricName: "leads", value: 10 }),
      row({
        source: "meta_ads",
        metricName: "leads",
        value: 5,
        dimensions: { campaign: "A" },
        dimsKey: '[["campaign","A"]]',
      }),
    ],
    oneDay,
  );

  const sessions = rollups.find((item) => item.mapId.endsWith("web.sessions"));
  assert.equal(sessions?.stageId, "sessions");
  assert.equal(sessions?.channel, "web");
  assert.equal(sessions?.value, 100);
  assert.equal(sessions?.qualityStatus, "ok");

  const paidLead = rollups.find((item) => item.mapId.endsWith("paid.leads.meta"));
  assert.equal(paidLead?.stageId, "leads");
  assert.equal(paidLead?.channel, "paid");
  assert.equal(paidLead?.value, 10);
  assert.equal(paidLead?.qualityStatus, "partial");
});

test("marks GHL stage rollups dirty", () => {
  const rollups = computeMetricStageRollupsFromSnapshots(
    [row({ source: "ghl", metricName: "appointments", value: 4 })],
    oneDay,
  );
  const meetings = rollups.find((item) => item.stageId === "meetings");
  assert.equal(meetings?.value, 4);
  assert.equal(meetings?.qualityStatus, "dirty");
});

test("seed/demo metadata wins over partial platform quality", () => {
  const rollups = computeMetricStageRollupsFromSnapshots(
    [
      row({
        source: "google-ads",
        metricName: "leads",
        value: 8,
        dimensions: { __provenance: "seed", __quality: "demo" },
        dimsKey: "",
      }),
    ],
    oneDay,
  );
  const paidLead = rollups.find((item) => item.mapId.endsWith("paid.leads.google"));
  assert.equal(paidLead?.value, 8);
  assert.equal(paidLead?.qualityStatus, "demo");
});

test("maps Lemlist meetingBooked alias into outbound meetings", () => {
  const rollups = computeMetricStageRollupsFromSnapshots(
    [row({ source: "lemlist", metricName: "meetingBooked", value: 2 })],
    oneDay,
  );
  const meetings = rollups.find((item) => item.mapId.endsWith("outbound.meetings.lemlist"));
  assert.equal(meetings?.stageId, "meetings");
  assert.equal(meetings?.channel, "outbound");
  assert.equal(meetings?.value, 2);
  assert.equal(meetings?.qualityStatus, "partial");
});

test("latest stage metrics persist one range-level rollup instead of daily additive rows", () => {
  const rollups = computeMetricStageRollupsFromSnapshots(
    [
      row({ source: "ghl", metricName: "totalOpportunities", value: 71, metricDate: "2026-06-01" }),
      row({ source: "ghl", metricName: "totalOpportunities", value: 74, metricDate: "2026-06-02" }),
      row({ source: "ghl", metricName: "totalOpportunities", value: 73, metricDate: "2026-06-03" }),
    ],
    { from: "2026-06-01", to: "2026-06-03" },
  );
  const deals = rollups.filter((item) => item.mapId.endsWith("crm.deals.ghl"));
  assert.equal(deals.length, 1);
  assert.equal(deals[0].stageId, "deals");
  assert.equal(deals[0].stageDate, "2026-06-03");
  assert.equal(deals[0].value, 73);
  assert.equal(deals[0].qualityStatus, "dirty");
});

test("availability KPI reports honest partial coverage", () => {
  const rollups = computeMetricStageRollupsFromSnapshots(
    [
      row({ source: "ga4", metricName: "sessions", value: 100 }),
      row({ source: "lemlist", metricName: "meetings", value: 2 }),
    ],
    oneDay,
  );
  const definition = METRIC_KPI_DEFINITIONS.find(
    (item) => item.id === "conversion.stage_rollups",
  );
  assert.ok(definition);
  const value = buildStageRollupsAvailabilityKpi(rollups, oneDay, definition);
  assert.equal(value.kpiId, "conversion.stage_rollups");
  assert.equal(value.valueText, "2/5 stages");
  assert.equal(value.qualityStatus, "partial");
  assert.equal(value.provenanceLabel, "metric_stage_rollups");
});
