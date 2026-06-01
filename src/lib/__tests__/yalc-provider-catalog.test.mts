import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mergeYalcProvidersIntoCatalog,
  parseYalcProviderApiId,
  toYalcProviderApiId,
} from "../yalc/provider-catalog";

test("yalc provider api ids round trip only valid provider slugs", () => {
  assert.equal(toYalcProviderApiId("instantly"), "yalc-provider:instantly");
  assert.equal(parseYalcProviderApiId("yalc-provider:instantly"), "instantly");
  assert.equal(parseYalcProviderApiId("instantly"), null);
  assert.equal(parseYalcProviderApiId("yalc-provider:Instantly"), null);
});

test("mergeYalcProvidersIntoCatalog adds env vars as sensitive credential fields", () => {
  const catalog = mergeYalcProvidersIntoCatalog(
    { categories: {} },
    {
      providers: [
        {
          id: "instantly",
          display_name: "Instantly",
          docs_url: "https://developer.instantly.ai",
          env_vars: [
            {
              name: "INSTANTLY_API_KEY",
              description: "Instantly API key",
              example: "ist_xxx",
              required: true,
            },
          ],
        },
      ],
    },
  );

  const entry = catalog.categories.yalc_providers.apis["yalc-provider:instantly"];
  assert.equal(entry.provider, "Instantly (YALC)");
  assert.equal(entry.ownership, "client");
  assert.equal(entry.docsUrl, "https://developer.instantly.ai");
  assert.deepEqual(entry.credentials, [
    {
      key: "INSTANTLY_API_KEY",
      label: "INSTANTLY_API_KEY",
      type: "string",
      help: "Instantly API key",
      sensitive: true,
      required: true,
      placeholder: "ist_xxx",
    },
  ]);
});
