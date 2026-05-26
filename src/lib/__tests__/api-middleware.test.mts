import { test } from "node:test";
import assert from "node:assert/strict";
// api-middleware.ts is consumed as CommonJS by Next.js (root package.json has
// no "type": "module"), so under tsx --test the named exports live on the
// `default` namespace — mirror the interop dance used in mc-chat.test.mts.
import * as mw from "../api-middleware";
import type { RequestContext } from "../api-middleware";
const { canAccessSlug } = (mw as unknown as { default: typeof mw }).default ?? mw;

function ctx(partial: Partial<RequestContext>): RequestContext {
  return {
    isAdmin: false,
    clientSlug: null,
    allowedSlugs: null,
    adminToken: null,
    portalClient: null,
    ...partial,
  };
}

test("admin can access any slug", () => {
  const c = ctx({ isAdmin: true });
  assert.equal(canAccessSlug(c, "anything"), true);
  assert.equal(canAccessSlug(c, "other"), true);
});

test("multi-client member can only access slugs in allowedSlugs", () => {
  const c = ctx({ allowedSlugs: ["a", "b"] });
  assert.equal(canAccessSlug(c, "a"), true);
  assert.equal(canAccessSlug(c, "b"), true);
  assert.equal(canAccessSlug(c, "c"), false);
});

test("single-client portal can only access its own slug", () => {
  const c = ctx({ clientSlug: "mine" });
  assert.equal(canAccessSlug(c, "mine"), true);
  assert.equal(canAccessSlug(c, "yours"), false);
});

test("allowedSlugs takes precedence over clientSlug when both set", () => {
  const c = ctx({ clientSlug: "mine", allowedSlugs: ["a"] });
  assert.equal(canAccessSlug(c, "a"), true);
  assert.equal(canAccessSlug(c, "mine"), false);
});

test("no auth context denies everything", () => {
  assert.equal(canAccessSlug(ctx({}), "a"), false);
  assert.equal(canAccessSlug(undefined, "a"), false);
});
