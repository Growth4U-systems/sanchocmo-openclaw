import { test } from "node:test";
import assert from "node:assert/strict";
import type { NextApiRequest, NextApiResponse } from "next";

const { cancelHandler } = await import("@/pages/api/chat/cancel");

function response() {
  let statusCode = 200;
  let payload: Record<string, unknown> = {};
  const res = {
    status(code: number) {
      statusCode = code;
      return this;
    },
    json(value: Record<string, unknown>) {
      payload = value;
      return this;
    },
  } as unknown as NextApiResponse;
  return { res, read: () => ({ statusCode, payload }) };
}

test("cancel denies a caller without access to the requested slug", async () => {
  const mocked = response();
  await cancelHandler({
    method: "POST",
    body: { slug: "other", threadId: "other:general" },
    ctx: { isAdmin: false, clientSlug: "demo" },
  } as unknown as NextApiRequest, mocked.res);
  assert.equal(mocked.read().statusCode, 403);
});

test("cancel rejects a cross-slug thread even when the caller owns the claimed slug", async () => {
  const mocked = response();
  await cancelHandler({
    method: "POST",
    body: { slug: "demo", threadId: "other:general" },
    ctx: { isAdmin: false, clientSlug: "demo" },
  } as unknown as NextApiRequest, mocked.res);
  assert.equal(mocked.read().statusCode, 400);
  assert.match(String(mocked.read().payload.error), /belong/i);
});
