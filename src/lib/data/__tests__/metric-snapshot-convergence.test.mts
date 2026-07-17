import assert from "node:assert/strict";
import { test } from "node:test";
import * as snapshotsModule from "@/lib/data/metrics-snapshots";

const {
  buildMetricRestatementScopes,
  canDeleteStaleSourcePayload,
  normalizeAttemptedProviderDates,
  normalizeMetricRestatementScopeInputs,
} =
  (snapshotsModule as unknown as { default: typeof snapshotsModule }).default ?? snapshotsModule;

interface TestRow {
  id: string;
  metricDate: string;
  metricName: string;
}

function converge(
  existing: TestRow[],
  incoming: TestRow[],
  explicitScopes: Array<{ metricDate: string; metricName: string }> = [],
): TestRow[] {
  const afterUpsert = new Map(existing.map((row) => [row.id, row]));
  for (const row of incoming) afterUpsert.set(row.id, row);

  const scopes = buildMetricRestatementScopes(incoming, explicitScopes);
  const scopeByKey = new Map(
    scopes.map((scope) => [
      `${scope.metricDate}\u0000${scope.metricName}`,
      new Set(scope.keepIds),
    ]),
  );

  return [...afterUpsert.values()].filter((row) => {
    const keepIds = scopeByKey.get(`${row.metricDate}\u0000${row.metricName}`);
    return !keepIds || keepIds.has(row.id);
  });
}

test("GHL recentLead restatement cannot delete unrelated historical rollups", () => {
  const historicalDate = "2026-05-10";
  const collectedDate = "2026-07-15";
  const existing: TestRow[] = [
    { id: "historical-contacts", metricDate: historicalDate, metricName: "newContacts" },
    { id: "historical-appointments", metricDate: historicalDate, metricName: "appointments" },
    { id: "lead-keep", metricDate: historicalDate, metricName: "recentLead" },
    { id: "lead-stale", metricDate: historicalDate, metricName: "recentLead" },
    { id: "contacts-total", metricDate: collectedDate, metricName: "newContacts" },
    { id: "contacts-stale-channel", metricDate: collectedDate, metricName: "newContacts" },
  ];
  const incoming: TestRow[] = [
    { id: "lead-keep", metricDate: historicalDate, metricName: "recentLead" },
    { id: "contacts-total", metricDate: collectedDate, metricName: "newContacts" },
    { id: "contacts-current-channel", metricDate: collectedDate, metricName: "newContacts" },
  ];

  const resultIds = converge(existing, incoming).map((row) => row.id).sort();

  assert.deepEqual(resultIds, [
    "contacts-current-channel",
    "contacts-total",
    "historical-appointments",
    "historical-contacts",
    "lead-keep",
  ]);
  assert.equal(resultIds.includes("lead-stale"), false, "the restated recentLead group still converges");
  assert.equal(
    resultIds.includes("contacts-stale-channel"),
    false,
    "dimensional variants of a restated metric still converge",
  );
});

test("restatement scopes are isolated by date and metric and de-duplicate keep ids", () => {
  const scopes = buildMetricRestatementScopes([
    { id: "same", metricDate: "2026-07-15", metricName: "newContacts" },
    { id: "same", metricDate: "2026-07-15", metricName: "newContacts" },
    { id: "channel", metricDate: "2026-07-15", metricName: "newContacts" },
    { id: "lead", metricDate: "2026-05-10", metricName: "recentLead" },
  ]);

  assert.deepEqual(scopes, [
    {
      metricDate: "2026-07-15",
      metricName: "newContacts",
      keepIds: ["same", "channel"],
    },
    {
      metricDate: "2026-05-10",
      metricName: "recentLead",
      keepIds: ["lead"],
    },
  ]);
});

test("partial source payloads cannot authorize destructive dimensional convergence", () => {
  assert.equal(canDeleteStaleSourcePayload({ status: "ok", quality: "partial", metrics: [] }), false);
  assert.equal(canDeleteStaleSourcePayload({ status: "ok", quality: "PARTIAL", metrics: [] }), false);
  assert.equal(canDeleteStaleSourcePayload({ status: "ok", metrics: [] }, "partial"), false);
  assert.equal(canDeleteStaleSourcePayload({ status: "ok", quality: "ok", metrics: [] }), true);
  assert.equal(canDeleteStaleSourcePayload({ status: "ok", metrics: [] }), true);
});

test("an explicit empty metric restatement deletes only its exact date+metric scope", () => {
  const existing: TestRow[] = [
    { id: "old-session", metricDate: "2026-07-01", metricName: "sessions" },
    { id: "other-metric", metricDate: "2026-07-01", metricName: "totalUsers" },
    { id: "other-day", metricDate: "2026-07-02", metricName: "sessions" },
  ];
  const explicit = [{ metricDate: "2026-07-01", metricName: "sessions" }];

  assert.deepEqual(buildMetricRestatementScopes([], explicit), [{
    metricDate: "2026-07-01",
    metricName: "sessions",
    keepIds: [],
  }]);
  assert.deepEqual(
    converge(existing, [], explicit).map((row) => row.id).sort(),
    ["other-day", "other-metric"],
  );
});

test("provider dates and restatement scopes are exact, bounded and cross-validated", () => {
  const attempted = normalizeAttemptedProviderDates([
    "2026-07-02",
    "2026-07-01",
    "2026-07-02",
  ]);
  assert.deepEqual(attempted, ["2026-07-01", "2026-07-02"]);
  assert.deepEqual(
    normalizeMetricRestatementScopeInputs([
      { metricDate: "2026-07-02", metricName: " sessions " },
      { metricDate: "2026-07-02", metricName: "sessions" },
    ], attempted),
    [{ metricDate: "2026-07-02", metricName: "sessions" }],
  );
  assert.throws(
    () => normalizeMetricRestatementScopeInputs([
      { metricDate: "2026-06-30", metricName: "sessions" },
    ], attempted),
    /present in attemptedDates/,
  );
  assert.throws(
    () => normalizeAttemptedProviderDates(["2026-02-30"]),
    /real YYYY-MM-DD/,
  );
});
