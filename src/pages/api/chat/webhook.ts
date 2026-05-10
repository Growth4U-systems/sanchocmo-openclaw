import type { NextApiRequest, NextApiResponse } from "next";
import { withErrorHandler } from "@/lib/api-middleware";
import {
  getChatSecret,
  setStatusEntry,
  clearStatus,
  consumeCancelled,
  addMessage,
  appendProgress,
  sealProgress,
  clearProgress,
  type ProgressEvent,
  type ProgressKind,
} from "@/lib/data/mc-chat";

const PROGRESS_KINDS: ReadonlySet<ProgressKind> = new Set([
  "thinking",
  "tool_call",
  "file_write",
  "agent_handoff",
  "search",
  "read",
]);

/**
 * POST /api/chat/webhook (was /webhook/mc-chat/response)
 * Ported from mc-server.js:5001-5041
 * Receives bot responses from the gateway plugin
 *
 * Roles:
 *   - "status"   → ephemeral one-line "thinking…" indicator (legacy)
 *   - "progress" → granular timeline event (tool_call, file_write, …)
 *   - default    → final bot reply, seals pending progress into the message
 */
async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  // Verify shared secret
  const secret = getChatSecret();
  if (secret && req.headers["x-mc-secret"] !== secret) {
    return res.status(403).json({ error: "Forbidden" });
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { slug, threadId, text, agent, ts: _ts, role, event } = req.body;
  const tid = threadId || `${slug || "default"}:general`;

  // Status updates: cache for polling, don't store in messages
  if (role === "status") {
    setStatusEntry(tid, { text, agent, ts: Date.now() });
    return res.status(200).json({ ok: true });
  }

  // Progress events: append to the thread's running timeline
  if (role === "progress") {
    const raw = event && typeof event === "object" ? event : null;
    const kind: ProgressKind | undefined =
      raw?.kind && PROGRESS_KINDS.has(raw.kind) ? raw.kind : undefined;
    if (!kind) {
      return res.status(400).json({ error: "Invalid or missing event.kind" });
    }
    const evt: ProgressEvent = {
      kind,
      label: typeof raw?.label === "string" ? raw.label.slice(0, 200) : kind,
      detail: typeof raw?.detail === "string" ? raw.detail.slice(0, 1000) : undefined,
      target: typeof raw?.target === "string" ? raw.target.slice(0, 300) : undefined,
      agent: typeof agent === "string" ? agent : undefined,
      ts: Date.now(),
    };
    appendProgress(tid, evt);
    return res.status(200).json({ ok: true });
  }

  // Bot response: seal the running timeline into this message, then store
  clearStatus(tid);
  if (consumeCancelled(tid)) {
    clearProgress(tid);
    console.log(`[mc-chat] Bot response discarded (cancelled): ${tid}`);
    return res.status(200).json({ ok: true, cancelled: true });
  }

  const sealed = sealProgress(tid);
  addMessage(tid, "bot", text, agent, undefined, sealed);
  console.log(`[mc-chat] Bot response → ${tid}: ${(text || "").slice(0, 60)} (${sealed.length} progress events)`);
  res.status(200).json({ ok: true, messageId: `mc-${Date.now()}`, progressCount: sealed.length });
}

export default withErrorHandler(handler);
