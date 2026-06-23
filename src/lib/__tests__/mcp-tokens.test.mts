import { test } from "node:test";
import assert from "node:assert/strict";

const {
  appendMcpTokenConfig,
  generateMcpToken,
  hashMcpToken,
  listMcpTokenSummaries,
  parseMcpTokensJson,
} = await import("../mcp/tokens");

test("listMcpTokenSummaries exposes metadata without plaintext tokens", () => {
  const env = {
    SANCHO_MCP_TOKENS: JSON.stringify([
      {
        id: "team-token",
        tokenHash: hashMcpToken("secret-token"),
        scopes: ["sancho:read"],
        clients: ["growth4u"],
      },
      {
        id: "recoverable-token",
        token: "recoverable-secret",
        scopes: ["docs:read"],
        clients: ["growth4u"],
      },
    ]),
    SANCHO_MCP_TOKEN: "legacy-dummy",
    SANCHO_MCP_TOKEN_ID: "legacy",
    SANCHO_MCP_SCOPES: "tasks:read,docs:read",
    SANCHO_MCP_CLIENTS: "paymatico",
  };

  const summaries = listMcpTokenSummaries(env);
  assert.equal(summaries.length, 3);
  assert.equal(summaries[0].id, "team-token");
  assert.equal(summaries[0].storage, "sha256-hash");
  assert.equal(summaries[0].tokenRecoverable, false);
  assert.deepEqual(summaries[0].brands, ["growth4u"]);
  assert.equal(summaries[1].id, "recoverable-token");
  assert.equal(summaries[1].storage, "plain-env");
  assert.equal(summaries[1].tokenRecoverable, true);
  assert.equal(summaries[2].tokenRecoverable, true);
  assert.equal(JSON.stringify(summaries).includes("secret-token"), false);
  assert.equal(JSON.stringify(summaries).includes("recoverable-secret"), false);
  assert.equal(JSON.stringify(summaries).includes("legacy-dummy"), false);
});

test("generateMcpToken returns one plaintext token and a hash-only config", () => {
  const generated = generateMcpToken({
    id: "claude-code-test",
    scopes: ["sancho:read", "docs:read"],
    clients: ["growth4u", "growth4u"],
    brands: ["growth4u", "xhype"],
  });

  assert.match(generated.token, /^sancho_mcp_/);
  assert.equal(generated.config.id, "claude-code-test");
  assert.equal(generated.config.tokenHash, hashMcpToken(generated.token));
  assert.deepEqual(generated.config.scopes, ["sancho:read", "docs:read"]);
  assert.deepEqual(generated.config.clients, ["growth4u"]);
  assert.deepEqual(generated.config.brands, ["growth4u", "xhype"]);
  assert.equal("token" in generated.config, false);
});

test("appendMcpTokenConfig accepts existing object or array JSON", () => {
  const existingObject = JSON.stringify({
    id: "one",
    tokenHash: hashMcpToken("one"),
    scopes: ["sancho:read"],
    clients: ["growth4u"],
  });
  const next = appendMcpTokenConfig(existingObject, {
    id: "two",
    tokenHash: hashMcpToken("two"),
    scopes: ["docs:read"],
    clients: ["paymatico"],
  });

  const parsed = parseMcpTokensJson(next);
  assert.equal(parsed.length, 2);
  assert.equal(parsed[0].id, "one");
  assert.equal(parsed[1].id, "two");
});

test("generateMcpToken rejects unknown scopes", () => {
  assert.throws(
    () =>
      generateMcpToken({
        id: "bad-scope",
        scopes: ["root:all"],
        clients: ["growth4u"],
      }),
    /Unknown MCP scopes/,
  );
});
