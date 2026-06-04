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
      "sancho_get_chat_thread",
      "sancho_get_client_context",
      "sancho_get_task",
      "sancho_list_chat_threads",
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

test("sancho chat tools read messages and expose pending ask questions", async () => {
  const chatDir = path.join(tmp, "brand", "alpha", "chat");
  fs.mkdirSync(chatDir, { recursive: true });
  fs.writeFileSync(
    path.join(chatDir, "foundation.json"),
    JSON.stringify({
      messages: [
        { role: "user", text: "Quiero lanzar Foundation.", ts: 1000 },
        {
          role: "bot",
          agent: "sancho",
          text: `Elige el alcance:
:::ask
{"id":"q_foundation_scope","prompt":"¿Qué alcance lanzamos?","mode":"single","options":[{"id":"full","label":"Foundation completo"},{"id":"light","label":"Diagnóstico ligero"},{"id":"other","label":"Otro (lo escribo)"}]}
:::`,
          ts: 2000,
        },
      ],
      updatedAt: 2000,
    }),
  );

  const { client, close } = await createConnectedClient({
    id: "operator",
    scopes: ["sancho:chat"],
    clients: ["alpha"],
    tokenHash: "x",
  });
  try {
    const listResult = await client.callTool({
      name: "sancho_list_chat_threads",
      arguments: { clientSlug: "alpha" },
    });
    assert.equal(listResult.isError, undefined);
    const listPayload = JSON.parse(listResult.content[0].type === "text" ? listResult.content[0].text : "{}");
    assert.deepEqual(listPayload.threads.map((thread: { id: string }) => thread.id), ["alpha:foundation"]);

    const getResult = await client.callTool({
      name: "sancho_get_chat_thread",
      arguments: { clientSlug: "alpha", threadId: "foundation" },
    });
    assert.equal(getResult.isError, undefined);
    const payload = JSON.parse(getResult.content[0].type === "text" ? getResult.content[0].text : "{}");
    assert.equal(payload.threadId, "alpha:foundation");
    assert.equal(payload.messageCount, 2);
    assert.equal(payload.pendingQuestions.length, 1);
    assert.equal(payload.pendingQuestions[0].id, "q_foundation_scope");
    assert.equal(payload.pendingQuestions[0].options[0].label, "Foundation completo");
    assert.match(payload.responseFormat, /\[ask:q_foundation_scope\] respuesta:/);
    assert.equal(payload.messages[1].questions[0].prompt, "¿Qué alcance lanzamos?");

    fs.writeFileSync(
      path.join(chatDir, "foundation.json"),
      JSON.stringify({
        messages: [
          { role: "user", text: "Quiero lanzar Foundation.", ts: 1000 },
          {
            role: "bot",
            agent: "sancho",
            text: `Elige el alcance:
:::ask
{"id":"q_foundation_scope","prompt":"¿Qué alcance lanzamos?","mode":"single","options":[{"id":"full","label":"Foundation completo"},{"id":"light","label":"Diagnóstico ligero"},{"id":"other","label":"Otro (lo escribo)"}]}
:::`,
            ts: 2000,
          },
          { role: "user", text: "Foundation completo", ts: 3000 },
          { role: "bot", agent: "sancho", text: "Perfecto, avanzo con Foundation completo.", ts: 4000 },
        ],
        updatedAt: 4000,
      }),
    );
    const staleAskResult = await client.callTool({
      name: "sancho_get_chat_thread",
      arguments: { clientSlug: "alpha", threadId: "foundation" },
    });
    const staleAskPayload = JSON.parse(
      staleAskResult.content[0].type === "text" ? staleAskResult.content[0].text : "{}",
    );
    assert.deepEqual(staleAskPayload.pendingQuestions, []);
    assert.equal(staleAskPayload.responseFormat, null);
  } finally {
    await close();
  }
});

test("sancho chat tools require sancho:chat scope", async () => {
  const { client, close } = await createConnectedClient({
    id: "operator",
    scopes: ["sancho:read"],
    clients: ["alpha"],
    tokenHash: "x",
  });
  try {
    const result = await client.callTool({
      name: "sancho_get_chat_thread",
      arguments: { clientSlug: "alpha", threadId: "foundation" },
    });
    assert.equal(result.isError, true);
    assert.match(result.content[0].type === "text" ? result.content[0].text : "", /sancho:chat/);
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
