import assert from "node:assert/strict";
import test from "node:test";
import * as surfaceModule from "../surfaces";

const { SURFACES, SURFACE_API_PROVIDERS, SURFACE_MANDATORY_SOURCES } =
  (surfaceModule as unknown as { default: typeof surfaceModule }).default ?? surfaceModule;

test("metrics connection registry advertises only providers with collector and semantic support", () => {
  assert.deepEqual(SURFACE_API_PROVIDERS.product, ["posthog"]);
  assert.deepEqual(SURFACE_API_PROVIDERS.pipeline, ["ghl"]);
  assert.deepEqual(SURFACE_API_PROVIDERS.paid, ["meta_ads", "google_ads"]);
  assert.deepEqual(SURFACE_API_PROVIDERS.email, ["instantly", "lemlist"]);

  const pipeline = SURFACES.find((surface) => surface.key === "pipeline");
  const paid = SURFACES.find((surface) => surface.key === "paid");
  const web = SURFACES.find((surface) => surface.key === "web");
  assert.deepEqual(pipeline?.sources, ["ghl", "go-high-level"]);
  assert.deepEqual(pipeline?.requires.oneOf, ["GoHighLevel"]);
  assert.deepEqual(paid?.sources, ["meta-ads", "meta_ads", "google_ads", "google-ads"]);
  assert.deepEqual(paid?.requires.oneOf, ["Meta Ads", "Google Ads"]);
  assert.deepEqual(web?.requires.mandatory, ["Google Search Console", "Google Analytics 4"]);
  assert.deepEqual(web?.requires.oneOf, []);
  assert.deepEqual(SURFACE_MANDATORY_SOURCES.web, { allOf: ["gsc", "ga4"] });
});
