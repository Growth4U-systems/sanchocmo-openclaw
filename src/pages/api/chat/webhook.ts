import type { NextApiRequest, NextApiResponse } from "next";
import { withErrorHandler } from "@/lib/api-middleware";
import { getRuntime } from "@/lib/runtime";
import {
  appendAgentRunEvent,
  getLatestActiveRun,
  markAgentRunCompleted,
  markAgentRunFailed,
} from "@/lib/data/agent-runs";
import {
  setStatusEntry,
  clearStatus,
  consumeCancelled,
  addMessage,
  appendProgress,
  sealProgress,
  clearProgress,
  normalizeErrorDetail,
  isStaleWatchdogAfterRecentSuccess,
  getThread,
  type ProgressEvent,
  type ProgressKind,
} from "@/lib/data/mc-chat";

// How long after a successful bot reply we should treat a watchdog_abort on
// the same thread as a stale runtime echo and drop it. Empirically the gap
// observed in production is in the 20-ms range; 5 s is generous without ever
// hiding a real subsequent timeout.
const STALE_WATCHDOG_WINDOW_MS = 5000;

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
  const secret = getRuntime().messaging.getSharedSecret?.();
  if (secret && req.headers["x-mc-secret"] !== secret) {
    return res.status(403).json({ error: "Forbidden" });
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { slug, threadId, text, agent, ts: _ts, role, event, from_agent, to_agent, errorDetail: rawErrorDetail } = req.body;
  // Compose canonical "<slug>:<shortId>" thread key.
  // Outbound callers may post threadId as either the full "<slug>:<shortId>"
  // (e.g. from src/pages/api/chat/send.ts and plugin index.js deliver) or just
  // the shortId (e.g. from plugin channel.js attachedResults.sendText, which
  // parses chatId "channel:mc-chat:<slug>:<shortId>" and forwards slug + shortId
  // separately). Without this normalization, threadFile() in lib/data/mc-chat.ts
  // splits on ":" and writes to brand/<shortId>/chat/general.json — i.e. the
  // wrong client. Always re-attach the slug when missing.
  const slugPrefix = slug ? `${slug}:` : "";
  const tid = threadId
    ? (slug && !threadId.startsWith(slugPrefix) ? `${slugPrefix}${threadId}` : threadId)
    : `${slug || "default"}:general`;

  // Status updates: cache for polling, don't store in messages
  if (role === "status") {
    setStatusEntry(tid, { text, agent, ts: Date.now() });
    return res.status(200).json({ ok: true });
  }

  // System messages are visible timeline notes, not bot replies. They should
  // not clear typing/progress state or consume a cancellation marker.
  if (role === "system") {
    addMessage(tid, "system", typeof text === "string" ? text : "", agent);
    return res.status(200).json({ ok: true });
  }

  // Handoff messages: persisted as a formal message with both badges in the sidebar
  if (role === "handoff") {
    if (typeof from_agent !== "string" || typeof to_agent !== "string") {
      return res.status(400).json({ error: "handoff requires from_agent and to_agent" });
    }
    addMessage(tid, "handoff", typeof text === "string" ? text : "", agent, undefined, undefined, from_agent, to_agent);
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
    const activeRun = getLatestActiveRun(tid);
    if (activeRun) {
      appendAgentRunEvent({
        runId: activeRun.id,
        threadId: tid,
        type: "progress",
        data: evt,
      });
    }
    return res.status(200).json({ ok: true });
  }

  // Bot response: seal the running timeline into this message, then store
  clearStatus(tid);
  const existing = getThread(tid);
  if (consumeCancelled(tid, existing.messages)) {
    clearProgress(tid);
    console.log(`[mc-chat] Bot response discarded (cancelled): ${tid}`);
    return res.status(200).json({ ok: true, cancelled: true });
  }

  const sealed = sealProgress(tid);
  // Optional errorDetail produced by the mc-chat plugin's error-rewriter.
  // Normalize defensively — a malformed detail must not prevent the bot
  // message itself from being persisted.
  const errorDetail = rawErrorDetail !== undefined ? normalizeErrorDetail(rawErrorDetail) : undefined;
  if (rawErrorDetail !== undefined && !errorDetail) {
    console.warn(`[mc-chat] dropped malformed errorDetail on thread ${tid}`);
  }
  // Drop stale watchdog_abort messages that arrive right after a successful
  // bot reply on the same thread (runtime sometimes emits a leftover abort
  // event 20 ms after a successful deliver — pure noise that confuses users).
  if (errorDetail?.category === "watchdog_abort") {
    if (isStaleWatchdogAfterRecentSuccess(existing.messages, Date.now(), STALE_WATCHDOG_WINDOW_MS)) {
      console.log(`[mc-chat] suppressed stale watchdog_abort on ${tid} (recent success within ${STALE_WATCHDOG_WINDOW_MS}ms)`);
      // Still consume the sealed progress so the next reply starts from clean
      // state. No addMessage call.
      return res.status(200).json({ ok: true, suppressed: "stale_watchdog_after_success", progressCount: sealed.length });
    }
  }
  const activeRun = getLatestActiveRun(tid);
  if (activeRun) {
    const output = {
      agent,
      text: typeof text === "string" ? text.slice(0, 4096) : "",
      progressCount: sealed.length,
      errorDetail,
    };
    if (errorDetail) {
      markAgentRunFailed(activeRun.id, tid, errorDetail.category, "failed", output);
    } else {
      markAgentRunCompleted(activeRun.id, tid, output);
    }
  }
  addMessage(tid, "bot", text, agent, undefined, sealed, undefined, undefined, errorDetail);
  console.log(`[mc-chat] Bot response → ${tid}: ${(text || "").slice(0, 60)} (${sealed.length} progress events${errorDetail ? `, errorDetail=${errorDetail.category}` : ""})`);
  res.status(200).json({ ok: true, messageId: `mc-${Date.now()}`, progressCount: sealed.length });
}

export default withErrorHandler(handler);
