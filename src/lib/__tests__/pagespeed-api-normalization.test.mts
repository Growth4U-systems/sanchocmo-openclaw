import assert from "node:assert/strict";
import { test } from "node:test";

import { normalizePageSpeedMeasurements } from "../../pages/api/pagespeed";

test("PageSpeed API preserves legitimate zeroes but never invents missing measurements", () => {
  assert.deepEqual(normalizePageSpeedMeasurements({}, {}), {
    performance: null,
    seo: null,
    accessibility: null,
    bestPractices: null,
    lcp: null,
    cls: null,
    tbt: null,
  });

  assert.deepEqual(normalizePageSpeedMeasurements(
    {
      performance: { score: 0 },
      seo: { score: 0.91 },
      accessibility: { score: null },
    },
    {
      "largest-contentful-paint": { numericValue: 2345 },
      "cumulative-layout-shift": { numericValue: 0 },
      "total-blocking-time": { numericValue: null },
    },
  ), {
    performance: 0,
    seo: 91,
    accessibility: null,
    bestPractices: null,
    lcp: 2.3,
    cls: 0,
    tbt: null,
  });
});
