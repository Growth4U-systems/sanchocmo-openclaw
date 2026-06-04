import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "sancho-mcp-server-"));
process.env.MC_WORKSPACE = tmp;
process.env.SANCHO_MCP_AUDIT_FILE = path.join(tmp, "audit.jsonl");

const CLIENTS_FILE = path.join(tmp, "clients.json");

function seedClients() {
  fs.writeFileSync(
    CLIENTS_FILE,
    JSON.stringify({
      clients: [
        { slug: "alpha", name: "Alpha", active: true, plan: "pro", status: "active" },
        { slug: "beta", name: "Beta", active: true, plan: "pro", status: "active" },
      ],
      adminToken: null,
    }),
  );
}

type McpServerMod = typeof import("../mcp/server");
let mcpServerMod: McpServerMod;

before(async () => {
  seedClients();
  mcpServerMod = await import("../mcp/server");
});

after(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

async function createConnectedClient(principal: Parameters<typeof mcpServerMod.createSanchoMcpServer>[0]["principal"]) {
  const server = mcpServerMod.createSanchoMcpServer({ principal, traceId: "trace-test-1" });
  const client = new Client({ name: "test-client", version: "0.0.1" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

  await server.connect(serverTransport);
  await client.connect(clientTransport);

  return {
    client,
    close: async () => {
      await client.close();
      await server.close();
    },
  };
}

test("tools/list exposes expected MCP schemas", async () => {
  const { client, close } = await createConnectedClient({
    id: "operator",
    scopes: ["*"],
    clients: ["*"],
    tokenHash: "x",
  });
  try {
    const result = await client.listTools();
    const names = result.tools.map((tool) => tool.name).sort();
    assert.deepEqual(names, [
      "open_design_health",
      "open_design_list_catalog",
      "sancho_get_client_context",
      "sancho_get_task",
      "sancho_list_clients",
      "sancho_list_tasks",
      "sancho_mcp_status",
      "sancho_send_message",
      "yalc_get_overview",
      "yalc_list_campaigns",
      "yalc_list_gates",
    ]);

    const sendMessage = result.tools.find((tool) => tool.name === "sancho_send_message");
    assert.ok(sendMessage);
    assert.deepEqual(sendMessage.inputSchema.required, ["clientSlug", "text"]);
  } finally {
    await close();
  }
});

test("sancho_list_clients only returns clients allowed by principal", async () => {
  const { client, close } = await createConnectedClient({
    id: "operator",
    scopes: ["sancho:read"],
    clients: ["alpha"],
    tokenHash: "x",
  });
  try {
    const result = await client.callTool({
      name: "sancho_list_clients",
      arguments: {},
    });
    assert.equal(result.isError, undefined);
    const payload = JSON.parse(result.content[0].type === "text" ? result.content[0].text : "{}");
    assert.deepEqual(payload.clients.map((clientRow: { slug: string }) => clientRow.slug), ["alpha"]);
  } finally {
    await close();
  }
});

test("sancho_mcp_status exposes trace id for request correlation", async () => {
  const { client, close } = await createConnectedClient({
    id: "operator",
    scopes: ["*"],
    clients: ["*"],
    tokenHash: "x",
  });
  try {
    const result = await client.callTool({
      name: "sancho_mcp_status",
      arguments: {},
    });
    assert.equal(result.isError, undefined);
    const payload = JSON.parse(result.content[0].type === "text" ? result.content[0].text : "{}");
    assert.equal(payload.traceId, "trace-test-1");
  } finally {
    await close();
  }
});

test("client-scoped tools reject clients outside token whitelist", async () => {
  const { client, close } = await createConnectedClient({
    id: "operator",
    scopes: ["sancho:read"],
    clients: ["alpha"],
    tokenHash: "x",
  });
  try {
    const result = await client.callTool({
      name: "sancho_get_client_context",
      arguments: { clientSlug: "beta" },
    });
    assert.equal(result.isError, true);
    assert.match(result.content[0].type === "text" ? result.content[0].text : "", /not allowed/i);
  } finally {
    await close();
  }
});
