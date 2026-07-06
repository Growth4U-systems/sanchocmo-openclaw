import assert from "node:assert/strict";
import { test } from "node:test";

import * as mod from "../partnerships/quality-components";

const { normalizeQualityComponents } =
  (mod as unknown as { default: typeof mod }).default ?? mod;

test("normalizeQualityComponents accepts calc-creator-core components[] payloads", () => {
  assert.deepEqual(
    normalizeQualityComponents({
      band: "high",
      components: [
        { key: "erVsTier", score: 92 },
        { key: "authenticity", score: 88 },
        { key: "sectorFit", score: 95 },
        { key: "audienceEs", score: 84 },
        { key: "consistency", score: 76 },
      ],
      engine: "calc-creator-core",
    }),
    {
      erVsTier: 92,
      authenticity: 88,
      sectorFit: 95,
      audienceEs: 84,
      consistency: 76,
    },
  );
});

test("normalizeQualityComponents keeps legacy flat and snake_case payloads", () => {
  assert.deepEqual(
    normalizeQualityComponents({
      erVsTier: 91,
      authenticity: 83,
      sector_fit: 72,
      audience_es: 66,
      consistency: 74,
    }),
    {
      erVsTier: 91,
      authenticity: 83,
      sectorFit: 72,
      audienceEs: 66,
      consistency: 74,
    },
  );
});
