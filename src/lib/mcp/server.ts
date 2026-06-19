import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import * as z from "zod/v4";
import {
  addMessage,
  getChatSecret,
  getGatewayUrl,
  getPendingProgress,
  getStatusEntry,
  getThread,
  listThreadsForSlug,
} from "@/lib/data/mc-chat";
import { loadClients } from "@/lib/data/clients";
import { getInternalClientStatus } from "@/lib/sancho-internal-api";
import { createTask, getTask, listUnifiedTaskRowsAsync, updateTask } from "@/lib/data/tasks";
import {
  getMeetingIntelligenceMeeting,
  getMeetingIntelligenceState,
} from "@/lib/data/meeting-intelligence-db";
import { getMetricsTimeSeries, getSurfaceSummary, getTrend, getNorthStar } from "@/lib/data/metrics";
import { getMcpDocument, listMcpDocuments } from "@/lib/mcp/documents";
import { resolveYalcConfig, yalcFetch, countYalcRows, publicYalcConfig } from "@/lib/yalc/client";
import {
  assignTemplateToSearch,
  createDiscoverySearch,
  creatorReportForSlug,
  getEffectiveModelConfig,
  ModelConfigValidationError,
  parseDiscoveryPlan,
  parseReportPeriod,
  previewModelConfigUpdate,
  putModelConfigOverrides,
  runDiscoverySearch,
  TemplateValidationError,
} from "@/lib/partnerships";
import {
  resolveOdConfig,
  odHealth,
  odListCraftGuides,
  odListDesignSystems,
  odListPromptTemplates,
  odListProjects,
  odListSkills,
} from "@/lib/open-design/client";
import { buildIntakeUrl } from "@/lib/intake-tokens";
import { auditMcpToolCall } from "@/lib/mcp/audit";
import {
  buildAlarifeMcpInstallProfile,
  getAlarifeMcpInstance,
  listAlarifeMcpInstances,
  publicAlarifeMcpInstance,
  validateAlarifeMcpConnection,
} from "@/lib/mcp/alarife";
import {
  registerYalcBreakevenTool,
  type YalcBreakevenLeadMetrics,
} from "@/lib/calc-creator-core/mcp-tool";
import {
  assertMcpClientAccess,
  assertMcpBrandAccess,
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
const CHAT_THREAD_LIMIT_DEFAULT = 25;
const CHAT_THREAD_LIMIT_MAX = 100;
const CHAT_MESSAGE_LIMIT_DEFAULT = 40;
const CHAT_MESSAGE_LIMIT_MAX = 100;
const CHAT_TEXT_MAX_CHARS = 12_000;
const DOCUMENT_LIMIT_DEFAULT = 50;
const DOCUMENT_LIMIT_MAX = 200;
const DOCUMENT_MAX_CHARS_DEFAULT = 60_000;
const DOCUMENT_MAX_CHARS_MAX = 200_000;
const MEETING_LIMIT_DEFAULT = 50;
const MEETING_LIMIT_MAX = 200;

const askQuestionSchema = z.object({
  id: z.string().min(1),
  prompt: z.string().min(1),
  mode: z.enum(["single", "multi"]),
  options: z.array(z.object({ id: z.string().min(1), label: z.string().min(1) })).min(1),
});

type AskQuestion = z.infer<typeof askQuestionSchema>;
type ChatMessage = ReturnType<typeof getThread>["messages"][number];

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
            brands: context.principal.brands ?? context.principal.clients,
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
    "alarife_list_instances",
    {
      title: "List Alarife MCP instances",
      description:
        "Lists Alarife MCP instances registered for the allowed Sancho client. Requires sancho:read.",
      inputSchema: {
        clientSlug: z.string().optional().describe("Optional Sancho client slug."),
      },
    },
    async ({ clientSlug }) =>
      runTool(context, "alarife_list_instances", clientSlug, async () => {
        assertMcpScope(context.principal, "sancho:read");
        const requestedClient = clientSlug?.trim();
        if (requestedClient) assertMcpClientAccess(context.principal, requestedClient);

        const instances = listAlarifeMcpInstances(requestedClient)
          .filter(
            (instance) =>
              context.principal.clients.includes("*") ||
              context.principal.clients.includes(instance.clientSlug),
          )
          .map(publicAlarifeMcpInstance);

        return jsonResult({ instances, count: instances.length, traceId: context.traceId });
      }),
  );

  server.registerTool(
    "alarife_get_mcp_config",
    {
      title: "Get Alarife MCP config",
      description:
        "Returns safe MCP install metadata for one Alarife instance. It never returns bearer tokens. Requires sancho:read.",
      inputSchema: {
        clientSlug: z.string().min(1).describe("Sancho client slug."),
        alarifeSlug: z.string().min(1).describe("Alarife slug inside the client, e.g. web or sancho-web."),
      },
    },
    async ({ clientSlug, alarifeSlug }) =>
      runTool(context, "alarife_get_mcp_config", clientSlug, async () => {
        assertClientScope(context, "sancho:read", clientSlug);
        const instance = getAlarifeMcpInstance(clientSlug, alarifeSlug);
        return jsonResult({
          ...publicAlarifeMcpInstance(instance),
          installProfile: buildAlarifeMcpInstallProfile(instance),
          tokenReturned: false,
          traceId: context.traceId,
        });
      }),
  );

  server.registerTool(
    "alarife_validate_mcp_connection",
    {
      title: "Validate Alarife MCP connection",
      description:
        "Validates one Alarife MCP connection by running tools/list with Sancho's stored secret. It never returns bearer tokens. Requires sancho:read.",
      inputSchema: {
        clientSlug: z.string().min(1).describe("Sancho client slug."),
        alarifeSlug: z.string().min(1).describe("Alarife slug inside the client, e.g. web or sancho-web."),
      },
    },
    async ({ clientSlug, alarifeSlug }) =>
      runTool(context, "alarife_validate_mcp_connection", clientSlug, async () => {
        assertClientScope(context, "sancho:read", clientSlug);
        const instance = getAlarifeMcpInstance(clientSlug, alarifeSlug);
        const validation = await validateAlarifeMcpConnection(instance);
        return jsonResult({
          clientSlug: instance.clientSlug,
          alarifeSlug: instance.alarifeSlug,
          mcpUrl: instance.mcpUrl,
          secretId: instance.secretId,
          tokenReturned: false,
          ...validation,
          traceId: context.traceId,
        });
      }),
  );

  server.registerTool(
    "sancho_list_documents",
    {
      title: "List Sancho documents",
      description:
        "Lists Brand Brain/Foundation documents for an allowed brand. Requires docs:read and brand access.",
      inputSchema: {
        brandSlug: z.string().min(1).describe("Brand slug, e.g. growth4u or xhype."),
        pathPrefix: z
          .string()
          .optional()
          .describe("Optional brand-relative or full brand/... path prefix to filter by."),
        query: z.string().optional().describe("Optional case-insensitive search over path/title."),
        extensions: z
          .array(z.enum(["md", "html"]))
          .optional()
          .describe("Document extensions to include. Defaults to ['md', 'html']."),
        limit: z.number().int().min(1).max(DOCUMENT_LIMIT_MAX).optional().describe("Maximum docs to return."),
      },
    },
    async ({ brandSlug, pathPrefix, query, extensions, limit }) =>
      runTool(context, "sancho_list_documents", brandSlug, async () => {
        assertBrandScope(context, brandSlug);
        const max = clampLimit(limit, DOCUMENT_LIMIT_DEFAULT, DOCUMENT_LIMIT_MAX);
        const result = listMcpDocuments(brandSlug, { pathPrefix, query, extensions, limit: max });
        return jsonResult({ ...result, brandSlug, traceId: context.traceId });
      }),
  );

  server.registerTool(
    "sancho_get_document",
    {
      title: "Get Sancho document",
      description:
        "Reads one Brand Brain/Foundation .md or .html document by path. Requires docs:read and brand access.",
      inputSchema: {
        brandSlug: z.string().min(1).describe("Brand slug, e.g. growth4u or xhype."),
        docPath: z
          .string()
          .min(1)
          .describe("Full brand/<slug>/... path or brand-relative path, e.g. market-and-us/market/current.md."),
        maxChars: z
          .number()
          .int()
          .min(1)
          .max(DOCUMENT_MAX_CHARS_MAX)
          .optional()
          .describe("Maximum content characters to return. Defaults to 60000."),
      },
    },
    async ({ brandSlug, docPath, maxChars }) =>
      runTool(context, "sancho_get_document", brandSlug, async () => {
        assertBrandScope(context, brandSlug);
        const max = clampLimit(maxChars, DOCUMENT_MAX_CHARS_DEFAULT, DOCUMENT_MAX_CHARS_MAX);
        const document = getMcpDocument(brandSlug, docPath, { maxChars: max });
        return jsonResult({ ...document, brandSlug, maxChars: max, traceId: context.traceId });
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
    "sancho_create_task",
    {
      title: "Create Sancho task",
      description:
        "Creates a task for a client. Requires tasks:write. Defaults to dry-run and requires confirm=true to write. " +
        "To promote the current chat to a task (SAN-210), pass threadId (+ your skill/agent): the task is linked to " +
        "the thread and the call is idempotent — one task per thread, so promoting the same thread again returns the " +
        "existing task instead of duplicating it. " +
        "This is the right tool when the user asks for a unit of work (research, a prospect/influencer/podcast list, " +
        "content, ads, a visual, data, or a web page): set `agent` to the owning specialist — hamete (research/market intel), " +
        "rocinante (outreach/prospecting), dulcinea (content), mambrino (ads), maese-pedro (visual), merlin (data), " +
        "alarife (web) — so the work is routed to and executed by that specialist instead of answered inline in chat.",
      inputSchema: {
        clientSlug: z.string().min(1).describe("Sancho client slug."),
        name: z.string().min(1).describe("Task name."),
        description: z.string().optional().describe("Task description/brief."),
        status: z.string().optional().describe("Initial status (default todo)."),
        type: z.string().optional().describe("Task type, e.g. project or execution."),
        parentId: z.string().optional().describe("Parent task id to create a child task."),
        owner: z.string().optional().describe("Task owner (default Sancho)."),
        skill: z.string().optional().describe("Skill that runs the task (use the one this chat is running)."),
        agent: z.string().optional().describe("Owner agent (use the agent attending this chat)."),
        skills: z.array(z.string()).optional().describe("Skill pipeline for the task."),
        threadId: z.string().optional().describe("MC chat thread id to link the task to — enables idempotent promote (one task per thread)."),
        dryRun: z.boolean().default(true).describe("When true, only previews the create operation."),
        confirm: z.boolean().default(false).describe("Must be true with dryRun=false to create."),
      },
    },
    async ({ clientSlug, name, description, status, type, parentId, owner, skill, agent, skills, threadId, dryRun, confirm }) =>
      runTool(context, "sancho_create_task", clientSlug, async () => {
        assertClientScope(context, "tasks:write", clientSlug);
        const input = pickDefined({
          name, description, status, type, parent_id: parentId, owner,
          skill, agent, skills,
          mc_chat_thread_id: threadId ? normalizeChatThreadId(clientSlug, threadId) : undefined,
        });
        if (dryRun !== false || confirm !== true) {
          return jsonResult({
            ok: true,
            dryRun: true,
            requiresConfirmation: true,
            message: "Set dryRun=false and confirm=true to create this task.",
            input: { clientSlug, ...input },
          });
        }
        const task = await createTask(clientSlug, input as Parameters<typeof createTask>[1]);
        return jsonResult({ ok: true, task });
      }),
  );

  server.registerTool(
    "sancho_update_task",
    {
      title: "Update Sancho task",
      description:
        "Updates whitelisted fields of a task. Requires tasks:write. Defaults to dry-run and requires confirm=true to write.",
      inputSchema: {
        clientSlug: z.string().min(1).describe("Sancho client slug."),
        taskId: z.string().min(1).describe("Task id."),
        name: z.string().optional().describe("New task name."),
        status: z.string().optional().describe("New status."),
        description: z.string().optional().describe("New description."),
        brief: z.string().optional().describe("New brief."),
        completion: z.string().optional().describe("New completion/done criteria."),
        owner: z.string().optional().describe("New owner."),
        dryRun: z.boolean().default(true).describe("When true, only previews the update operation."),
        confirm: z.boolean().default(false).describe("Must be true with dryRun=false to update."),
      },
    },
    async ({ clientSlug, taskId, name, status, description, brief, completion, owner, dryRun, confirm }) =>
      runTool(context, "sancho_update_task", clientSlug, async () => {
        assertClientScope(context, "tasks:write", clientSlug);
        const patch = pickDefined({ name, status, description, brief, completion, owner });
        if (Object.keys(patch).length === 0) {
          throw new McpAuthError(
            400,
            "No fields to update; provide at least one of: name, status, description, brief, completion, owner",
          );
        }
        if (dryRun !== false || confirm !== true) {
          return jsonResult({
            ok: true,
            dryRun: true,
            requiresConfirmation: true,
            message: "Set dryRun=false and confirm=true to apply this update.",
            taskId,
            patch,
          });
        }
        const task = await updateTask(clientSlug, taskId, patch);
        return jsonResult({ ok: true, task });
      }),
  );

  server.registerTool(
    "sancho_send_message",
    {
      title: "Send Sancho chat message",
      description:
        "Sends a message into Sancho Mission Control chat. Requires sancho:chat. Defaults to dry-run and requires confirm=true for execution. " +
        "Use it for conversational messages, questions, and answering pending :::ask prompts. " +
        "If the request is a discrete unit of work (research, a prospect/influencer/podcast list, content, ads, a visual, data, or a web page), " +
        "do NOT just send it here and treat Sancho's inline reply as the deliverable — call sancho_create_task with the owning specialist as `agent` " +
        "and send the brief to that task's threadId so the specialist actually does the work.",
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
            workHint:
              "If this is a unit of work (research, a prospect/influencer/podcast list, content, ads, a visual, data, or a web page), " +
              "prefer sancho_create_task with the owning specialist as `agent` (hamete=research, rocinante=outreach, dulcinea=content, " +
              "mambrino=ads, maese-pedro=visual, merlin=data, alarife=web) and send the brief to that task's thread — " +
              "don't treat an inline chat reply as the deliverable.",
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
    "sancho_list_chat_threads",
    {
      title: "List Sancho chat threads",
      description: "Lists Mission Control chat threads for a client. Requires sancho:chat.",
      inputSchema: {
        clientSlug: z.string().min(1).describe("Sancho client slug."),
        limit: z
          .number()
          .int()
          .min(1)
          .max(CHAT_THREAD_LIMIT_MAX)
          .optional()
          .describe("Maximum chat threads to return."),
      },
    },
    async ({ clientSlug, limit }) =>
      runTool(context, "sancho_list_chat_threads", clientSlug, async () => {
        assertClientScope(context, "sancho:chat", clientSlug);
        const max = clampLimit(limit, CHAT_THREAD_LIMIT_DEFAULT, CHAT_THREAD_LIMIT_MAX);
        const threads = listThreadsForSlug(clientSlug).slice(0, max);
        return jsonResult({ threads, count: threads.length, limit: max });
      }),
  );

  server.registerTool(
    "sancho_get_chat_thread",
    {
      title: "Get Sancho chat thread",
      description:
        "Reads recent Mission Control chat messages for a client and extracts pending :::ask multiple-choice questions. Requires sancho:chat.",
      inputSchema: {
        clientSlug: z.string().min(1).describe("Sancho client slug."),
        threadId: z.string().min(1).describe("Thread id, either full '<client>:<thread>' or short id."),
        limit: z
          .number()
          .int()
          .min(1)
          .max(CHAT_MESSAGE_LIMIT_MAX)
          .optional()
          .describe("Maximum recent messages to return."),
      },
    },
    async ({ clientSlug, threadId, limit }) =>
      runTool(context, "sancho_get_chat_thread", clientSlug, async () => {
        assertClientScope(context, "sancho:chat", clientSlug);
        const tid = normalizeChatThreadId(clientSlug, threadId);
        const thread = getThread(tid);
        if (!chatThreadExists(clientSlug, tid) && thread.messages.length === 0) {
          throw new McpAuthError(404, `Chat thread not found: ${tid}`);
        }

        const max = clampLimit(limit, CHAT_MESSAGE_LIMIT_DEFAULT, CHAT_MESSAGE_LIMIT_MAX);
        const startIndex = Math.max(0, thread.messages.length - max);
        const messages = thread.messages
          .slice(startIndex)
          .map((message, offset) => sanitizeChatMessage(message, startIndex + offset));
        const pendingQuestions = extractPendingQuestions(thread.messages);

        return jsonResult({
          threadId: tid,
          clientSlug,
          shortId: shortChatThreadId(tid),
          messageCount: thread.messages.length,
          returnedMessageCount: messages.length,
          updatedAt: thread.updatedAt ?? null,
          messages,
          status: getStatusEntry(tid),
          pendingProgress: getPendingProgress(tid),
          pendingQuestions,
          responseFormat: buildAskResponseFormat(pendingQuestions),
        });
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

  // Calc break-even de Partnerships (SAN-75): wrapper fino de
  // `calc-creator-core` — misma lógica que la UI del drawer y la skill
  // negotiation-assist (paridad UI = chat = MCP). El camino `leadId` lee
  // followers/ER vía `GET /api/leads` (SAN-77; hasta su deploy en Yalc,
  // pasar followers/engagementRatePct explícitos).
  registerYalcBreakevenTool(server, {
    assertAccess: (clientSlug) => assertClientScope(context, "yalc:read", clientSlug),
    run: (toolName, clientSlug, handler) => runTool(context, toolName, clientSlug, handler),
    jsonResult,
    fetchLeadMetrics: (clientSlug, leadId) => fetchYalcLeadMetrics(context, clientSlug, leadId),
    // SAN-76: el break-even del MCP usa la config efectiva (Settings/Yalc).
    fetchModelConfig: async (clientSlug) => {
      const effective = await getEffectiveModelConfig(clientSlug);
      return { config: effective.config, source: effective.source };
    },
  });

  server.registerTool(
    "yalc_list_leads",
    {
      title: "List YALC leads",
      description:
        "Lists YALC outreach/partnership leads for a Sancho client with optional filters: stage (lifecycleStatus, comma-separated, e.g. 'Sourced' or 'Disqualified' — discarded leads are excluded unless requested), campaignId, campaign type ('B2B'|'Partnerships') and free-text search. Requires yalc:read.",
      inputSchema: {
        clientSlug: z.string().min(1).describe("Sancho client slug."),
        stage: z
          .string()
          .min(1)
          .optional()
          .describe(
            "lifecycleStatus filter, comma-separated (Sourced, Qualified, Disqualified, Queued, Replied, Negotiating, Deal_Created, Closed_Won, ...).",
          ),
        campaignId: z.string().min(1).optional().describe("Only leads in this YALC campaign."),
        type: z
          .enum(["B2B", "Partnerships"])
          .optional()
          .describe("Only leads in campaigns of this type."),
        search: z.string().min(1).optional().describe("Search by name, company, handle or email."),
      },
    },
    async ({ clientSlug, stage, campaignId, type, search }) =>
      runTool(context, "yalc_list_leads", clientSlug, async () => {
        assertClientScope(context, "yalc:read", clientSlug);
        const params = new URLSearchParams();
        if (stage) params.set("lifecycleStatus", stage);
        if (campaignId) params.set("campaignId", campaignId);
        if (type) params.set("type", type);
        if (search) params.set("q", search);
        const query = params.toString();
        const data = await yalcFetch(
          resolveYalcConfig(clientSlug),
          `/api/leads${query ? `?${query}` : ""}`,
          { headers: traceHeaders(context) },
        );
        return jsonResult(data);
      }),
  );

  server.registerTool(
    "yalc_set_lead_stage",
    {
      title: "Set YALC lead stage",
      description:
        "Moves a YALC lead to another lifecycle stage (triage: shortlist with 'Qualified', discard with 'Disqualified', restore with 'Sourced'/'Qualified', or any pipeline stage). Discarding records a note ('manual · <date>' when omitted); restoring clears it. Requires yalc:write.",
      inputSchema: {
        clientSlug: z.string().min(1).describe("Sancho client slug."),
        leadId: z.string().min(1).describe("YALC lead id."),
        stage: z
          .string()
          .min(1)
          .describe(
            "Target lifecycleStatus (Sourced, Qualified, Disqualified, Queued, Replied, Negotiating, Deal_Created, Closed_Won, Closed_Lost, ...).",
          ),
        note: z
          .string()
          .min(1)
          .optional()
          .describe("Optional transition note — stored as the discard note when stage is 'Disqualified'."),
      },
    },
    async ({ clientSlug, leadId, stage, note }) =>
      runTool(context, "yalc_set_lead_stage", clientSlug, async () => {
        assertClientScope(context, "yalc:write", clientSlug);
        const data = await yalcFetch(
          resolveYalcConfig(clientSlug),
          `/api/leads/${encodeURIComponent(leadId)}/stage`,
          {
            method: "PATCH",
            body: note ? { lifecycleStatus: stage, note } : { lifecycleStatus: stage },
            headers: traceHeaders(context),
          },
        );
        return jsonResult(data);
      }),
  );

  server.registerTool(
    "yalc_create_search",
    {
      title: "Create Partnerships discovery search",
      description:
        "Creates a creator discovery search (Partnerships · SAN-79): a Partnerships campaign in YALC, a mother Outreach task in Sancho, and a queued discovery runner. Same action as the discovery-plan-builder chat skill and the Encuentra UI. Optionally executes the runner inline with the 9 mockup fixture creators (no ScrapeCreators). Requires yalc:write. Defaults to dry-run and requires confirm=true to write.",
      inputSchema: {
        clientSlug: z.string().min(1).describe("Sancho client slug."),
        title: z.string().min(1).describe("Search title, e.g. 'Finanzas personales ES · IG+TikTok'."),
        sectors: z.array(z.string().min(1)).min(1).describe("Target sectors/verticals (e.g. 'finanzas personales', 'ahorro')."),
        networks: z.array(z.string().min(1)).min(1).describe("Networks to scout: instagram, tiktok, youtube, ..."),
        tiers: z
          .array(z.enum(["nano", "micro", "mid", "macro"]))
          .optional()
          .describe("Target creator tiers (default: all)."),
        audienceEsMinPct: z.number().min(0).max(100).optional().describe("Minimum Spanish-audience share (%)."),
        targetVolume: z.number().int().min(1).max(500).optional().describe("Target number of candidates (~40 default)."),
        competitorBrands: z
          .array(z.string().min(1))
          .optional()
          .describe("Competitor brands to cross-check in ad-library for repeat-promo signal (e.g. N26, Revolut)."),
        templates: z.array(z.string().min(1)).optional().describe("Template names to instantiate for this search (SAN-80)."),
        qualificationMode: z
          .enum(["auto", "manual", "hybrid"])
          .optional()
          .describe("YALC campaign qualification mode (default hybrid)."),
        disqualifyThreshold: z.number().min(0).max(100).optional().describe("Auto-disqualify threshold (default 40)."),
        notes: z.string().optional().describe("Free-form plan notes for the runner agent."),
        runFixtures: z
          .boolean()
          .default(false)
          .describe("Run the discovery runner inline with the 9 fixture creators (no ScrapeCreators call)."),
        dryRun: z.boolean().default(true).describe("When true, only previews the search creation."),
        confirm: z.boolean().default(false).describe("Must be true with dryRun=false to create."),
      },
    },
    async ({
      clientSlug,
      title,
      sectors,
      networks,
      tiers,
      audienceEsMinPct,
      targetVolume,
      competitorBrands,
      templates,
      qualificationMode,
      disqualifyThreshold,
      notes,
      runFixtures,
      dryRun,
      confirm,
    }) =>
      runTool(context, "yalc_create_search", clientSlug, async () => {
        assertClientScope(context, "yalc:write", clientSlug);
        // SAN-76: el modo/umbral por defecto del preview sale de la config
        // efectiva (la misma que aplicará createDiscoverySearch al crear).
        const effective = await getEffectiveModelConfig(clientSlug);
        const plan = parseDiscoveryPlan(
          {
            title,
            sectors,
            networks,
            tiers,
            audienceEsMinPct,
            targetVolume,
            signals: { adLibrary: true, competitorBrands: competitorBrands ?? [] },
            templates,
            qualificationMode,
            disqualifyThreshold,
            notes,
          },
          effective.config,
        );

        if (dryRun !== false || confirm !== true) {
          return jsonResult({
            ok: true,
            dryRun: true,
            requiresConfirmation: true,
            message: "Set dryRun=false and confirm=true to create this discovery search.",
            plan,
            runFixtures: runFixtures === true,
          });
        }

        const created = await createDiscoverySearch({ slug: clientSlug, plan });
        if (runFixtures === true) {
          const run = await runDiscoverySearch({
            slug: clientSlug,
            searchId: created.search.id,
            fixtures: true,
          });
          return jsonResult({
            ok: true,
            search: run.search,
            campaignId: created.campaignId,
            taskId: created.taskId,
            runner: { mode: "fixtures", stats: run.stats },
            leads: run.inserted,
            dropped: run.dropped,
          });
        }
        return jsonResult({
          ok: true,
          search: created.search,
          campaignId: created.campaignId,
          taskId: created.taskId,
          message:
            "Search queued. The discovery-search-runner agent picks it up (live scraping), or POST /api/partnerships/searches/{id}/run with fixtures=true.",
        });
      }),
  );

  // Plantillas de Partnerships (SAN-80): instanciar una copia de la
  // biblioteca en una búsqueda — espejo de POST
  // /api/partnerships/templates/{id}/assign y del picker de Encuentra.
  server.registerTool(
    "yalc_assign_template",
    {
      title: "Assign Partnerships template to search",
      description:
        "Instantiates a frozen COPY of an outreach template (sequence or brief) from the Partnerships library into a discovery search (by searchId or YALC campaignId). The search's sequence instance is what the contact engine sends after the human gate. Idempotent per template. Requires yalc:write.",
      inputSchema: {
        clientSlug: z.string().min(1).describe("Sancho client slug."),
        templateId: z
          .string()
          .min(1)
          .describe("Library template id (e.g. 'primer-contacto-creators-fintech'). List them via GET /api/partnerships/templates."),
        searchId: z.string().min(1).optional().describe("Discovery search id (ds-…)."),
        campaignId: z
          .string()
          .min(1)
          .optional()
          .describe("YALC Partnerships campaign id (alternative to searchId)."),
      },
    },
    async ({ clientSlug, templateId, searchId, campaignId }) =>
      runTool(context, "yalc_assign_template", clientSlug, async () => {
        assertClientScope(context, "yalc:write", clientSlug);
        if (!searchId && !campaignId) {
          return errorResult("Provide searchId or campaignId.");
        }
        try {
          const result = assignTemplateToSearch(clientSlug, templateId, { searchId, campaignId });
          return jsonResult({
            ok: true,
            instance: {
              instanceId: result.instance.instanceId,
              templateId: result.instance.templateId,
              name: result.instance.name,
              kind: result.instance.kind,
              steps: result.instance.steps.length,
              assignedAt: result.instance.assignedAt,
            },
            searchId: result.search.id,
            campaignId: result.search.campaignId,
            templatesInSearch: (result.search.templates ?? []).map((item) => ({
              instanceId: item.instanceId,
              name: item.name,
              kind: item.kind,
            })),
          });
        } catch (err) {
          if (err instanceof TemplateValidationError) return errorResult(err.message);
          throw err;
        }
      }),
  );

  // Gates de envío (SAN-80): aprobar/rechazar el GateItem humano del flujo
  // de contacto (partner-outreach) — espejo del POST /api/yalc/gates de la
  // UI. Aprobar reanuda el framework en Yalc y ejecuta el envío (dry-run
  // por defecto en el payload del gate).
  server.registerTool(
    "yalc_approve_gate",
    {
      title: "Approve or reject YALC gate",
      description:
        "Approves or rejects a human gate from /api/gates/awaiting (e.g. the partner-outreach 'approve-send' GateItem). Approving resumes the framework run — for partner contacts that executes the send step (dry-run by default, no external email unless the batch was queued with dryRun=false). Optional edits patch the gate payload before resuming (human-in-the-loop edits). Requires yalc:write.",
      inputSchema: {
        clientSlug: z.string().min(1).describe("Sancho client slug."),
        runId: z.string().min(1).describe("Gate run id (from yalc_list_gates)."),
        action: z.enum(["approve", "reject"]).describe("approve = resume + send · reject = stop."),
        reason: z.string().min(1).optional().describe("Required when rejecting."),
        edits: z
          .record(z.string(), z.unknown())
          .optional()
          .describe("Optional payload edits applied on approve (e.g. tweaked draft bodies)."),
      },
    },
    async ({ clientSlug, runId, action, reason, edits }) =>
      runTool(context, "yalc_approve_gate", clientSlug, async () => {
        assertClientScope(context, "yalc:write", clientSlug);
        const config = resolveYalcConfig(clientSlug);
        if (action === "reject") {
          if (!reason) return errorResult("reason is required to reject a gate.");
          const data = await yalcFetch(
            config,
            `/api/gates/${encodeURIComponent(runId)}/reject`,
            { method: "POST", body: { reason }, headers: traceHeaders(context) },
          );
          return jsonResult(data);
        }
        const data = await yalcFetch(config, `/api/gates/${encodeURIComponent(runId)}/approve`, {
          method: "POST",
          body: { edits },
          headers: traceHeaders(context),
        });
        return jsonResult(data);
      }),
  );

  // Reporting por creator (SAN-81): performance real vs break-even de la
  // calc, agregado a 30/90 días — la MISMA agregación que la vista
  // Metrics · Partnerships y GET /api/partnerships/report (paridad
  // UI = chat = MCP vía creatorReportForSlug).
  server.registerTool(
    "yalc_creator_report",
    {
      title: "Creator performance report",
      description:
        "Per-creator Partnerships performance report (the Metrics · Partnerships view): program KPIs (invested, posts live, clicks, signups, KYC, first-tx, real CPA, ROI) plus per-creator real CPA vs break-even (target CAC), conversions needed from the calc, ROI and suggested quality-score feedback deltas, aggregated over a 30 or 90-day window. Real tracking lands in Phase 2 (Impact); until then performance comes from the demo seed. Requires yalc:read.",
      inputSchema: {
        clientSlug: z.string().min(1).describe("Sancho client slug."),
        period: z
          .enum(["30", "90"])
          .optional()
          .describe("Aggregation window in days (default 90)."),
      },
    },
    async ({ clientSlug, period }) =>
      runTool(context, "yalc_creator_report", clientSlug, async () => {
        assertClientScope(context, "yalc:read", clientSlug);
        const report = await creatorReportForSlug(clientSlug, {
          periodDays: parseReportPeriod(period),
          headers: traceHeaders(context),
        });
        return jsonResult(report);
      }),
  );

  // Model settings (SAN-76): editar el modelo de creators — espejo del PUT
  // /api/yalc/model-config y del tab Settings de Outreach (paridad
  // UI = chat = MCP). Yalc almacena solo OVERRIDES; los defaults viven en
  // calc-creator-core y la efectiva se mergea Sancho-side.
  server.registerTool(
    "yalc_update_model_config",
    {
      title: "Update Partnerships creator-model config",
      description:
        "Partially updates the per-client creator-model config stored in YALC (SAN-76): tier ER benchmarks, verticals, formats, qualification mode + auto-disqualify threshold, and advanced overrides (weights/scoreBands/breakEven). Same action as Outreach → Settings → Guardar. PUT semantics: objects deep-merge, arrays replace wholesale, null deletes a stored override (the calc-creator-core default applies again). Threshold/mode changes apply to FUTURE discovery searches only — existing campaigns are never retro-applied. Defaults to dry-run (returns the would-be effective config); requires confirm=true with dryRun=false to write. Requires yalc:write.",
      inputSchema: {
        clientSlug: z.string().min(1).describe("Sancho client slug."),
        erBenchmarks: z
          .object({
            nano: z.number().positive().lt(100).optional(),
            micro: z.number().positive().lt(100).optional(),
            mid: z.number().positive().lt(100).optional(),
            macro: z.number().positive().lt(100).optional(),
          })
          .optional()
          .describe("ER benchmark (%) per tier, e.g. { micro: 6.0 } — feeds the 'ER vs tier' quality component."),
        verticals: z
          .array(z.string().min(1))
          .optional()
          .describe("Program verticals — REPLACES the whole list (e.g. ['finanzas personales','fintech'])."),
        formats: z
          .array(z.string().min(1))
          .optional()
          .describe("Content formats — REPLACES the whole list (e.g. ['reel','post','story'])."),
        qualificationMode: z
          .enum(["auto", "manual", "hybrid"])
          .optional()
          .describe("Default qualification mode for NEW Partnerships searches (hybrid = auto-discard below threshold, human decides the rest)."),
        disqualifyThreshold: z
          .number()
          .min(0)
          .max(100)
          .optional()
          .describe("Auto-disqualify quality-score threshold (0-100) for NEW searches in auto/hybrid mode."),
        overrides: z
          .record(z.string(), z.unknown())
          .optional()
          .describe("Advanced free-form deep-partial of CreatorModelConfig (tiers/weights/scoreBands/breakEven; null deletes a stored key). Merged with the first-class params above (those win)."),
        reset: z
          .boolean()
          .default(false)
          .describe("Clear the stored overrides document before applying this update (back to calc-creator-core defaults)."),
        dryRun: z.boolean().default(true).describe("When true, previews the update without writing."),
        confirm: z.boolean().default(false).describe("Must be true with dryRun=false to write."),
      },
    },
    async ({
      clientSlug,
      erBenchmarks,
      verticals,
      formats,
      qualificationMode,
      disqualifyThreshold,
      overrides,
      reset,
      dryRun,
      confirm,
    }) =>
      runTool(context, "yalc_update_model_config", clientSlug, async () => {
        assertClientScope(context, "yalc:write", clientSlug);

        // Partial del PUT: overrides libres primero, params tipados encima.
        const partial: Record<string, unknown> = isRecord(overrides) ? { ...overrides } : {};
        if (erBenchmarks) {
          const tiers = Object.entries(erBenchmarks)
            .filter(([, er]) => typeof er === "number")
            .map(([key, er]) => ({ key, erBenchmarkPct: er }));
          if (tiers.length > 0) partial.tiers = tiers;
        }
        if (verticals) partial.verticals = verticals;
        if (formats) partial.formats = formats;
        if (qualificationMode !== undefined || disqualifyThreshold !== undefined) {
          const qualification = isRecord(partial.qualification) ? { ...partial.qualification } : {};
          if (qualificationMode !== undefined) qualification.defaultMode = qualificationMode;
          if (disqualifyThreshold !== undefined) qualification.threshold = disqualifyThreshold;
          partial.qualification = qualification;
        }

        try {
          if (dryRun !== false || confirm !== true) {
            const preview = await previewModelConfigUpdate(clientSlug, partial, { reset });
            return jsonResult({
              ok: true,
              dryRun: true,
              requiresConfirmation: true,
              message: "Set dryRun=false and confirm=true to apply this model-config update.",
              partial,
              reset: reset === true,
              current: {
                source: preview.current.source,
                overrides: preview.current.overrides,
                updatedAt: preview.current.updatedAt,
                ...(preview.current.yalcError ? { yalcError: preview.current.yalcError } : {}),
              },
              preview: {
                overrides: preview.wouldStore,
                config: preview.configAfter,
              },
            });
          }

          const effective = await putModelConfigOverrides(clientSlug, partial, { reset });
          return jsonResult({
            ok: true,
            applied: partial,
            reset: reset === true,
            source: effective.source,
            overrides: effective.overrides,
            config: effective.config,
            updatedAt: effective.updatedAt,
            note: "Threshold/mode apply to FUTURE discovery searches; existing campaigns keep their values.",
          });
        } catch (err) {
          if (err instanceof ModelConfigValidationError) return errorResult(err.message);
          throw err;
        }
      }),
  );

  // Lectura espejo: la config efectiva que consume la calc (GET del proxy).
  server.registerTool(
    "yalc_get_model_config",
    {
      title: "Get Partnerships creator-model config",
      description:
        "Reads the EFFECTIVE creator-model config for a client (calc-creator-core defaults + the overrides stored in YALC): tiers + ER benchmarks, verticals, formats, qualification mode/threshold, score bands and break-even seeds. source='defaults' means nothing was overridden (or YALC is unreachable). Requires yalc:read.",
      inputSchema: {
        clientSlug: z.string().min(1).describe("Sancho client slug."),
      },
    },
    async ({ clientSlug }) =>
      runTool(context, "yalc_get_model_config", clientSlug, async () => {
        assertClientScope(context, "yalc:read", clientSlug);
        const effective = await getEffectiveModelConfig(clientSlug);
        return jsonResult({
          ok: true,
          source: effective.source,
          config: effective.config,
          overrides: effective.overrides,
          updatedAt: effective.updatedAt,
          ...(effective.yalcError ? { yalcError: effective.yalcError } : {}),
        });
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

  server.registerTool(
    "sancho_intake_create_link",
    {
      title: "Create public intake form link",
      description:
        "Returns the public intake-form URL for a client (SAN-17). Share it with the client to kick off the Full Foundation via the form branch. Read-only — the token is a stateless function of the slug. Requires sancho:read.",
      inputSchema: {
        clientSlug: z.string().min(1).describe("Sancho client slug."),
      },
    },
    async ({ clientSlug }) =>
      runTool(context, "sancho_intake_create_link", clientSlug, async () => {
        assertClientScope(context, "sancho:read", clientSlug);
        const url = buildIntakeUrl(clientSlug);
        return jsonResult({ ok: true, clientSlug, url });
      }),
  );

  // SAN-217: Meeting Intelligence read tools (parity Claude Code + Sancho via intelligence:read).
  // These wrap the same shared services the Intelligence UI uses — read-only, no run/approve/reject.
  server.registerTool(
    "sancho_list_meetings",
    {
      title: "List Meeting Intelligence meetings",
      description:
        "Lists a client's Meeting Intelligence meetings as a lightweight index (id, title, date, source, status, decision/action counts) plus totals and last sync/run. Read-only. When Meeting Intelligence has no database configured it returns an empty index with storage.configured=false (clean degradation, no error). Requires intelligence:read.",
      inputSchema: {
        clientSlug: z.string().min(1).describe("Sancho client slug."),
        limit: z
          .number()
          .int()
          .positive()
          .optional()
          .describe("Max meetings to return (default 50, max 200)."),
      },
    },
    async ({ clientSlug, limit }) =>
      runTool(context, "sancho_list_meetings", clientSlug, async () => {
        assertClientScope(context, "intelligence:read", clientSlug);
        const state = await getMeetingIntelligenceState(clientSlug);
        const max = clampLimit(limit, MEETING_LIMIT_DEFAULT, MEETING_LIMIT_MAX);
        return jsonResult({
          ok: state.ok,
          storage: state.storage,
          meetings: [...state.meetings].slice(0, max),
          totals: state.totals,
          lastSync: state.lastSync,
          lastCheckStatus: state.lastCheckStatus,
          lastRun: state.lastRun,
        });
      }),
  );

  server.registerTool(
    "sancho_get_meeting",
    {
      title: "Get Meeting Intelligence meeting detail",
      description:
        "Returns the full Meeting Intelligence detail for one meeting: meeting metadata, artifact (raw/summary text), insights, decisions, document impacts and recommendations. Read-only. Returns ok:false when the meeting is not found or no database is configured. Requires intelligence:read.",
      inputSchema: {
        clientSlug: z.string().min(1).describe("Sancho client slug."),
        meetingId: z.string().min(1).describe("Meeting id from sancho_list_meetings."),
      },
    },
    async ({ clientSlug, meetingId }) =>
      runTool(context, "sancho_get_meeting", clientSlug, async () => {
        assertClientScope(context, "intelligence:read", clientSlug);
        return jsonResult(await getMeetingIntelligenceMeeting(clientSlug, meetingId));
      }),
  );

  server.registerTool(
    "sancho_list_intelligence",
    {
      title: "List cross-meeting intelligence",
      description:
        "Returns a client's cross-meeting intelligence without opening each meeting: the unified insight feed, decisions, impacted documents, recommendations/proposals and totals. Optional kind/status filters narrow the insight feed. Read-only. Requires intelligence:read.",
      inputSchema: {
        clientSlug: z.string().min(1).describe("Sancho client slug."),
        kind: z
          .enum(["Decision", "Action", "Insight", "Quote", "Risk"])
          .optional()
          .describe("Filter the insight feed by type."),
        status: z
          .string()
          .optional()
          .describe(
            "Filter the insight feed by status (draft, reviewable, accepted, rejected, converted).",
          ),
      },
    },
    async ({ clientSlug, kind, status }) =>
      runTool(context, "sancho_list_intelligence", clientSlug, async () => {
        assertClientScope(context, "intelligence:read", clientSlug);
        const state = await getMeetingIntelligenceState(clientSlug);
        const statusFilter = status?.trim().toLowerCase();
        const intelligence = [...state.intelligence].filter((item) => {
          if (kind && item.type !== kind) return false;
          if (statusFilter && item.status.toLowerCase() !== statusFilter) return false;
          return true;
        });
        return jsonResult({
          ok: state.ok,
          storage: state.storage,
          totals: state.totals,
          intelligence,
          decisions: state.decisions,
          documents: state.documents,
          proposals: state.proposals,
        });
      }),
  );

  // Métricas v2 (SAN-264): time-series read over metric_snapshots. Clean
  // degradation (configured=false) when no DB is set. Requires metrics:read.
  server.registerTool(
    "sancho_get_metrics_timeseries",
    {
      title: "Get Sancho metrics (time-series)",
      description:
        "Reads a client's metrics from the metric_snapshots time-series. view=series → a bucketed series (day/week/month) for an optional source+metric; view=surfaces → the latest headline value per surface (reputation/web/product/pipeline/paid/email/social/partnerships); view=trend → current-vs-previous-window delta for a source+metric; view=northstar → the client's metrics-plan North Star/KPIs. Read-only; returns configured=false when no database is set. Requires metrics:read.",
      inputSchema: {
        clientSlug: z.string().min(1).describe("Sancho client slug."),
        view: z.enum(["series", "surfaces", "trend", "northstar"]).default("series").describe("Which view to return."),
        source: z.string().optional().describe("Metric source (e.g. ga4, gsc, meta-ads, ghl, trust_score)."),
        metric: z.string().optional().describe("Metric name within the source."),
        grain: z.enum(["day", "week", "month"]).optional().describe("Bucket size for view=series (default day)."),
        from: z.string().optional().describe("Start date YYYY-MM-DD."),
        to: z.string().optional().describe("End date YYYY-MM-DD."),
      },
    },
    async ({ clientSlug, view, source, metric, grain, from, to }) =>
      runTool(context, "sancho_get_metrics_timeseries", clientSlug, async () => {
        assertClientScope(context, "metrics:read", clientSlug);
        if (view === "surfaces") return jsonResult(await getSurfaceSummary(clientSlug, { from, to }));
        if (view === "northstar") return jsonResult(getNorthStar(clientSlug));
        if (view === "trend") {
          const end = to ?? new Date().toISOString().slice(0, 10);
          const start = from ?? new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10);
          return jsonResult(await getTrend(clientSlug, { source, metric, from: start, to: end }));
        }
        return jsonResult(await getMetricsTimeSeries(clientSlug, { source, metric, grain, from, to }));
      }),
  );

  return server;
}

function assertClientScope(context: SanchoMcpContext, scope: McpScope, clientSlug: string): void {
  assertMcpScope(context.principal, scope);
  assertMcpClientAccess(context.principal, clientSlug);
}

function assertBrandScope(context: SanchoMcpContext, brandSlug: string): void {
  assertMcpBrandAccess(context.principal, brandSlug);
}

/**
 * Lee followers/ER de un lead vía `GET /api/leads` de Yalc (SAN-77).
 * No hay GET de lead individual: se lista y se busca por id; los descartados
 * quedan fuera de la vista por defecto, así que se reintenta con el filtro
 * `lifecycleStatus=Disqualified` antes de dar 404.
 */
async function fetchYalcLeadMetrics(
  context: SanchoMcpContext,
  clientSlug: string,
  leadId: string,
): Promise<YalcBreakevenLeadMetrics> {
  const config = resolveYalcConfig(clientSlug);
  const findLead = (data: unknown): Record<string, unknown> | null => {
    if (!isRecord(data) || !Array.isArray(data.leads)) return null;
    const match = data.leads.find((lead) => isRecord(lead) && lead.id === leadId);
    return isRecord(match) ? match : null;
  };

  let lead = findLead(await yalcFetch(config, "/api/leads", { headers: traceHeaders(context) }));
  if (!lead) {
    lead = findLead(
      await yalcFetch(config, "/api/leads?lifecycleStatus=Disqualified", {
        headers: traceHeaders(context),
      }),
    );
  }
  if (!lead) throw new McpAuthError(404, `YALC lead not found: ${leadId}`);

  return {
    followers: typeof lead.followers === "number" ? lead.followers : null,
    // Yalc serializa `engagementRate` en % (3.4 = 3.4%) — mismas unidades que el motor.
    engagementRatePct: typeof lead.engagementRate === "number" ? lead.engagementRate : null,
    handle: typeof lead.handle === "string" ? lead.handle : null,
  };
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

function clampLimit(
  limit: number | undefined,
  defaultLimit = TASK_LIMIT_DEFAULT,
  maxLimit = TASK_LIMIT_MAX,
): number {
  if (!Number.isFinite(limit)) return defaultLimit;
  return Math.max(1, Math.min(maxLimit, Number(limit)));
}

function extractChatId(value: unknown): string | null {
  if (!isRecord(value)) return null;
  return typeof value.chatId === "string" ? value.chatId : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function pickDefined(obj: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(obj).filter(([, value]) => value !== undefined));
}

function normalizeChatThreadId(clientSlug: string, threadId: string): string {
  const raw = threadId.trim();
  if (!raw) throw new McpAuthError(400, "threadId is required");
  if (raw.startsWith(`${clientSlug}:`)) return raw;
  return `${clientSlug}:${raw}`;
}

function shortChatThreadId(threadId: string): string {
  const colonIdx = threadId.indexOf(":");
  return colonIdx < 0 ? threadId : threadId.slice(colonIdx + 1);
}

function chatThreadExists(clientSlug: string, threadId: string): boolean {
  return listThreadsForSlug(clientSlug).some((thread) => isRecord(thread) && thread.id === threadId);
}

function sanitizeChatMessage(message: ChatMessage, index: number) {
  const text = message.text || "";
  const truncated = text.length > CHAT_TEXT_MAX_CHARS;
  const questions = extractAskQuestions(text).map(({ question }) => question);
  return {
    index,
    role: message.role,
    text: truncated ? `${text.slice(0, CHAT_TEXT_MAX_CHARS)}…` : text,
    textTruncated: truncated || undefined,
    ts: message.ts,
    agent: message.agent,
    attachments: message.attachments,
    progress: message.progress,
    from_agent: message.from_agent,
    to_agent: message.to_agent,
    errorDetail: message.errorDetail,
    questions: questions.length ? questions : undefined,
  };
}

const ASK_REGEX = /^:::ask\s*\n([\s\S]*?)\n:::\s*$/gm;
const CODE_FENCE_REGEX = /```[\s\S]*?```/g;
const ASK_RESPONSE_REGEX = /^\[ask:([^\]]+)\]\s*respuesta:/gim;

function extractAskQuestions(text: string): Array<{ question: AskQuestion; start: number; end: number }> {
  if (!text || !text.includes(":::ask")) return [];

  const codeRanges = Array.from(text.matchAll(CODE_FENCE_REGEX))
    .filter((match) => match.index !== undefined)
    .map((match) => [match.index as number, (match.index as number) + match[0].length] as const);
  const isInsideCode = (start: number, end: number) =>
    codeRanges.some(([codeStart, codeEnd]) => start >= codeStart && end <= codeEnd);

  const questions: Array<{ question: AskQuestion; start: number; end: number }> = [];
  for (const match of text.matchAll(ASK_REGEX)) {
    const start = match.index;
    if (start === undefined) continue;
    const end = start + match[0].length;
    if (isInsideCode(start, end)) continue;

    try {
      const parsed = askQuestionSchema.safeParse(JSON.parse(match[1]));
      if (parsed.success) questions.push({ question: parsed.data, start, end });
    } catch {
      // Invalid ask blocks are left as normal chat text.
    }
  }
  return questions;
}

function extractPendingQuestions(messages: ChatMessage[]) {
  for (let index = messages.length - 1; index >= 0; index--) {
    const message = messages[index];
    if (message.role === "user") continue;

    const questions = extractAskQuestions(message.text || "").map(({ question }) => question);
    if (questions.length === 0) return [];

    const answered = answeredAskIdsAfter(messages, index);
    const pending = questions.filter((question) => !answered.has(question.id));
    return pending.map((question) => ({
      ...question,
      sourceMessageIndex: index,
      sourceMessageTs: message.ts,
      sourceAgent: message.agent,
    }));
  }
  return [];
}

function answeredAskIdsAfter(messages: ChatMessage[], messageIndex: number): Set<string> {
  const answered = new Set<string>();
  for (const message of messages.slice(messageIndex + 1)) {
    if (message.role !== "user") continue;
    for (const match of (message.text || "").matchAll(ASK_RESPONSE_REGEX)) {
      answered.add(match[1]);
    }
  }
  return answered;
}

function buildAskResponseFormat(questions: Array<AskQuestion & { sourceMessageIndex: number }>): string | null {
  if (questions.length === 0) return null;
  return questions
    .map((question) => {
      const hint = question.mode === "multi" ? "<option label(s), comma-separated>" : "<option label>";
      return `[ask:${question.id}] respuesta: ${hint}`;
    })
    .join("\n");
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
