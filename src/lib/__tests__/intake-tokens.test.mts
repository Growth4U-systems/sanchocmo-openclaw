import { test } from "node:test";
import assert from "node:assert/strict";
// intake-tokens.ts is consumed as CommonJS (root package.json has no
// "type": "module"), so under tsx --test the named exports live on the
// `default` namespace — mirror the interop dance used in other tests.
import * as mod from "../intake-tokens";
import type { IntakePayload } from "../intake-tokens";

const { signIntakeToken, verifyIntakeToken, buildIntakeUrl } = (
  mod as unknown as { default: typeof mod }
).default ?? mod;

test("sign → verify round-trips the slug", () => {
  const token = signIntakeToken("acme");
  const payload = verifyIntakeToken(token) as IntakePayload;
  assert.equal(payload?.slug, "acme");
  assert.equal(payload?.kind, "intake");
});

test("a tampered token fails verification", () => {
  const token = signIntakeToken("acme");
  const tampered = token.slice(0, -2) + (token.endsWith("a") ? "b" : "a");
  assert.equal(verifyIntakeToken(tampered), null);
});

test("a share-style token (no kind) is rejected", () => {
  assert.equal(verifyIntakeToken("not.a.valid.token"), null);
  assert.equal(verifyIntakeToken(""), null);
});

test("buildIntakeUrl embeds the token under /intake/", () => {
  const url = buildIntakeUrl("acme", "https://app.example.com");
  assert.match(url, /^https:\/\/app\.example\.com\/intake\/.+/);
  const token = url.split("/intake/")[1];
  assert.equal(verifyIntakeToken(token)?.slug, "acme");
});
