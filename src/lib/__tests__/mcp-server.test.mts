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

function seedDocument(relPath: string, content: string) {
  const absPath = path.join(tmp, relPath);
  fs.mkdirSync(path.dirname(absPath), { recursive: true });
  fs.writeFileSync(absPath, content, "utf8");
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
      "sancho_create_task",
      "sancho_delegate",
      "sancho_get_chat_thread",
      "sancho_get_client_context",
      "sancho_get_document",
      // SAN-217: Meeting Intelligence read tools
      "sancho_get_meeting",
      "sancho_get_task",
      // SAN-17: public intake-form link (stateless token, read-only)
      "sancho_intake_create_link",
      "sancho_list_chat_threads",
      "sancho_list_clients",
      "sancho_list_documents",
      "sancho_list_intelligence",
      "sancho_list_meetings",
      "sancho_list_tasks",
      "sancho_mcp_status",
      "sancho_send_message",
      "sancho_update_task",
      // SAN-80: gates de envío + plantillas (escritura espejo de la UI)
      "yalc_approve_gate",
      "yalc_assign_template",
      // SAN-75b: calc break-even (registrada por registerYalcBreakevenTool)
      "yalc_breakeven",
      "yalc_create_search",
      // SAN-81: reporting por creator (misma agregación que la UI de Metrics)
      "yalc_creator_report",
      // SAN-76: model settings (lectura efectiva + PUT parcial espejo de la UI)
      "yalc_get_model_config",
      "yalc_get_overview",
      "yalc_list_campaigns",
      "yalc_list_gates",
      "yalc_list_leads",
      "yalc_set_lead_stage",
      "yalc_update_model_config",
    ]);

    const sendMessage = result.tools.find((tool) => tool.name === "sancho_send_message");
    assert.ok(sendMessage);
    assert.deepEqual(sendMessage.inputSchema.required, ["clientSlug", "text"]);

    const delegate = result.tools.find((tool) => tool.name === "sancho_delegate");
    assert.ok(delegate);
    assert.deepEqual(delegate.inputSchema.required, ["clientSlug", "agent", "name", "brief"]);

    const updateModelConfig = result.tools.find((tool) => tool.name === "yalc_update_model_config");
    assert.ok(updateModelConfig);
    assert.deepEqual(updateModelConfig.inputSchema.required, ["clientSlug"]);

    const setLeadStage = result.tools.find((tool) => tool.name === "yalc_set_lead_stage");
    assert.ok(setLeadStage);
    assert.deepEqual(setLeadStage.inputSchema.required, ["clientSlug", "leadId", "stage"]);

    const createSearch = result.tools.find((tool) => tool.name === "yalc_create_search");
    assert.ok(createSearch);
    assert.deepEqual(createSearch.inputSchema.required, ["clientSlug", "title", "sectors", "networks"]);
  } finally {
    await close();
  }
});

test("yalc_list_leads requires yalc:read scope", async () => {
  const { client, close } = await createConnectedClient({
    id: "operator",
    scopes: ["sancho:read"],
    clients: ["alpha"],
    tokenHash: "x",
  });
  try {
    const result = await client.callTool({
      name: "yalc_list_leads",
      arguments: { clientSlug: "alpha" },
    });
    assert.equal(result.isError, true);
    assert.match(result.content[0].type === "text" ? result.content[0].text : "", /yalc:read/);
  } finally {
    await close();
  }
});

test("yalc_set_lead_stage requires yalc:write scope (read is not enough)", async () => {
  const { client, close } = await createConnectedClient({
    id: "operator",
    scopes: ["yalc:read"],
    clients: ["alpha"],
    tokenHash: "x",
  });
  try {
    const result = await client.callTool({
      name: "yalc_set_lead_stage",
      arguments: { clientSlug: "alpha", leadId: "lead-1", stage: "Qualified" },
    });
    assert.equal(result.isError, true);
    assert.match(result.content[0].type === "text" ? result.content[0].text : "", /yalc:write/);
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

test("sancho_list_meetings requires intelligence:read scope", async () => {
  const { client, close } = await createConnectedClient({
    id: "operator",
    scopes: ["sancho:read"],
    clients: ["alpha"],
    tokenHash: "x",
  });
  try {
    const result = await client.callTool({
      name: "sancho_list_meetings",
      arguments: { clientSlug: "alpha" },
    });
    assert.equal(result.isError, true);
    assert.match(result.content[0].type === "text" ? result.content[0].text : "", /intelligence:read/);
  } finally {
    await close();
  }
});

test("intelligence read tools are wired and degrade cleanly without a database", async () => {
  const { client, close } = await createConnectedClient({
    id: "operator",
    scopes: ["intelligence:read"],
    clients: ["alpha"],
    tokenHash: "x",
  });
  try {
    const meetings = await client.callTool({
      name: "sancho_list_meetings",
      arguments: { clientSlug: "alpha" },
    });
    assert.equal(meetings.isError, undefined);
    const meetingsPayload = JSON.parse(meetings.content[0].type === "text" ? meetings.content[0].text : "{}");
    assert.deepEqual(meetingsPayload.meetings, []);
    assert.equal(meetingsPayload.storage.configured, false);

    const intelligence = await client.callTool({
      name: "sancho_list_intelligence",
      arguments: { clientSlug: "alpha" },
    });
    assert.equal(intelligence.isError, undefined);
    const intelligencePayload = JSON.parse(
      intelligence.content[0].type === "text" ? intelligence.content[0].text : "{}",
    );
    assert.deepEqual(intelligencePayload.intelligence, []);
    assert.equal(intelligencePayload.storage.configured, false);

    const meeting = await client.callTool({
      name: "sancho_get_meeting",
      arguments: { clientSlug: "alpha", meetingId: "missing" },
    });
    assert.equal(meeting.isError, undefined);
    const meetingPayload = JSON.parse(meeting.content[0].type === "text" ? meeting.content[0].text : "{}");
    assert.equal(meetingPayload.ok, false);
    assert.equal(meetingPayload.storage.configured, false);
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
    assert.deepEqual(payload.principal.brands, ["*"]);
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

function payloadOf(result: Awaited<ReturnType<Client["callTool"]>>): Record<string, unknown> {
  const first = Array.isArray(result.content) ? result.content[0] : undefined;
  return JSON.parse(first && first.type === "text" ? first.text : "{}");
}

test("sancho_list_documents lists allowed Brand Brain docs and skips chat/system folders", async () => {
  seedDocument("brand/xhype/market-and-us/market/current.md", "# XHYPE Market\n\nMarket analysis");
  seedDocument("brand/xhype/market-and-us/competitors/current.html", "<h1>Competitors</h1>");
  seedDocument("brand/xhype/chat/internal.md", "# Chat should not be listed");

  const { client, close } = await createConnectedClient({
    id: "operator",
    scopes: ["docs:read"],
    clients: ["growth4u"],
    brands: ["growth4u", "xhype"],
    tokenHash: "x",
  });
  try {
    const result = await client.callTool({
      name: "sancho_list_documents",
      arguments: { brandSlug: "xhype", pathPrefix: "market-and-us", limit: 10 },
    });
    assert.equal(result.isError, undefined);
    const payload = payloadOf(result);
    const paths = (payload.documents as Array<{ path: string }>).map((doc) => doc.path).sort();
    assert.deepEqual(paths, [
      "brand/xhype/market-and-us/competitors/current.html",
      "brand/xhype/market-and-us/market/current.md",
    ]);
    assert.equal(payload.brandSlug, "xhype");
    assert.equal(payload.traceId, "trace-test-1");
  } finally {
    await close();
  }
});

test("sancho_get_document reads documents by relative and full path for an explicitly allowed sub-brand", async () => {
  seedDocument("brand/xhype/market-and-us/self/current.md", "# XHYPE Self\n\nSelf analysis");

  const { client, close } = await createConnectedClient({
    id: "operator",
    scopes: ["docs:read"],
    clients: ["growth4u"],
    brands: ["growth4u", "xhype"],
    tokenHash: "x",
  });
  try {
    const relative = await client.callTool({
      name: "sancho_get_document",
      arguments: { brandSlug: "xhype", docPath: "market-and-us/self/current.md" },
    });
    assert.equal(relative.isError, undefined);
    const relativePayload = payloadOf(relative);
    assert.equal(relativePayload.path, "brand/xhype/market-and-us/self/current.md");
    assert.match(String(relativePayload.content), /XHYPE Self/);
    assert.equal(relativePayload.truncated, false);

    const full = await client.callTool({
      name: "sancho_get_document",
      arguments: { brandSlug: "xhype", docPath: "brand/xhype/market-and-us/self/current.md" },
    });
    assert.equal(payloadOf(full).canonicalPath, "brand/xhype/market-and-us/self/current.md");
  } finally {
    await close();
  }
});

test("sancho_get_document requires docs:read scope", async () => {
  seedDocument("brand/xhype/market-and-us/market/current.md", "# XHYPE Market");

  const { client, close } = await createConnectedClient({
    id: "operator",
    scopes: ["sancho:read"],
    clients: ["growth4u"],
    brands: ["xhype"],
    tokenHash: "x",
  });
  try {
    const result = await client.callTool({
      name: "sancho_get_document",
      arguments: { brandSlug: "xhype", docPath: "market-and-us/market/current.md" },
    });
    assert.equal(result.isError, true);
    assert.match(result.content[0].type === "text" ? result.content[0].text : "", /docs:read/);
  } finally {
    await close();
  }
});

test("sancho_get_document rejects denied brands, traversal, wrong brand paths, unsupported extensions and truncates", async () => {
  seedDocument("brand/xhype/market-and-us/market/current.md", "# XHYPE Market");
  seedDocument("brand/xhype/market-and-us/raw/data.json", "{}");
  seedDocument("brand/xhype/market-and-us/long/current.md", "a".repeat(120));

  const { client, close } = await createConnectedClient({
    id: "operator",
    scopes: ["docs:read"],
    clients: ["growth4u"],
    brands: ["xhype"],
    tokenHash: "x",
  });
  try {
    const denied = await client.callTool({
      name: "sancho_get_document",
      arguments: { brandSlug: "alpha", docPath: "market-and-us/market/current.md" },
    });
    assert.equal(denied.isError, true);
    assert.match(denied.content[0].type === "text" ? denied.content[0].text : "", /not allowed to access brand/i);

    const traversal = await client.callTool({
      name: "sancho_get_document",
      arguments: { brandSlug: "xhype", docPath: "../alpha/market-and-us/market/current.md" },
    });
    assert.equal(traversal.isError, true);
    assert.match(traversal.content[0].type === "text" ? traversal.content[0].text : "", /traversal/i);

    const wrongBrand = await client.callTool({
      name: "sancho_get_document",
      arguments: { brandSlug: "xhype", docPath: "brand/alpha/market-and-us/market/current.md" },
    });
    assert.equal(wrongBrand.isError, true);
    assert.match(wrongBrand.content[0].type === "text" ? wrongBrand.content[0].text : "", /different brand/i);

    const unsupported = await client.callTool({
      name: "sancho_get_document",
      arguments: { brandSlug: "xhype", docPath: "market-and-us/raw/data.json" },
    });
    assert.equal(unsupported.isError, true);
    assert.match(unsupported.content[0].type === "text" ? unsupported.content[0].text : "", /Unsupported document extension/i);

    const truncated = await client.callTool({
      name: "sancho_get_document",
      arguments: { brandSlug: "xhype", docPath: "market-and-us/long/current.md", maxChars: 10 },
    });
    const payload = payloadOf(truncated);
    assert.equal(payload.truncated, true);
    assert.equal(String(payload.content).length, 10);
  } finally {
    await close();
  }
});

test("sancho_create_task is dry-run by default and writes nothing", async () => {
  const { client, close } = await createConnectedClient({
    id: "operator",
    scopes: ["tasks:write", "tasks:read"],
    clients: ["alpha"],
    tokenHash: "x",
  });
  try {
    const result = await client.callTool({
      name: "sancho_create_task",
      arguments: { clientSlug: "alpha", name: "Proyecto de prueba" },
    });
    assert.equal(result.isError, undefined);
    const payload = payloadOf(result);
    assert.equal(payload.dryRun, true);
    assert.equal(payload.requiresConfirmation, true);

    const list = await client.callTool({ name: "sancho_list_tasks", arguments: { clientSlug: "alpha" } });
    assert.equal(payloadOf(list).count, 0);
  } finally {
    await close();
  }
});

test("sancho_send_message dry-run returns a non-blocking work hint pointing to sancho_delegate (SAN-216/SAN-220)", async () => {
  const { client, close } = await createConnectedClient({
    id: "operator",
    scopes: ["sancho:chat"],
    clients: ["alpha"],
    tokenHash: "x",
  });
  try {
    const result = await client.callTool({
      name: "sancho_send_message",
      arguments: { clientSlug: "alpha", text: "necesito un research de influencers y podcasts" },
    });
    assert.equal(result.isError, undefined);
    const payload = payloadOf(result);
    assert.equal(payload.dryRun, true);
    assert.equal(payload.requiresConfirmation, true);
    assert.match(String(payload.workHint), /sancho_delegate/);
  } finally {
    await close();
  }
});

test("sancho_create_task creates a task with confirm and it is retrievable", async () => {
  const { client, close } = await createConnectedClient({
    id: "operator",
    scopes: ["tasks:write", "tasks:read"],
    clients: ["alpha"],
    tokenHash: "x",
  });
  try {
    const result = await client.callTool({
      name: "sancho_create_task",
      arguments: { clientSlug: "alpha", name: "Lanzar Foundation", description: "desc", dryRun: false, confirm: true },
    });
    assert.equal(result.isError, undefined);
    const payload = payloadOf(result);
    assert.equal(payload.ok, true);
    const task = payload.task as { id: string; name: string };
    assert.ok(task.id);

    const get = await client.callTool({ name: "sancho_get_task", arguments: { clientSlug: "alpha", taskId: task.id } });
    assert.equal(payloadOf(get).name, "Lanzar Foundation");
  } finally {
    await close();
  }
});

test("sancho_delegate dry-run previews an idempotent specialist thread without dispatching", async () => {
  const { client, close } = await createConnectedClient({
    id: "operator",
    scopes: ["tasks:write", "sancho:chat"],
    clients: ["alpha"],
    tokenHash: "x",
  });
  try {
    const result = await client.callTool({
      name: "sancho_delegate",
      arguments: {
        clientSlug: "alpha",
        agent: "hamete",
        name: "Research Itnig",
        brief: "Investiga Itnig con fuentes verificadas.",
      },
    });
    assert.equal(result.isError, undefined);
    const payload = payloadOf(result);
    assert.equal(payload.dryRun, true);
    assert.equal(payload.requiresConfirmation, true);
    assert.equal(payload.threadId, "alpha:delegate-hamete-research-itnig");
    assert.equal((payload.taskInput as { agent: string }).agent, "hamete");
    assert.equal((payload.taskInput as { mc_chat_thread_id: string }).mc_chat_thread_id, payload.threadId);
    assert.equal((payload.payload as { agentId: string }).agentId, "hamete");
  } finally {
    await close();
  }
});

test("sancho_delegate only accepts active delegate agents", async () => {
  const { client, close } = await createConnectedClient({
    id: "operator",
    scopes: ["tasks:write", "sancho:chat"],
    clients: ["alpha"],
    tokenHash: "x",
  });
  try {
    for (const agent of ["sancho", "escudero", "hammette", "alarife"]) {
      const result = await client.callTool({
        name: "sancho_delegate",
        arguments: {
          clientSlug: "alpha",
          agent,
          name: `Rejected ${agent}`,
          brief: "Esto no debe despacharse.",
        },
      });
      assert.equal(result.isError, true, `${agent} should be rejected`);
      const text = result.content[0].type === "text" ? result.content[0].text : "";
      assert.match(text, /active delegate agent/);
    }

    for (const agent of ["cervantes", "sanson", "hamete"]) {
      const result = await client.callTool({
        name: "sancho_delegate",
        arguments: {
          clientSlug: "alpha",
          agent,
          name: `Accepted ${agent}`,
          brief: "Dry-run válido.",
        },
      });
      assert.equal(result.isError, undefined, `${agent} should be accepted`);
      assert.equal((payloadOf(result).taskInput as { agent: string }).agent, agent);
    }
  } finally {
    await close();
  }
});

test("sancho_delegate creates/reuses a specialist task thread and dispatches the brief", async () => {
  const originalFetch = globalThis.fetch;
  const originalGateway = process.env.MC_CHAT_GATEWAY;
  const calls: Array<{ url: string; body: Record<string, unknown>; headers: Headers }> = [];
  process.env.MC_CHAT_GATEWAY = "http://gateway.test";
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body || "{}")) as Record<string, unknown>;
    calls.push({ url: String(url), body, headers: new Headers(init?.headers) });
    return new Response(JSON.stringify({ ok: true, chatId: body.threadId }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;

  const { client, close } = await createConnectedClient({
    id: "operator",
    scopes: ["tasks:write", "tasks:read", "sancho:chat"],
    clients: ["alpha"],
    tokenHash: "x",
  });
  try {
    const args = {
      clientSlug: "alpha",
      agent: "Hamete",
      name: "Research Itnig SAN220",
      brief: "Investiga Itnig y Bernat Farrero con URLs y encaje.",
      dryRun: false,
      confirm: true,
    };
    const first = await client.callTool({ name: "sancho_delegate", arguments: args });
    assert.equal(first.isError, undefined);
    const firstPayload = payloadOf(first);
    assert.equal(firstPayload.ok, true);
    assert.equal(firstPayload.threadId, "alpha:delegate-hamete-research-itnig-san220");
    assert.equal(firstPayload.agent, "hamete");
    const firstTask = firstPayload.task as { id: string; agent: string; mc_chat_thread_id: string };
    assert.ok(firstTask.id);
    assert.equal(firstTask.agent, "hamete");
    assert.equal(firstTask.mc_chat_thread_id, firstPayload.threadId);

    const second = await client.callTool({ name: "sancho_delegate", arguments: args });
    const secondTask = payloadOf(second).task as { id: string };
    assert.equal(secondTask.id, firstTask.id, "same delegate thread reuses the same task");

    assert.equal(calls.length, 2);
    assert.equal(calls[0].url, "http://gateway.test/mc-chat/inbound");
    assert.equal(calls[0].headers.get("X-Sancho-MCP-Trace-Id"), "trace-test-1");
    assert.deepEqual(
      {
        threadId: calls[0].body.threadId,
        threadName: calls[0].body.threadName,
        text: calls[0].body.text,
        agent: calls[0].body.agent,
        agentId: calls[0].body.agentId,
        source: calls[0].body._source,
      },
      {
        threadId: "alpha:delegate-hamete-research-itnig-san220",
        threadName: "Research Itnig SAN220",
        text: "Investiga Itnig y Bernat Farrero con URLs y encaje.",
        agent: "hamete",
        agentId: "hamete",
        source: "mcp_delegate",
      },
    );
  } finally {
    globalThis.fetch = originalFetch;
    if (originalGateway === undefined) delete process.env.MC_CHAT_GATEWAY;
    else process.env.MC_CHAT_GATEWAY = originalGateway;
    await close();
  }
});

test("sancho_delegate is fail-loud when the task is created but gateway dispatch fails", async () => {
  const originalFetch = globalThis.fetch;
  const originalGateway = process.env.MC_CHAT_GATEWAY;
  process.env.MC_CHAT_GATEWAY = "http://gateway.test";
  globalThis.fetch = (async () =>
    new Response("runner unavailable", {
      status: 502,
      headers: { "content-type": "text/plain" },
    })) as typeof fetch;

  const { client, close } = await createConnectedClient({
    id: "operator",
    scopes: ["tasks:write", "sancho:chat"],
    clients: ["alpha"],
    tokenHash: "x",
  });
  try {
    const result = await client.callTool({
      name: "sancho_delegate",
      arguments: {
        clientSlug: "alpha",
        agent: "rocinante",
        name: "Outreach Itnig SAN220",
        brief: "Prepara outreach para Itnig.",
        dryRun: false,
        confirm: true,
      },
    });
    assert.equal(result.isError, true);
    const text = result.content[0].type === "text" ? result.content[0].text : "";
    assert.match(text, /NOT dispatched/);
    assert.match(text, /HTTP 502/);
    assert.match(text, /alpha:delegate-rocinante-outreach-itnig-san220/);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalGateway === undefined) delete process.env.MC_CHAT_GATEWAY;
    else process.env.MC_CHAT_GATEWAY = originalGateway;
    await close();
  }
});

test("sancho_update_task updates a whitelisted field with confirm", async () => {
  const { client, close } = await createConnectedClient({
    id: "operator",
    scopes: ["tasks:write", "tasks:read"],
    clients: ["alpha"],
    tokenHash: "x",
  });
  try {
    const created = await client.callTool({
      name: "sancho_create_task",
      arguments: { clientSlug: "alpha", name: "Tarea a actualizar", dryRun: false, confirm: true },
    });
    const taskId = (payloadOf(created).task as { id: string }).id;

    const updated = await client.callTool({
      name: "sancho_update_task",
      arguments: { clientSlug: "alpha", taskId, status: "in_progress", dryRun: false, confirm: true },
    });
    assert.equal(updated.isError, undefined);
    const payload = payloadOf(updated);
    assert.equal(payload.ok, true);
    assert.equal((payload.task as { status: string }).status, "in_progress");
  } finally {
    await close();
  }
});

test("sancho_update_task requires at least one field to change", async () => {
  const { client, close } = await createConnectedClient({
    id: "operator",
    scopes: ["tasks:write", "tasks:read"],
    clients: ["alpha"],
    tokenHash: "x",
  });
  try {
    const created = await client.callTool({
      name: "sancho_create_task",
      arguments: { clientSlug: "alpha", name: "Tarea sin cambios", dryRun: false, confirm: true },
    });
    const taskId = (payloadOf(created).task as { id: string }).id;

    const result = await client.callTool({
      name: "sancho_update_task",
      arguments: { clientSlug: "alpha", taskId, dryRun: false, confirm: true },
    });
    assert.equal(result.isError, true);
    assert.match(result.content[0].type === "text" ? result.content[0].text : "", /no fields/i);
  } finally {
    await close();
  }
});

test("yalc_create_search requires yalc:write scope", async () => {
  const { client, close } = await createConnectedClient({
    id: "operator",
    scopes: ["yalc:read"],
    clients: ["alpha"],
    tokenHash: "x",
  });
  try {
    const result = await client.callTool({
      name: "yalc_create_search",
      arguments: {
        clientSlug: "alpha",
        title: "Finanzas ES",
        sectors: ["finanzas personales"],
        networks: ["instagram"],
      },
    });
    assert.equal(result.isError, true);
    assert.match(result.content[0].type === "text" ? result.content[0].text : "", /yalc:write/);
  } finally {
    await close();
  }
});

test("yalc_create_search is dry-run by default and previews the parsed plan", async () => {
  const { client, close } = await createConnectedClient({
    id: "operator",
    scopes: ["yalc:write"],
    clients: ["alpha"],
    tokenHash: "x",
  });
  try {
    const result = await client.callTool({
      name: "yalc_create_search",
      arguments: {
        clientSlug: "alpha",
        title: "Finanzas personales ES · IG+TikTok",
        sectors: ["Finanzas Personales", "ahorro"],
        networks: ["IG", "tiktok"],
        tiers: ["micro", "mid"],
        targetVolume: 40,
        competitorBrands: ["N26", "Revolut"],
      },
    });
    assert.equal(result.isError, undefined);
    const payload = payloadOf(result);
    assert.equal(payload.dryRun, true);
    assert.equal(payload.requiresConfirmation, true);
    const plan = payload.plan as {
      networks: string[];
      sectors: string[];
      tiers: string[];
      qualificationMode: string;
      disqualifyThreshold: number;
      signals: { competitorBrands: string[] };
    };
    assert.deepEqual(plan.networks, ["instagram", "tiktok"]);
    assert.deepEqual(plan.sectors, ["finanzas personales", "ahorro"]);
    assert.deepEqual(plan.tiers, ["micro", "mid"]);
    assert.equal(plan.qualificationMode, "hybrid");
    assert.equal(plan.disqualifyThreshold, 40);
    assert.deepEqual(plan.signals.competitorBrands, ["N26", "Revolut"]);
  } finally {
    await close();
  }
});

test("yalc_update_model_config requires yalc:write scope", async () => {
  const { client, close } = await createConnectedClient({
    id: "operator",
    scopes: ["yalc:read"],
    clients: ["alpha"],
    tokenHash: "x",
  });
  try {
    const result = await client.callTool({
      name: "yalc_update_model_config",
      arguments: { clientSlug: "alpha", disqualifyThreshold: 55 },
    });
    assert.equal(result.isError, true);
    assert.match(result.content[0].type === "text" ? result.content[0].text : "", /yalc:write/);
  } finally {
    await close();
  }
});

test("yalc_update_model_config is dry-run by default and previews the merged config", async () => {
  const { client, close } = await createConnectedClient({
    id: "operator",
    scopes: ["yalc:write"],
    clients: ["alpha"],
    tokenHash: "x",
  });
  try {
    const result = await client.callTool({
      name: "yalc_update_model_config",
      arguments: {
        clientSlug: "alpha",
        erBenchmarks: { micro: 6.5 },
        verticals: ["fintech", "cripto"],
        qualificationMode: "hybrid",
        disqualifyThreshold: 55,
      },
    });
    assert.equal(result.isError, undefined);
    const payload = payloadOf(result);
    assert.equal(payload.dryRun, true);
    assert.equal(payload.requiresConfirmation, true);
    // El partial que viajaría a Yalc: params tipados → documento de overrides.
    assert.deepEqual(payload.partial, {
      tiers: [{ key: "micro", erBenchmarkPct: 6.5 }],
      verticals: ["fintech", "cripto"],
      qualification: { defaultMode: "hybrid", threshold: 55 },
    });
    // Preview de la efectiva (defaults + partial — sin Yalc en este harness).
    const preview = payload.preview as {
      config: {
        tiers: Array<{ key: string; erBenchmarkPct: number }>;
        verticals: string[];
        qualification: { threshold: number };
      };
    };
    assert.equal(preview.config.tiers.find((tier) => tier.key === "micro")?.erBenchmarkPct, 6.5);
    assert.equal(preview.config.tiers.find((tier) => tier.key === "nano")?.erBenchmarkPct, 8.0);
    assert.deepEqual(preview.config.verticals, ["fintech", "cripto"]);
    assert.equal(preview.config.qualification.threshold, 55);
  } finally {
    await close();
  }
});

test("yalc_update_model_config rejects unknown override keys", async () => {
  const { client, close } = await createConnectedClient({
    id: "operator",
    scopes: ["yalc:write"],
    clients: ["alpha"],
    tokenHash: "x",
  });
  try {
    const result = await client.callTool({
      name: "yalc_update_model_config",
      arguments: { clientSlug: "alpha", overrides: { tires: [{ key: "nano" }] } },
    });
    assert.equal(result.isError, true);
    assert.match(result.content[0].type === "text" ? result.content[0].text : "", /Unknown model-config keys: tires/);
  } finally {
    await close();
  }
});

test("task write tools require tasks:write scope", async () => {
  const { client, close } = await createConnectedClient({
    id: "operator",
    scopes: ["tasks:read"],
    clients: ["alpha"],
    tokenHash: "x",
  });
  try {
    const result = await client.callTool({
      name: "sancho_create_task",
      arguments: { clientSlug: "alpha", name: "x", dryRun: false, confirm: true },
    });
    assert.equal(result.isError, true);
    assert.match(result.content[0].type === "text" ? result.content[0].text : "", /tasks:write/);
  } finally {
    await close();
  }
});
