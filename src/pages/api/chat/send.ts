import type { NextApiRequest, NextApiResponse } from "next";
import { withErrorHandler } from "@/lib/api-middleware";
import {
  addMessage,
  clearStatus,
  getGatewayUrl,
  getChatSecret,
  setStatusEntry,
  type ChatAttachment,
  type ErrorDetail,
} from "@/lib/data/mc-chat";
import { maybeMarkClarifyAnswered } from "@/lib/clarify-autostatus";
import { skillsOwnedBy } from "@/lib/skill-resolver";

async function readGatewayResponse(res: Response): Promise<{ chatId?: string; raw: string }> {
  const raw = await res.text();
  if (!raw) return { raw };
  try {
    const data = JSON.parse(raw) as { chatId?: string };
    return { chatId: data.chatId, raw };
  } catch {
    return { raw };
  }
}

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
  } = req.body;

  if (!slug || !text) {
    return res.status(400).json({ error: "Missing slug or text" });
  }

  const tid = threadId || `${slug}:general`;
  const rawAgent = typeof agent === "string" && agent.trim() ? agent.trim() : undefined;
  const shortThreadId =
    typeof tid === "string" && tid.startsWith(`${slug}:`)
      ? tid.slice(String(slug).length + 1)
      : typeof tid === "string"
        ? tid
        : "";
  const resolvedAgent = rawAgent || (shortThreadId === "yalc" ? "rocinante" : undefined);
  const resolvedSkill = skill || (shortThreadId === "yalc" ? "yalc-operator" : undefined);
  const resolvedSkills =
    Array.isArray(skills) && skills.length > 0
      ? skills
      : resolvedSkill
        ? [resolvedSkill]
        : undefined;
  // SAN-327 — agent-scoped (broad) threads let the owning specialist use ANY of
  // its own skills in the same thread. Widen the skill set to the agent's full
  // owned set (seed skill first), so the gateway can tell the agent its whole
  // toolset instead of just the seed skill. Narrow threads stay untouched, and
  // the default agent (sancho) is excluded — it delegates rather than widens.
  const isAgentScope =
    scope === "agent" && !!resolvedAgent && resolvedAgent !== "sancho";
  const effectiveSkills = isAgentScope
    ? Array.from(
        new Set([
          ...(resolvedSkill ? [resolvedSkill] : []),
          ...skillsOwnedBy(resolvedAgent),
          ...(resolvedSkills ?? []),
        ]),
      )
    : resolvedSkills;
  const parsedAttachments: ChatAttachment[] | undefined =
    Array.isArray(attachments) && attachments.length > 0 ? attachments : undefined;

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

  // Forward to Gateway mc-chat plugin
  const secret = getChatSecret();
  const payload = {
    slug,
    threadId: tid,
    threadName: threadName || tid,
    text,
    userId: resolvedUserId,
    userName: userName || (isAdmin ? "Admin" : slug),
    linkedTo: linkedTo || undefined,
    skill: resolvedSkill || undefined,
    skills: effectiveSkills || undefined,
    // SAN-327 — when "agent", the gateway frames the seed skill as a starting
    // suggestion and tells the agent it can use any of `skills` in this thread.
    scope: isAgentScope ? "agent" : undefined,
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
    const gwRes = await fetch(`${getGatewayUrl()}/mc-chat/inbound`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(secret ? { "X-MC-Secret": secret } : {}),
      },
      body: JSON.stringify(payload),
    });
    const data = await readGatewayResponse(gwRes);
    if (!gwRes.ok) {
      const detail = `HTTP ${gwRes.status}${data.raw ? `: ${data.raw.slice(0, 500)}` : ""}`;
      const userText =
        gwRes.status === 403
          ? "No he podido entregar el mensaje al gateway de agentes: la firma compartida de MC Chat no coincide o falta. Revisa MC_CHAT_SECRET y reinicia el gateway."
          : `No he podido entregar el mensaje al gateway de agentes (${detail}).`;
      addMessage(tid, "bot", userText, "sancho", undefined, undefined, undefined, undefined, gatewayErrorDetail(detail));
      clearStatus(tid);
      console.error("[mc-chat] Gateway rejected message:", detail);
      return res.status(502).json({ error: "Gateway rejected message: " + detail });
    }
    res.status(200).json({ ok: true, chatId: data.chatId || tid });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Gateway unreachable";
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
