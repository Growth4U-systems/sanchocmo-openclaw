import assert from "node:assert/strict";
import test from "node:test";
import * as scheduleModule from "../metrics-schedule";

const { selectLatestSourceRunRows } =
  (scheduleModule as unknown as { default: typeof scheduleModule }).default ?? scheduleModule;

test("latest source run prefers the newest retry collected on the same metric day", () => {
  const rows = [
    {
      source: "gsc",
      metricDate: "2026-07-13",
      collectedAt: new Date("2026-07-16T08:00:00Z"),
      status: "error",
    },
    {
      source: "gsc",
      metricDate: "2026-07-13",
      collectedAt: new Date("2026-07-16T09:00:00Z"),
      status: "ok",
    },
    {
      source: "ga4",
      metricDate: "2026-07-15",
      collectedAt: new Date("2026-07-16T08:30:00Z"),
      status: "ok",
    },
  ];

  const selected = selectLatestSourceRunRows(rows);
  assert.equal(selected.find((row) => row.source === "gsc")?.status, "ok");
  assert.equal(selected.filter((row) => row.source === "gsc").length, 1);
});
