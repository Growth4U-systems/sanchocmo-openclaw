import { test } from "node:test";
import assert from "node:assert/strict";
import type { NextApiRequest, NextApiResponse } from "next";
import type { RequestContext } from "../api-middleware";
import { metricsTimeseriesHandler } from "../../pages/api/metrics/timeseries";

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

const admin: RequestContext = {
  isAdmin: true,
  clientSlug: null,
  allowedSlugs: null,
  adminToken: null,
  portalClient: null,
};

function request(
  query: NextApiRequest["query"],
  ctx: RequestContext = admin,
): NextApiRequest {
  return {
    method: "GET",
    query: { slug: "acme", ...query },
    headers: {},
    ctx,
  } as unknown as NextApiRequest;
}

async function invoke(
  query: NextApiRequest["query"],
  ctx: RequestContext = admin,
) {
  const mocked = response();
  await metricsTimeseriesHandler(request(query, ctx), mocked.res);
  return mocked.read();
}

test("series and trend reject unpinned heterogeneous metric reads", async () => {
  for (const query of [
    { view: "series" },
    { view: "series", source: "gsc" },
    { view: "trend", metric: "clicks" },
  ]) {
    const result = await invoke(query);
    assert.equal(result.statusCode, 400);
    assert.match(String((result.payload as { error?: string }).error), /source and metric/i);
  }
});

test("read route rejects impossible calendar dates, timestamps and reverse ranges", async () => {
  for (const query of [
    { view: "series", source: "gsc", metric: "clicks", from: "2026-02-30" },
    { view: "series", source: "gsc", metric: "clicks", to: "2026-07-01T00:00:00Z" },
    {
      view: "trend",
      source: "gsc",
      metric: "position",
      from: "2026-07-31",
      to: "2026-07-01",
    },
  ]) {
    const result = await invoke(query);
    assert.equal(result.statusCode, 400);
    assert.match(String((result.payload as { error?: string }).error), /(calendar date|before)/i);
  }
});

test("route rejects unsupported views and malformed preset ranges", async () => {
  const view = await invoke({ view: "everything" });
  assert.equal(view.statusCode, 400);
  assert.match(String((view.payload as { error?: string }).error), /view must be/);

  const range = await invoke({ view: "surfaces", range: "365d" });
  assert.equal(range.statusCode, 400);
  assert.match(String((range.payload as { error?: string }).error), /range must be/);

  const grain = await invoke({
    view: "series",
    source: "gsc",
    metric: "clicks",
    grain: "quarter",
  });
  assert.equal(grain.statusCode, 400);
  assert.match(String((grain.payload as { error?: string }).error), /grain must be/);

  const mixedRange = await invoke({
    view: "surfaces",
    range: "30d",
    from: "9999-01-01",
  });
  assert.equal(mixedRange.statusCode, 400);
  assert.match(String((mixedRange.payload as { error?: string }).error), /before/);
});

test("surface-detail returns an exact tenant-scoped custom range", async () => {
  const result = await invoke({
    view: "surface-detail",
    surface: "paid",
    from: "2026-07-01",
    to: "2026-07-07",
  });
  assert.equal(result.statusCode, 200);
  assert.deepEqual(result.payload, {
    configured: false,
    complete: false,
    completeness: {
      rowsRead: 0,
      groups: 0,
      rowLimit: 250_000,
      groupLimit: 10_000,
      reason: "storage_unconfigured",
    },
    surface: "paid",
    from: "2026-07-01",
    to: "2026-07-07",
    sources: [],
  });

  const restricted: RequestContext = {
    ...admin,
    isAdmin: false,
    allowedSlugs: ["different-tenant"],
  };
  const forbidden = await invoke({
    view: "surface-detail",
    surface: "paid",
    from: "2026-07-01",
    to: "2026-07-07",
  }, restricted);
  assert.equal(forbidden.statusCode, 403);
  assert.deepEqual(forbidden.payload, { error: "Forbidden" });
});

test("surface-detail rejects unknown surfaces and unbounded custom ranges", async () => {
  const unknown = await invoke({
    view: "surface-detail",
    surface: "unknown",
    range: "30d",
  });
  assert.equal(unknown.statusCode, 400);
  assert.match(String((unknown.payload as { error?: string }).error), /Invalid surface/);

  const incomplete = await invoke({
    view: "surface-detail",
    surface: "social",
    from: "2026-07-01",
  });
  assert.equal(incomplete.statusCode, 400);
  assert.match(String((incomplete.payload as { error?: string }).error), /from and to are required/);

  const overlong = await invoke({
    view: "surface-detail",
    surface: "paid",
    from: "2025-01-01",
    to: "2026-07-01",
  });
  assert.equal(overlong.statusCode, 400);
  assert.match(String((overlong.payload as { error?: string }).error), /cannot exceed 366 days/);
});
