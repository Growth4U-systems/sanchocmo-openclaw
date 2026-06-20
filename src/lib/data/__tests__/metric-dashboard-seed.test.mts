import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * SAN-296 — `tier` on generated KPIs propagates through the seed path, and the
 * archetypes (marketplace / lead-to-sale) seed the correct North Star purely
 * from the metrics-plan.json definition.
 *
 * `BASE` in src/lib/data/paths.ts reads `process.env.MC_WORKSPACE` at module
 * eval, so we point it at a temp workspace BEFORE importing metric-dashboard
 * (CJS under the tsx runner → dynamic import, per repo convention).
 */

let tmpDir: string;
type Mod = typeof import("../metric-dashboard");
let buildSeedDefinition: Mod["buildSeedDefinition"];
let buildTemplateDefinition: Mod["buildTemplateDefinition"];

function writePlan(slug: string, plan: Record<string, unknown>): void {
  const dir = path.join(tmpDir, "brand", slug);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "metrics-plan.json"), JSON.stringify(plan, null, 2));
}

before(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "san296-"));
  process.env.MC_WORKSPACE = tmpDir;

  // Marketplace: North Star = first transaction / GMV (NOT CPL); tiers present.
  writePlan("mp", {
    archetype: "marketplace",
    activationEvent: "First Transaction",
    primaryKPI: "First Transaction",
    funnel: [
      { step: "Visits", source: "ga4", metric: "sessions", manual: false },
      { step: "Signups", manual: true },
      { step: "First Listing/Search", manual: true },
      { step: "First Transaction", manual: true },
    ],
    kpis: [
      { name: "First Transaction", category: "primary", tier: "primary", manual: true, northStar: true },
      { name: "Sessions", source: "ga4", metric: "sessions", category: "traffic", tier: "leading" },
      { name: "CPL", formula: "meta-ads.spend / ghl.newContacts", category: "efficiency", tier: "lagging", format: "currency" },
    ],
  });

  // Lead-to-sale (Hospital-Capilar-style local variant): North Star =
  // first consultations / appointments. Funnel-rate KPIs stay leading.
  writePlan("hc", {
    archetype: "lead-to-sale",
    subVariant: "local",
    activationEvent: "First Visit/Consultation",
    primaryKPI: "First Visits",
    funnel: [
      { step: "Searches/Visits", source: "ga4", metric: "sessions", manual: false },
      { step: "Calls/Forms", source: "ghl", metric: "newContacts", manual: false },
      { step: "Appointments", source: "ghl", metric: "appointments", manual: false },
      { step: "First Visits", manual: true },
    ],
    kpis: [
      { name: "First Visits", category: "primary", tier: "primary", manual: true, northStar: true },
      { name: "Calls/Forms → Appointments Rate", formula: "ghl.appointments / ghl.newContacts * 100", category: "funnel", tier: "leading", format: "percent" },
      { name: "New Contacts", source: "ghl", metric: "newContacts", category: "crm", tier: "leading" },
    ],
  });

  // Legacy plan with NO tier on its KPIs + one invalid tier — must still seed.
  writePlan("legacy", {
    archetype: "lead-to-sale",
    activationEvent: "Qualified Meeting",
    primaryKPI: "Qualified Meetings",
    funnel: [{ step: "Leads", source: "ghl", metric: "newContacts", manual: false }],
    kpis: [
      { name: "Sessions", source: "ga4", metric: "sessions", category: "traffic" },
      { name: "Weird", source: "ga4", metric: "x", category: "traffic", tier: "bogus" },
    ],
  });

  ({ buildSeedDefinition, buildTemplateDefinition } = await import("../metric-dashboard"));
});

after(() => {
  if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
});

test("tier propagates from metrics-plan.json into definition.plan.kpis", () => {
  const def = buildSeedDefinition("mp");
  const byName = Object.fromEntries(def.plan.kpis.map((k) => [k.name, k]));
  assert.equal(byName["First Transaction"].tier, "primary");
  assert.equal(byName["Sessions"].tier, "leading");
  assert.equal(byName["CPL"].tier, "lagging");
  // All three tier values survive the seed (not dropped by normalizeKpis).
  const tiers = new Set(def.plan.kpis.map((k) => k.tier));
  assert.ok(tiers.has("primary") && tiers.has("leading") && tiers.has("lagging"));
});

test("marketplace seeds a first-transaction / GMV North Star (not CPL)", () => {
  const def = buildSeedDefinition("mp");
  assert.equal(def.archetype, "marketplace");
  // North Star is the primary transaction count, never the cost metric.
  assert.equal(def.northStar.label, "First Transaction");
  assert.equal(def.northStar.kpiRef, "First Transaction");
  assert.notEqual(def.northStar.label, "CPL");
  // The lagging value/cost KPI is present but is NOT the North Star.
  const cpl = def.plan.kpis.find((k) => k.name === "CPL");
  assert.equal(cpl?.tier, "lagging");
});

test("lead-to-sale seeds a consultations/appointments North Star; funnel-rate KPIs stay leading", () => {
  const def = buildSeedDefinition("hc");
  assert.equal(def.archetype, "lead-to-sale");
  assert.equal(def.northStar.label, "First Visits");
  assert.equal(def.northStar.kpiRef, "First Visits");
  const rate = def.plan.kpis.find((k) => k.name.includes("Rate"));
  assert.equal(rate?.tier, "leading");
});

test("legacy plan without tiers still seeds; invalid tier is dropped to undefined", () => {
  const def = buildSeedDefinition("legacy");
  const sessions = def.plan.kpis.find((k) => k.name === "Sessions");
  const weird = def.plan.kpis.find((k) => k.name === "Weird");
  assert.equal(sessions?.tier, undefined);
  assert.equal(weird?.tier, undefined); // "bogus" is not a valid enum → undefined
  // North Star still falls back to the plan's primaryKPI.
  assert.equal(def.northStar.label, "Qualified Meetings");
});

test("template-only marketplace (no plan) keeps the archetype GMV North Star label", () => {
  const def = buildTemplateDefinition("marketplace");
  assert.equal(def.archetype, "marketplace");
  assert.match(def.northStar.label ?? "", /GMV|transacci/i);
});
