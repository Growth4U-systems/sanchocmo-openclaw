import type { NextApiRequest, NextApiResponse } from "next";
import { createHash } from "node:crypto";
import {
  canAccessSlug,
  compose,
  withAuth,
  withErrorHandler,
} from "@/lib/api-middleware";
import {
  addMessage,
  clearStatus,
  getThread,
  getThreadRouting,
  setThreadRouting,
  setStatusEntry,
  type ChatAttachment,
  type ErrorDetail,
} from "@/lib/data/mc-chat";
import { maybeMarkClarifyAnswered } from "@/lib/clarify-autostatus";
import { resolveNamespaceThreadConfig } from "@/lib/chat-openers";
import { resolveTaskThreadExecutionRoute } from "@/lib/data/task-routing";
import { getRuntime, type InboundMessage } from "@/lib/runtime";
import {
  resolveAgentTurnPolicy,
  toThreadRouting,
} from "@/lib/runtime/agent-execution-policy";
import {
  createAgentRun,
  getAgentRunByIdempotencyKey,
  markAgentRunCompleted,
  markAgentRunDispatched,
  markAgentRunFailed,
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
import { dispatchOutboundCommand } from "@/lib/yalc/outbound-command";
import { resolveYalcConfig } from "@/lib/yalc/client";

function normalizedIdempotencyKey(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const key = value.trim();
  return key && key.length <= 240 && !/[\r\n\0]/.test(key) ? key : undefined;
}

function gatewayErrorDetail(raw: string): ErrorDetail {
  return {
    category: "network",
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
  const host = Array.isArray(req.headers.host) ? req.headers.host[0] : req.headers.host;
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
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

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
  } = req.body;

  if (!slug || !text) {
    return res.status(400).json({ error: "Missing slug or text" });
  }

  const runtime = getRuntime();
  const sharedSecret = runtime.messaging.getSharedSecret?.();
  const suppliedSecret = Array.isArray(req.headers["x-mc-secret"])
    ? req.headers["x-mc-secret"][0]
    : req.headers["x-mc-secret"];
  const trustedRuntimeRequest = Boolean(
    sharedSecret && suppliedSecret && suppliedSecret === sharedSecret,
  );
  if (!trustedRuntimeRequest && !canAccessSlug(req.ctx, String(slug))) {
    return res.status(403).json({ error: "Forbidden" });
  }
  if (temporaryAgent === true) {
    if (typeof agent !== "string" || agent.trim().toLowerCase() !== "sancho") {
      return res.status(400).json({ error: "temporaryAgent is only valid for Sancho" });
    }
    if (!sharedSecret) {
      return res.status(503).json({ error: "Temporary intervention requires MC_CHAT_SECRET" });
    }
    if (!trustedRuntimeRequest) {
      return res.status(403).json({ error: "Temporary intervention requires a trusted runtime request" });
    }
  }
  if (trustedRuntimeRequest && claimedControlDepth !== undefined && claimedControlDepth !== 0 && claimedControlDepth !== 1) {
    return res.status(400).json({ error: "controlDepth must be 0 or 1" });
  }
  const controlDepth: 0 | 1 = trustedRuntimeRequest && claimedControlDepth === 1 ? 1 : 0;

  const tid = threadId || `${slug}:general`;
  const shortThreadId =
    typeof tid === "string" && tid.startsWith(`${slug}:`)
      ? tid.slice(String(slug).length + 1)
      : typeof tid === "string"
        ? tid
        : "";
  const persistedRoute = getThreadRouting(tid);
  const namespaceRoute = resolveNamespaceThreadConfig(slug, tid);
  const requestRoute = { agent, scope, skillMode, skill, skills };
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
  const taskExecutionRoute = taskExecution.kind === "task"
    ? taskExecution.route
    : undefined;
  const persistedExecutionRoute = !taskExecutionRoute && persistedRoute?.scope === "task"
    ? { ...persistedRoute, scope: "agent" as const, skillMode: "auto" as const }
    : persistedRoute;
  const requestedExecutionRoute = !taskExecutionRoute && requestRoute.scope === "task"
    ? { ...requestRoute, scope: "agent" as const, skillMode: "auto" as const }
    : requestRoute;
  const turnPolicy = resolveAgentTurnPolicy([
    // The current task record is authoritative for its primary skill and
    // allowlist. Persisted ownership then wins over browser metadata.
    taskExecutionRoute ?? {},
    persistedExecutionRoute ?? requestedExecutionRoute,
    requestedExecutionRoute,
    namespaceRoute ?? {},
    shortThreadId === "yalc"
      ? { agent: "rocinante", scope: "agent", skill: "yalc-operator" }
      : {},
  ], { temporaryAgent, agent });
  const policy = turnPolicy.policy;
  const isTemporarySancho = turnPolicy.temporarySancho;
  const resolvedAgent = policy.agent;
  const resolvedSkill = policy.skillHint;
  const resolvedPrimarySkill = policy.scope === "task"
    ? taskExecutionRoute?.skill
    : policy.scope === "skill"
      ? policy.skillHint
      : undefined;
  const effectiveSkills = policy.availableSkills;
  const parsedAttachments: ChatAttachment[] | undefined =
    Array.isArray(attachments) && attachments.length > 0 ? attachments : undefined;

  // Runtime follow-ups preserve the original principal, but browser JSON never
  // chooses a sender id and a trusted client can never claim the reserved admin
  // sender. OpenClaw applies the same rule again at its tool boundary.
  const isAdmin = trustedRuntimeRequest
    ? claimedIsAdmin === true && claimedSenderRole === "admin"
    : req.ctx?.isAdmin === true;
  const senderRole: "admin" | "client" = isAdmin ? "admin" : "client";
  const resolvedUserId = resolveChatUserId({
    trustedRuntimeRequest,
    isAdmin,
    slug: String(slug),
    claimedUserId: userId,
  });
  const resolvedUserName = userName || (isAdmin ? "Admin" : slug);
  const acceptedIdempotencyKey = trustedRuntimeRequest
    ? normalizedIdempotencyKey(claimedIdempotencyKey)
    : undefined;
  if (trustedRuntimeRequest && claimedIdempotencyKey !== undefined && !acceptedIdempotencyKey) {
    return res.status(400).json({ error: "Invalid idempotencyKey" });
  }

  // Persist ownership before any deterministic early return so a reload
  // between opening the chooser and selecting an option keeps the same route.
  if (turnPolicy.persistRoute) setThreadRouting(tid, toThreadRouting(policy));

  if (isOutboundCampaignStartPrompt(text)) {
    addMessage(tid, "user", String(text), undefined, parsedAttachments);
    const prepared = buildOutboundCampaignOptions(String(slug));
    addMessage(tid, "bot", prepared.message, resolvedAgent || "rocinante");
    return res.status(200).json({
      ok: prepared.ok,
      deterministic: true,
      chatId: tid,
      ...(!prepared.ok ? { error: "Foundation outbound configuration unavailable" } : {}),
    });
  }

  const outboundSelectionAttempt = /^\[ask:outbound_ecp_v1\]\s*respuesta:/m.test(String(text));
  const outboundChoice = resolveOutboundWorkflowChoice(getThread(tid), String(text));
  if (outboundSelectionAttempt && !outboundChoice) {
    addMessage(tid, "user", String(text), undefined, parsedAttachments);
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
    addMessage(tid, "user", String(text), undefined, parsedAttachments);
    setStatusEntry(tid, {
      text: "Buscando empresas del ICP...",
      agent: resolvedAgent || "rocinante",
      ts: Date.now(),
    });
    try {
      const result = await dispatchOutboundCommand(resolveYalcConfig(String(slug)), {
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
      });
      clearStatus(tid);
      const campaignId = resultText(result.campaignId);
      const runId = resultText(result.runId);
      const accounts = result.accounts && typeof result.accounts === "object"
        ? result.accounts as Record<string, unknown>
        : {};
      const batch = result.batch && typeof result.batch === "object"
        ? result.batch as Record<string, unknown>
        : {};
      const startedText = result.async === true
        ? [
            `Inicié la campaña para **${outboundChoice.label}**.`,
            "",
            "El workflow buscará primero las empresas del ICP y después los roles objetivo dentro de esas empresas. No enviará ningún mensaje sin tu aprobación final.",
            campaignId ? `Campaña: \`${campaignId}\`` : "",
            runId ? `Run: \`${runId}\`` : "",
          ].filter(Boolean).join("\n")
        : [
            `Preparé la campaña para **${outboundChoice.label}**.`,
            `Empresas válidas: ${resultNumber(accounts.usableDomains) ?? 0}.`,
            `Contactos preparados: ${resultNumber(batch.itemCount) ?? 0}.`,
            "No se envió ningún mensaje.",
          ].join("\n");
      addMessage(tid, "bot", startedText, resolvedAgent || "rocinante");
      const { httpStatus: _httpStatus, ...payload } = result;
      return res.status(200).json({ ...payload, deterministic: true, chatId: tid });
    } catch (error) {
      clearStatus(tid);
      const message = error instanceof Error ? error.message : "No se pudo iniciar el workflow";
      addMessage(
        tid,
        "bot",
        `No pude iniciar la campaña: ${message}. No se envió ningún mensaje.`,
        resolvedAgent || "rocinante",
      );
      const status = typeof (error as { status?: unknown })?.status === "number"
        ? (error as { status: number }).status
        : 502;
      return res.status(status >= 400 && status <= 599 ? status : 502).json({ error: message });
    }
  }

  // Claim the retry key synchronously before any message/thread side effect.
  // Node handles the lookup + create without an await between them, so two
  // concurrent retries in this process cannot both create a run.
  if (acceptedIdempotencyKey) {
    const existingRun = getAgentRunByIdempotencyKey(tid, acceptedIdempotencyKey);
    if (existingRun) {
      const accepted = existingRun.status === "queued"
        || existingRun.status === "running"
        || existingRun.status === "completed";
      return res.status(accepted ? 200 : 409).json({
        ok: accepted,
        duplicate: true,
        runId: existingRun.id,
        status: existingRun.status,
        chatId: tid,
      });
    }
  }

  const run = createAgentRun({
    idempotencyKey: acceptedIdempotencyKey,
    threadId: tid,
    runtime: runtime.id,
    agent: resolvedAgent || "sancho",
    skill: resolvedSkill,
    skills: effectiveSkills,
    skillMode: policy.skillMode,
    input: {
      slug,
      threadId: tid,
      threadName: threadName || tid,
      text,
      linkedTo: linkedTo || undefined,
      docPath: docPath || undefined,
      docKind: typeof docKind === "string" ? docKind : undefined,
      source: _source,
      temporaryAgent: isTemporarySancho,
      controlDepth,
      trigger: isTemporarySancho ? "temporary_sancho" : undefined,
      userText: text,
      userId: resolvedUserId,
      userName: resolvedUserName,
      isAdmin,
      senderRole,
      attachments: parsedAttachments,
      scope: policy.scope,
      skillMode: policy.skillMode,
      primarySkill: resolvedPrimarySkill,
    },
  });

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
  try {
    const clarifyResult = maybeMarkClarifyAnswered(slug, tid, text);
    if (clarifyResult.marked) {
      console.log(`[clarify-autostatus] ${tid}: clarify_status → answered`);
    }
  } catch (e) {
    console.error("[clarify-autostatus] failed:", e instanceof Error ? e.message : e);
  }
  if (resolvedAgent) {
    setStatusEntry(tid, {
      text: isTemporarySancho
        ? "Sancho está interviniendo temporalmente..."
        : shortThreadId === "yalc"
          ? "YALC está preparando la respuesta..."
          : "El agente está pensando...",
      agent: resolvedAgent,
      ts: Date.now(),
    });
  }

  let pendingTaskRouteProposal = await getPendingTaskRouteProposal(slug, tid);
  if (pendingTaskRouteProposal && isExplicitTaskCreationRejection(text)) {
    await discardPendingTaskRouteProposal(slug, tid);
    pendingTaskRouteProposal = undefined;
  }

  const payload: InboundMessage = {
    slug,
    threadId: tid,
    missionControlRunId: run.id,
    controlDepth,
    threadName: threadName || tid,
    text,
    userId: resolvedUserId,
    userName: resolvedUserName,
    linkedTo: linkedTo || undefined,
    skill: resolvedSkill || undefined,
    primarySkill: resolvedPrimarySkill,
    skills: effectiveSkills || undefined,
    scope: policy.scope,
    skillMode: policy.skillMode,
    temporaryAgent: isTemporarySancho || undefined,
    taskRouteProposal: pendingTaskRouteProposal
      ? {
          id: pendingTaskRouteProposal.id,
          groupId: pendingTaskRouteProposal.groupId,
          agent: pendingTaskRouteProposal.agent,
          skill: pendingTaskRouteProposal.skill,
          skills: pendingTaskRouteProposal.skills,
          name: pendingTaskRouteProposal.name,
          brief: pendingTaskRouteProposal.brief,
        }
      : undefined,
    threadState: threadState || undefined,
    docPath: docPath || undefined,
    docKind: typeof docKind === "string" ? docKind : undefined,
    attachments: parsedAttachments,
    isAdmin,
    senderRole,
    _source,
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
    const result = await runtime.messaging.sendInbound(payload);
    if (!result.ok) {
      if (result.status === 0) {
        const msg = result.error || result.raw || "Gateway unreachable";
        markAgentRunFailed(run.id, tid, msg, "runtime_unreachable");
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
      markAgentRunFailed(run.id, tid, detail, "runtime_rejected", {
        status: result.status,
        raw: result.raw,
      });
      const userText =
        result.status === 403
          ? "No he podido entregar el mensaje al gateway de agentes: la firma compartida de MC Chat no coincide o falta. Revisa MC_CHAT_SECRET y reinicia el gateway."
          : `No he podido entregar el mensaje al gateway de agentes (${detail}).`;
      addMessage(tid, "bot", userText, "sancho", undefined, undefined, undefined, undefined, gatewayErrorDetail(detail));
      clearStatus(tid);
      console.error("[mc-chat] Gateway rejected message:", detail);
      return res.status(502).json({ error: "Gateway rejected message: " + detail });
    }
    markAgentRunDispatched(run.id, tid, {
      status: result.status,
      chatId: result.chatId || tid,
    });
    if (typeof result.finalText === "string") {
      const finalAgent = result.finalAgent || resolvedAgent || "sancho";
      const controlContext = {
        slug,
        threadId: tid,
        missionControlRunId: run.id,
        controlDepth,
        threadName: threadName || tid,
        respondingAgent: finalAgent,
        temporaryAgent: isTemporarySancho,
        userText: text,
        userId: resolvedUserId,
        userName: resolvedUserName,
        isAdmin,
        senderRole,
        source: _source,
        linkedTo: linkedTo || undefined,
        docPath: docPath || undefined,
        docKind: typeof docKind === "string" ? docKind : undefined,
        attachments: parsedAttachments,
      };
      const parsedControl = runtime.id === "openclaw"
        ? null
        : parseRuntimeControlReply(result.finalText, {
            respondingAgent: finalAgent,
            temporaryAgent: isTemporarySancho,
          });
      const visibleText = parsedControl?.text ?? result.finalText;
      clearStatus(tid);
      markAgentRunCompleted(run.id, tid, {
        agent: finalAgent,
        text: visibleText.slice(0, 4096),
        synchronous: true,
      });
      addMessage(tid, "bot", visibleText, finalAgent);
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
      return res.status(200).json({ ok: true, runId: run.id, chatId: result.chatId || tid, completed: true });
    }
    res.status(200).json({ ok: true, runId: run.id, chatId: result.chatId || tid });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Gateway unreachable";
    markAgentRunFailed(run.id, tid, msg, "runtime_unreachable");
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
const runtimeAuthed = withErrorHandler(async (req: NextApiRequest, res: NextApiResponse) => {
  const expected = getRuntime().messaging.getSharedSecret?.();
  const supplied = Array.isArray(req.headers["x-mc-secret"])
    ? req.headers["x-mc-secret"][0]
    : req.headers["x-mc-secret"];
  if (!expected) return res.status(503).json({ error: "MC_CHAT_SECRET not configured" });
  if (!supplied || supplied !== expected) return res.status(403).json({ error: "Forbidden" });
  return sendHandler(req, res);
});

export default function entry(req: NextApiRequest, res: NextApiResponse) {
  // Runtime/plugin calls always carry X-MC-Secret. Browser calls use the
  // authenticated session and are scoped to their permitted client slug.
  if (req.headers["x-mc-secret"] !== undefined) return runtimeAuthed(req, res);
  return sessionAuthed(req, res);
}
