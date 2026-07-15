import { after, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { NextApiRequest, NextApiResponse } from "next";
import type { RequestContext } from "../api-middleware";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "sancho-system-health-auth-"));
process.env.MC_WORKSPACE = tmp;
delete process.env.LOCAL_DASHBOARD_BYPASS;
fs.writeFileSync(
  path.join(tmp, "clients.json"),
  JSON.stringify({
    adminToken: "admin-token-1234567890",
    clients: [
      { slug: "alpha", name: "Alpha", active: true, mcToken: "alpha-token-1234567890" },
      { slug: "beta", name: "Beta", active: true, mcToken: "beta-token-12345678901" },
    ],
  }),
);

const healthRoute = await import("../../pages/api/system/health-check-all");
const legacyHealthRoute = await import("../../pages/api/system/health-check");

function context(partial: Partial<RequestContext>): RequestContext {
  return {
    isAdmin: false,
    clientSlug: null,
    allowedSlugs: null,
    adminToken: null,
    portalClient: null,
    ...partial,
  };
}

function response() {
  let statusCode = 200;
  let payload: unknown;
  const headers = new Map<string, string>();
  const res = {
    setHeader(name: string, value: string) {
      headers.set(name.toLowerCase(), String(value));
      return this;
    },
    status(code: number) {
      statusCode = code;
      return this;
    },
    json(value: unknown) {
      payload = value;
      return this;
    },
  } as unknown as NextApiResponse;
  return { res, read: () => ({ statusCode, payload, headers }) };
}

function request(
  query: NextApiRequest["query"],
  options: { ctx?: RequestContext; authorization?: string } = {},
): NextApiRequest {
  return {
    method: "GET",
    query,
    headers: {
      host: "example.test",
      ...(options.authorization ? { authorization: options.authorization } : {}),
    },
    ...(options.ctx ? { ctx: options.ctx } : {}),
  } as unknown as NextApiRequest;
}

test("both system health routes reject unauthenticated requests", async () => {
  for (const entry of [healthRoute.default, legacyHealthRoute.default]) {
    const mocked = response();
    await entry(request({ service: "minimax" }), mocked.res);
    assert.equal(mocked.read().statusCode, 403);
  }
});

test("tenant-scoped users cannot run provider health checks", async () => {
  const mocked = response();
  await healthRoute.healthCheckHandler(
    request(
      { service: "minimax", slug: "beta" },
      { ctx: context({ clientSlug: "alpha" }) },
    ),
    mocked.res,
  );
  assert.equal(mocked.read().statusCode, 403);
});

test("single-tenant health checks cannot inherit global provider credentials", async () => {
  const mocked = response();
  await healthRoute.healthCheckHandler(
    request(
      { service: "minimax" },
      { ctx: context({ clientSlug: "alpha" }) },
    ),
    mocked.res,
  );
  assert.equal(mocked.read().statusCode, 403);
  assert.match(String((mocked.read().payload as { error?: string }).error), /admin/i);
});

test("multi-tenant users cannot run global health checks", async () => {
  const mocked = response();
  await healthRoute.healthCheckHandler(
    request(
      { service: "minimax" },
      { ctx: context({ allowedSlugs: ["alpha", "beta"] }) },
    ),
    mocked.res,
  );
  assert.equal(mocked.read().statusCode, 403);
  assert.match(String((mocked.read().payload as { error?: string }).error), /admin/i);
});

test("legacy health route rejects shell-shaped service input without CORS or execution", async () => {
  const marker = path.join(tmp, "injection-marker");
  const maliciousService = `openai;touch ${marker}`;
  const mocked = response();
  await legacyHealthRoute.default(
    request(
      { service: maliciousService },
      { authorization: "Bearer admin-token-1234567890" },
    ),
    mocked.res,
  );

  assert.equal(mocked.read().statusCode, 400);
  assert.equal(fs.existsSync(marker), false);
  assert.equal(mocked.read().headers.has("access-control-allow-origin"), false);
});

test("health query parameter pollution is rejected", async () => {
  const mocked = response();
  await healthRoute.healthCheckHandler(
    request(
      { service: ["minimax", "openai"] },
      { ctx: context({ isAdmin: true }) },
    ),
    mocked.res,
  );
  assert.equal(mocked.read().statusCode, 400);
});

after(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});
