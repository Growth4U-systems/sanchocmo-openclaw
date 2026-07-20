import type { NextApiRequest, NextApiResponse } from "next";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import {
  canAccessSlug,
  compose,
  withAuth,
  withErrorHandler,
} from "@/lib/api-middleware";
import {
  ChatAttachmentValidationError,
  validateChatAttachments,
} from "@/lib/chat-attachments";
import {
  addMessage,
  clearStatus,
  getThread,
  getThreadRouting,
  setThreadRouting,
  setStatusEntry,
  upsertWorkflowJobMessage,
  type ChatAttachment,
  type ErrorDetail,
} from "@/lib/data/mc-chat";
import { maybeMarkClarifyAnswered } from "@/lib/clarify-autostatus";
import { resolveNamespaceThreadConfig } from "@/lib/chat-openers";
import { stripAskProtocol } from "@/lib/chat-tool-echo";
import { resolveTaskThreadExecutionRoute } from "@/lib/data/task-routing";
import { getTask } from "@/lib/data/tasks";
import { buildTaskContractSnapshot } from "@/lib/quality/task-contract-snapshot";
import { getRuntime, type InboundMessage } from "@/lib/runtime";
import {
  resolveAgentTurnPolicy,
  toThreadRouting,
} from "@/lib/runtime/agent-execution-policy";
import {
  createAgentRunWithReceiptAsync,
  getAgentRunByIdAsync,
  getAgentRunByIdempotencyKeyAsync,
  markAgentRunCompletedAsync,
  markAgentRunDispatchedAsync,
  markAgentRunFailedAsync,
  type AgentRun,
  type CreateAgentRunInput,
} from "@/lib/data/agent-runs";
import {
  discardPendingTaskRouteProposal,
  getPendingTaskRouteProposal,
  isExplicitTaskCreationRejection,
} from "@/lib/data/task-route-proposals";
import { dispatchRuntimeControlActions } from "@/lib/runtime/control-actions";
import { parseRuntimeControlReply } from "@/lib/runtime/agent-contract/control-reply.mjs";
import { resolveChatUserId } from "@/lib/runtime/agent-contract/chat-principal.mjs";
import { resolveOutboundWorkflowChoice } from "@/lib/outreach/structured-choice";
import {
  buildOutboundCampaignOptions,
  isOutboundCampaignStartPrompt,
} from "@/lib/outreach/campaign-options";
import { resolveActiveOutboundWorkflow } from "@/lib/outreach/active-workflow";
import { dispatchOutboundCommand } from "@/lib/yalc/outbound-command";
import { resolveYalcConfig } from "@/lib/yalc/client";
import {
  traceContextFromHeaders,
  tracePropagationHeaders,
} from "@/lib/trace-context";
import {
  canonicalThreadId,
  isValidTenantSlug,
  parseThreadId,
} from "@/lib/thread-id";
import {
  buildGrowieSupportContext,
  GROWIE_SUPPORT_SOURCE,
  isGrowieSupportThreadId,
  snapshotGrowieThreadHistory,
} from "@/lib/support/growie";
import { resolveChatAgentTurnPolicy } from "@/lib/chat/agent-turn-durable";
import {
  admitChatAgentTurnAtomically,
  ChatAgentTurnIdempotencyConflictError,
} from "@/lib/chat/agent-turn-atomic-admission";
import { authorizeChatAgentTurnRuntimeRequest } from "@/lib/runtime/chat-agent-turn-dispatch-authority";
import { authorizeRuntimeRunRequest } from "@/lib/runtime/runtime-run-request-authority";
import { gatherGrowieSupportDiagnostics } from "@/lib/support/growie-diagnostics";

function normalizedIdempotencyKey(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const key = value.trim();
  return key && key.length <= 240 && !/[\r\n\0]/.test(key) ? key : undefined;
}

function singleHeader(req: NextApiRequest, name: string): string | undefined {
  const value = req.headers[name];
  return Array.isArray(value) ? undefined : value;
}

function safeSecretEqual(left: string | undefined, right: string): boolean {
  if (!left) return false;
  const supplied = Buffer.from(left);
  const expected = Buffer.from(right);
  return (
    supplied.length === expected.length && timingSafeEqual(supplied, expected)
  );
}

interface RuntimeParentAuthority {
  isAdmin: boolean;
  readOnly: boolean;
  senderRole: "admin" | "client";
  userId: string;
  userName?: string;
}

async function resolveRuntimeParentAuthority(
  req: NextApiRequest,
  slug: string,
  threadId: string,
): Promise<RuntimeParentAuthority | null> {
  const authority = await authorizeRuntimeRunRequest(
    {
      runId: singleHeader(req, "x-mission-control-parent-run-id"),
      capability: singleHeader(req, "x-sancho-parent-run-capability"),
      dispatchRunId: singleHeader(req, "x-sancho-dispatch-run-id"),
      dispatchLeaseToken: singleHeader(req, "x-sancho-dispatch-lease-token"),
    },
    {
      resolveAgentRun: getAgentRunByIdAsync,
      authorizeDispatchLease: (input) =>
        authorizeChatAgentTurnRuntimeRequest(input),
    },
  );
  const input = authority?.input;
  if (
    !authority ||
    !input ||
    authority.slug !== slug ||
    authority.threadId !== threadId ||
    typeof input.isAdmin !== "boolean" ||
    (input.senderRole !== "admin" && input.senderRole !== "client") ||
    typeof input.readOnly !== "boolean" ||
    input.controlDepth !== 0 ||
    typeof input.userId !== "string" ||
    (input.isAdmin === true
      ? input.senderRole !== "admin" || input.userId !== "mc-admin"
      : input.senderRole !== "client" || input.userId === "mc-admin")
  ) {
    return null;
  }
  return {
    isAdmin: input.isAdmin,
    readOnly: input.readOnly,
    senderRole: input.senderRole,
    userId: input.userId,
    ...(typeof input.userName === "string" && input.userName.trim()
      ? { userName: input.userName.slice(0, 256) }
      : {}),
  };
}

function gatewayErrorDetail(raw: string, status?: number): ErrorDetail {
  return {
    category:
      status === 401 || status === 403
        ? "auth"
        : status === 429
          ? "rate_limit"
          : "network",
    raw: raw.slice(0, 4096),
    classifiedAt: Date.now(),
  };
}

function requestBaseUrl(req: NextApiRequest): string {
  const configured = process.env.SANCHO_BASE_URL || process.env.BASE_URL;
  if (configured) return configured.replace(/\/+$/, "");
  const forwardedProto = Array.isArray(req.headers["x-forwarded-proto"])
    ? req.headers["x-forwarded-proto"][0]
    : req.headers["x-forwarded-proto"];
  const host = Array.isArray(req.headers.host)
    ? req.headers.host[0]
    : req.headers.host;
  return `${forwardedProto || "http"}://${host || "localhost:3000"}`;
}

function resultText(value: unknown): string {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function resultNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * POST /api/chat/send (was /api/mc-chat/send)
 * Ported from mc-server.js:5079-5132
 * Sends a message from the frontend, stores locally, forwards to gateway
 */
export async function sendHandler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST")
    return res.status(405).json({ error: "Method not allowed" });
  const traceContext = req.traceContext ?? traceContextFromHeaders(req.headers);

  const {
    slug,
    threadId,
    threadName,
    text,
    userName,
    userId,
    linkedTo,
    skill,
    skills,
    threadState,
    docPath,
    docKind,
    attachments,
    _source,
    agent,
    scope,
    skillMode,
    temporaryAgent,
    controlDepth: claimedControlDepth,
    idempotencyKey: claimedIdempotencyKey,
    isAdmin: claimedIsAdmin,
    senderRole: claimedSenderRole,
    readOnly: claimedReadOnly,
  } = req.body;

  if (!isValidTenantSlug(slug) || typeof text !== "string" || !text.trim()) {
    return res.status(400).json({ error: "Missing slug or text" });
  }

  const runtime = getRuntime();
  const sharedSecret = runtime.messaging.getSharedSecret?.();
  const suppliedSecret = singleHeader(req, "x-mc-secret");
  const trustedRuntimeRequest = Boolean(
    sharedSecret && safeSecretEqual(suppliedSecret, sharedSecret),
  );
  if (!trustedRuntimeRequest && !canAccessSlug(req.ctx, String(slug))) {
    return res.status(403).json({ error: "Forbidden" });
  }
  if (temporaryAgent === true) {
    if (typeof agent !== "string" || agent.trim().toLowerCase() !== "sancho") {
      return res
        .status(400)
        .json({ error: "temporaryAgent is only valid for Sancho" });
    }
    if (!sharedSecret) {
      return res
        .status(503)
        .json({ error: "Temporary intervention requires MC_CHAT_SECRET" });
    }
    if (!trustedRuntimeRequest) {
      return res.status(403).json({
        error: "Temporary intervention requires a trusted runtime request",
      });
    }
  }
  if (
    trustedRuntimeRequest &&
    claimedControlDepth !== undefined &&
    claimedControlDepth !== 0 &&
    claimedControlDepth !== 1
  ) {
    return res.status(400).json({ error: "controlDepth must be 0 or 1" });
  }
  const controlDepth: 0 | 1 =
    trustedRuntimeRequest && claimedControlDepth === 1 ? 1 : 0;

  const rawThreadId = threadId || `${slug}:general`;
  const parsedThread = parseThreadId(rawThreadId);
  if (!parsedThread || parsedThread.slug !== slug) {
    return res.status(400).json({ error: "Thread does not belong to slug" });
  }
  const tid = canonicalThreadId(rawThreadId);
  // The shared gateway secret authenticates transport only. A runtime-created
  // child must also be bound to the exact active parent run (and, for durable
  // chat, its fenced dispatch lease) before it can select a tenant.
  const runtimeParent = trustedRuntimeRequest
    ? await resolveRuntimeParentAuthority(req, String(slug), tid)
    : null;
  if (trustedRuntimeRequest && !runtimeParent) {
    return res.status(403).json({ error: "Runtime parent authority invalid" });
  }
  if (trustedRuntimeRequest && claimedControlDepth !== 1) {
    return res.status(403).json({ error: "Runtime follow-up depth invalid" });
  }
  const runtimeClaimsAdmin =
    trustedRuntimeRequest &&
    (claimedIsAdmin === true || claimedSenderRole === "admin");
  if (
    (runtimeClaimsAdmin || temporaryAgent === true) &&
    (!runtimeParent?.isAdmin || runtimeParent.readOnly)
  ) {
    return res.status(403).json({ error: "Runtime admin authority invalid" });
  }
  const shortThreadId = tid.slice(String(slug).length + 1);
  const isGrowieSupport = isGrowieSupportThreadId(tid, String(slug));
  if (isGrowieSupport && !trustedRuntimeRequest && req.ctx?.isAdmin !== true) {
    return res
      .status(403)
      .json({ error: "Growie support is currently limited to staff" });
  }
  const resolvedThreadName = isGrowieSupport
    ? "Growie · Soporte"
    : threadName || tid;
  const resolvedLinkedTo = isGrowieSupport
    ? "support/growie"
    : linkedTo || undefined;
  const effectiveSource = isGrowieSupport ? GROWIE_SUPPORT_SOURCE : _source;
  const baseSupportContext = isGrowieSupport
    ? buildGrowieSupportContext({
        referrer: req.headers.referer,
        deployedCommit: process.env.GIT_COMMIT,
        imageDigest: process.env.SANCHOCMO_IMAGE_DIGEST,
        environment: process.env.NEXT_PUBLIC_ENV_LABEL || process.env.NODE_ENV,
      })
    : undefined;
  // Growie must see everything that happened in Sancho for this tenant —
  // threads, runs (ledger or not), and the doc on screen. Gathering is
  // best-effort: missing evidence never blocks the support turn.
  const supportContext = baseSupportContext
    ? {
        ...baseSupportContext,
        ...(await gatherGrowieSupportDiagnostics({
          slug: String(slug),
          pagePath: baseSupportContext.pagePath,
        })),
      }
    : undefined;
  // Snapshot before any async routing work or current-message persistence. The
  // signed gateway payload can then bootstrap a newly isolated model session
  // without racing a later user turn or trusting browser-supplied history.
  const priorThreadMessages = isGrowieSupport
    ? snapshotGrowieThreadHistory(getThread(tid).messages)
    : undefined;
  const persistedRoute = getThreadRouting(tid);
  const namespaceRoute = resolveNamespaceThreadConfig(slug, tid);
  // The support namespace is a trusted server policy. Browser routing fields
  // cannot turn Growie's read-only diagnostic into a specialist with a wider
  // toolset, and a stale persisted route cannot do so on a reopened case.
  const requestRoute = isGrowieSupport
    ? { agent: "sancho", scope: "agent", skillMode: "auto" }
    : { agent, scope, skillMode, skill, skills };
  const taskExecution = await resolveTaskThreadExecutionRoute(slug, tid);
  if (taskExecution.kind === "ambiguous") {
    return res.status(409).json({
      error: "Ambiguous task thread anchor",
      taskIds: taskExecution.taskIds,
    });
  }
  if (taskExecution.kind === "inactive") {
    return res.status(409).json({
      error: "Task is not active",
      taskId: taskExecution.taskId,
    });
  }
  const taskExecutionRoute =
    taskExecution.kind === "task" ? taskExecution.route : undefined;
  const resolvedTaskId =
    taskExecution.kind === "task" ? taskExecution.taskId : undefined;
  let taskContractSnapshot: ReturnType<typeof buildTaskContractSnapshot>;
  if (resolvedTaskId) {
    try {
      taskContractSnapshot = buildTaskContractSnapshot(
        await getTask(String(slug), resolvedTaskId),
        String(slug),
      );
    } catch (error) {
      // Quality capture is best-effort during the shadow phase and must never
      // turn an otherwise valid user message into a failed dispatch.
      console.warn(
        `[quality-evidence] could not snapshot task ${resolvedTaskId}:`,
        error instanceof Error ? error.message : error,
      );
    }
  }
  const persistedExecutionRoute = isGrowieSupport
    ? undefined
    : !taskExecutionRoute && persistedRoute?.scope === "task"
      ? {
          ...persistedRoute,
          scope: "agent" as const,
          skillMode: "auto" as const,
        }
      : persistedRoute;
  const requestedExecutionRoute =
    !taskExecutionRoute && requestRoute.scope === "task"
      ? { ...requestRoute, scope: "agent" as const, skillMode: "auto" as const }
      : requestRoute;
  const turnPolicy = resolveAgentTurnPolicy(
    [
      // The current task record is authoritative for its primary skill and
      // allowlist. Persisted ownership then wins over browser metadata.
      taskExecutionRoute ?? {},
      persistedExecutionRoute ?? requestedExecutionRoute,
      requestedExecutionRoute,
      namespaceRoute ?? {},
      shortThreadId === "yalc"
        ? { agent: "rocinante", scope: "agent", skill: "yalc-operator" }
        : {},
    ],
    { temporaryAgent, agent },
  );
  const policy = turnPolicy.policy;
  const isTemporarySancho = turnPolicy.temporarySancho;
  const resolvedAgent = policy.agent;
  const resolvedSkill = policy.skillHint;
  const resolvedPrimarySkill =
    policy.scope === "task"
      ? taskExecutionRoute?.skill
      : policy.scope === "skill"
        ? policy.skillHint
        : undefined;
  const effectiveSkills = policy.availableSkills;
  let parsedAttachments: ChatAttachment[] | undefined;
  try {
    parsedAttachments = validateChatAttachments(attachments, String(slug));
  } catch (error) {
    if (error instanceof ChatAttachmentValidationError) {
      return res.status(400).json({ error: error.message });
    }
    throw error;
  }

  // Runtime follow-ups preserve the original principal, but browser JSON never
  // chooses a sender id and a trusted client can never claim the reserved admin
  // sender. OpenClaw applies the same rule again at its tool boundary.
  const isAdmin = trustedRuntimeRequest
    ? runtimeParent?.isAdmin === true && runtimeParent.readOnly === false
    : req.ctx?.isAdmin === true;
  const senderRole: "admin" | "client" = isAdmin ? "admin" : "client";
  const readOnly =
    isGrowieSupport ||
    (trustedRuntimeRequest
      ? (runtimeParent?.readOnly ?? claimedReadOnly === true)
      : false);
  const resolvedUserId = resolveChatUserId({
    trustedRuntimeRequest,
    isAdmin,
    slug: String(slug),
    claimedUserId: runtimeParent?.userId ?? userId,
  });
  const resolvedUserName =
    runtimeParent?.userName || userName || (isAdmin ? "Admin" : slug);
  // Authenticated browser and runtime callers share the same thread-scoped
  // idempotency contract. A browser cannot affect another tenant because slug
  // access and canonical thread ownership were established above.
  const acceptedIdempotencyKey = normalizedIdempotencyKey(
    claimedIdempotencyKey,
  );
  if (claimedIdempotencyKey !== undefined && !acceptedIdempotencyKey) {
    return res.status(400).json({ error: "Invalid idempotencyKey" });
  }
  // `/stop` targets the currently active runtime session and is not a model
  // turn. Resolve durable rollout before every other prose fast-path so an
  // enabled tenant cannot bypass the Ledger through deterministic routing.
  const ordinaryAgentTurn = text.trim().toLowerCase() !== "/stop";
  const durableTurnRollout = ordinaryAgentTurn
    ? resolveChatAgentTurnPolicy(String(slug))
    : null;
  const durableTurnEnabled =
    durableTurnRollout?.enabled === true && runtime.id === "openclaw";
  if (
    durableTurnRollout &&
    (durableTurnRollout.reason === "invalid_mode" ||
      durableTurnRollout.reason === "invalid_allowlist" ||
      durableTurnRollout.reason === "worker_disabled")
  ) {
    console.error(
      `[chat-agent-turn] rollout configuration rejected: ${durableTurnRollout.reason}`,
    );
    return res.status(503).json({
      error: "La ejecución durable del chat no está disponible",
      retryable: true,
    });
  }
  if (durableTurnRollout?.enabled === true && runtime.id !== "openclaw") {
    console.error(`[chat-agent-turn] rollout runtime rejected: ${runtime.id}`);
    return res.status(503).json({
      error: "La ejecución durable del chat no está disponible",
      retryable: true,
    });
  }

  // Persist ownership before any deterministic early return so a reload
  // between opening the chooser and selecting an option keeps the same route.
  if (turnPolicy.persistRoute) setThreadRouting(tid, toThreadRouting(policy));

  // Runtime-generated children are not fresh human intent, and durable turns
  // may execute external actions only through their fenced tool authority.
  const allowUserDeterministicOutbound =
    !durableTurnEnabled &&
    !trustedRuntimeRequest &&
    !readOnly &&
    !isGrowieSupport;
  if (allowUserDeterministicOutbound && isOutboundCampaignStartPrompt(text)) {
    addMessage(tid, "user", String(text), undefined, parsedAttachments);
    const prepared = buildOutboundCampaignOptions(String(slug));
    addMessage(tid, "bot", prepared.message, resolvedAgent || "rocinante");
    return res.status(200).json({
      ok: prepared.ok,
      deterministic: true,
      chatId: tid,
      ...(!prepared.ok
        ? { error: "Foundation outbound configuration unavailable" }
        : {}),
    });
  }

  const outboundSelectionAttempt =
    allowUserDeterministicOutbound &&
    /^\[ask:outbound_ecp_v1\]\s*respuesta:/m.test(String(text));
  const outboundChoice = !allowUserDeterministicOutbound
    ? null
    : resolveOutboundWorkflowChoice(getThread(tid), String(text));
  if (outboundSelectionAttempt && !outboundChoice) {
    addMessage(
      tid,
      "user",
      stripAskProtocol(String(text)),
      undefined,
      parsedAttachments,
    );
    addMessage(
      tid,
      "bot",
      "No pude validar esta opción de campaña. No inicié ninguna búsqueda ni envié datos al agente. Vuelve a abrir «Crear campaña» para generar opciones ejecutables.",
      resolvedAgent || "rocinante",
    );
    return res.status(200).json({
      ok: false,
      error: "Invalid outbound workflow option",
      deterministic: true,
      chatId: tid,
    });
  }
  if (outboundChoice) {
    addMessage(
      tid,
      "user",
      stripAskProtocol(String(text)),
      undefined,
      parsedAttachments,
    );
    setStatusEntry(tid, {
      text: "Buscando empresas del ICP...",
      agent: resolvedAgent || "rocinante",
      ts: Date.now(),
    });
    try {
      const result = await dispatchOutboundCommand(
        resolveYalcConfig(String(slug)),
        {
          command: "outbound.workflow.start",
          idempotencyKey: `linkedin-outbound-v1:${createHash("sha256")
            .update(`${slug}:${tid}`)
            .digest("hex")
            .slice(0, 32)}`,
          intent: outboundChoice.intent,
          callbackUrl: `${requestBaseUrl(req)}/api/yalc/job-callback`,
          callbackContext: {
            slug: String(slug),
            threadId: tid,
            agent: resolvedAgent || "rocinante",
            command: "outbound.workflow.start",
          },
        },
      );
      clearStatus(tid);
      const accounts =
        result.accounts && typeof result.accounts === "object"
          ? (result.accounts as Record<string, unknown>)
          : {};
      const batch =
        result.batch && typeof result.batch === "object"
          ? (result.batch as Record<string, unknown>)
          : {};
      const campaignId = resultText(result.campaignId);
      const runId = resultText(result.runId);
      const itemCount = resultNumber(batch.itemCount);
      if (result.reused === true && campaignId && runId && itemCount !== null) {
        const sample = Array.isArray(batch.sample)
          ? batch.sample
              .flatMap((item) => {
                if (!item || typeof item !== "object" || Array.isArray(item))
                  return [];
                const value = item as Record<string, unknown>;
                const messageBody = resultText(value.messageBody);
                if (!messageBody) return [];
                const leadId = resultText(value.leadId);
                return [{ ...(leadId ? { leadId } : {}), messageBody }];
              })
              .slice(0, 3)
          : [];
        upsertWorkflowJobMessage(
          tid,
          `Ya existe una campaña activa equivalente con ${itemCount} contacto${itemCount === 1 ? "" : "s"}. No creé otra ni repetí la búsqueda.`,
          {
            jobId: `reused:${runId}`,
            type: "campaign.workflow.prepare",
            status: "completed",
            command: "outbound.workflow.start",
            campaignId,
            runId,
            summary: "active equivalent workflow reused",
            batch: { itemCount, sample },
          },
          resolvedAgent || "rocinante",
        );
        const { httpStatus: _httpStatus, ...payload } = result;
        return res
          .status(200)
          .json({ ...payload, deterministic: true, chatId: tid });
      }
      const startedText =
        result.async === true
          ? [
              `Inicié la campaña para **${outboundChoice.label}**.`,
              "",
              "El workflow buscará primero las empresas del ICP y después los roles objetivo dentro de esas empresas. No enviará ningún mensaje sin tu aprobación final.",
            ]
              .filter(Boolean)
              .join("\n")
          : [
              `Preparé la campaña para **${outboundChoice.label}**.`,
              `Empresas válidas: ${resultNumber(accounts.usableDomains) ?? 0}.`,
              `Contactos preparados: ${resultNumber(batch.itemCount) ?? 0}.`,
              "No se envió ningún mensaje.",
            ].join("\n");
      addMessage(tid, "bot", startedText, resolvedAgent || "rocinante");
      const { httpStatus: _httpStatus, ...payload } = result;
      return res
        .status(200)
        .json({ ...payload, deterministic: true, chatId: tid });
    } catch (error) {
      clearStatus(tid);
      const message =
        error instanceof Error
          ? error.message
          : "No se pudo iniciar el workflow";
      addMessage(
        tid,
        "bot",
        `No pude iniciar la campaña: ${message}. No se envió ningún mensaje.`,
        resolvedAgent || "rocinante",
      );
      const status =
        typeof (error as { status?: unknown })?.status === "number"
          ? (error as { status: number }).status
          : 502;
      return res
        .status(status >= 400 && status <= 599 ? status : 502)
        .json({ error: message });
    }
  }

  // Fast-path an already claimed retry key before any message/thread side
  // effect. The repository repeats this as an atomic Postgres claim below, so
  // correctness does not depend on this process-local optimistic lookup.
  if (!durableTurnEnabled && acceptedIdempotencyKey) {
    const existingRun = await getAgentRunByIdempotencyKeyAsync(
      tid,
      acceptedIdempotencyKey,
    );
    // Only a run that is still in flight or already succeeded is a genuine
    // duplicate. A prior run that failed to reach the runtime (or was
    // cancelled) must NOT wedge the key: a transient gateway outage would
    // otherwise brick the delegation forever — every retry with the same
    // deterministic key would 409, even after the gateway recovered. Fall
    // through so a fresh run is created below; because
    // getAgentRunByIdempotencyKey scans newest-first, so a new durable run
    // supersedes the failed one for future lookups.
    if (
      existingRun &&
      (existingRun.status === "queued" ||
        existingRun.status === "running" ||
        existingRun.status === "completed")
    ) {
      return res.status(200).json({
        ok: true,
        duplicate: true,
        runId: existingRun.id,
        traceId: existingRun.traceId ?? traceContext.traceId,
        status: existingRun.status,
        chatId: tid,
      });
    }
  }

  let pendingTaskRouteProposal = isGrowieSupport
    ? undefined
    : await getPendingTaskRouteProposal(slug, tid);
  if (pendingTaskRouteProposal && isExplicitTaskCreationRejection(text)) {
    await discardPendingTaskRouteProposal(slug, tid);
    pendingTaskRouteProposal = undefined;
  }
  const runtimeTaskRouteProposal = pendingTaskRouteProposal
    ? {
        id: pendingTaskRouteProposal.id,
        groupId: pendingTaskRouteProposal.groupId,
        agent: pendingTaskRouteProposal.agent,
        skill: pendingTaskRouteProposal.skill,
        skills: pendingTaskRouteProposal.skills,
        name: pendingTaskRouteProposal.name,
        brief: pendingTaskRouteProposal.brief,
      }
    : undefined;
  const runtimeControlBaseUrl = requestBaseUrl(req);
  const activeOutboundWorkflow = isGrowieSupport
    ? undefined
    : resolveActiveOutboundWorkflow(getThread(tid));
  // The raw capability crosses the authenticated runtime transport once. Only
  // its digest is durable, so database access or MC_CHAT_SECRET alone cannot
  // authorize a runtime-owned tool effect.
  const runtimeToolCapability = randomBytes(32).toString("hex");
  const runtimeToolCapabilitySha256 = createHash("sha256")
    .update(runtimeToolCapability)
    .digest("hex");
  const runtimeIdempotencyFingerprint = createHash("sha256")
    .update(
      JSON.stringify({
        schemaVersion: 1,
        slug: String(slug),
        threadId: tid,
        text,
        userId: resolvedUserId,
        attachments: parsedAttachments ?? [],
        requestedRoute: {
          agent,
          scope,
          skillMode,
          skill,
          skills,
          temporaryAgent,
        },
        controlDepth,
        source: effectiveSource,
        readOnly,
      }),
    )
    .digest("hex");
  const agentRunInput: CreateAgentRunInput = {
    idempotencyKey: acceptedIdempotencyKey,
    threadId: tid,
    traceId: traceContext.traceId,
    runtime: runtime.id,
    agent: resolvedAgent || "sancho",
    skill: resolvedSkill,
    skills: effectiveSkills,
    skillMode: policy.skillMode,
    taskId: resolvedTaskId,
    taskContract: taskContractSnapshot,
    input: {
      slug,
      threadId: tid,
      threadName: resolvedThreadName,
      text,
      linkedTo: resolvedLinkedTo,
      docPath: docPath || undefined,
      docKind: typeof docKind === "string" ? docKind : undefined,
      source: effectiveSource,
      channelMode: isGrowieSupport ? "support-diagnostic" : undefined,
      supportContext,
      temporaryAgent: isTemporarySancho,
      controlDepth,
      trigger: isTemporarySancho ? "temporary_sancho" : undefined,
      userText: text,
      userId: resolvedUserId,
      userName: resolvedUserName,
      isAdmin,
      senderRole,
      readOnly,
      attachments: parsedAttachments,
      scope: policy.scope,
      skillMode: policy.skillMode,
      primarySkill: resolvedPrimarySkill,
      activeOutboundWorkflow,
      priorThreadMessages,
      taskRouteProposal: runtimeTaskRouteProposal,
      threadState: threadState || undefined,
      controlBaseUrl: runtimeControlBaseUrl,
      runtimeIdempotencyFingerprint,
      ...(durableTurnEnabled
        ? { runtimeDispatchMode: "ledger-v1" }
        : { runtimeToolCapabilitySha256 }),
    },
  };
  let admission: {
    run: AgentRun;
    created: boolean;
    dispatchRun?: { id: string };
  };
  if (durableTurnEnabled) {
    try {
      admission = await admitChatAgentTurnAtomically(agentRunInput);
    } catch (error) {
      if (error instanceof ChatAgentTurnIdempotencyConflictError) {
        return res.status(409).json({
          error:
            "Este envío ya fue admitido con otro contenido. Vuelve a enviarlo como una nueva solicitud.",
          code: error.code,
          retryable: false,
        });
      }
      console.error(
        "[chat-agent-turn] atomic admission failed:",
        error instanceof Error ? error.message : error,
      );
      return res.status(503).json({
        error: "No se pudo admitir el turno de forma durable",
        retryable: true,
      });
    }
  } else {
    admission = await createAgentRunWithReceiptAsync(agentRunInput);
  }
  const { run, created: runCreated } = admission;
  // The repository owns the unique idempotency claim. A second process may
  // have won after the optimistic lookup above; do not duplicate chat/runtime
  // side effects when that happens.
  if (!runCreated) {
    return res.status(200).json({
      ok: true,
      duplicate: true,
      runId: run.id,
      ...(admission.dispatchRun
        ? { dispatchRunId: admission.dispatchRun.id, durable: true }
        : {}),
      traceId: run.traceId ?? traceContext.traceId,
      status: run.status,
      chatId: tid,
    });
  }

  // Agent ownership and auto/pinned policy are server state, not browser
  // state. Persist the route before the message so Discord, callbacks and a
  // reopened tab continue with the same agent while re-evaluating skills.
  // Store user message locally
  addMessage(tid, "user", text, undefined, parsedAttachments);

  // Deterministic clarify transition (SAN-152): when this message carries
  // `[ask:…] respuesta:` lines on a content thread and they complete the
  // clarify doc's questions, flip `clarify_status` to "answered" so the UI
  // and the writer gate don't depend on the agent remembering to do it.
  // Never let a failure here block the chat message.
  if (!isGrowieSupport) {
    try {
      const clarifyResult = maybeMarkClarifyAnswered(slug, tid, text);
      if (clarifyResult.marked) {
        console.log(`[clarify-autostatus] ${tid}: clarify_status → answered`);
      }
    } catch (e) {
      console.error(
        "[clarify-autostatus] failed:",
        e instanceof Error ? e.message : e,
      );
    }
  }
  if (resolvedAgent) {
    setStatusEntry(tid, {
      text: isGrowieSupport
        ? "Growie está revisando la evidencia..."
        : isTemporarySancho
          ? "Sancho está interviniendo temporalmente..."
          : shortThreadId === "yalc"
            ? "YALC está preparando la respuesta..."
            : "El agente está pensando...",
      agent: resolvedAgent,
      ts: Date.now(),
    });
  }

  if (durableTurnEnabled && admission.dispatchRun) {
    return res.status(202).json({
      ok: true,
      durable: true,
      runId: run.id,
      dispatchRunId: admission.dispatchRun.id,
      traceId: run.traceId ?? traceContext.traceId,
      status: "queued",
      chatId: tid,
    });
  }

  const payload: InboundMessage = {
    slug,
    threadId: tid,
    missionControlRunId: run.id,
    ...(runtime.id === "openclaw" ? { runtimeToolCapability } : {}),
    traceId: run.traceId ?? traceContext.traceId,
    traceparent: traceContext.traceparent,
    controlDepth,
    threadName: resolvedThreadName,
    text,
    userId: resolvedUserId,
    userName: resolvedUserName,
    linkedTo: resolvedLinkedTo,
    skill: resolvedSkill || undefined,
    primarySkill: resolvedPrimarySkill,
    skills: effectiveSkills || undefined,
    scope: policy.scope,
    skillMode: policy.skillMode,
    temporaryAgent: isTemporarySancho || undefined,
    taskRouteProposal: runtimeTaskRouteProposal,
    activeOutboundWorkflow,
    controlBaseUrl: runtimeControlBaseUrl,
    threadState: threadState || undefined,
    docPath: docPath || undefined,
    docKind: typeof docKind === "string" ? docKind : undefined,
    attachments: parsedAttachments,
    isAdmin,
    senderRole,
    readOnly,
    channelMode: isGrowieSupport ? "support-diagnostic" : undefined,
    supportContext,
    priorThreadMessages,
    _source: effectiveSource,
    // Force routing: when the thread carries an `agent` field, the gateway
    // dispatches to that agent (e.g. dulcinea for content tasks, maese-pedro
    // for Media Creation skills) instead of falling back to the default
    // agent. The gateway's mc-chat plugin reads the field as `agentId` — we
    // send both names so any consumer inspecting either key works without
    // coordination. The plugin embeds the value in the SessionKey
    // (`agent:<slug>:<chatId>`) so OpenClaw's `resolveSessionAgentIds()`
    // routes to workspace-<slug>.
    agentId: resolvedAgent,
    agent: resolvedAgent,
  };
  try {
    const result = await runtime.messaging.sendInbound(payload, {
      headers: tracePropagationHeaders(traceContext),
    });
    if (!result.ok) {
      if (result.status === 0) {
        const msg = result.error || result.raw || "Gateway unreachable";
        await markAgentRunFailedAsync(run.id, tid, msg, "runtime_unreachable", {
          errorDetail: gatewayErrorDetail(msg),
        });
        console.error("[mc-chat] Forward error:", msg);
        clearStatus(tid);
        addMessage(
          tid,
          "bot",
          "No he podido conectar con el gateway de agentes. El mensaje quedó guardado, pero no se ha iniciado ninguna ejecución.",
          "sancho",
          undefined,
          undefined,
          undefined,
          undefined,
          gatewayErrorDetail(msg),
        );
        return res.status(502).json({ error: "Gateway unreachable: " + msg });
      }
      const detail = `HTTP ${result.status}${result.raw ? `: ${result.raw.slice(0, 500)}` : ""}`;
      await markAgentRunFailedAsync(run.id, tid, detail, "runtime_rejected", {
        status: result.status,
        raw: result.raw,
        errorDetail: gatewayErrorDetail(detail, result.status),
      });
      const userText =
        result.status === 403
          ? "No he podido entregar el mensaje al gateway de agentes: la firma compartida de MC Chat no coincide o falta. Revisa MC_CHAT_SECRET y reinicia el gateway."
          : `No he podido entregar el mensaje al gateway de agentes (${detail}).`;
      addMessage(
        tid,
        "bot",
        userText,
        "sancho",
        undefined,
        undefined,
        undefined,
        undefined,
        gatewayErrorDetail(detail, result.status),
      );
      clearStatus(tid);
      console.error("[mc-chat] Gateway rejected message:", detail);
      return res
        .status(502)
        .json({ error: "Gateway rejected message: " + detail });
    }
    await markAgentRunDispatchedAsync(run.id, tid, {
      status: result.status,
      chatId: result.chatId || tid,
    });
    if (typeof result.finalText === "string") {
      const finalAgent = result.finalAgent || resolvedAgent || "sancho";
      const controlContext = {
        slug,
        threadId: tid,
        missionControlRunId: run.id,
        parentCapability: runtimeToolCapability,
        controlDepth,
        threadName: resolvedThreadName,
        respondingAgent: finalAgent,
        temporaryAgent: isTemporarySancho,
        userText: text,
        userId: resolvedUserId,
        userName: resolvedUserName,
        isAdmin,
        senderRole,
        source: effectiveSource,
        linkedTo: resolvedLinkedTo,
        docPath: docPath || undefined,
        docKind: typeof docKind === "string" ? docKind : undefined,
        attachments: parsedAttachments,
      };
      const parsedControl =
        runtime.id === "openclaw" || readOnly
          ? null
          : parseRuntimeControlReply(result.finalText, {
              respondingAgent: finalAgent,
              temporaryAgent: isTemporarySancho,
            });
      const visibleText = parsedControl?.text ?? result.finalText;
      clearStatus(tid);
      // Child control actions validate against an active parent, so dispatch
      // them before the parent is terminalized.
      if (parsedControl) {
        const controlled = await dispatchRuntimeControlActions(
          parsedControl,
          controlContext,
          { secret: sharedSecret },
        );
        for (const followup of controlled.followupMessages) {
          addMessage(tid, "bot", followup, "sancho");
        }
      }
      await markAgentRunCompletedAsync(run.id, tid, {
        agent: finalAgent,
        text: visibleText.slice(0, 4096),
        synchronous: true,
      });
      addMessage(tid, "bot", visibleText, finalAgent);
      return res.status(200).json({
        ok: true,
        runId: run.id,
        traceId: run.traceId ?? traceContext.traceId,
        chatId: result.chatId || tid,
        completed: true,
      });
    }
    res.status(200).json({
      ok: true,
      runId: run.id,
      traceId: run.traceId ?? traceContext.traceId,
      chatId: result.chatId || tid,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Gateway unreachable";
    await markAgentRunFailedAsync(run.id, tid, msg, "runtime_unreachable", {
      errorDetail: gatewayErrorDetail(msg),
    });
    console.error("[mc-chat] Forward error:", msg);
    clearStatus(tid);
    addMessage(
      tid,
      "bot",
      "No he podido conectar con el gateway de agentes. El mensaje quedó guardado, pero no se ha iniciado ninguna ejecución.",
      "sancho",
      undefined,
      undefined,
      undefined,
      undefined,
      gatewayErrorDetail(msg),
    );
    res.status(502).json({ error: "Gateway unreachable: " + msg });
  }
}

const sessionAuthed = compose(withErrorHandler, withAuth)(sendHandler);
const runtimeAuthed = withErrorHandler(
  async (req: NextApiRequest, res: NextApiResponse) => {
    const expected = getRuntime().messaging.getSharedSecret?.();
    const supplied = Array.isArray(req.headers["x-mc-secret"])
      ? req.headers["x-mc-secret"][0]
      : req.headers["x-mc-secret"];
    if (!expected)
      return res.status(503).json({ error: "MC_CHAT_SECRET not configured" });
    if (!supplied || supplied !== expected)
      return res.status(403).json({ error: "Forbidden" });
    return sendHandler(req, res);
  },
);

export default function entry(req: NextApiRequest, res: NextApiResponse) {
  // Runtime/plugin calls always carry X-MC-Secret. Browser calls use the
  // authenticated session and are scoped to their permitted client slug.
  if (req.headers["x-mc-secret"] !== undefined) return runtimeAuthed(req, res);
  return sessionAuthed(req, res);
}
