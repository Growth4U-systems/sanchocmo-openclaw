import type { NextApiRequest, NextApiResponse } from "next";
import { withErrorHandler } from "@/lib/api-middleware";
import { addMessage, getGatewayUrl, getChatSecret } from "@/lib/data/mc-chat";

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
    linkedTo,
    skill,
    skills,
    threadState,
    docPath,
  } = req.body;

  if (!slug || !text) {
    return res.status(400).json({ error: "Missing slug or text" });
  }

  const tid = threadId || `${slug}:general`;

  // Store user message locally
  addMessage(tid, "user", text);

  const isAdmin = true; // TODO: check auth context in Phase 2
  const senderRole = isAdmin ? "admin" : "client";

  // Forward to Gateway mc-chat plugin
  const secret = getChatSecret();
  const payload = {
    slug,
    threadId: tid,
    threadName: threadName || tid,
    text,
    userId: isAdmin ? "mc-admin" : `mc-client-${slug}`,
    userName: userName || (isAdmin ? "Admin" : slug),
    linkedTo: linkedTo || undefined,
    skill: skill || undefined,
    skills: skills || undefined,
    threadState: threadState || undefined,
    docPath: docPath || undefined,
    isAdmin,
    senderRole,
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
