import type { NextApiRequest, NextApiResponse } from "next";
import { withErrorHandler } from "@/lib/api-middleware";
import { addMessage, getGatewayUrl, getChatSecret, type ChatAttachment } from "@/lib/data/mc-chat";

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
    // dispatches to that agent (e.g. maese-pedro for Media Creation skills)
    // instead of falling back to the default agent.
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
    const data = await gwRes.json();
    res.status(200).json({ ok: true, chatId: data.chatId || tid });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Gateway unreachable";
    console.error("[mc-chat] Forward error:", msg);
    res.status(502).json({ error: "Gateway unreachable: " + msg });
  }
}

export default withErrorHandler(handler);
