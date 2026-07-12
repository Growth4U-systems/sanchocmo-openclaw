import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "sancho-mcp-auth-"));
process.env.MC_WORKSPACE = tmp;
process.env.SANCHO_MCP_TOKEN = "dev-token";
process.env.SANCHO_MCP_TOKEN_ID = "test-operator";
process.env.SANCHO_MCP_SCOPES = "sancho:read,tasks:read";
process.env.SANCHO_MCP_CLIENTS = "alpha";

const CLIENTS_FILE = path.join(tmp, "clients.json");

function seedClients() {
  fs.writeFileSync(
    CLIENTS_FILE,
    JSON.stringify({
      clients: [
        { slug: "alpha", name: "Alpha", active: true },
        { slug: "beta", name: "Beta", active: true },
      ],
      adminToken: null,
    }),
  );
}

function mockReq(authorization?: string) {
  return {
    headers: authorization ? { authorization } : {},
  };
}

type AuthMod = typeof import("../mcp/auth");
let auth: AuthMod;

before(async () => {
  seedClients();
  auth = await import("../mcp/auth");
});

after(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

test("authenticateMcpRequest accepts configured bearer token", () => {
  const principal = auth.authenticateMcpRequest(mockReq("Bearer dev-token") as never);
  assert.equal(principal.id, "test-operator");
  assert.deepEqual(principal.scopes, ["sancho:read", "tasks:read"]);
  assert.deepEqual(principal.clients, ["alpha"]);
  assert.deepEqual(principal.brands, ["alpha"]);
  assert.equal(principal.tokenHash.length, 64);
});

test("authenticateMcpRequest rejects missing bearer token", () => {
  assert.throws(
    () => auth.authenticateMcpRequest(mockReq() as never),
    (err) => err instanceof auth.McpAuthError && err.status === 401,
  );
});

test("authenticateMcpRequest rejects invalid bearer token", () => {
  assert.throws(
    () => auth.authenticateMcpRequest(mockReq("Bearer wrong-token") as never),
    (err) => err instanceof auth.McpAuthError && err.status === 403,
  );
});

test("assertMcpScope supports exact and namespace wildcard scopes", () => {
  const exact = {
    id: "exact",
    scopes: ["tasks:read"],
    clients: ["alpha"],
    tokenHash: "x",
  };
  const wildcard = {
    id: "wildcard",
    scopes: ["tasks:*"],
    clients: ["alpha"],
    tokenHash: "x",
  };

  assert.doesNotThrow(() => auth.assertMcpScope(exact, "tasks:read"));
  assert.doesNotThrow(() => auth.assertMcpScope(wildcard, "tasks:read"));
  assert.throws(
    () => auth.assertMcpScope(exact, "sancho:read"),
    (err) => err instanceof auth.McpAuthError && err.status === 403,
  );
});

test("quality evidence requires its dedicated read-only scope", () => {
  const qualityReader = {
    id: "quality-lab",
    scopes: ["quality:read"],
    clients: ["alpha"],
    tokenHash: "x",
  };
  const genericReader = {
    id: "generic-reader",
    scopes: ["sancho:read"],
    clients: ["alpha"],
    tokenHash: "x",
  };

  assert.doesNotThrow(() => auth.assertMcpScope(qualityReader, "quality:read"));
  assert.throws(
    () => auth.assertMcpScope(genericReader, "quality:read"),
    (err) => err instanceof auth.McpAuthError && err.status === 403,
  );
});

test("assertMcpScope treats legacy sancho:chat as chat read/write", () => {
  const legacy = {
    id: "legacy",
    scopes: ["sancho:chat"],
    clients: ["alpha"],
    tokenHash: "x",
  };

  assert.doesNotThrow(() => auth.assertMcpScope(legacy, "chat:read"));
  assert.doesNotThrow(() => auth.assertMcpScope(legacy, "chat:write"));
  assert.throws(
    () => auth.assertMcpScope(legacy, "tasks:read"),
    (err) => err instanceof auth.McpAuthError && err.status === 403,
  );
});

test("assertMcpAnyScope accepts any matching scope", () => {
  const principal = {
    id: "operator",
    scopes: ["clients:read"],
    clients: ["alpha"],
    tokenHash: "x",
  };

  assert.doesNotThrow(() => auth.assertMcpAnyScope(principal, ["clients:read", "sancho:read"]));
  assert.throws(
    () => auth.assertMcpAnyScope(principal, ["agents:read", "sancho:read"]),
    (err) => err instanceof auth.McpAuthError && err.status === 403,
  );
});

test("assertMcpClientAccess enforces client whitelist", () => {
  const principal = {
    id: "operator",
    scopes: ["sancho:read"],
    clients: ["alpha"],
    tokenHash: "x",
  };

  assert.doesNotThrow(() => auth.assertMcpClientAccess(principal, "alpha"));
  assert.throws(
    () => auth.assertMcpClientAccess(principal, "beta"),
    (err) => err instanceof auth.McpAuthError && err.status === 403,
  );
  assert.throws(
    () => auth.assertMcpClientAccess(principal, "ghost"),
    (err) => err instanceof auth.McpAuthError && err.status === 404,
  );
});

test("authenticateMcpRequest accepts explicit brand access separate from clients", () => {
  const previousBrands = process.env.SANCHO_MCP_BRANDS;
  process.env.SANCHO_MCP_BRANDS = "alpha,xhype";
  try {
    const principal = auth.authenticateMcpRequest(mockReq("Bearer dev-token") as never);
    assert.deepEqual(principal.clients, ["alpha"]);
    assert.deepEqual(principal.brands, ["alpha", "xhype"]);
  } finally {
    if (previousBrands === undefined) delete process.env.SANCHO_MCP_BRANDS;
    else process.env.SANCHO_MCP_BRANDS = previousBrands;
  }
});

test("assertMcpBrandAccess falls back to clients when brands are omitted", () => {
  const principal = {
    id: "operator",
    scopes: ["docs:read"],
    clients: ["alpha"],
    tokenHash: "x",
  };

  assert.doesNotThrow(() => auth.assertMcpBrandAccess(principal, "alpha"));
  assert.throws(
    () => auth.assertMcpBrandAccess(principal, "xhype"),
    (err) => err instanceof auth.McpAuthError && err.status === 403,
  );
});

test("assertMcpBrandAccess supports explicit and wildcard brand whitelists", () => {
  const explicit = {
    id: "operator",
    scopes: ["docs:read"],
    clients: ["growth4u"],
    brands: ["growth4u", "xhype"],
    tokenHash: "x",
  };
  const wildcard = {
    id: "operator",
    scopes: ["docs:read"],
    clients: ["growth4u"],
    brands: ["*"],
    tokenHash: "x",
  };

  assert.doesNotThrow(() => auth.assertMcpBrandAccess(explicit, "xhype"));
  assert.doesNotThrow(() => auth.assertMcpBrandAccess(wildcard, "other-brand"));
  assert.throws(
    () => auth.assertMcpBrandAccess(explicit, "other-brand"),
    (err) => err instanceof auth.McpAuthError && err.status === 403,
  );
});

test("assertMcpBrandAccess can require docs:write separately from docs:read", () => {
  const readOnly = {
    id: "operator",
    scopes: ["docs:read"],
    clients: ["alpha"],
    brands: ["alpha"],
    tokenHash: "x",
  };
  const write = {
    id: "operator",
    scopes: ["docs:write"],
    clients: ["alpha"],
    brands: ["alpha"],
    tokenHash: "x",
  };

  assert.throws(
    () => auth.assertMcpBrandAccess(readOnly, "alpha", "docs:write"),
    (err) => err instanceof auth.McpAuthError && err.status === 403,
  );
  assert.doesNotThrow(() => auth.assertMcpBrandAccess(write, "alpha", "docs:write"));
});
