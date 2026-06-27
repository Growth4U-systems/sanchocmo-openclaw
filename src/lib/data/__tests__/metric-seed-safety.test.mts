import { test } from "node:test";
import assert from "node:assert/strict";
import * as mod from "../../../../scripts/metrics/seed-safety";

const { metricSeedProductionReasons } =
  (mod as unknown as { default: typeof mod }).default ?? mod;

test("metric seed safety allows local and staging targets", () => {
  assert.deepEqual(metricSeedProductionReasons({
    NODE_ENV: "development",
    VERCEL_ENV: "preview",
    DATABASE_URL: "postgres://user:pass@staging-db.example.com/app",
  }), []);
});

test("metric seed safety detects production-like environments", () => {
  assert.deepEqual(metricSeedProductionReasons({
    NODE_ENV: "production",
    DATABASE_URL: "postgres://user:pass@db.example.com/app",
  }), ["NODE_ENV=production"]);
});

test("metric seed safety detects production-like database urls", () => {
  assert.deepEqual(metricSeedProductionReasons({
    NODE_ENV: "development",
    DATABASE_URL: "postgres://user:pass@sancho-prod-db.example.com/app",
  }), ["DATABASE_URL looks production-like"]);
});
