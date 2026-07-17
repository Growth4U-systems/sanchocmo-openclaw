import assert from "node:assert/strict";
import { test } from "node:test";
import type { NextApiRequest, NextApiResponse } from "next";
import type { RequestContext } from "../api-middleware";
import {
  isRealMetricDate,
  resolveMetricDateForIngest,
} from "../data/metrics-snapshots";
import { metricsIngestHandler } from "../../pages/api/metrics/ingest";

const admin: RequestContext = {
  isAdmin: true,
  clientSlug: null,
  allowedSlugs: null,
  adminToken: null,
  portalClient: null,
};

function response() {
  let statusCode = 200;
  let payload: unknown;
  const res = {
    setHeader() {
      return this;
    },
    status(code: number) {
      statusCode = code;
      return this;
    },
    json(value: unknown) {
      payload = value;
      return this;
    },
  } as unknown as NextApiResponse;
  return { res, read: () => ({ statusCode, payload }) };
}

async function invoke(body: unknown) {
  const mocked = response();
  await metricsIngestHandler({
    method: "POST",
    query: {},
    headers: {},
    body,
    ctx: admin,
  } as unknown as NextApiRequest, mocked.res);
  return mocked.read();
}

test("metric ingest rejects an impossible explicit snapshot date instead of using today", async () => {
  const result = await invoke({
    slug: "acme",
    date: "2026-02-30",
    source: "ga4",
    metrics: [{ name: "sessions", value: 1 }],
  });

  assert.equal(result.statusCode, 400);
  assert.match(String((result.payload as { error?: string }).error), /real .*calendar date/i);
});

test("metric ingest rejects impossible dates nested in either payload shape", async () => {
  for (const body of [
    {
      slug: "acme",
      date: "2026-02-28",
      source: "ga4",
      metrics: [{ name: "sessions", value: 1, date: "2026-02-30" }],
    },
    {
      slug: "acme",
      date: "2026-02-28",
      sources: {
        ga4: {
          status: "ok",
          metrics: [{ name: "sessions", value: 1, date: "not-a-day" }],
        },
      },
    },
  ]) {
    const result = await invoke(body);
    assert.equal(result.statusCode, 400);
    assert.match(String((result.payload as { error?: string }).error), /metric\.date/i);
  }
});

test("storage date validation checks real calendar days and never falls back for a supplied typo", () => {
  assert.equal(isRealMetricDate("2024-02-29"), true);
  assert.equal(isRealMetricDate("2026-02-30"), false);
  assert.equal(resolveMetricDateForIngest(undefined, "2026-02-28"), "2026-02-28");
  assert.throws(
    () => resolveMetricDateForIngest("2026-02-30", "2026-02-28"),
    /Invalid metric date/,
  );
});

test("metric ingest rejects ambiguous or out-of-attempt restatement evidence", async () => {
  for (const restatedScopes of [
    [{ metricDate: "2026-02-30", metricName: "sessions" }],
    [{ metricDate: "2026-07-01", metricName: "sessions" }],
  ]) {
    const result = await invoke({
      slug: "acme",
      date: "2026-07-03",
      source: "ga4",
      metrics: [],
      attemptedDates: ["2026-07-02"],
      restatedScopes,
    });
    assert.equal(result.statusCode, 400);
    assert.match(
      String((result.payload as { error?: string }).error),
      /(metricDate|attemptedDates)/,
    );
  }
});
