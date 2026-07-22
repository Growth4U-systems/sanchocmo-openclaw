import { after, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
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
  "MC_CHAT_SECRET",
] as const;
const previousSecretEnv = new Map(
  secretEnvNames.map((name) => [name, process.env[name]] as const),
);
for (const name of secretEnvNames) delete process.env[name];
process.env.SANCHO_EXTERNAL_SECRET = "edge-secret";
process.env.MC_CHAT_SECRET = "openclaw-run-secret";
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
const agentRunsModule = await import("../data/agent-runs");
const agentRuns =
  (agentRunsModule as unknown as { default: typeof agentRunsModule }).default ??
  agentRunsModule;
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
  headers?: Record<string, string>;
  runAuthority?: { runId: string; capability: string };
}): NextApiRequest {
  return {
    method: options.method,
    query: options.query ?? {},
    body: options.body ?? {},
    headers: {
      host: "example.test",
      ...(options.secret ? { "x-mc-secret": options.secret } : {}),
      ...(options.headers ?? {}),
      ...(options.runAuthority
        ? {
            "x-mission-control-run-id": options.runAuthority.runId,
            "x-sancho-run-capability": options.runAuthority.capability,
          }
        : {}),
    },
    ...(options.ctx ? { ctx: options.ctx } : {}),
  } as unknown as NextApiRequest;
}

function createRunAuthority(
  slug: string,
  threadId = `${slug}:general`,
  runtime = "openclaw",
  transportSecret?: string,
) {
  const capability = "a".repeat(64);
  const run = agentRuns.createAgentRun({
    threadId,
    runtime,
    agent: "sancho",
    skill: `${slug}-skill`,
    skillMode: "auto",
    input: {
      slug,
      threadId,
      isAdmin: true,
      senderRole: "admin",
      readOnly: false,
      controlDepth: 0,
      userId: "mc-admin",
      runtimeToolCapabilitySha256: createHash("sha256")
        .update(capability)
        .digest("hex"),
      ...(transportSecret
        ? {
            runtimeTransportSecretSha256: createHash("sha256")
              .update(transportSecret)
              .digest("hex"),
          }
        : {}),
    },
  });
  agentRuns.markAgentRunDispatched(run.id, threadId);
  return { runId: run.id, capability };
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
        body: {},
        includeRunId: false,
      },
      {
        handler: webhookRoute.webhookHandler,
        body: {
          slug: "alpha",
          threadId: "alpha:general",
          role: "system",
          text: "test",
        },
        includeRunId: true,
      },
    ]) {
      const authority = createRunAuthority(
        "alpha",
        "alpha:general",
        "external-http",
      );
      const mocked = response();
      await item.handler(
        request({
          method: "POST",
          body: {
            ...item.body,
            ...(item.includeRunId
              ? { missionControlRunId: authority.runId }
              : {}),
          },
          runAuthority: authority,
        }),
        mocked.res,
      );
      assert.equal(mocked.read().statusCode, 503);
    }
  } finally {
    process.env.SANCHO_EXTERNAL_SECRET = "edge-secret";
  }
});

test("context-pack requires transport secret plus exact run capability and derives tenant/skill", async () => {
  const authority = createRunAuthority("alpha");
  const denied = response();
  await contextPackRoute.contextPackHandler(
    request({ method: "POST", body: {}, secret: "wrong", runAuthority: authority }),
    denied.res,
  );
  assert.equal(denied.read().statusCode, 403);

  const currentRuntimeSecret = response();
  await contextPackRoute.contextPackHandler(
    request({
      method: "POST",
      body: {},
      secret: "edge-secret",
      runAuthority: authority,
    }),
    currentRuntimeSecret.res,
  );
  assert.equal(currentRuntimeSecret.read().statusCode, 403);

  const secretOnly = response();
  await contextPackRoute.contextPackHandler(
    request({ method: "POST", body: {}, secret: "edge-secret" }),
    secretOnly.res,
  );
  assert.equal(secretOnly.read().statusCode, 403);

  const allowed = response();
  await contextPackRoute.contextPackHandler(
    request({
      method: "POST",
      body: {},
      secret: "openclaw-run-secret",
      runAuthority: authority,
    }),
    allowed.res,
  );
  assert.equal(allowed.read().statusCode, 200);
  assert.equal((allowed.read().payload as { slug?: string }).slug, "alpha");
  assert.equal((allowed.read().payload as { skill?: string }).skill, "alpha-skill");

  const spoofed = response();
  await contextPackRoute.contextPackHandler(
    request({
      method: "POST",
      body: { slug: "beta", skill: "beta-skill" },
      secret: "openclaw-run-secret",
      runAuthority: authority,
    }),
    spoofed.res,
  );
  assert.equal(spoofed.read().statusCode, 400);
});

test("context-pack accepts the admission secret after adapter secret rotation", async () => {
  const admissionSecret = "openclaw-secret-at-admission";
  const authority = createRunAuthority(
    "alpha",
    "alpha:context-secret-rotation",
    "openclaw",
    admissionSecret,
  );
  const previousSecret = process.env.MC_CHAT_SECRET;
  process.env.MC_CHAT_SECRET = "rotated-openclaw-secret";
  try {
    const rotated = response();
    await contextPackRoute.contextPackHandler(
      request({
        method: "POST",
        body: {},
        secret: "rotated-openclaw-secret",
        runAuthority: authority,
      }),
      rotated.res,
    );
    assert.equal(rotated.read().statusCode, 403);

    const admitted = response();
    await contextPackRoute.contextPackHandler(
      request({
        method: "POST",
        body: {},
        secret: admissionSecret,
        runAuthority: authority,
      }),
      admitted.res,
    );
    assert.equal(admitted.read().statusCode, 200);
  } finally {
    if (previousSecret === undefined) {
      delete process.env.MC_CHAT_SECRET;
    } else {
      process.env.MC_CHAT_SECRET = previousSecret;
    }
  }
});

test("webhook rejects secret-only path-shaped input before any write", async () => {
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
  assert.equal(mocked.read().statusCode, 403);
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
  const parentAuthority = createRunAuthority(
    "alpha",
    "alpha:general",
    "external-http",
  );
  const alphaGeneral = path.join(tmp, "brand", "alpha", "chat", "general.json");
  const before = fs.readFileSync(alphaGeneral, "utf8");
  const ledger = path.join(tmp, "_system", "agent-runs.json");
  const ledgerBefore = fs.existsSync(ledger) ? fs.readFileSync(ledger, "utf8") : null;
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
        request({
          method: "POST",
          secret: "edge-secret",
          headers: {
            "x-mission-control-parent-run-id": parentAuthority.runId,
            "x-sancho-parent-run-capability": parentAuthority.capability,
          },
          body,
        }),
        mocked.res,
      );
      assert.equal(mocked.read().statusCode, 400);
    }
    assert.equal(dispatches, 0);
    assert.equal(fs.readFileSync(alphaGeneral, "utf8"), before);
    assert.equal(fs.existsSync(path.join(tmp, "brand", "alpha", "chat", ".json")), false);
    assert.equal(
      fs.existsSync(ledger) ? fs.readFileSync(ledger, "utf8") : null,
      ledgerBefore,
    );
  } finally {
    runtime.messaging.sendInbound = originalSend;
  }
});

test("internal producers enter normal admission while preserving a downgraded principal", async () => {
  const runtime = (await import("../runtime")).getRuntime();
  const originalSend = runtime.messaging.sendInbound;
  let dispatched: Record<string, unknown> | undefined;
  runtime.messaging.sendInbound = async (payload) => {
    dispatched = payload as unknown as Record<string, unknown>;
    return { ok: true, status: 202, raw: JSON.stringify({ ok: true }) };
  };
  const threadId = "alpha:internal-dispatch";
  try {
    const mocked = response();
    await sendRoute.sendHandler(
      request({
        method: "POST",
        ctx: context({ isAdmin: true, adminToken: "admin-token-1234567890" }),
        headers: { "x-sancho-internal-dispatch": "1" },
        body: {
          slug: "alpha",
          threadId,
          text: "authoritative instructions",
          displayText: "Visible request card",
          userId: "docs-assistant",
          userName: "Docs Assistant",
          isAdmin: false,
          senderRole: "client",
          readOnly: true,
          agent: "sancho",
          idempotencyKey: "internal-dispatch:one",
          _source: "test-internal",
        },
      }),
      mocked.res,
    );
    assert.equal(mocked.read().statusCode, 200);
    assert.equal(dispatched?.text, "authoritative instructions");
    assert.equal(dispatched?.isAdmin, false);
    assert.equal(dispatched?.senderRole, "client");
    assert.equal(dispatched?.readOnly, true);
    assert.equal(dispatched?.userId, "docs-assistant");
    const stored = JSON.parse(
      fs.readFileSync(
        path.join(tmp, "brand", "alpha", "chat", "internal-dispatch.json"),
        "utf8",
      ),
    ) as { messages?: Array<{ role?: string; text?: string }> };
    assert.equal(
      stored.messages?.some(
        (message) =>
          message.role === "user" && message.text === "Visible request card",
      ),
      true,
    );
    assert.equal(
      stored.messages?.some(
        (message) => message.text === "authoritative instructions",
      ),
      false,
    );
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
