import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveChatUserId } from "../sender-identity.js";

test("browser JSON cannot choose the runtime sender id", () => {
  assert.equal(resolveChatUserId({
    trustedRuntimeRequest: false,
    isAdmin: false,
    slug: "acme",
    claimedUserId: "mc-admin",
  }), "mc-client-acme");

  assert.equal(resolveChatUserId({
    trustedRuntimeRequest: false,
    isAdmin: true,
    slug: "acme",
    claimedUserId: "attacker",
  }), "mc-admin");
});

test("trusted client follow-ups preserve safe ids but never the reserved admin id", () => {
  assert.equal(resolveChatUserId({
    trustedRuntimeRequest: true,
    isAdmin: false,
    slug: "acme",
    claimedUserId: "discord:12345",
  }), "discord:12345");

  assert.equal(resolveChatUserId({
    trustedRuntimeRequest: true,
    isAdmin: false,
    slug: "acme",
    claimedUserId: "MC-ADMIN",
  }), "mc-client-acme");
});
