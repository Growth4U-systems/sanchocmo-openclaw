import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { execFileSync } from "child_process";
import { promises as fs } from "fs";
import path from "path";
import * as z from "zod/v4";
import {
  addMessage,
  getPendingProgress,
  getStatusEntry,
  getThread,
  listThreadsForSlug,
} from "@/lib/data/mc-chat";
import { loadClient, loadClients, loadClientsData, writeClientsFile } from "@/lib/data/clients";
import { getRuntime, type InboundMessage } from "@/lib/runtime";
import type { AgentRichEntry } from "@/lib/runtime/adapters/openclaw/control";
import { getModelCatalog, invalidateCatalogCache, isModelAvailable } from "@/lib/data/models-catalog";
import { loadRecurringTasks, saveRecurringTasks } from "@/lib/data/recurring-tasks";
import { enrichCrons, humanizeSchedule, type EnrichedCron } from "@/lib/data/openclaw-crons";
import {
  applyMeetingRecommendationAction,
  getMeetingIntelligenceConfig,
  getMeetingIntelligenceMeeting,
  getMeetingIntelligenceState,
  normalizeMeetingIntelligenceConfig,
  saveMeetingIntelligenceConfig,
  type MeetingIntelligenceConfig,
  type RecommendationAction,
  type DecisionEntry,
  type DocumentRecord,
  type IntelligenceItem,
  type ProposalEntry,
} from "@/lib/data/meeting-intelligence-db";
import { findMetricoolPostByUrl, getMetricsTimeSeries, getNorthStar, getSurfaceSummary, getTrend } from "@/lib/data/metrics";
import {
  addCustomMetric,
  applyDashboardTemplate,
  getDashboardDefinition,
  revertDashboardDefinition,
  saveDashboardDefinition,
} from "@/lib/data/metric-dashboard";
import { getMeetingIntelligenceCronStatus, syncMeetingIntelligenceCron } from "@/lib/data/meeting-intelligence-cron";
import { runMeetingIntelligenceSync } from "@/lib/data/meeting-intelligence-runner";
import { getInternalClientStatus } from "@/lib/sancho-internal-api";
import { createTask, getTask, listUnifiedTaskRowsAsync, updateTask } from "@/lib/data/tasks";
import {
  canonicalTaskRouteThreadId,
  resolveSameGroupTaskRoute,
} from "@/lib/data/task-routing";
import {
  getPendingTaskRouteProposal,
  issueTaskRouteProposal,
  proposalMatches,
} from "@/lib/data/task-route-proposals";
import { normalizeAgentSlug } from "@/lib/data/task-execution-contract";
import { canonicalThreadId } from "@/lib/thread-id";
import { brandDir, EXEC_PATH } from "@/lib/data/paths";
import { isSafeFormula } from "@/lib/metrics/dashboard-schema";
import { getContentConfig, updateContentConfig, type ContentConfig } from "@/lib/data/content-config";
import { approveContentIdea, previewContentIdeaApproval } from "@/lib/data/content-approval";
import { loadIdeas } from "@/lib/data/ideas";
import {
  loadDraft,
  listDrafts,
  updateDraft,
  VALID_CONTENT_ITEM_TYPES,
  type Draft,
  type DraftFrontmatter,
} from "@/lib/data/drafts";
import {
  findContentTaskByIdAcrossProjects,
  rollbackChannelPhasesToStatus,
  setChannelPhases,
  setContentTaskStatus,
  updateContentTask,
  type ContentTaskUpdateInput,
} from "@/lib/data/content-tasks";
import { loadUnifiedContentTasks } from "@/lib/data/content-tasks-flat";
import { readActivity } from "@/lib/data/activity-log";
import {
  previewDraftIteration,
  previewRetriggerContentWriter,
  requestDraftIteration,
  retriggerContentWriter,
  serializeDraftIterationResult,
} from "@/lib/content/actions";
import {
  readReconcileState,
  reconcileContentTasks,
} from "@/lib/content/content-reconciliation";
import {
  getContentCalendar,
  getContentChannelLoops,
  getContentDispatchConfig,
  getContentPillars,
  getContentPovBank,
  listContentCarouselTemplates,
  listContentSignals,
} from "@/lib/content/read-model";
import {
  getMcpDocument,
  listMcpDocuments,
  previewUpdateMcpDocument,
  updateMcpDocument,
} from "@/lib/mcp/documents";
import {
  getSanitizedIntegrationStatus,
  loadIntegrationCatalog,
  previewPublishIntegrationMessage,
  previewTestIntegrationConnection,
  publishIntegrationMessage,
  testIntegrationConnection,
} from "@/lib/integrations/actions";
import { resolveYalcConfig, yalcFetch, countYalcRows, publicYalcConfig } from "@/lib/yalc/client";
import { dispatchOutboundCommand } from "@/lib/yalc/outbound-command";
import { getAvailableProviders } from "@/lib/publishing/registry";
import { fetchAccountInfo } from "@/lib/publishing/providers/metricool";
import { getCronPublishConfig, setCronPublishConfig } from "@/lib/publish/cron-publish-config";
import { registeredTransports } from "@/lib/publish/registry";
import {
  cancelScheduledPost,
  getStoredPublishingStatus,
  previewCancelScheduledPost,
  previewPublishDraft,
  previewPublishingReconciliation,
  publishDraft,
  reconcilePublishing,
  refreshPublishingStatus,
} from "@/lib/publishing/actions";
import type { Channel } from "@/lib/publishing/types";
import {
  attachDraftMedia,
  generateDraftImage,
  listDraftMedia,
  listImageGenerationProviders,
  previewAttachDraftMedia,
  previewGenerateDraftImage,
  previewRemoveDraftMedia,
  previewSetPrimaryDraftMedia,
  removeDraftMedia,
  setPrimaryDraftMedia,
} from "@/lib/media/actions";
import {
  assignTemplateToSearch,
  createDiscoverySearch,
  creatorReportForSlug,
  enqueueDiscoverySearchRun,
  getEffectiveModelConfig,
  ModelConfigValidationError,
  parseDiscoveryPlan,
  parseReportPeriod,
  previewModelConfigUpdate,
  putModelConfigOverrides,
  runDiscoverySearch,
  supportsLiveDiscovery,
  TemplateValidationError,
  triggerDiscoveryRunner,
  updateRunnerState,
} from "@/lib/partnerships";
import {
  partnerContactPreflightError,
  preflightPartnerContactGate,
} from "@/lib/partnerships/contact-gate";
import {
  observeDiscoveryExecutionDispatch,
  observeDiscoveryExecutionEvent,
} from "@/lib/partnerships/discovery-execution-observer";
import {
  resolveOdConfig,
  odHealth,
  odListCraftGuides,
  odListDesignSystems,
  odListArtifacts,
  odListPromptTemplates,
  odListProjectFiles,
  odListProjects,
  odListSkills,
  odExport,
  odPatchProject,
  odReadProjectFile,
} from "@/lib/open-design/client";
import {
  ensureOpenDesignProject,
  previewOpenDesignProjectImport,
  resolveExistingOpenDesignProject,
} from "@/lib/open-design/actions";
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
import { registerKeywordAntennaTools } from "@/lib/keyword-antenna/mcp-tool";
import {
  assertMcpClientAccess,
  assertMcpBrandAccess,
  assertMcpAnyScope,
  assertMcpScope,
  McpAuthError,
  type McpPrincipal,
  type McpScope,
} from "@/lib/mcp/auth";
import {
  VALID_CONTENT_TASK_STATUSES,
  type ChannelPhase,
  type Client,
  type ContentTask,
  type ContentTaskPipelineState,
  type ContentTaskStatus,
  type RecurringTask,
} from "@/types";

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
const RECURRING_LIMIT_DEFAULT = 50;
const RECURRING_LIMIT_MAX = 200;
const RECURRING_PROMPT_MAX_CHARS_DEFAULT = 4_000;
const RECURRING_PROMPT_MAX_CHARS_MAX = 20_000;
const CONTENT_LIMIT_DEFAULT = 50;
const CONTENT_LIMIT_MAX = 200;
const CONTENT_DRAFT_MAX_CHARS_DEFAULT = 60_000;
const CONTENT_DRAFT_MAX_CHARS_MAX = 200_000;
const CONTENT_BODY_MAX_CHARS_DEFAULT = 4_000;
const CONTENT_BODY_MAX_CHARS_MAX = 50_000;
const CONTENT_SIGNAL_DAYS_DEFAULT = 1;
const CONTENT_SIGNAL_DAYS_MAX = 90;
const PUBLISHING_CHANNELS = ["linkedin", "twitter", "x", "instagram", "blog", "email", "youtube", "tiktok"] as const;
const OD_PROJECT_FILE_LIMIT_DEFAULT = 200;
const OD_PROJECT_FILE_LIMIT_MAX = 1000;
const OD_PROJECT_FILE_MAX_CHARS_DEFAULT = 60_000;
const OD_PROJECT_FILE_MAX_CHARS_MAX = 200_000;
const OD_EXPORT_FORMAT_VALUES = ["html", "pdf", "pptx", "zip", "mp4", "md"] as const;
const MCP_RECURRING_STATUS_VALUES = ["active", "paused"] as const;
const MCP_RECURRING_SOURCE_VALUES = ["openclaw-cron", "local"] as const;
const MCP_CONTENT_TASK_STATUS_VALUES = [
  "New",
  "Approved",
  "Draft",
  "Pending Media",
  "Ready",
  "Discarded",
  "Deferred",
] as const;
const MCP_CONTENT_TASK_PIPELINE_STATE_VALUES = [
  "researching",
  "clarify-needed",
  "drafting",
  "generating-media",
  "media-review",
] as const;
const MCP_CHANNEL_PHASE_VALUES = [
  "researching",
  "clarify-needed",
  "drafting",
  "draft",
  "approved",
] as const;
const MCP_CONTENT_TASK_ACTION_VALUES = [
  "approve-draft",
  "approve-media",
  "discard",
  "defer",
] as const;
const CONTENT_DRAFT_CLARIFY_STATUS_VALUES = ["pending", "answered", "skipped"] as const;
const AGENT_SLUG_RE = /^[a-z0-9-]+$/;
// Keep this in sync with docker/setup-agents.sh. sancho is the orchestrator,
// not a delegate target; escudero is retired there and must stay rejected here.
const DELEGATE_AGENT_SLUGS = [
  "cervantes",
  "hamete",
  "dulcinea",
  "rocinante",
  "mambrino",
  "merlin",
  "sanson",
  "maese-pedro",
] as const;
const DELEGATE_AGENT_SET = new Set<string>(DELEGATE_AGENT_SLUGS);
const DELEGATE_AGENT_LIST = DELEGATE_AGENT_SLUGS.join(", ");

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
      description: "Lists clients allowed by the MCP token. Requires clients:read or legacy sancho:read.",
      inputSchema: {},
    },
    async () =>
      runTool(context, "sancho_list_clients", undefined, async () => {
        assertMcpAnyScope(context.principal, ["clients:read", "sancho:read"]);
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
      description: "Returns status, active work, blockers and recent outputs for one client. Requires clients:read or legacy sancho:read.",
      inputSchema: {
        clientSlug: z.string().min(1).describe("Sancho client slug."),
      },
    },
    async ({ clientSlug }) =>
      runTool(context, "sancho_get_client_context", clientSlug, async () => {
        assertClientReadScope(context, clientSlug);
        const status = await getInternalClientStatus(clientSlug);
        if (!status) throw new McpAuthError(404, `Client context not found: ${clientSlug}`);
        return jsonResult(status);
      }),
  );

  server.registerTool(
    "sancho_get_client",
    {
      title: "Get Sancho client",
      description: "Returns sanitized client configuration for one allowed client. Requires clients:read.",
      inputSchema: {
        clientSlug: z.string().min(1).describe("Sancho client slug."),
      },
    },
    async ({ clientSlug }) =>
      runTool(context, "sancho_get_client", clientSlug, async () => {
        assertClientScope(context, "clients:read", clientSlug);
        const client = loadClient(clientSlug);
        if (!client) throw new McpAuthError(404, `Client not found: ${clientSlug}`);
        return jsonResult({ ok: true, client: sanitizeClientForMcp(client) });
      }),
  );

  server.registerTool(
    "sancho_update_client",
    {
      title: "Update Sancho client",
      description:
        "Updates safe client metadata fields. Requires clients:write and client access. Defaults to dry-run and requires confirm=true to write.",
      inputSchema: {
        clientSlug: z.string().min(1).describe("Sancho client slug."),
        updates: z
          .object({
            active: z.boolean().optional(),
            name: z.string().min(1).optional(),
            emoji: z.string().optional(),
            phase: z.number().int().min(0).optional(),
            url: z.string().optional(),
            language: z.enum(["es", "en"]).optional(),
            enabledFeatures: z.array(z.string().min(1)).optional(),
          })
          .describe("Safe client fields to update."),
        dryRun: z.boolean().default(true).describe("When true, only previews the update operation."),
        confirm: z.boolean().default(false).describe("Must be true with dryRun=false to update."),
      },
    },
    async ({ clientSlug, updates, dryRun = true, confirm = false }) =>
      runTool(context, "sancho_update_client", clientSlug, async () => {
        assertClientScope(context, "clients:write", clientSlug);
        const preview = updateClientMetadata(clientSlug, updates, { dryRun: true });
        if (dryRun !== false || confirm !== true) {
          return jsonResult({
            ...preview,
            dryRun: true,
            requiresConfirmation: true,
            message: "Set dryRun=false and confirm=true to update this client.",
          });
        }
        const result = updateClientMetadata(clientSlug, updates, { dryRun: false });
        return jsonResult({ ...result, dryRun: false });
      }),
  );

  server.registerTool(
    "sancho_list_agents",
    {
      title: "List Sancho agents",
      description: "Lists OpenClaw/Sancho agents, model overrides and recommendations. Requires agents:read.",
      inputSchema: {},
    },
    async () =>
      runTool(context, "sancho_list_agents", undefined, async () => {
        assertMcpScope(context.principal, "agents:read");
        const agents = await getRuntime().control.listAgentsRich();
        return jsonResult({ ok: true, agents, count: agents.length });
      }),
  );

  server.registerTool(
    "sancho_get_agent",
    {
      title: "Get Sancho agent",
      description: "Returns one OpenClaw/Sancho agent profile. Requires agents:read.",
      inputSchema: {
        agentId: z.string().min(1).describe("Agent id, e.g. sancho, hamete, dulcinea."),
      },
    },
    async ({ agentId }) =>
      runTool(context, "sancho_get_agent", undefined, async () => {
        assertMcpScope(context.principal, "agents:read");
        const agent = await getMcpAgent(agentId);
        if (!agent) throw new McpAuthError(404, `Agent not found: ${agentId}`);
        return jsonResult({ ok: true, agent });
      }),
  );

  server.registerTool(
    "sancho_set_agent_model",
    {
      title: "Set Sancho agent model",
      description:
        "Sets or clears an agent model override. Requires agents:write. Defaults to dry-run and requires confirm=true to write.",
      inputSchema: {
        agentId: z.string().min(1).describe("Agent id, e.g. sancho, hamete, dulcinea."),
        model: z.string().min(1).nullable().describe("Model id to set, or null to inherit the default model."),
        dryRun: z.boolean().default(true).describe("When true, only previews the model change."),
        confirm: z.boolean().default(false).describe("Must be true with dryRun=false to update."),
      },
    },
    async ({ agentId, model, dryRun = true, confirm = false }) =>
      runTool(context, "sancho_set_agent_model", undefined, async () => {
        assertMcpScope(context.principal, "agents:write");
        const before = await getMcpAgent(agentId);
        if (!before) throw new McpAuthError(404, `Agent not found: ${agentId}`);
        const requestedModel = model ?? null;
        const modelCheck = await validateAgentModel(requestedModel);
        const preview = {
          ok: true,
          agentId,
          before,
          after: { ...before, overrideModel: requestedModel },
          warning: modelCheck.warning,
        };
        if (dryRun !== false || confirm !== true) {
          return jsonResult({
            ...preview,
            dryRun: true,
            requiresConfirmation: true,
            message: "Set dryRun=false and confirm=true to update this agent model override.",
          });
        }
        await getRuntime().control.setAgentModel(agentId, requestedModel);
        const restart = await getRuntime().lifecycle.restart() as {
          ok: boolean;
          method?: string;
          error?: string;
        };
        invalidateCatalogCache();
        const updated = (await getMcpAgent(agentId)) || { ...before, overrideModel: requestedModel };
        const warning = [
          modelCheck.warning,
          restart.ok
            ? null
            : `Modelo guardado, pero no se pudo reiniciar el gateway (${restart.error || "timeout"}). Puede requerir restart/deploy para aplicarse al runtime.`,
        ].filter(Boolean).join(" ");
        return jsonResult({
          ok: true,
          agentId,
          model: requestedModel,
          restarted: restart.ok,
          restartMethod: restart.method,
          warning: warning || undefined,
          agent: updated,
        });
      }),
  );

  server.registerTool(
    "alarife_list_instances",
    {
      title: "List Alarife MCP instances",
      description:
        "Lists Alarife MCP instances registered for the allowed Sancho client. Requires clients:read or legacy sancho:read.",
      inputSchema: {
        clientSlug: z.string().optional().describe("Optional Sancho client slug."),
      },
    },
    async ({ clientSlug }) =>
      runTool(context, "alarife_list_instances", clientSlug, async () => {
        assertMcpAnyScope(context.principal, ["clients:read", "sancho:read"]);
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
        "Returns safe MCP install metadata for one Alarife instance. It never returns bearer tokens. Requires clients:read or legacy sancho:read.",
      inputSchema: {
        clientSlug: z.string().min(1).describe("Sancho client slug."),
        alarifeSlug: z.string().min(1).describe("Alarife slug inside the client, e.g. web or sancho-web."),
      },
    },
    async ({ clientSlug, alarifeSlug }) =>
      runTool(context, "alarife_get_mcp_config", clientSlug, async () => {
        assertClientReadScope(context, clientSlug);
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
        "Performs a live validation call against an Alarife MCP instance using Sancho's stored token. Requires clients:read or legacy sancho:read.",
      inputSchema: {
        clientSlug: z.string().min(1).describe("Sancho client slug."),
        alarifeSlug: z.string().min(1).describe("Alarife slug inside the client, e.g. web or sancho-web."),
      },
    },
    async ({ clientSlug, alarifeSlug }) =>
      runTool(context, "alarife_validate_mcp_connection", clientSlug, async () => {
        assertClientReadScope(context, clientSlug);
        const instance = getAlarifeMcpInstance(clientSlug, alarifeSlug);
        const validation = await validateAlarifeMcpConnection(instance);
        return jsonResult({ ...publicAlarifeMcpInstance(instance), validation, traceId: context.traceId });
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
    "sancho_update_document",
    {
      title: "Update Sancho document",
      description:
        "Replaces one Brand Brain/Foundation .md or .html document by path. Requires docs:write and brand access; dry-run by default.",
      inputSchema: {
        brandSlug: z.string().min(1).describe("Brand slug, e.g. growth4u or xhype."),
        docPath: z
          .string()
          .min(1)
          .describe("Full brand/<slug>/... path or brand-relative path, e.g. market-and-us/market/current.md."),
        content: z.string().max(500_000).describe("Full replacement document content."),
        createIfMissing: z.boolean().default(false).describe("Allow creating the document when the path does not exist."),
        expectedSha256: z
          .string()
          .regex(/^[a-f0-9]{64}$/i)
          .optional()
          .describe("Optional current document sha256 guard from sancho_get_document/update preview."),
        dryRun: z.boolean().default(true).describe("Preview without writing."),
        confirm: z.boolean().default(false).describe("Must be true with dryRun=false to write."),
      },
    },
    async ({ brandSlug, docPath, content, createIfMissing = false, expectedSha256, dryRun = true, confirm = false }) =>
      runTool(context, "sancho_update_document", brandSlug, async () => {
        assertBrandWriteScope(context, brandSlug);
        const preview = previewUpdateMcpDocument(brandSlug, docPath, content, { createIfMissing });
        if (dryRun || !confirm) {
          return jsonResult({
            ok: true,
            dryRun: true,
            requiresConfirmation: true,
            message: "Set dryRun=false and confirm=true to replace this document.",
            preview,
          });
        }
        const result = updateMcpDocument(brandSlug, docPath, content, {
          createIfMissing,
          expectedSha256,
        });
        return jsonResult({ ok: true, ...result, traceId: context.traceId });
      }),
  );

  server.registerTool(
    "sancho_list_meetings",
    {
      title: "List Meeting Intelligence meetings",
      description:
        "Lists Meeting Intelligence meetings for a client, plus totals and last sync/run metadata. Requires intelligence:read.",
      inputSchema: {
        clientSlug: z.string().min(1).describe("Sancho client slug."),
        limit: z.number().int().min(1).max(MEETING_LIMIT_MAX).optional().describe("Maximum meetings to return."),
      },
    },
    async ({ clientSlug, limit }) =>
      runTool(context, "sancho_list_meetings", clientSlug, async () => {
        assertClientScope(context, "intelligence:read", clientSlug);
        const max = clampLimit(limit, MEETING_LIMIT_DEFAULT, MEETING_LIMIT_MAX);
        const state = await getMeetingIntelligenceState(clientSlug, {
          prepareStorage: false,
          backfillLegacy: false,
        });
        const meetings = state.meetings.slice(0, max);
        return jsonResult({
          ok: state.ok,
          clientSlug,
          storage: state.storage,
          meetings,
          count: meetings.length,
          totalMeetings: state.meetings.length,
          limit: max,
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
      title: "Get Meeting Intelligence meeting",
      description:
        "Returns full Meeting Intelligence detail for one meeting: artifact, insights, decisions, impacts and recommendations. Requires intelligence:read.",
      inputSchema: {
        clientSlug: z.string().min(1).describe("Sancho client slug."),
        meetingId: z.string().min(1).describe("Meeting Intelligence meeting id."),
      },
    },
    async ({ clientSlug, meetingId }) =>
      runTool(context, "sancho_get_meeting", clientSlug, async () => {
        assertClientScope(context, "intelligence:read", clientSlug);
        const result = await getMeetingIntelligenceMeeting(clientSlug, meetingId, {
          prepareStorage: false,
          backfillLegacy: false,
        });
        if (result.storage.configured === true && !result.detail) {
          throw new McpAuthError(404, result.error || `Meeting not found: ${meetingId}`);
        }
        return jsonResult({ clientSlug, meetingId, ...result });
      }),
  );

  server.registerTool(
    "sancho_list_intelligence",
    {
      title: "List Meeting Intelligence items",
      description:
        "Lists cross-meeting intelligence, decisions, impacted documents and proposals for a client. Optional kind/status filters apply to compatible item collections. Requires intelligence:read.",
      inputSchema: {
        clientSlug: z.string().min(1).describe("Sancho client slug."),
        kind: z
          .enum(["Decision", "Action", "Insight", "Quote", "Risk", "Run"])
          .optional()
          .describe("Optional intelligence item kind filter."),
        status: z.string().min(1).optional().describe("Optional case-insensitive status filter."),
      },
    },
    async ({ clientSlug, kind, status }) =>
      runTool(context, "sancho_list_intelligence", clientSlug, async () => {
        assertClientScope(context, "intelligence:read", clientSlug);
        const state = await getMeetingIntelligenceState(clientSlug, {
          prepareStorage: false,
          backfillLegacy: false,
        });
        const intelligence = filterIntelligenceItems(state.intelligence, kind, status);
        const decisions = filterDecisionItems(state.decisions, kind, status);
        const documents = filterDocumentItems(state.documents, kind, status);
        const proposals = filterProposalItems(state.proposals, kind, status);
        return jsonResult({
          ok: state.ok,
          clientSlug,
          storage: state.storage,
          filters: pickDefined({ kind, status }),
          intelligence,
          decisions,
          documents,
          proposals,
          totals: {
            ...state.totals,
            returnedIntelligence: intelligence.length,
            returnedDecisions: decisions.length,
            returnedDocuments: documents.length,
            returnedProposals: proposals.length,
          },
          lastSync: state.lastSync,
          lastCheckStatus: state.lastCheckStatus,
          lastRun: state.lastRun,
        });
      }),
  );

  server.registerTool(
    "sancho_get_meeting_intelligence_config",
    {
      title: "Get Meeting Intelligence config",
      description:
        "Reads Meeting Intelligence source/sync/routing config and cron status for a client. Requires intelligence:read.",
      inputSchema: {
        clientSlug: z.string().min(1).describe("Sancho client slug."),
      },
    },
    async ({ clientSlug }) =>
      runTool(context, "sancho_get_meeting_intelligence_config", clientSlug, async () => {
        assertClientScope(context, "intelligence:read", clientSlug);
        const result = await getMeetingIntelligenceConfig(clientSlug);
        const cron = result.config ? getMeetingIntelligenceCronStatus(clientSlug, result.config.sync?.cronJobId) : null;
        return jsonResult({ clientSlug, ...result, cron });
      }),
  );

  server.registerTool(
    "sancho_update_meeting_intelligence_config",
    {
      title: "Update Meeting Intelligence config",
      description:
        "Saves Meeting Intelligence source/sync/routing config for a client and syncs its cron job. Requires intelligence:write; dry-run by default.",
      inputSchema: {
        clientSlug: z.string().min(1).describe("Sancho client slug."),
        config: z
          .record(z.string(), z.unknown())
          .describe("Meeting Intelligence config object, same shape as /api/meeting-intelligence/config."),
        dryRun: z.boolean().default(true).describe("Preview normalized config without writing."),
        confirm: z.boolean().default(false).describe("Must be true with dryRun=false to save config and sync cron."),
      },
    },
    async ({ clientSlug, config, dryRun = true, confirm = false }) =>
      runTool(context, "sancho_update_meeting_intelligence_config", clientSlug, async () => {
        assertClientScope(context, "intelligence:write", clientSlug);
        const normalized = normalizeMeetingIntelligenceConfig(
          clientSlug,
          config as Partial<MeetingIntelligenceConfig> & Record<string, unknown>,
        );
        if (dryRun || !confirm) {
          return jsonResult({
            ok: true,
            dryRun: true,
            requiresConfirmation: true,
            message: "Set dryRun=false and confirm=true to save this Meeting Intelligence config and sync cron.",
            preview: {
              clientSlug,
              config: normalized,
              cronWillSync: true,
            },
          });
        }
        const result = await saveMeetingIntelligenceConfig(
          clientSlug,
          config as Partial<MeetingIntelligenceConfig> & Record<string, unknown>,
        );
        const cron = result.ok && result.config ? syncMeetingIntelligenceCron(result.config) : null;
        return jsonResult({ ...result, cron });
      }),
  );

  server.registerTool(
    "sancho_run_meeting_intelligence_sync",
    {
      title: "Run Meeting Intelligence sync",
      description:
        "Runs a Meeting Intelligence sync for one client, pulling configured sources and writing meetings/insights/recommendations. Requires intelligence:write; dry-run by default.",
      inputSchema: {
        clientSlug: z.string().min(1).describe("Sancho client slug."),
        trigger: z.string().min(1).optional().describe("Run trigger label. Defaults to mcp."),
        limit: z.number().int().min(1).max(60).optional().describe("Max source items per source. Defaults to 30, max 60."),
        dryRun: z.boolean().default(true).describe("Preview without running source fetch/analysis."),
        confirm: z.boolean().default(false).describe("Must be true with dryRun=false to run sync."),
      },
    },
    async ({ clientSlug, trigger, limit, dryRun = true, confirm = false }) =>
      runTool(context, "sancho_run_meeting_intelligence_sync", clientSlug, async () => {
        assertClientScope(context, "intelligence:write", clientSlug);
        const max = clampLimit(limit, 30, 60);
        const runRequest = { slug: clientSlug, trigger: trigger || "mcp", limit: max };
        if (dryRun || !confirm) {
          return jsonResult({
            ok: true,
            dryRun: true,
            requiresConfirmation: true,
            message: "Set dryRun=false and confirm=true to run Meeting Intelligence sync.",
            preview: runRequest,
          });
        }
        const result = await runMeetingIntelligenceSync(runRequest);
        return jsonResult(result);
      }),
  );

  server.registerTool(
    "sancho_apply_meeting_recommendation",
    {
      title: "Apply Meeting Intelligence recommendation action",
      description:
        "Approves, rejects or converts one Meeting Intelligence recommendation. Does not edit target documents directly. Requires intelligence:write; dry-run by default.",
      inputSchema: {
        clientSlug: z.string().min(1).describe("Sancho client slug."),
        recommendationId: z.string().min(1).describe("Meeting Intelligence recommendation id."),
        action: z.enum(["approve", "reject", "convert"]).describe("Recommendation action to apply."),
        dryRun: z.boolean().default(true).describe("Preview without changing recommendation status."),
        confirm: z.boolean().default(false).describe("Must be true with dryRun=false to apply the action."),
      },
    },
    async ({ clientSlug, recommendationId, action, dryRun = true, confirm = false }) =>
      runTool(context, "sancho_apply_meeting_recommendation", clientSlug, async () => {
        assertClientScope(context, "intelligence:write", clientSlug);
        const request = { clientSlug, recommendationId, action };
        if (dryRun || !confirm) {
          return jsonResult({
            ok: true,
            dryRun: true,
            requiresConfirmation: true,
            message: "Set dryRun=false and confirm=true to apply this recommendation action.",
            preview: request,
          });
        }
        const result = await applyMeetingRecommendationAction(clientSlug, recommendationId, action as RecommendationAction);
        if (result.storage.configured === true && !result.recommendation) {
          throw new McpAuthError(404, `Meeting recommendation not found: ${recommendationId}`);
        }
        return jsonResult(result);
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
        "Creates a task for a client. Requires tasks:write. Defaults to dry-run and requires confirm=true to write.",
      inputSchema: {
        clientSlug: z.string().min(1).describe("Sancho client slug."),
        name: z.string().min(1).describe("Task name."),
        description: z.string().optional().describe("Task description/brief."),
        status: z.string().optional().describe("Initial status (default todo)."),
        type: z.string().optional().describe("Task type, e.g. project or execution."),
        parentId: z.string().optional().describe("Parent task id to create a child task."),
        owner: z.string().optional().describe("Task owner (default Sancho)."),
        dryRun: z.boolean().default(true).describe("When true, only previews the create operation."),
        confirm: z.boolean().default(false).describe("Must be true with dryRun=false to create."),
      },
    },
    async ({ clientSlug, name, description, status, type, parentId, owner, dryRun, confirm }) =>
      runTool(context, "sancho_create_task", clientSlug, async () => {
        assertClientScope(context, "tasks:write", clientSlug);
        const input = pickDefined({ name, description, status, type, parent_id: parentId, owner });
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
    "sancho_delegate",
    {
      title: "Delegate Sancho work to a specialist",
      description:
        "Resolves a compatible active task inside the current project/group, reuses its canonical thread, or suggests " +
        "creating a task in that same group before dispatching the specialist via Mission Control chat. Creation is " +
        "always fail-closed in MCP: the tool stores a proposal bound to the source thread, but only an explicit human " +
        "confirmation received through MC Chat may create it. Never creates a standalone task. Requires tasks:write " +
        "and chat:write. Existing-task dispatch defaults to dry-run and requires confirm=true. " +
        "Use this for real work owned by a specialist instead of asking Sancho to answer inline.",
      inputSchema: {
        clientSlug: z.string().min(1).describe("Sancho client slug."),
        agent: z.string().min(1).describe(`Active delegate agent id. Allowed: ${DELEGATE_AGENT_LIST}.`),
        name: z.string().min(1).describe("Task name shown in Mission Control."),
        brief: z.string().min(1).describe("Brief to dispatch to the specialist thread."),
        sourceThreadId: z.string().optional().describe("Current MC chat thread. Used to derive the same project/group safely."),
        sourceTaskId: z.string().optional().describe("Current task id. Used to derive the same project/group safely."),
        targetTaskId: z.string().optional().describe("Existing destination task selected by the user."),
        threadId: z.string().optional().describe("Existing destination MC chat thread selected by the user (legacy explicit target)."),
        threadName: z.string().optional().describe("Optional thread display name. Defaults to the task name."),
        parentId: z.string().optional().describe("Project/group id. New tasks are only suggested/created inside this group."),
        owner: z.string().optional().describe("Legacy compatibility field. It cannot override an existing task owner and MCP does not create the proposed task."),
        skill: z.string().optional().describe("Skill that should run the task, when known."),
        skills: z.array(z.string()).optional().describe("Skill pipeline for the task, when known."),
        status: z.string().optional().describe("Legacy compatibility field. Existing task status is authoritative and MCP does not create the proposed task."),
        proposalId: z.string().optional().describe("Pending same-thread creation proposal id. MCP still cannot complete creation without a human MC Chat confirmation."),
        dryRun: z.boolean().default(true).describe("When true, only previews the create+dispatch operation."),
        confirm: z.boolean().default(false).describe("Must be true with dryRun=false to dispatch an existing task. It never proves human consent for task creation."),
      },
    },
    async ({ clientSlug, agent, name, brief, sourceThreadId, sourceTaskId, targetTaskId, threadId, threadName, parentId, skill, skills, proposalId, dryRun, confirm }) =>
      runTool(context, "sancho_delegate", clientSlug, async () => {
        assertClientScope(context, "tasks:write", clientSlug);
        assertClientScope(context, "chat:write", clientSlug);
        const agentSlug = normalizeDelegateAgent(agent);
        if (![sourceThreadId, sourceTaskId, parentId].some((value) => typeof value === "string" && value.trim())) {
          return jsonResult({
            ok: true,
            dispatched: false,
            action: "group_required",
            requiresGroupSelection: true,
            message: "sancho_delegate requires sourceThreadId, sourceTaskId or parentId so it can enforce the current project/group boundary.",
          });
        }
        const resolution = await resolveSameGroupTaskRoute({
          clientSlug,
          sourceThreadId,
          sourceTaskId,
          groupId: parentId,
          targetTaskId,
          targetThreadId: threadId,
          requestedAgent: agentSlug,
          requestedSkill: skill,
          requestedName: name,
        });

        if (resolution.kind === "group_required") {
          return jsonResult({
            ok: true,
            dispatched: false,
            requiresGroupSelection: true,
            resolution,
            message: "Choose the current project/group before delegating; no standalone task or thread was created.",
          });
        }
        if (resolution.kind === "ambiguous") {
          return jsonResult({
            ok: true,
            dispatched: false,
            requiresTaskSelection: true,
            resolution,
            message: "Select targetTaskId from the compatible tasks, or explicitly confirm creation after choosing a new task.",
          });
        }
        if (resolution.kind === "no_change") {
          return jsonResult({
            ok: true,
            dispatched: false,
            action: "noop",
            resolution,
            taskId: resolution.source.taskId,
            threadId: resolution.source.targetThreadId,
            message: "The resolver selected the current source task. No new turn was dispatched.",
          });
        }

        if (resolution.kind === "suggest_create") {
          const proposalSourceThreadId = await resolveMcpDelegateSourceThread(
            clientSlug,
            sourceThreadId,
            sourceTaskId,
          );
          if (!proposalSourceThreadId) {
            return jsonResult({
              ok: true,
              dispatched: false,
              action: "source_thread_required",
              requiresSourceThread: true,
              resolution,
              message: "No task was created. MCP creation proposals must be bound to a real source chat thread so a later human MC Chat message can confirm them.",
            });
          }

          const proposalInput = {
            clientSlug,
            sourceThreadId: proposalSourceThreadId,
            groupId: resolution.groupId,
            agent: agentSlug,
            skill: normalizeMcpDelegateSkill(skill),
            skills: normalizeMcpDelegateSkills(skills),
            name: name.trim(),
            brief: brief.trim(),
          };
          const suppliedProposalId = typeof proposalId === "string" && proposalId.trim()
            ? proposalId.trim()
            : undefined;
          let proposal = suppliedProposalId
            ? await getPendingTaskRouteProposal(clientSlug, proposalSourceThreadId)
            : undefined;
          if (suppliedProposalId && (
            !proposal
            || proposal.id !== suppliedProposalId
            || !proposalMatches(proposal, proposalInput)
          )) {
            return jsonResult({
              ok: true,
              dispatched: false,
              action: "confirmation_required",
              requiresHumanConfirmation: true,
              resolution,
              message: "No task was created. proposalId is missing, stale or does not match the exact source, group, agent, skills, name and brief.",
            });
          }
          proposal ??= await issueTaskRouteProposal(proposalInput);
          return jsonResult({
            ok: true,
            dispatched: false,
            dryRun: true,
            action: "suggest_create",
            requiresConfirmation: true,
            requiresHumanConfirmation: true,
            resolution,
            proposalId: proposal.id,
            proposal: {
              sourceThreadId: proposal.sourceThreadId,
              groupId: proposal.groupId,
              agent: proposal.agent,
              skill: proposal.skill,
              skills: proposal.skills,
              name: proposal.name,
              brief: proposal.brief,
            },
            message:
              "No task was created or dispatched. MCP cannot authenticate human consent: show this exact proposal in the source MC Chat thread and wait for the user's explicit confirmation there. The MC Chat routing rail—not confirm=true in MCP—must perform creation.",
          });
        }

        const tid = resolution.target.targetThreadId;
        if (isMcpDelegateSelfRoute({
          clientSlug,
          sourceThreadId,
          sourceTaskId,
          targetTaskId: resolution.target.taskId,
          targetThreadId: tid,
        })) {
          return jsonResult({
            ok: true,
            dispatched: false,
            action: "noop",
            resolution,
            taskId: resolution.target.taskId,
            threadId: tid,
            message: "The resolved destination is the current source task/thread. No new turn was dispatched.",
          });
        }

        const task = await getTask(clientSlug, resolution.target.taskId);
        if (!task || !isMcpDelegateTaskActive(task)) {
          return jsonResult({
            ok: true,
            dispatched: false,
            action: "target_inactive",
            resolution,
            taskId: resolution.target.taskId,
            message: "The resolved target disappeared or became inactive before dispatch. Nothing was sent.",
          });
        }
        const targetAgent = normalizeAgentSlug(
          isRecord(task) && typeof task.agent === "string" && task.agent.trim()
            ? task.agent
            : isRecord(task) && typeof task.owner === "string" && task.owner.trim()
              ? task.owner
              : resolution.target.agent,
        );
        if (!targetAgent || targetAgent !== agentSlug) {
          return jsonResult({
            ok: true,
            dispatched: false,
            action: "owner_mismatch",
            resolution,
            taskId: resolution.target.taskId,
            expectedAgent: targetAgent,
            requestedAgent: agentSlug,
            message: "The selected task belongs to another agent (or has no authoritative owner). Nothing was dispatched.",
          });
        }
        if (
          !resolution.groupId
          || !resolution.target.groupId
          || normalizedMcpRouteKey(resolution.groupId) !== normalizedMcpRouteKey(resolution.target.groupId)
        ) {
          return jsonResult({
            ok: true,
            dispatched: false,
            action: "group_mismatch",
            resolution,
            taskId: resolution.target.taskId,
            message: "The selected task is not verifiably inside the resolved source group. Nothing was dispatched.",
          });
        }

        const payload: InboundMessage = {
          slug: clientSlug,
          threadId: tid,
          threadName: threadName || name,
          text: brief,
          userId: `mcp:${context.principal.id}`,
          userName: "Claude Code",
          isAdmin: true,
          senderRole: "admin",
          _source: "mcp_delegate",
          agentId: agentSlug,
          agent: agentSlug,
        };

        if (dryRun !== false || confirm !== true) {
          return jsonResult({
            ok: true,
            dryRun: true,
            requiresConfirmation: true,
            action: "reuse",
            resolution,
            message: "Set dryRun=false and confirm=true to dispatch through the authoritative /api/chat/send task harness.",
            threadId: tid,
            task,
            payload,
          });
        }

        try {
          const dispatch = await dispatchMcChatThroughControlPlane(context, payload);
          return jsonResult({
            ok: true,
            action: "reuse",
            resolution,
            task,
            threadId: tid,
            agent: agentSlug,
            dispatch,
          });
        } catch (err) {
          const message = err instanceof Error ? err.message : "Unknown gateway dispatch error";
          throw new Error(
            `Resolved task ${resolution.target.taskId} for ${agentSlug} at thread ${tid}, but the specialist was NOT dispatched through the task harness: ${message}`,
          );
        }
      }),
  );

  server.registerTool(
    "recurring_list_tasks",
    {
      title: "List recurring tasks",
      description:
        "Lists recurring tasks and OpenClaw cron jobs for one client, with status/source filters. Requires recurring:read.",
      inputSchema: {
        clientSlug: z.string().min(1).describe("Sancho client slug."),
        status: z.enum(MCP_RECURRING_STATUS_VALUES).optional().describe("Optional status filter."),
        source: z.enum(MCP_RECURRING_SOURCE_VALUES).optional().describe("Optional source filter."),
        query: z.string().optional().describe("Optional case-insensitive search over name/description/prompt."),
        limit: z.number().int().min(1).max(RECURRING_LIMIT_MAX).optional().describe("Maximum tasks to return."),
        maxPromptChars: z
          .number()
          .int()
          .min(1)
          .max(RECURRING_PROMPT_MAX_CHARS_MAX)
          .optional()
          .describe("Maximum prompt characters per task. Defaults to 4000."),
      },
    },
    async ({ clientSlug, status, source, query, limit, maxPromptChars }) =>
      runTool(context, "recurring_list_tasks", clientSlug, async () => {
        assertClientScope(context, "recurring:read", clientSlug);
        const max = clampLimit(limit, RECURRING_LIMIT_DEFAULT, RECURRING_LIMIT_MAX);
        const promptMax = clampLimit(
          maxPromptChars,
          RECURRING_PROMPT_MAX_CHARS_DEFAULT,
          RECURRING_PROMPT_MAX_CHARS_MAX,
        );
        const result = listMcpRecurringTasks(clientSlug, {
          status,
          source,
          query,
          limit: max,
          maxPromptChars: promptMax,
        });
        return jsonResult({ ...result, clientSlug, filters: pickDefined({ status, source, query }) });
      }),
  );

  server.registerTool(
    "recurring_set_task_status",
    {
      title: "Set recurring task status",
      description:
        "Pauses or activates one local recurring task or OpenClaw cron job by id. Requires recurring:write; dry-run by default.",
      inputSchema: {
        clientSlug: z.string().min(1).describe("Sancho client slug."),
        taskId: z.string().min(1).describe("Recurring task or OpenClaw cron id."),
        desiredStatus: z.enum(MCP_RECURRING_STATUS_VALUES).describe("Target status."),
        dryRun: z.boolean().default(true).describe("Preview without changing the task/cron."),
        confirm: z.boolean().default(false).describe("Must be true with dryRun=false to update status."),
      },
    },
    async ({ clientSlug, taskId, desiredStatus, dryRun = true, confirm = false }) =>
      runTool(context, "recurring_set_task_status", clientSlug, async () => {
        assertClientScope(context, "recurring:write", clientSlug);
        const target = findMcpRecurringTask(clientSlug, taskId);
        if (!target) throw new McpAuthError(404, `Recurring task not found: ${taskId}`);
        const preview = {
          clientSlug,
          taskId,
          source: target.source,
          currentStatus: target.status,
          desiredStatus,
          noOp: target.status === desiredStatus,
        };
        if (dryRun || !confirm) {
          return jsonResult({
            ok: true,
            dryRun: true,
            requiresConfirmation: true,
            message: "Set dryRun=false and confirm=true to update this recurring task status.",
            preview,
          });
        }
        if (target.status === desiredStatus) {
          return jsonResult({ ok: true, ...preview });
        }
        if (target.source === "openclaw-cron") {
          execFileSync("openclaw", ["cron", desiredStatus === "active" ? "enable" : "disable", taskId], {
            timeout: 10_000,
            encoding: "utf-8",
            env: { ...process.env, PATH: EXEC_PATH },
          });
          return jsonResult({ ok: true, ...preview });
        }
        const tasks = loadRecurringTasks(clientSlug);
        const task = tasks.find((item) => item.id === taskId);
        if (!task) throw new McpAuthError(404, `Recurring task not found: ${taskId}`);
        task.status = desiredStatus;
        task.active = desiredStatus === "active";
        task.updated_at = new Date().toISOString();
        saveRecurringTasks(clientSlug, tasks);
        return jsonResult({ ok: true, ...preview, task: serializeLocalRecurringTask(task, clientSlug, RECURRING_PROMPT_MAX_CHARS_DEFAULT) });
      }),
  );

  server.registerTool(
    "sancho_send_message",
    {
      title: "Send Sancho chat message",
      description:
        "Sends a message into Sancho Mission Control chat. Requires chat:write (legacy sancho:chat still works). Defaults to dry-run and requires confirm=true for execution.",
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
        assertClientScope(context, "chat:write", clientSlug);
        const tid = threadId || `${clientSlug}:mcp`;
        const payload: InboundMessage = {
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
        const result = await getRuntime().messaging.sendInbound(payload, {
          headers: traceHeaders(context),
        });
        const data = parseGatewayBody(result.raw);
        if (!result.ok) {
          const detail = result.raw ? `: ${result.raw.slice(0, 500)}` : "";
          throw new Error(`Mission Control runtime rejected message: HTTP ${result.status}${detail}`);
        }
        return jsonResult({ ok: true, chatId: result.chatId || extractChatId(data) || tid, gateway: data });
      }),
  );

  server.registerTool(
    "sancho_list_chat_threads",
    {
      title: "List Sancho chat threads",
      description: "Lists Mission Control chat threads for a client. Requires chat:read (legacy sancho:chat still works).",
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
        assertClientScope(context, "chat:read", clientSlug);
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
        "Reads recent Mission Control chat messages for a client and extracts pending :::ask multiple-choice questions. Requires chat:read (legacy sancho:chat still works).",
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
        assertClientScope(context, "chat:read", clientSlug);
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
    "content_get_state",
    {
      title: "Get Content Engine state",
      description:
        "Returns read-only Content Engine operational state for a client: config, idea/task counts and recent activity. Requires content:read.",
      inputSchema: {
        clientSlug: z.string().min(1).describe("Sancho client slug."),
        activityLimit: z
          .number()
          .int()
          .min(1)
          .max(CONTENT_LIMIT_MAX)
          .optional()
          .describe("Maximum recent activity events to include."),
      },
    },
    async ({ clientSlug, activityLimit }) =>
      runTool(context, "content_get_state", clientSlug, async () => {
        assertClientScope(context, "content:read", clientSlug);
        const ideas = loadIdeas(clientSlug);
        const contentTasks = loadUnifiedContentTasks(clientSlug);
        const maxActivity = clampLimit(activityLimit, 25, CONTENT_LIMIT_MAX);
        const activity = readActivity(clientSlug, maxActivity);
        return jsonResult({
          ok: true,
          clientSlug,
          config: getContentConfig(clientSlug),
          ideas: {
            count: ideas.length,
            counts: statusCounts(ideas, (idea) => idea.status),
          },
          contentTasks: {
            count: contentTasks.length,
            counts: statusCounts(contentTasks, (task) => task.status),
          },
          activity,
          activityCount: activity.length,
          activityLimit: maxActivity,
          verifiedAt: new Date().toISOString(),
        });
      }),
  );

  server.registerTool(
    "content_get_config",
    {
      title: "Get Content Engine config",
      description: "Reads the Content Engine config for a client. Requires content:read.",
      inputSchema: {
        clientSlug: z.string().min(1).describe("Sancho client slug."),
      },
    },
    async ({ clientSlug }) =>
      runTool(context, "content_get_config", clientSlug, async () => {
        assertClientScope(context, "content:read", clientSlug);
        return jsonResult({ ok: true, clientSlug, config: getContentConfig(clientSlug) });
      }),
  );

  server.registerTool(
    "content_update_config",
    {
      title: "Update Content Engine config",
      description:
        "Updates the Content Engine config for a client. Requires content:write. Defaults to dry-run and requires confirm=true to write.",
      inputSchema: {
        clientSlug: z.string().min(1).describe("Sancho client slug."),
        imageGeneration: z
          .object({
            mode: z.enum(["ask", "fixed"]).optional(),
            provider: z.string().nullable().optional(),
            model: z.string().nullable().optional(),
          })
          .optional()
          .describe("Optional image generation config patch."),
        carousel: z
          .object({
            logoUrl: z.string().nullable().optional(),
            footerText: z.string().nullable().optional(),
            primaryColor: z.string().nullable().optional(),
            accentColor: z.string().nullable().optional(),
            enabledTemplates: z.array(z.string().min(1)).nullable().optional(),
          })
          .optional()
          .describe("Optional carousel config patch."),
        dryRun: z.boolean().default(true).describe("When true, only previews the config update."),
        confirm: z.boolean().default(false).describe("Must be true with dryRun=false to update."),
      },
    },
    async ({ clientSlug, imageGeneration, carousel, dryRun, confirm }) =>
      runTool(context, "content_update_config", clientSlug, async () => {
        assertClientScope(context, "content:write", clientSlug);
        const patch = buildContentConfigPatch(imageGeneration, carousel);
        if (Object.keys(patch).length === 0) {
          throw new McpAuthError(400, "No config fields to update; provide imageGeneration and/or carousel");
        }
        const current = getContentConfig(clientSlug);
        const preview = mergeContentConfig(current, patch);
        if (dryRun !== false || confirm !== true) {
          return jsonResult({
            ok: true,
            dryRun: true,
            requiresConfirmation: true,
            message: "Set dryRun=false and confirm=true to update the Content Engine config.",
            current,
            patch,
            preview,
          });
        }
        const config = updateContentConfig(clientSlug, patch);
        return jsonResult({ ok: true, clientSlug, config });
      }),
  );

  server.registerTool(
    "content_create_idea",
    {
      title: "Create Content Engine idea",
      description:
        "Creates one Content Engine idea in content/idea-queue.json. Requires content:write. Defaults to dry-run and requires confirm=true to write.",
      inputSchema: {
        clientSlug: z.string().min(1).describe("Sancho client slug."),
        id: z.string().min(1).optional().describe("Optional desired idea id. Collisions get a suffix."),
        title: z.string().min(1).describe("Idea title/headline."),
        pillarId: z.string().optional().describe("Optional content pillar id."),
        contentType: z.string().optional().describe("Optional content type."),
        targetChannel: z.string().optional().describe("Optional target channel."),
        angleDraft: z.string().optional().describe("Optional angle/POV draft."),
        povConfidence: z.number().min(0).max(1).optional().describe("Optional POV confidence from 0 to 1."),
        signalSummary: z.string().optional().describe("Optional source signal summary."),
        signalSource: z.string().optional().describe("Optional source signal name."),
        signalUrl: z.string().url().optional().describe("Optional source signal URL."),
        signalDate: z.string().optional().describe("Optional source signal date, defaults to today."),
        sourceSignals: z.array(z.string().min(1)).optional().describe("Optional source signal ids/paths."),
        dryRun: z.boolean().default(true).describe("When true, only previews the create operation."),
        confirm: z.boolean().default(false).describe("Must be true with dryRun=false to create."),
      },
    },
    async ({
      clientSlug,
      id,
      title,
      pillarId,
      contentType,
      targetChannel,
      angleDraft,
      povConfidence,
      signalSummary,
      signalSource,
      signalUrl,
      signalDate,
      sourceSignals,
      dryRun,
      confirm,
    }) =>
      runTool(context, "content_create_idea", clientSlug, async () => {
        assertClientScope(context, "content:write", clientSlug);
        const ideas = await loadContentIdeaQueue(clientSlug);
        const idea = buildContentIdea({
          existing: ideas,
          id,
          title,
          pillarId,
          contentType,
          targetChannel,
          angleDraft,
          povConfidence,
          signalSummary,
          signalSource,
          signalUrl,
          signalDate,
          sourceSignals,
        });
        if (dryRun !== false || confirm !== true) {
          return jsonResult({
            ok: true,
            dryRun: true,
            requiresConfirmation: true,
            message: "Set dryRun=false and confirm=true to create this Content Engine idea.",
            idea,
            existingCount: ideas.length,
          });
        }
        await saveContentIdeaQueue(clientSlug, [...ideas, idea]);
        return jsonResult({ ok: true, clientSlug, idea, count: ideas.length + 1 });
      }),
  );

  server.registerTool(
    "content_update_idea",
    {
      title: "Update Content Engine idea",
      description:
        "Updates safe fields on one Content Engine idea. Requires content:write. Does not approve/generate drafts; use a dedicated approval tool for that. Defaults to dry-run and requires confirm=true to write.",
      inputSchema: {
        clientSlug: z.string().min(1).describe("Sancho client slug."),
        ideaId: z.string().min(1).describe("Content Engine idea id."),
        status: z
          .enum(["New", "Discarded", "Deferred", "Published"])
          .optional()
          .describe("Safe status update. Approved is intentionally excluded because it triggers generation."),
        angleDraft: z.string().nullable().optional().describe("New angle/POV draft, or null to clear."),
        pillarId: z.string().nullable().optional().describe("New pillar id, or null to clear."),
        targetChannel: z.string().nullable().optional().describe("New target channel, or null to clear."),
        contentType: z.string().nullable().optional().describe("New content type, or null to clear."),
        author: z.string().nullable().optional().describe("New author/persona id, or null to clear."),
        targetDate: z.string().nullable().optional().describe("New target date, or null to clear."),
        dispatchDate: z.string().nullable().optional().describe("New dispatch date, or null to clear."),
        dispatchSlot: z.string().nullable().optional().describe("New dispatch slot, or null to clear."),
        projectTaskId: z.string().nullable().optional().describe("New linked project task id, or null to clear."),
        dryRun: z.boolean().default(true).describe("When true, only previews the update operation."),
        confirm: z.boolean().default(false).describe("Must be true with dryRun=false to update."),
      },
    },
    async ({
      clientSlug,
      ideaId,
      status,
      angleDraft,
      pillarId,
      targetChannel,
      contentType,
      author,
      targetDate,
      dispatchDate,
      dispatchSlot,
      projectTaskId,
      dryRun,
      confirm,
    }) =>
      runTool(context, "content_update_idea", clientSlug, async () => {
        assertClientScope(context, "content:write", clientSlug);
        const ideas = await loadContentIdeaQueue(clientSlug);
        const index = ideas.findIndex((idea) => idea.id === ideaId);
        if (index < 0) throw new McpAuthError(404, `Content Engine idea not found: ${ideaId}`);
        const patch = buildContentIdeaPatch({
          status,
          angleDraft,
          pillarId,
          targetChannel,
          contentType,
          author,
          targetDate,
          dispatchDate,
          dispatchSlot,
          projectTaskId,
        });
        if (Object.keys(patch).length === 0) {
          throw new McpAuthError(400, "No idea fields to update");
        }
        const current = ideas[index];
        const updated = applyContentIdeaPatch(current, patch);
        if (dryRun !== false || confirm !== true) {
          return jsonResult({
            ok: true,
            dryRun: true,
            requiresConfirmation: true,
            message: "Set dryRun=false and confirm=true to update this Content Engine idea.",
            ideaId,
            current,
            patch,
            preview: updated,
          });
        }
        const next = ideas.slice();
        next[index] = updated;
        await saveContentIdeaQueue(clientSlug, next);
        return jsonResult({ ok: true, clientSlug, idea: updated });
      }),
  );

  server.registerTool(
    "content_approve_idea",
    {
      title: "Approve Content Engine idea",
      description:
        "Approves one Content Engine idea and provisions its ContentTask/drafts. Requires content:write. Defaults to dry-run and requires confirm=true to write.",
      inputSchema: {
        clientSlug: z.string().min(1).describe("Sancho client slug."),
        ideaId: z.string().min(1).describe("Content Engine idea id."),
        approvedBy: z.string().min(1).optional().describe("Optional operator/user id to stamp on the idea."),
        approvedVia: z.string().min(1).optional().describe("Optional approval source, defaults to mcp."),
        triggerWriter: z
          .boolean()
          .default(true)
          .describe("When confirmed, best-effort trigger the writer skill through the ContentTask chat thread."),
        dryRun: z.boolean().default(true).describe("When true, only previews the approval/provisioning operation."),
        confirm: z.boolean().default(false).describe("Must be true with dryRun=false to approve and provision."),
      },
    },
    async ({ clientSlug, ideaId, approvedBy, approvedVia, triggerWriter, dryRun, confirm }) =>
      runTool(context, "content_approve_idea", clientSlug, async () => {
        assertClientScope(context, "content:write", clientSlug);
        assertContentPathSegment("ideaId", ideaId);
        const preview = previewContentIdeaApproval(clientSlug, ideaId, { triggerWriter });
        if (dryRun !== false || confirm !== true) {
          return jsonResult({
            ok: true,
            dryRun: true,
            requiresConfirmation: true,
            message: "Set dryRun=false and confirm=true to approve this idea and provision its ContentTask/drafts.",
            preview,
          });
        }
        const result = await approveContentIdea(clientSlug, ideaId, {
          approvedBy,
          approvedVia,
          triggerWriter,
        });
        return jsonResult({ ok: true, clientSlug, ...result });
      }),
  );

  server.registerTool(
    "content_list_ideas",
    {
      title: "List Content Engine ideas",
      description: "Lists Content Engine ideas for a client with optional status/channel/query filters. Requires content:read.",
      inputSchema: {
        clientSlug: z.string().min(1).describe("Sancho client slug."),
        status: z.string().min(1).optional().describe("Optional case-insensitive idea status filter."),
        channel: z.string().min(1).optional().describe("Optional target channel filter."),
        query: z.string().min(1).optional().describe("Optional case-insensitive search over title/description/angle."),
        limit: z.number().int().min(1).max(CONTENT_LIMIT_MAX).optional().describe("Maximum ideas to return."),
      },
    },
    async ({ clientSlug, status, channel, query, limit }) =>
      runTool(context, "content_list_ideas", clientSlug, async () => {
        assertClientScope(context, "content:read", clientSlug);
        const max = clampLimit(limit, CONTENT_LIMIT_DEFAULT, CONTENT_LIMIT_MAX);
        const all = loadIdeas(clientSlug);
        const ideas = all
          .filter((idea) => matchesLooseStatus(idea.status, status))
          .filter((idea) => !channel || idea.target_channel === channel || idea.channels?.includes(channel))
          .filter((idea) =>
            matchesQuery(query, [
              idea.id,
              idea.title,
              idea.description,
              String((idea as unknown as Record<string, unknown>).angle_draft || ""),
            ]),
          )
          .slice(0, max);
        return jsonResult({
          ok: true,
          clientSlug,
          ideas,
          count: ideas.length,
          totalIdeas: all.length,
          counts: statusCounts(all, (idea) => idea.status),
          filters: pickDefined({ status, channel, query }),
          limit: max,
        });
      }),
  );

  server.registerTool(
    "content_list_tasks",
    {
      title: "List Content Engine tasks",
      description:
        "Lists unified Content Engine tasks for a client with optional status/channel/query filters. Requires content:read.",
      inputSchema: {
        clientSlug: z.string().min(1).describe("Sancho client slug."),
        status: z.string().min(1).optional().describe("Optional case-insensitive ContentTask status filter."),
        channel: z.string().min(1).optional().describe("Optional target channel filter."),
        query: z.string().min(1).optional().describe("Optional case-insensitive search over id/name/title/angle."),
        limit: z.number().int().min(1).max(CONTENT_LIMIT_MAX).optional().describe("Maximum tasks to return."),
      },
    },
    async ({ clientSlug, status, channel, query, limit }) =>
      runTool(context, "content_list_tasks", clientSlug, async () => {
        assertClientScope(context, "content:read", clientSlug);
        const max = clampLimit(limit, CONTENT_LIMIT_DEFAULT, CONTENT_LIMIT_MAX);
        const all = loadUnifiedContentTasks(clientSlug);
        const contentTasks = all
          .filter((task) => matchesLooseStatus(task.status, status))
          .filter((task) => !channel || task.target_channel === channel || task.target_channels?.includes(channel))
          .filter((task) =>
            matchesQuery(query, [task.id, task.name, task.title, task.angle_draft]),
          )
          .slice(0, max);
        return jsonResult({
          ok: true,
          clientSlug,
          contentTasks,
          count: contentTasks.length,
          totalContentTasks: all.length,
          counts: statusCounts(all, (task) => task.status),
          filters: pickDefined({ status, channel, query }),
          limit: max,
        });
      }),
  );

  server.registerTool(
    "content_get_task",
    {
      title: "Get Content Engine task",
      description: "Reads one unified Content Engine task by id. Requires content:read.",
      inputSchema: {
        clientSlug: z.string().min(1).describe("Sancho client slug."),
        contentTaskId: z.string().min(1).describe("ContentTask id."),
      },
    },
    async ({ clientSlug, contentTaskId }) =>
      runTool(context, "content_get_task", clientSlug, async () => {
        assertClientScope(context, "content:read", clientSlug);
        const task = loadUnifiedContentTasks(clientSlug).find((item) => item.id === contentTaskId);
        if (!task) throw new McpAuthError(404, `Content task not found: ${contentTaskId}`);
        return jsonResult({ ok: true, clientSlug, contentTask: task });
      }),
  );

  server.registerTool(
    "content_update_task",
    {
      title: "Update Content Engine task",
      description:
        "Updates safe ContentTask fields, status/pipeline_state and per-channel phases. Requires content:write. Defaults to dry-run and requires confirm=true to write.",
      inputSchema: {
        clientSlug: z.string().min(1).describe("Sancho client slug."),
        contentTaskId: z.string().min(1).describe("ContentTask id."),
        name: z.string().min(1).optional().describe("Optional ContentTask name."),
        skill: z.string().min(1).optional().describe("Optional writer skill id."),
        targetChannels: z.array(z.string().min(1)).optional().describe("Optional replacement target channel list."),
        owner: z.string().min(1).optional().describe("Optional owner."),
        scheduledFor: z.string().min(1).optional().describe("Optional scheduling date/time metadata."),
        clarifyStatus: z.string().min(1).optional().describe("Optional clarify status metadata."),
        mediaPolicy: z
          .record(z.string(), z.enum(["required", "optional"]))
          .optional()
          .describe("Optional per-channel media policy map."),
        author: z.string().min(1).optional().describe("Optional author/persona id."),
        status: z.enum(MCP_CONTENT_TASK_STATUS_VALUES).optional().describe("Optional ContentTask status. Publishing is intentionally excluded."),
        pipelineState: z
          .enum(MCP_CONTENT_TASK_PIPELINE_STATE_VALUES)
          .nullable()
          .optional()
          .describe("Optional pipeline_state. Null clears it."),
        channelPhases: z
          .record(z.string(), z.enum(MCP_CHANNEL_PHASE_VALUES))
          .optional()
          .describe("Optional per-channel phase patch. The published phase is intentionally excluded."),
        dryRun: z.boolean().default(true).describe("When true, only previews the task update."),
        confirm: z.boolean().default(false).describe("Must be true with dryRun=false to update."),
      },
    },
    async ({
      clientSlug,
      contentTaskId,
      name,
      skill,
      targetChannels,
      owner,
      scheduledFor,
      clarifyStatus,
      mediaPolicy,
      author,
      status,
      pipelineState,
      channelPhases,
      dryRun,
      confirm,
    }) =>
      runTool(context, "content_update_task", clientSlug, async () => {
        assertClientScope(context, "content:write", clientSlug);
        assertContentPathSegment("contentTaskId", contentTaskId);
        const found = requireMcpContentTask(clientSlug, contentTaskId);
        const plan = buildContentTaskUpdatePlan({
          name,
          skill,
          targetChannels,
          owner,
          scheduledFor,
          clarifyStatus,
          mediaPolicy,
          author,
          status,
          pipelineState,
          channelPhases,
        });
        if (!plan.hasChanges) throw new McpAuthError(400, "No ContentTask fields to update");
        if (dryRun !== false || confirm !== true) {
          return jsonResult({
            ok: true,
            dryRun: true,
            requiresConfirmation: true,
            message: "Set dryRun=false and confirm=true to update this ContentTask.",
            contentTaskId,
            parentTaskId: found.parentTaskId,
            current: found.ct,
            plan,
          });
        }
        const updated = applyContentTaskUpdatePlan(clientSlug, found.parentTaskId, contentTaskId, found.ct, plan);
        return jsonResult({ ok: true, clientSlug, parentTaskId: found.parentTaskId, contentTask: updated });
      }),
  );

  server.registerTool(
    "content_transition_task",
    {
      title: "Transition Content Engine task",
      description:
        "Runs one canonical ContentTask lifecycle action such as approve-draft, approve-media, discard or defer. Requires content:write. Defaults to dry-run and requires confirm=true to write.",
      inputSchema: {
        clientSlug: z.string().min(1).describe("Sancho client slug."),
        contentTaskId: z.string().min(1).describe("ContentTask id."),
        action: z.enum(MCP_CONTENT_TASK_ACTION_VALUES).describe("Lifecycle action. Publishing is intentionally excluded."),
        dryRun: z.boolean().default(true).describe("When true, only previews the lifecycle transition."),
        confirm: z.boolean().default(false).describe("Must be true with dryRun=false to transition."),
      },
    },
    async ({ clientSlug, contentTaskId, action, dryRun, confirm }) =>
      runTool(context, "content_transition_task", clientSlug, async () => {
        assertClientScope(context, "content:write", clientSlug);
        assertContentPathSegment("contentTaskId", contentTaskId);
        const found = requireMcpContentTask(clientSlug, contentTaskId);
        const transition = buildContentTaskTransition(clientSlug, found.ct, action);
        if (dryRun !== false || confirm !== true) {
          return jsonResult({
            ok: true,
            dryRun: true,
            requiresConfirmation: true,
            message: "Set dryRun=false and confirm=true to run this ContentTask transition.",
            contentTaskId,
            parentTaskId: found.parentTaskId,
            current: found.ct,
            transition,
          });
        }
        const updated = setContentTaskStatus(
          clientSlug,
          found.parentTaskId,
          contentTaskId,
          transition.status,
          transition.pipelineState,
        );
        return jsonResult({ ok: true, clientSlug, parentTaskId: found.parentTaskId, contentTask: updated, transition });
      }),
  );

  server.registerTool(
    "content_list_drafts",
    {
      title: "List Content Engine drafts",
      description:
        "Lists Content Engine draft document summaries for one idea or all discovered draft folders. Requires content:read.",
      inputSchema: {
        clientSlug: z.string().min(1).describe("Sancho client slug."),
        ideaId: z.string().min(1).optional().describe("Optional idea id. When omitted, lists all discovered draft folders."),
        limit: z.number().int().min(1).max(CONTENT_LIMIT_MAX).optional().describe("Maximum draft summaries to return."),
      },
    },
    async ({ clientSlug, ideaId, limit }) =>
      runTool(context, "content_list_drafts", clientSlug, async () => {
        assertClientScope(context, "content:read", clientSlug);
        if (ideaId) assertContentPathSegment("ideaId", ideaId);
        const max = clampLimit(limit, CONTENT_LIMIT_DEFAULT, CONTENT_LIMIT_MAX);
        const ideaIds = ideaId ? [ideaId] : await listContentDraftIdeaIds(clientSlug);
        const drafts = ideaIds.flatMap((id) => listDrafts(clientSlug, id).map(serializeContentDraftSummary)).slice(0, max);
        return jsonResult({
          ok: true,
          clientSlug,
          drafts,
          count: drafts.length,
          ideaCount: ideaIds.length,
          filters: pickDefined({ ideaId }),
          limit: max,
        });
      }),
  );

  server.registerTool(
    "content_update_draft",
    {
      title: "Update Content Engine draft",
      description:
        "Updates one Content Engine draft body and safe frontmatter fields. Requires content:write. Defaults to dry-run and requires confirm=true to write.",
      inputSchema: {
        clientSlug: z.string().min(1).describe("Sancho client slug."),
        ideaId: z.string().min(1).describe("Idea id."),
        channel: z.string().min(1).describe("Draft channel/file name without .md, e.g. linkedin, proposal or clarify."),
        body: z.string().optional().describe("Optional replacement markdown body."),
        clarifyStatus: z.enum(CONTENT_DRAFT_CLARIFY_STATUS_VALUES).optional().describe("Optional clarify_status frontmatter."),
        itemType: z.enum(VALID_CONTENT_ITEM_TYPES).optional().describe("Optional content item type frontmatter."),
        mediaPolicy: z.enum(["required", "optional"]).optional().describe("Optional media_policy frontmatter."),
        model: z.string().min(1).optional().describe("Optional model metadata."),
        researchUsed: z.boolean().optional().describe("Optional research_used metadata."),
        selfQa: z.enum(["PASS", "FAIL"]).optional().describe("Optional self_qa verdict."),
        selfQaNotes: z.array(z.string()).optional().describe("Optional self_qa_notes list."),
        dryRun: z.boolean().default(true).describe("When true, only previews the draft update."),
        confirm: z.boolean().default(false).describe("Must be true with dryRun=false to update."),
      },
    },
    async ({
      clientSlug,
      ideaId,
      channel,
      body,
      clarifyStatus,
      itemType,
      mediaPolicy,
      model,
      researchUsed,
      selfQa,
      selfQaNotes,
      dryRun,
      confirm,
    }) =>
      runTool(context, "content_update_draft", clientSlug, async () => {
        assertClientScope(context, "content:write", clientSlug);
        assertContentPathSegment("ideaId", ideaId);
        assertContentPathSegment("channel", channel);
        const current = loadDraft(clientSlug, ideaId, channel);
        if (!current) throw new McpAuthError(404, `Content draft not found: ${ideaId}/${channel}`);
        const patch = buildContentDraftPatch({
          body,
          clarifyStatus,
          itemType,
          mediaPolicy,
          model,
          researchUsed,
          selfQa,
          selfQaNotes,
        });
        if (!patch.bodyChanged && Object.keys(patch.meta).length === 0) {
          throw new McpAuthError(400, "No draft fields to update");
        }
        const preview = previewContentDraftUpdate(current, patch);
        if (dryRun !== false || confirm !== true) {
          return jsonResult({
            ok: true,
            dryRun: true,
            requiresConfirmation: true,
            message: "Set dryRun=false and confirm=true to update this draft.",
            current: serializeContentDraftSummary(current),
            patch: {
              meta: patch.meta,
              bodyChanged: patch.bodyChanged,
              bodyChars: patch.body?.length ?? current.body.length,
            },
            preview,
          });
        }
        const draft = updateDraft(clientSlug, ideaId, channel, {
          meta: Object.keys(patch.meta).length > 0 ? patch.meta : undefined,
          body: patch.body,
        });
        return jsonResult({ ok: true, clientSlug, draft: serializeContentDraft(draft, CONTENT_DRAFT_MAX_CHARS_DEFAULT) });
      }),
  );

  server.registerTool(
    "content_request_draft_iteration",
    {
      title: "Request Content Engine draft iteration",
      description:
        "Snapshots a draft, stores an iteration request in frontmatter, moves the channel phase back to drafting and posts a chat marker. Requires content:write. Defaults to dry-run and requires confirm=true to write.",
      inputSchema: {
        clientSlug: z.string().min(1).describe("Sancho client slug."),
        ideaId: z.string().min(1).describe("Idea id."),
        channel: z.string().min(1).describe("Draft channel/file name without .md."),
        instruction: z.string().min(1).describe("Human iteration instruction for the writer."),
        dryRun: z.boolean().default(true).describe("When true, only previews the iteration request."),
        confirm: z.boolean().default(false).describe("Must be true with dryRun=false to request iteration."),
      },
    },
    async ({ clientSlug, ideaId, channel, instruction, dryRun, confirm }) =>
      runTool(context, "content_request_draft_iteration", clientSlug, async () => {
        assertClientScope(context, "content:write", clientSlug);
        assertContentPathSegment("ideaId", ideaId);
        assertContentPathSegment("channel", channel);
        const preview = previewDraftIteration(clientSlug, ideaId, channel, instruction);
        if (dryRun !== false || confirm !== true) {
          return jsonResult({
            ok: true,
            dryRun: true,
            requiresConfirmation: true,
            message: "Set dryRun=false and confirm=true to request this draft iteration.",
            preview,
          });
        }
        const result = requestDraftIteration(clientSlug, ideaId, channel, instruction);
        return jsonResult({
          ...result,
          ok: true,
          clientSlug,
          draft: serializeDraftIterationResult(result.draft),
        });
      }),
  );

  server.registerTool(
    "content_retrigger_writer",
    {
      title: "Retrigger Content Engine writer",
      description:
        "Best-effort re-triggers the writer skill for an existing ContentTask. With instruction it triggers an iteration; without instruction it triggers the initial writer flow. Requires content:write. Defaults to dry-run and requires confirm=true to forward to the gateway.",
      inputSchema: {
        clientSlug: z.string().min(1).describe("Sancho client slug."),
        contentTaskId: z.string().min(1).describe("ContentTask id."),
        channel: z.string().min(1).optional().describe("Optional channel scope for iteration."),
        instruction: z.string().min(1).optional().describe("Optional free-text iteration instruction."),
        dryRun: z.boolean().default(true).describe("When true, only previews the writer trigger."),
        confirm: z.boolean().default(false).describe("Must be true with dryRun=false to trigger writer."),
      },
    },
    async ({ clientSlug, contentTaskId, channel, instruction, dryRun, confirm }) =>
      runTool(context, "content_retrigger_writer", clientSlug, async () => {
        assertClientScope(context, "content:write", clientSlug);
        assertContentPathSegment("contentTaskId", contentTaskId);
        if (channel) assertContentPathSegment("channel", channel);
        const preview = previewRetriggerContentWriter(clientSlug, contentTaskId, { channel, instruction });
        if (dryRun !== false || confirm !== true) {
          return jsonResult({
            ok: true,
            dryRun: true,
            requiresConfirmation: true,
            message: "Set dryRun=false and confirm=true to re-trigger the Content Engine writer.",
            preview,
          });
        }
        const result = await retriggerContentWriter(clientSlug, contentTaskId, { channel, instruction });
        return jsonResult({ ...result, ok: true, clientSlug });
      }),
  );

  server.registerTool(
    "content_get_reconcile_state",
    {
      title: "Get Content Engine reconcile state",
      description:
        "Reads the last persisted Content Engine reconciler run without computing or mutating state. Requires content:read.",
      inputSchema: {
        clientSlug: z.string().min(1).describe("Sancho client slug."),
      },
    },
    async ({ clientSlug }) =>
      runTool(context, "content_get_reconcile_state", clientSlug, async () => {
        assertClientScope(context, "content:read", clientSlug);
        const state = readReconcileState(clientSlug);
        return jsonResult(state ? { ok: true, clientSlug, neverRan: false, state } : { ok: true, clientSlug, neverRan: true });
      }),
  );

  server.registerTool(
    "content_reconcile",
    {
      title: "Run Content Engine reconciler",
      description:
        "Runs the deterministic Content Engine reconciler for one client, promoting forward-only safe phases and persisting reconcile-state.json. Requires content:write. Defaults to dry-run and requires confirm=true to run.",
      inputSchema: {
        clientSlug: z.string().min(1).describe("Sancho client slug."),
        dryRun: z.boolean().default(true).describe("When true, only previews that reconcile would run."),
        confirm: z.boolean().default(false).describe("Must be true with dryRun=false to run the reconciler."),
      },
    },
    async ({ clientSlug, dryRun, confirm }) =>
      runTool(context, "content_reconcile", clientSlug, async () => {
        assertClientScope(context, "content:write", clientSlug);
        const lastState = readReconcileState(clientSlug);
        if (dryRun !== false || confirm !== true) {
          return jsonResult({
            ok: true,
            dryRun: true,
            requiresConfirmation: true,
            message: "Set dryRun=false and confirm=true to run the Content Engine reconciler.",
            preview: { clientSlug, lastState },
          });
        }
        const result = await reconcileContentTasks(clientSlug);
        return jsonResult({ ok: true, clientSlug, result });
      }),
  );

  server.registerTool(
    "content_get_draft",
    {
      title: "Get Content Engine draft",
      description: "Reads one Content Engine draft body and metadata. Requires content:read.",
      inputSchema: {
        clientSlug: z.string().min(1).describe("Sancho client slug."),
        ideaId: z.string().min(1).describe("Idea id."),
        channel: z.string().min(1).describe("Draft channel/file name without .md, e.g. linkedin or blog."),
        maxChars: z
          .number()
          .int()
          .min(1)
          .max(CONTENT_DRAFT_MAX_CHARS_MAX)
          .optional()
          .describe("Maximum draft body characters to return. Defaults to 60000."),
      },
    },
    async ({ clientSlug, ideaId, channel, maxChars }) =>
      runTool(context, "content_get_draft", clientSlug, async () => {
        assertClientScope(context, "content:read", clientSlug);
        assertContentPathSegment("ideaId", ideaId);
        assertContentPathSegment("channel", channel);
        const max = clampLimit(maxChars, CONTENT_DRAFT_MAX_CHARS_DEFAULT, CONTENT_DRAFT_MAX_CHARS_MAX);
        const draft = loadDraft(clientSlug, ideaId, channel);
        if (!draft) throw new McpAuthError(404, `Content draft not found: ${ideaId}/${channel}`);
        return jsonResult({ ok: true, clientSlug, draft: serializeContentDraft(draft, max), maxChars: max });
      }),
  );

  server.registerTool(
    "content_list_activity",
    {
      title: "List Content Engine activity",
      description: "Lists recent Content Engine activity events for a client. Requires content:read.",
      inputSchema: {
        clientSlug: z.string().min(1).describe("Sancho client slug."),
        limit: z.number().int().min(1).max(CONTENT_LIMIT_MAX).optional().describe("Maximum events to return."),
      },
    },
    async ({ clientSlug, limit }) =>
      runTool(context, "content_list_activity", clientSlug, async () => {
        assertClientScope(context, "content:read", clientSlug);
        const max = clampLimit(limit, CONTENT_LIMIT_DEFAULT, CONTENT_LIMIT_MAX);
        const activity = readActivity(clientSlug, max);
        return jsonResult({ ok: true, clientSlug, activity, count: activity.length, limit: max });
      }),
  );

  server.registerTool(
    "content_get_calendar",
    {
      title: "Get Content Engine calendar",
      description:
        "Reads scheduled posts and Ready Queue drafts for the Content Engine posting calendar without running reconciliation. Requires content:read.",
      inputSchema: {
        clientSlug: z.string().min(1).describe("Sancho client slug."),
        from: z.string().min(1).optional().describe("Optional inclusive start date/ISO timestamp."),
        to: z.string().min(1).optional().describe("Optional inclusive end date/ISO timestamp."),
        maxBodyChars: z
          .number()
          .int()
          .min(1)
          .max(CONTENT_BODY_MAX_CHARS_MAX)
          .optional()
          .describe("Maximum draft body characters per calendar item."),
      },
    },
    async ({ clientSlug, from, to, maxBodyChars }) =>
      runTool(context, "content_get_calendar", clientSlug, async () => {
        assertClientScope(context, "content:read", clientSlug);
        const max = clampLimit(maxBodyChars, CONTENT_BODY_MAX_CHARS_DEFAULT, CONTENT_BODY_MAX_CHARS_MAX);
        const calendar = getContentCalendar(clientSlug, { from, to, maxBodyChars: max });
        return jsonResult({ ...calendar, clientSlug, filters: pickDefined({ from, to }), maxBodyChars: max });
      }),
  );

  server.registerTool(
    "content_list_signals",
    {
      title: "List Content Engine research signals",
      description: "Lists Content Engine research signals from brand content/research-signals files. Requires content:read.",
      inputSchema: {
        clientSlug: z.string().min(1).describe("Sancho client slug."),
        date: z.string().min(1).optional().describe("Optional YYYY-MM-DD date filter."),
        days: z
          .number()
          .int()
          .min(1)
          .max(CONTENT_SIGNAL_DAYS_MAX)
          .optional()
          .describe("Number of recent days to include when date is omitted."),
        limit: z.number().int().min(1).max(CONTENT_LIMIT_MAX).optional().describe("Maximum signal files to scan."),
      },
    },
    async ({ clientSlug, date, days, limit }) =>
      runTool(context, "content_list_signals", clientSlug, async () => {
        assertClientScope(context, "content:read", clientSlug);
        const maxDays = clampLimit(days, CONTENT_SIGNAL_DAYS_DEFAULT, CONTENT_SIGNAL_DAYS_MAX);
        const max = clampLimit(limit, CONTENT_LIMIT_DEFAULT, CONTENT_LIMIT_MAX);
        const payload = listContentSignals(clientSlug, { date, days: maxDays, limit: max });
        return jsonResult({ ...payload, clientSlug, filters: pickDefined({ date, days: maxDays }), limit: max });
      }),
  );

  server.registerTool(
    "content_get_channel_loops",
    {
      title: "Get Content Engine channel loops",
      description:
        "Returns derived per-channel loop state: cadence, antennas, ideation, creation, published and metrics stages. Requires content:read.",
      inputSchema: {
        clientSlug: z.string().min(1).describe("Sancho client slug."),
      },
    },
    async ({ clientSlug }) =>
      runTool(context, "content_get_channel_loops", clientSlug, async () => {
        assertClientScope(context, "content:read", clientSlug);
        const payload = await getContentChannelLoops(clientSlug);
        return jsonResult({ ...payload, clientSlug });
      }),
  );

  server.registerTool(
    "content_get_pillars",
    {
      title: "Get Content Engine pillars",
      description: "Reads brand content/content-pillars.md and parsed pillar summaries. Requires content:read.",
      inputSchema: {
        clientSlug: z.string().min(1).describe("Sancho client slug."),
      },
    },
    async ({ clientSlug }) =>
      runTool(context, "content_get_pillars", clientSlug, async () => {
        assertClientScope(context, "content:read", clientSlug);
        return jsonResult({ clientSlug, ...getContentPillars(clientSlug) });
      }),
  );

  server.registerTool(
    "content_get_pov_bank",
    {
      title: "Get Content Engine POV bank",
      description:
        "Reads the Neon-backed POV Bank state and storage diagnostic without legacy JSON bootstrap. Requires content:read.",
      inputSchema: {
        clientSlug: z.string().min(1).describe("Sancho client slug."),
      },
    },
    async ({ clientSlug }) =>
      runTool(context, "content_get_pov_bank", clientSlug, async () => {
        assertClientScope(context, "content:read", clientSlug);
        const payload = await getContentPovBank(clientSlug);
        return jsonResult({ clientSlug, ...payload });
      }),
  );

  server.registerTool(
    "content_get_dispatch_config",
    {
      title: "Get Content Engine dispatch config",
      description: "Reads the Editorial Dispatch transport/channel config from dispatch-channel.yml. Requires content:read.",
      inputSchema: {
        clientSlug: z.string().min(1).describe("Sancho client slug."),
      },
    },
    async ({ clientSlug }) =>
      runTool(context, "content_get_dispatch_config", clientSlug, async () => {
        assertClientScope(context, "content:read", clientSlug);
        return jsonResult({ clientSlug, ...getContentDispatchConfig(clientSlug) });
      }),
  );

  server.registerTool(
    "content_list_carousel_templates",
    {
      title: "List Content Engine carousel templates",
      description: "Lists brand visual-identity carousel templates available to Content Engine. Requires content:read.",
      inputSchema: {
        clientSlug: z.string().min(1).describe("Sancho client slug."),
        channel: z.string().min(1).optional().describe("Optional channel filter, e.g. linkedin."),
        includeDisabled: z
          .boolean()
          .default(false)
          .describe("When true, includes templates disabled by Content Engine config."),
      },
    },
    async ({ clientSlug, channel, includeDisabled }) =>
      runTool(context, "content_list_carousel_templates", clientSlug, async () => {
        assertClientScope(context, "content:read", clientSlug);
        return jsonResult({
          clientSlug,
          filters: pickDefined({ channel, includeDisabled }),
          ...listContentCarouselTemplates(clientSlug, { channel, includeDisabled }),
        });
      }),
  );

  server.registerTool(
    "content_list_crons",
    {
      title: "List Content Engine crons",
      description:
        "Lists OpenClaw cron jobs scoped to Content Engine for one client, including schedule, run metadata and prompt preview. Requires content:read.",
      inputSchema: {
        clientSlug: z.string().min(1).describe("Sancho client slug."),
        status: z.enum(MCP_RECURRING_STATUS_VALUES).optional().describe("Optional active/paused filter."),
        query: z.string().optional().describe("Optional case-insensitive search over name/baseName/prompt."),
        limit: z.number().int().min(1).max(CONTENT_LIMIT_MAX).optional().describe("Maximum crons to return."),
        maxPromptChars: z
          .number()
          .int()
          .min(1)
          .max(RECURRING_PROMPT_MAX_CHARS_MAX)
          .optional()
          .describe("Maximum prompt characters per cron. Defaults to 4000."),
      },
    },
    async ({ clientSlug, status, query, limit, maxPromptChars }) =>
      runTool(context, "content_list_crons", clientSlug, async () => {
        assertClientScope(context, "content:read", clientSlug);
        const max = clampLimit(limit, CONTENT_LIMIT_DEFAULT, CONTENT_LIMIT_MAX);
        const promptMax = clampLimit(
          maxPromptChars,
          RECURRING_PROMPT_MAX_CHARS_DEFAULT,
          RECURRING_PROMPT_MAX_CHARS_MAX,
        );
        const payload = listMcpContentCrons(clientSlug, { status, query, limit: max, maxPromptChars: promptMax });
        return jsonResult({ ...payload, clientSlug, filters: pickDefined({ status, query }), limit: max });
      }),
  );

  server.registerTool(
    "content_get_cron_publish_config",
    {
      title: "Get Content Engine cron publish config",
      description:
        "Reads the publish destination configured for one Content Engine/recurring cron key. Requires content:read.",
      inputSchema: {
        clientSlug: z.string().min(1).describe("Sancho client slug."),
        cronKey: z.string().min(1).describe("Cron key under client-config.json crons.<cronKey>."),
      },
    },
    async ({ clientSlug, cronKey }) =>
      runTool(context, "content_get_cron_publish_config", clientSlug, async () => {
        assertClientScope(context, "content:read", clientSlug);
        assertContentPathSegment("cronKey", cronKey);
        return jsonResult({ ok: true, clientSlug, cronKey, config: getCronPublishConfig(clientSlug, cronKey) });
      }),
  );

  server.registerTool(
    "content_update_cron_publish_config",
    {
      title: "Update Content Engine cron publish config",
      description:
        "Updates the publish destination for one Content Engine/recurring cron key. Requires content:write and explicit confirmation.",
      inputSchema: {
        clientSlug: z.string().min(1).describe("Sancho client slug."),
        cronKey: z.string().min(1).describe("Cron key under client-config.json crons.<cronKey>."),
        transport: z.string().min(1).describe("Registered publish transport, e.g. slack."),
        channelId: z.string().min(1).describe("Transport channel id."),
        channelName: z.string().optional().describe("Optional human-readable channel name."),
        dryRun: z.boolean().default(true).describe("When true, only previews the config update."),
        confirm: z.boolean().default(false).describe("Must be true with dryRun=false to update."),
      },
    },
    async ({ clientSlug, cronKey, transport, channelId, channelName, dryRun, confirm }) =>
      runTool(context, "content_update_cron_publish_config", clientSlug, async () => {
        assertClientScope(context, "content:write", clientSlug);
        assertContentPathSegment("cronKey", cronKey);
        const transports = registeredTransports();
        if (!transports.includes(transport)) {
          throw new McpAuthError(400, `Invalid transport; registered: [${transports.join(", ")}]`);
        }
        const current = getCronPublishConfig(clientSlug, cronKey);
        const next = { transport, channel_id: channelId, channel_name: channelName };
        if (dryRun !== false || confirm !== true) {
          return jsonResult({
            ok: true,
            dryRun: true,
            requiresConfirmation: true,
            message: "Set dryRun=false and confirm=true to update this cron publish config.",
            clientSlug,
            cronKey,
            current,
            preview: next,
          });
        }
        const config = setCronPublishConfig(clientSlug, cronKey, next);
        return jsonResult({ ok: true, clientSlug, cronKey, config });
      }),
  );

  server.registerTool(
    "media_list_image_providers",
    {
      title: "List image generation providers",
      description:
        "Lists configured image-generation providers, brand image config and storage readiness. Requires media:read.",
      inputSchema: {
        clientSlug: z.string().min(1).describe("Sancho client slug."),
      },
    },
    async ({ clientSlug }) =>
      runTool(context, "media_list_image_providers", clientSlug, async () => {
        assertClientScope(context, "media:read", clientSlug);
        return jsonResult({ ok: true, clientSlug, ...listImageGenerationProviders(clientSlug) });
      }),
  );

  server.registerTool(
    "media_list_draft_assets",
    {
      title: "List draft media assets",
      description: "Lists media[] attached to one Content Engine draft. Requires media:read.",
      inputSchema: {
        clientSlug: z.string().min(1).describe("Sancho client slug."),
        ideaId: z.string().min(1).describe("Content Engine idea id."),
        channel: z.enum(PUBLISHING_CHANNELS).describe("Draft channel."),
      },
    },
    async ({ clientSlug, ideaId, channel }) =>
      runTool(context, "media_list_draft_assets", clientSlug, async () => {
        assertClientScope(context, "media:read", clientSlug);
        assertContentPathSegment("ideaId", ideaId);
        return jsonResult({ ok: true, clientSlug, ...listDraftMedia(clientSlug, ideaId, channel) });
      }),
  );

  server.registerTool(
    "media_attach_asset",
    {
      title: "Attach media asset to draft",
      description:
        "Attaches an existing public media URL to a draft's media[] using the canonical MediaAsset schema. Requires media:write. Defaults to dry-run and requires confirm=true to write.",
      inputSchema: {
        clientSlug: z.string().min(1).describe("Sancho client slug."),
        ideaId: z.string().min(1).describe("Content Engine idea id."),
        channel: z.enum(PUBLISHING_CHANNELS).describe("Draft channel."),
        url: z.string().url().describe("Public media URL, usually an R2 URL."),
        type: z.string().min(1).describe("MIME type, e.g. image/png or application/pdf."),
        source: z.enum(["uploaded", "ai-generated"]).default("uploaded").describe("Media source."),
        prompt: z.string().nullable().optional().describe("Optional generation prompt metadata."),
        model: z.string().nullable().optional().describe("Optional generation model metadata."),
        aspectRatio: z.string().nullable().optional().describe("Optional aspect ratio metadata."),
        createdAt: z.string().nullable().optional().describe("Optional ISO creation timestamp; defaults to now."),
        dryRun: z.boolean().default(true).describe("When true, only previews the attachment."),
        confirm: z.boolean().default(false).describe("Must be true with dryRun=false to attach."),
      },
    },
    async ({ clientSlug, ideaId, channel, url, type, source, prompt, model, aspectRatio, createdAt, dryRun, confirm }) =>
      runTool(context, "media_attach_asset", clientSlug, async () => {
        assertClientScope(context, "media:write", clientSlug);
        assertContentPathSegment("ideaId", ideaId);
        const input = { url, type, source, prompt, model, aspectRatio, createdAt };
        const preview = previewAttachDraftMedia(clientSlug, ideaId, channel, input);
        if (dryRun !== false || confirm !== true) {
          return jsonResult({
            ok: true,
            dryRun: true,
            requiresConfirmation: true,
            message: "Set dryRun=false and confirm=true to attach this media asset.",
            preview,
          });
        }
        const result = attachDraftMedia(clientSlug, ideaId, channel, input);
        return jsonResult({ ok: true, clientSlug, ...result });
      }),
  );

  server.registerTool(
    "media_remove_asset",
    {
      title: "Remove media asset from draft",
      description:
        "Removes one media[] entry from a draft by URL. Does not delete the remote file. Requires media:write. Defaults to dry-run and requires confirm=true to write.",
      inputSchema: {
        clientSlug: z.string().min(1).describe("Sancho client slug."),
        ideaId: z.string().min(1).describe("Content Engine idea id."),
        channel: z.enum(PUBLISHING_CHANNELS).describe("Draft channel."),
        url: z.string().url().describe("Media URL to remove."),
        dryRun: z.boolean().default(true).describe("When true, only previews the removal."),
        confirm: z.boolean().default(false).describe("Must be true with dryRun=false to remove."),
      },
    },
    async ({ clientSlug, ideaId, channel, url, dryRun, confirm }) =>
      runTool(context, "media_remove_asset", clientSlug, async () => {
        assertClientScope(context, "media:write", clientSlug);
        assertContentPathSegment("ideaId", ideaId);
        const preview = previewRemoveDraftMedia(clientSlug, ideaId, channel, url);
        if (dryRun !== false || confirm !== true) {
          return jsonResult({
            ok: true,
            dryRun: true,
            requiresConfirmation: true,
            message: "Set dryRun=false and confirm=true to remove this media asset.",
            preview,
          });
        }
        const result = removeDraftMedia(clientSlug, ideaId, channel, url);
        return jsonResult({ ok: true, clientSlug, ...result });
      }),
  );

  server.registerTool(
    "media_set_primary_asset",
    {
      title: "Set primary draft media asset",
      description:
        "Moves one media[] entry to index 0 so it becomes the primary preview asset. Requires media:write. Defaults to dry-run and requires confirm=true to write.",
      inputSchema: {
        clientSlug: z.string().min(1).describe("Sancho client slug."),
        ideaId: z.string().min(1).describe("Content Engine idea id."),
        channel: z.enum(PUBLISHING_CHANNELS).describe("Draft channel."),
        url: z.string().url().describe("Media URL to promote."),
        dryRun: z.boolean().default(true).describe("When true, only previews the reorder."),
        confirm: z.boolean().default(false).describe("Must be true with dryRun=false to reorder."),
      },
    },
    async ({ clientSlug, ideaId, channel, url, dryRun, confirm }) =>
      runTool(context, "media_set_primary_asset", clientSlug, async () => {
        assertClientScope(context, "media:write", clientSlug);
        assertContentPathSegment("ideaId", ideaId);
        const preview = previewSetPrimaryDraftMedia(clientSlug, ideaId, channel, url);
        if (dryRun !== false || confirm !== true) {
          return jsonResult({
            ok: true,
            dryRun: true,
            requiresConfirmation: true,
            message: "Set dryRun=false and confirm=true to set this asset as primary.",
            preview,
          });
        }
        const result = setPrimaryDraftMedia(clientSlug, ideaId, channel, url);
        return jsonResult({ ok: true, clientSlug, ...result });
      }),
  );

  server.registerTool(
    "media_generate_image",
    {
      title: "Generate draft image",
      description:
        "Generates an image via the configured image provider, uploads it to R2 and attaches it to the draft. Requires media:write. Defaults to dry-run and requires confirm=true to spend provider credits.",
      inputSchema: {
        clientSlug: z.string().min(1).describe("Sancho client slug."),
        ideaId: z.string().min(1).describe("Content Engine idea id."),
        channel: z.enum(PUBLISHING_CHANNELS).describe("Draft channel."),
        prompt: z.string().min(1).describe("Image generation prompt."),
        aspectRatio: z.string().optional().describe("Optional aspect ratio; unsupported values fall back to provider default."),
        providerId: z.string().optional().describe("Optional image provider id. Defaults to brand config or first configured provider."),
        model: z.string().optional().describe("Optional provider model id."),
        dryRun: z.boolean().default(true).describe("When true, only previews provider/model/storage resolution."),
        confirm: z.boolean().default(false).describe("Must be true with dryRun=false to generate and attach."),
      },
    },
    async ({ clientSlug, ideaId, channel, prompt, aspectRatio, providerId, model, dryRun, confirm }) =>
      runTool(context, "media_generate_image", clientSlug, async () => {
        assertClientScope(context, "media:write", clientSlug);
        assertContentPathSegment("ideaId", ideaId);
        const input = { slug: clientSlug, ideaId, channel, prompt, aspectRatio, providerId, model };
        const preview = previewGenerateDraftImage(input);
        if (dryRun !== false || confirm !== true) {
          return jsonResult({
            ok: true,
            dryRun: true,
            requiresConfirmation: true,
            message: "Set dryRun=false and confirm=true to generate this image, upload it and attach it to the draft.",
            preview,
          });
        }
        const result = await generateDraftImage(input);
        return jsonResult({ clientSlug, ...result });
      }),
  );

  server.registerTool(
    "publishing_list_providers",
    {
      title: "List publishing providers",
      description: "Lists publishing providers and configuration status for a client. Requires publishing:read.",
      inputSchema: {
        clientSlug: z.string().min(1).describe("Sancho client slug."),
        channel: z.string().min(1).optional().describe("Optional channel filter, e.g. linkedin, blog or twitter."),
      },
    },
    async ({ clientSlug, channel }) =>
      runTool(context, "publishing_list_providers", clientSlug, async () => {
        assertClientScope(context, "publishing:read", clientSlug);
        const providers = getAvailableProviders(clientSlug, channel as Parameters<typeof getAvailableProviders>[1]);
        return jsonResult({ ok: true, clientSlug, channel: channel || null, providers, count: providers.length });
      }),
  );

  server.registerTool(
    "publishing_get_account_info",
    {
      title: "Get publishing account info",
      description: "Reads connected publishing account/network info where available. Requires publishing:read.",
      inputSchema: {
        clientSlug: z.string().min(1).describe("Sancho client slug."),
        provider: z.enum(["metricool"]).default("metricool").describe("Publishing provider. Currently metricool."),
      },
    },
    async ({ clientSlug, provider }) =>
      runTool(context, "publishing_get_account_info", clientSlug, async () => {
        assertClientScope(context, "publishing:read", clientSlug);
        if (provider !== "metricool") throw new McpAuthError(400, `Unsupported publishing provider: ${provider}`);
        const result = await fetchAccountInfo(clientSlug);
        if (!result.ok) return jsonResult({ ok: false, clientSlug, provider, error: result.error });
        return jsonResult({ ok: true, clientSlug, provider, info: result.info });
      }),
  );

  server.registerTool(
    "publishing_get_post_metrics",
    {
      title: "Get publishing post metrics",
      description: "Reads the latest stored metrics snapshot for a published post URL. Requires publishing:read.",
      inputSchema: {
        clientSlug: z.string().min(1).describe("Sancho client slug."),
        externalUrl: z.string().url().describe("Published post URL to look up in stored metrics snapshots."),
      },
    },
    async ({ clientSlug, externalUrl }) =>
      runTool(context, "publishing_get_post_metrics", clientSlug, async () => {
        assertClientScope(context, "publishing:read", clientSlug);
        const result = await getPublishingPostMetrics(clientSlug, externalUrl);
        return jsonResult({ ok: true, clientSlug, externalUrl, ...result });
      }),
  );

  server.registerTool(
    "publishing_publish_draft",
    {
      title: "Publish or schedule a draft",
      description:
        "Publishes now or schedules one approved Content Engine draft through a configured provider. Requires publishing:write. Defaults to dry-run and requires confirm=true to execute.",
      inputSchema: {
        clientSlug: z.string().min(1).describe("Sancho client slug."),
        ideaId: z.string().min(1).describe("Content Engine idea id."),
        channel: z.enum(PUBLISHING_CHANNELS).describe("Draft channel to publish."),
        providerId: z.string().min(1).describe("Publishing provider id, e.g. metricool, wordpress or alarife-payload."),
        publishAt: z
          .string()
          .min(1)
          .optional()
          .describe("Optional ISO timestamp to schedule. Omit to publish now."),
        dryRun: z.boolean().default(true).describe("When true, only previews the publish operation."),
        confirm: z.boolean().default(false).describe("Must be true with dryRun=false to publish/schedule."),
      },
    },
    async ({ clientSlug, ideaId, channel, providerId, publishAt, dryRun, confirm }) =>
      runTool(context, "publishing_publish_draft", clientSlug, async () => {
        assertClientScope(context, "publishing:write", clientSlug);
        assertContentPathSegment("ideaId", ideaId);
        const input = {
          slug: clientSlug,
          ideaId,
          channel: channel as Channel,
          providerId,
          schedule: publishAt ? { publishAt } : undefined,
        };
        const preview = previewPublishDraft(input);
        if (dryRun !== false || confirm !== true) {
          return jsonResult({
            ok: true,
            dryRun: true,
            requiresConfirmation: true,
            message: "Set dryRun=false and confirm=true to publish or schedule this draft.",
            preview,
          });
        }
        const result = await publishDraft(input);
        return jsonResult({ clientSlug, ...result });
      }),
  );

  server.registerTool(
    "publishing_cancel_post",
    {
      title: "Cancel scheduled publishing post",
      description:
        "Cancels one scheduled draft in the provider when possible and marks the local draft as canceled. Requires publishing:write. Defaults to dry-run and requires confirm=true to execute.",
      inputSchema: {
        clientSlug: z.string().min(1).describe("Sancho client slug."),
        ideaId: z.string().min(1).describe("Content Engine idea id."),
        channel: z.enum(PUBLISHING_CHANNELS).describe("Draft channel to cancel."),
        dryRun: z.boolean().default(true).describe("When true, only previews the cancel operation."),
        confirm: z.boolean().default(false).describe("Must be true with dryRun=false to cancel."),
      },
    },
    async ({ clientSlug, ideaId, channel, dryRun, confirm }) =>
      runTool(context, "publishing_cancel_post", clientSlug, async () => {
        assertClientScope(context, "publishing:write", clientSlug);
        assertContentPathSegment("ideaId", ideaId);
        const preview = previewCancelScheduledPost(clientSlug, ideaId, channel);
        if (dryRun !== false || confirm !== true) {
          return jsonResult({
            ok: true,
            dryRun: true,
            requiresConfirmation: true,
            message: "Set dryRun=false and confirm=true to cancel this scheduled post.",
            preview,
          });
        }
        const result = await cancelScheduledPost(clientSlug, ideaId, channel);
        return jsonResult({ clientSlug, ...result });
      }),
  );

  server.registerTool(
    "publishing_get_status",
    {
      title: "Get publishing status",
      description:
        "Reads one draft's stored publishing status. Optional refresh polls the provider and may update local state; refresh requires publishing:write.",
      inputSchema: {
        clientSlug: z.string().min(1).describe("Sancho client slug."),
        ideaId: z.string().min(1).describe("Content Engine idea id."),
        channel: z.enum(PUBLISHING_CHANNELS).describe("Draft channel."),
        refresh: z.boolean().default(false).describe("When true, poll provider and persist any changed status."),
      },
    },
    async ({ clientSlug, ideaId, channel, refresh }) =>
      runTool(context, "publishing_get_status", clientSlug, async () => {
        assertClientScope(context, "publishing:read", clientSlug);
        assertContentPathSegment("ideaId", ideaId);
        if (refresh) {
          assertClientScope(context, "publishing:write", clientSlug);
          const result = await refreshPublishingStatus(clientSlug, ideaId, channel);
          if (!result.draft) throw new McpAuthError(404, `Content draft not found: ${ideaId}/${channel}`);
          return jsonResult({ ok: true, clientSlug, ideaId, channel, refreshed: true, ...result });
        }
        const result = getStoredPublishingStatus(clientSlug, ideaId, channel);
        if (!result.draft) throw new McpAuthError(404, `Content draft not found: ${ideaId}/${channel}`);
        return jsonResult({ ok: true, clientSlug, ideaId, channel, refreshed: false, publishing: result.publishing });
      }),
  );

  server.registerTool(
    "publishing_reconcile",
    {
      title: "Reconcile scheduled publishing posts",
      description:
        "Reconciles due scheduled posts for one client, refreshing local publishing state and metrics. Requires publishing:write. Defaults to dry-run and requires confirm=true to execute.",
      inputSchema: {
        clientSlug: z.string().min(1).describe("Sancho client slug."),
        limit: z.number().int().min(1).max(CONTENT_LIMIT_MAX).optional().describe("Max due drafts to include in dry-run preview."),
        dryRun: z.boolean().default(true).describe("When true, only previews due scheduled posts."),
        confirm: z.boolean().default(false).describe("Must be true with dryRun=false to reconcile."),
      },
    },
    async ({ clientSlug, limit, dryRun, confirm }) =>
      runTool(context, "publishing_reconcile", clientSlug, async () => {
        assertClientScope(context, "publishing:write", clientSlug);
        const max = clampLimit(limit, CONTENT_LIMIT_DEFAULT, CONTENT_LIMIT_MAX);
        const preview = previewPublishingReconciliation(clientSlug, max);
        if (dryRun !== false || confirm !== true) {
          return jsonResult({
            ok: true,
            dryRun: true,
            requiresConfirmation: true,
            message: "Set dryRun=false and confirm=true to reconcile due scheduled posts for this client.",
            preview,
          });
        }
        const result = await reconcilePublishing(clientSlug);
        return jsonResult({ ok: true, clientSlug, ...result });
      }),
  );

  server.registerTool(
    "integrations_list_catalog",
    {
      title: "List integrations catalog",
      description: "Reads the available integrations catalog without returning secrets. Requires integrations:read.",
      inputSchema: {},
    },
    async () =>
      runTool(context, "integrations_list_catalog", undefined, async () => {
        assertMcpScope(context.principal, "integrations:read");
        const catalog = loadIntegrationCatalog();
        return jsonResult({ ok: catalog.found, found: catalog.found, catalog: catalog.catalog });
      }),
  );

  server.registerTool(
    "integrations_get_status",
    {
      title: "Get integrations status",
      description:
        "Reads sanitized integration status for a client without returning secret/config values. Requires integrations:read.",
      inputSchema: {
        clientSlug: z.string().min(1).describe("Sancho client slug."),
      },
    },
    async ({ clientSlug }) =>
      runTool(context, "integrations_get_status", clientSlug, async () => {
        assertClientScope(context, "integrations:read", clientSlug);
        return jsonResult({ ok: true, clientSlug, integrations: getSanitizedIntegrationStatus(clientSlug) });
      }),
  );

  server.registerTool(
    "integrations_test_connection",
    {
      title: "Test integration connection",
      description:
        "Runs Sancho's integration connection test for one source or all configured sources. Requires integrations:write and explicit confirmation.",
      inputSchema: {
        clientSlug: z.string().min(1).describe("Sancho client slug."),
        source: z.string().min(1).optional().describe("Integration source id to test."),
        all: z.boolean().default(false).describe("Test all configured sources for the client."),
        dryRun: z.boolean().default(true).describe("Preview without running the connection test."),
        confirm: z.boolean().default(false).describe("Must be true with dryRun=false to execute."),
      },
    },
    async ({ clientSlug, source, all = false, dryRun = true, confirm = false }) =>
      runTool(context, "integrations_test_connection", clientSlug, async () => {
        assertClientScope(context, "integrations:write", clientSlug);
        const preview = previewTestIntegrationConnection({ clientSlug, source, all });
        if (dryRun || !confirm) {
          return jsonResult({
            ok: true,
            dryRun: true,
            requiresConfirmation: true,
            message: "Set dryRun=false and confirm=true to run integration connection tests.",
            preview,
          });
        }
        const result = testIntegrationConnection({ clientSlug, source, all });
        return jsonResult(result);
      }),
  );

  server.registerTool(
    "integrations_publish_message",
    {
      title: "Publish integration message",
      description:
        "Publishes one generic integration message through a configured transport or cron publish target. Requires integrations:write and explicit confirmation.",
      inputSchema: {
        clientSlug: z.string().min(1).describe("Sancho client slug."),
        cronKey: z.string().min(1).optional().describe("Cron key whose publish target should be used."),
        transport: z.string().min(1).optional().describe("Explicit transport, for example slack."),
        channel: z.string().min(1).optional().describe("Explicit target channel id/name."),
        title: z.string().min(1).max(2000).describe("Root message title."),
        body: z.string().min(1).max(20_000).describe("Message body/thread content."),
        dryRun: z.boolean().default(true).describe("Preview without sending a message."),
        confirm: z.boolean().default(false).describe("Must be true with dryRun=false to publish."),
      },
    },
    async ({ clientSlug, cronKey, transport, channel, title, body, dryRun = true, confirm = false }) =>
      runTool(context, "integrations_publish_message", clientSlug, async () => {
        assertClientScope(context, "integrations:write", clientSlug);
        const preview = previewPublishIntegrationMessage({ clientSlug, cronKey, transport, channel, title, body });
        if (dryRun || !confirm) {
          return jsonResult({
            ok: true,
            dryRun: true,
            requiresConfirmation: true,
            message: "Set dryRun=false and confirm=true to publish this integration message.",
            preview,
          });
        }
        const result = await publishIntegrationMessage({ clientSlug, cronKey, transport, channel, title, body });
        return jsonResult({ ...result, ok: result.ok, clientSlug });
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
    "yalc_get_campaign",
    {
      title: "Get YALC campaign",
      description: "Reads one YALC campaign detail by id for a Sancho client. Requires yalc:read.",
      inputSchema: {
        clientSlug: z.string().min(1).describe("Sancho client slug."),
        campaignId: z.string().min(1).describe("YALC campaign id."),
      },
    },
    async ({ clientSlug, campaignId }) =>
      runTool(context, "yalc_get_campaign", clientSlug, async () => {
        assertClientScope(context, "yalc:read", clientSlug);
        const data = await yalcFetch(
          resolveYalcConfig(clientSlug),
          `/api/campaigns/${encodeURIComponent(campaignId)}`,
          { headers: traceHeaders(context) },
        );
        return jsonResult(data);
      }),
  );

  server.registerTool(
    "yalc_get_campaign_events",
    {
      title: "Get YALC campaign events",
      description: "Reads the event stream/history for one YALC campaign. Requires yalc:read.",
      inputSchema: {
        clientSlug: z.string().min(1).describe("Sancho client slug."),
        campaignId: z.string().min(1).describe("YALC campaign id."),
      },
    },
    async ({ clientSlug, campaignId }) =>
      runTool(context, "yalc_get_campaign_events", clientSlug, async () => {
        assertClientScope(context, "yalc:read", clientSlug);
        const data = await yalcFetch(
          resolveYalcConfig(clientSlug),
          `/api/campaigns/${encodeURIComponent(campaignId)}/events`,
          { headers: traceHeaders(context) },
        );
        return jsonResult(data);
      }),
  );

  server.registerTool(
    "yalc_get_campaign_readiness",
    {
      title: "Get YALC campaign readiness",
      description: "Reads readiness checks for one YALC campaign before publish/live operations. Requires yalc:read.",
      inputSchema: {
        clientSlug: z.string().min(1).describe("Sancho client slug."),
        campaignId: z.string().min(1).describe("YALC campaign id."),
      },
    },
    async ({ clientSlug, campaignId }) =>
      runTool(context, "yalc_get_campaign_readiness", clientSlug, async () => {
        assertClientScope(context, "yalc:read", clientSlug);
        const data = await yalcFetch(
          resolveYalcConfig(clientSlug),
          `/api/campaigns/${encodeURIComponent(campaignId)}/readiness`,
          { headers: traceHeaders(context) },
        );
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
    "yalc_get_lead",
    {
      title: "Get YALC lead",
      description: "Reads one YALC campaign lead by id. Requires yalc:read.",
      inputSchema: {
        clientSlug: z.string().min(1).describe("Sancho client slug."),
        campaignId: z.string().min(1).describe("YALC campaign id that owns the lead."),
        leadId: z.string().min(1).describe("YALC lead id."),
      },
    },
    async ({ clientSlug, campaignId, leadId }) =>
      runTool(context, "yalc_get_lead", clientSlug, async () => {
        assertClientScope(context, "yalc:read", clientSlug);
        const data = await yalcFetch(
          resolveYalcConfig(clientSlug),
          `/api/campaigns/${encodeURIComponent(campaignId)}/leads/${encodeURIComponent(leadId)}`,
          { headers: traceHeaders(context) },
        );
        return jsonResult(data);
      }),
  );

  server.registerTool(
    "yalc_list_lead_messages",
    {
      title: "List YALC lead messages",
      description: "Reads the Inbox conversation/messages for one YALC lead. Requires yalc:read.",
      inputSchema: {
        clientSlug: z.string().min(1).describe("Sancho client slug."),
        leadId: z.string().min(1).describe("YALC lead id."),
      },
    },
    async ({ clientSlug, leadId }) =>
      runTool(context, "yalc_list_lead_messages", clientSlug, async () => {
        assertClientScope(context, "yalc:read", clientSlug);
        const data = await yalcFetch(
          resolveYalcConfig(clientSlug),
          `/api/leads/${encodeURIComponent(leadId)}/messages`,
          { headers: traceHeaders(context) },
        );
        return jsonResult(data);
      }),
  );

  const linkedinAutopilotAccountSchema = z.object({
    accountId: z.string().min(1).optional(),
    account_id: z.string().min(1).optional(),
    id: z.string().min(1).optional(),
    label: z.string().min(1).optional(),
    name: z.string().min(1).optional(),
    dailyLimit: z.number().int().min(1).optional(),
    daily_limit: z.number().int().min(1).optional(),
  });

  const linkedinAutopilotSharedSchema = {
    clientSlug: z.string().min(1).describe("Sancho client slug."),
    campaignId: z.string().min(1).describe("YALC B2B campaign id."),
    leadIds: z.array(z.string().min(1)).optional().describe("Optional explicit lead ids to include in this autopilot batch."),
    limit: z.number().int().min(1).optional().describe("Optional max number of leads to include when leadIds is omitted."),
    accounts: z
      .array(linkedinAutopilotAccountSchema)
      .optional()
      .describe("Optional Unipile LinkedIn accounts with accountId/id and dailyLimit."),
    directMessageLeadIds: z
      .array(z.string().min(1))
      .optional()
      .describe("Lead ids that should receive a direct DM because they are already connected."),
    connectionLeadIds: z
      .array(z.string().min(1))
      .optional()
      .describe("Lead ids that should receive a LinkedIn connection request."),
    connectMessage: z.string().min(1).optional().describe("Optional override for connection request copy."),
    dmMessage: z.string().min(1).optional().describe("Optional override for direct DM copy."),
  };

  server.registerTool(
    "yalc_linkedin_autopilot_plan",
    {
      title: "Plan YALC LinkedIn autopilot",
      description:
        "Builds the same B2B LinkedIn autopilot plan used by the Sancho UI before sending. It does not contact leads. Requires yalc:read.",
      inputSchema: linkedinAutopilotSharedSchema,
    },
    async ({
      clientSlug,
      campaignId,
      leadIds,
      limit,
      accounts,
      directMessageLeadIds,
      connectionLeadIds,
      connectMessage,
      dmMessage,
    }) =>
      runTool(context, "yalc_linkedin_autopilot_plan", clientSlug, async () => {
        assertClientScope(context, "yalc:read", clientSlug);
        const result = await dispatchOutboundCommand(resolveYalcConfig(clientSlug), {
          command: "outbound.linkedin_autopilot.plan",
          campaignId,
          leadIds,
          limit,
          accounts,
          directMessageLeadIds,
          connectionLeadIds,
          connectMessage,
          dmMessage,
          source: "sancho.mcp",
        });
        return jsonResult(result);
      }),
  );

  server.registerTool(
    "yalc_linkedin_autopilot_execute",
    {
      title: "Execute YALC LinkedIn autopilot",
      description:
        "Executes the same B2B LinkedIn autopilot send path used by the Sancho UI. Defaults to dry-run. Live execution requires dryRun=false and confirm=true. Requires yalc:write.",
      inputSchema: {
        ...linkedinAutopilotSharedSchema,
        dryRun: z.boolean().default(true).describe("When true, returns the execution plan without contacting leads."),
        confirm: z.boolean().default(false).describe("Must be true with dryRun=false to send via Unipile."),
      },
    },
    async ({
      clientSlug,
      campaignId,
      leadIds,
      limit,
      accounts,
      directMessageLeadIds,
      connectionLeadIds,
      connectMessage,
      dmMessage,
      dryRun = true,
      confirm = false,
    }) =>
      runTool(context, "yalc_linkedin_autopilot_execute", clientSlug, async () => {
        assertClientScope(context, "yalc:write", clientSlug);
        const liveConfirmed = dryRun === false && confirm === true;
        const result = await dispatchOutboundCommand(resolveYalcConfig(clientSlug), {
          command: "outbound.linkedin_autopilot.execute",
          campaignId,
          leadIds,
          limit,
          accounts,
          directMessageLeadIds,
          connectionLeadIds,
          connectMessage,
          dmMessage,
          dryRun: liveConfirmed ? false : true,
          confirm: liveConfirmed,
          confirmLinkedInSend: liveConfirmed,
          source: "sancho.mcp",
        });
        return jsonResult({
          ...result,
          dryRun: !liveConfirmed,
          requiresConfirmation: !liveConfirmed,
          message: liveConfirmed
            ? result.message
            : "Set dryRun=false and confirm=true to execute LinkedIn autopilot via Unipile.",
        });
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
        "Creates a creator discovery search (Partnerships · SAN-79): a Partnerships campaign in YALC, a mother Outreach task in Sancho, and a queued discovery runner. Instagram-only plans run server-side; plans with TikTok or YouTube are dispatched to Rocinante's agentic runner. Same action as the discovery-plan-builder chat skill and the Encuentra UI. Optionally executes the runner inline with the 9 mockup fixture creators (no ScrapeCreators). Requires yalc:write. Defaults to dry-run and requires confirm=true to write.",
      inputSchema: {
        clientSlug: z.string().min(1).describe("Sancho client slug."),
        title: z.string().min(1).describe("Search title, e.g. 'Finanzas personales ES · IG+TikTok'."),
        sectors: z.array(z.string().min(1)).min(1).describe("Target sectors/verticals (e.g. 'finanzas personales', 'ahorro')."),
        hashtags: z
          .array(z.string().min(1))
          .optional()
          .describe("Niche-specific discovery hashtags (e.g. '#trasplantecapilar', '#saludcapilar')."),
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
        commandId: z
          .string()
          .min(1)
          .max(200)
          .optional()
          .describe("Stable caller command id. Retry the same command with the same id to reuse its search."),
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
      hashtags,
      networks,
      tiers,
      audienceEsMinPct,
      targetVolume,
      competitorBrands,
      templates,
      qualificationMode,
      disqualifyThreshold,
      notes,
      commandId,
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
            hashtags,
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

        if (!commandId) {
          throw new McpAuthError(
            400,
            "commandId is required when creating a search; reuse it only when retrying the same confirmed action",
          );
        }

        const created = await createDiscoverySearch({
          slug: clientSlug,
          plan,
          commandId,
          executionIntent: runFixtures === true ? "fixtures" : "auto",
        });
        if (created.replayed) {
          return jsonResult({
            ok: true,
            replayed: true,
            search: created.search,
            campaignId: created.campaignId,
            taskId: created.taskId,
            runner: created.search.runner,
            message: "This command was already created; returning its current state without running it again.",
          });
        }
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
        if (supportsLiveDiscovery(created.search.plan)) {
          const search = enqueueDiscoverySearchRun({
            slug: clientSlug,
            searchId: created.search.id,
          });
          await observeDiscoveryExecutionEvent(search, "execution.enqueued", {
            route: "mcp_server_live",
            runnerMode: search.runner.mode,
            jobId: search.runner.jobId,
          });
          return jsonResult({
            ok: true,
            search,
            campaignId: created.campaignId,
            taskId: created.taskId,
            runner: {
              async: true,
              mode: "live",
              jobId: search.runner.jobId,
              status: search.runner.status,
            },
            message:
              "Search queued. Sancho is running server-side Instagram discovery with ScrapeCreators in the background. Poll GET /api/partnerships/searches for status.",
          });
        }

        const dispatch = await triggerDiscoveryRunner({
          slug: clientSlug,
          searchId: created.search.id,
          title: created.search.title,
        });
        const search = updateRunnerState(clientSlug, created.search.id, {
          status: dispatch.forwardedToGateway ? "queued" : "error",
          attempts: Math.max(0, created.search.runner.attempts ?? 0) + 1,
          error:
            dispatch.error ||
            (dispatch.forwardedToGateway
              ? null
              : "No se pudo avisar a Rocinante. Reintenta el discovery desde Encuentra."),
        });
        await observeDiscoveryExecutionDispatch(search, {
          route: "mcp_agent_legacy",
          forwarded: dispatch.forwardedToGateway,
          error: dispatch.error,
        });
        return jsonResult({
          ok: dispatch.forwardedToGateway,
          search,
          campaignId: created.campaignId,
          taskId: created.taskId,
          runner: {
            mode: "agent",
            dispatched: dispatch.forwardedToGateway,
            threadId: dispatch.threadId,
            error: dispatch.error,
          },
          message: dispatch.forwardedToGateway
            ? "Search queued. Rocinante is running TikTok/YouTube discovery with ScrapeCreators. Poll GET /api/partnerships/searches for status."
            : "Search created, but Rocinante could not be reached. Retry it from Encuentra.",
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
        const preflight = await preflightPartnerContactGate(config, runId, edits);
        const preflightError = partnerContactPreflightError(preflight);
        if (preflightError) return errorResult(preflightError);
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
    "open_design_resolve_project",
    {
      title: "Resolve existing Open Design project",
      description:
        "Finds an existing Open Design project for a client brand folder and optional scope without importing or creating projects. Requires open-design:read.",
      inputSchema: {
        clientSlug: z.string().min(1).describe("Sancho client slug."),
        scope: z.string().optional().describe("Optional brand-relative folder scope, e.g. 'content/assets'."),
      },
    },
    async ({ clientSlug, scope }) =>
      runTool(context, "open_design_resolve_project", clientSlug, async () => {
        assertClientScope(context, "open-design:read", clientSlug);
        const resolution = await resolveExistingOpenDesignProject(clientSlug, scope, odConfig(context));
        return jsonResult(resolution);
      }),
  );

  server.registerTool(
    "open_design_import_project",
    {
      title: "Import Open Design project",
      description:
        "Ensures a brand folder/scope is registered as an Open Design project and persists the project mapping. Requires open-design:write and explicit confirmation.",
      inputSchema: {
        clientSlug: z.string().min(1).describe("Sancho client slug."),
        scope: z.string().optional().describe("Optional brand-relative folder scope, e.g. 'content/assets'."),
        applyDesignSystem: z
          .boolean()
          .default(true)
          .describe("Best-effort set the project designSystemId to the client slug."),
        dryRun: z.boolean().default(true).describe("Preview without importing or writing mapping."),
        confirm: z.boolean().default(false).describe("Must be true with dryRun=false to import/persist."),
      },
    },
    async ({ clientSlug, scope, applyDesignSystem = true, dryRun = true, confirm = false }) =>
      runTool(context, "open_design_import_project", clientSlug, async () => {
        assertClientScope(context, "open-design:write", clientSlug);
        const preview = await previewOpenDesignProjectImport(clientSlug, scope, { applyDesignSystem });
        if (dryRun || !confirm) {
          return jsonResult({
            ok: true,
            dryRun: true,
            requiresConfirmation: true,
            message: "Set dryRun=false and confirm=true to import/register this Open Design project.",
            preview,
          });
        }
        const result = await ensureOpenDesignProject(clientSlug, scope, {
          applyDesignSystem,
          config: odConfig(context),
        });
        return jsonResult(result);
      }),
  );

  server.registerTool(
    "open_design_update_project",
    {
      title: "Update Open Design project",
      description:
        "Updates curated Open Design project metadata (name, skillId, designSystemId). Requires open-design:write and explicit confirmation.",
      inputSchema: {
        clientSlug: z.string().min(1).describe("Sancho client slug."),
        projectId: z.string().min(1).describe("Open Design project id."),
        name: z.string().min(1).max(200).optional().describe("Optional project display name."),
        skillId: z.string().min(1).optional().describe("Optional OD skill id to set."),
        designSystemId: z.string().min(1).optional().describe("Optional OD design system id to set."),
        clearSkill: z.boolean().default(false).describe("Set skillId to null."),
        clearDesignSystem: z.boolean().default(false).describe("Set designSystemId to null."),
        dryRun: z.boolean().default(true).describe("Preview without patching the OD project."),
        confirm: z.boolean().default(false).describe("Must be true with dryRun=false to patch."),
      },
    },
    async ({
      clientSlug,
      projectId,
      name,
      skillId,
      designSystemId,
      clearSkill = false,
      clearDesignSystem = false,
      dryRun = true,
      confirm = false,
    }) =>
      runTool(context, "open_design_update_project", clientSlug, async () => {
        assertClientScope(context, "open-design:write", clientSlug);
        const patch = buildOpenDesignProjectPatch({
          name,
          skillId,
          designSystemId,
          clearSkill,
          clearDesignSystem,
        });
        const preview = { clientSlug, projectId, patch };
        if (dryRun || !confirm) {
          return jsonResult({
            ok: true,
            dryRun: true,
            requiresConfirmation: true,
            message: "Set dryRun=false and confirm=true to update this Open Design project.",
            preview,
          });
        }
        const project = await odPatchProject(projectId, patch, odConfig(context));
        return jsonResult({ ok: true, clientSlug, projectId, project });
      }),
  );

  server.registerTool(
    "open_design_export_artifact",
    {
      title: "Export Open Design artifact",
      description:
        "Exports one Open Design artifact through the OD daemon. Requires open-design:write and explicit confirmation.",
      inputSchema: {
        clientSlug: z.string().min(1).describe("Sancho client slug."),
        artifactId: z.string().min(1).describe("Open Design artifact id."),
        format: z.enum(OD_EXPORT_FORMAT_VALUES).describe("Export format."),
        destination: z.string().min(1).optional().describe("Optional daemon-side destination path."),
        dryRun: z.boolean().default(true).describe("Preview without exporting."),
        confirm: z.boolean().default(false).describe("Must be true with dryRun=false to export."),
      },
    },
    async ({ clientSlug, artifactId, format, destination, dryRun = true, confirm = false }) =>
      runTool(context, "open_design_export_artifact", clientSlug, async () => {
        assertClientScope(context, "open-design:write", clientSlug);
        const request = pickDefined({ artifactId, format, destination }) as {
          artifactId: string;
          format: (typeof OD_EXPORT_FORMAT_VALUES)[number];
          destination?: string;
        };
        if (dryRun || !confirm) {
          return jsonResult({
            ok: true,
            dryRun: true,
            requiresConfirmation: true,
            message: "Set dryRun=false and confirm=true to export this Open Design artifact.",
            preview: { clientSlug, request },
          });
        }
        const result = await odExport(request, odConfig(context));
        return jsonResult({ ...result, ok: result.ok, clientSlug, artifactId, format, destination: destination ?? null });
      }),
  );

  server.registerTool(
    "open_design_list_project_files",
    {
      title: "List Open Design project files",
      description: "Lists files for an existing Open Design project. Requires open-design:read.",
      inputSchema: {
        clientSlug: z.string().min(1).describe("Sancho client slug."),
        projectId: z.string().min(1).describe("Open Design project id."),
        limit: z
          .number()
          .int()
          .min(1)
          .max(OD_PROJECT_FILE_LIMIT_MAX)
          .optional()
          .describe("Maximum files to return."),
      },
    },
    async ({ clientSlug, projectId, limit }) =>
      runTool(context, "open_design_list_project_files", clientSlug, async () => {
        assertClientScope(context, "open-design:read", clientSlug);
        const max = clampLimit(limit, OD_PROJECT_FILE_LIMIT_DEFAULT, OD_PROJECT_FILE_LIMIT_MAX);
        const files = await odListProjectFiles(projectId, odConfig(context));
        return jsonResult({
          ok: true,
          clientSlug,
          projectId,
          files: files.slice(0, max),
          count: Math.min(files.length, max),
          totalFiles: files.length,
          limit: max,
        });
      }),
  );

  server.registerTool(
    "open_design_get_project_file",
    {
      title: "Get Open Design project file",
      description:
        "Reads a UTF-8 text file from an existing Open Design project by project-relative path. Requires open-design:read.",
      inputSchema: {
        clientSlug: z.string().min(1).describe("Sancho client slug."),
        projectId: z.string().min(1).describe("Open Design project id."),
        filePath: z.string().min(1).describe("Project-relative file path."),
        maxChars: z
          .number()
          .int()
          .min(1)
          .max(OD_PROJECT_FILE_MAX_CHARS_MAX)
          .optional()
          .describe("Maximum characters to return."),
      },
    },
    async ({ clientSlug, projectId, filePath, maxChars }) =>
      runTool(context, "open_design_get_project_file", clientSlug, async () => {
        assertClientScope(context, "open-design:read", clientSlug);
        const safePath = assertRelativeProjectPath(filePath);
        const max = clampLimit(maxChars, OD_PROJECT_FILE_MAX_CHARS_DEFAULT, OD_PROJECT_FILE_MAX_CHARS_MAX);
        const content = await odReadProjectFile(projectId, safePath, odConfig(context));
        if (content == null) throw new McpAuthError(404, `Open Design project file not found: ${safePath}`);
        const truncated = content.length > max;
        return jsonResult({
          ok: true,
          clientSlug,
          projectId,
          filePath: safePath,
          size: content.length,
          maxChars: max,
          content: truncated ? content.slice(0, max) : content,
          truncated,
        });
      }),
  );

  server.registerTool(
    "open_design_list_artifacts",
    {
      title: "List Open Design project artifacts",
      description: "Lists artifacts for an existing Open Design project. Requires open-design:read.",
      inputSchema: {
        clientSlug: z.string().min(1).describe("Sancho client slug."),
        projectId: z.string().min(1).describe("Open Design project id."),
      },
    },
    async ({ clientSlug, projectId }) =>
      runTool(context, "open_design_list_artifacts", clientSlug, async () => {
        assertClientScope(context, "open-design:read", clientSlug);
        const artifacts = await odListArtifacts(projectId, odConfig(context));
        return jsonResult({ ok: true, clientSlug, projectId, artifacts, count: artifacts.length });
      }),
  );

  server.registerTool(
    "sancho_intake_create_link",
    {
      title: "Create public intake form link",
      description:
        "Creates a signed public intake form URL for an allowed client. Requires clients:read or legacy sancho:read.",
      inputSchema: {
        clientSlug: z.string().min(1).describe("Sancho client slug."),
      },
    },
    async ({ clientSlug }) =>
      runTool(context, "sancho_intake_create_link", clientSlug, async () => {
        assertClientReadScope(context, clientSlug);
        const url = buildIntakeUrl(clientSlug);
        return jsonResult({ ok: true, clientSlug, url });
      }),
  );

  registerKeywordAntennaTools(server, {
    assertReadAccess: (clientSlug) => assertClientScope(context, "seo:read", clientSlug),
    assertWriteAccess: (clientSlug) => assertClientScope(context, "seo:write", clientSlug),
    run: (toolName, clientSlug, handler) => runTool(context, toolName, clientSlug, handler),
    jsonResult,
  });

  server.registerTool(
    "sancho_get_metrics_timeseries",
    {
      title: "Get Sancho metrics (time-series)",
      description:
        "Reads a client's metrics from the metric_snapshots time-series. view=series returns buckets; view=surfaces returns latest headline values; view=trend returns current-vs-previous delta; view=northstar returns the metrics-plan North Star/KPIs. Requires metrics:read.",
      inputSchema: {
        clientSlug: z.string().min(1).describe("Sancho client slug."),
        view: z.enum(["series", "surfaces", "trend", "northstar"]).default("series").describe("Which view to return."),
        source: z.string().optional().describe("Metric source, e.g. meta-ads, ghl, ga4."),
        metric: z.string().optional().describe("Metric name/key."),
        grain: z.enum(["day", "week", "month"]).default("day").describe("Bucket grain for series view."),
        from: z.string().optional().describe("Inclusive ISO date/time lower bound."),
        to: z.string().optional().describe("Inclusive ISO date/time upper bound."),
      },
    },
    async ({ clientSlug, view, source, metric, grain, from, to }) =>
      runTool(context, "sancho_get_metrics_timeseries", clientSlug, async () => {
        assertClientScope(context, "metrics:read", clientSlug);
        if (view === "surfaces") return jsonResult(await getSurfaceSummary(clientSlug, { from, to }));
        if (view === "northstar") return jsonResult(getNorthStar(clientSlug));
        if (view === "trend") {
          if (!source || !metric) throw new McpAuthError(400, "source and metric are required for view=trend");
          if (!from || !to) throw new McpAuthError(400, "from and to are required for view=trend");
          const trendSource = source;
          const trendMetric = metric;
          return jsonResult(await getTrend(clientSlug, { source: trendSource, metric: trendMetric, from, to }));
        }
        return jsonResult(await getMetricsTimeSeries(clientSlug, { source, metric, grain, from, to }));
      }),
  );

  server.registerTool(
    "sancho_get_metrics_dashboard",
    {
      title: "Get Sancho metrics dashboard definition",
      description:
        "Returns a client's versioned metrics dashboard definition: archetype, North Star, tabs, surfaces, analytical plan, custom metrics and version history. Requires metrics:read.",
      inputSchema: {
        clientSlug: z.string().min(1).describe("Sancho client slug."),
      },
    },
    async ({ clientSlug }) =>
      runTool(context, "sancho_get_metrics_dashboard", clientSlug, async () => {
        assertClientScope(context, "metrics:read", clientSlug);
        return jsonResult(await getDashboardDefinition(clientSlug));
      }),
  );

  server.registerTool(
    "sancho_update_metrics_dashboard",
    {
      title: "Update Sancho metrics dashboard",
      description:
        "Replaces a client's dashboard definition with a new validated version. Defaults to dry-run; set dryRun=false and confirm=true to save. Requires metrics:write.",
      inputSchema: {
        clientSlug: z.string().min(1).describe("Sancho client slug."),
        definition: z.string().min(1).describe("Full dashboard definition as a JSON string."),
        changeNote: z.string().optional().describe("Optional version note."),
        dryRun: z.boolean().default(true),
        confirm: z.boolean().default(false),
      },
    },
    async ({ clientSlug, definition, changeNote, dryRun, confirm }) =>
      runTool(context, "sancho_update_metrics_dashboard", clientSlug, async () => {
        assertClientScope(context, "metrics:write", clientSlug);
        let parsed: unknown;
        try {
          parsed = JSON.parse(definition);
        } catch {
          throw new McpAuthError(400, "definition must be valid JSON");
        }
        if (dryRun !== false || confirm !== true) {
          return jsonResult({
            ok: true,
            dryRun: true,
            requiresConfirmation: true,
            message: "Set dryRun=false and confirm=true to save this metrics dashboard.",
            preview: parsed,
          });
        }
        return jsonResult(await saveDashboardDefinition(clientSlug, parsed, { changeNote }));
      }),
  );

  server.registerTool(
    "sancho_add_custom_metric",
    {
      title: "Add Sancho custom metric",
      description:
        "Adds a custom formula metric card to the client's dashboard as a new version. Defaults to dry-run. Requires metrics:write.",
      inputSchema: {
        clientSlug: z.string().min(1).describe("Sancho client slug."),
        label: z.string().min(1).describe("Card label, e.g. Coste por reunion."),
        formula: z.string().min(1).describe("Formula using source.metric refs, numbers and arithmetic."),
        format: z.enum(["number", "currency", "percent", "ratio"]).default("number"),
        tier: z.enum(["north-star", "leading", "diagnostic"]).default("diagnostic"),
        surface: z.string().optional().describe("Surface/tab id to attach to."),
        changeNote: z.string().optional(),
        dryRun: z.boolean().default(true),
        confirm: z.boolean().default(false),
      },
    },
    async ({ clientSlug, label, formula, format, tier, surface, changeNote, dryRun, confirm }) =>
      runTool(context, "sancho_add_custom_metric", clientSlug, async () => {
        assertClientScope(context, "metrics:write", clientSlug);
        if (!isSafeFormula(formula)) {
          throw new McpAuthError(400, "Unsafe formula: only source.metric refs, numbers and arithmetic are allowed.");
        }
        if (dryRun !== false || confirm !== true) {
          return jsonResult({ ok: true, dryRun: true, requiresConfirmation: true, preview: { label, formula, format, tier, surface } });
        }
        return jsonResult(
          await addCustomMetric(clientSlug, { label, formula, format, tier, surface }, { changeNote }),
        );
      }),
  );

  server.registerTool(
    "sancho_revert_metrics_dashboard",
    {
      title: "Revert Sancho metrics dashboard",
      description:
        "Reverts the dashboard to a prior version by appending a new version that copies that snapshot. Defaults to dry-run. Requires metrics:write.",
      inputSchema: {
        clientSlug: z.string().min(1).describe("Sancho client slug."),
        toVersion: z.number().int().min(1).describe("Version number to restore."),
        dryRun: z.boolean().default(true),
        confirm: z.boolean().default(false),
      },
    },
    async ({ clientSlug, toVersion, dryRun, confirm }) =>
      runTool(context, "sancho_revert_metrics_dashboard", clientSlug, async () => {
        assertClientScope(context, "metrics:write", clientSlug);
        if (dryRun !== false || confirm !== true) {
          return jsonResult({ ok: true, dryRun: true, requiresConfirmation: true, message: `Set dryRun=false and confirm=true to revert to v${toVersion}.` });
        }
        return jsonResult(await revertDashboardDefinition(clientSlug, toVersion));
      }),
  );

  server.registerTool(
    "sancho_apply_metrics_template",
    {
      title: "Apply Sancho metrics template",
      description:
        "Resets the dashboard to an archetype template as a new version. Defaults to dry-run. Requires metrics:write.",
      inputSchema: {
        clientSlug: z.string().min(1).describe("Sancho client slug."),
        archetype: z.string().min(1).describe("Archetype: lead-to-sale | marketplace | saas | ecommerce."),
        dryRun: z.boolean().default(true),
        confirm: z.boolean().default(false),
      },
    },
    async ({ clientSlug, archetype, dryRun, confirm }) =>
      runTool(context, "sancho_apply_metrics_template", clientSlug, async () => {
        assertClientScope(context, "metrics:write", clientSlug);
        if (dryRun !== false || confirm !== true) {
          return jsonResult({ ok: true, dryRun: true, requiresConfirmation: true, message: `Set dryRun=false and confirm=true to apply the ${archetype} template.` });
        }
        return jsonResult(await applyDashboardTemplate(clientSlug, archetype));
      }),
  );

  return server;
}

function assertClientScope(context: SanchoMcpContext, scope: McpScope, clientSlug: string): void {
  assertMcpScope(context.principal, scope);
  assertMcpClientAccess(context.principal, clientSlug);
}

function assertClientReadScope(context: SanchoMcpContext, clientSlug: string): void {
  assertMcpAnyScope(context.principal, ["clients:read", "sancho:read"]);
  assertMcpClientAccess(context.principal, clientSlug);
}

function assertBrandScope(context: SanchoMcpContext, brandSlug: string): void {
  assertMcpBrandAccess(context.principal, brandSlug);
}

function assertBrandWriteScope(context: SanchoMcpContext, brandSlug: string): void {
  assertMcpBrandAccess(context.principal, brandSlug, "docs:write");
}

function sanitizeClientForMcp(client: Client): Record<string, unknown> {
  const {
    mcToken: _mcToken,
    ...safe
  } = client;
  return {
    slug: safe.slug,
    name: safe.name,
    emoji: safe.emoji,
    url: safe.url,
    email: safe.email,
    language: safe.language,
    active: safe.active,
    guild: safe.guild,
    workspace: safe.workspace,
    phase: safe.phase,
    paths: safe.paths,
    channels: safe.channels,
    metrics: safe.metrics,
    enabledFeatures: safe.enabledFeatures,
    plan: safe.plan,
    status: safe.status,
    subscriptionStatus: safe.subscriptionStatus,
  };
}

type ClientMetadataUpdates = {
  active?: boolean;
  name?: string;
  emoji?: string;
  phase?: number;
  url?: string;
  language?: "es" | "en";
  enabledFeatures?: string[];
};

function updateClientMetadata(
  clientSlug: string,
  updates: ClientMetadataUpdates,
  options: { dryRun: boolean },
): Record<string, unknown> {
  const data = loadClientsData();
  const clients = data.clients || [];
  const index = clients.findIndex((client) => client.slug === clientSlug);
  if (index < 0) throw new McpAuthError(404, `Client not found: ${clientSlug}`);

  const current = clients[index];
  const safeUpdates = pickDefined({
    active: updates.active,
    name: updates.name?.trim(),
    emoji: updates.emoji?.trim(),
    phase: updates.phase,
    url: updates.url?.trim(),
    language: updates.language,
    enabledFeatures: updates.enabledFeatures,
  }) as Partial<Client>;

  if (Object.keys(safeUpdates).length === 0) {
    throw new McpAuthError(400, "No supported client fields were provided");
  }

  const next = { ...current, ...safeUpdates };
  if (!options.dryRun) {
    const updatedClients = clients.slice();
    updatedClients[index] = next;
    writeClientsFile({ ...data, clients: updatedClients });
  }

  return {
    ok: true,
    clientSlug,
    updates: safeUpdates,
    before: sanitizeClientForMcp(current),
    after: sanitizeClientForMcp(next),
  };
}

async function getMcpAgent(agentId: string): Promise<AgentRichEntry | null> {
  const normalized = agentId.trim();
  if (!normalized) throw new McpAuthError(400, "agentId is required");
  const agents = await getRuntime().control.listAgentsRich() as AgentRichEntry[];
  return agents.find((agent) => agent.id === normalized) || null;
}

async function validateAgentModel(model: string | null): Promise<{ warning?: string }> {
  if (model === null) return {};
  const catalog = await getModelCatalog();
  const check = isModelAvailable(catalog, model);
  if (!check.ok) throw new McpAuthError(400, check.reason || "Model is not available");
  return { warning: check.warning };
}

function matchesStatus(actual: string | null | undefined, expected: string | undefined): boolean {
  if (!expected) return true;
  return (actual || "").toLowerCase() === expected.toLowerCase();
}

function filterIntelligenceItems(
  items: IntelligenceItem[],
  kind: IntelligenceItem["type"] | undefined,
  status: string | undefined,
): IntelligenceItem[] {
  return items
    .filter((item) => !kind || item.type === kind)
    .filter((item) => matchesStatus(item.status, status));
}

function filterDecisionItems(
  items: DecisionEntry[],
  kind: IntelligenceItem["type"] | undefined,
  status: string | undefined,
): DecisionEntry[] {
  return items
    .filter(() => !kind || kind === "Decision")
    .filter((item) => matchesStatus(item.status, status));
}

function filterDocumentItems(
  items: DocumentRecord[],
  kind: IntelligenceItem["type"] | undefined,
  status: string | undefined,
): DocumentRecord[] {
  return items
    .filter(() => !kind)
    .filter((item) => matchesStatus(item.status, status));
}

function filterProposalItems(
  items: ProposalEntry[],
  kind: IntelligenceItem["type"] | undefined,
  status: string | undefined,
): ProposalEntry[] {
  return items
    .filter(() => !kind)
    .filter((item) => matchesStatus(item.status, status));
}

type McpRecurringStatus = (typeof MCP_RECURRING_STATUS_VALUES)[number];
type McpRecurringSource = (typeof MCP_RECURRING_SOURCE_VALUES)[number];

function listMcpRecurringTasks(
  clientSlug: string,
  options: {
    status?: McpRecurringStatus;
    source?: McpRecurringSource;
    query?: string;
    limit: number;
    maxPromptChars: number;
  },
) {
  const clients = loadClients().map((client) => ({ slug: client.slug, name: client.name }));
  const localTasks = loadRecurringTasks(clientSlug);
  const localIds = new Set(localTasks.map((task) => task.id));
  const { crons } = enrichCrons({ slug: clientSlug, includeSystem: false, clients });
  const tasks = [
    ...crons
      .filter((cron) => !localIds.has(cron.id))
      .map((cron) => serializeOpenClawRecurringTask(cron, options.maxPromptChars)),
    ...localTasks.map((task) => serializeLocalRecurringTask(task, clientSlug, options.maxPromptChars)),
  ];
  const filtered = tasks
    .filter((task) => !options.status || task.status === options.status)
    .filter((task) => !options.source || task.source === options.source)
    .filter((task) => matchesQuery(options.query, [task.name, task.description, task.prompt]))
    .sort((a, b) => a.name.localeCompare(b.name));
  return {
    tasks: filtered.slice(0, options.limit),
    count: Math.min(filtered.length, options.limit),
    totalTasks: filtered.length,
    limit: options.limit,
  };
}

function findMcpRecurringTask(
  clientSlug: string,
  taskId: string,
): { source: McpRecurringSource; status: McpRecurringStatus; name: string } | null {
  const local = loadRecurringTasks(clientSlug).find((task) => task.id === taskId);
  if (local) {
    return {
      source: local._source === "openclaw-cron" ? "openclaw-cron" : "local",
      status: recurringStatusFromLocalTask(local),
      name: local.name,
    };
  }
  const clients = loadClients().map((client) => ({ slug: client.slug, name: client.name }));
  const cron = enrichCrons({ slug: clientSlug, includeSystem: false, clients }).crons.find((item) => item.id === taskId);
  if (!cron) return null;
  return {
    source: "openclaw-cron",
    status: cron.enabled ? "active" : "paused",
    name: cron.name,
  };
}

function listMcpContentCrons(
  clientSlug: string,
  options: {
    status?: McpRecurringStatus;
    query?: string;
    limit: number;
    maxPromptChars: number;
  },
) {
  const clients = loadClients().map((client) => ({ slug: client.slug, name: client.name }));
  const { crons } = enrichCrons({ slug: clientSlug, includeSystem: false, clients });
  const contentCrons = crons
    .filter((cron) => cron.name.startsWith("Content:"))
    .map((cron) => {
      const prompt = cron.prompt || "";
      const baseName = cron.name
        .replace(/^Content:\s*/, "")
        .replace(/\s*(?:-|\u2014)\s*.*$/, "")
        .trim();
      return {
        id: cron.id,
        name: cron.name,
        baseName,
        enabled: cron.enabled,
        status: cron.enabled ? "active" as const : "paused" as const,
        category: cron.category,
        schedule: humanizeSchedule(cron.schedule_raw || undefined),
        scheduleRaw: cron.schedule_raw,
        timezone: cron.schedule_raw?.tz || null,
        agent: cron.agent,
        model: cron.model,
        description: cron.description,
        promptPreview: truncateText(prompt, Math.min(options.maxPromptChars, 200)),
        prompt: truncateText(prompt, options.maxPromptChars),
        promptTruncated: prompt.length > options.maxPromptChars,
        lastRunAt: cron.last_run_at,
        nextRunAt: cron.next_run_at,
        lastStatus: cron.last_status,
        lastDurationMs: cron.last_duration_ms,
        consecutiveErrors: cron.consecutive_errors,
        lastDiagnosticSummary: cron.last_diagnostic_summary,
        lastError: cron.last_error,
        lastErrorReason: cron.last_error_reason,
        lastFinding: cron.last_finding,
        running: cron.running,
      };
    })
    .filter((cron) => !options.status || cron.status === options.status)
    .filter((cron) => matchesQuery(options.query, [cron.name, cron.baseName, cron.description, cron.prompt]));

  return {
    crons: contentCrons.slice(0, options.limit),
    count: Math.min(contentCrons.length, options.limit),
    totalCrons: contentCrons.length,
    stats: {
      total: contentCrons.length,
      active: contentCrons.filter((cron) => cron.status === "active").length,
      paused: contentCrons.filter((cron) => cron.status === "paused").length,
      lastRunAt: contentCrons
        .map((cron) => cron.lastRunAt)
        .filter(Boolean)
        .sort()
        .reverse()[0] || null,
    },
  };
}

function serializeOpenClawRecurringTask(cron: EnrichedCron, maxPromptChars: number) {
  const prompt = cron.prompt || "";
  return {
    id: cron.id,
    name: cron.name,
    source: "openclaw-cron" as const,
    status: cron.enabled ? "active" as const : "paused" as const,
    enabled: cron.enabled,
    category: cron.category,
    schedule: humanizeSchedule(cron.schedule_raw || undefined),
    scheduleRaw: cron.schedule_raw,
    agent: cron.agent,
    model: cron.model,
    description: cron.description,
    prompt: truncateText(prompt, maxPromptChars),
    promptTruncated: prompt.length > maxPromptChars,
    clientSlug: cron.client_slug,
    lastRunAt: cron.last_run_at,
    nextRunAt: cron.next_run_at,
    lastStatus: cron.last_status,
    lastDurationMs: cron.last_duration_ms,
    consecutiveErrors: cron.consecutive_errors,
    lastDiagnosticSummary: cron.last_diagnostic_summary,
    lastError: cron.last_error,
    lastErrorReason: cron.last_error_reason,
    lastFinding: cron.last_finding,
    running: cron.running,
  };
}

function serializeLocalRecurringTask(task: RecurringTask, clientSlug: string, maxPromptChars: number) {
  const prompt = typeof task.prompt === "string" ? task.prompt : "";
  const description = typeof task.description === "string" ? task.description : "";
  const source = task._source === "openclaw-cron" ? "openclaw-cron" as const : "local" as const;
  return {
    id: task.id,
    name: task.name,
    source,
    status: recurringStatusFromLocalTask(task),
    enabled: recurringStatusFromLocalTask(task) === "active",
    category: typeof task.task_type === "string" ? task.task_type : "other",
    schedule: task.schedule,
    scheduleRaw: task.schedule,
    agent: typeof task.agent === "string" ? task.agent : null,
    model: typeof task.model === "string" ? task.model : null,
    skill: task.skill,
    description,
    prompt: truncateText(prompt, maxPromptChars),
    promptTruncated: prompt.length > maxPromptChars,
    clientSlug: typeof task.client_slug === "string" ? task.client_slug : clientSlug,
    lastRunAt: typeof task.last_run_at === "string" ? task.last_run_at : null,
    nextRunAt: typeof task.next_run_at === "string" ? task.next_run_at : null,
    lastStatus: typeof task.last_status === "string" ? task.last_status : null,
    lastDurationMs: typeof task.last_duration_ms === "number" ? task.last_duration_ms : null,
    consecutiveErrors: typeof task.consecutive_errors === "number" ? task.consecutive_errors : 0,
    lastDiagnosticSummary: typeof task.last_diagnostic_summary === "string" ? task.last_diagnostic_summary : null,
    lastError: typeof task.last_error === "string" ? task.last_error : null,
    lastErrorReason: typeof task.last_error_reason === "string" ? task.last_error_reason : null,
    lastFinding: typeof task.last_finding === "string" ? task.last_finding : null,
    running: task.running || null,
    createdAt: task.created_at || null,
    updatedAt: task.updated_at || null,
  };
}

function recurringStatusFromLocalTask(task: RecurringTask): McpRecurringStatus {
  if (task.status === "active" || task.status === "paused") return task.status;
  return task.active === false ? "paused" : "active";
}

function truncateText(value: string, maxChars: number): string {
  return value.length > maxChars ? value.slice(0, maxChars) : value;
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
    const result = withTraceId(await handler(), context.traceId);
    const isError = result.isError === true;
    const error = isError ? firstTextContent(result) : undefined;
    const auditError = await auditToolCall({
      principal: context.principal,
      toolName,
      clientSlug,
      ok: !isError,
      error,
      metadata: { traceId: context.traceId },
    });
    if (auditError) return errorResult(`MCP audit failed: ${auditError}`, context.traceId);
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
    return errorResult(auditError ? `${message}; MCP audit failed: ${auditError}` : message, context.traceId);
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

function errorResult(message: string, traceId?: string): CallToolResult {
  return {
    isError: true,
    content: [
      {
        type: "text",
        text: message,
      },
    ],
    structuredContent: traceId ? { error: message, traceId } : { error: message },
  };
}

function withTraceId(result: CallToolResult, traceId: string): CallToolResult {
  const structuredContent = isRecord(result.structuredContent)
    ? { ...result.structuredContent, traceId: result.structuredContent.traceId || traceId }
    : { traceId };
  return {
    ...result,
    content: result.content.map((item) => {
      if (item.type !== "text") return item;
      try {
        const parsed = JSON.parse(item.text) as unknown;
        if (!isRecord(parsed)) return item;
        return {
          ...item,
          text: JSON.stringify({ ...parsed, traceId: parsed.traceId || traceId }, null, 2),
        };
      } catch {
        return item;
      }
    }),
    structuredContent,
  };
}

function firstTextContent(result: CallToolResult): string | undefined {
  return result.content.find((item) => item.type === "text")?.text;
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

async function resolveMcpDelegateSourceThread(
  clientSlug: string,
  sourceThreadId?: string,
  sourceTaskId?: string,
): Promise<string | undefined> {
  if (typeof sourceThreadId === "string" && sourceThreadId.trim()) {
    return canonicalThreadId(normalizeChatThreadId(clientSlug, sourceThreadId));
  }
  if (typeof sourceTaskId !== "string" || !sourceTaskId.trim()) return undefined;
  const wanted = normalizedMcpRouteKey(sourceTaskId);
  const rows = await listUnifiedTaskRowsAsync(clientSlug);
  const matches = rows.filter((row) => normalizedMcpRouteKey(row.id) === wanted);
  if (matches.length !== 1 || String(matches[0].type).toLowerCase() === "project") return undefined;
  return canonicalTaskRouteThreadId(matches[0], clientSlug);
}

function normalizeMcpDelegateSkill(value: string | undefined): string | undefined {
  if (typeof value !== "string") return undefined;
  const token = value.trim().toLowerCase();
  return /^[a-z0-9][a-z0-9_-]{0,127}$/.test(token) ? token : undefined;
}

function normalizeMcpDelegateSkills(value: string[] | undefined): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const normalized = Array.from(new Set(
    value.map((item) => normalizeMcpDelegateSkill(item)).filter((item): item is string => Boolean(item)),
  ));
  return normalized.length ? normalized : undefined;
}

function normalizedMcpRouteKey(value: unknown): string {
  return typeof value === "string" ? value.trim().toLocaleLowerCase("en-US") : "";
}

function isMcpDelegateSelfRoute(input: {
  clientSlug: string;
  sourceThreadId?: string;
  sourceTaskId?: string;
  targetTaskId: string;
  targetThreadId: string;
}): boolean {
  if (
    input.sourceTaskId
    && normalizedMcpRouteKey(input.sourceTaskId) === normalizedMcpRouteKey(input.targetTaskId)
  ) {
    return true;
  }
  if (!input.sourceThreadId?.trim()) return false;
  const source = canonicalThreadId(normalizeChatThreadId(input.clientSlug, input.sourceThreadId));
  const target = canonicalThreadId(normalizeChatThreadId(input.clientSlug, input.targetThreadId));
  return normalizedMcpRouteKey(source) === normalizedMcpRouteKey(target);
}

function isMcpDelegateTaskActive(task: unknown): boolean {
  if (!isRecord(task) || typeof task.status !== "string" || !task.status.trim()) return false;
  const status = task.status.trim().toLocaleLowerCase("en-US").replace(/_/g, "-");
  return !new Set([
    "archived",
    "cancelled",
    "canceled",
    "completed",
    "complete",
    "done",
    "finished",
    "approved",
    "discarded",
    "published",
    "rejected",
  ]).has(status);
}

function mcNextBaseUrl(): string {
  return (
    process.env.MC_NEXT_URL
    || process.env.BASE_URL
    || process.env.NEXTAUTH_URL
    || "http://localhost:3000"
  ).replace(/\/+$/, "");
}

/**
 * MCP delegation must enter through the same authenticated ingress as browser
 * and runtime-controlled task turns. Calling the runtime adapter directly would
 * bypass authoritative task/agent/skill resolution in `/api/chat/send`.
 */
async function dispatchMcChatThroughControlPlane(
  context: SanchoMcpContext,
  payload: InboundMessage,
): Promise<{ chatId: string; controlPlane: unknown }> {
  const secret = getRuntime().messaging.getSharedSecret?.();
  if (!secret) {
    throw new McpAuthError(503, "MCP delegation requires the runtime MC chat shared secret");
  }
  const response = await fetch(`${mcNextBaseUrl()}/api/chat/send`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-MC-Secret": secret,
      ...traceHeaders(context),
    },
    body: JSON.stringify(payload),
  });
  const raw = await response.text();
  const data = parseGatewayBody(raw);
  if (!response.ok) {
    throw new Error(
      `Mission Control task harness rejected message: HTTP ${response.status}${raw ? `: ${raw.slice(0, 500)}` : ""}`,
    );
  }
  return {
    chatId: extractChatId(data) || payload.threadId,
    controlPlane: data,
  };
}

function parseGatewayBody(raw: string): unknown {
  if (!raw) return {};
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return { raw };
  }
}

function normalizeDelegateAgent(agent: string): string {
  const slug = agent.trim().toLowerCase();
  if (!AGENT_SLUG_RE.test(slug)) {
    throw new McpAuthError(400, "agent must be a lowercase slug using letters, numbers and hyphens");
  }
  if (!DELEGATE_AGENT_SET.has(slug)) {
    throw new McpAuthError(
      400,
      `sancho_delegate requires an active delegate agent (${DELEGATE_AGENT_LIST}); received "${slug}"`,
    );
  }
  return slug;
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

function statusCounts<T>(items: T[], getStatus: (item: T) => unknown): Record<string, number> & { total: number } {
  const counts: Record<string, number> = { total: items.length };
  for (const item of items) {
    const status = String(getStatus(item) || "unknown");
    counts[status] = (counts[status] || 0) + 1;
  }
  return counts as Record<string, number> & { total: number };
}

function matchesLooseStatus(actual: unknown, expected: string | undefined): boolean {
  if (!expected) return true;
  return String(actual || "").toLowerCase() === expected.toLowerCase();
}

function matchesQuery(query: string | undefined, fields: Array<string | null | undefined>): boolean {
  if (!query) return true;
  const needle = query.toLowerCase();
  return fields.some((field) => String(field || "").toLowerCase().includes(needle));
}

function assertContentPathSegment(name: string, value: string): void {
  if (!/^[a-z0-9][a-z0-9._-]*$/i.test(value)) {
    throw new McpAuthError(400, `${name} must be a simple path segment`);
  }
}

async function listContentDraftIdeaIds(clientSlug: string): Promise<string[]> {
  const draftsRoot = path.join(brandDir(clientSlug), "content", "drafts");
  try {
    const entries = await fs.readdir(draftsRoot, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
      .map((entry) => entry.name)
      .filter((entry) => /^[a-z0-9][a-z0-9._-]*$/i.test(entry))
      .sort();
  } catch {
    return [];
  }
}

function serializeContentDraftSummary(draft: Draft) {
  return {
    ideaId: draft.meta.idea_id,
    channel: draft.meta.channel,
    kind: draft.meta.kind || "channel-draft",
    relPath: draft.relPath,
    bodyChars: draft.body.length,
    meta: draft.meta,
  };
}

function serializeContentDraft(draft: Draft, maxChars: number) {
  const truncated = draft.body.length > maxChars;
  return {
    ...serializeContentDraftSummary(draft),
    content: truncated ? draft.body.slice(0, maxChars) : draft.body,
    truncated,
  };
}

function requireMcpContentTask(clientSlug: string, contentTaskId: string): {
  ct: ContentTask;
  parentTaskId: string;
  projectDir: string;
} {
  const found = findContentTaskByIdAcrossProjects(clientSlug, contentTaskId);
  if (!found) throw new McpAuthError(404, `ContentTask not found: ${contentTaskId}`);
  return found;
}

type McpContentTaskUpdatePlan = {
  fields: ContentTaskUpdateInput;
  status?: ContentTaskStatus;
  pipelineState?: ContentTaskPipelineState | null;
  channelPhases?: Record<string, ChannelPhase>;
  hasChanges: boolean;
};

function buildContentTaskUpdatePlan(input: {
  name?: string;
  skill?: string;
  targetChannels?: string[];
  owner?: string;
  scheduledFor?: string;
  clarifyStatus?: string;
  mediaPolicy?: Record<string, "required" | "optional">;
  author?: string;
  status?: (typeof MCP_CONTENT_TASK_STATUS_VALUES)[number];
  pipelineState?: (typeof MCP_CONTENT_TASK_PIPELINE_STATE_VALUES)[number] | null;
  channelPhases?: Record<string, (typeof MCP_CHANNEL_PHASE_VALUES)[number]>;
}): McpContentTaskUpdatePlan {
  const fields = pickDefined({
    name: input.name,
    skill: input.skill,
    target_channels: input.targetChannels,
    owner: input.owner,
    scheduled_for: input.scheduledFor,
    clarify_status: input.clarifyStatus,
    media_policy: input.mediaPolicy,
    author: input.author,
  }) as ContentTaskUpdateInput;

  const status = input.status as ContentTaskStatus | undefined;
  const pipelineState = input.pipelineState === undefined && status
    ? defaultPipelineStateForStatus(status)
    : input.pipelineState as ContentTaskPipelineState | null | undefined;
  const channelPhases = input.channelPhases as Record<string, ChannelPhase> | undefined;

  return {
    fields,
    status,
    pipelineState,
    channelPhases,
    hasChanges:
      Object.keys(fields).length > 0 ||
      status !== undefined ||
      input.pipelineState !== undefined ||
      channelPhases !== undefined,
  };
}

function applyContentTaskUpdatePlan(
  clientSlug: string,
  parentTaskId: string,
  contentTaskId: string,
  current: ContentTask,
  plan: McpContentTaskUpdatePlan,
): ContentTask {
  let updated = current;
  const previousStatus = current.status;

  if (Object.keys(plan.fields).length > 0) {
    updated = updateContentTask(clientSlug, parentTaskId, contentTaskId, plan.fields);
  }

  if (plan.status !== undefined) {
    updated = setContentTaskStatus(
      clientSlug,
      parentTaskId,
      contentTaskId,
      plan.status,
      plan.pipelineState,
    );
    const movedBackward =
      VALID_CONTENT_TASK_STATUSES.indexOf(updated.status) <
      VALID_CONTENT_TASK_STATUSES.indexOf(previousStatus);
    if (movedBackward) {
      updated = rollbackChannelPhasesToStatus(clientSlug, parentTaskId, contentTaskId);
    }
  } else if (plan.pipelineState !== undefined) {
    updated = setContentTaskStatus(
      clientSlug,
      parentTaskId,
      contentTaskId,
      updated.status,
      plan.pipelineState,
    );
  }

  if (plan.channelPhases !== undefined) {
    updated = setChannelPhases(clientSlug, parentTaskId, contentTaskId, plan.channelPhases);
  }

  return updated;
}

function defaultPipelineStateForStatus(status: ContentTaskStatus): ContentTaskPipelineState | null {
  if (status === "Approved") return "researching";
  if (status === "Pending Media") return "generating-media";
  return null;
}

function buildContentTaskTransition(
  clientSlug: string,
  ct: ContentTask,
  action: (typeof MCP_CONTENT_TASK_ACTION_VALUES)[number],
): {
  action: (typeof MCP_CONTENT_TASK_ACTION_VALUES)[number];
  status: ContentTaskStatus;
  pipelineState: ContentTaskPipelineState | null;
  hasMedia?: boolean;
} {
  if (action === "approve-draft") {
    if (ct.status !== "Draft") {
      throw new McpAuthError(409, `approve-draft requires status="Draft" (current: "${ct.status}")`);
    }
    const hasMedia = contentTaskHasAnyMedia(clientSlug, ct);
    return {
      action,
      status: "Pending Media",
      pipelineState: hasMedia ? "media-review" : "generating-media",
      hasMedia,
    };
  }

  if (action === "approve-media") {
    if (ct.status !== "Pending Media") {
      throw new McpAuthError(409, `approve-media requires status="Pending Media" (current: "${ct.status}")`);
    }
    const hasMedia = contentTaskHasAnyMedia(clientSlug, ct);
    if (!hasMedia) {
      throw new McpAuthError(409, "approve-media requires at least one media asset attached to the draft(s)");
    }
    return { action, status: "Ready", pipelineState: null, hasMedia };
  }

  if (action === "discard" || action === "defer") {
    if (ct.status === "Published" || ct.status === "Discarded" || ct.status === "Deferred") {
      throw new McpAuthError(409, `${action} not allowed from terminal status "${ct.status}"`);
    }
    return {
      action,
      status: action === "discard" ? "Discarded" : "Deferred",
      pipelineState: null,
    };
  }

  throw new McpAuthError(400, `Unsupported ContentTask action: ${action}`);
}

function contentTaskHasAnyMedia(clientSlug: string, ct: ContentTask): boolean {
  const channels = new Set(ct.target_channels || []);
  return listDrafts(clientSlug, ct.idea_id)
    .filter((draft) => {
      const channel = draft.meta.channel || draft.relPath.split("/").pop()?.replace(".md", "") || "";
      return channels.has(channel);
    })
    .some((draft) => (draft.meta.media?.length ?? 0) > 0);
}

type ContentDraftPatch = {
  meta: Partial<DraftFrontmatter>;
  body?: string;
  bodyChanged: boolean;
};

function buildContentDraftPatch(input: {
  body?: string;
  clarifyStatus?: (typeof CONTENT_DRAFT_CLARIFY_STATUS_VALUES)[number];
  itemType?: (typeof VALID_CONTENT_ITEM_TYPES)[number];
  mediaPolicy?: "required" | "optional";
  model?: string;
  researchUsed?: boolean;
  selfQa?: "PASS" | "FAIL";
  selfQaNotes?: string[];
}): ContentDraftPatch {
  const meta = pickDefined({
    clarify_status: input.clarifyStatus,
    item_type: input.itemType,
    media_policy: input.mediaPolicy,
    model: input.model,
    research_used: input.researchUsed,
    self_qa: input.selfQa,
    self_qa_notes: input.selfQaNotes,
  }) as Partial<DraftFrontmatter>;
  return {
    meta,
    body: input.body,
    bodyChanged: input.body !== undefined,
  };
}

function previewContentDraftUpdate(draft: Draft, patch: ContentDraftPatch) {
  return {
    ideaId: draft.meta.idea_id,
    channel: draft.meta.channel,
    relPath: draft.relPath,
    meta: {
      ...draft.meta,
      ...patch.meta,
    },
    bodyChanged: patch.bodyChanged,
    bodyChars: patch.body?.length ?? draft.body.length,
  };
}

type ContentImageGenerationPatch = {
  mode?: "ask" | "fixed";
  provider?: string | null;
  model?: string | null;
};

type ContentCarouselPatch = {
  logoUrl?: string | null;
  footerText?: string | null;
  primaryColor?: string | null;
  accentColor?: string | null;
  enabledTemplates?: string[] | null;
};

type ContentIdeaStatus = "New" | "Approved" | "Discarded" | "Deferred" | "Published";
type ContentIdea = Record<string, unknown> & {
  id: string;
  status: ContentIdeaStatus;
  title?: string;
  pillar_id?: string;
  content_type?: string;
  target_channel?: string;
  angle_draft?: string;
  pov_confidence?: number;
  source_signals?: string[];
  created_at: string;
  updated_at?: string;
};

const CONTENT_IDEA_STATUSES = new Set<ContentIdeaStatus>([
  "New",
  "Approved",
  "Discarded",
  "Deferred",
  "Published",
]);

function buildContentConfigPatch(
  imageGeneration: ContentImageGenerationPatch | undefined,
  carousel: ContentCarouselPatch | undefined,
): Partial<ContentConfig> {
  const patch: Partial<ContentConfig> = {};
  if (imageGeneration) {
    const imagePatch = pickDefined({
      mode: imageGeneration.mode,
      provider: imageGeneration.provider,
      model: imageGeneration.model,
    });
    if (Object.keys(imagePatch).length > 0) {
      patch.image_generation = imagePatch as Partial<ContentConfig>["image_generation"];
    }
  }
  if (carousel) {
    const carouselPatch = pickDefined({
      logo_url: carousel.logoUrl,
      footer_text: carousel.footerText,
      primary_color: carousel.primaryColor,
      accent_color: carousel.accentColor,
      enabled_templates: carousel.enabledTemplates,
    });
    if (Object.keys(carouselPatch).length > 0) {
      patch.carousel = carouselPatch as unknown as Partial<ContentConfig>["carousel"];
    }
  }
  return patch;
}

function mergeContentConfig(current: ContentConfig, patch: Partial<ContentConfig>): ContentConfig {
  return {
    image_generation: {
      ...current.image_generation,
      ...(patch.image_generation || {}),
    },
    carousel: {
      ...current.carousel,
      ...(patch.carousel || {}),
    },
  };
}

function contentIdeaQueuePath(clientSlug: string): string {
  return path.join(brandDir(clientSlug), "content", "idea-queue.json");
}

async function loadContentIdeaQueue(clientSlug: string): Promise<ContentIdea[]> {
  try {
    const raw = JSON.parse(await fs.readFile(contentIdeaQueuePath(clientSlug), "utf8")) as unknown;
    const rows = Array.isArray(raw) ? raw : isRecord(raw) && Array.isArray(raw.ideas) ? raw.ideas : [];
    return rows.filter(isRecord).map(normalizeContentIdea);
  } catch {
    return [];
  }
}

async function saveContentIdeaQueue(clientSlug: string, ideas: ContentIdea[]): Promise<void> {
  const filePath = contentIdeaQueuePath(clientSlug);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(ideas, null, 2)}\n`, "utf8");
}

function normalizeContentIdea(value: Record<string, unknown>): ContentIdea {
  const id = typeof value.id === "string" && value.id.trim() ? value.id.trim() : `idea-${Date.now()}`;
  return {
    ...value,
    id,
    status: canonicalContentIdeaStatus(value.status),
    created_at: typeof value.created_at === "string" ? value.created_at : new Date().toISOString(),
  };
}

function canonicalContentIdeaStatus(value: unknown): ContentIdeaStatus {
  if (typeof value !== "string") return "New";
  const exact = value as ContentIdeaStatus;
  if (CONTENT_IDEA_STATUSES.has(exact)) return exact;
  const lower = value.toLowerCase();
  if (lower === "approved") return "Approved";
  if (lower === "discarded" || lower === "archived") return "Discarded";
  if (lower === "deferred" || lower === "stale") return "Deferred";
  if (lower === "published") return "Published";
  return "New";
}

function buildContentIdea(input: {
  existing: ContentIdea[];
  id?: string;
  title: string;
  pillarId?: string;
  contentType?: string;
  targetChannel?: string;
  angleDraft?: string;
  povConfidence?: number;
  signalSummary?: string;
  signalSource?: string;
  signalUrl?: string;
  signalDate?: string;
  sourceSignals?: string[];
}): ContentIdea {
  const now = new Date().toISOString();
  const today = now.slice(0, 10);
  const id = resolveContentIdeaId(input.existing, input.id || `idea-${today}-${Math.random().toString(36).slice(2, 6)}`);
  return {
    id,
    title: input.title,
    pillar_id: input.pillarId || "",
    content_type: input.contentType || "",
    target_channel: input.targetChannel || "",
    signal: {
      summary: input.signalSummary || "",
      source: input.signalSource || "manual",
      ...(input.signalUrl ? { url: input.signalUrl } : {}),
      date: input.signalDate || today,
    },
    angle_draft: input.angleDraft || "",
    pov_confidence: input.povConfidence ?? 0.5,
    source_signals: input.sourceSignals || [],
    created_at: now,
    updated_at: now,
    status: "New",
  };
}

function resolveContentIdeaId(existing: ContentIdea[], desired: string): string {
  const base = desired.trim();
  if (!base) throw new McpAuthError(400, "Idea id cannot be empty");
  if (!/^[a-z0-9][a-z0-9._-]*$/i.test(base)) {
    throw new McpAuthError(400, "Idea id must be a simple path segment");
  }
  const ids = new Set(existing.map((idea) => idea.id));
  if (!ids.has(base)) return base;
  for (let n = 2; ; n++) {
    const candidate = `${base}-${String.fromCharCode(96 + n)}`;
    if (!ids.has(candidate)) return candidate;
  }
}

function buildContentIdeaPatch(input: {
  status?: "New" | "Discarded" | "Deferred" | "Published";
  angleDraft?: string | null;
  pillarId?: string | null;
  targetChannel?: string | null;
  contentType?: string | null;
  author?: string | null;
  targetDate?: string | null;
  dispatchDate?: string | null;
  dispatchSlot?: string | null;
  projectTaskId?: string | null;
}): Record<string, unknown> {
  return pickDefined({
    status: input.status,
    angle_draft: input.angleDraft,
    pillar_id: input.pillarId,
    target_channel: input.targetChannel,
    content_type: input.contentType,
    author: input.author,
    target_date: input.targetDate,
    dispatch_date: input.dispatchDate,
    dispatch_slot: input.dispatchSlot,
    project_task_id: input.projectTaskId,
  });
}

function applyContentIdeaPatch(idea: ContentIdea, patch: Record<string, unknown>): ContentIdea {
  const next: ContentIdea = { ...idea, updated_at: new Date().toISOString() };
  for (const [key, value] of Object.entries(patch)) {
    if (value === null) {
      delete next[key];
    } else if (key === "status") {
      next.status = canonicalContentIdeaStatus(value);
    } else {
      next[key] = value;
    }
  }
  return next;
}

async function getPublishingPostMetrics(clientSlug: string, externalUrl: string) {
  const entry = await findMetricoolPostByUrl(clientSlug, externalUrl);
  const dimensions = entry?.dimensions;
  if (entry && dimensions?.url) {
    return {
      found: true,
      metrics: {
        impressions: entry.value,
        likes: dimensions.likes ?? 0,
        clicks: dimensions.clicks ?? 0,
        engagement: dimensions.engagement ?? 0,
        network: dimensions.network ?? "",
        url: externalUrl,
        measured_at: entry.date,
      },
    };
  }
  return { found: false };
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

function buildOpenDesignProjectPatch(input: {
  name?: string;
  skillId?: string;
  designSystemId?: string;
  clearSkill?: boolean;
  clearDesignSystem?: boolean;
}) {
  if (input.skillId && input.clearSkill) {
    throw new McpAuthError(400, "Provide either skillId or clearSkill, not both");
  }
  if (input.designSystemId && input.clearDesignSystem) {
    throw new McpAuthError(400, "Provide either designSystemId or clearDesignSystem, not both");
  }

  const patch = pickDefined({
    name: input.name,
    skillId: input.clearSkill ? null : input.skillId,
    designSystemId: input.clearDesignSystem ? null : input.designSystemId,
  }) as Partial<{ designSystemId: string | null; skillId: string | null; name: string }>;

  if (Object.keys(patch).length === 0) {
    throw new McpAuthError(400, "At least one project field is required");
  }

  return patch;
}

function assertRelativeProjectPath(filePath: string): string {
  const raw = filePath.trim().replace(/\\/g, "/");
  if (!raw) throw new McpAuthError(400, "filePath is required");
  if (raw.startsWith("/") || /^[a-zA-Z]:\//.test(raw)) {
    throw new McpAuthError(400, "filePath must be project-relative");
  }
  const normalized = path.posix.normalize(raw);
  if (normalized === "." || normalized === ".." || normalized.startsWith("../")) {
    throw new McpAuthError(403, "Open Design project file traversal is not allowed");
  }
  return normalized;
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
