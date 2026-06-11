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
      "sancho_create_task",
      "sancho_get_chat_thread",
      "sancho_get_client_context",
      "sancho_get_task",
      "sancho_list_chat_threads",
      "sancho_list_clients",
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

function payloadOf(result: Awaited<ReturnType<Client["callTool"]>>): Record<string, unknown> {
  const first = Array.isArray(result.content) ? result.content[0] : undefined;
  return JSON.parse(first && first.type === "text" ? first.text : "{}");
}

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
