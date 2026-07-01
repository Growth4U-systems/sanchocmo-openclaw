import { test } from "node:test";
import assert from "node:assert/strict";

type Mod = typeof import("../../pages/api/partnerships/mcp-health");

const realFetch = globalThis.fetch;

function stubFetch(response: Response) {
  globalThis.fetch = (async () => response) as unknown as typeof fetch;
}

test("ScrapeCreators health reports zero credits as red", async (t) => {
  t.after(() => {
    globalThis.fetch = realFetch;
  });
  stubFetch(new Response(JSON.stringify({ success: true, creditCount: 0 }), { status: 200 }));

  const mod: Mod = await import("../../pages/api/partnerships/mcp-health");
  const result = await mod.pingScrapeCreators("test-key");

  assert.equal(result.status, "red");
  assert.match(result.description, /sin créditos/);
});

test("ScrapeCreators health reports HTTP 402 as no credits", async (t) => {
  t.after(() => {
    globalThis.fetch = realFetch;
  });
  stubFetch(new Response(JSON.stringify({ message: "You have 0 credits remaining." }), { status: 402 }));

  const mod: Mod = await import("../../pages/api/partnerships/mcp-health");
  const result = await mod.pingScrapeCreators("test-key");

  assert.equal(result.status, "red");
  assert.match(result.description, /sin créditos/);
});
