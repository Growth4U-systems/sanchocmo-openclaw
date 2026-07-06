import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "sancho-mcp-server-"));
process.env.MC_WORKSPACE = tmp;
process.env.OPENCLAW_HOME = tmp;
process.env.SANCHO_MCP_AUDIT_FILE = path.join(tmp, "audit.jsonl");
delete process.env.DATABASE_URL;

const CLIENTS_FILE = path.join(tmp, "clients.json");
const BIN_DIR = path.join(tmp, "bin");

function seedClients() {
  fs.writeFileSync(
    CLIENTS_FILE,
    JSON.stringify({
      clients: [
        { slug: "alpha", name: "Alpha", active: true, plan: "pro", status: "active", mcToken: "secret-token" },
        { slug: "beta", name: "Beta", active: true, plan: "pro", status: "active" },
      ],
      adminToken: null,
    }),
  );
}

function loadClientName(slug: string): string | undefined {
  const data = JSON.parse(fs.readFileSync(CLIENTS_FILE, "utf8")) as {
    clients?: Array<{ slug: string; name?: string }>;
  };
  return data.clients?.find((client) => client.slug === slug)?.name;
}

function seedOpenclawCli() {
  fs.mkdirSync(BIN_DIR, { recursive: true });
  const cli = `#!/usr/bin/env node
const args = process.argv.slice(2);
function out(value) {
  process.stdout.write(typeof value === "string" ? value : JSON.stringify(value));
}
if (args[0] === "agents" && args[1] === "list" && args[2] === "--json") {
  out([
    { id: "sancho", identityName: "Sancho", identityEmoji: "S", workspace: "${tmp}/workspace-sancho", model: "anthropic/claude-opus-4-7", isDefault: true },
    { id: "hamete", identityName: "Hamete", identityEmoji: "H", workspace: "${tmp}/workspace-hamete", model: "anthropic/claude-sonnet-4-6", isDefault: false }
  ]);
  process.exit(0);
}
if (args[0] === "config" && args[1] === "get" && args[2] === "agents.list") {
  out([
    { id: "sancho", model: "anthropic/claude-opus-4-7" },
    { id: "hamete", model: "anthropic/claude-sonnet-4-6" }
  ]);
  process.exit(0);
}
if (args[0] === "config" && args[1] === "get") {
  out("");
  process.exit(0);
}
if (args[0] === "config" && args[1] === "patch") {
  process.stdin.resume();
  process.stdin.on("end", () => process.exit(0));
  process.stdin.on("data", () => undefined);
  process.exit(0);
}
out("");
`;
  const file = path.join(BIN_DIR, "openclaw");
  fs.writeFileSync(file, cli);
  fs.chmodSync(file, 0o755);
  process.env.PATH = `${BIN_DIR}:${process.env.PATH || ""}`;
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
  seedOpenclawCli();
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
      "alarife_get_mcp_config",
      "alarife_list_instances",
      "alarife_validate_mcp_connection",
      "content_approve_idea",
      "content_create_idea",
      "content_get_calendar",
      "content_get_channel_loops",
      "content_get_config",
      "content_get_cron_publish_config",
      "content_get_dispatch_config",
      "content_get_draft",
      "content_get_pillars",
      "content_get_pov_bank",
      "content_get_reconcile_state",
      "content_get_state",
      "content_get_task",
      "content_list_activity",
      "content_list_carousel_templates",
      "content_list_crons",
      "content_list_drafts",
      "content_list_ideas",
      "content_list_signals",
      "content_list_tasks",
      "content_reconcile",
      "content_request_draft_iteration",
      "content_retrigger_writer",
      "content_transition_task",
      "content_update_config",
      "content_update_cron_publish_config",
      "content_update_draft",
      "content_update_idea",
      "content_update_task",
      "integrations_get_status",
      "integrations_list_catalog",
      "integrations_publish_message",
      "integrations_test_connection",
      "media_attach_asset",
      "media_generate_image",
      "media_list_draft_assets",
      "media_list_image_providers",
      "media_remove_asset",
      "media_set_primary_asset",
      "open_design_export_artifact",
      "open_design_get_project_file",
      "open_design_health",
      "open_design_import_project",
      "open_design_list_artifacts",
      "open_design_list_catalog",
      "open_design_list_project_files",
      "open_design_resolve_project",
      "open_design_update_project",
      "publishing_cancel_post",
      "publishing_get_account_info",
      "publishing_get_post_metrics",
      "publishing_get_status",
      "publishing_list_providers",
      "publishing_publish_draft",
      "publishing_reconcile",
      "recurring_list_tasks",
      "recurring_set_task_status",
      "sancho_add_custom_metric",
      "sancho_apply_meeting_recommendation",
      "sancho_apply_metrics_template",
      "sancho_create_task",
      "sancho_delegate",
      "sancho_get_agent",
      "sancho_get_chat_thread",
      "sancho_get_client",
      "sancho_get_client_context",
      "sancho_get_document",
      "sancho_get_meeting",
      "sancho_get_meeting_intelligence_config",
      "sancho_get_metrics_dashboard",
      "sancho_get_metrics_timeseries",
      "sancho_get_task",
      "sancho_intake_create_link",
      "sancho_list_agents",
      "sancho_list_chat_threads",
      "sancho_list_clients",
      "sancho_list_documents",
      "sancho_list_intelligence",
      "sancho_list_keyword_opportunities",
      "sancho_list_meetings",
      "sancho_list_tasks",
      "sancho_mcp_status",
      "sancho_revert_metrics_dashboard",
      "sancho_run_keyword_antenna",
      "sancho_run_meeting_intelligence_sync",
      "sancho_send_message",
      "sancho_set_agent_model",
      "sancho_update_client",
      "sancho_update_document",
      "sancho_update_meeting_intelligence_config",
      "sancho_update_metrics_dashboard",
      "sancho_update_task",
      // SAN-80: gates de envío + plantillas (escritura espejo de la UI)
      "yalc_approve_gate",
      "yalc_assign_template",
      // SAN-75b: calc break-even (registrada por registerYalcBreakevenTool)
      "yalc_breakeven",
      "yalc_create_search",
      // SAN-81: reporting por creator (misma agregación que la UI de Metrics)
      "yalc_creator_report",
      "yalc_get_campaign",
      "yalc_get_campaign_events",
      "yalc_get_campaign_readiness",
      "yalc_get_lead",
      // SAN-76: model settings (lectura efectiva + PUT parcial espejo de la UI)
      "yalc_get_model_config",
      "yalc_get_overview",
      "yalc_list_campaigns",
      "yalc_list_gates",
      "yalc_list_lead_messages",
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

test("yalc campaign detail tools require yalc:read scope", async () => {
  const { client, close } = await createConnectedClient({
    id: "operator",
    scopes: ["sancho:read"],
    clients: ["alpha"],
    tokenHash: "x",
  });
  try {
    const result = await client.callTool({
      name: "yalc_get_campaign",
      arguments: { clientSlug: "alpha", campaignId: "campaign-1" },
    });
    assert.equal(result.isError, true);
    assert.match(result.content[0].type === "text" ? result.content[0].text : "", /yalc:read/);
  } finally {
    await close();
  }
});

test("yalc lead detail tools require yalc:read scope", async () => {
  const { client, close } = await createConnectedClient({
    id: "operator",
    scopes: ["sancho:read"],
    clients: ["alpha"],
    tokenHash: "x",
  });
  try {
    const lead = await client.callTool({
      name: "yalc_get_lead",
      arguments: { clientSlug: "alpha", campaignId: "campaign-1", leadId: "lead-1" },
    });
    assert.equal(lead.isError, true);
    assert.match(lead.content[0].type === "text" ? lead.content[0].text : "", /yalc:read/);

    const messages = await client.callTool({
      name: "yalc_list_lead_messages",
      arguments: { clientSlug: "alpha", leadId: "lead-1" },
    });
    assert.equal(messages.isError, true);
    assert.match(messages.content[0].type === "text" ? messages.content[0].text : "", /yalc:read/);
  } finally {
    await close();
  }
});

test("yalc lead read tools proxy detail and messages with trace headers", async () => {
  const originalFetch = globalThis.fetch;
  const originalBaseUrl = process.env.YALC_BASE_URL;
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  process.env.YALC_BASE_URL = "http://yalc.test";
  globalThis.fetch = (async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    const url = String(input);
    calls.push({ url, init });
    const parsed = new URL(url);
    const headers = { "content-type": "application/json" };
    if (parsed.pathname === "/api/campaigns/campaign-1/leads/lead-1") {
      return new Response(JSON.stringify({ lead: { id: "lead-1", campaignId: "campaign-1" } }), {
        status: 200,
        headers,
      });
    }
    if (parsed.pathname === "/api/leads/lead-1/messages") {
      return new Response(JSON.stringify({ leadId: "lead-1", messages: [], count: 0 }), {
        status: 200,
        headers,
      });
    }
    return new Response(JSON.stringify({ error: `unexpected path ${parsed.pathname}` }), {
      status: 404,
      headers,
    });
  }) as typeof fetch;

  const { client, close } = await createConnectedClient({
    id: "operator",
    scopes: ["yalc:read"],
    clients: ["alpha"],
    tokenHash: "x",
  });
  try {
    const lead = await client.callTool({
      name: "yalc_get_lead",
      arguments: { clientSlug: "alpha", campaignId: "campaign-1", leadId: "lead-1" },
    });
    assert.equal(lead.isError, undefined);
    assert.equal((payloadOf(lead).lead as { id: string }).id, "lead-1");

    const messages = await client.callTool({
      name: "yalc_list_lead_messages",
      arguments: { clientSlug: "alpha", leadId: "lead-1" },
    });
    assert.equal(messages.isError, undefined);
    assert.equal(payloadOf(messages).count, 0);

    assert.equal(calls.length, 2);
    assert.equal(new URL(calls[0].url).searchParams.get("tenant"), "alpha");
    assert.equal(new URL(calls[1].url).searchParams.get("tenant"), "alpha");
    const firstHeaders = calls[0].init?.headers as Record<string, string>;
    assert.equal(firstHeaders["X-Request-Id"], "trace-test-1");
    assert.equal(firstHeaders["X-Sancho-MCP-Trace-Id"], "trace-test-1");
  } finally {
    await close();
    globalThis.fetch = originalFetch;
    if (originalBaseUrl === undefined) {
      delete process.env.YALC_BASE_URL;
    } else {
      process.env.YALC_BASE_URL = originalBaseUrl;
    }
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

test("sancho_list_clients accepts clients:read scope", async () => {
  const { client, close } = await createConnectedClient({
    id: "operator",
    scopes: ["clients:read"],
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

test("sancho_get_client requires clients:read and does not expose mcToken", async () => {
  const { client, close } = await createConnectedClient({
    id: "operator",
    scopes: ["clients:read"],
    clients: ["alpha"],
    tokenHash: "x",
  });
  try {
    const result = await client.callTool({
      name: "sancho_get_client",
      arguments: { clientSlug: "alpha" },
    });
    assert.equal(result.isError, undefined);
    const payload = JSON.parse(result.content[0].type === "text" ? result.content[0].text : "{}");
    assert.equal(payload.client.slug, "alpha");
    assert.equal(payload.client.mcToken, undefined);
  } finally {
    await close();
  }
});

test("sancho_update_client previews safe updates and requires clients:write", async () => {
  const readOnly = await createConnectedClient({
    id: "operator",
    scopes: ["clients:read"],
    clients: ["alpha"],
    tokenHash: "x",
  });
  try {
    const denied = await readOnly.client.callTool({
      name: "sancho_update_client",
      arguments: { clientSlug: "alpha", updates: { name: "Alpha 2" } },
    });
    assert.equal(denied.isError, true);
    assert.match(denied.content[0].type === "text" ? denied.content[0].text : "", /clients:write/);
  } finally {
    await readOnly.close();
  }

  const writer = await createConnectedClient({
    id: "operator",
    scopes: ["clients:write"],
    clients: ["alpha"],
    tokenHash: "x",
  });
  try {
    const preview = await writer.client.callTool({
      name: "sancho_update_client",
      arguments: { clientSlug: "alpha", updates: { name: "Alpha Preview" } },
    });
    assert.equal(preview.isError, undefined);
    const payload = JSON.parse(preview.content[0].type === "text" ? preview.content[0].text : "{}");
    assert.equal(payload.dryRun, true);
    assert.equal(payload.requiresConfirmation, true);
    assert.equal(payload.after.name, "Alpha Preview");
    assert.equal(loadClientName("alpha"), "Alpha");
  } finally {
    await writer.close();
  }
});

test("agent MCP tools require agents scopes and can read agent profiles", async () => {
  const readOnly = await createConnectedClient({
    id: "operator",
    scopes: ["agents:read"],
    clients: ["*"],
    tokenHash: "x",
  });
  try {
    const list = await readOnly.client.callTool({
      name: "sancho_list_agents",
      arguments: {},
    });
    assert.equal(list.isError, undefined);
    const payload = JSON.parse(list.content[0].type === "text" ? list.content[0].text : "{}");
    assert.deepEqual(payload.agents.map((agent: { id: string }) => agent.id), ["sancho", "hamete"]);

    const get = await readOnly.client.callTool({
      name: "sancho_get_agent",
      arguments: { agentId: "sancho" },
    });
    assert.equal(get.isError, undefined);
    const agentPayload = JSON.parse(get.content[0].type === "text" ? get.content[0].text : "{}");
    assert.equal(agentPayload.agent.id, "sancho");

    const denied = await readOnly.client.callTool({
      name: "sancho_set_agent_model",
      arguments: { agentId: "sancho", model: null },
    });
    assert.equal(denied.isError, true);
    assert.match(denied.content[0].type === "text" ? denied.content[0].text : "", /agents:write/);
  } finally {
    await readOnly.close();
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

test("sancho chat read tools accept chat:read and expose pending ask questions", async () => {
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
    scopes: ["chat:read"],
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

test("legacy sancho:chat still grants chat read and write access", async () => {
  const { client, close } = await createConnectedClient({
    id: "operator",
    scopes: ["sancho:chat"],
    clients: ["alpha"],
    tokenHash: "x",
  });
  try {
    const read = await client.callTool({
      name: "sancho_list_chat_threads",
      arguments: { clientSlug: "alpha" },
    });
    assert.equal(read.isError, undefined);

    const write = await client.callTool({
      name: "sancho_send_message",
      arguments: { clientSlug: "alpha", text: "Hola", dryRun: true },
    });
    assert.equal(write.isError, undefined);
    const payload = payloadOf(write);
    assert.equal(payload.dryRun, true);
    assert.equal(payload.requiresConfirmation, true);
  } finally {
    await close();
  }
});

test("sancho chat read tools require chat:read scope", async () => {
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
    assert.match(result.content[0].type === "text" ? result.content[0].text : "", /chat:read/);
  } finally {
    await close();
  }
});

test("sancho_send_message requires chat:write scope", async () => {
  const { client, close } = await createConnectedClient({
    id: "operator",
    scopes: ["chat:read"],
    clients: ["alpha"],
    tokenHash: "x",
  });
  try {
    const result = await client.callTool({
      name: "sancho_send_message",
      arguments: { clientSlug: "alpha", text: "Hola", dryRun: true },
    });
    assert.equal(result.isError, true);
    assert.match(result.content[0].type === "text" ? result.content[0].text : "", /chat:write/);
  } finally {
    await close();
  }
});

test("content engine read tools require content:read scope", async () => {
  const { client, close } = await createConnectedClient({
    id: "operator",
    scopes: ["sancho:read"],
    clients: ["alpha"],
    tokenHash: "x",
  });
  try {
    const result = await client.callTool({
      name: "content_get_state",
      arguments: { clientSlug: "alpha" },
    });
    assert.equal(result.isError, true);
    assert.match(result.content[0].type === "text" ? result.content[0].text : "", /content:read/);

    const calendar = await client.callTool({
      name: "content_get_calendar",
      arguments: { clientSlug: "alpha" },
    });
    assert.equal(calendar.isError, true);
    assert.match(calendar.content[0].type === "text" ? calendar.content[0].text : "", /content:read/);
  } finally {
    await close();
  }
});

test("content engine read tools expose state, ideas, tasks, drafts and activity", async () => {
  seedDocument(
    "brand/beta/content/config.json",
    JSON.stringify({
      image_generation: { mode: "fixed", provider: "replicate", model: "model-a" },
      carousel: { footer_text: "@alpha" },
    }),
  );
  seedDocument(
    "brand/beta/content/idea-queue.json",
    JSON.stringify([
      {
        id: "idea-1",
        status: "New",
        title: "Idea Alpha",
        target_channel: "linkedin",
        angle_draft: "Alpha angle",
        created_at: "2026-06-16T09:00:00.000Z",
      },
    ]),
  );
  seedDocument(
    "brand/beta/content/drafts/idea-1/linkedin.md",
    [
      "---",
      "idea_id: idea-1",
      "channel: linkedin",
      "kind: channel-draft",
      "iteration: 1",
      "created_at: 2026-06-16T09:30:00.000Z",
      "updated_at: 2026-06-16T09:45:00.000Z",
      "---",
      "Draft body for LinkedIn",
    ].join("\n"),
  );
  seedDocument(
    "brand/beta/content/activity-log.jsonl",
    `${JSON.stringify({
      ts: "2026-06-16T10:00:00.000Z",
      type: "idea-created",
      text: "Idea Alpha created",
    })}\n`,
  );

  const { client, close } = await createConnectedClient({
    id: "operator",
    scopes: ["content:read"],
    clients: ["beta"],
    tokenHash: "x",
  });
  try {
    const state = await client.callTool({
      name: "content_get_state",
      arguments: { clientSlug: "beta" },
    });
    assert.equal(state.isError, undefined);
    const statePayload = payloadOf(state);
    assert.equal((statePayload.ideas as { count: number }).count, 1);
    assert.equal((statePayload.contentTasks as { count: number }).count, 1);
    assert.equal((statePayload.config as { image_generation: { provider: string } }).image_generation.provider, "replicate");

    const ideas = await client.callTool({
      name: "content_list_ideas",
      arguments: { clientSlug: "beta", status: "new", channel: "linkedin" },
    });
    assert.equal(ideas.isError, undefined);
    assert.equal((payloadOf(ideas).ideas as Array<{ id: string }>)[0].id, "idea-1");

    const tasks = await client.callTool({
      name: "content_list_tasks",
      arguments: { clientSlug: "beta", status: "New", query: "Alpha" },
    });
    assert.equal(tasks.isError, undefined);
    assert.equal((payloadOf(tasks).contentTasks as Array<{ id: string }>)[0].id, "idea-1");

    const task = await client.callTool({
      name: "content_get_task",
      arguments: { clientSlug: "beta", contentTaskId: "idea-1" },
    });
    assert.equal(task.isError, undefined);
    assert.equal((payloadOf(task).contentTask as { name: string }).name, "Idea Alpha");

    const drafts = await client.callTool({
      name: "content_list_drafts",
      arguments: { clientSlug: "beta", ideaId: "idea-1" },
    });
    assert.equal(drafts.isError, undefined);
    assert.equal((payloadOf(drafts).drafts as Array<{ channel: string }>)[0].channel, "linkedin");

    const draft = await client.callTool({
      name: "content_get_draft",
      arguments: { clientSlug: "beta", ideaId: "idea-1", channel: "linkedin", maxChars: 5 },
    });
    assert.equal(draft.isError, undefined);
    const draftPayload = payloadOf(draft).draft as { content: string; truncated: boolean };
    assert.equal(draftPayload.content, "Draft");
    assert.equal(draftPayload.truncated, true);

    const activity = await client.callTool({
      name: "content_list_activity",
      arguments: { clientSlug: "beta", limit: 5 },
    });
    assert.equal(activity.isError, undefined);
    assert.equal((payloadOf(activity).activity as Array<{ text: string }>)[0].text, "Idea Alpha created");
  } finally {
    await close();
  }
});

test("content_get_draft rejects traversal-like path segments", async () => {
  const { client, close } = await createConnectedClient({
    id: "operator",
    scopes: ["content:read"],
    clients: ["alpha"],
    tokenHash: "x",
  });
  try {
    const result = await client.callTool({
      name: "content_get_draft",
      arguments: { clientSlug: "alpha", ideaId: "idea-1", channel: "../secret" },
    });
    assert.equal(result.isError, true);
    assert.match(result.content[0].type === "text" ? result.content[0].text : "", /simple path segment/);
  } finally {
    await close();
  }
});

test("content engine read model tools expose calendar, loops, signals and configs", async () => {
  const ideaId = "idea-readmodel-1";
  seedDocument(
    "brand/alpha/content/idea-queue.json",
    JSON.stringify([
      {
        id: ideaId,
        status: "Ready",
        title: "Read Model Idea",
        target_channel: "linkedin",
        angle_draft: "Read model angle",
        source_data: { pillar_id: "demand" },
        created_at: "2026-06-16T09:00:00.000Z",
      },
    ]),
  );
  seedDocument(
    `brand/alpha/content/drafts/${ideaId}/linkedin.md`,
    [
      "---",
      `idea_id: ${ideaId}`,
      "channel: linkedin",
      "kind: channel-draft",
      "media_policy: optional",
      "created_at: 2026-06-16T09:30:00.000Z",
      "updated_at: 2026-06-16T09:45:00.000Z",
      "---",
      "Read model draft body for LinkedIn",
    ].join("\n"),
  );
  seedDocument(
    "brand/alpha/projects/P14-content/tasks.json",
    JSON.stringify([
      {
        id: "P14-T01",
        name: "Content mother task",
        content_tasks: [
          {
            id: "ct-readmodel-1",
            idea_id: ideaId,
            name: "Read Model Idea",
            status: "Ready",
            target_channels: ["linkedin"],
            parent_task_id: "P14-T01",
            channel_phases: { linkedin: "draft" },
            media_policy: { linkedin: "optional" },
            created_at: "2026-06-16T09:00:00.000Z",
            updated_at: "2026-06-16T10:00:00.000Z",
          },
        ],
      },
    ]),
  );
  seedDocument(
    "brand/alpha/content/configs/cadence-config.yml",
    [
      "business_model: B2B",
      "channels:",
      "  linkedin:",
      "    active: true",
      "    frequency: weekly",
      "    best_days:",
      "      - monday",
      "    best_times:",
      "      - \"09:00\"",
      "    label: Founder Channel",
      "    metrics_provider: metricool",
    ].join("\n"),
  );
  seedDocument(
    "brand/alpha/content/configs/dispatch-channel.yml",
    [
      "transport: slack",
      "channel_id: C123",
      "channel_name: content",
      "configured_at: 2026-06-16T11:00:00.000Z",
      "configured_by: test",
    ].join("\n"),
  );
  seedDocument(
    "brand/alpha/content/content-pillars.md",
    [
      "# Content Pillars",
      "",
      "```yaml",
      "pillars:",
      "  - id: demand",
      "    name: Demand Creation",
      "    owner: Sancho",
      "```",
    ].join("\n"),
  );
  seedDocument(
    "brand/alpha/content/research-signals/2026-06-16.json",
    JSON.stringify([{ id: "sig-1", title: "Signal Alpha" }]),
  );
  seedDocument(
    "brand/alpha/brand-book/visual-identity/templates/template-a/meta.json",
    JSON.stringify({
      id: "template-a",
      name: "Template A",
      channel: "linkedin",
      description: "Test carousel template",
      slideCount: 1,
      width: 1080,
      height: 1080,
      slots: [{ key: "headline", label: "Headline" }],
    }),
  );

  const { client, close } = await createConnectedClient({
    id: "operator",
    scopes: ["content:read"],
    clients: ["alpha"],
    tokenHash: "x",
  });
  try {
    const calendar = await client.callTool({
      name: "content_get_calendar",
      arguments: { clientSlug: "alpha", maxBodyChars: 10 },
    });
    assert.equal(calendar.isError, undefined);
    const calendarPayload = payloadOf(calendar);
    const ready = (calendarPayload.ready_queue as Array<{ contentTaskId: string; body: string; bodyTruncated: boolean }>)[0];
    assert.equal(ready.contentTaskId, "ct-readmodel-1");
    assert.equal(ready.body, "Read model");
    assert.equal(ready.bodyTruncated, true);

    const signals = await client.callTool({
      name: "content_list_signals",
      arguments: { clientSlug: "alpha", date: "2026-06-16" },
    });
    assert.equal(signals.isError, undefined);
    assert.equal((payloadOf(signals).signals as Array<{ id: string }>)[0].id, "sig-1");

    const loops = await client.callTool({
      name: "content_get_channel_loops",
      arguments: { clientSlug: "alpha" },
    });
    assert.equal(loops.isError, undefined);
    const loop = (payloadOf(loops).channels as Array<{ channel: string; stages: { creation: { readyCount: number } } }>)[0];
    assert.equal(loop.channel, "linkedin");
    assert.equal(loop.stages.creation.readyCount, 1);

    const pillars = await client.callTool({
      name: "content_get_pillars",
      arguments: { clientSlug: "alpha" },
    });
    assert.equal(pillars.isError, undefined);
    assert.equal((payloadOf(pillars).pillars as Array<{ name: string }>)[0].name, "Demand Creation");

    const povBank = await client.callTool({
      name: "content_get_pov_bank",
      arguments: { clientSlug: "alpha" },
    });
    assert.equal(povBank.isError, undefined);
    assert.equal(payloadOf(povBank).configured, false);

    const dispatch = await client.callTool({
      name: "content_get_dispatch_config",
      arguments: { clientSlug: "alpha" },
    });
    assert.equal(dispatch.isError, undefined);
    assert.equal((payloadOf(dispatch).config as { channel_id: string }).channel_id, "C123");

    const templates = await client.callTool({
      name: "content_list_carousel_templates",
      arguments: { clientSlug: "alpha", channel: "linkedin", includeDisabled: true },
    });
    assert.equal(templates.isError, undefined);
    assert.equal((payloadOf(templates).templates as Array<{ id: string }>)[0].id, "template-a");
  } finally {
    fs.rmSync(path.join(tmp, "brand", "alpha", "projects", "P14-content"), { recursive: true, force: true });
    fs.rmSync(path.join(tmp, "brand", "alpha", "content", "idea-queue.json"), { force: true });
    fs.rmSync(path.join(tmp, "brand", "alpha", "content", "drafts", ideaId), { recursive: true, force: true });
    fs.rmSync(path.join(tmp, "brand", "alpha", "content", "configs", "cadence-config.yml"), { force: true });
    fs.rmSync(path.join(tmp, "brand", "alpha", "content", "configs", "dispatch-channel.yml"), { force: true });
    fs.rmSync(path.join(tmp, "brand", "alpha", "content", "content-pillars.md"), { force: true });
    fs.rmSync(path.join(tmp, "brand", "alpha", "content", "research-signals", "2026-06-16.json"), { force: true });
    fs.rmSync(path.join(tmp, "brand", "alpha", "brand-book", "visual-identity", "templates", "template-a"), { recursive: true, force: true });
    await close();
  }
});

test("content cron tools list Content crons and update publish config with confirm", async () => {
  const cronDir = path.join(tmp, ".openclaw", "cron");
  fs.mkdirSync(cronDir, { recursive: true });
  fs.writeFileSync(
    path.join(cronDir, "jobs.json"),
    JSON.stringify({
      version: 1,
      jobs: [
        {
          id: "cron-alpha-content-dispatch",
          name: "Content: Editorial Dispatch - Alpha",
          enabled: true,
          schedule: { kind: "cron", expr: "0 9 * * 1-5", tz: "Europe/Madrid" },
          agentId: "sancho",
          payload: {
            kind: "agentTurn",
            model: "gpt-5.2",
            message: "Run editorial dispatch for brand/alpha/content.",
          },
        },
        {
          id: "cron-alpha-daily",
          name: "Daily Pulse - Alpha",
          enabled: true,
          schedule: { kind: "cron", expr: "0 8 * * 1-5", tz: "Europe/Madrid" },
          agentId: "sancho",
          payload: {
            kind: "agentTurn",
            model: "gpt-5.2",
            message: "Run daily pulse for brand/alpha/content.",
          },
        },
      ],
    }),
  );
  seedDocument(
    "brand/alpha/client-config.json",
    JSON.stringify({
      publish: { default_transport: "slack" },
      crons: {
        editorial_dispatch: {
          publish_transport: "slack",
          publish_channel: "COLD",
          publish_channel_name: "old-content",
        },
      },
    }),
  );

  const { client, close } = await createConnectedClient({
    id: "operator",
    scopes: ["content:read", "content:write"],
    clients: ["alpha"],
    tokenHash: "x",
  });
  try {
    const crons = await client.callTool({
      name: "content_list_crons",
      arguments: { clientSlug: "alpha", query: "Dispatch" },
    });
    assert.equal(crons.isError, undefined);
    const cronsPayload = payloadOf(crons);
    assert.equal((cronsPayload.crons as Array<{ id: string }>)[0].id, "cron-alpha-content-dispatch");
    assert.equal(cronsPayload.count, 1);

    const readConfig = await client.callTool({
      name: "content_get_cron_publish_config",
      arguments: { clientSlug: "alpha", cronKey: "editorial_dispatch" },
    });
    assert.equal(readConfig.isError, undefined);
    assert.equal((payloadOf(readConfig).config as { channel_id: string }).channel_id, "COLD");

    const dryRun = await client.callTool({
      name: "content_update_cron_publish_config",
      arguments: {
        clientSlug: "alpha",
        cronKey: "editorial_dispatch",
        transport: "slack",
        channelId: "CNEW",
        channelName: "new-content",
      },
    });
    assert.equal(dryRun.isError, undefined);
    assert.equal(payloadOf(dryRun).dryRun, true);
    assert.equal((payloadOf(dryRun).current as { channel_id: string }).channel_id, "COLD");

    const write = await client.callTool({
      name: "content_update_cron_publish_config",
      arguments: {
        clientSlug: "alpha",
        cronKey: "editorial_dispatch",
        transport: "slack",
        channelId: "CNEW",
        channelName: "new-content",
        dryRun: false,
        confirm: true,
      },
    });
    assert.equal(write.isError, undefined);
    assert.equal((payloadOf(write).config as { channel_id: string }).channel_id, "CNEW");

    const after = JSON.parse(fs.readFileSync(path.join(tmp, "brand/alpha/client-config.json"), "utf8"));
    assert.equal(after.crons.editorial_dispatch.publish_channel, "CNEW");
  } finally {
    fs.rmSync(path.join(tmp, ".openclaw", "cron", "jobs.json"), { force: true });
    fs.rmSync(path.join(tmp, "brand", "alpha", "client-config.json"), { force: true });
    await close();
  }
});

test("content engine write tools require content:write scope", async () => {
  const { client, close } = await createConnectedClient({
    id: "operator",
    scopes: ["content:read"],
    clients: ["alpha"],
    tokenHash: "x",
  });
  try {
    const config = await client.callTool({
      name: "content_update_config",
      arguments: { clientSlug: "alpha", imageGeneration: { mode: "fixed", provider: "replicate" } },
    });
    assert.equal(config.isError, true);
    assert.match(config.content[0].type === "text" ? config.content[0].text : "", /content:write/);

    const create = await client.callTool({
      name: "content_create_idea",
      arguments: { clientSlug: "alpha", title: "Write test idea" },
    });
    assert.equal(create.isError, true);
    assert.match(create.content[0].type === "text" ? create.content[0].text : "", /content:write/);

    const update = await client.callTool({
      name: "content_update_idea",
      arguments: { clientSlug: "alpha", ideaId: "idea-1", status: "Deferred" },
    });
    assert.equal(update.isError, true);
    assert.match(update.content[0].type === "text" ? update.content[0].text : "", /content:write/);

    const approve = await client.callTool({
      name: "content_approve_idea",
      arguments: { clientSlug: "alpha", ideaId: "idea-1" },
    });
    assert.equal(approve.isError, true);
    assert.match(approve.content[0].type === "text" ? approve.content[0].text : "", /content:write/);

    const updateTask = await client.callTool({
      name: "content_update_task",
      arguments: { clientSlug: "alpha", contentTaskId: "ct-1", owner: "Dulcinea" },
    });
    assert.equal(updateTask.isError, true);
    assert.match(updateTask.content[0].type === "text" ? updateTask.content[0].text : "", /content:write/);

    const transitionTask = await client.callTool({
      name: "content_transition_task",
      arguments: { clientSlug: "alpha", contentTaskId: "ct-1", action: "defer" },
    });
    assert.equal(transitionTask.isError, true);
    assert.match(transitionTask.content[0].type === "text" ? transitionTask.content[0].text : "", /content:write/);

    const updateDraft = await client.callTool({
      name: "content_update_draft",
      arguments: { clientSlug: "alpha", ideaId: "idea-1", channel: "linkedin", body: "Draft body" },
    });
    assert.equal(updateDraft.isError, true);
    assert.match(updateDraft.content[0].type === "text" ? updateDraft.content[0].text : "", /content:write/);

    const iteration = await client.callTool({
      name: "content_request_draft_iteration",
      arguments: {
        clientSlug: "alpha",
        ideaId: "idea-1",
        channel: "linkedin",
        instruction: "Make it sharper",
      },
    });
    assert.equal(iteration.isError, true);
    assert.match(iteration.content[0].type === "text" ? iteration.content[0].text : "", /content:write/);

    const retrigger = await client.callTool({
      name: "content_retrigger_writer",
      arguments: { clientSlug: "alpha", contentTaskId: "ct-1" },
    });
    assert.equal(retrigger.isError, true);
    assert.match(retrigger.content[0].type === "text" ? retrigger.content[0].text : "", /content:write/);

    const reconcile = await client.callTool({
      name: "content_reconcile",
      arguments: { clientSlug: "alpha" },
    });
    assert.equal(reconcile.isError, true);
    assert.match(reconcile.content[0].type === "text" ? reconcile.content[0].text : "", /content:write/);

    const cronPublish = await client.callTool({
      name: "content_update_cron_publish_config",
      arguments: { clientSlug: "alpha", cronKey: "editorial_dispatch", transport: "slack", channelId: "C123" },
    });
    assert.equal(cronPublish.isError, true);
    assert.match(cronPublish.content[0].type === "text" ? cronPublish.content[0].text : "", /content:write/);
  } finally {
    await close();
  }
});

test("content_update_config is dry-run by default and writes with confirm", async () => {
  const { client, close } = await createConnectedClient({
    id: "operator",
    scopes: ["content:read", "content:write"],
    clients: ["alpha"],
    tokenHash: "x",
  });
  try {
    const dryRun = await client.callTool({
      name: "content_update_config",
      arguments: {
        clientSlug: "alpha",
        imageGeneration: { mode: "fixed", provider: "nanobanana", model: "nano-1" },
        carousel: { footerText: "@alpha" },
      },
    });
    assert.equal(dryRun.isError, undefined);
    const dryPayload = payloadOf(dryRun);
    assert.equal(dryPayload.dryRun, true);
    assert.equal((dryPayload.preview as { image_generation: { provider: string } }).image_generation.provider, "nanobanana");

    const before = await client.callTool({ name: "content_get_config", arguments: { clientSlug: "alpha" } });
    assert.equal((payloadOf(before).config as { image_generation: { provider: string | null } }).image_generation.provider, null);

    const write = await client.callTool({
      name: "content_update_config",
      arguments: {
        clientSlug: "alpha",
        imageGeneration: { mode: "fixed", provider: "nanobanana", model: "nano-1" },
        carousel: { footerText: "@alpha" },
        dryRun: false,
        confirm: true,
      },
    });
    assert.equal(write.isError, undefined);
    const config = payloadOf(write).config as {
      image_generation: { provider: string; model: string };
      carousel: { footer_text: string };
    };
    assert.equal(config.image_generation.provider, "nanobanana");
    assert.equal(config.image_generation.model, "nano-1");
    assert.equal(config.carousel.footer_text, "@alpha");
  } finally {
    await close();
  }
});

test("content_create_idea and content_update_idea are dry-run by default and write with confirm", async () => {
  const { client, close } = await createConnectedClient({
    id: "operator",
    scopes: ["content:read", "content:write"],
    clients: ["beta"],
    tokenHash: "x",
  });
  try {
    const dryCreate = await client.callTool({
      name: "content_create_idea",
      arguments: {
        clientSlug: "beta",
        id: "idea-write-test",
        title: "Write Tool Idea",
        targetChannel: "linkedin",
        angleDraft: "A controlled MCP write idea",
      },
    });
    assert.equal(dryCreate.isError, undefined);
    assert.equal(payloadOf(dryCreate).dryRun, true);

    const empty = await client.callTool({
      name: "content_list_ideas",
      arguments: { clientSlug: "beta", query: "Write Tool Idea" },
    });
    assert.equal(payloadOf(empty).count, 0);

    const created = await client.callTool({
      name: "content_create_idea",
      arguments: {
        clientSlug: "beta",
        id: "idea-write-test",
        title: "Write Tool Idea",
        targetChannel: "linkedin",
        angleDraft: "A controlled MCP write idea",
        dryRun: false,
        confirm: true,
      },
    });
    assert.equal(created.isError, undefined);
    assert.equal((payloadOf(created).idea as { id: string }).id, "idea-write-test");

    const dryUpdate = await client.callTool({
      name: "content_update_idea",
      arguments: {
        clientSlug: "beta",
        ideaId: "idea-write-test",
        status: "Deferred",
        targetDate: "2026-06-20",
      },
    });
    assert.equal(dryUpdate.isError, undefined);
    assert.equal(payloadOf(dryUpdate).dryRun, true);

    const stillNew = await client.callTool({
      name: "content_list_ideas",
      arguments: { clientSlug: "beta", status: "New", query: "Write Tool Idea" },
    });
    assert.equal(payloadOf(stillNew).count, 1);

    const updated = await client.callTool({
      name: "content_update_idea",
      arguments: {
        clientSlug: "beta",
        ideaId: "idea-write-test",
        status: "Deferred",
        targetDate: "2026-06-20",
        dryRun: false,
        confirm: true,
      },
    });
    assert.equal(updated.isError, undefined);
    const idea = payloadOf(updated).idea as { status: string; target_date: string };
    assert.equal(idea.status, "Deferred");
    assert.equal(idea.target_date, "2026-06-20");
  } finally {
    await close();
  }
});

test("content_approve_idea dry-runs by default and provisions ContentTask/drafts with confirm", async () => {
  const { client, close } = await createConnectedClient({
    id: "operator",
    scopes: ["content:read", "content:write"],
    clients: ["beta"],
    tokenHash: "x",
  });
  try {
    const ideaId = "idea-approve-test";
    fs.rmSync(path.join(tmp, "brand", "beta", "content", "drafts", ideaId), { recursive: true, force: true });

    const created = await client.callTool({
      name: "content_create_idea",
      arguments: {
        clientSlug: "beta",
        id: ideaId,
        title: "Approval Tool Idea",
        targetChannel: "linkedin",
        angleDraft: "An approval flow owned by MCP",
        dryRun: false,
        confirm: true,
      },
    });
    assert.equal(created.isError, undefined);

    const dryRun = await client.callTool({
      name: "content_approve_idea",
      arguments: {
        clientSlug: "beta",
        ideaId,
        triggerWriter: false,
      },
    });
    assert.equal(dryRun.isError, undefined);
    const dryPayload = payloadOf(dryRun);
    assert.equal(dryPayload.dryRun, true);
    assert.equal((dryPayload.preview as { willSetApproved: boolean }).willSetApproved, true);
    assert.equal(fs.existsSync(path.join(tmp, "brand", "beta", "content", "drafts", ideaId, "linkedin.md")), false);

    const approved = await client.callTool({
      name: "content_approve_idea",
      arguments: {
        clientSlug: "beta",
        ideaId,
        approvedBy: "mcp-test",
        triggerWriter: false,
        dryRun: false,
        confirm: true,
      },
    });
    assert.equal(approved.isError, undefined);
    const payload = payloadOf(approved);
    assert.equal(payload.writerTriggered, false);
    assert.deepEqual(payload.channelsProvisioned, ["linkedin", "twitter"]);
    assert.equal((payload.idea as { status: string; approved_by: string }).status, "Approved");
    assert.equal((payload.idea as { approved_by: string }).approved_by, "mcp-test");
    assert.ok((payload.contentTaskId as string).includes("-C"));

    assert.equal(fs.existsSync(path.join(tmp, "brand", "beta", "content", "drafts", ideaId, "linkedin.md")), true);
    assert.equal(fs.existsSync(path.join(tmp, "brand", "beta", "content", "drafts", ideaId, "twitter.md")), true);
    assert.equal(fs.existsSync(path.join(tmp, "brand", "beta", "content", "drafts", ideaId, "proposal.md")), true);
    assert.equal(fs.existsSync(path.join(tmp, "brand", "beta", "content", "drafts", ideaId, "research.md")), true);
    assert.equal(fs.existsSync(path.join(tmp, "brand", "beta", "content", "drafts", ideaId, "clarify.md")), true);

    const task = await client.callTool({
      name: "content_get_task",
      arguments: { clientSlug: "beta", contentTaskId: payload.contentTaskId },
    });
    assert.equal(task.isError, undefined);
    assert.equal((payloadOf(task).contentTask as { status: string }).status, "Approved");
  } finally {
    await close();
  }
});

test("content task and draft lifecycle tools dry-run and write with confirm", async () => {
  const { client, close } = await createConnectedClient({
    id: "operator",
    scopes: ["content:read", "content:write"],
    clients: ["beta"],
    tokenHash: "x",
  });
  try {
    const ideaId = "idea-lifecycle-test";
    fs.rmSync(path.join(tmp, "brand", "beta", "content", "drafts", ideaId), { recursive: true, force: true });

    await client.callTool({
      name: "content_create_idea",
      arguments: {
        clientSlug: "beta",
        id: ideaId,
        title: "Lifecycle Tool Idea",
        targetChannel: "linkedin",
        angleDraft: "A lifecycle flow owned by MCP",
        dryRun: false,
        confirm: true,
      },
    });

    const approved = await client.callTool({
      name: "content_approve_idea",
      arguments: {
        clientSlug: "beta",
        ideaId,
        triggerWriter: false,
        dryRun: false,
        confirm: true,
      },
    });
    assert.equal(approved.isError, undefined);
    const contentTaskId = payloadOf(approved).contentTaskId as string;

    const dryPhase = await client.callTool({
      name: "content_update_task",
      arguments: {
        clientSlug: "beta",
        contentTaskId,
        channelPhases: { linkedin: "draft", twitter: "draft" },
      },
    });
    assert.equal(dryPhase.isError, undefined);
    assert.equal(payloadOf(dryPhase).dryRun, true);

    const stillApproved = await client.callTool({
      name: "content_get_task",
      arguments: { clientSlug: "beta", contentTaskId },
    });
    assert.equal((payloadOf(stillApproved).contentTask as { status: string }).status, "Approved");

    const phased = await client.callTool({
      name: "content_update_task",
      arguments: {
        clientSlug: "beta",
        contentTaskId,
        channelPhases: { linkedin: "draft", twitter: "draft" },
        dryRun: false,
        confirm: true,
      },
    });
    assert.equal(phased.isError, undefined);
    assert.equal((payloadOf(phased).contentTask as { status: string }).status, "Draft");

    const dryTransition = await client.callTool({
      name: "content_transition_task",
      arguments: { clientSlug: "beta", contentTaskId, action: "approve-draft" },
    });
    assert.equal(dryTransition.isError, undefined);
    assert.equal(payloadOf(dryTransition).dryRun, true);

    const transitioned = await client.callTool({
      name: "content_transition_task",
      arguments: {
        clientSlug: "beta",
        contentTaskId,
        action: "approve-draft",
        dryRun: false,
        confirm: true,
      },
    });
    assert.equal(transitioned.isError, undefined);
    const transitionedTask = payloadOf(transitioned).contentTask as { status: string; pipeline_state: string };
    assert.equal(transitionedTask.status, "Pending Media");
    assert.equal(transitionedTask.pipeline_state, "generating-media");

    const dryDraft = await client.callTool({
      name: "content_update_draft",
      arguments: {
        clientSlug: "beta",
        ideaId,
        channel: "linkedin",
        body: "Updated draft body from MCP",
        clarifyStatus: "answered",
        itemType: "hot_take",
      },
    });
    assert.equal(dryDraft.isError, undefined);
    assert.equal(payloadOf(dryDraft).dryRun, true);

    const beforeDraft = await client.callTool({
      name: "content_get_draft",
      arguments: { clientSlug: "beta", ideaId, channel: "linkedin" },
    });
    assert.notEqual((payloadOf(beforeDraft).draft as { content: string }).content, "Updated draft body from MCP");

    const draftWrite = await client.callTool({
      name: "content_update_draft",
      arguments: {
        clientSlug: "beta",
        ideaId,
        channel: "linkedin",
        body: "Updated draft body from MCP",
        clarifyStatus: "answered",
        itemType: "hot_take",
        dryRun: false,
        confirm: true,
      },
    });
    assert.equal(draftWrite.isError, undefined);

    const afterDraft = await client.callTool({
      name: "content_get_draft",
      arguments: { clientSlug: "beta", ideaId, channel: "linkedin" },
    });
    const draft = payloadOf(afterDraft).draft as {
      content: string;
      meta: { clarify_status: string; item_type: string };
    };
    assert.equal(draft.content.trim(), "Updated draft body from MCP");
    assert.equal(draft.meta.clarify_status, "answered");
    assert.equal(draft.meta.item_type, "hot_take");
  } finally {
    await close();
  }
});

test("content writer control tools dry-run and request draft iteration with confirm", async () => {
  const { client, close } = await createConnectedClient({
    id: "operator",
    scopes: ["content:read", "content:write"],
    clients: ["beta"],
    tokenHash: "x",
  });
  try {
    const ideaId = "idea-writer-control";
    fs.rmSync(path.join(tmp, "brand", "beta", "content", "drafts", ideaId), { recursive: true, force: true });

    await client.callTool({
      name: "content_create_idea",
      arguments: {
        clientSlug: "beta",
        id: ideaId,
        title: "Writer Control Idea",
        targetChannel: "linkedin",
        angleDraft: "A writer control flow owned by MCP",
        dryRun: false,
        confirm: true,
      },
    });
    const approved = await client.callTool({
      name: "content_approve_idea",
      arguments: {
        clientSlug: "beta",
        ideaId,
        triggerWriter: false,
        dryRun: false,
        confirm: true,
      },
    });
    const contentTaskId = payloadOf(approved).contentTaskId as string;
    const ideaDir = path.join(tmp, "brand", "beta", "content", "drafts", ideaId);
    fs.writeFileSync(
      path.join(ideaDir, "research.md"),
      [
        "# Research",
        "Source A https://example.com/source-a",
        "Source B https://example.com/source-b",
        "Source C https://example.org/source-c",
      ].join("\n"),
    );
    fs.writeFileSync(path.join(ideaDir, "QA-REPORT-research.md"), "verdict: PASS\nscore: 8.5\n");
    fs.mkdirSync(path.join(tmp, "brand", "beta", "intelligence"), { recursive: true });
    fs.writeFileSync(
      path.join(tmp, "brand", "beta", "intelligence", "research-log.json"),
      JSON.stringify([{ ideaId, sources: 3 }], null, 2),
    );

    const retriggerDry = await client.callTool({
      name: "content_retrigger_writer",
      arguments: {
        clientSlug: "beta",
        contentTaskId,
        channel: "linkedin",
        instruction: "Make the opening more specific",
      },
    });
    assert.equal(retriggerDry.isError, undefined);
    const retriggerPayload = payloadOf(retriggerDry);
    assert.equal(retriggerPayload.dryRun, true);
    assert.equal((retriggerPayload.preview as { kind: string; channelScope: string }).kind, "iterate");
    assert.equal((retriggerPayload.preview as { channelScope: string }).channelScope, "linkedin");

    const reconcileState = await client.callTool({
      name: "content_get_reconcile_state",
      arguments: { clientSlug: "beta" },
    });
    assert.equal(reconcileState.isError, undefined);
    assert.equal(payloadOf(reconcileState).ok, true);

    const reconcileDry = await client.callTool({
      name: "content_reconcile",
      arguments: { clientSlug: "beta" },
    });
    assert.equal(reconcileDry.isError, undefined);
    assert.equal(payloadOf(reconcileDry).dryRun, true);

    const iterationDry = await client.callTool({
      name: "content_request_draft_iteration",
      arguments: {
        clientSlug: "beta",
        ideaId,
        channel: "linkedin",
        instruction: "Make the proof point stronger",
      },
    });
    assert.equal(iterationDry.isError, undefined);
    const iterationPreview = payloadOf(iterationDry).preview as { nextIteration: number; snapshotPath: string };
    assert.equal(iterationPreview.nextIteration, 1);
    assert.equal(iterationPreview.snapshotPath, `content/drafts/${ideaId}/linkedin.v0.md`);

    const iterationWrite = await client.callTool({
      name: "content_request_draft_iteration",
      arguments: {
        clientSlug: "beta",
        ideaId,
        channel: "linkedin",
        instruction: "Make the proof point stronger",
        dryRun: false,
        confirm: true,
      },
    });
    assert.equal(iterationWrite.isError, undefined);
    const iterationPayload = payloadOf(iterationWrite);
    assert.equal(iterationPayload.iteration, 1);
    assert.equal(fs.existsSync(path.join(tmp, "brand", "beta", "content", "drafts", ideaId, "linkedin.v0.md")), true);
    const draft = (iterationPayload.draft as { meta: { iteration: number; clarify_answers: { iteration_request: string } } });
    assert.equal(draft.meta.iteration, 1);
    assert.equal(draft.meta.clarify_answers.iteration_request, "Make the proof point stronger");
    const canonicalThread = path.join(tmp, "brand", "beta", "chat", `content-${contentTaskId.toLowerCase()}.json`);
    const legacyThread = path.join(tmp, "brand", "beta", "chat", `task-${contentTaskId.toLowerCase()}.json`);
    assert.equal(fs.existsSync(canonicalThread), true);
    assert.equal(fs.existsSync(legacyThread), true);
  } finally {
    await close();
  }
});

test("content_create_idea rejects unsafe ids", async () => {
  const { client, close } = await createConnectedClient({
    id: "operator",
    scopes: ["content:write"],
    clients: ["beta"],
    tokenHash: "x",
  });
  try {
    const result = await client.callTool({
      name: "content_create_idea",
      arguments: { clientSlug: "beta", id: "../secret", title: "Bad idea" },
    });
    assert.equal(result.isError, true);
    assert.match(result.content[0].type === "text" ? result.content[0].text : "", /simple path segment/);
  } finally {
    await close();
  }
});

test("media read tools require media:read scope", async () => {
  const { client, close } = await createConnectedClient({
    id: "operator",
    scopes: ["content:read"],
    clients: ["alpha"],
    tokenHash: "x",
  });
  try {
    const providers = await client.callTool({
      name: "media_list_image_providers",
      arguments: { clientSlug: "alpha" },
    });
    assert.equal(providers.isError, true);
    assert.match(providers.content[0].type === "text" ? providers.content[0].text : "", /media:read/);

    const assets = await client.callTool({
      name: "media_list_draft_assets",
      arguments: { clientSlug: "alpha", ideaId: "idea-media-scope", channel: "linkedin" },
    });
    assert.equal(assets.isError, true);
    assert.match(assets.content[0].type === "text" ? assets.content[0].text : "", /media:read/);
  } finally {
    await close();
  }
});

test("media write tools attach, reorder and remove draft assets with confirm", async () => {
  seedDocument(
    "brand/beta/content/drafts/idea-media/linkedin.md",
    [
      "---",
      "idea_id: idea-media",
      "channel: linkedin",
      "kind: channel-draft",
      "iteration: 1",
      "created_at: 2026-06-16T09:30:00.000Z",
      "updated_at: 2026-06-16T09:45:00.000Z",
      "---",
      "Draft with media controls",
    ].join("\n"),
  );

  const { client, close } = await createConnectedClient({
    id: "operator",
    scopes: ["media:read", "media:write"],
    clients: ["beta"],
    tokenHash: "x",
  });
  try {
    const providers = await client.callTool({
      name: "media_list_image_providers",
      arguments: { clientSlug: "beta" },
    });
    assert.equal(providers.isError, undefined);
    assert.ok((payloadOf(providers).providers as unknown[]).length >= 1);

    const dryRun = await client.callTool({
      name: "media_attach_asset",
      arguments: {
        clientSlug: "beta",
        ideaId: "idea-media",
        channel: "linkedin",
        url: "https://cdn.example.com/first.png",
        type: "image/png",
      },
    });
    assert.equal(dryRun.isError, undefined);
    assert.equal(payloadOf(dryRun).dryRun, true);

    const attachFirst = await client.callTool({
      name: "media_attach_asset",
      arguments: {
        clientSlug: "beta",
        ideaId: "idea-media",
        channel: "linkedin",
        url: "https://cdn.example.com/first.png",
        type: "image/png",
        dryRun: false,
        confirm: true,
      },
    });
    assert.equal(attachFirst.isError, undefined);

    const attachSecond = await client.callTool({
      name: "media_attach_asset",
      arguments: {
        clientSlug: "beta",
        ideaId: "idea-media",
        channel: "linkedin",
        url: "https://cdn.example.com/second.png",
        type: "image/png",
        dryRun: false,
        confirm: true,
      },
    });
    assert.equal(attachSecond.isError, undefined);

    const listed = await client.callTool({
      name: "media_list_draft_assets",
      arguments: { clientSlug: "beta", ideaId: "idea-media", channel: "linkedin" },
    });
    assert.equal(listed.isError, undefined);
    assert.equal((payloadOf(listed).media as unknown[]).length, 2);

    const primary = await client.callTool({
      name: "media_set_primary_asset",
      arguments: {
        clientSlug: "beta",
        ideaId: "idea-media",
        channel: "linkedin",
        url: "https://cdn.example.com/second.png",
        dryRun: false,
        confirm: true,
      },
    });
    assert.equal(primary.isError, undefined);
    assert.equal(
      ((payloadOf(primary).draft as { meta: { media: Array<{ url: string }> } }).meta.media)[0].url,
      "https://cdn.example.com/second.png",
    );

    const remove = await client.callTool({
      name: "media_remove_asset",
      arguments: {
        clientSlug: "beta",
        ideaId: "idea-media",
        channel: "linkedin",
        url: "https://cdn.example.com/first.png",
        dryRun: false,
        confirm: true,
      },
    });
    assert.equal(remove.isError, undefined);
    assert.equal((payloadOf(remove).draft as { meta: { media: unknown[] } }).meta.media.length, 1);
  } finally {
    await close();
  }
});

test("media write tools require media:write scope", async () => {
  const { client, close } = await createConnectedClient({
    id: "operator",
    scopes: ["media:read"],
    clients: ["alpha"],
    tokenHash: "x",
  });
  try {
    const result = await client.callTool({
      name: "media_attach_asset",
      arguments: {
        clientSlug: "alpha",
        ideaId: "idea-media-write-scope",
        channel: "linkedin",
        url: "https://cdn.example.com/asset.png",
        type: "image/png",
      },
    });
    assert.equal(result.isError, true);
    assert.match(result.content[0].type === "text" ? result.content[0].text : "", /media:write/);
  } finally {
    await close();
  }
});

test("publishing and integrations read tools require their read scopes", async () => {
  const { client, close } = await createConnectedClient({
    id: "operator",
    scopes: ["sancho:read"],
    clients: ["alpha"],
    tokenHash: "x",
  });
  try {
    const providers = await client.callTool({
      name: "publishing_list_providers",
      arguments: { clientSlug: "alpha" },
    });
    assert.equal(providers.isError, true);
    assert.match(providers.content[0].type === "text" ? providers.content[0].text : "", /publishing:read/);

    const account = await client.callTool({
      name: "publishing_get_account_info",
      arguments: { clientSlug: "alpha" },
    });
    assert.equal(account.isError, true);
    assert.match(account.content[0].type === "text" ? account.content[0].text : "", /publishing:read/);

    const integrations = await client.callTool({
      name: "integrations_get_status",
      arguments: { clientSlug: "alpha" },
    });
    assert.equal(integrations.isError, true);
    assert.match(integrations.content[0].type === "text" ? integrations.content[0].text : "", /integrations:read/);

    const catalog = await client.callTool({
      name: "integrations_list_catalog",
      arguments: {},
    });
    assert.equal(catalog.isError, true);
    assert.match(catalog.content[0].type === "text" ? catalog.content[0].text : "", /integrations:read/);
  } finally {
    await close();
  }
});

test("publishing metrics degrade without DB and integrations status reads sanitized local state", async () => {
  seedDocument(
    "brand/alpha/integrations.json",
    JSON.stringify({
      client: "alpha",
      updatedAt: "2026-06-16T12:30:00.000Z",
      dataSources: {
        metricool: {
          provider: "metricool",
          status: "connected",
          config: { API_TOKEN: "super-secret-token", BLOG_ID: "blog-123" },
          envVars: ["ALPHA_METRICOOL_API_TOKEN"],
          lastTestedAt: "2026-06-16T12:20:00.000Z",
        },
      },
      systemOverrides: {
        gsc: { provider: "gsc", status: "error", config: { CLIENT_SECRET: "hidden" }, lastError: "bad auth" },
      },
      slack: {
        status: "connected",
        team_id: "T123",
        team_name: "Alpha Slack",
        bot_user_id: "U123",
        bot_token_encrypted: "encrypted-secret",
        scope: "chat:write",
        authed_user_id: "U999",
        installed_at: "2026-06-16T12:00:00.000Z",
      },
    }),
  );

  const { client, close } = await createConnectedClient({
    id: "operator",
    scopes: ["publishing:read", "integrations:read"],
    clients: ["alpha"],
    tokenHash: "x",
  });
  try {
    const providers = await client.callTool({
      name: "publishing_list_providers",
      arguments: { clientSlug: "alpha", channel: "linkedin" },
    });
    assert.equal(providers.isError, undefined);
    assert.ok((payloadOf(providers).providers as unknown[]).length >= 1);

    const metrics = await client.callTool({
      name: "publishing_get_post_metrics",
      arguments: { clientSlug: "alpha", externalUrl: "https://example.com/posts/alpha" },
    });
    assert.equal(metrics.isError, undefined);
    const metricsPayload = payloadOf(metrics);
    assert.equal(metricsPayload.found, false);

    const integrations = await client.callTool({
      name: "integrations_get_status",
      arguments: { clientSlug: "alpha" },
    });
    assert.equal(integrations.isError, undefined);
    const integrationsPayload = payloadOf(integrations);
    const json = JSON.stringify(integrationsPayload);
    assert.match(json, /API_TOKEN/);
    assert.doesNotMatch(json, /super-secret-token|encrypted-secret|hidden/);
    assert.deepEqual(
      (
        (integrationsPayload.integrations as { dataSources: Record<string, { configKeys: string[] }> })
          .dataSources.metricool.configKeys
      ),
      ["API_TOKEN", "BLOG_ID"],
    );
    assert.equal(
      (
        (integrationsPayload.integrations as { slack: { team_name: string; bot_token_encrypted?: string } })
          .slack
      ).team_name,
      "Alpha Slack",
    );
    assert.equal(
      (
        (integrationsPayload.integrations as { slack: { team_name: string; bot_token_encrypted?: string } })
          .slack
      ).bot_token_encrypted,
      undefined,
    );
  } finally {
    await close();
  }
});

test("integrations write tools require integrations:write scope", async () => {
  const { client, close } = await createConnectedClient({
    id: "operator",
    scopes: ["integrations:read"],
    clients: ["alpha"],
    tokenHash: "x",
  });
  try {
    const testConnection = await client.callTool({
      name: "integrations_test_connection",
      arguments: { clientSlug: "alpha", source: "metricool", dryRun: false, confirm: true },
    });
    assert.equal(testConnection.isError, true);
    assert.match(testConnection.content[0].type === "text" ? testConnection.content[0].text : "", /integrations:write/);

    const publish = await client.callTool({
      name: "integrations_publish_message",
      arguments: {
        clientSlug: "alpha",
        transport: "slack",
        channel: "C123",
        title: "Smoke",
        body: "Hello",
        dryRun: false,
        confirm: true,
      },
    });
    assert.equal(publish.isError, true);
    assert.match(publish.content[0].type === "text" ? publish.content[0].text : "", /integrations:write/);
  } finally {
    await close();
  }
});

test("integrations write tools dry-run without external side effects", async () => {
  seedDocument(
    "brand/alpha/integrations.json",
    JSON.stringify({
      client: "alpha",
      updatedAt: "2026-06-16T12:30:00.000Z",
      dataSources: {
        metricool: { provider: "metricool", status: "connected", config: { API_TOKEN: "hidden" } },
      },
    }),
  );

  const { client, close } = await createConnectedClient({
    id: "operator",
    scopes: ["integrations:read", "integrations:write"],
    clients: ["alpha"],
    tokenHash: "x",
  });
  try {
    const catalog = await client.callTool({
      name: "integrations_list_catalog",
      arguments: {},
    });
    assert.equal(catalog.isError, undefined);
    assert.equal(typeof payloadOf(catalog).found, "boolean");

    const testConnection = await client.callTool({
      name: "integrations_test_connection",
      arguments: { clientSlug: "alpha", source: "metricool" },
    });
    assert.equal(testConnection.isError, undefined);
    const testPayload = payloadOf(testConnection);
    assert.equal(testPayload.dryRun, true);
    assert.equal(testPayload.requiresConfirmation, true);
    assert.deepEqual(
      ((testPayload.preview as { targets: string[] }).targets),
      ["metricool"],
    );

    const publish = await client.callTool({
      name: "integrations_publish_message",
      arguments: {
        clientSlug: "alpha",
        transport: "slack",
        channel: "C123",
        title: "Smoke",
        body: "Hello",
      },
    });
    assert.equal(publish.isError, undefined);
    const publishPayload = payloadOf(publish);
    assert.equal(publishPayload.dryRun, true);
    assert.equal(publishPayload.requiresConfirmation, true);
    assert.deepEqual(
      (publishPayload.preview as { target: { transport: string; channel: string } }).target,
      { transport: "slack", channel: "C123" },
    );
  } finally {
    await close();
  }
});

test("publishing write tools require publishing:write scope", async () => {
  const { client, close } = await createConnectedClient({
    id: "operator",
    scopes: ["publishing:read"],
    clients: ["alpha"],
    tokenHash: "x",
  });
  try {
    const publish = await client.callTool({
      name: "publishing_publish_draft",
      arguments: {
        clientSlug: "alpha",
        ideaId: "idea-publishing-scope",
        channel: "blog",
        providerId: "wordpress",
      },
    });
    assert.equal(publish.isError, true);
    assert.match(publish.content[0].type === "text" ? publish.content[0].text : "", /publishing:write/);

    const reconcile = await client.callTool({
      name: "publishing_reconcile",
      arguments: { clientSlug: "alpha" },
    });
    assert.equal(reconcile.isError, true);
    assert.match(reconcile.content[0].type === "text" ? reconcile.content[0].text : "", /publishing:write/);
  } finally {
    await close();
  }
});

test("publishing publish draft dry-run previews without mutating draft", async () => {
  seedDocument("brand/beta/.env", "BETA_WORDPRESS_APP_PASSWORD=test-app-password\n");
  seedDocument(
    "brand/beta/integrations.json",
    JSON.stringify({
      dataSources: {
        wordpress: {
          status: "connected",
          config: { SITE_URL: "https://wordpress.example.com", USERNAME: "editor" },
        },
      },
    }),
  );
  seedDocument(
    "brand/beta/content/drafts/idea-publish-dry/blog.md",
    [
      "---",
      "idea_id: idea-publish-dry",
      "channel: blog",
      "kind: channel-draft",
      "iteration: 1",
      "created_at: 2026-06-16T09:30:00.000Z",
      "updated_at: 2026-06-16T09:45:00.000Z",
      "---",
      "# Publishable draft",
      "",
      "Draft body for blog publishing",
    ].join("\n"),
  );

  const { client, close } = await createConnectedClient({
    id: "operator",
    scopes: ["publishing:write", "publishing:read"],
    clients: ["beta"],
    tokenHash: "x",
  });
  try {
    const result = await client.callTool({
      name: "publishing_publish_draft",
      arguments: {
        clientSlug: "beta",
        ideaId: "idea-publish-dry",
        channel: "blog",
        providerId: "wordpress",
        publishAt: "2026-06-17T10:00:00.000Z",
      },
    });
    assert.equal(result.isError, undefined);
    const payload = payloadOf(result);
    assert.equal(payload.dryRun, true);
    assert.equal((payload.preview as { providerId: string; schedule: { publishAt: string } }).providerId, "wordpress");
    assert.equal(
      (payload.preview as { providerId: string; schedule: { publishAt: string } }).schedule.publishAt,
      "2026-06-17T10:00:00.000Z",
    );

    const status = await client.callTool({
      name: "publishing_get_status",
      arguments: { clientSlug: "beta", ideaId: "idea-publish-dry", channel: "blog" },
    });
    assert.equal(status.isError, undefined);
    assert.equal(payloadOf(status).publishing, null);
  } finally {
    await close();
  }
});

test("publishing cancel post dry-runs by default and cancels locally with confirm", async () => {
  seedDocument(
    "brand/beta/content/drafts/idea-cancel-scheduled/linkedin.md",
    [
      "---",
      "idea_id: idea-cancel-scheduled",
      "channel: linkedin",
      "kind: channel-draft",
      "iteration: 1",
      "created_at: 2026-06-16T09:30:00.000Z",
      "updated_at: 2026-06-16T09:45:00.000Z",
      "publishing:",
      "  status: scheduled",
      "  provider: unknown-provider",
      "  scheduled_at: 2026-06-17T10:00:00.000Z",
      "  external_job_id: job-123",
      "  external_url: null",
      "  error: null",
      "---",
      "Scheduled draft",
    ].join("\n"),
  );

  const { client, close } = await createConnectedClient({
    id: "operator",
    scopes: ["publishing:write", "publishing:read"],
    clients: ["beta"],
    tokenHash: "x",
  });
  try {
    const dryRun = await client.callTool({
      name: "publishing_cancel_post",
      arguments: { clientSlug: "beta", ideaId: "idea-cancel-scheduled", channel: "linkedin" },
    });
    assert.equal(dryRun.isError, undefined);
    assert.equal(payloadOf(dryRun).dryRun, true);

    const write = await client.callTool({
      name: "publishing_cancel_post",
      arguments: {
        clientSlug: "beta",
        ideaId: "idea-cancel-scheduled",
        channel: "linkedin",
        dryRun: false,
        confirm: true,
      },
    });
    assert.equal(write.isError, undefined);
    assert.equal((payloadOf(write).publishing as { status: string }).status, "canceled");

    const status = await client.callTool({
      name: "publishing_get_status",
      arguments: { clientSlug: "beta", ideaId: "idea-cancel-scheduled", channel: "linkedin" },
    });
    assert.equal((payloadOf(status).publishing as { status: string }).status, "canceled");
  } finally {
    await close();
  }
});

test("publishing reconcile dry-run previews due scheduled drafts", async () => {
  seedDocument(
    "brand/beta/projects/publish-project/tasks.json",
    JSON.stringify([
      {
        id: "PUBLISH-1",
        type: "content",
        content_tasks: [
          {
            id: "PUBLISH-1-C01",
            parent_task_id: "PUBLISH-1",
            idea_id: "idea-reconcile-due",
            name: "Due post",
            status: "Approved",
            target_channels: ["linkedin"],
            channel_phases: { linkedin: "approved" },
            documents: [],
            skill: "content-writer",
            created_at: "2026-06-16T09:00:00.000Z",
            updated_at: "2026-06-16T09:00:00.000Z",
          },
        ],
      },
    ]),
  );
  seedDocument(
    "brand/beta/content/drafts/idea-reconcile-due/linkedin.md",
    [
      "---",
      "idea_id: idea-reconcile-due",
      "content_task_id: PUBLISH-1-C01",
      "channel: linkedin",
      "kind: channel-draft",
      "iteration: 1",
      "created_at: 2026-06-16T09:30:00.000Z",
      "updated_at: 2026-06-16T09:45:00.000Z",
      "publishing:",
      "  status: scheduled",
      "  provider: metricool",
      "  scheduled_at: 2026-06-15T10:00:00.000Z",
      "  external_job_id: job-123",
      "  external_url: null",
      "  error: null",
      "---",
      "Due scheduled draft body with enough length to be reconciled later.",
    ].join("\n"),
  );

  const { client, close } = await createConnectedClient({
    id: "operator",
    scopes: ["publishing:write"],
    clients: ["beta"],
    tokenHash: "x",
  });
  try {
    const result = await client.callTool({
      name: "publishing_reconcile",
      arguments: { clientSlug: "beta" },
    });
    assert.equal(result.isError, undefined);
    const payload = payloadOf(result);
    assert.equal(payload.dryRun, true);
    assert.equal((payload.preview as { scanned: number }).scanned, 1);
    assert.equal(
      ((payload.preview as { pending: Array<{ ideaId: string }> }).pending)[0].ideaId,
      "idea-reconcile-due",
    );
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

test("open design read tools require open-design:read scope", async () => {
  const { client, close } = await createConnectedClient({
    id: "operator",
    scopes: ["sancho:read"],
    clients: ["alpha"],
    tokenHash: "x",
  });
  try {
    const result = await client.callTool({
      name: "open_design_list_project_files",
      arguments: { clientSlug: "alpha", projectId: "od_project" },
    });
    assert.equal(result.isError, true);
    assert.match(result.content[0].type === "text" ? result.content[0].text : "", /open-design:read/);
  } finally {
    await close();
  }
});

test("open design write tools require open-design:write scope", async () => {
  seedDocument("brand/alpha/content/assets/.keep", "");

  const { client, close } = await createConnectedClient({
    id: "operator",
    scopes: ["open-design:read"],
    clients: ["alpha"],
    tokenHash: "x",
  });
  try {
    const importProject = await client.callTool({
      name: "open_design_import_project",
      arguments: { clientSlug: "alpha", scope: "content/assets", dryRun: false, confirm: true },
    });
    assert.equal(importProject.isError, true);
    assert.match(importProject.content[0].type === "text" ? importProject.content[0].text : "", /open-design:write/);

    const updateProject = await client.callTool({
      name: "open_design_update_project",
      arguments: { clientSlug: "alpha", projectId: "od_project", name: "Updated", dryRun: false, confirm: true },
    });
    assert.equal(updateProject.isError, true);
    assert.match(updateProject.content[0].type === "text" ? updateProject.content[0].text : "", /open-design:write/);

    const exportArtifact = await client.callTool({
      name: "open_design_export_artifact",
      arguments: { clientSlug: "alpha", artifactId: "artifact_1", format: "zip", dryRun: false, confirm: true },
    });
    assert.equal(exportArtifact.isError, true);
    assert.match(exportArtifact.content[0].type === "text" ? exportArtifact.content[0].text : "", /open-design:write/);
  } finally {
    await close();
  }
});

test("open_design_import_project dry-runs brand folder imports without daemon access", async () => {
  seedDocument("brand/alpha/content/assets/.keep", "");

  const { client, close } = await createConnectedClient({
    id: "operator",
    scopes: ["open-design:write"],
    clients: ["alpha"],
    tokenHash: "x",
  });
  try {
    const result = await client.callTool({
      name: "open_design_import_project",
      arguments: { clientSlug: "alpha", scope: "content/assets" },
    });
    assert.equal(result.isError, undefined);
    const payload = payloadOf(result);
    assert.equal(payload.dryRun, true);
    assert.equal(payload.requiresConfirmation, true);
    assert.equal((payload.preview as { scope: string }).scope, "content/assets");
    assert.equal((payload.preview as { willImportIfMissing: boolean }).willImportIfMissing, true);
  } finally {
    await close();
  }
});

test("open design project update and artifact export dry-run without daemon access", async () => {
  const { client, close } = await createConnectedClient({
    id: "operator",
    scopes: ["open-design:write"],
    clients: ["alpha"],
    tokenHash: "x",
  });
  try {
    const update = await client.callTool({
      name: "open_design_update_project",
      arguments: {
        clientSlug: "alpha",
        projectId: "od_project",
        name: "Updated OD Project",
        skillId: "html-adaptation",
        designSystemId: "alpha",
      },
    });
    assert.equal(update.isError, undefined);
    const updatePayload = payloadOf(update);
    assert.equal(updatePayload.dryRun, true);
    assert.deepEqual(
      (updatePayload.preview as { patch: Record<string, unknown> }).patch,
      { name: "Updated OD Project", skillId: "html-adaptation", designSystemId: "alpha" },
    );

    const exportResult = await client.callTool({
      name: "open_design_export_artifact",
      arguments: { clientSlug: "alpha", artifactId: "artifact_1", format: "zip", destination: "exports/artifact.zip" },
    });
    assert.equal(exportResult.isError, undefined);
    const exportPayload = payloadOf(exportResult);
    assert.equal(exportPayload.dryRun, true);
    assert.deepEqual(
      (exportPayload.preview as { request: Record<string, unknown> }).request,
      { artifactId: "artifact_1", format: "zip", destination: "exports/artifact.zip" },
    );

    const conflict = await client.callTool({
      name: "open_design_update_project",
      arguments: { clientSlug: "alpha", projectId: "od_project", skillId: "x", clearSkill: true },
    });
    assert.equal(conflict.isError, true);
    assert.match(conflict.content[0].type === "text" ? conflict.content[0].text : "", /either skillId or clearSkill/i);
  } finally {
    await close();
  }
});

test("open_design_get_project_file rejects path traversal before daemon access", async () => {
  const { client, close } = await createConnectedClient({
    id: "operator",
    scopes: ["open-design:read"],
    clients: ["alpha"],
    tokenHash: "x",
  });
  try {
    const result = await client.callTool({
      name: "open_design_get_project_file",
      arguments: { clientSlug: "alpha", projectId: "od_project", filePath: "../secret.md" },
    });
    assert.equal(result.isError, true);
    assert.match(result.content[0].type === "text" ? result.content[0].text : "", /traversal/i);
  } finally {
    await close();
  }
});

test("open_design_resolve_project rejects scope traversal before daemon access", async () => {
  const { client, close } = await createConnectedClient({
    id: "operator",
    scopes: ["open-design:read"],
    clients: ["alpha"],
    tokenHash: "x",
  });
  try {
    const result = await client.callTool({
      name: "open_design_resolve_project",
      arguments: { clientSlug: "alpha", scope: "../beta" },
    });
    assert.equal(result.isError, true);
    assert.match(result.content[0].type === "text" ? result.content[0].text : "", /traversal|outside/i);
  } finally {
    await close();
  }
});

test("open_design_import_project rejects scope traversal before daemon access", async () => {
  const { client, close } = await createConnectedClient({
    id: "operator",
    scopes: ["open-design:write"],
    clients: ["alpha"],
    tokenHash: "x",
  });
  try {
    const result = await client.callTool({
      name: "open_design_import_project",
      arguments: { clientSlug: "alpha", scope: "../beta" },
    });
    assert.equal(result.isError, true);
    assert.match(result.content[0].type === "text" ? result.content[0].text : "", /traversal|outside/i);
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

test("sancho_update_document requires docs:write scope", async () => {
  seedDocument("brand/xhype/market-and-us/market/current.md", "# XHYPE Market");

  const { client, close } = await createConnectedClient({
    id: "operator",
    scopes: ["docs:read"],
    clients: ["growth4u"],
    brands: ["xhype"],
    tokenHash: "x",
  });
  try {
    const result = await client.callTool({
      name: "sancho_update_document",
      arguments: {
        brandSlug: "xhype",
        docPath: "market-and-us/market/current.md",
        content: "# Updated",
        dryRun: false,
        confirm: true,
      },
    });
    assert.equal(result.isError, true);
    assert.match(result.content[0].type === "text" ? result.content[0].text : "", /docs:write/);
  } finally {
    await close();
  }
});

test("sancho_update_document dry-runs and writes existing docs with hash guard", async () => {
  seedDocument("brand/xhype/market-and-us/self/current.md", "# XHYPE Self\n\nOld");

  const { client, close } = await createConnectedClient({
    id: "operator",
    scopes: ["docs:write"],
    clients: ["growth4u"],
    brands: ["xhype"],
    tokenHash: "x",
  });
  try {
    const dryRun = await client.callTool({
      name: "sancho_update_document",
      arguments: {
        brandSlug: "xhype",
        docPath: "market-and-us/self/current.md",
        content: "# XHYPE Self\n\nUpdated",
      },
    });
    assert.equal(dryRun.isError, undefined);
    const preview = payloadOf(dryRun).preview as {
      currentSha256: string;
      nextSha256: string;
      changed: boolean;
    };
    assert.equal(payloadOf(dryRun).dryRun, true);
    assert.equal(preview.changed, true);
    assert.notEqual(preview.currentSha256, preview.nextSha256);
    assert.equal(
      fs.readFileSync(path.join(tmp, "brand/xhype/market-and-us/self/current.md"), "utf8"),
      "# XHYPE Self\n\nOld",
    );

    const write = await client.callTool({
      name: "sancho_update_document",
      arguments: {
        brandSlug: "xhype",
        docPath: "market-and-us/self/current.md",
        content: "# XHYPE Self\n\nUpdated",
        expectedSha256: preview.currentSha256,
        dryRun: false,
        confirm: true,
      },
    });
    assert.equal(write.isError, undefined);
    assert.equal(payloadOf(write).path, "brand/xhype/market-and-us/self/current.md");
    assert.equal(
      fs.readFileSync(path.join(tmp, "brand/xhype/market-and-us/self/current.md"), "utf8"),
      "# XHYPE Self\n\nUpdated",
    );

    const stale = await client.callTool({
      name: "sancho_update_document",
      arguments: {
        brandSlug: "xhype",
        docPath: "market-and-us/self/current.md",
        content: "# XHYPE Self\n\nSecond update",
        expectedSha256: preview.currentSha256,
        dryRun: false,
        confirm: true,
      },
    });
    assert.equal(stale.isError, true);
    assert.match(stale.content[0].type === "text" ? stale.content[0].text : "", /hash mismatch/i);
  } finally {
    await close();
  }
});

test("sancho_update_document can create allowed docs with explicit createIfMissing", async () => {
  const { client, close } = await createConnectedClient({
    id: "operator",
    scopes: ["docs:write"],
    clients: ["growth4u"],
    brands: ["xhype"],
    tokenHash: "x",
  });
  try {
    const missing = await client.callTool({
      name: "sancho_update_document",
      arguments: {
        brandSlug: "xhype",
        docPath: "market-and-us/new/current.md",
        content: "# New Doc",
      },
    });
    assert.equal(missing.isError, true);
    assert.match(missing.content[0].type === "text" ? missing.content[0].text : "", /not found/i);

    const created = await client.callTool({
      name: "sancho_update_document",
      arguments: {
        brandSlug: "xhype",
        docPath: "market-and-us/new/current.md",
        content: "# New Doc",
        createIfMissing: true,
        dryRun: false,
        confirm: true,
      },
    });
    assert.equal(created.isError, undefined);
    assert.equal(
      fs.readFileSync(path.join(tmp, "brand/xhype/market-and-us/new/current.md"), "utf8"),
      "# New Doc",
    );
  } finally {
    await close();
  }
});

test("meeting intelligence tools require intelligence:read scope", async () => {
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

    const config = await client.callTool({
      name: "sancho_get_meeting_intelligence_config",
      arguments: { clientSlug: "alpha" },
    });
    assert.equal(config.isError, true);
    assert.match(config.content[0].type === "text" ? config.content[0].text : "", /intelligence:read/);
  } finally {
    await close();
  }
});

test("meeting intelligence read tools return storage diagnostics without database", async () => {
  const { client, close } = await createConnectedClient({
    id: "operator",
    scopes: ["intelligence:read"],
    clients: ["alpha"],
    tokenHash: "x",
  });
  try {
    const meetings = await client.callTool({
      name: "sancho_list_meetings",
      arguments: { clientSlug: "alpha", limit: 10 },
    });
    assert.equal(meetings.isError, undefined);
    const meetingsPayload = payloadOf(meetings);
    assert.equal(meetingsPayload.ok, false);
    assert.equal((meetingsPayload.storage as { configured: boolean }).configured, false);
    assert.deepEqual(meetingsPayload.meetings, []);
    assert.equal((meetingsPayload.totals as { meetings: number }).meetings, 0);
    assert.equal(meetingsPayload.lastCheckStatus, "neon_not_configured");

    const config = await client.callTool({
      name: "sancho_get_meeting_intelligence_config",
      arguments: { clientSlug: "alpha" },
    });
    assert.equal(config.isError, undefined);
    const configPayload = payloadOf(config);
    assert.equal(configPayload.ok, false);
    assert.equal((configPayload.storage as { configured: boolean }).configured, false);
    assert.equal((configPayload.config as { slug: string }).slug, "alpha");
    assert.equal((configPayload.cron as { configured: boolean }).configured, false);

    const intelligence = await client.callTool({
      name: "sancho_list_intelligence",
      arguments: { clientSlug: "alpha", kind: "Decision", status: "accepted" },
    });
    assert.equal(intelligence.isError, undefined);
    const intelligencePayload = payloadOf(intelligence);
    assert.equal(intelligencePayload.ok, false);
    assert.deepEqual(intelligencePayload.filters, { kind: "Decision", status: "accepted" });
    assert.deepEqual(intelligencePayload.intelligence, []);
    assert.deepEqual(intelligencePayload.decisions, []);
    assert.deepEqual(intelligencePayload.documents, []);
    assert.deepEqual(intelligencePayload.proposals, []);

    const meeting = await client.callTool({
      name: "sancho_get_meeting",
      arguments: { clientSlug: "alpha", meetingId: "mim_missing" },
    });
    assert.equal(meeting.isError, undefined);
    const meetingPayload = payloadOf(meeting);
    assert.equal(meetingPayload.ok, false);
    assert.equal(meetingPayload.detail, null);
    assert.match(String(meetingPayload.error), /DATABASE_URL/);
  } finally {
    await close();
  }
});

test("meeting intelligence write tools require intelligence:write scope", async () => {
  const { client, close } = await createConnectedClient({
    id: "operator",
    scopes: ["intelligence:read"],
    clients: ["alpha"],
    tokenHash: "x",
  });
  try {
    const updateConfig = await client.callTool({
      name: "sancho_update_meeting_intelligence_config",
      arguments: { clientSlug: "alpha", config: { enabled: true } },
    });
    assert.equal(updateConfig.isError, true);
    assert.match(updateConfig.content[0].type === "text" ? updateConfig.content[0].text : "", /intelligence:write/);

    const runSync = await client.callTool({
      name: "sancho_run_meeting_intelligence_sync",
      arguments: { clientSlug: "alpha" },
    });
    assert.equal(runSync.isError, true);
    assert.match(runSync.content[0].type === "text" ? runSync.content[0].text : "", /intelligence:write/);

    const applyRecommendation = await client.callTool({
      name: "sancho_apply_meeting_recommendation",
      arguments: { clientSlug: "alpha", recommendationId: "mirc_1", action: "approve" },
    });
    assert.equal(applyRecommendation.isError, true);
    assert.match(
      applyRecommendation.content[0].type === "text" ? applyRecommendation.content[0].text : "",
      /intelligence:write/,
    );
  } finally {
    await close();
  }
});

test("meeting intelligence write tools dry-run without database or provider access", async () => {
  const { client, close } = await createConnectedClient({
    id: "operator",
    scopes: ["intelligence:write"],
    clients: ["alpha"],
    tokenHash: "x",
  });
  try {
    const updateConfig = await client.callTool({
      name: "sancho_update_meeting_intelligence_config",
      arguments: {
        clientSlug: "alpha",
        config: {
          enabled: true,
          sync: { enabled: true, time: "19:30", timezone: "Europe/Madrid", limit: 5 },
          sources: { manualUpload: { enabled: true } },
          routing: { publishChannel: "intelligence", reviewOwner: "Alfonso" },
        },
      },
    });
    assert.equal(updateConfig.isError, undefined);
    const updatePayload = payloadOf(updateConfig);
    assert.equal(updatePayload.dryRun, true);
    assert.equal(
      (((updatePayload.preview as { config: { sync: { time: string } } }).config).sync).time,
      "19:30",
    );

    const runSync = await client.callTool({
      name: "sancho_run_meeting_intelligence_sync",
      arguments: { clientSlug: "alpha", trigger: "mcp-test", limit: 7 },
    });
    assert.equal(runSync.isError, undefined);
    const runPayload = payloadOf(runSync);
    assert.equal(runPayload.dryRun, true);
    assert.deepEqual(runPayload.preview, { slug: "alpha", trigger: "mcp-test", limit: 7 });

    const applyRecommendation = await client.callTool({
      name: "sancho_apply_meeting_recommendation",
      arguments: { clientSlug: "alpha", recommendationId: "mirc_1", action: "convert" },
    });
    assert.equal(applyRecommendation.isError, undefined);
    const actionPayload = payloadOf(applyRecommendation);
    assert.equal(actionPayload.dryRun, true);
    assert.deepEqual(actionPayload.preview, {
      clientSlug: "alpha",
      recommendationId: "mirc_1",
      action: "convert",
    });
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

test("sancho_update_document rejects traversal, wrong brand, unsupported extensions and hidden folders", async () => {
  seedDocument("brand/xhype/market-and-us/market/current.md", "# XHYPE Market");
  seedDocument("brand/xhype/market-and-us/raw/data.json", "{}");
  seedDocument("brand/xhype/chat/internal.md", "# Chat");

  const { client, close } = await createConnectedClient({
    id: "operator",
    scopes: ["docs:write"],
    clients: ["growth4u"],
    brands: ["xhype"],
    tokenHash: "x",
  });
  try {
    const traversal = await client.callTool({
      name: "sancho_update_document",
      arguments: {
        brandSlug: "xhype",
        docPath: "../alpha/market-and-us/market/current.md",
        content: "# Bad",
      },
    });
    assert.equal(traversal.isError, true);
    assert.match(traversal.content[0].type === "text" ? traversal.content[0].text : "", /traversal/i);

    const wrongBrand = await client.callTool({
      name: "sancho_update_document",
      arguments: {
        brandSlug: "xhype",
        docPath: "brand/alpha/market-and-us/market/current.md",
        content: "# Bad",
      },
    });
    assert.equal(wrongBrand.isError, true);
    assert.match(wrongBrand.content[0].type === "text" ? wrongBrand.content[0].text : "", /different brand/i);

    const unsupported = await client.callTool({
      name: "sancho_update_document",
      arguments: {
        brandSlug: "xhype",
        docPath: "market-and-us/raw/data.json",
        content: "{}",
      },
    });
    assert.equal(unsupported.isError, true);
    assert.match(unsupported.content[0].type === "text" ? unsupported.content[0].text : "", /Unsupported document extension/i);

    const hidden = await client.callTool({
      name: "sancho_update_document",
      arguments: {
        brandSlug: "xhype",
        docPath: "chat/internal.md",
        content: "# Bad",
      },
    });
    assert.equal(hidden.isError, true);
    assert.match(hidden.content[0].type === "text" ? hidden.content[0].text : "", /hidden\/system/i);
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
    assert.equal(payload.traceId, "trace-test-1");

    const list = await client.callTool({ name: "sancho_list_tasks", arguments: { clientSlug: "alpha" } });
    const listPayload = payloadOf(list);
    assert.equal(listPayload.count, 0);
    assert.equal(listPayload.traceId, "trace-test-1");
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

test("recurring tools require recurring scopes", async () => {
  const { client, close } = await createConnectedClient({
    id: "operator",
    scopes: ["tasks:read"],
    clients: ["alpha"],
    tokenHash: "x",
  });
  try {
    const list = await client.callTool({
      name: "recurring_list_tasks",
      arguments: { clientSlug: "alpha" },
    });
    assert.equal(list.isError, true);
    assert.match(list.content[0].type === "text" ? list.content[0].text : "", /recurring:read/);

    const toggle = await client.callTool({
      name: "recurring_set_task_status",
      arguments: { clientSlug: "alpha", taskId: "rt-local", desiredStatus: "paused" },
    });
    assert.equal(toggle.isError, true);
    assert.match(toggle.content[0].type === "text" ? toggle.content[0].text : "", /recurring:write/);
  } finally {
    await close();
  }
});

test("recurring tools list OpenClaw and local tasks and update local status with confirm", async () => {
  const cronDir = path.join(tmp, ".openclaw", "cron");
  fs.mkdirSync(cronDir, { recursive: true });
  fs.writeFileSync(
    path.join(cronDir, "jobs.json"),
    JSON.stringify({
      version: 1,
      jobs: [
        {
          id: "cron-alpha-daily",
          name: "Daily Pulse — Alpha",
          enabled: true,
          schedule: { kind: "cron", expr: "0 9 * * *", tz: "Europe/Madrid" },
          agentId: "sancho",
          payload: {
            kind: "agentTurn",
            model: "gpt-5.2",
            message: "Run daily pulse for brand/alpha/content.",
          },
        },
      ],
    }),
  );
  seedDocument(
    "brand/alpha/idea-generation/recurring-tasks.json",
    JSON.stringify({
      tasks: [
        {
          id: "rt-local",
          name: "Legacy ideas",
          slug: "alpha",
          skill: "content",
          schedule: "0 12 * * *",
          active: true,
          status: "active",
          prompt: "Generate local ideas",
          created_at: "2026-06-01T00:00:00.000Z",
          updated_at: "2026-06-01T00:00:00.000Z",
        },
      ],
    }),
  );

  const { client, close } = await createConnectedClient({
    id: "operator",
    scopes: ["recurring:read", "recurring:write"],
    clients: ["alpha"],
    tokenHash: "x",
  });
  try {
    const list = await client.callTool({
      name: "recurring_list_tasks",
      arguments: { clientSlug: "alpha", limit: 10 },
    });
    assert.equal(list.isError, undefined);
    const listPayload = payloadOf(list);
    assert.equal(listPayload.count, 2);
    const tasks = listPayload.tasks as Array<{ id: string; source: string; status: string }>;
    assert.equal(tasks.some((task) => task.id === "cron-alpha-daily" && task.source === "openclaw-cron"), true);
    assert.equal(tasks.some((task) => task.id === "rt-local" && task.source === "local"), true);

    const cronDryRun = await client.callTool({
      name: "recurring_set_task_status",
      arguments: { clientSlug: "alpha", taskId: "cron-alpha-daily", desiredStatus: "paused" },
    });
    assert.equal(cronDryRun.isError, undefined);
    const cronPayload = payloadOf(cronDryRun);
    assert.equal(cronPayload.dryRun, true);
    assert.equal((cronPayload.preview as { source: string }).source, "openclaw-cron");

    const localWrite = await client.callTool({
      name: "recurring_set_task_status",
      arguments: {
        clientSlug: "alpha",
        taskId: "rt-local",
        desiredStatus: "paused",
        dryRun: false,
        confirm: true,
      },
    });
    assert.equal(localWrite.isError, undefined);
    assert.equal((payloadOf(localWrite).task as { status: string }).status, "paused");
    const saved = JSON.parse(
      fs.readFileSync(path.join(tmp, "brand/alpha/idea-generation/recurring-tasks.json"), "utf8"),
    ) as { tasks: Array<{ id: string; status: string; active: boolean }> };
    assert.equal(saved.tasks.find((task) => task.id === "rt-local")?.status, "paused");
    assert.equal(saved.tasks.find((task) => task.id === "rt-local")?.active, false);
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
