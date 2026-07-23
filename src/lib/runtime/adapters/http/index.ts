import fs from "fs";
import path from "path";
import { markCancelled } from "@/lib/data/mc-chat";
import { BASE } from "@/lib/data/paths";
import {
  getHttpRuntimeBaseUrl,
  getHttpRuntimeHealthPath,
  getHttpRuntimeSecret,
  sendHttpRuntimeInbound,
  type HttpRuntimeConnectionConfig,
} from "@/lib/runtime/http-gateway";
import type {
  InboundMessage,
  RuntimeAdapter,
  RuntimeCapabilities,
  RuntimeControl,
  RuntimeJobEndedAt,
  RuntimeRunningCron,
  SendInboundOptions,
  SendInboundResult,
} from "../../types";
import {
  buildMcChatContextBlock,
  resolveTurnSkillPolicy,
} from "../../agent-contract/mc-chat-context.mjs";

const EXTERNAL_HTTP_CAPABILITIES: RuntimeCapabilities = {
  chat: true,
  durableChatTurns: false,
  cron: false,
  modelPicker: false,
  agentRegistry: false,
  discord: false,
  slack: false,
};

export const EXTERNAL_HTTP_CONNECTION: HttpRuntimeConnectionConfig = {
  baseUrlEnv: [
    "SANCHO_EXTERNAL_GATEWAY_URL",
    "SANCHO_EXTERNAL_RUNTIME_URL",
    "HERMES_EXTERNAL_GATEWAY_URL",
    "HERMES_EXTERNAL_BASE_URL",
    "HERMES_EXTERNAL_URL",
  ],
  inboundPathEnv: [
    "SANCHO_EXTERNAL_INBOUND_PATH",
    "SANCHO_EXTERNAL_RUNTIME_INBOUND_PATH",
    "HERMES_EXTERNAL_INBOUND_PATH",
    "HERMES_INBOUND_PATH",
  ],
  healthPathEnv: [
    "SANCHO_EXTERNAL_HEALTH_PATH",
    "SANCHO_EXTERNAL_RUNTIME_HEALTH_PATH",
    "HERMES_EXTERNAL_HEALTH_PATH",
    "HERMES_HEALTH_PATH",
  ],
  secretEnv: [
    "SANCHO_EXTERNAL_SECRET",
    "SANCHO_EXTERNAL_RUNTIME_SECRET",
    "HERMES_EXTERNAL_SECRET",
    "HERMES_EXTERNAL_API_KEY",
    "HERMES_EXTERNAL_CHAT_SECRET",
  ],
  label: "External HTTP",
};

type ExternalHttpProtocol = "sancho" | "mc-bridge";

function firstEnv(keys: string[]): string | undefined {
  for (const key of keys) {
    const value = process.env[key]?.trim();
    if (value) return value;
  }
  return undefined;
}

function normalizePath(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "/";
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}

function externalProtocol(): ExternalHttpProtocol {
  const raw = firstEnv([
    "SANCHO_EXTERNAL_PROTOCOL",
    "SANCHO_EXTERNAL_RUNTIME_PROTOCOL",
    "HERMES_EXTERNAL_PROTOCOL",
  ])?.toLowerCase();
  if (raw === "mc-bridge" || raw === "mission-control-bridge" || raw === "bridge") {
    return "mc-bridge";
  }
  return "sancho";
}

function getBridgeChatPath(): string {
  return normalizePath(
    firstEnv([
      "SANCHO_EXTERNAL_CHAT_PATH",
      "SANCHO_EXTERNAL_BRIDGE_CHAT_PATH",
      "HERMES_EXTERNAL_CHAT_PATH",
      ...EXTERNAL_HTTP_CONNECTION.inboundPathEnv,
    ]) || "/chat",
  );
}

function getExternalHealthPath(protocol: ExternalHttpProtocol): string {
  if (protocol === "mc-bridge") {
    return normalizePath(
      firstEnv([
        ...EXTERNAL_HTTP_CONNECTION.healthPathEnv,
        "SANCHO_EXTERNAL_BRIDGE_HEALTH_PATH",
        "HERMES_EXTERNAL_BRIDGE_HEALTH_PATH",
      ]) || "/health",
    );
  }
  return getHttpRuntimeHealthPath(EXTERNAL_HTTP_CONNECTION);
}

function bridgeAgentFor(message: InboundMessage): string {
  const configured = firstEnv([
    "SANCHO_EXTERNAL_AGENT",
    "SANCHO_EXTERNAL_BRIDGE_AGENT",
    "HERMES_EXTERNAL_AGENT",
  ]);
  const forwardAgent = ["1", "true", "yes"].includes(
    (process.env.SANCHO_EXTERNAL_FORWARD_AGENT || process.env.HERMES_EXTERNAL_FORWARD_AGENT || "").toLowerCase(),
  );
  if (forwardAgent && (message.agent || message.agentId)) {
    return String(message.agent || message.agentId);
  }
  return configured || "sancho-coordinator";
}

function bridgeSessionKey(message: InboundMessage): string {
  const prefix = firstEnv(["SANCHO_EXTERNAL_SESSION_PREFIX", "HERMES_EXTERNAL_SESSION_PREFIX"]) || "sancho";
  return `${prefix}:${message.threadId}`;
}

function cleanAttachmentText(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value.replace(/[\r\n]+/g, " ").trim() || fallback : fallback;
}

function bridgeAttachmentBlock(attachments: unknown[] | undefined): string | null {
  if (!Array.isArray(attachments) || attachments.length === 0) return null;
  const rows = attachments
    .map((attachment) => {
      if (!attachment || typeof attachment !== "object") return null;
      const item = attachment as Record<string, unknown>;
      const url = cleanAttachmentText(item.url);
      if (!url) return null;
      const filename = cleanAttachmentText(item.filename, "archivo-adjunto");
      const mimeType = cleanAttachmentText(item.mimeType || item.type, "application/octet-stream");
      const size = Number(item.size);
      return {
        url,
        filename,
        mimeType,
        size: Number.isFinite(size) && size >= 0 ? Math.round(size) : null,
      };
    })
    .filter(Boolean)
    .slice(0, 10) as Array<{ url: string; filename: string; mimeType: string; size: number | null }>;
  if (rows.length === 0) return null;

  return [
    "Adjuntos del usuario:",
    ...rows.flatMap((attachment, index) => [
      `${index + 1}. ${attachment.filename}`,
      `   url: ${attachment.url}`,
      `   mime_type: ${attachment.mimeType}`,
      ...(attachment.size !== null ? [`   size_bytes: ${attachment.size}`] : []),
    ]),
    "Instrucción: si el usuario pide leer/revisar/analizar un archivo, descarga la URL antes de responder. No digas que no hay adjuntos.",
  ].join("\n");
}

function portableRuntimeContract(message: InboundMessage): string {
  const skillMode = resolveTurnSkillPolicy(message);
  const requestedAgent = message.agent || message.agentId || "sancho";
  return buildMcChatContextBlock({
    slug: message.slug,
    threadId: message.threadId,
    threadName: message.threadName,
    linkedTo: message.linkedTo,
    docPath: message.docPath,
    docKind: message.docKind,
    scope: message.scope,
    skillMode,
    skills: message.skills,
    skill: message.skill,
    primarySkill: message.primarySkill,
    runtimeId: firstEnv(["SANCHO_EXTERNAL_RUNTIME_KIND"]) || "external-http",
    requestedAgent,
    // `mc-bridge` returns final text synchronously; Next consumes control
    // markers through the runtime-neutral control plane in `/api/chat/send`.
    canDelegate: message.temporaryAgent !== true && message.controlDepth !== 1 && message.readOnly !== true,
    temporaryAgent: message.temporaryAgent,
    controlDepth: message.controlDepth,
    isAdmin: message.isAdmin,
    senderRole: message.senderRole,
    readOnly: message.readOnly,
    channelMode: message.channelMode,
    supportContext: message.supportContext,
    taskRouteProposal: message.taskRouteProposal,
    priorThreadMessages: message.priorThreadMessages,
    attachments: message.attachments,
    runtimeEffectIntent: message.runtimeEffectIntent,
  });
}

function bridgePrompt(message: InboundMessage): string {
  const contract = portableRuntimeContract(message);

  const attachmentBlock = bridgeAttachmentBlock(message.attachments);
  const sections = [
    contract,
    message.senderRole ? `Rol del emisor: ${message.senderRole}` : null,
    `Mensaje:\n${message.text}`,
    attachmentBlock,
  ].filter(Boolean);

  return sections.join("\n\n");
}

async function readBridgeResponse(
  res: Response,
): Promise<{ raw: string; response?: string; sessionId?: string; error?: string }> {
  const raw = await res.text();
  if (!raw) return { raw };
  try {
    const data = JSON.parse(raw) as {
      response?: unknown;
      text?: unknown;
      sessionId?: unknown;
      chatId?: unknown;
      error?: unknown;
      detail?: unknown;
    };
    const response = typeof data.response === "string" ? data.response : typeof data.text === "string" ? data.text : undefined;
    const sessionId =
      typeof data.sessionId === "string" ? data.sessionId : typeof data.chatId === "string" ? data.chatId : undefined;
    const error = typeof data.error === "string" ? data.error : typeof data.detail === "string" ? data.detail : undefined;
    return { raw, response, sessionId, error };
  } catch {
    return { raw, response: raw };
  }
}

async function sendMcBridgeInbound(
  message: InboundMessage,
  opts: SendInboundOptions | undefined,
): Promise<SendInboundResult> {
  const baseUrl = getHttpRuntimeBaseUrl(EXTERNAL_HTTP_CONNECTION);
  if (!baseUrl) {
    const error = `${EXTERNAL_HTTP_CONNECTION.label} runtime is not configured: set ${EXTERNAL_HTTP_CONNECTION.baseUrlEnv.join(" or ")}`;
    return { ok: false, status: 0, raw: error, error };
  }

  const secret = getHttpRuntimeSecret(EXTERNAL_HTTP_CONNECTION);
  const timeoutMs = opts?.timeoutMs || Number(process.env.SANCHO_EXTERNAL_BRIDGE_TIMEOUT_MS || 150000);
  const agent = bridgeAgentFor(message);
  try {
    const res = await fetch(`${baseUrl}${getBridgeChatPath()}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(opts?.headers ?? {}),
        ...(secret ? { "X-MC-Secret": secret, Authorization: `Bearer ${secret}` } : {}),
      },
      body: JSON.stringify({
        message: bridgePrompt(message),
        agent,
        sessionKey: bridgeSessionKey(message),
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const data = await readBridgeResponse(res);
    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        raw: data.raw,
        error: data.error || data.raw,
      };
    }
    if (typeof data.response !== "string") {
      const error = "mc-bridge response did not include a response text";
      return { ok: false, status: res.status, raw: data.raw, error };
    }
    return {
      ok: true,
      status: res.status,
      chatId: data.sessionId || bridgeSessionKey(message),
      raw: data.raw,
      finalText: data.response,
      finalAgent: message.agent || message.agentId || "sancho",
    };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    return { ok: false, status: 0, raw: error, error };
  }
}

function unsupported(method: string): never {
  throw new Error(`External HTTP runtime does not support ${method} through Sancho yet`);
}

const control: RuntimeControl = {
  runCommand: async () => unsupported("runCommand"),
  getConfig: async () => unsupported("getConfig"),
  patchConfig: async () => unsupported("patchConfig"),
  ensureModelInAllowlist: async () => unsupported("ensureModelInAllowlist"),
  getDefaultModel: async () => unsupported("getDefaultModel"),
  getDefaultModelAssignment: async () => unsupported("getDefaultModelAssignment"),
  setDefaultModel: async () => unsupported("setDefaultModel"),
  setDefaultModelAssignment: async () => unsupported("setDefaultModelAssignment"),
  setCronModel: async () => unsupported("setCronModel"),
  listAgents: async () => unsupported("listAgents"),
  listAgentsRich: async () => unsupported("listAgentsRich"),
  getAgentEffectiveModel: async () => unsupported("getAgentEffectiveModel"),
  getAgentModelAssignment: async () => unsupported("getAgentModelAssignment"),
  setAgentModel: async () => unsupported("setAgentModel"),
  hasAnthropicSubscriptionToken: async () => unsupported("hasAnthropicSubscriptionToken"),
  hasAnthropicApiKey: async () => unsupported("hasAnthropicApiKey"),
  setAnthropicAuthRoute: async () => unsupported("setAnthropicAuthRoute"),
};

function externalRuntimeHome(): string {
  return process.env.SANCHO_EXTERNAL_RUNTIME_HOME || path.join(BASE, "_runtime", "external-http");
}

function externalRuntimeFile(...segments: string[]): string {
  return path.join(externalRuntimeHome(), ...segments);
}

function loadAgentSessions(agent = "sancho"): Record<string, unknown> {
  const file = externalRuntimeFile("agents", agent, "sessions", "sessions.json");
  if (!fs.existsSync(file)) return {};
  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf-8"));
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export class ExternalHttpAdapter implements RuntimeAdapter {
  readonly id = "external-http";
  readonly displayName = "Runtime externo HTTP";
  readonly capabilities = EXTERNAL_HTTP_CAPABILITIES;

  readonly messaging = {
    terminalDeliveryMode: (): "callback" | "inline" =>
      externalProtocol() === "mc-bridge" ? "inline" : "callback",
    sendInbound: (message: InboundMessage, opts?: SendInboundOptions) =>
      externalProtocol() === "mc-bridge"
        ? sendMcBridgeInbound(message, opts)
        : sendHttpRuntimeInbound(
            {
              ...message,
              runtimeContract: {
                schemaVersion: 1,
                kind: "sancho.mc-chat-context",
                instructions: portableRuntimeContract(message),
              },
            },
            opts,
            EXTERNAL_HTTP_CONNECTION,
          ),
    cancel: async (threadId: string): Promise<void> => {
      markCancelled(threadId);
    },
    getSharedSecret: (): string | undefined => getHttpRuntimeSecret(EXTERNAL_HTTP_CONNECTION),
  };

  readonly control = control;

  readonly state = {
    home: (): string => externalRuntimeHome(),
    runtimeFile: (...segments: string[]): string => externalRuntimeFile(...segments),
    cronJobsFile: (): string => externalRuntimeFile("cron", "jobs.json"),
    cronJobsStateFile: (): string => externalRuntimeFile("cron", "jobs-state.json"),
    agentSessionsFile: (agent = "sancho"): string =>
      externalRuntimeFile("agents", agent, "sessions", "sessions.json"),
    loadAgentSessions,
    getRunningCronJobs: (
      _jobsEndedAt: Record<string, RuntimeJobEndedAt>,
      _opts?: { agent?: string; freshnessMs?: number; now?: number },
    ): Map<string, RuntimeRunningCron> => new Map(),
  };

  readonly lifecycle = {
    healthcheck: async (): Promise<{ ok: boolean; details?: Record<string, unknown> }> => {
      const baseUrl = getHttpRuntimeBaseUrl(EXTERNAL_HTTP_CONNECTION);
      const protocol = externalProtocol();
      if (!baseUrl) {
        return {
          ok: false,
          details: {
            error: "Runtime externo HTTP no está configurado",
            requiredEnv: EXTERNAL_HTTP_CONNECTION.baseUrlEnv,
          },
        };
      }

      const controller = new AbortController();
      const timeoutMs = Number(process.env.SANCHO_EXTERNAL_HEALTH_TIMEOUT_MS || process.env.HERMES_HEALTH_TIMEOUT_MS || 3000);
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const secret = getHttpRuntimeSecret(EXTERNAL_HTTP_CONNECTION);
        const res = await fetch(`${baseUrl}${getExternalHealthPath(protocol)}`, {
          headers: secret ? { "X-MC-Secret": secret, Authorization: `Bearer ${secret}` } : undefined,
          signal: controller.signal,
        });
        return {
          ok: res.ok,
          details: {
            status: res.status,
            baseUrl,
            protocol,
          },
        };
      } catch (e) {
        return {
          ok: false,
          details: {
            baseUrl,
            protocol,
            error: e instanceof Error ? e.message : String(e),
          },
        };
      } finally {
        clearTimeout(timer);
      }
    },
    restart: async (): Promise<unknown> => unsupported("restart"),
  };
}
