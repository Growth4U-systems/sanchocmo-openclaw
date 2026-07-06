import { test } from "node:test";
import assert from "node:assert/strict";
import * as providerCatalog from "../yalc/provider-catalog";

const {
  mergeYalcProvidersIntoCatalog,
  parseYalcProviderApiId,
  toYalcProviderApiId,
} = (providerCatalog as unknown as { default: typeof providerCatalog }).default ?? providerCatalog;

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
  assert.equal(entry.provider, "Instantly");
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

test("mergeYalcProvidersIntoCatalog skips providers already present in Sancho catalog", () => {
  const catalog = mergeYalcProvidersIntoCatalog(
    {
      categories: {
        outbound: {
          label: "Outbound",
          apis: {
            instantly: {
              id: "instantly",
              name: "Instantly",
              provider: "Instantly",
              description: "Cold email sequencer",
              desc: "Cold email sequencer",
              icon: "mail",
              ownership: "client",
              authType: "api_key",
              credentials: [],
              config: [],
            },
          },
        },
      },
    },
    {
      providers: [
        {
          id: "instantly",
          display_name: "Instantly",
          env_vars: [{ name: "INSTANTLY_API_KEY", required: true }],
        },
        {
          id: "predictleads",
          display_name: "PredictLeads",
          env_vars: [{ name: "PREDICTLEADS_API_KEY", required: true }],
        },
      ],
    },
  );

  assert.equal(catalog.categories.outbound.apis.instantly.provider, "Instantly");
  assert.equal(
    catalog.categories.yalc_providers.apis["yalc-provider:instantly"],
    undefined,
  );
  assert.equal(
    catalog.categories.yalc_providers.apis["yalc-provider:predictleads"].provider,
    "PredictLeads",
  );
});
