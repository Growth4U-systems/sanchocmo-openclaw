import { test } from "node:test";
import assert from "node:assert/strict";
// api-middleware.ts is consumed as CommonJS by Next.js (root package.json has
// no "type": "module"), so under tsx --test the named exports live on the
// `default` namespace — mirror the interop dance used in mc-chat.test.mts.
import * as mw from "../api-middleware";
import type { RequestContext } from "../api-middleware";
const { canAccessSlug, withErrorHandler } = (mw as unknown as { default: typeof mw }).default ?? mw;

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

test("withErrorHandler propagates a safe request trace through the handler", async () => {
  const headers = new Map<string, string>();
  let payload: unknown;
  const req = {
    method: "GET",
    url: "/api/test",
    headers: { "x-request-id": "support-case-123" },
  } as never;
  const res = {
    headersSent: false,
    setHeader(name: string, value: string) {
      headers.set(name.toLowerCase(), value);
    },
    status() {
      return this;
    },
    json(value: unknown) {
      payload = value;
      return this;
    },
  } as never;

  await withErrorHandler(async (request) => {
    assert.equal(request.traceContext?.traceId, "support-case-123");
  })(req, res);

  assert.equal(headers.get("x-request-id"), "support-case-123");
  assert.match(headers.get("traceparent") ?? "", /^00-[a-f0-9]{32}-[a-f0-9]{16}-01$/);
  assert.equal(payload, undefined);
});

test("withErrorHandler returns the correlation id with a sanitized 500", async () => {
  let statusCode = 0;
  let payload: unknown;
  const req = {
    method: "POST",
    url: "/api/test",
    headers: { "x-request-id": "invalid id with spaces" },
  } as never;
  const res = {
    headersSent: false,
    setHeader() {},
    status(value: number) {
      statusCode = value;
      return this;
    },
    json(value: unknown) {
      payload = value;
      return this;
    },
  } as never;

  const originalError = console.error;
  console.error = () => undefined;
  try {
    await withErrorHandler(async () => {
      throw new Error("boom");
    })(req, res);
  } finally {
    console.error = originalError;
  }

  assert.equal(statusCode, 500);
  assert.equal(typeof (payload as { traceId?: unknown }).traceId, "string");
  assert.notEqual((payload as { traceId?: unknown }).traceId, "invalid id with spaces");
  assert.equal((payload as { error?: unknown }).error, "Internal server error");
});
