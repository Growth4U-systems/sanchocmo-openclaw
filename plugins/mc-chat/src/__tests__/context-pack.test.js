import { afterEach, test } from "node:test";
import assert from "node:assert/strict";
import { fetchContextPack, resolveContextPackBaseUrl } from "../context-pack.js";

const ENV_KEYS = ["MC_CONTEXT_PACK_URL", "MC_NEXT_URL", "BASE_URL", "NEXTAUTH_URL"];
const ORIGINAL_ENV = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));

function resetEnv() {
  for (const key of ENV_KEYS) {
    if (ORIGINAL_ENV[key] === undefined) delete process.env[key];
    else process.env[key] = ORIGINAL_ENV[key];
  }
}

function clearUrlEnv() {
  for (const key of ENV_KEYS) delete process.env[key];
}

afterEach(resetEnv);

test("context-pack defaults to Next, not legacy mcServerUrl", async () => {
  clearUrlEnv();
  let request;
  const pack = await fetchContextPack("growth4u", "seo", {
    mcServerUrl: "http://localhost:18790",
    fetchImpl: async (url, init) => {
      request = { url, init };
      return {
        ok: true,
        json: async () => ({
          slug: "growth4u",
          skill: "seo",
          summary: "Client context",
          docPaths: [],
          verdict: "ok",
        }),
      };
    },
  });

  assert.equal(request.url, "http://localhost:3000/api/chat/context-pack");
  assert.deepEqual(JSON.parse(request.init.body), { slug: "growth4u", skill: "seo" });
  assert.equal(pack.slug, "growth4u");
});

test("context-pack URL override trims trailing slashes and sends the shared secret", async () => {
  clearUrlEnv();
  let request;
  await fetchContextPack("growth4u", null, {
    contextPackUrl: "http://next.internal:3000/",
    secret: "shared-secret",
    fetchImpl: async (url, init) => {
      request = { url, init };
      return {
        ok: true,
        json: async () => ({
          slug: "growth4u",
          skill: null,
          summary: "Client context",
          docPaths: [],
          verdict: "ok",
        }),
      };
    },
  });

  assert.equal(request.url, "http://next.internal:3000/api/chat/context-pack");
  assert.equal(request.init.headers["X-MC-Secret"], "shared-secret");
  assert.deepEqual(JSON.parse(request.init.body), { slug: "growth4u" });
});

test("context-pack base URL can come from environment", () => {
  clearUrlEnv();
  process.env.MC_CONTEXT_PACK_URL = "http://next-from-env:3000/";

  assert.equal(resolveContextPackBaseUrl(), "http://next-from-env:3000");
});
