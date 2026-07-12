import type { NextApiRequest, NextApiResponse } from "next";
import { createHash } from "node:crypto";
import { withErrorHandler } from "@/lib/api-middleware";
import { getRuntime } from "@/lib/runtime";
import { appendAgentRunEvent, claimAgentRunCallbackFingerprint, getAgentRunById, getLatestActiveRun, listAgentRunEvents, markAgentRunCompleted, markAgentRunFailed } from "@/lib/data/agent-runs";
import { persistCausalArtifactReadbacks } from "@/lib/quality/artifact-readback";
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
import { dispatchRuntimeControlActions, type RuntimeControlTurnContext } from "@/lib/runtime/control-actions";
import { parseRuntimeControlReply } from "@/lib/runtime/agent-contract/control-reply.mjs";

// How long after a successful bot reply we should treat a watchdog_abort on
// the same thread as a stale runtime echo and drop it. Empirically the gap
// observed in production is in the 20-ms range; 5 s is generous without ever
// hiding a real subsequent timeout.
const STALE_WATCHDOG_WINDOW_MS = 5000;

// Persisted callback fingerprints provide retry idempotency. This process-local
// set distinguishes a genuinely concurrent retry from recovery after a crash
// or exception that persisted the fingerprint before terminal completion.
const TERMINAL_CALLBACKS_IN_FLIGHT = new Set<string>();

const PROGRESS_KINDS: ReadonlySet<ProgressKind> = new Set(["thinking", "tool_call", "file_write", "agent_handoff", "search", "read"]);

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
export async function webhookHandler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  // Verify shared secret
  const secret = getRuntime().messaging.getSharedSecret?.();
  if (!secret) {
    return res.status(503).json({ error: "MC_CHAT_SECRET not configured" });
  }
  const suppliedSecret = Array.isArray(req.headers["x-mc-secret"]) ? req.headers["x-mc-secret"][0] : req.headers["x-mc-secret"];
  if (suppliedSecret !== secret) {
    return res.status(403).json({ error: "Forbidden" });
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { slug, threadId, missionControlRunId, text, agent, ts: _ts, role, event, from_agent, to_agent, errorDetail: rawErrorDetail } = req.body;
  // Compose canonical "<slug>:<shortId>" thread key.
  // Outbound callers may post threadId as either the full "<slug>:<shortId>"
  // (e.g. from src/pages/api/chat/send.ts and plugin index.js deliver) or just
  // the shortId (e.g. from plugin channel.js attachedResults.sendText, which
  // parses chatId "channel:mc-chat:<slug>:<shortId>" and forwards slug + shortId
  // separately). Without this normalization, threadFile() in lib/data/mc-chat.ts
  // splits on ":" and writes to brand/<shortId>/chat/general.json — i.e. the
  // wrong client. Always re-attach the slug when missing.
  const slugPrefix = slug ? `${slug}:` : "";
  const tid = threadId ? (slug && !threadId.startsWith(slugPrefix) ? `${slugPrefix}${threadId}` : threadId) : `${slug || "default"}:general`;
  const claimedRunId = typeof missionControlRunId === "string" && missionControlRunId.trim() ? missionControlRunId.trim() : undefined;
  const exactRun = claimedRunId ? getAgentRunById(claimedRunId) : null;
  if (claimedRunId && (!exactRun || exactRun.threadId !== tid)) {
    return res.status(409).json({ error: "Runtime callback run does not match this thread" });
  }
  // Cancelled runs are tombstones: no late callback may recreate a response.
  if (claimedRunId && exactRun?.status === "cancelled") {
    consumeCancelled(tid, getThread(tid).messages);
    return res.status(200).json({
      ok: true,
      cancelled: true,
      runId: exactRun.id,
    });
  }
  const isTerminalDelivery = role !== "status" && role !== "progress" && role !== "system" && role !== "handoff";
  // A run may legitimately produce multiple visible parts, but an HTTP retry
  // repeats the same payload. Claim a content fingerprint before persistence:
  // identical retries become no-ops while distinct multipart text remains.
  let terminalCallbackClaim: string | undefined;
  if (claimedRunId && exactRun && isTerminalDelivery) {
    const callbackFingerprint = createHash("sha256")
      .update(
        JSON.stringify({
          role: role || "bot",
          text,
          agent,
          errorDetail: rawErrorDetail,
        }),
      )
      .digest("hex");
    const claimKey = `${exactRun.id}:${callbackFingerprint}`;
    const newlyClaimed = claimAgentRunCallbackFingerprint(exactRun.id, callbackFingerprint);
    const currentRun = getAgentRunById(exactRun.id);
    if (!newlyClaimed && (TERMINAL_CALLBACKS_IN_FLIGHT.has(claimKey) || !currentRun || ["completed", "failed", "cancelled"].includes(currentRun.status))) {
      return res.status(200).json({ ok: true, duplicate: true, runId: exactRun.id });
    }
    // If the fingerprint exists but the run is still active, the previous
    // process died (or threw) after claiming and before completing. Re-enter
    // the callback so transport replay can finish the run.
    TERMINAL_CALLBACKS_IN_FLIGHT.add(claimKey);
    terminalCallbackClaim = claimKey;
  } else if (claimedRunId && exactRun && ["completed", "failed"].includes(exactRun.status)) {
    return res.status(200).json({ ok: true, stale: true, runId: exactRun.id });
  }
  try {
    // Legacy callbacks remain visible during a rolling deploy, but without a
    // run id there is no causal basis for mutating any ledger run—even when one
    // run happens to be active on the thread.
    const callbackRun = exactRun;
    const latestActiveRun = getLatestActiveRun(tid);
    const callbackRunWasActive = callbackRun?.status === "queued" || callbackRun?.status === "running";
    const ownsLiveThreadState = Boolean(callbackRunWasActive && latestActiveRun && callbackRun?.id === latestActiveRun.id);

    // Status updates: cache for polling, don't store in messages
    if (role === "status") {
      if (ownsLiveThreadState || !claimedRunId) {
        setStatusEntry(tid, { text, agent, ts: Date.now() });
      }
      return res.status(200).json({
        ok: true,
        stale: Boolean(claimedRunId && !ownsLiveThreadState),
      });
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
      const kind: ProgressKind | undefined = raw?.kind && PROGRESS_KINDS.has(raw.kind) ? raw.kind : undefined;
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
      if (ownsLiveThreadState || !claimedRunId) appendProgress(tid, evt);
      if (callbackRunWasActive && callbackRun) {
        appendAgentRunEvent({
          runId: callbackRun.id,
          threadId: tid,
          type: "progress",
          data: evt,
        });
      }
      return res.status(200).json({ ok: true });
    }

    // Bot response: only the exact currently-live run owns thread-level typing
    // and progress. Late/multipart callbacks still become visible messages, but
    // can no longer clear or seal a newer run's state.
    if (ownsLiveThreadState || !claimedRunId) clearStatus(tid);
    const existing = getThread(tid);
    if ((ownsLiveThreadState || !claimedRunId) && consumeCancelled(tid, existing.messages)) {
      clearProgress(tid);
      console.log(`[mc-chat] Bot response discarded (cancelled): ${tid}`);
      return res.status(200).json({ ok: true, cancelled: true });
    }

    const sealed = ownsLiveThreadState || !claimedRunId ? sealProgress(tid) : [];
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
        return res.status(200).json({
          ok: true,
          suppressed: "stale_watchdog_after_success",
          progressCount: sealed.length,
        });
      }
    }
    let botText = typeof text === "string" ? text : "";
    let parsedControl: ReturnType<typeof parseRuntimeControlReply> | null = null;
    let controlContext: RuntimeControlTurnContext | null = null;
    if (callbackRunWasActive && callbackRun && callbackRun.runtime !== "openclaw" && !errorDetail) {
      const input = callbackRun.input && typeof callbackRun.input === "object" ? (callbackRun.input as Record<string, unknown>) : {};
      controlContext = {
        slug: typeof input.slug === "string" ? input.slug : String(slug || "default"),
        threadId: tid,
        missionControlRunId: callbackRun.id,
        controlDepth: input.controlDepth === 1 ? 1 : 0,
        threadName: typeof input.threadName === "string" ? input.threadName : tid,
        respondingAgent: typeof agent === "string" ? agent : callbackRun.agent || "sancho",
        temporaryAgent: input.temporaryAgent === true,
        userText: typeof input.userText === "string" ? input.userText : "",
        userId: typeof input.userId === "string" ? input.userId : undefined,
        userName: typeof input.userName === "string" ? input.userName : undefined,
        isAdmin: input.isAdmin === true,
        senderRole: input.senderRole === "admin" ? "admin" : "client",
        source: typeof input.source === "string" ? input.source : undefined,
        linkedTo: typeof input.linkedTo === "string" ? input.linkedTo : undefined,
        docPath: typeof input.docPath === "string" ? input.docPath : undefined,
        docKind: typeof input.docKind === "string" ? input.docKind : undefined,
        attachments: Array.isArray(input.attachments) ? input.attachments : undefined,
      };
      parsedControl = parseRuntimeControlReply(botText, {
        respondingAgent: controlContext.respondingAgent,
        temporaryAgent: controlContext.temporaryAgent,
      });
      botText = parsedControl.text;
    }
    let terminalRunOutput: Record<string, unknown> | undefined;
    if (callbackRunWasActive && callbackRun) {
      let artifactReadbackCount = 0;
      if (!errorDetail) {
        try {
          const readbacks = await persistCausalArtifactReadbacks(callbackRun, tid.slice(0, tid.indexOf(":")), listAgentRunEvents(callbackRun.id));
          artifactReadbackCount = readbacks.length;
        } catch (error) {
          // A failed quality readback must fail closed (unverified) without
          // suppressing the user-visible runtime response.
          console.warn(`[quality-evidence] artifact readback failed for ${callbackRun.id}:`, error instanceof Error ? error.message : error);
        }
      }
      terminalRunOutput = {
        agent,
        text: botText.slice(0, 4096),
        progressCount: sealed.length,
        artifactReadbackCount,
        errorDetail,
      };
    }
    // Persist the visible delivery before terminalizing the ledger. If the
    // process dies between these writes, replay sees the active run, deduplicates
    // this message by deliveryKey, and safely finishes the ledger transition.
    addMessage(tid, "bot", botText, agent, undefined, sealed, undefined, undefined, errorDetail, terminalCallbackClaim);
    if (callbackRunWasActive && callbackRun && terminalRunOutput) {
      if (errorDetail) {
        markAgentRunFailed(callbackRun.id, tid, errorDetail.category, "failed", terminalRunOutput);
      } else {
        markAgentRunCompleted(callbackRun.id, tid, terminalRunOutput);
      }
    }
    if (parsedControl && controlContext) {
      const controlled = await dispatchRuntimeControlActions(parsedControl, controlContext, { secret });
      for (const followup of controlled.followupMessages) addMessage(tid, "bot", followup, "sancho");
    }
    console.log(`[mc-chat] Bot response → ${tid}: ${botText.slice(0, 60)} (${sealed.length} progress events${errorDetail ? `, errorDetail=${errorDetail.category}` : ""})`);
    return res.status(200).json({
      ok: true,
      messageId: `mc-${Date.now()}`,
      progressCount: sealed.length,
    });
  } finally {
    if (terminalCallbackClaim) TERMINAL_CALLBACKS_IN_FLIGHT.delete(terminalCallbackClaim);
  }
}

export default withErrorHandler(webhookHandler);
