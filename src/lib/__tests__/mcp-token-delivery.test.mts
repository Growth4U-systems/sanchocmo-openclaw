import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "sancho-mcp-token-"));
process.env.MC_WORKSPACE = tmp;

const CLIENTS_FILE = path.join(tmp, "clients.json");

function seedClients() {
  fs.writeFileSync(
    CLIENTS_FILE,
    JSON.stringify({
      clients: [
        { slug: "growth4u", name: "Growth4U", active: true, plan: "pro", status: "active" },
        { slug: "paymatico", name: "Paymatico", active: true, plan: "pro", status: "active" },
      ],
      adminToken: null,
    }),
  );
}

type AlarifeMod = typeof import("../mcp/alarife");
type AuthMod = typeof import("../mcp/auth");
let alarife: AlarifeMod;
let auth: AuthMod;

before(async () => {
  seedClients();
  process.env.GROWTH4U_ALARIFE_WEB_MCP_TOKEN = "tok-growth4u-web";
  delete process.env.PAYMATICO_ALARIFE_WEB_MCP_TOKEN;
  alarife = await import("../mcp/alarife");
  auth = await import("../mcp/auth");
});

after(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
  delete process.env.GROWTH4U_ALARIFE_WEB_MCP_TOKEN;
});

type McpPrincipal = import("../mcp/auth").McpPrincipal;

function principal(overrides: Partial<McpPrincipal> = {}): McpPrincipal {
  return {
    id: "test-team",
    scopes: ["sancho:read"],
    clients: ["growth4u"],
    brands: ["growth4u"],
    tokenHash: "hash",
    ...overrides,
  };
}

test("delivers the token for an allowed client/alarife", () => {
  const delivery = alarife.deliverAlarifeMcpToken(principal(), "growth4u", "web");
  assert.equal(delivery.token, "tok-growth4u-web");
  assert.equal(delivery.mcpUrl, "https://admin.alarife-payload.growth4u.io/api/mcp");
  assert.equal(delivery.mcpServerName, "alarife-growth4u-web");
  assert.equal(delivery.secretEnvKey, "GROWTH4U_ALARIFE_WEB_MCP_TOKEN");
});

test("fails closed for a client outside the token scope", () => {
  assert.throws(
    () => alarife.deliverAlarifeMcpToken(principal({ clients: ["growth4u"] }), "paymatico", "web"),
    (err: unknown) => err instanceof auth.McpAuthError && err.status === 403,
  );
});

test("requires sancho:read scope", () => {
  assert.throws(
    () => alarife.deliverAlarifeMcpToken(principal({ scopes: [] }), "growth4u", "web"),
    (err: unknown) => err instanceof auth.McpAuthError && err.status === 403,
  );
});

test("returns 424 when the secret is not configured", () => {
  assert.throws(
    () =>
      alarife.deliverAlarifeMcpToken(
        principal({ clients: ["paymatico"], brands: ["paymatico"] }),
        "paymatico",
        "web",
      ),
    (err: unknown) => err instanceof auth.McpAuthError && err.status === 424,
  );
});
