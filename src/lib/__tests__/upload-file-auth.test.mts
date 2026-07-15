import assert from "node:assert/strict";
import test from "node:test";
import type { NextApiRequest, NextApiResponse } from "next";
import { uploadFileHandler } from "../../pages/api/upload-file";

function response() {
  const state: { status: number; body?: unknown; headers: Record<string, string> } = {
    status: 200,
    headers: {},
  };
  const res = {
    setHeader(name: string, value: string) {
      state.headers[name.toLowerCase()] = value;
      return this;
    },
    status(code: number) {
      state.status = code;
      return this;
    },
    json(body: unknown) {
      state.body = body;
      return this;
    },
  } as unknown as NextApiResponse;
  return { state, res };
}

test("chat upload rejects a client attempting another tenant", async () => {
  const req = {
    method: "POST",
    query: { slug: "beta" },
    ctx: {
      isAdmin: false,
      clientSlug: "alpha",
      allowedSlugs: null,
      adminToken: null,
      portalClient: { slug: "alpha", name: "Alpha" },
    },
  } as unknown as NextApiRequest;
  const { state, res } = response();

  await uploadFileHandler(req, res);
  assert.equal(state.status, 403);
  assert.deepEqual(state.body, { error: "Forbidden" });
});

test("chat upload rejects an invalid tenant slug before parsing the body", async () => {
  const req = {
    method: "POST",
    query: { slug: "../alpha" },
    ctx: {
      isAdmin: true,
      clientSlug: null,
      allowedSlugs: null,
      adminToken: null,
      portalClient: null,
    },
  } as unknown as NextApiRequest;
  const { state, res } = response();

  await uploadFileHandler(req, res);
  assert.equal(state.status, 400);
  assert.deepEqual(state.body, { error: "Invalid slug" });
});

test("chat upload only accepts POST", async () => {
  const req = { method: "GET", query: {} } as unknown as NextApiRequest;
  const { state, res } = response();

  await uploadFileHandler(req, res);
  assert.equal(state.status, 405);
  assert.equal(state.headers.allow, "POST");
});
