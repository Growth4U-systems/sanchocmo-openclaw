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

test("dedupes coexisting provider aliases before stage rollups", () => {
  const rollups = computeMetricStageRollupsFromSnapshots(
    [
      row({
        id: "legacy-alias",
        source: "meta-ads",
        metricName: "leads",
        value: 5,
        collectedAt: "2026-06-01T10:00:00.000Z",
      }),
      row({
        id: "latest-canonical",
        source: "meta_ads",
        metricName: "leads",
        value: 9,
        collectedAt: "2026-06-01T11:00:00.000Z",
      }),
    ],
    oneDay,
  );

  const paidLead = rollups.find((item) => item.mapId === "paid.leads.meta");
  assert.equal(paidLead?.value, 9);
  assert.deepEqual(paidLead?.inputRefs.map((input) => input.id), [
    "latest-canonical",
  ]);
});

test("persists GA4, Meta and GHL observations of the same lead as separate provider series", () => {
  const rollups = computeMetricStageRollupsFromSnapshots(
    [
      row({
        id: "same-lead-ga4",
        source: "ga4",
        metricName: "conversions",
        value: 1,
      }),
      row({
        id: "same-lead-meta",
        source: "meta_ads",
        metricName: "leads",
        value: 1,
      }),
      row({
        id: "same-lead-ghl",
        source: "ghl",
        metricName: "newContacts",
        value: 1,
      }),
    ],
    oneDay,
  );

  const leads = rollups.filter((item) => item.stageId === "leads");
  assert.equal(leads.length, 3);
  assert.deepEqual(
    leads.map((item) => [item.source, item.value]).sort(),
    [["ga4", 1], ["ghl", 1], ["meta_ads", 1]],
  );
  assert.ok(leads.every((item) => item.inputRefs.length === 1));
  assert.deepEqual(
    new Set(leads.map((item) => item.mapId)),
    new Set(["web.leads.ga4", "paid.leads.meta", "crm.leads.ghl"]),
  );
  assert.equal(leads.some((item) => item.source === "global"), false);
});

test("GHL stage rollups are clean when collected directly from the CRM", () => {
  const rollups = computeMetricStageRollupsFromSnapshots(
    [row({ source: "ghl", metricName: "appointments", value: 4 })],
    oneDay,
  );
  const meetings = rollups.find((item) => item.stageId === "meetings");
  assert.equal(meetings?.value, 4);
  assert.equal(meetings?.qualityStatus, "ok");
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

test("GHL opportunities remain period flows instead of all-time stock", () => {
  const rollups = computeMetricStageRollupsFromSnapshots(
    [
      row({ source: "ghl", metricName: "opportunities", value: 2, metricDate: "2026-06-01" }),
      row({ source: "ghl", metricName: "opportunities", value: 4, metricDate: "2026-06-02" }),
      row({ source: "ghl", metricName: "opportunities", value: 3, metricDate: "2026-06-03" }),
      row({ source: "ghl", metricName: "totalOpportunities", value: 73, metricDate: "2026-06-03" }),
    ],
    { from: "2026-06-01", to: "2026-06-03" },
  );
  const deals = rollups.filter((item) => item.mapId.endsWith("crm.deals.ghl"));
  assert.equal(deals.length, 3);
  assert.deepEqual(deals.map((item) => item.value), [2, 4, 3]);
  assert.ok(deals.every((item) => item.stageId === "deals"));
  assert.ok(deals.every((item) => item.stageLabel === "Oportunidades"));
  assert.ok(deals.every((item) => item.metricName === "opportunities"));
  assert.ok(deals.every((item) => item.qualityStatus === "ok"));
});

test("marks every daily stage rollup partial when the definition has incomplete date coverage", () => {
  const rollups = computeMetricStageRollupsFromSnapshots(
    [
      row({ source: "ghl", metricName: "opportunities", value: 2, metricDate: "2026-06-01" }),
      row({ source: "ghl", metricName: "opportunities", value: 3, metricDate: "2026-06-03" }),
    ],
    { from: "2026-06-01", to: "2026-06-03" },
  );

  const deals = rollups.filter((item) => item.mapId.endsWith("crm.deals.ghl"));
  assert.equal(deals.length, 2);
  assert.ok(deals.every((item) => item.qualityStatus === "partial"));
});

test("Partnerships stages sum exact daily flows and ignore legacy rolling rows", () => {
  const rollups = computeMetricStageRollupsFromSnapshots(
    [
      row({ source: "yalc", metricName: "signupsDaily", value: 11, metricDate: "2026-06-01" }),
      row({ source: "yalc", metricName: "signups_daily", value: 12, metricDate: "2026-06-02" }),
      row({ source: "yalc", metricName: "signups", value: 900, metricDate: "2026-06-02" }),
      row({ source: "yalc", metricName: "kycDaily", value: 7, metricDate: "2026-06-01" }),
      row({ source: "yalc", metricName: "kyc_daily", value: 8, metricDate: "2026-06-02" }),
      row({ source: "yalc", metricName: "kyc", value: 700, metricDate: "2026-06-02" }),
      row({ source: "yalc", metricName: "firstTxDaily", value: 2, metricDate: "2026-06-01" }),
      row({ source: "yalc", metricName: "first_tx_daily", value: 3, metricDate: "2026-06-02" }),
      row({ source: "yalc", metricName: "firstTx", value: 100, metricDate: "2026-06-02" }),
    ],
    { from: "2026-06-01", to: "2026-06-02" },
  );

  const leads = rollups.filter((item) => item.mapId === "partnerships.signups");
  assert.deepEqual(leads.map((item) => item.value), [11, 12]);
  assert.equal(leads.reduce((total, item) => total + item.value, 0), 23);
  assert.ok(leads.every((item) => item.metricName === "signupsDaily"));
  assert.ok(leads.every((item) => item.qualityStatus === "ok"));

  const qualified = rollups.filter((item) => item.mapId === "partnerships.kyc");
  assert.deepEqual(qualified.map((item) => item.value), [7, 8]);
  assert.equal(qualified.reduce((total, item) => total + item.value, 0), 15);
  assert.ok(qualified.every((item) => item.metricName === "kycDaily"));
  assert.ok(qualified.every((item) => item.qualityStatus === "ok"));

  const customers = rollups.filter((item) => item.mapId === "partnerships.first_tx");
  assert.deepEqual(customers.map((item) => item.value), [2, 3]);
  assert.equal(customers.reduce((total, item) => total + item.value, 0), 5);
  assert.ok(customers.every((item) => item.metricName === "firstTxDaily"));
  assert.ok(customers.every((item) => item.qualityStatus === "ok"));
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
  assert.equal(value.valueText, "2/5 observed stages");
  assert.equal(value.qualityStatus, "partial");
  assert.match(value.provenanceLabel ?? "", /not cross-provider additive/);
});
