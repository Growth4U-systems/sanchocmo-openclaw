import { test } from "node:test";
import assert from "node:assert/strict";
// Consumed as CommonJS by Next.js (no "type": "module" in package.json), so under
// tsx --test the named exports live on `default` — mirror env-file.test.mts.
import * as mod from "../anthropic-auth-route";
const { applyAnthropicRouteToProfiles, isAnthropicProfileForRoute, ANTHROPIC_OAUTH_PROFILE, ANTHROPIC_API_PROFILE } =
  (mod as unknown as { default: typeof mod }).default ?? mod;

test("subscription installs the OAuth profile and strips the API profile, untouched non-anthropic", () => {
  const out = applyAnthropicRouteToProfiles(
    {
      "anthropic:default": { provider: "anthropic", mode: "token" },
      "openai:default": { provider: "openai", mode: "token" },
    },
    "subscription",
  );
  assert.deepEqual(out[ANTHROPIC_OAUTH_PROFILE], { provider: "claude-cli", mode: "oauth" });
  assert.equal(ANTHROPIC_API_PROFILE in out, false);
  assert.deepEqual(out["openai:default"], { provider: "openai", mode: "token" });
});

test("api installs the token profile and strips the OAuth profile", () => {
  const out = applyAnthropicRouteToProfiles({ "anthropic:claude-cli": { provider: "claude-cli", mode: "oauth" } }, "api");
  assert.deepEqual(out[ANTHROPIC_API_PROFILE], { provider: "anthropic", mode: "token" });
  assert.equal(ANTHROPIC_OAUTH_PROFILE in out, false);
});

test("round-trip subscription → api → subscription is stable", () => {
  let p: Record<string, unknown> = { "anthropic:default": { provider: "anthropic", mode: "token" } };
  p = applyAnthropicRouteToProfiles(p, "subscription");
  assert.equal(ANTHROPIC_OAUTH_PROFILE in p, true);
  assert.equal(ANTHROPIC_API_PROFILE in p, false);
  p = applyAnthropicRouteToProfiles(p, "api");
  assert.equal(ANTHROPIC_API_PROFILE in p, true);
  assert.equal(ANTHROPIC_OAUTH_PROFILE in p, false);
  p = applyAnthropicRouteToProfiles(p, "subscription");
  assert.equal(ANTHROPIC_OAUTH_PROFILE in p, true);
  assert.equal(ANTHROPIC_API_PROFILE in p, false);
});

test("field='type' writes the per-agent store shape (type, not mode)", () => {
  const sub = applyAnthropicRouteToProfiles({}, "subscription", "type");
  assert.deepEqual(sub[ANTHROPIC_OAUTH_PROFILE], { provider: "claude-cli", type: "oauth" });
  const api = applyAnthropicRouteToProfiles({}, "api", "type");
  assert.deepEqual(api[ANTHROPIC_API_PROFILE], { provider: "anthropic", type: "token" });
});

test("strips stray anthropic profiles of the opposite kind by provider/kind, not just id", () => {
  const out = applyAnthropicRouteToProfiles({ "anthropic:legacy-oauth": { provider: "claude-cli", type: "oauth" } }, "api");
  assert.equal("anthropic:legacy-oauth" in out, false);
  assert.equal(ANTHROPIC_API_PROFILE in out, true);
});

test("isAnthropicProfileForRoute matches by mode or type, ignores other providers", () => {
  assert.equal(isAnthropicProfileForRoute({ provider: "claude-cli", mode: "oauth" }, true), true);
  assert.equal(isAnthropicProfileForRoute({ provider: "anthropic", type: "token" }, false), true);
  assert.equal(isAnthropicProfileForRoute({ provider: "openai", mode: "token" }, false), false);
  assert.equal(isAnthropicProfileForRoute(null, true), false);
});
