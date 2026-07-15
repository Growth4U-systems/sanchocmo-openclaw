import assert from "node:assert/strict";
import test from "node:test";
import type { NextApiRequest, NextApiResponse } from "next";
import { healthHandler } from "../../pages/api/health";

type HealthPayload = {
  ok?: boolean;
  commit?: string | null;
  imageDigest?: string | null;
  imageRef?: string | null;
  error?: string;
};

function invokeHealth(method = "GET") {
  let statusCode = 200;
  let payload: HealthPayload | undefined;
  const headers = new Map<string, string>();

  const req = { method } as NextApiRequest;
  const res = {
    setHeader(name: string, value: string) {
      headers.set(name.toLowerCase(), value);
      return this;
    },
    status(code: number) {
      statusCode = code;
      return this;
    },
    json(value: HealthPayload) {
      payload = value;
      return this;
    },
  } as unknown as NextApiResponse;

  healthHandler(req, res);
  return { statusCode, payload, headers };
}

test("health reports the immutable deployment identity", () => {
  const previousCommit = process.env.GIT_COMMIT;
  const previousDigest = process.env.SANCHOCMO_IMAGE_DIGEST;
  const previousRef = process.env.SANCHOCMO_IMAGE;

  process.env.GIT_COMMIT = "abc123";
  process.env.SANCHOCMO_IMAGE_DIGEST = "ghcr.io/example/sancho@sha256:deadbeef";
  process.env.SANCHOCMO_IMAGE = "ghcr.io/example/sancho:v1";

  try {
    const response = invokeHealth();
    assert.equal(response.statusCode, 200);
    assert.equal(response.payload?.ok, true);
    assert.equal(response.payload?.commit, "abc123");
    assert.equal(
      response.payload?.imageDigest,
      "ghcr.io/example/sancho@sha256:deadbeef"
    );
    assert.equal(response.payload?.imageRef, "ghcr.io/example/sancho:v1");
    assert.equal(response.headers.get("cache-control"), "no-store");
  } finally {
    if (previousCommit === undefined) delete process.env.GIT_COMMIT;
    else process.env.GIT_COMMIT = previousCommit;
    if (previousDigest === undefined) delete process.env.SANCHOCMO_IMAGE_DIGEST;
    else process.env.SANCHOCMO_IMAGE_DIGEST = previousDigest;
    if (previousRef === undefined) delete process.env.SANCHOCMO_IMAGE;
    else process.env.SANCHOCMO_IMAGE = previousRef;
  }
});

test("health rejects unsupported methods", () => {
  const response = invokeHealth("POST");
  assert.equal(response.statusCode, 405);
  assert.equal(response.payload?.ok, false);
  assert.equal(response.headers.get("allow"), "GET");
});
