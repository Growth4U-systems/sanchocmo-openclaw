import type { NextApiRequest, NextApiResponse } from "next";
import {
  canAccessSlug,
  compose,
  withAuth,
  withErrorHandler,
} from "@/lib/api-middleware";
import { getThread, getStatusEntry, getPendingProgress } from "@/lib/data/mc-chat";
import { getLatestActiveRunAsync } from "@/lib/data/agent-runs";
import { parseThreadId } from "@/lib/thread-id";
import { getRuntime } from "@/lib/runtime";

/**
 * GET /api/chat/thread/:threadId
 * Ported from mc-server.js:5301-5314
 * Gets thread messages and current status
 */
export async function threadHandler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const threadId = typeof req.query.threadId === "string" ? req.query.threadId : "";
  if (!threadId) return res.status(400).json({ error: "Missing threadId" });
  const parsed = parseThreadId(threadId);
  if (!parsed) return res.status(400).json({ error: "Invalid threadId" });
  if (!canAccessSlug(req.ctx, parsed.slug)) {
    return res.status(403).json({ error: "Forbidden" });
  }

  const thread = getThread(threadId);
  const statusEntry = getStatusEntry(threadId);

  // Suppress status that's been superseded by a newer non-user message — protects
  // against a race where the webhook receives the bot reply between client polls
  // and clearStatus has fired but addMessage hasn't been read yet.
  let liveStatus = statusEntry;
  const STATUS_TTL_MS = 10 * 60 * 1000;
  if (liveStatus && Date.now() - liveStatus.ts > STATUS_TTL_MS) {
    liveStatus = null;
  }
  if (statusEntry && thread?.messages?.length) {
    let lastNonUserTs = 0;
    for (let i = thread.messages.length - 1; i >= 0; i--) {
      const m = thread.messages[i];
      if (m.role !== "user" && m.role !== "system" && typeof m.ts === "number") {
        lastNonUserTs = m.ts;
        break;
      }
    }
    if (lastNonUserTs >= statusEntry.ts) liveStatus = null;
  }

  const pendingProgress = getPendingProgress(threadId);
  const activeRun = await getLatestActiveRunAsync(threadId);

  res.status(200).json({
    ok: true,
    threadId,
    messages: thread?.messages || [],
    routing: thread?.routing || null,
    status: liveStatus,
    pendingProgress,
    activeRun: activeRun
      ? { id: activeRun.id, status: activeRun.status, createdAt: activeRun.createdAt }
      : null,
  });
}

const sessionAuthed = compose(withErrorHandler, withAuth)(threadHandler);
const runtimeAuthed = withErrorHandler(async (req: NextApiRequest, res: NextApiResponse) => {
  const expected = getRuntime().messaging.getSharedSecret?.();
  const supplied = Array.isArray(req.headers["x-mc-secret"])
    ? req.headers["x-mc-secret"][0]
    : req.headers["x-mc-secret"];
  if (!expected) return res.status(503).json({ error: "MC_CHAT_SECRET not configured" });
  if (!supplied || supplied !== expected) return res.status(403).json({ error: "Forbidden" });
  req.ctx = {
    isAdmin: true,
    clientSlug: null,
    allowedSlugs: null,
    adminToken: null,
    portalClient: null,
  };
  return threadHandler(req, res);
});

export default function entry(req: NextApiRequest, res: NextApiResponse) {
  if (req.headers["x-mc-secret"] !== undefined) return runtimeAuthed(req, res);
  return sessionAuthed(req, res);
}
