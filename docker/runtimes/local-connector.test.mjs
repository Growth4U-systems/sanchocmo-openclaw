import test from "node:test";
import assert from "node:assert/strict";
import {
  localBridgeSpawnOptions,
  postFailureWebhook,
} from "../../scripts/sancho-local-connector.mjs";

test("local bridge callback outbox is anchored to connector state", () => {
  const options = localBridgeSpawnOptions(
    { CODEX_BRIDGE_SECRET: "runtime-secret" },
    {
      PATH: "/usr/bin",
      SANCHO_CONNECTOR_TOKEN: "must-not-reach-child",
    },
    "/srv/sancho-connector/state",
  );

  assert.equal(options.cwd, "/srv/sancho-connector/state");
  assert.equal(
    options.env.SANCHO_CALLBACK_OUTBOX_DIR,
    "/srv/sancho-connector/state/callback-outbox",
  );
  assert.equal(options.env.SANCHO_CONNECTOR_TOKEN, undefined);
  assert.equal(options.env.CODEX_BRIDGE_SECRET, "runtime-secret");
});

test("local connector failure callback carries exact run authority", async () => {
  const calls = [];
  const runtimeToolCapability = "b".repeat(64);
  const ok = await postFailureWebhook(
    {
      slug: "acme",
      threadId: "acme:general",
      missionControlRunId: "run_local_failure_1",
      runtimeToolCapability,
      agent: "sancho",
    },
    "codex",
    new Error(`dispatch failed ${runtimeToolCapability}`),
    {
      baseUrl: "https://sancho.example.com/",
      runtimeSecret: "transport-secret",
      fetchImpl: async (url, init) => {
        calls.push({ url, init });
        return new Response("", { status: 200 });
      },
    },
  );

  assert.equal(ok, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://sancho.example.com/api/chat/webhook");
  assert.equal(calls[0].init.headers["X-MC-Secret"], "transport-secret");
  assert.equal(
    calls[0].init.headers["X-Mission-Control-Run-Id"],
    "run_local_failure_1",
  );
  assert.equal(
    calls[0].init.headers["X-Sancho-Run-Capability"],
    runtimeToolCapability,
  );
  const body = JSON.parse(calls[0].init.body);
  assert.equal(body.missionControlRunId, "run_local_failure_1");
  assert.equal(body.slug, "acme");
  assert.equal(body.threadId, "acme:general");
  assert.match(body.errorDetail.raw, /\[redacted\]/);
  assert.doesNotMatch(JSON.stringify(body), new RegExp(runtimeToolCapability));
});

test("local connector failure callback never invents malformed run authority", async () => {
  let captured;
  await postFailureWebhook(
    {
      slug: "acme",
      threadId: "acme:general",
      missionControlRunId: "run_local_failure_2",
      runtimeToolCapability: "not-a-capability",
    },
    "claude-code",
    new Error("dispatch failed"),
    {
      baseUrl: "https://sancho.example.com",
      runtimeSecret: "transport-secret",
      fetchImpl: async (_url, init) => {
        captured = init;
        return new Response("", { status: 403 });
      },
    },
  );

  assert.equal(captured.headers["X-Mission-Control-Run-Id"], undefined);
  assert.equal(captured.headers["X-Sancho-Run-Capability"], undefined);
});
