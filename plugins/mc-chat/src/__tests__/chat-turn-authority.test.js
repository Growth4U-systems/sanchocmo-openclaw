import assert from "node:assert/strict";
import test from "node:test";
import {
  authorizeChatTurnWithControlPlane,
  matchesConfiguredSecret,
  validatedControlPlaneOrigin,
} from "../chat-turn-authority.js";

const capability = "a".repeat(64);
const payload = {
  slug: "hospital-capilar",
  threadId: "hospital-capilar:general",
  missionControlRunId: "run-authority-1",
  runtimeToolCapability: capability,
  runtimeAuthorityText: "Busca leads",
  text: "[Trusted derived runtime block]\nBusca leads",
  agent: "sancho",
  agentId: "sancho",
  scope: "agent",
  skillMode: "auto",
  temporaryAgent: false,
  controlDepth: 0,
  isAdmin: true,
  senderRole: "admin",
  readOnly: false,
  userId: "mc-admin",
  userName: "Martin",
};
const authority = {
  slug: "hospital-capilar",
  threadId: "hospital-capilar:general",
  agent: "sancho",
  scope: "agent",
  skillMode: "auto",
  temporaryAgent: false,
  controlDepth: 0,
  isAdmin: true,
  senderRole: "admin",
  readOnly: false,
  userId: "mc-admin",
  userName: "Martin",
};

test("validates a fail-closed control-plane origin", () => {
  assert.equal(
    validatedControlPlaneOrigin("https://staging.sanchocmo.ai/"),
    "https://staging.sanchocmo.ai",
  );
  for (const value of [
    "file:///tmp/auth",
    "https://user:pass@example.com",
    "https://example.com/base",
    "https://example.com?q=redirect",
  ]) {
    assert.equal(validatedControlPlaneOrigin(value), null);
  }
});

test("shared plugin secrets compare exactly and fail closed", () => {
  assert.equal(matchesConfiguredSecret("secret", "secret"), true);
  assert.equal(matchesConfiguredSecret("secret", "different"), false);
  assert.equal(matchesConfiguredSecret(undefined, "secret"), false);
  assert.equal(matchesConfiguredSecret("secret", undefined), false);
});

test("preflight sends capability only as headers, rejects redirects and returns bounded authority", async () => {
  const calls = [];
  const result = await authorizeChatTurnWithControlPlane(
    payload,
    {
      mcServerUrl: "https://staging.sanchocmo.ai",
      sharedSecret: "runtime-secret",
    },
    {
      fetchImpl: async (url, init) => {
        calls.push({ url, init, body: JSON.parse(init.body) });
        return new Response(JSON.stringify({ ok: true, authority }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  );
  assert.deepEqual(result, authority);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].init.redirect, "error");
  assert.equal(
    calls[0].init.headers["X-Sancho-Run-Capability"],
    capability,
  );
  assert.equal(calls[0].body.runtimeAuthorityText, "Busca leads");
  assert.equal(calls[0].body.text, payload.text);
  assert.doesNotMatch(JSON.stringify(calls[0].body), new RegExp(capability));
});

test("missing/fake authority and malformed or oversized responses fail closed", async () => {
  let calls = 0;
  for (const candidate of [
    { ...payload, runtimeToolCapability: undefined },
    { ...payload, runtimeToolCapability: "fake" },
    { ...payload, missionControlRunId: "../other" },
  ]) {
    assert.equal(
      await authorizeChatTurnWithControlPlane(candidate, {
        mcServerUrl: "https://staging.sanchocmo.ai",
        sharedSecret: "runtime-secret",
      }, {
        fetchImpl: async () => {
          calls += 1;
          throw new Error("must not execute");
        },
      }),
      null,
    );
  }
  assert.equal(calls, 0);

  for (const response of [
    new Response("not-json", { status: 200 }),
    new Response(JSON.stringify({ ok: true, authority: { ...authority, isAdmin: "yes" } }), { status: 200 }),
    new Response("x".repeat(17 * 1024), { status: 200 }),
    new Response(JSON.stringify({ error: "denied" }), { status: 403 }),
  ]) {
    const result = await authorizeChatTurnWithControlPlane(
      payload,
      {
        mcServerUrl: "https://staging.sanchocmo.ai",
        sharedSecret: "runtime-secret",
      },
      { fetchImpl: async () => response },
    );
    assert.equal(result, null);
  }
});

test("durable preflight carries the complete lease pair only in headers", async () => {
  const calls = [];
  const dispatchRunId = "dispatch-1";
  const dispatchLeaseToken = "lease-token-" + "d".repeat(32);
  const result = await authorizeChatTurnWithControlPlane(
    payload,
    {
      mcServerUrl: "https://staging.sanchocmo.ai",
      sharedSecret: "runtime-secret",
    },
    {
      dispatchRunId,
      dispatchLeaseToken,
      fetchImpl: async (_url, init) => {
        calls.push(init);
        return new Response(JSON.stringify({ ok: true, authority }), {
          status: 200,
        });
      },
    },
  );
  assert.deepEqual(result, authority);
  assert.equal(calls[0].headers["X-Sancho-Dispatch-Run-Id"], dispatchRunId);
  assert.equal(
    calls[0].headers["X-Sancho-Dispatch-Lease-Token"],
    dispatchLeaseToken,
  );
  assert.doesNotMatch(calls[0].body, new RegExp(dispatchLeaseToken));

  let partialCalls = 0;
  assert.equal(
    await authorizeChatTurnWithControlPlane(
      payload,
      {
        mcServerUrl: "https://staging.sanchocmo.ai",
        sharedSecret: "runtime-secret",
      },
      {
        dispatchRunId,
        fetchImpl: async () => {
          partialCalls += 1;
        },
      },
    ),
    null,
  );
  assert.equal(partialCalls, 0);
});
