import { afterEach, test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import {
  buildClientContextBlock,
  buildFoundationDirective,
  fetchContextPack,
  resolveContextPackBaseUrl,
} from "../context-pack.js";

const ENV_KEYS = ["MC_CONTEXT_PACK_URL", "MC_NEXT_URL", "BASE_URL", "NEXTAUTH_URL"];
const ORIGINAL_ENV = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
const runAuthority = {
  runId: "run-context-pack-1",
  capability: "a".repeat(64),
};

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

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      resolve(`http://127.0.0.1:${address.port}`);
    });
  });
}

function close(server) {
  return new Promise((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
}

test("context-pack defaults to Next, not legacy mcServerUrl", async () => {
  clearUrlEnv();
  let request;
  const pack = await fetchContextPack("growth4u", "seo", {
    ...runAuthority,
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
  assert.deepEqual(JSON.parse(request.init.body), {});
  assert.equal(request.init.headers["X-Mission-Control-Run-Id"], runAuthority.runId);
  assert.equal(request.init.headers["X-Sancho-Run-Capability"], runAuthority.capability);
  assert.equal(pack.slug, "growth4u");
});

test("context-pack URL override trims trailing slashes and sends the shared secret", async () => {
  clearUrlEnv();
  let request;
  await fetchContextPack("growth4u", null, {
    ...runAuthority,
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
  assert.equal(request.init.redirect, "error");
  assert.ok(request.init.signal instanceof AbortSignal);
  assert.deepEqual(JSON.parse(request.init.body), {});
});

test("context-pack propagates a complete durable lease pair only in headers", async () => {
  clearUrlEnv();
  let request;
  const dispatchLeaseToken = "lease-token-" + "d".repeat(32);
  await fetchContextPack("growth4u", "seo", {
    ...runAuthority,
    dispatchRunId: "dispatch-1",
    dispatchLeaseToken,
    contextPackUrl: "http://next.internal:3000",
    fetchImpl: async (_url, init) => {
      request = init;
      return new Response(
        JSON.stringify({ slug: "growth4u", verdict: "ok" }),
        { status: 200 },
      );
    },
  });
  assert.equal(request.headers["X-Sancho-Dispatch-Run-Id"], "dispatch-1");
  assert.equal(
    request.headers["X-Sancho-Dispatch-Lease-Token"],
    dispatchLeaseToken,
  );
  assert.doesNotMatch(request.body, new RegExp(dispatchLeaseToken));

  let calls = 0;
  assert.equal(
    await fetchContextPack("growth4u", "seo", {
      ...runAuthority,
      dispatchRunId: "dispatch-1",
      contextPackUrl: "http://next.internal:3000",
      fetchImpl: async () => {
        calls += 1;
      },
    }),
    null,
  );
  assert.equal(calls, 0);
});

test("context-pack base URL can come from environment", () => {
  clearUrlEnv();
  process.env.MC_CONTEXT_PACK_URL = "http://next-from-env:3000/";

  assert.equal(resolveContextPackBaseUrl(), "http://next-from-env:3000");
});

test("invalid context-pack origins fail soft before secret-bearing network I/O", async () => {
  clearUrlEnv();
  let calls = 0;
  const pack = await fetchContextPack("growth4u", "seo", {
    ...runAuthority,
    contextPackUrl: "https://user:password@example.test/private?next=evil",
    secret: "shared-secret",
    fetchImpl: async () => {
      calls += 1;
      throw new Error("must not be called");
    },
  });
  assert.equal(pack, null);
  assert.equal(calls, 0);
  assert.equal(
    resolveContextPackBaseUrl({ contextPackUrl: "javascript:alert(1)" }),
    null,
  );
});

test("a context-pack redirect cannot receive the shared secret", async () => {
  clearUrlEnv();
  let targetRequests = 0;
  const target = createServer((_req, res) => {
    targetRequests += 1;
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ slug: "growth4u", verdict: "ok" }));
  });
  const targetOrigin = await listen(target);
  let sourceRequests = 0;
  const source = createServer((_req, res) => {
    sourceRequests += 1;
    res.writeHead(307, { Location: `${targetOrigin}/capture` });
    res.end();
  });
  const sourceOrigin = await listen(source);
  try {
    const pack = await fetchContextPack("growth4u", "seo", {
      ...runAuthority,
      contextPackUrl: sourceOrigin,
      secret: "shared-secret",
    });
    assert.equal(pack, null);
    assert.equal(sourceRequests, 1);
    assert.equal(targetRequests, 0);
  } finally {
    await Promise.all([close(source), close(target)]);
  }
});

test("oversized context-pack responses fail soft", async () => {
  clearUrlEnv();
  const pack = await fetchContextPack("growth4u", "seo", {
    ...runAuthority,
    contextPackUrl: "http://next.internal:3000",
    fetchImpl: async () => new Response(JSON.stringify({
      slug: "growth4u",
      summary: "x".repeat(70 * 1024),
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }),
  });
  assert.equal(pack, null);
});

test("context-pack requires exact per-run authority before network I/O", async () => {
  clearUrlEnv();
  let calls = 0;
  const pack = await fetchContextPack("growth4u", "seo", {
    secret: "shared-secret",
    fetchImpl: async () => {
      calls += 1;
      throw new Error("must not be called");
    },
  });
  assert.equal(pack, null);
  assert.equal(calls, 0);
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

test("docs review context can inline bounded Brain excerpts with source paths", () => {
  const block = buildClientContextBlock({
    summary: "Cliente: Growth4U",
    docPaths: ["/srv/absolute/company-brief.current.md", "/srv/absolute/messaging-summary.md"],
    documents: [
      {
        path: "brand/growth4u/company-brief/company-brief.current.md",
        content: `# Company Brief\n${"A".repeat(2_000)}`,
        truncated: false,
      },
      {
        path: "brand/growth4u/go-to-market/positioning/shared/messaging-summary.md",
        content: `# Messaging\n${"B".repeat(2_000)}`,
        truncated: false,
      },
    ],
  }, { includeDocuments: true, maxInlineDocumentChars: 1_000 });

  assert.match(block, /Extractos del Brain/);
  assert.match(block, /Fuente Brain: brand\/growth4u\/company-brief/);
  assert.match(block, /Fuente Brain: brand\/growth4u\/go-to-market\/positioning/);
  assert.match(block, /# Company Brief/);
  assert.match(block, /# Messaging/);
  assert.match(block, /extracto truncado/);
  assert.ok(block.length < 2_500);
  assert.doesNotMatch(block, /\/srv\/absolute/);
});

test("foundation directive remains available for an absent brand", () => {
  const block = buildFoundationDirective({ slug: "missingco" });

  assert.match(block, /\[STOP/);
  assert.match(block, /missingco/);
  assert.match(block, /No hay Foundation en disco/);
});
