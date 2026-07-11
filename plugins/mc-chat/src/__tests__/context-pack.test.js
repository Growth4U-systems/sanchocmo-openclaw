import { afterEach, test } from "node:test";
import assert from "node:assert/strict";
import {
  buildClientContextBlock,
  buildFoundationDirective,
  fetchContextPack,
  resolveContextPackBaseUrl,
} from "../context-pack.js";

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

test("client context block exposes a selective manifest instead of embedding documents", () => {
  const block = buildClientContextBlock({
    slug: "growth4u",
    skill: "discovery-plan-builder",
    summary: "Cliente: Growth4U",
    docPaths: ["/srv/openclaw/workspace-sancho/brand/growth4u/company-brief/company-brief.current.md"],
    documents: [
      {
        path: "brand/growth4u/company-brief/company-brief.current.md",
        kind: "file",
        content: "# Company Brief\nICP: B2B SaaS.",
        truncated: false,
      },
    ],
    missingRequired: ["brand/growth4u/go-to-market/ecps/ecps.current.md"],
    verdict: "partial",
  });

  assert.match(block, /\[Client Context Manifest\]/);
  assert.match(block, /Cliente: Growth4U/);
  assert.match(block, /company-brief\/company-brief\.current\.md/);
  assert.match(block, /lee de forma selectiva/i);
  assert.match(block, /lee solo fragmentos relevantes/i);
  assert.doesNotMatch(block, /# Company Brief/);
  assert.doesNotMatch(block, /ICP: B2B SaaS/);
  assert.doesNotMatch(block, /go-to-market\/ecps/);
});

test("foundation directive remains available for an absent brand", () => {
  const block = buildFoundationDirective({ slug: "missingco" });

  assert.match(block, /\[STOP/);
  assert.match(block, /missingco/);
  assert.match(block, /No hay Foundation en disco/);
});
