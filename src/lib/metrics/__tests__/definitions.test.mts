import { test } from "node:test";
import assert from "node:assert/strict";
import * as definitionsMod from "../definitions";
import * as typesMod from "../semantic-types";

const definitions = (definitionsMod as unknown as { default: typeof definitionsMod }).default ?? definitionsMod;
const types = (typesMod as unknown as { default: typeof typesMod }).default ?? typesMod;

const {
  DASHBOARD_METRIC_GROUPS,
  METRIC_DEFINITIONS,
  REQUIRED_DASHBOARD_METRIC_IDS,
  getMetricDefinition,
  metricDefinitionsForArea,
  metricDefinitionsForFamily,
  validateMetricDefinitions,
} = definitions;
const { DASHBOARD_AREAS, METRIC_FAMILIES } = types;

test("metric definitions validate and cover every required dashboard display id", () => {
  const errors = validateMetricDefinitions();
  assert.deepEqual(errors, []);

  const ids = new Set(METRIC_DEFINITIONS.map((definition) => definition.id));
  for (const id of REQUIRED_DASHBOARD_METRIC_IDS) {
    assert.ok(ids.has(id), `missing required metric definition: ${id}`);
  }
  assert.equal(ids.size, METRIC_DEFINITIONS.length, "metric definition ids must be unique");
});

test("catalog spans all top-level dashboard areas and metric families", () => {
  for (const area of DASHBOARD_AREAS) {
    assert.ok(metricDefinitionsForArea(area).length > 0, `missing area ${area}`);
  }

  for (const family of METRIC_FAMILIES) {
    assert.ok(metricDefinitionsForFamily(family).length > 0, `missing family ${family}`);
  }

  assert.deepEqual(
    DASHBOARD_METRIC_GROUPS.map((group) => group.id),
    [
      "overview",
      "web",
      "paid",
      "reputation",
      "pipeline",
      "product",
      "social",
      "outbound_icp",
      "partnerships",
      "channels",
      "conversion",
      "trends",
    ],
  );
});

test("important mockup metrics point at semantic/raw sources without demo provenance", () => {
  const semanticIds = [
    "overview.unified_funnel",
    "channels.stage_matrix",
    "conversion.velocity",
    "trends.annotations",
    "outbound.partnerships.cpa_real",
  ];

  for (const id of semanticIds) {
    const definition = getMetricDefinition(id);
    assert.ok(definition, `definition missing: ${id}`);
    assert.ok(definition.sources.length > 0, `definition has no sources: ${id}`);
    assert.ok(
      definition.sources.some((source) => source.source.startsWith("metric_") || source.source === "ghl" || source.source === "yalc"),
      `definition should reference semantic/raw sources: ${id}`,
    );
    assert.equal(definition.sources.some((source) => /demo|representative|fake/i.test(source.source)), false);
  }
});

test("validator catches unstable ids, invalid dimensions and unknown dependencies", () => {
  const base = getMetricDefinition("web.gsc_clicks");
  assert.ok(base);

  const errors = validateMetricDefinitions([
    {
      ...base,
      id: "Web Bad Id",
      requiredDimensions: ["bad-dimension"],
      dependsOn: ["missing.metric"],
    },
  ]);

  assert.ok(errors.some((error) => error.field === "id"));
  assert.ok(errors.some((error) => error.field === "requiredDimensions"));
  assert.ok(errors.some((error) => error.field === "dependsOn"));
});
