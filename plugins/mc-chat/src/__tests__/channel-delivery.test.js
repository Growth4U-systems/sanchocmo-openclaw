import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveAccount } from "../account.js";

// mc-chat delivers bot replies to `${mcServerUrl}/api/chat/webhook`, a route that
// ONLY exists on the Next.js app (:3000), never the legacy mc-server.js (:18790).
// These guard SAN-333: the resolved default must point at Next, not the legacy port.

test("resolveAccount defaults mcServerUrl to Next (:3000), not legacy :18790", () => {
  const account = resolveAccount({}, undefined);
  assert.equal(account.mcServerUrl, "http://localhost:3000");
});

test("resolveAccount defaults to Next when the channel section omits mcServerUrl", () => {
  const account = resolveAccount({ channels: { "mc-chat": { sharedSecret: "s" } } }, undefined);
  assert.equal(account.mcServerUrl, "http://localhost:3000");
  assert.equal(account.sharedSecret, "s");
});

test("resolveAccount honors an explicit mcServerUrl override", () => {
  const account = resolveAccount(
    { channels: { "mc-chat": { mcServerUrl: "http://next.internal:3000" } } },
    undefined,
  );
  assert.equal(account.mcServerUrl, "http://next.internal:3000");
});
