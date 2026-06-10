import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveYalcConfig, yalcFetch } from "../yalc/client";

/**
 * Every Sancho→YALC call must be scoped to the brand's tenant via `?tenant=`.
 * Without it the cockpit hits the `default` tenant for every brand.
 */

function withStubbedFetch(run: (calls: string[]) => Promise<void>): Promise<void> {
  const real = globalThis.fetch;
  const calls: string[] = [];
  globalThis.fetch = (async (url: URL | string) => {
    calls.push(String(url));
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as unknown as typeof fetch;
  return run(calls).finally(() => {
    globalThis.fetch = real;
  });
}

test("yalcFetch adds ?tenant=<slug> from the resolved config", async () => {
  await withStubbedFetch(async (calls) => {
    await yalcFetch(resolveYalcConfig("growth4u"), "/api/campaigns");
    assert.ok(calls[0].includes("tenant=growth4u"), calls[0]);
  });
});

test("yalcFetch omits tenant when no slug is given", async () => {
  await withStubbedFetch(async (calls) => {
    await yalcFetch(resolveYalcConfig(), "/api/campaigns");
    assert.ok(!calls[0].includes("tenant="), calls[0]);
  });
});
