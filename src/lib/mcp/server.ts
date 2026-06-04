import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import * as z from "zod/v4";
import { addMessage, getChatSecret, getGatewayUrl } from "@/lib/data/mc-chat";
import { loadClients } from "@/lib/data/clients";
import { getInternalClientStatus } from "@/lib/sancho-internal-api";
import { getTask, listUnifiedTaskRowsAsync } from "@/lib/data/tasks";
import { resolveYalcConfig, yalcFetch, countYalcRows, publicYalcConfig } from "@/lib/yalc/client";
import {
  resolveOdConfig,
  odHealth,
  odListCraftGuides,
  odListDesignSystems,
  odListPromptTemplates,
  odListProjects,
  odListSkills,
} from "@/lib/open-design/client";
import { auditMcpToolCall } from "@/lib/mcp/audit";
import {
  assertMcpClientAccess,
  assertMcpScope,
  McpAuthError,
  type McpPrincipal,
  type McpScope,
} from "@/lib/mcp/auth";

interface SanchoMcpContext {
  principal: McpPrincipal;
  traceId: string;
}

const TASK_LIMIT_DEFAULT = 50;
const TASK_LIMIT_MAX = 200;

const YALC_OVERVIEW_CHECKS = {
  skills: "/api/skills/list",
  today: "/api/today/feed",
  campaigns: "/api/campaigns",
  gates: "/api/gates/awaiting",
  providers: "/api/keys/list",
} as const;

type YalcOverviewCheck = {
  ok: boolean;
  count: number | null;
  data?: unknown;
  error?: string;
};

export function createSanchoMcpServer(context: SanchoMcpContext): McpServer {
  const server = new McpServer(
    {
      name: "sancho",
      version: "0.1.0",
    },
    {
      capabilities: {
        logging: {},
      },
    },
  );

  server.registerTool(
    "sancho_mcp_status",
    {
      title: "Sancho MCP status",
      description: "Checks Sancho MCP connectivity and returns the authenticated token profile.",
      inputSchema: {},
    },
    async () =>
      runTool(context, "sancho_mcp_status", undefined, async () =>
        jsonResult({
          ok: true,
          server: "sancho",
          version: "0.1.0",
          traceId: context.traceId,
          principal: {
            id: context.principal.id,
            scopes: context.principal.scopes,
            clients: context.principal.clients,
          },
        }),
      ),
  );

  server.registerTool(
    "sancho_list_clients",
    {
      title: "List Sancho clients",
      description: "Lists clients allowed by the MCP token. Requires sancho:read.",
      inputSchema: {},
    },
    async () =>
      runTool(context, "sancho_list_clients", undefined, async () => {
        assertMcpScope(context.principal, "sancho:read");
        const allowed = new Set(context.principal.clients);
        const clients = loadClients()
          .filter((client) => allowed.has("*") || allowed.has(client.slug))
          .map((client) => ({
            slug: client.slug,
            name: client.name,
            plan: client.plan,
            status: client.status,
            subscriptionStatus: client.subscriptionStatus,
          }));
        return jsonResult({ clients, count: clients.length });
      }),
  );

  server.registerTool(
    "sancho_get_client_context",
    {
      title: "Get Sancho client context",
      description: "Returns status, active work, blockers and recent outputs for one client. Requires sancho:read.",
      inputSchema: {
        clientSlug: z.string().min(1).describe("Sancho client slug."),
      },
    },
    async ({ clientSlug }) =>
      runTool(context, "sancho_get_client_context", clientSlug, async () => {
        assertClientScope(context, "sancho:read", clientSlug);
        const status = getInternalClientStatus(clientSlug);
        if (!status) throw new McpAuthError(404, `Client context not found: ${clientSlug}`);
        return jsonResult(status);
      }),
  );

  server.registerTool(
    "sancho_list_tasks",
    {
      title: "List Sancho tasks",
      description: "Lists tasks for a client with optional status/type filters. Requires tasks:read.",
      inputSchema: {
        clientSlug: z.string().min(1).describe("Sancho client slug."),
        status: z.string().optional().describe("Optional exact task status filter."),
        type: z.string().optional().describe("Optional exact task type filter."),
        limit: z.number().int().min(1).max(TASK_LIMIT_MAX).optional().describe("Maximum tasks to return."),
      },
    },
    async ({ clientSlug, status, type, limit }) =>
      runTool(context, "sancho_list_tasks", clientSlug, async () => {
        assertClientScope(context, "tasks:read", clientSlug);
        const max = clampLimit(limit);
        const tasks = (await listUnifiedTaskRowsAsync(clientSlug))
          .filter((task) => !status || task.status === status)
          .filter((task) => !type || task.type === type)
          .slice(0, max);
        return jsonResult({ tasks, count: tasks.length, limit: max });
      }),
  );

  server.registerTool(
    "sancho_get_task",
    {
      title: "Get Sancho task",
      description: "Returns one task by id for a client. Requires tasks:read.",
      inputSchema: {
        clientSlug: z.string().min(1).describe("Sancho client slug."),
        taskId: z.string().min(1).describe("Task id."),
      },
    },
    async ({ clientSlug, taskId }) =>
      runTool(context, "sancho_get_task", clientSlug, async () => {
        assertClientScope(context, "tasks:read", clientSlug);
        const task = await getTask(clientSlug, taskId);
        if (!task) throw new McpAuthError(404, `Task not found: ${taskId}`);
        return jsonResult(task);
      }),
  );

  server.registerTool(
    "sancho_send_message",
    {
      title: "Send Sancho chat message",
      description:
        "Sends a message into Sancho Mission Control chat. Requires sancho:chat. Defaults to dry-run and requires confirm=true for execution.",
      inputSchema: {
        clientSlug: z.string().min(1).describe("Sancho client slug."),
        text: z.string().min(1).describe("Message text."),
        threadId: z.string().optional().describe("Optional MC chat thread id."),
        threadName: z.string().optional().describe("Optional thread display name."),
        agent: z.string().optional().describe("Optional target agent id."),
        dryRun: z.boolean().default(true).describe("When true, only previews the send operation."),
        confirm: z.boolean().default(false).describe("Must be true with dryRun=false to send."),
      },
    },
    async ({ clientSlug, text, threadId, threadName, agent, dryRun, confirm }) =>
      runTool(context, "sancho_send_message", clientSlug, async () => {
        assertClientScope(context, "sancho:chat", clientSlug);
        const tid = threadId || `${clientSlug}:mcp`;
        const payload = {
          slug: clientSlug,
          threadId: tid,
          threadName: threadName || tid,
          text,
          userId: `mcp:${context.principal.id}`,
          userName: "Claude Code",
          isAdmin: true,
          senderRole: "admin",
          _source: "mcp",
          agentId: agent,
          agent,
        };

        if (dryRun !== false || confirm !== true) {
          return jsonResult({
            ok: true,
            dryRun: true,
            requiresConfirmation: true,
            message: "Set dryRun=false and confirm=true to send this chat message.",
            payload,
          });
        }

        addMessage(tid, "user", text);
        const secret = getChatSecret();
        const response = await fetch(`${getGatewayUrl()}/mc-chat/inbound`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...traceHeaders(context),
            ...(secret ? { "X-MC-Secret": secret } : {}),
          },
          body: JSON.stringify(payload),
        });
        const data = (await response.json()) as unknown;
        if (!response.ok) {
          throw new Error(`Mission Control gateway rejected message: ${response.status}`);
        }
        return jsonResult({ ok: true, chatId: extractChatId(data) || tid, gateway: data });
      }),
  );

  server.registerTool(
    "yalc_get_overview",
    {
      title: "Get YALC overview",
      description: "Returns read-only YALC health/count overview for a Sancho client. Requires yalc:read.",
      inputSchema: {
        clientSlug: z.string().min(1).describe("Sancho client slug."),
      },
    },
    async ({ clientSlug }) =>
      runTool(context, "yalc_get_overview", clientSlug, async () => {
        assertClientScope(context, "yalc:read", clientSlug);
        const config = resolveYalcConfig(clientSlug);
        const entries = await Promise.all(
          Object.entries(YALC_OVERVIEW_CHECKS).map(async ([name, endpoint]) => {
            try {
              const data = await yalcFetch(config, endpoint, { headers: traceHeaders(context) });
              return [name, { ok: true, count: countYalcRows(data), data }] as const;
            } catch (err) {
              return [
                name,
                {
                  ok: false,
                  count: null,
                  error: err instanceof Error ? err.message : "YALC request failed",
                },
              ] as const;
            }
          }),
        );
        const checks = Object.fromEntries(entries) as Record<string, YalcOverviewCheck>;
        return jsonResult({
          ok: Object.values(checks).every((check) => check.ok),
          runtime: publicYalcConfig(config),
          checks,
        });
      }),
  );

  server.registerTool(
    "yalc_list_campaigns",
    {
      title: "List YALC campaigns",
      description: "Lists read-only YALC campaigns for a Sancho client. Requires yalc:read.",
      inputSchema: {
        clientSlug: z.string().min(1).describe("Sancho client slug."),
      },
    },
    async ({ clientSlug }) =>
      runTool(context, "yalc_list_campaigns", clientSlug, async () => {
        assertClientScope(context, "yalc:read", clientSlug);
        const data = await yalcFetch(resolveYalcConfig(clientSlug), "/api/campaigns", {
          headers: traceHeaders(context),
        });
        return jsonResult(data);
      }),
  );

  server.registerTool(
    "yalc_list_gates",
    {
      title: "List YALC approval gates",
      description: "Lists read-only YALC approval gates awaiting action. Requires yalc:read.",
      inputSchema: {
        clientSlug: z.string().min(1).describe("Sancho client slug."),
      },
    },
    async ({ clientSlug }) =>
      runTool(context, "yalc_list_gates", clientSlug, async () => {
        assertClientScope(context, "yalc:read", clientSlug);
        const data = await yalcFetch(resolveYalcConfig(clientSlug), "/api/gates/awaiting", {
          headers: traceHeaders(context),
        });
        return jsonResult(data);
      }),
  );

  server.registerTool(
    "open_design_health",
    {
      title: "Check Open Design health",
      description: "Checks the Open Design daemon through the Sancho MCP boundary. Requires open-design:read.",
      inputSchema: {
        clientSlug: z.string().min(1).describe("Sancho client slug."),
      },
    },
    async ({ clientSlug }) =>
      runTool(context, "open_design_health", clientSlug, async () => {
        assertClientScope(context, "open-design:read", clientSlug);
        return jsonResult(await odHealth(odConfig(context)));
      }),
  );

  server.registerTool(
    "open_design_list_catalog",
    {
      title: "List Open Design catalog",
      description: "Lists Open Design skills, design systems, prompt templates, craft guides or projects. Requires open-design:read.",
      inputSchema: {
        clientSlug: z.string().min(1).describe("Sancho client slug."),
        type: z
          .enum(["skills", "design-systems", "prompt-templates", "craft-guides", "projects"])
          .describe("Open Design catalog type."),
        filter: z.string().optional().describe("Optional filter for supported catalog types."),
        category: z.enum(["image", "video", "audio"]).optional().describe("Prompt-template category."),
      },
    },
    async ({ clientSlug, type, filter, category }) =>
      runTool(context, "open_design_list_catalog", clientSlug, async () => {
        assertClientScope(context, "open-design:read", clientSlug);
        const items = await listOpenDesignCatalog(type, { filter, category }, context);
        return jsonResult({ type, items, count: Array.isArray(items) ? items.length : null });
      }),
  );

  return server;
}

function assertClientScope(context: SanchoMcpContext, scope: McpScope, clientSlug: string): void {
  assertMcpScope(context.principal, scope);
  assertMcpClientAccess(context.principal, clientSlug);
}

async function runTool(
  context: SanchoMcpContext,
  toolName: string,
  clientSlug: string | undefined,
  handler: () => Promise<CallToolResult>,
): Promise<CallToolResult> {
  try {
    const result = await handler();
    const auditError = await auditToolCall({
      principal: context.principal,
      toolName,
      clientSlug,
      ok: true,
      metadata: { traceId: context.traceId },
    });
    if (auditError) return errorResult(`MCP audit failed: ${auditError}`);
    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown MCP tool error";
    const auditError = await auditToolCall({
      principal: context.principal,
      toolName,
      clientSlug,
      ok: false,
      error: message,
      metadata: { traceId: context.traceId },
    });
    return errorResult(auditError ? `${message}; MCP audit failed: ${auditError}` : message);
  }
}

async function auditToolCall(event: Parameters<typeof auditMcpToolCall>[0]): Promise<string | null> {
  try {
    await auditMcpToolCall(event);
    return null;
  } catch (err) {
    return err instanceof Error ? err.message : "Unknown audit error";
  }
}

function jsonResult(value: unknown): CallToolResult {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(value, null, 2),
      },
    ],
    structuredContent: isRecord(value) ? value : { value },
  };
}

function errorResult(message: string): CallToolResult {
  return {
    isError: true,
    content: [
      {
        type: "text",
        text: message,
      },
    ],
  };
}

function clampLimit(limit: number | undefined): number {
  if (!Number.isFinite(limit)) return TASK_LIMIT_DEFAULT;
  return Math.max(1, Math.min(TASK_LIMIT_MAX, Number(limit)));
}

function extractChatId(value: unknown): string | null {
  if (!isRecord(value)) return null;
  return typeof value.chatId === "string" ? value.chatId : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

async function listOpenDesignCatalog(
  type: "skills" | "design-systems" | "prompt-templates" | "craft-guides" | "projects",
  options: { filter?: string; category?: "image" | "video" | "audio" },
  context: SanchoMcpContext,
) {
  const config = odConfig(context);
  if (type === "skills") return odListSkills(options.filter, config);
  if (type === "design-systems") return odListDesignSystems(options.filter, config);
  if (type === "prompt-templates") return odListPromptTemplates(options.category, config);
  if (type === "craft-guides") return odListCraftGuides(config);
  return odListProjects(config);
}

function odConfig(context: SanchoMcpContext) {
  return {
    ...resolveOdConfig(),
    extraHeaders: traceHeaders(context),
  };
}

function traceHeaders(context: SanchoMcpContext): Record<string, string> {
  return {
    "X-Request-Id": context.traceId,
    "X-Sancho-MCP-Trace-Id": context.traceId,
  };
}
