import type { NextApiRequest, NextApiResponse } from "next";
import { withErrorHandler } from "@/lib/api-middleware";
import {
  addMessage,
  getGatewayUrl,
  getChatSecret,
  type ChatAttachment,
  type ErrorDetail,
} from "@/lib/data/mc-chat";

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
  } = req.body;

  if (!slug || !text) {
    return res.status(400).json({ error: "Missing slug or text" });
  }

  const tid = threadId || `${slug}:general`;
  const parsedAttachments: ChatAttachment[] | undefined =
    Array.isArray(attachments) && attachments.length > 0 ? attachments : undefined;

  // Store user message locally
  addMessage(tid, "user", text, undefined, parsedAttachments);

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
    skill: skill || undefined,
    skills: skills || undefined,
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
    agentId: typeof agent === "string" ? agent : undefined,
    agent: typeof agent === "string" ? agent : undefined,
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
      console.error("[mc-chat] Gateway rejected message:", detail);
      return res.status(502).json({ error: "Gateway rejected message: " + detail });
    }
    res.status(200).json({ ok: true, chatId: data.chatId || tid });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Gateway unreachable";
    console.error("[mc-chat] Forward error:", msg);
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
