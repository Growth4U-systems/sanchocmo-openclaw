import assert from "node:assert/strict";
import { test } from "node:test";
import * as metricsModule from "../metrics";
import * as snapshotsModule from "../metrics-snapshots";

const { buildSurfaceSummaryEntries } =
  (metricsModule as unknown as { default: typeof metricsModule }).default ?? metricsModule;
const { connectedNoDataRestatementDates } =
  (snapshotsModule as unknown as { default: typeof snapshotsModule }).default ?? snapshotsModule;

function partnerships(entries: ReturnType<typeof buildSurfaceSummaryEntries>) {
  const entry = entries.find((surface) => surface.surface === "partnerships");
  assert.ok(entry);
  return entry;
}

test("ingest accepts only exact empty YALC restatements for destructive convergence", () => {
  assert.deepEqual(connectedNoDataRestatementDates("yalc", {
    status: "connected_no_data",
    metrics: [],
    restatedDates: ["2026-07-15", "2026-07-14", "2026-07-15"],
  }), ["2026-07-14", "2026-07-15"]);

  assert.deepEqual(connectedNoDataRestatementDates("ga4", {
    status: "connected_no_data",
    metrics: [],
    restatedDates: ["2026-07-15"],
  }), [], "other providers keep their existing ingest semantics");
  assert.deepEqual(connectedNoDataRestatementDates("yalc", {
    status: "error",
    metrics: [],
    restatedDates: ["2026-07-15"],
  }), [], "errors can never authorize deletion");
  assert.deepEqual(connectedNoDataRestatementDates("yalc", {
    status: "connected_no_data",
    metrics: [{ name: "clicksDaily", value: 0 }],
    restatedDates: ["2026-07-15"],
  }), [], "a contradictory non-empty payload fails closed");
  assert.deepEqual(connectedNoDataRestatementDates("yalc", {
    status: "connected_no_data",
    metrics: [],
    restatedDates: ["2026-02-30"],
  }), [], "invalid calendar dates fail closed");
});

test("surface is connected without snapshots when YALC has no history", () => {
  const entry = partnerships(buildSurfaceSummaryEntries([], [], [{
    source: "yalc",
    status: "connected_no_data",
    metricDate: "2026-07-15",
    collectedAt: "2026-07-16T08:00:00.000Z",
  }]));

  assert.equal(entry.connected, true);
  assert.deepEqual(entry.sources, ["yalc"]);
  assert.deepEqual(entry.metrics, []);
  assert.equal(entry.dataStatus, "connected_no_data");
});

test("latest YALC no-data evidence cannot render older snapshot headlines as ON", () => {
  const entry = partnerships(buildSurfaceSummaryEntries(
    [{ source: "yalc" }],
    [{
      source: "yalc",
      metric: "clicksDaily",
      value: 1200,
      metricDate: "2026-07-14",
      collectedAt: "2026-07-15T07:00:00.000Z",
    }],
    [
      {
        source: "yalc",
        status: "ok",
        metricDate: "2026-07-14",
        collectedAt: "2026-07-15T08:00:00.000Z",
      },
      {
        source: "yalc",
        status: "connected_no_data",
        metricDate: "2026-07-15",
        collectedAt: "2026-07-16T08:00:00.000Z",
      },
    ],
  ));

  assert.equal(entry.connected, true);
  assert.deepEqual(entry.sources, ["yalc"]);
  assert.deepEqual(entry.metrics, []);
  assert.equal(entry.dataStatus, "connected_no_data");
});

test("a newer real YALC snapshot supersedes earlier no-data evidence", () => {
  const entry = partnerships(buildSurfaceSummaryEntries(
    [{ source: "yalc" }],
    [{
      source: "yalc",
      metric: "clicksDaily",
      value: 42,
      metricDate: "2026-07-16",
    }],
    [{
      source: "yalc",
      status: "connected_no_data",
      metricDate: "2026-07-15",
      collectedAt: "2026-07-16T08:00:00.000Z",
    }],
  ));

  assert.equal(entry.connected, true);
  assert.equal(entry.metrics[0]?.value, 42);
  assert.equal(entry.dataStatus, undefined);
});

test("a later backfill for the same day supersedes older no-data evidence", () => {
  const entry = partnerships(buildSurfaceSummaryEntries(
    [{ source: "yalc" }],
    [{
      source: "yalc",
      metric: "clicksDaily",
      value: 21,
      metricDate: "2026-07-15",
      collectedAt: "2026-07-17T10:00:00.000Z",
    }],
    [{
      source: "yalc",
      status: "connected_no_data",
      metricDate: "2026-07-15",
      collectedAt: "2026-07-16T08:00:00.000Z",
    }],
  ));

  assert.equal(entry.metrics[0]?.value, 21);
  assert.equal(entry.dataStatus, undefined);
});

test("error and skipped ledger rows never manufacture connectivity", () => {
  for (const status of ["error", "skipped"]) {
    const entry = partnerships(buildSurfaceSummaryEntries([], [], [{
      source: "yalc",
      status,
      metricDate: "2026-07-15",
    }]));
    assert.equal(entry.connected, false);
    assert.deepEqual(entry.sources, []);
    assert.equal(entry.dataStatus, undefined);
  }
});

test("a later failed attempt does not erase the latest successful no-data evidence", () => {
  const entry = partnerships(buildSurfaceSummaryEntries([], [], [
    {
      source: "yalc",
      status: "connected_no_data",
      metricDate: "2026-07-15",
      collectedAt: "2026-07-16T08:00:00.000Z",
    },
    {
      source: "yalc",
      status: "error",
      metricDate: "2026-07-16",
      collectedAt: "2026-07-17T08:00:00.000Z",
    },
  ]));
  assert.equal(entry.connected, true);
  assert.equal(entry.dataStatus, "connected_no_data");
});
