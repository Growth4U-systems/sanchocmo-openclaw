import { after, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { NextApiRequest, NextApiResponse } from "next";
import type { RequestContext } from "../api-middleware";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "sancho-chat-edge-auth-"));
process.env.MC_WORKSPACE = tmp;
process.env.SANCHO_RUNTIME = "external-http";
const secretEnvNames = [
  "SANCHO_EXTERNAL_SECRET",
  "SANCHO_EXTERNAL_RUNTIME_SECRET",
  "HERMES_EXTERNAL_SECRET",
  "HERMES_EXTERNAL_API_KEY",
  "HERMES_EXTERNAL_CHAT_SECRET",
] as const;
const previousSecretEnv = new Map(
  secretEnvNames.map((name) => [name, process.env[name]] as const),
);
for (const name of secretEnvNames) delete process.env[name];
process.env.SANCHO_EXTERNAL_SECRET = "edge-secret";
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
    JSON.stringify({ messages: [{ role: "user", text: client.slug, ts: 1 }] }),
  );
  fs.writeFileSync(
    path.join(tmp, "brand", client.slug, "chat-config.json"),
    JSON.stringify({
      general: {
        skill: `${client.slug}-skill`,
        quickActions: [{ label: client.name, prompt: `${client.slug}-private-prompt` }],
      },
    }),
  );
}

const { resetRuntimeForTests } = await import("../runtime");
resetRuntimeForTests();
const linkRoute = await import("../../pages/api/chat/link-discord");
const markReadRoute = await import("../../pages/api/chat/mark-read");
const quickActionsRoute = await import("../../pages/api/chat/quick-actions");
const contextPackRoute = await import("../../pages/api/chat/context-pack");
const webhookRoute = await import("../../pages/api/chat/webhook");
const sendRoute = await import("../../pages/api/chat/send");

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

function request(options: {
  method: "GET" | "POST";
  query?: NextApiRequest["query"];
  body?: Record<string, unknown>;
  ctx?: RequestContext;
  secret?: string;
}): NextApiRequest {
  return {
    method: options.method,
    query: options.query ?? {},
    body: options.body ?? {},
    headers: {
      host: "example.test",
      ...(options.secret ? { "x-mc-secret": options.secret } : {}),
    },
    ...(options.ctx ? { ctx: options.ctx } : {}),
  } as unknown as NextApiRequest;
}

test("browser chat edge routes reject unauthenticated requests", async () => {
  const cases = [
    {
      entry: linkRoute.default,
      req: request({
        method: "POST",
        body: {
          threadId: "alpha:general",
          discordThreadId: "discord-thread-alpha",
          discordChannelId: "discord-channel-alpha",
        },
      }),
    },
    {
      entry: markReadRoute.default,
      req: request({ method: "POST", body: { slug: "alpha", threadId: "alpha:general" } }),
    },
    {
      entry: quickActionsRoute.default,
      req: request({ method: "GET", query: { slug: "alpha", type: "general" } }),
    },
  ];

  for (const item of cases) {
    const mocked = response();
    await item.entry(item.req, mocked.res);
    assert.equal(mocked.read().statusCode, 403);
  }
});

test("browser chat edge routes reject cross-tenant access", async () => {
  const alpha = context({ clientSlug: "alpha" });

  const link = response();
  await linkRoute.linkDiscordHandler(
    request({
      method: "POST",
      ctx: alpha,
      body: {
        threadId: "beta:general",
        discordThreadId: "discord-thread-beta",
        discordChannelId: "discord-channel-beta",
      },
    }),
    link.res,
  );
  assert.equal(link.read().statusCode, 403);

  const mark = response();
  await markReadRoute.markReadHandler(
    request({ method: "POST", ctx: alpha, body: { slug: "beta", threadId: "beta:general" } }),
    mark.res,
  );
  assert.equal(mark.read().statusCode, 403);

  const quick = response();
  await quickActionsRoute.quickActionsHandler(
    request({ method: "GET", ctx: alpha, query: { slug: "beta", type: "general" } }),
    quick.res,
  );
  assert.equal(quick.read().statusCode, 403);
  assert.equal(JSON.stringify(quick.read().payload).includes("beta-private-prompt"), false);
});

test("mark-read rejects a thread whose embedded tenant disagrees with the slug", async () => {
  const mocked = response();
  await markReadRoute.markReadHandler(
    request({
      method: "POST",
      ctx: context({ clientSlug: "alpha" }),
      body: { slug: "alpha", threadId: "beta:general" },
    }),
    mocked.res,
  );
  assert.equal(mocked.read().statusCode, 400);
  assert.equal(fs.existsSync(path.join(tmp, "brand", "alpha", "chat", "_read-state.json")), false);
});

test("authorized browser chat edge operations remain functional", async () => {
  const alpha = context({ clientSlug: "alpha" });

  const link = response();
  await linkRoute.linkDiscordHandler(
    request({
      method: "POST",
      ctx: alpha,
      body: {
        threadId: "alpha:general",
        discordThreadId: "discord-thread-alpha",
        discordChannelId: "discord-channel-alpha",
      },
    }),
    link.res,
  );
  assert.equal(link.read().statusCode, 200);
  const linked = JSON.parse(
    fs.readFileSync(path.join(tmp, "brand", "alpha", "chat", "general.json"), "utf-8"),
  ) as { discordThreadId?: string };
  assert.equal(linked.discordThreadId, "discord-thread-alpha");

  const mark = response();
  await markReadRoute.markReadHandler(
    request({ method: "POST", ctx: alpha, body: { slug: "alpha", threadId: "alpha:general" } }),
    mark.res,
  );
  assert.equal(mark.read().statusCode, 200);
  const readState = JSON.parse(
    fs.readFileSync(path.join(tmp, "brand", "alpha", "chat", "_read-state.json"), "utf-8"),
  ) as Record<string, unknown>;
  assert.ok(readState.general);

  const quick = response();
  await quickActionsRoute.quickActionsHandler(
    request({ method: "GET", ctx: alpha, query: { slug: "alpha", type: "general" } }),
    quick.res,
  );
  assert.equal(quick.read().statusCode, 200);
  assert.equal(JSON.stringify(quick.read().payload).includes("alpha-private-prompt"), true);
});

test("context-pack and webhook fail closed when the runtime secret is absent", async () => {
  delete process.env.SANCHO_EXTERNAL_SECRET;
  try {
    for (const item of [
      {
        handler: contextPackRoute.contextPackHandler,
        body: { slug: "alpha", skill: "seo" },
      },
      {
        handler: webhookRoute.webhookHandler,
        body: { slug: "alpha", threadId: "alpha:general", role: "system", text: "test" },
      },
    ]) {
      const mocked = response();
      await item.handler(request({ method: "POST", body: item.body }), mocked.res);
      assert.equal(mocked.read().statusCode, 503);
    }
  } finally {
    process.env.SANCHO_EXTERNAL_SECRET = "edge-secret";
  }
});

test("context-pack requires the machine secret and accepts the configured secret", async () => {
  const denied = response();
  await contextPackRoute.contextPackHandler(
    request({ method: "POST", body: { slug: "alpha", skill: "seo" }, secret: "wrong" }),
    denied.res,
  );
  assert.equal(denied.read().statusCode, 403);

  const allowed = response();
  await contextPackRoute.contextPackHandler(
    request({ method: "POST", body: { slug: "alpha", skill: "seo" }, secret: "edge-secret" }),
    allowed.res,
  );
  assert.equal(allowed.read().statusCode, 200);
  assert.equal((allowed.read().payload as { slug?: string }).slug, "alpha");
});

test("webhook keeps machine auth but rejects path-shaped tenant input", async () => {
  const escapedSlug = `../../escaped-${path.basename(tmp)}`;
  const escapedFile = path.resolve(tmp, "brand", escapedSlug, "chat", "general.json");
  const mocked = response();
  await webhookRoute.webhookHandler(
    request({
      method: "POST",
      secret: "edge-secret",
      body: { slug: escapedSlug, threadId: "general", role: "system", text: "do not write" },
    }),
    mocked.res,
  );
  assert.equal(mocked.read().statusCode, 400);
  assert.equal(fs.existsSync(escapedFile), false);
});

test("send rejects traversal tenants and short ids that sanitize empty before write or dispatch", async () => {
  const runtime = (await import("../runtime")).getRuntime();
  const originalSend = runtime.messaging.sendInbound;
  let dispatches = 0;
  runtime.messaging.sendInbound = async () => {
    dispatches += 1;
    return { ok: true, status: 202, raw: "{}" };
  };
  const alphaGeneral = path.join(tmp, "brand", "alpha", "chat", "general.json");
  const before = fs.readFileSync(alphaGeneral, "utf8");
  const ledger = path.join(tmp, "_system", "agent-runs.json");
  try {
    for (const body of [
      {
        slug: `../../escaped-${path.basename(tmp)}`,
        threadId: `../../escaped-${path.basename(tmp)}:general`,
        text: "do not write",
      },
      {
        slug: "alpha",
        threadId: "alpha:../../",
        text: "do not write",
      },
    ]) {
      const mocked = response();
      await sendRoute.sendHandler(
        request({ method: "POST", secret: "edge-secret", body }),
        mocked.res,
      );
      assert.equal(mocked.read().statusCode, 400);
    }
    assert.equal(dispatches, 0);
    assert.equal(fs.readFileSync(alphaGeneral, "utf8"), before);
    assert.equal(fs.existsSync(path.join(tmp, "brand", "alpha", "chat", ".json")), false);
    assert.equal(fs.existsSync(ledger), false);
  } finally {
    runtime.messaging.sendInbound = originalSend;
  }
});

after(() => {
  for (const name of secretEnvNames) {
    const previous = previousSecretEnv.get(name);
    if (previous === undefined) delete process.env[name];
    else process.env[name] = previous;
  }
  fs.rmSync(tmp, { recursive: true, force: true });
});
