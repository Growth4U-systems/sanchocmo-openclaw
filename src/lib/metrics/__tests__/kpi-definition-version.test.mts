import { test } from "node:test";
import assert from "node:assert/strict";
import * as mod from "../kpi-definition-version";

const version = (mod as unknown as { default: typeof mod }).default ?? mod;

test("packs semantic and dashboard versions without collisions and can split them", () => {
  const seen = new Set<number>();
  for (const semanticVersion of [0, 1, 2, 17]) {
    for (const dashboardVersion of [0, 1, 2, 999, 10_000]) {
      const effective = version.composeMetricKpiDefinitionVersion(
        semanticVersion,
        dashboardVersion,
      );
      assert.equal(seen.has(effective), false);
      seen.add(effective);
      assert.deepEqual(version.splitMetricKpiDefinitionVersion(effective), {
        semanticVersion,
        dashboardVersion,
      });
    }
  }
});

test("rejects out-of-range components instead of truncating into a collision", () => {
  assert.throws(
    () => version.composeMetricKpiDefinitionVersion(2, version.MAX_METRIC_DASHBOARD_VERSION + 1),
    /dashboard version/,
  );
  assert.throws(
    () => version.composeMetricKpiDefinitionVersion(version.MAX_METRIC_SEMANTIC_VERSION + 1, 1),
    /semantic definition version/,
  );
});
