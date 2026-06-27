/**
 * Metric snapshot metadata: demo/seed payloads must carry semantic-compatible
 * provenance/quality flags before they reach metric_snapshots.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import * as mod from "@/lib/metrics/provenance";

const { applyMetricQualityMetadata } =
  (mod as unknown as { default: typeof mod }).default ?? mod;

test("applies inherited seed/demo metadata as __provenance/__quality dimensions", () => {
  const metric = applyMetricQualityMetadata(
    { name: "sessions", value: 42 },
    { provenance: "seed", quality: "demo" },
  );

  assert.deepEqual(metric.dimensions, {
    __provenance: "seed",
    __quality: "demo",
  });
});

test("preserves real metric dimensions while adding seed metadata", () => {
  const dimensions = { channel: "Organic Search" };
  const metric = applyMetricQualityMetadata(
    { name: "sessions", value: 10, dimensions },
    { provenance: "seed", quality: "demo" },
  );

  assert.notEqual(metric.dimensions, dimensions);
  assert.deepEqual(metric.dimensions, {
    channel: "Organic Search",
    __provenance: "seed",
    __quality: "demo",
  });
});

test("metric-level metadata overrides inherited provenance", () => {
  const metric = applyMetricQualityMetadata(
    { name: "sessions", value: 10, provenance: "demo" },
    { provenance: "real", quality: "demo" },
  );

  assert.equal(metric.dimensions?.__provenance, "demo");
  assert.equal(metric.dimensions?.__quality, "demo");
});
