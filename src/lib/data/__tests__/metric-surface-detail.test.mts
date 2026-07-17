import { test } from "node:test";
import assert from "node:assert/strict";
import * as detailModule from "../metric-surface-detail";

const {
  buildMetricSurfaceDetail,
  assertMetricSurfaceDetailRange,
  metricSurfaceStoredSources,
} = (detailModule as unknown as { default: typeof detailModule }).default
  ?? detailModule;

type DetailRow = Parameters<typeof buildMetricSurfaceDetail>[2][number];

function row(overrides: Partial<DetailRow> = {}): DetailRow {
  return {
    date: "2026-07-01",
    source: "meta-ads",
    metric: "spend",
    value: 1,
    dimsKey: '[["campaign","Launch"]]',
    dimensions: { campaign: "Launch" },
    ...overrides,
  };
}

test("Paid detail keeps campaign dimensions, exact range and same-dimension weighted rates", () => {
  const launchDims = { campaign: "Launch", __provenance: "provider" };
  const rows: DetailRow[] = [
    row({ metric: "ctr", value: 10, dimensions: launchDims }),
    row({ metric: "impressions", value: 100, dimensions: launchDims }),
    row({ date: "2026-07-02", metric: "ctr", value: 20, dimensions: launchDims }),
    row({ date: "2026-07-02", metric: "impressions", value: 300, dimensions: launchDims }),
    row({
      metric: "ctr",
      value: 90,
      dimsKey: '[["campaign","Other"]]',
      dimensions: { campaign: "Other" },
    }),
    row({
      metric: "impressions",
      value: 1_000,
      dimsKey: '[["campaign","Other"]]',
      dimensions: { campaign: "Other" },
    }),
    row({ date: "2026-06-30", metric: "spend", value: 10_000 }),
    row({ metric: "clicks", value: null }),
    row({ source: "gsc", metric: "clicks", value: 999 }),
  ];

  const detail = buildMetricSurfaceDetail(
    "paid",
    { from: "2026-07-01", to: "2026-07-02" },
    rows,
  );
  assert.equal(detail.configured, true);
  assert.equal(detail.from, "2026-07-01");
  assert.equal(detail.to, "2026-07-02");
  assert.deepEqual(detail.sources.map((source) => source.source), ["meta_ads", "google_ads"]);

  const metrics = detail.sources.find((source) => source.source === "meta_ads")?.metrics ?? [];
  const launchCtr = metrics.find((metric) =>
    metric.metric === "ctr" && metric.dimensions?.campaign === "Launch");
  assert.deepEqual(launchCtr, {
    metric: "ctr",
    value: 17.5,
    aggregation: "avg",
    quality: "ok",
    dimensions: { campaign: "Launch" },
  });
  assert.equal(
    metrics.find((metric) => metric.metric === "ctr" && metric.dimensions?.campaign === "Other")?.value,
    90,
  );
  assert.equal(metrics.some((metric) => metric.metric === "clicks"), false);
  assert.equal(metrics.some((metric) => metric.metric === "spend"), false);
});

test("missing weighted results are omitted while observed dimensional zero remains real", () => {
  const dimsKey = '[["campaign","No delivery"]]';
  const dimensions = { campaign: "No delivery" };
  const detail = buildMetricSurfaceDetail(
    "paid",
    { from: "2026-07-01", to: "2026-07-01" },
    [
      row({ metric: "ctr", value: 99, dimsKey, dimensions }),
      row({ metric: "impressions", value: 0, dimsKey, dimensions }),
    ],
    { asOf: "2026-07-02" },
  );
  const metrics = detail.sources.find((source) => source.source === "meta_ads")?.metrics ?? [];
  assert.equal(metrics.some((metric) => metric.metric === "ctr"), false);
  assert.deepEqual(metrics.find((metric) => metric.metric === "impressions"), {
    metric: "impressions",
    value: 0,
    aggregation: "sum",
    quality: "ok",
    dimensions,
  });
});

test("Metricool detail reduces network and post dimensions with provider quality", () => {
  const networkKey = '[["network","instagram"]]';
  const network = { network: "instagram", __quality: "partial" };
  const postKey = '[["network","instagram"],["postId","p1"],["url","https://example.test/post"]]';
  const detail = buildMetricSurfaceDetail(
    "social",
    { from: "2026-07-01", to: "2026-07-02" },
    [
      row({ source: "metricool", metric: "avgEngagement", value: 5, dimsKey: networkKey, dimensions: network }),
      row({ source: "metricool", metric: "posts", value: 1, dimsKey: networkKey, dimensions: network }),
      row({ source: "metricool", metric: "postsWithEngagement", value: 1, dimsKey: networkKey, dimensions: network }),
      row({ date: "2026-07-02", source: "metricool", metric: "avgEngagement", value: 15, dimsKey: networkKey, dimensions: network }),
      row({ date: "2026-07-02", source: "metricool", metric: "posts", value: 3, dimsKey: networkKey, dimensions: network }),
      row({ date: "2026-07-02", source: "metricool", metric: "postsWithEngagement", value: 3, dimsKey: networkKey, dimensions: network }),
      row({ source: "metricool", metric: "followers", value: 100, dimsKey: networkKey, dimensions: network }),
      row({ date: "2026-07-02", source: "metricool", metric: "followers", value: 110, dimsKey: networkKey, dimensions: network }),
      row({
        source: "metricool",
        metric: "postDetail",
        value: 400,
        dimsKey: postKey,
        dimensions: {
          network: "instagram",
          postId: "p1",
          text: "Old caption",
          url: "https://example.test/post",
        },
      }),
      row({
        date: "2026-07-02",
        source: "metricool",
        metric: "postDetail",
        value: 450,
        dimsKey: postKey,
        dimensions: {
          network: "instagram",
          postId: "p1",
          text: "New caption",
          url: "https://example.test/post",
        },
      }),
      row({
        source: "metricool",
        metric: "postLikes",
        value: 12,
        dimsKey: postKey,
        dimensions: { network: "instagram", postId: "p1", text: "Old caption", url: "https://example.test/post" },
      }),
      row({
        date: "2026-07-02",
        source: "metricool",
        metric: "postLikes",
        value: 15,
        dimsKey: postKey,
        dimensions: { network: "instagram", postId: "p1", text: "New caption", url: "https://example.test/post" },
      }),
      row({
        source: "metricool",
        metric: "reach",
        value: 12,
        dimsKey: networkKey,
        dimensions: { network: "instagram", __quality: "missing" },
      }),
    ],
    { asOf: "2026-07-02" },
  );
  const metrics = detail.sources[0]?.metrics ?? [];
  assert.deepEqual(metrics.find((metric) => metric.metric === "avgEngagement"), {
    metric: "avgEngagement",
    value: 12.5,
    aggregation: "avg",
    quality: "partial",
    dimensions: { network: "instagram" },
  });
  assert.equal(metrics.find((metric) => metric.metric === "posts")?.value, 4);
  assert.equal(metrics.find((metric) => metric.metric === "followers")?.value, 110);
  assert.deepEqual(
    metrics.find((metric) => metric.metric === "postDetail"),
    {
      metric: "postDetail",
      value: 450,
      aggregation: "latest",
      quality: "ok",
      dimensions: {
        network: "instagram",
        postId: "p1",
        text: "New caption",
        url: "https://example.test/post",
      },
    },
  );
  assert.equal(metrics.find((metric) => metric.metric === "postLikes")?.value, 15);
  assert.deepEqual(metrics.find((metric) => metric.metric === "postDetail")?.dimensions, {
    network: "instagram",
    postId: "p1",
    text: "New caption",
    url: "https://example.test/post",
  });
  assert.equal(metrics.some((metric) => metric.metric === "reach"), false);
});

test("Metricool followers uses the latest complete network set and retains partial history only as partial", () => {
  const previousFollowers: DetailRow[] = [
    row({
      source: "metricool",
      metric: "followers",
      value: 100,
      dimensions: { network: "instagram" },
    }),
    row({
      source: "metricool",
      metric: "followers",
      value: 200,
      dimensions: { network: "facebook" },
    }),
  ];
  const complete = buildMetricSurfaceDetail(
    "social",
    { from: "2026-07-01", to: "2026-07-02" },
    [
      ...previousFollowers,
      row({
        date: "2026-07-02",
        source: "metricool",
        metric: "followers",
        value: 110,
        dimensions: { network: "instagram" },
      }),
    ],
    { asOf: "2026-07-02" },
  );
  const currentFollowers = complete.sources[0]?.metrics.filter((metric) =>
    metric.metric === "followers") ?? [];
  assert.deepEqual(
    currentFollowers.map((metric) => metric.dimensions?.network),
    ["instagram"],
  );
  assert.equal(currentFollowers[0]?.value, 110);
  assert.equal(currentFollowers[0]?.quality, "ok");

  const partial = buildMetricSurfaceDetail(
    "social",
    { from: "2026-07-01", to: "2026-07-02" },
    [
      ...previousFollowers,
      row({
        date: "2026-07-02",
        source: "metricool",
        metric: "followers",
        value: null,
        dimsKey: "__scope_evidence__",
        dimensions: { __scopeEvidence: "partial", __quality: "partial" },
      }),
    ],
    { asOf: "2026-07-02" },
  );
  const retainedFollowers = partial.sources[0]?.metrics.filter((metric) =>
    metric.metric === "followers") ?? [];
  assert.deepEqual(
    retainedFollowers.map((metric) => metric.dimensions?.network).sort(),
    ["facebook", "instagram"],
  );
  assert.ok(retainedFollowers.every((metric) => metric.quality === "partial"));
});

test("exact follower scope evidence distinguishes complete-empty, partial and unrelated flow", () => {
  const history: DetailRow[] = [
    row({
      date: "2026-07-15",
      source: "metricool",
      metric: "followers",
      value: 100,
      dimensions: { network: "instagram" },
    }),
    row({
      date: "2026-07-15",
      source: "metricool",
      metric: "followers",
      value: 200,
      dimensions: { network: "facebook" },
    }),
  ];
  const scope = (status: "complete" | "partial"): DetailRow => row({
    date: "2026-07-17",
    source: "metricool",
    metric: "followers",
    value: null,
    dimsKey: "__scope_evidence__",
    dimensions: {
      __scopeEvidence: status,
      ...(status === "partial" ? { __quality: "partial" } : {}),
    },
  });

  const completeEmpty = buildMetricSurfaceDetail(
    "social",
    { from: "2026-07-16", to: "2026-07-16" },
    [...history, scope("complete")],
    { asOf: "2026-07-17" },
  );
  assert.equal(
    completeEmpty.sources[0]?.metrics.some((metric) => metric.metric === "followers"),
    false,
  );

  const partial = buildMetricSurfaceDetail(
    "social",
    { from: "2026-07-16", to: "2026-07-16" },
    [
      ...history,
      row({
        date: "2026-07-17",
        source: "metricool",
        metric: "followers",
        value: 110,
        dimensions: { network: "instagram", __quality: "partial" },
      }),
      scope("partial"),
    ],
    { asOf: "2026-07-17" },
  );
  const partialFollowers = partial.sources[0]?.metrics.filter((metric) =>
    metric.metric === "followers") ?? [];
  assert.deepEqual(
    partialFollowers.map((metric) => metric.dimensions?.network).sort(),
    ["facebook", "instagram"],
  );
  assert.ok(partialFollowers.every((metric) =>
    metric.quality === "partial" || metric.quality === "stale"));

  const unrelatedFlow = buildMetricSurfaceDetail(
    "social",
    { from: "2026-07-16", to: "2026-07-16" },
    [
      ...history,
      row({
        date: "2026-07-17",
        source: "metricool",
        metric: "posts",
        value: 3,
        dimensions: { network: "instagram" },
      }),
    ],
    { asOf: "2026-07-17" },
  );
  assert.equal(
    unrelatedFlow.sources[0]?.metrics.filter((metric) =>
      metric.metric === "followers").length,
    2,
  );
});

test("canonical source aliases are deduped by newest evidence and returned once", () => {
  const detail = buildMetricSurfaceDetail(
    "paid",
    { from: "2026-07-01", to: "2026-07-02" },
    [
      row({
        value: 10,
        dimensions: { campaign: "Old", campaignId: "c1" },
        collectedAt: "2026-07-02T09:00:00.000Z",
      }),
      row({
        source: "meta_ads",
        value: 20,
        dimensions: { campaign: "New", campaignId: "c1" },
        collectedAt: "2026-07-02T10:00:00.000Z",
      }),
      row({
        date: "2026-07-02",
        source: "META-ADS",
        value: 5,
        dimensions: { campaign: "Newest", campaignId: "c1" },
        collectedAt: "2026-07-03T10:00:00.000Z",
      }),
    ],
    { asOf: "2026-07-02" },
  );
  const meta = detail.sources.find((source) => source.source === "meta_ads");
  assert.equal(meta?.metrics.find((metric) => metric.metric === "spend")?.value, 25);
  assert.equal(
    meta?.metrics.find((metric) => metric.metric === "spend")?.dimensions?.campaign,
    "Newest",
  );
  assert.deepEqual(meta?.coverage.missingDates, []);
  assert.equal(detail.sources.filter((source) => source.source === "meta_ads").length, 1);

  const stored = metricSurfaceStoredSources(["meta_ads"]);
  for (const alias of ["meta", "meta-ads", "meta_ads", "metaads"]) {
    assert.equal(stored.includes(alias), true, `missing stored alias ${alias}`);
  }
});

test("GHL pipeline and stage renames keep one logical latest snapshot with newest display labels", () => {
  const detail = buildMetricSurfaceDetail(
    "pipeline",
    { from: "2026-07-01", to: "2026-07-02" },
    [
      row({
        source: "go-high-level",
        metric: "pipeline",
        value: 8,
        dimensions: { pipelineId: "p1", pipelineName: "Ventas antiguas" },
        collectedAt: "2026-07-02T08:00:00.000Z",
      }),
      row({
        date: "2026-07-02",
        source: "ghl",
        metric: "pipeline",
        value: 9,
        dimensions: { pipelineId: "p1", pipelineName: "Ventas nuevas" },
        collectedAt: "2026-07-03T08:00:00.000Z",
      }),
      row({
        source: "go-high-level",
        metric: "pipelineStage",
        value: 5,
        dimensions: {
          pipelineId: "p1",
          pipelineName: "Ventas antiguas",
          stageId: "s1",
          stageName: "Calificado",
          stageOrder: 1,
        },
        collectedAt: "2026-07-02T08:00:00.000Z",
      }),
      row({
        date: "2026-07-02",
        source: "ghl",
        metric: "pipelineStage",
        value: 7,
        dimensions: {
          pipelineId: "p1",
          pipelineName: "Ventas nuevas",
          stageId: "s1",
          stageName: "SQL",
          stageOrder: 2,
        },
        collectedAt: "2026-07-03T08:00:00.000Z",
      }),
    ],
  );
  const metrics = detail.sources[0]?.metrics ?? [];
  const pipelines = metrics.filter((metric) => metric.metric === "pipeline");
  const stages = metrics.filter((metric) => metric.metric === "pipelineStage");
  assert.equal(pipelines.length, 1);
  assert.equal(pipelines[0]?.value, 9);
  assert.equal(pipelines[0]?.dimensions?.pipelineName, "Ventas nuevas");
  assert.equal(stages.length, 1);
  assert.equal(stages[0]?.value, 7);
  assert.deepEqual(stages[0]?.dimensions, {
    pipelineId: "p1",
    pipelineName: "Ventas nuevas",
    stageId: "s1",
    stageName: "SQL",
    stageOrder: "2",
  });
});

test("a complete latest GHL snapshot removes absent pipelines and stages but keeps observed zero stages", () => {
  const detail = buildMetricSurfaceDetail(
    "pipeline",
    { from: "2026-07-01", to: "2026-07-02" },
    [
      row({
        source: "ghl",
        metric: "pipeline",
        value: 4,
        dimensions: { pipelineId: "p1", pipelineName: "Ventas" },
      }),
      row({
        source: "ghl",
        metric: "pipeline",
        value: 2,
        dimensions: { pipelineId: "p2", pipelineName: "Renovaciones" },
      }),
      row({
        source: "ghl",
        metric: "pipelineStage",
        value: 3,
        dimensions: {
          pipelineId: "p1",
          pipelineName: "Ventas",
          stageId: "s1",
          stageName: "Nuevo",
          stageOrder: 1,
        },
      }),
      row({
        source: "ghl",
        metric: "pipelineStage",
        value: 1,
        dimensions: {
          pipelineId: "p1",
          pipelineName: "Ventas",
          stageId: "s2",
          stageName: "Eliminado",
          stageOrder: 2,
        },
      }),
      row({
        source: "ghl",
        metric: "pipelineStage",
        value: 2,
        dimensions: {
          pipelineId: "p2",
          pipelineName: "Renovaciones",
          stageId: "s3",
          stageName: "Eliminado con pipeline",
          stageOrder: 1,
        },
      }),
      row({
        date: "2026-07-02",
        source: "ghl",
        metric: "pipeline",
        value: 0,
        dimensions: { pipelineId: "p1", pipelineName: "Ventas" },
      }),
      row({
        date: "2026-07-02",
        source: "ghl",
        metric: "pipelineStage",
        value: 0,
        dimensions: {
          pipelineId: "p1",
          pipelineName: "Ventas",
          stageId: "s1",
          stageName: "Nuevo",
          stageOrder: 1,
        },
      }),
    ],
    { asOf: "2026-07-02" },
  );

  const metrics = detail.sources[0]?.metrics ?? [];
  const pipelines = metrics.filter((metric) => metric.metric === "pipeline");
  const stages = metrics.filter((metric) => metric.metric === "pipelineStage");
  assert.deepEqual(pipelines.map((metric) => metric.dimensions?.pipelineId), ["p1"]);
  assert.equal(pipelines[0]?.value, 0);
  assert.deepEqual(stages.map((metric) => metric.dimensions?.stageId), ["s1"]);
  assert.equal(stages[0]?.value, 0);
  assert.equal(stages[0]?.quality, "ok");
});

test("partial or failed latest GHL evidence retains the previous snapshot set with degraded quality", () => {
  const previousSet: DetailRow[] = [
    row({
      source: "ghl",
      metric: "pipeline",
      value: 4,
      dimensions: { pipelineId: "p1", pipelineName: "Ventas" },
    }),
    row({
      source: "ghl",
      metric: "pipelineStage",
      value: 4,
      dimensions: {
        pipelineId: "p1",
        pipelineName: "Ventas",
        stageId: "s1",
        stageName: "Nuevo",
        stageOrder: 1,
      },
    }),
  ];
  const partial = buildMetricSurfaceDetail(
    "pipeline",
    { from: "2026-07-01", to: "2026-07-02" },
    [
      ...previousSet,
      row({
        date: "2026-07-02",
        source: "ghl",
        metric: "pipeline",
        value: null,
        dimsKey: "__scope_evidence__",
        dimensions: { __scopeEvidence: "partial", __quality: "partial" },
      }),
      row({
        date: "2026-07-02",
        source: "ghl",
        metric: "pipelineStage",
        value: null,
        dimsKey: "__scope_evidence__",
        dimensions: { __scopeEvidence: "partial", __quality: "partial" },
      }),
    ],
    { asOf: "2026-07-02" },
  );
  const partialSet = partial.sources[0]?.metrics.filter((metric) =>
    metric.metric === "pipeline" || metric.metric === "pipelineStage") ?? [];
  assert.equal(partialSet.length, 2);
  assert.ok(partialSet.every((metric) => metric.quality === "partial"));

  const failed = buildMetricSurfaceDetail(
    "pipeline",
    { from: "2026-07-01", to: "2026-07-02" },
    previousSet,
    {
      asOf: "2026-07-03",
      runs: [
        { source: "ghl", metricDate: "2026-07-03", status: "error", rowCount: 0 },
      ],
    },
  );
  const staleSet = failed.sources[0]?.metrics.filter((metric) =>
    metric.metric === "pipeline" || metric.metric === "pipelineStage") ?? [];
  assert.equal(staleSet.length, 2);
  assert.ok(staleSet.every((metric) => metric.quality === "stale"));
});

test("GHL exact family evidence retains a prior set on partial and clears it on complete-empty", () => {
  const previousSet: DetailRow[] = [
    row({
      date: "2026-07-15",
      source: "ghl",
      metric: "pipeline",
      value: 4,
      dimensions: { pipelineId: "p1", pipelineName: "Ventas" },
    }),
    row({
      date: "2026-07-15",
      source: "ghl",
      metric: "pipelineStage",
      value: 4,
      dimensions: {
        pipelineId: "p1",
        pipelineName: "Ventas",
        stageId: "s1",
        stageName: "Nuevo",
      },
    }),
  ];
  const evidence = (
    metric: "pipeline" | "pipelineStage",
    status: "complete" | "partial",
  ): DetailRow => row({
    date: "2026-07-17",
    source: "ghl",
    metric,
    value: null,
    dimsKey: "__scope_evidence__",
    dimensions: {
      __scopeEvidence: status,
      ...(status === "partial" ? { __quality: "partial" } : {}),
    },
  });

  const partial = buildMetricSurfaceDetail(
    "pipeline",
    { from: "2026-07-16", to: "2026-07-16" },
    [
      ...previousSet,
      evidence("pipeline", "partial"),
      evidence("pipelineStage", "partial"),
      row({
        date: "2026-07-17",
        source: "ghl",
        metric: "newContacts",
        value: 9,
      }),
    ],
    { asOf: "2026-07-17" },
  );
  const retained = partial.sources[0]?.metrics.filter((metric) =>
    metric.metric === "pipeline" || metric.metric === "pipelineStage") ?? [];
  assert.equal(retained.length, 2);
  assert.ok(retained.every((metric) =>
    metric.quality === "partial" || metric.quality === "stale"));

  const completeEmpty = buildMetricSurfaceDetail(
    "pipeline",
    { from: "2026-07-16", to: "2026-07-16" },
    [
      ...previousSet,
      evidence("pipeline", "complete"),
      evidence("pipelineStage", "complete"),
    ],
    { asOf: "2026-07-17" },
  );
  assert.equal(
    completeEmpty.sources[0]?.metrics.some((metric) =>
      metric.metric === "pipeline" || metric.metric === "pipelineStage"),
    false,
  );
});

test("1d surface panels use as-of for stocks and keep flow metrics inside yesterday", () => {
  const web = buildMetricSurfaceDetail(
    "web",
    { from: "2026-07-16", to: "2026-07-16" },
    [
      row({
        date: "2026-07-09",
        source: "pagespeed",
        metric: "performance_mobile",
        value: 73,
        dimsKey: "",
        dimensions: null,
      }),
      row({ date: "2026-07-17", source: "ga4", metric: "sessions", value: 999 }),
    ],
    { asOf: "2026-07-17" },
  );
  const pageSpeed = web.sources.find((source) => source.source === "pagespeed");
  const ga4 = web.sources.find((source) => source.source === "ga4");
  assert.equal(pageSpeed?.metrics[0]?.value, 73);
  assert.equal(pageSpeed?.metrics[0]?.quality, "stale");
  assert.equal(ga4?.metrics.some((metric) => metric.metric === "sessions"), false);

  const pipeline = buildMetricSurfaceDetail(
    "pipeline",
    { from: "2026-07-16", to: "2026-07-16" },
    [
      row({ date: "2026-07-17", source: "ghl", metric: "totalContacts", value: 321 }),
      row({ date: "2026-07-17", source: "ghl", metric: "newContacts", value: 999 }),
    ],
    { asOf: "2026-07-17" },
  );
  const ghl = pipeline.sources.find((source) => source.source === "ghl");
  assert.equal(ghl?.metrics.find((metric) => metric.metric === "totalContacts")?.value, 321);
  assert.equal(ghl?.metrics.find((metric) => metric.metric === "totalContacts")?.quality, "ok");
  assert.equal(ghl?.metrics.some((metric) => metric.metric === "newContacts"), false);
});

test("paid stable IDs survive label renames while real placement breakdowns stay separate", () => {
  const dayOne = "2026-07-02T08:00:00.000Z";
  const dayTwo = "2026-07-03T08:00:00.000Z";
  const detail = buildMetricSurfaceDetail(
    "paid",
    { from: "2026-07-01", to: "2026-07-02" },
    [
      row({ metric: "spend", value: 10, dimensions: { campaign: "Old campaign", campaignId: "c1" }, collectedAt: dayOne }),
      row({ date: "2026-07-02", metric: "spend", value: 20, dimensions: { campaign: "New campaign", campaignId: "c1" }, collectedAt: dayTwo }),
      row({ metric: "clicks", value: 1, dimensions: { campaign: "Old campaign", campaignId: "c1", adset: "Old set", adsetId: "as1" }, collectedAt: dayOne }),
      row({ date: "2026-07-02", metric: "clicks", value: 2, dimensions: { campaign: "New campaign", campaignId: "c1", adset: "New set", adsetId: "as1" }, collectedAt: dayTwo }),
      row({ metric: "impressions", value: 100, dimensions: { campaign: "Old campaign", campaignId: "c1", adset: "Old set", adsetId: "as1", ad: "Old ad", adId: "a1" }, collectedAt: dayOne }),
      row({ date: "2026-07-02", metric: "impressions", value: 200, dimensions: { campaign: "New campaign", campaignId: "c1", adset: "New set", adsetId: "as1", ad: "New ad", adId: "a1" }, collectedAt: dayTwo }),
      row({ metric: "clicks", value: 3, dimensions: { placement: "facebook · feed" } }),
      row({ metric: "clicks", value: 4, dimensions: { placement: "instagram · story" } }),
      row({ source: "google-ads", metric: "spend", value: 5, dimensions: { campaign: "Old search", campaignId: "g1", channelType: "SEARCH" }, collectedAt: dayOne }),
      row({ date: "2026-07-02", source: "google_ads", metric: "spend", value: 7, dimensions: { campaign: "New search", campaignId: "g1", channelType: "SEARCH" }, collectedAt: dayTwo }),
    ],
  );
  const meta = detail.sources.find((source) => source.source === "meta_ads")?.metrics ?? [];
  const campaign = meta.filter((metric) => metric.metric === "spend" && metric.dimensions?.campaignId === "c1");
  const adset = meta.filter((metric) => metric.metric === "clicks" && metric.dimensions?.adsetId === "as1");
  const ad = meta.filter((metric) => metric.metric === "impressions" && metric.dimensions?.adId === "a1");
  assert.equal(campaign.length, 1);
  assert.equal(campaign[0]?.value, 30);
  assert.equal(campaign[0]?.dimensions?.campaign, "New campaign");
  assert.equal(adset.length, 1);
  assert.equal(adset[0]?.value, 3);
  assert.equal(adset[0]?.dimensions?.adset, "New set");
  assert.equal(ad.length, 1);
  assert.equal(ad[0]?.value, 300);
  assert.equal(ad[0]?.dimensions?.ad, "New ad");
  assert.equal(meta.filter((metric) => metric.dimensions?.placement).length, 2);

  const google = detail.sources.find((source) => source.source === "google_ads")?.metrics ?? [];
  assert.equal(google.length, 1);
  assert.equal(google[0]?.value, 12);
  assert.equal(google[0]?.dimensions?.campaign, "New search");
});

test("one observed day in a 30-day daily range is partial and absent sources remain visible", () => {
  const detail = buildMetricSurfaceDetail(
    "paid",
    { from: "2026-06-01", to: "2026-06-30" },
    [row({
      date: "2026-06-01",
      source: "google-ads",
      value: 42,
      dimsKey: "",
      dimensions: null,
    })],
    {
      runs: [
        // An ordinary ok ledger row is collection-day evidence, not proof that
        // its naively lagged provider day was actually present in a backfill.
        { source: "google_ads", metricDate: "2026-06-03", status: "ok", rowCount: 20 },
        { source: "google-ads", metricDate: "2026-06-04", status: "error", rowCount: 0 },
      ],
    },
  );
  const google = detail.sources.find((source) => source.source === "google_ads");
  assert.equal(google?.coverage.expectedDates.length, 30);
  assert.equal(google?.coverage.observedDates.length, 1);
  assert.equal(google?.coverage.missingDates.length, 29);
  assert.equal(google?.coverage.ratio, 1 / 30);
  assert.deepEqual(google?.coverage.failedDates, ["2026-06-03"]);
  assert.equal(google?.metrics.find((metric) => metric.metric === "spend")?.quality, "partial");

  const meta = detail.sources.find((source) => source.source === "meta_ads");
  assert.deepEqual(meta?.metrics, []);
  assert.equal(meta?.coverage.missingDates.length, 30);
});

test("exact provider evidence prevents a historical backfill failure from being projected by D-lag", () => {
  const collectedAt = "2026-07-17T08:00:00.000Z";
  const detail = buildMetricSurfaceDetail(
    "paid",
    { from: "2026-07-01", to: "2026-07-16" },
    [row({
      date: "2026-07-01",
      source: "meta-ads",
      metric: "spend",
      value: 42,
      dimsKey: "",
      dimensions: null,
    })],
    {
      runs: [
        {
          source: "meta-ads",
          metricDate: "2026-07-17",
          status: "error",
          dateBasis: "collection",
          rowCount: 0,
          collectedAt,
        },
        {
          source: "meta_ads",
          metricDate: "2026-07-03",
          status: "error",
          dateBasis: "provider",
          rowCount: 0,
          collectedAt,
        },
      ],
    },
  );
  const meta = detail.sources.find((source) => source.source === "meta_ads");
  assert.deepEqual(meta?.coverage.failedDates, ["2026-07-03"]);
  assert.equal(meta?.coverage.failedDates.includes("2026-07-16"), false);
  assert.equal(meta?.metrics.find((metric) => metric.metric === "spend")?.quality, "partial");
});

test("an exact partial provider run degrades retained surface evidence", () => {
  const detail = buildMetricSurfaceDetail(
    "paid",
    { from: "2026-07-01", to: "2026-07-01" },
    [row({ dimsKey: "", dimensions: null, value: 42 })],
    {
      runs: [{
        source: "meta-ads",
        metricDate: "2026-07-01",
        status: "partial",
        dateBasis: "provider",
        rowCount: 1,
        collectedAt: "2026-07-02T08:00:00.000Z",
      }],
    },
  );
  const meta = detail.sources.find((source) => source.source === "meta_ads");
  assert.deepEqual(meta?.coverage.failedDates, ["2026-07-01"]);
  assert.equal(meta?.metrics.find((metric) => metric.metric === "spend")?.quality, "partial");
});

test("provider publication lag is pending, never an inevitable missing gap", () => {
  const detail = buildMetricSurfaceDetail(
    "web",
    { from: "2026-07-01", to: "2026-07-16" },
    [],
    { asOf: "2026-07-17" },
  );
  const gsc = detail.sources.find((source) => source.source === "gsc");

  assert.equal(gsc?.coverage.asOf, "2026-07-17");
  assert.equal(gsc?.coverage.availableThrough, "2026-07-14");
  assert.equal(gsc?.coverage.latestExpectedDate, "2026-07-14");
  assert.deepEqual(gsc?.coverage.pendingDates, ["2026-07-15", "2026-07-16"]);
  assert.equal(gsc?.coverage.missingDates.includes("2026-07-15"), false);
  assert.equal(gsc?.coverage.missingDates.includes("2026-07-16"), false);
});

test("complete-empty scope is observed coverage while partial scope remains failed", () => {
  const scopeRow = (status: "complete" | "partial"): DetailRow => row({
    date: "2026-07-16",
    source: "metricool",
    metric: "followers",
    value: null,
    dimsKey: "__scope_evidence__",
    dimensions: {
      __scopeEvidence: status,
      ...(status === "partial" ? { __quality: "partial" } : {}),
    },
  });
  const complete = buildMetricSurfaceDetail(
    "social",
    { from: "2026-07-16", to: "2026-07-16" },
    [scopeRow("complete")],
    {
      asOf: "2026-07-17",
      runs: [{
        source: "metricool",
        metricDate: "2026-07-16",
        status: "ok",
        dateBasis: "provider",
        rowCount: 0,
      }],
    },
  );
  const completeCoverage = complete.sources[0]?.coverage;
  assert.deepEqual(completeCoverage?.observedDates, ["2026-07-16"]);
  assert.deepEqual(completeCoverage?.missingDates, []);
  assert.deepEqual(completeCoverage?.failedDates, []);
  assert.equal(completeCoverage?.ratio, 1);

  const partial = buildMetricSurfaceDetail(
    "social",
    { from: "2026-07-16", to: "2026-07-16" },
    [scopeRow("partial")],
    {
      asOf: "2026-07-17",
      runs: [{
        source: "metricool",
        metricDate: "2026-07-16",
        status: "partial",
        dateBasis: "provider",
        rowCount: 0,
      }],
    },
  );
  const partialCoverage = partial.sources[0]?.coverage;
  assert.deepEqual(partialCoverage?.observedDates, []);
  assert.deepEqual(partialCoverage?.missingDates, ["2026-07-16"]);
  assert.deepEqual(partialCoverage?.failedDates, ["2026-07-16"]);
  assert.equal(partialCoverage?.ratio, 0);
});

test("PageSpeed weekly coverage expects only weekly provider days", () => {
  const expectedDates = ["2026-07-05", "2026-07-12", "2026-07-19", "2026-07-26"];
  const detail = buildMetricSurfaceDetail(
    "web",
    { from: "2026-07-01", to: "2026-07-31" },
    expectedDates.map((date, index) => row({
      date,
      source: "pagespeed",
      metric: "performance_mobile",
      value: 70 + index,
      dimsKey: "",
      dimensions: null,
    })),
    { asOf: "2026-08-02" },
  );
  const pagespeed = detail.sources.find((source) => source.source === "pagespeed");
  assert.equal(pagespeed?.coverage.cadence, "weekly");
  assert.deepEqual(pagespeed?.coverage.expectedDates, expectedDates);
  assert.deepEqual(pagespeed?.coverage.missingDates, []);
  assert.equal(pagespeed?.metrics[0]?.value, 73);
  assert.equal(pagespeed?.metrics[0]?.quality, "ok");
});

test("latest state becomes stale on a missed due day, but an old post stays valid with current source evidence", () => {
  const pipeline = buildMetricSurfaceDetail(
    "pipeline",
    { from: "2026-07-01", to: "2026-07-02" },
    [row({
      source: "go-high-level",
      metric: "pipeline",
      value: 8,
      dimsKey: '[["stage","open"]]',
      dimensions: { stage: "open" },
    })],
    { asOf: "2026-07-03" },
  );
  assert.equal(pipeline.sources[0]?.metrics[0]?.aggregation, "latest");
  assert.equal(pipeline.sources[0]?.metrics[0]?.quality, "stale");

  const social = buildMetricSurfaceDetail(
    "social",
    { from: "2026-07-01", to: "2026-07-02" },
    [
      row({
        source: "metricool",
        metric: "postDetail",
        value: 100,
        dimsKey: '[["network","instagram"],["postId","p1"]]',
        dimensions: { network: "instagram", postId: "p1" },
      }),
      row({ source: "metricool", metric: "posts", value: 1, dimensions: { network: "instagram" } }),
      row({ date: "2026-07-02", source: "metricool", metric: "posts", value: 0, dimensions: { network: "instagram" } }),
    ],
    { asOf: "2026-07-02" },
  );
  const post = social.sources[0]?.metrics.find((metric) => metric.metric === "postDetail");
  assert.equal(post?.aggregation, "latest");
  assert.equal(post?.quality, "ok");
});

test("GA4 page rates use topPageSessions, not pageviews, across days", () => {
  const dimsKey = '[["page","/pricing"]]';
  const dimensions = { page: "/pricing" };
  const detail = buildMetricSurfaceDetail(
    "web",
    { from: "2026-07-01", to: "2026-07-02" },
    [
      row({ source: "ga4", metric: "topPageEngagementRate", value: 10, dimsKey, dimensions }),
      row({ source: "ga4", metric: "topPage", value: 100, dimsKey, dimensions }),
      row({ source: "ga4", metric: "topPageSessions", value: 300, dimsKey, dimensions }),
      row({ date: "2026-07-02", source: "google-analytics", metric: "topPageEngagementRate", value: 20, dimsKey, dimensions }),
      row({ date: "2026-07-02", source: "google-analytics", metric: "topPage", value: 300, dimsKey, dimensions }),
      row({ date: "2026-07-02", source: "google-analytics", metric: "topPageSessions", value: 100, dimsKey, dimensions }),
    ],
  );
  const ga4 = detail.sources.find((source) => source.source === "ga4");
  assert.equal(ga4?.metrics.find((metric) => metric.metric === "topPageEngagementRate")?.value, 12.5);
});

test("PostHog funnel steps aggregate by stable step identity while displaying the latest order", () => {
  const detail = buildMetricSurfaceDetail(
    "product",
    { from: "2026-07-01", to: "2026-07-02" },
    [
      row({
        source: "posthog",
        metric: "funnel_step_reached",
        value: 10,
        dimensions: { step: "signup", order: 1, expectedSteps: 3 },
      }),
      row({
        date: "2026-07-02",
        source: "posthog",
        metric: "funnel_step_reached",
        value: 15,
        dimensions: { step: "signup", order: 2, expectedSteps: 4 },
      }),
    ],
  );
  const steps = detail.sources[0]?.metrics.filter((metric) =>
    metric.metric === "funnel_step_reached") ?? [];
  assert.deepEqual(steps, [{
    metric: "funnel_step_reached",
    value: 25,
    aggregation: "sum",
    quality: "ok",
    dimensions: { step: "signup", order: "2", expectedSteps: "4" },
  }]);
});

test("more than 20k Meta rows are reduced completely instead of failing the request", () => {
  const rows = Array.from({ length: 20_001 }, (_, index) => row({
    source: index % 2 ? "meta-ads" : "meta_ads",
    value: index,
    collectedAt: new Date(Date.UTC(2026, 6, 2) + index).toISOString(),
  }));
  const detail = buildMetricSurfaceDetail(
    "paid",
    { from: "2026-07-01", to: "2026-07-01" },
    rows,
  );
  assert.equal(detail.complete, true);
  assert.equal(detail.completeness.rowsRead, 20_001);
  assert.equal(
    detail.sources
      .find((source) => source.source === "meta_ads")
      ?.metrics.find((metric) => metric.metric === "spend")?.value,
    20_000,
  );
});

test("surface detail rejects unknown surfaces and overlong ranges", () => {
  assert.throws(
    () => buildMetricSurfaceDetail(
      "unknown" as "paid",
      { from: "2026-07-01", to: "2026-07-02" },
      [],
    ),
    /Unknown metrics surface/,
  );
  assert.throws(
    () => assertMetricSurfaceDetailRange({
      from: "2025-01-01",
      to: "2026-07-02",
    }),
    /cannot exceed 366 days/,
  );
});
