import { after, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { NextApiRequest, NextApiResponse } from "next";
import type { RequestContext } from "../api-middleware";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "sancho-chat-api-auth-"));
process.env.MC_WORKSPACE = tmp;
const previousRuntimeSecret = process.env.MC_CHAT_SECRET;
process.env.MC_CHAT_SECRET = "runtime-secret";
delete process.env.LOCAL_DASHBOARD_BYPASS;

const clients = [
  { slug: "alpha", name: "Alpha", active: true, mcToken: "alpha-token-1234567890" },
  { slug: "beta", name: "Beta", active: true, mcToken: "beta-token-12345678901" },
];
fs.writeFileSync(
  path.join(tmp, "clients.json"),
  JSON.stringify({ clients, adminToken: "admin-token-1234567890" }),
);

for (const client of clients) {
  const chatDir = path.join(tmp, "brand", client.slug, "chat");
  fs.mkdirSync(chatDir, { recursive: true });
  fs.writeFileSync(
    path.join(chatDir, "general.json"),
    JSON.stringify({
      messages: [{ role: "user", text: `${client.slug}-private`, ts: 1 }],
      discordThreadId: `discord-${client.slug}`,
      updatedAt: 1,
    }),
  );
  const docDir = path.join(tmp, "brand", client.slug, "docs");
  fs.mkdirSync(docDir, { recursive: true });
  fs.writeFileSync(path.join(docDir, "private.md"), `${client.slug}-document`);
}

const threadRoute = await import("../../pages/api/chat/thread/[threadId]");
const threadsRoute = await import("../../pages/api/chat/threads/[slug]");
const runsRoute = await import("../../pages/api/chat/runs");
const docRoute = await import("../../pages/api/chat/doc/[...path]");
const discordRoute = await import("../../pages/api/chat/find-by-discord/[discordId]");

function context(partial: Partial<RequestContext>): RequestContext {
  return {
    isAdmin: false,
    clientSlug: null,
    allowedSlugs: null,
    adminToken: null,
    portalClient: null,
    ...partial,
  };
}

function response() {
  let statusCode = 200;
  let payload: unknown;
  const headers = new Map<string, string>();
  const res = {
    setHeader(name: string, value: string) {
      headers.set(name.toLowerCase(), String(value));
      return this;
    },
    status(code: number) {
      statusCode = code;
      return this;
    },
    json(value: unknown) {
      payload = value;
      return this;
    },
  } as unknown as NextApiResponse;
  return { res, read: () => ({ statusCode, payload, headers }) };
}

function request(query: NextApiRequest["query"], ctx?: RequestContext): NextApiRequest {
  return {
    method: "GET",
    query,
    headers: { host: "example.test" },
    ...(ctx ? { ctx } : {}),
  } as unknown as NextApiRequest;
}

test("chat read routes reject unauthenticated requests", async () => {
  const cases: Array<{
    name: string;
    entry: (req: NextApiRequest, res: NextApiResponse) => unknown;
    query: NextApiRequest["query"];
  }> = [
    { name: "thread", entry: threadRoute.default, query: { threadId: "alpha:general" } },
    { name: "threads", entry: threadsRoute.default, query: { slug: "alpha" } },
    { name: "runs", entry: runsRoute.default, query: { threadId: "alpha:general" } },
    { name: "doc", entry: docRoute.default, query: { path: ["alpha", "docs", "private.md"] } },
    { name: "discord lookup", entry: discordRoute.default, query: { discordId: "discord-alpha" } },
  ];

  for (const route of cases) {
    const mocked = response();
    await route.entry(request(route.query), mocked.res);
    assert.equal(mocked.read().statusCode, 403, route.name);
  }
});

test("explicit tenant chat routes reject cross-tenant reads", async () => {
  const alpha = context({ clientSlug: "alpha" });
  const cases: Array<{
    name: string;
    handler: (req: NextApiRequest, res: NextApiResponse) => unknown;
    query: NextApiRequest["query"];
  }> = [
    { name: "thread", handler: threadRoute.threadHandler, query: { threadId: "beta:general" } },
    { name: "threads", handler: threadsRoute.threadsHandler, query: { slug: "beta" } },
    { name: "runs", handler: runsRoute.runsHandler, query: { threadId: "beta:general" } },
    { name: "doc", handler: docRoute.chatDocHandler, query: { path: ["beta", "docs", "private.md"] } },
  ];

  for (const route of cases) {
    const mocked = response();
    await route.handler(request(route.query, alpha), mocked.res);
    assert.equal(mocked.read().statusCode, 403, route.name);
    assert.equal(JSON.stringify(mocked.read().payload).includes("beta-private"), false);
  }
});

test("Discord lookup searches only authorized tenants", async () => {
  const alpha = context({ clientSlug: "alpha" });

  const own = response();
  await discordRoute.findByDiscordHandler(
    request({ discordId: "discord-alpha" }, alpha),
    own.res,
  );
  assert.equal(own.read().statusCode, 200);
  assert.equal((own.read().payload as { threadId?: string }).threadId, "alpha:general");

  const other = response();
  await discordRoute.findByDiscordHandler(
    request({ discordId: "discord-beta" }, alpha),
    other.res,
  );
  assert.equal(other.read().statusCode, 404);
  assert.equal(JSON.stringify(other.read().payload).includes("beta"), false);
});

test("trusted runtime reads remain available with the shared secret", async () => {
  for (const route of [
    {
      entry: threadRoute.default,
      query: { threadId: "alpha:general" },
    },
    {
      entry: discordRoute.default,
      query: { discordId: "discord-alpha" },
    },
  ]) {
    const mocked = response();
    const req = request(route.query);
    req.headers["x-mc-secret"] = "runtime-secret";
    await route.entry(req, mocked.res);
    assert.equal(mocked.read().statusCode, 200);
  }
});

test("thread and document routes reject path-shaped tenant identifiers", async () => {
  const admin = context({ isAdmin: true });

  const thread = response();
  await threadRoute.threadHandler(
    request({ threadId: "../beta:general" }, admin),
    thread.res,
  );
  assert.equal(thread.read().statusCode, 400);

  const doc = response();
  await docRoute.chatDocHandler(
    request({ path: ["brand", "..", "beta", "docs", "private.md"] }, admin),
    doc.res,
  );
  assert.equal(doc.read().statusCode, 400);
});

test("run history rejects unbounded page sizes", async () => {
  const mocked = response();
  await runsRoute.runsHandler(
    request(
      { threadId: "alpha:general", limit: "101" },
      context({ isAdmin: true }),
    ),
    mocked.res,
  );
  assert.equal(mocked.read().statusCode, 400);
  assert.match(String((mocked.read().payload as { error?: string }).error), /limit/i);
});

test("an authorized caller can read its own thread and document", async () => {
  const alpha = context({ clientSlug: "alpha" });

  const thread = response();
  await threadRoute.threadHandler(request({ threadId: "alpha:general" }, alpha), thread.res);
  assert.equal(thread.read().statusCode, 200);
  assert.equal(JSON.stringify(thread.read().payload).includes("alpha-private"), true);

  const doc = response();
  await docRoute.chatDocHandler(
    request({ path: ["alpha", "docs", "private.md"] }, alpha),
    doc.res,
  );
  assert.equal(doc.read().statusCode, 200);
  assert.equal((doc.read().payload as { content?: string }).content, "alpha-document");
});

after(() => {
  if (previousRuntimeSecret === undefined) delete process.env.MC_CHAT_SECRET;
  else process.env.MC_CHAT_SECRET = previousRuntimeSecret;
  fs.rmSync(tmp, { recursive: true, force: true });
});
