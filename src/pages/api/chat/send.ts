import type { NextApiRequest, NextApiResponse } from "next";
import { withErrorHandler } from "@/lib/api-middleware";
import {
  addMessage,
  clearStatus,
  getThreadRouting,
  setThreadRouting,
  setStatusEntry,
  type ChatAttachment,
  type ErrorDetail,
} from "@/lib/data/mc-chat";
import { maybeMarkClarifyAnswered } from "@/lib/clarify-autostatus";
import { resolveNamespaceThreadConfig } from "@/lib/chat-openers";
import { getRuntime, type InboundMessage } from "@/lib/runtime";
import {
  resolveAgentExecutionPolicy,
  toThreadRouting,
} from "@/lib/runtime/agent-execution-policy";
import {
  createAgentRun,
  markAgentRunCompleted,
  markAgentRunDispatched,
  markAgentRunFailed,
} from "@/lib/data/agent-runs";

function gatewayErrorDetail(raw: string): ErrorDetail {
  return {
    category: "network",
    raw: raw.slice(0, 4096),
    classifiedAt: Date.now(),
  };
}

/**
 * POST /api/chat/send (was /api/mc-chat/send)
 * Ported from mc-server.js:5079-5132
 * Sends a message from the frontend, stores locally, forwards to gateway
 */
async function handler(req: NextApiRequest, res: NextApiResponse) {
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
  } = req.body;

  if (!slug || !text) {
    return res.status(400).json({ error: "Missing slug or text" });
  }

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
  const policy = resolveAgentExecutionPolicy([
    // Once established, server-side ownership wins over stale browser
    // metadata from another entry surface. A future intentional reroute should
    // be an explicit server operation, never an accidental message side effect.
    persistedRoute ?? requestRoute,
    namespaceRoute ?? {},
    shortThreadId === "yalc"
      ? { agent: "rocinante", scope: "agent", skill: "yalc-operator" }
      : {},
  ]);
  const resolvedAgent = policy.agent;
  const resolvedSkill = policy.skillHint;
  const effectiveSkills = policy.availableSkills;
  const parsedAttachments: ChatAttachment[] | undefined =
    Array.isArray(attachments) && attachments.length > 0 ? attachments : undefined;

  // Agent ownership and auto/pinned policy are server state, not browser
  // state. Persist the route before the message so Discord, callbacks and a
  // reopened tab continue with the same agent while re-evaluating skills.
  setThreadRouting(tid, toThreadRouting(policy));

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
      text: shortThreadId === "yalc" ? "YALC está preparando la respuesta..." : "El agente está pensando...",
      agent: resolvedAgent,
      ts: Date.now(),
    });
  }

  // Dashboard UI doesn't send _source → treated as admin (unchanged behavior).
  // mc-chat plugin relays Discord messages with _source: "discord" → client role
  // so the gateway doesn't re-relay the reply back to Discord (see plugin
  // index.js outbound callback, which skips relay when _source === "discord").
  const isAdmin = _source !== "discord";
  const senderRole = isAdmin ? "admin" : "client";
  const resolvedUserId = userId || (isAdmin ? "mc-admin" : `mc-client-${slug}`);

  const runtime = getRuntime();
  const payload: InboundMessage = {
    slug,
    threadId: tid,
    threadName: threadName || tid,
    text,
    userId: resolvedUserId,
    userName: userName || (isAdmin ? "Admin" : slug),
    linkedTo: linkedTo || undefined,
    skill: resolvedSkill || undefined,
    skills: effectiveSkills || undefined,
    scope: policy.scope,
    skillMode: policy.skillMode,
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
  const run = createAgentRun({
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
      scope: policy.scope,
      skillMode: policy.skillMode,
    },
  });

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
      clearStatus(tid);
      markAgentRunCompleted(run.id, tid, {
        agent: finalAgent,
        text: result.finalText.slice(0, 4096),
        synchronous: true,
      });
      addMessage(tid, "bot", result.finalText, finalAgent);
      return res.status(200).json({ ok: true, chatId: result.chatId || tid, completed: true });
    }
    res.status(200).json({ ok: true, chatId: result.chatId || tid });
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

export default withErrorHandler(handler);
