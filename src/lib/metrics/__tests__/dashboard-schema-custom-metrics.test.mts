import { test } from "node:test";
import assert from "node:assert/strict";
import * as mod from "../dashboard-schema";

const schema = (mod as unknown as { default: typeof mod }).default ?? mod;

function definition(customMetrics: Array<Record<string, unknown>>) {
  return {
    archetype: "lead-to-sale",
    northStar: {},
    tabs: [],
    surfaces: [],
    plan: { funnel: [], kpis: [] },
    customSurfaces: [],
    customMetrics,
  };
}

test("dashboard definition accepts a parsed hyphenated-source formula", () => {
  const parsed = schema.parseDashboardDefinition(definition([
    {
      id: "cpl",
      label: "Coste por lead",
      formula: "meta-ads.spend / ghl.newContacts",
      format: "currency",
      tier: "diagnostic",
      surface: "paid",
    },
  ]));
  assert.equal(parsed.customMetrics[0]?.formula, "meta-ads.spend / ghl.newContacts");
});

test("dashboard definition reports invalid formula syntax and duplicate ids", () => {
  assert.throws(
    () => schema.parseDashboardDefinition(definition([
      { id: "cpl", label: "CPL", formula: "process.exit(1)" },
    ])),
    /Expected a source\.metric reference|Invalid metrics|formula/i,
  );
  assert.throws(
    () => schema.parseDashboardDefinition(definition([
      { id: "cpl", label: "CPL", formula: "meta-ads.spend" },
      { id: "cpl", label: "CPL 2", formula: "google-ads.spend" },
    ])),
    /Duplicate custom metric id/,
  );
});
