import type { NextApiRequest, NextApiResponse } from "next";
import { createHash, timingSafeEqual } from "node:crypto";
import { withErrorHandler } from "@/lib/api-middleware";
import { getRuntime } from "@/lib/runtime";
import {
  appendAgentRunEventAsync,
  claimAgentRunCallbackFingerprintAsync,
  getAgentRunByIdAsync,
  getLatestActiveRunAsync,
  listAgentRunEventsAsync,
  markAgentRunCompletedAsync,
  markAgentRunFailedAsync,
} from "@/lib/data/agent-runs";
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
import {
  dispatchRuntimeControlActions,
  type RuntimeControlTurnContext,
} from "@/lib/runtime/control-actions";
import { parseRuntimeControlReply } from "@/lib/runtime/agent-contract/control-reply.mjs";
import { authorizeRuntimeRunRequest } from "@/lib/runtime/runtime-run-request-authority";
import { authorizeChatAgentTurnRuntimeRequest } from "@/lib/runtime/chat-agent-turn-dispatch-authority";

// How long after a successful bot reply we should treat a watchdog_abort on
// the same thread as a stale runtime echo and drop it. Empirically the gap
// observed in production is in the 20-ms range; 5 s is generous without ever
// hiding a real subsequent timeout.
const STALE_WATCHDOG_WINDOW_MS = 5000;

// Persisted callback fingerprints provide retry idempotency. This process-local
// set distinguishes a genuinely concurrent retry from recovery after a crash
// or exception that persisted the fingerprint before terminal completion.
const TERMINAL_CALLBACKS_IN_FLIGHT = new Set<string>();
const TERMINAL_RUNS_IN_FLIGHT = new Set<string>();

const PROGRESS_KINDS: ReadonlySet<ProgressKind> = new Set([
  "thinking",
  "tool_call",
  "file_write",
  "agent_handoff",
  "search",
  "read",
]);

function singleHeader(req: NextApiRequest, name: string): string | undefined {
  const value = req.headers[name];
  return Array.isArray(value) ? undefined : value;
}

function safeSecretEqual(left: string | undefined, right: string): boolean {
  if (!left) return false;
  const supplied = Buffer.from(left);
  const expected = Buffer.from(right);
  return (
    supplied.length === expected.length && timingSafeEqual(supplied, expected)
  );
}

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
export async function webhookHandler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "POST")
    return res.status(405).json({ error: "Method not allowed" });

  // Verify shared secret
  const secret = getRuntime().messaging.getSharedSecret?.();
  if (!secret) {
    return res.status(503).json({ error: "MC_CHAT_SECRET not configured" });
  }
  if (!safeSecretEqual(singleHeader(req, "x-mc-secret"), secret)) {
    return res.status(403).json({ error: "Forbidden" });
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const {
    slug: rawSlug,
    threadId: rawThreadId,
    missionControlRunId,
    text,
    agent,
    ts: _ts,
    role,
    event,
    from_agent,
    to_agent,
    errorDetail: rawErrorDetail,
  } = req.body ?? {};
  const callbackAuthority = await authorizeRuntimeRunRequest(
    {
      runId: singleHeader(req, "x-mission-control-run-id"),
      capability: singleHeader(req, "x-sancho-run-capability"),
      dispatchRunId: singleHeader(req, "x-sancho-dispatch-run-id"),
      dispatchLeaseToken: singleHeader(req, "x-sancho-dispatch-lease-token"),
      allowTerminal: true,
    },
    {
      resolveAgentRun: getAgentRunByIdAsync,
      authorizeDispatchLease: (input) =>
        authorizeChatAgentTurnRuntimeRequest(input),
    },
  );
  if (!callbackAuthority) {
    return res
      .status(403)
      .json({ error: "Runtime callback authority invalid" });
  }
  const claimedRunId =
    typeof missionControlRunId === "string" ? missionControlRunId.trim() : "";
  const suppliedSlug = typeof rawSlug === "string" ? rawSlug.trim() : "";
  const suppliedThreadId =
    typeof rawThreadId === "string" ? rawThreadId.trim() : "";
  if (
    claimedRunId !== callbackAuthority.run.id ||
    suppliedSlug !== callbackAuthority.slug ||
    suppliedThreadId !== callbackAuthority.threadId
  ) {
    return res.status(409).json({
      error: "Runtime callback does not match its persisted run",
    });
  }
  const slug = callbackAuthority.slug;
  const tid = callbackAuthority.threadId;
  const exactRun = callbackAuthority.run;
  // Cancelled runs are tombstones: no late callback may recreate a response.
  if (exactRun.status === "cancelled") {
    consumeCancelled(tid, getThread(tid).messages);
    return res.status(200).json({
      ok: true,
      cancelled: true,
      runId: exactRun.id,
    });
  }
  const isTerminalDelivery =
    role !== "status" &&
    role !== "progress" &&
    role !== "system" &&
    role !== "handoff";
  // One run has one terminal result. Multipart replies are joined by the
  // runtime adapter before they reach this endpoint; any later terminal event
  // is stale noise and must not become another chat card.
  if (
    isTerminalDelivery &&
    (exactRun.status === "completed" || exactRun.status === "failed")
  ) {
    return res.status(200).json({ ok: true, stale: true, runId: exactRun.id });
  }
  // Claim before persistence so concurrent retries are no-ops, while a retry
  // after a crash can finish an active run without duplicating its chat card.
  let terminalCallbackClaim: string | undefined;
  let terminalRunClaim: string | undefined;
  if (isTerminalDelivery) {
    if (TERMINAL_RUNS_IN_FLIGHT.has(exactRun.id)) {
      return res.status(200).json({
        ok: true,
        duplicate: true,
        runId: exactRun.id,
      });
    }
    TERMINAL_RUNS_IN_FLIGHT.add(exactRun.id);
    terminalRunClaim = exactRun.id;
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
    let newlyClaimed: boolean;
    let currentRun;
    try {
      newlyClaimed = await claimAgentRunCallbackFingerprintAsync(
        exactRun.id,
        callbackFingerprint,
      );
      currentRun = await getAgentRunByIdAsync(exactRun.id);
    } catch (error) {
      TERMINAL_RUNS_IN_FLIGHT.delete(exactRun.id);
      throw error;
    }
    if (
      !newlyClaimed &&
      (TERMINAL_CALLBACKS_IN_FLIGHT.has(claimKey) ||
        !currentRun ||
        ["completed", "failed", "cancelled"].includes(currentRun.status))
    ) {
      TERMINAL_RUNS_IN_FLIGHT.delete(exactRun.id);
      return res
        .status(200)
        .json({ ok: true, duplicate: true, runId: exactRun.id });
    }
    // If the fingerprint exists but the run is still active, the previous
    // process died (or threw) after claiming and before completing. Re-enter
    // the callback so transport replay can finish the run.
    TERMINAL_CALLBACKS_IN_FLIGHT.add(claimKey);
    terminalCallbackClaim = claimKey;
  } else if (["completed", "failed"].includes(exactRun.status)) {
    return res.status(200).json({ ok: true, stale: true, runId: exactRun.id });
  }
  try {
    const callbackRun = exactRun;
    const latestActiveRun = await getLatestActiveRunAsync(tid);
    const callbackRunWasActive =
      callbackRun?.status === "queued" || callbackRun?.status === "running";
    const ownsLiveThreadState = Boolean(
      callbackRunWasActive &&
      latestActiveRun &&
      callbackRun?.id === latestActiveRun.id,
    );

    // Status updates: cache for polling, don't store in messages
    if (role === "status") {
      if (ownsLiveThreadState) {
        setStatusEntry(tid, { text, agent, ts: Date.now() });
      }
      return res.status(200).json({
        ok: true,
        stale: !ownsLiveThreadState,
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
        return res
          .status(400)
          .json({ error: "handoff requires from_agent and to_agent" });
      }
      addMessage(
        tid,
        "handoff",
        typeof text === "string" ? text : "",
        agent,
        undefined,
        undefined,
        from_agent,
        to_agent,
      );
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
        detail:
          typeof raw?.detail === "string"
            ? raw.detail.slice(0, 1000)
            : undefined,
        target:
          typeof raw?.target === "string"
            ? raw.target.slice(0, 300)
            : undefined,
        agent: typeof agent === "string" ? agent : undefined,
        ts: Date.now(),
      };
      if (ownsLiveThreadState) appendProgress(tid, evt);
      if (callbackRunWasActive && callbackRun) {
        await appendAgentRunEventAsync({
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
    if (ownsLiveThreadState) clearStatus(tid);
    const existing = getThread(tid);
    if (ownsLiveThreadState && consumeCancelled(tid, existing.messages)) {
      clearProgress(tid);
      console.log(`[mc-chat] Bot response discarded (cancelled): ${tid}`);
      return res.status(200).json({ ok: true, cancelled: true });
    }

    const sealed = ownsLiveThreadState ? sealProgress(tid) : [];
    // Optional errorDetail produced by the mc-chat plugin's error-rewriter.
    // Normalize defensively — a malformed detail must not prevent the bot
    // message itself from being persisted.
    const errorDetail =
      rawErrorDetail !== undefined
        ? normalizeErrorDetail(rawErrorDetail)
        : undefined;
    if (rawErrorDetail !== undefined && !errorDetail) {
      console.warn(`[mc-chat] dropped malformed errorDetail on thread ${tid}`);
    }
    // Drop stale watchdog_abort messages that arrive right after a successful
    // bot reply on the same thread (runtime sometimes emits a leftover abort
    // event 20 ms after a successful deliver — pure noise that confuses users).
    if (errorDetail?.category === "watchdog_abort") {
      if (
        isStaleWatchdogAfterRecentSuccess(
          existing.messages,
          Date.now(),
          STALE_WATCHDOG_WINDOW_MS,
        )
      ) {
        console.log(
          `[mc-chat] suppressed stale watchdog_abort on ${tid} (recent success within ${STALE_WATCHDOG_WINDOW_MS}ms)`,
        );
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
    let parsedControl: ReturnType<typeof parseRuntimeControlReply> | null =
      null;
    let controlContext: RuntimeControlTurnContext | null = null;
    const callbackInput =
      callbackRun?.input && typeof callbackRun.input === "object"
        ? (callbackRun.input as Record<string, unknown>)
        : {};
    if (
      callbackRunWasActive &&
      callbackRun &&
      callbackRun.runtime !== "openclaw" &&
      !errorDetail &&
      callbackInput.readOnly !== true
    ) {
      const input = callbackInput;
      controlContext = {
        slug:
          typeof input.slug === "string"
            ? input.slug
            : String(slug || "default"),
        threadId: tid,
        missionControlRunId: callbackRun.id,
        controlDepth: input.controlDepth === 1 ? 1 : 0,
        threadName:
          typeof input.threadName === "string" ? input.threadName : tid,
        respondingAgent:
          typeof agent === "string" ? agent : callbackRun.agent || "sancho",
        temporaryAgent: input.temporaryAgent === true,
        userText: typeof input.userText === "string" ? input.userText : "",
        userId: typeof input.userId === "string" ? input.userId : undefined,
        userName:
          typeof input.userName === "string" ? input.userName : undefined,
        isAdmin: input.isAdmin === true,
        senderRole: input.senderRole === "admin" ? "admin" : "client",
        source: typeof input.source === "string" ? input.source : undefined,
        linkedTo:
          typeof input.linkedTo === "string" ? input.linkedTo : undefined,
        docPath: typeof input.docPath === "string" ? input.docPath : undefined,
        docKind: typeof input.docKind === "string" ? input.docKind : undefined,
        attachments: Array.isArray(input.attachments)
          ? input.attachments
          : undefined,
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
          const readbacks = await persistCausalArtifactReadbacks(
            callbackRun,
            tid.slice(0, tid.indexOf(":")),
            await listAgentRunEventsAsync(callbackRun.id),
          );
          artifactReadbackCount = readbacks.length;
        } catch (error) {
          // A failed quality readback must fail closed (unverified) without
          // suppressing the user-visible runtime response.
          console.warn(
            `[quality-evidence] artifact readback failed for ${callbackRun.id}:`,
            error instanceof Error ? error.message : error,
          );
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
    addMessage(
      tid,
      "bot",
      botText,
      agent,
      undefined,
      sealed,
      undefined,
      undefined,
      errorDetail,
      terminalCallbackClaim,
    );
    if (callbackRunWasActive && callbackRun && terminalRunOutput) {
      if (errorDetail) {
        await markAgentRunFailedAsync(
          callbackRun.id,
          tid,
          errorDetail.category,
          "failed",
          terminalRunOutput,
        );
      } else {
        await markAgentRunCompletedAsync(
          callbackRun.id,
          tid,
          terminalRunOutput,
        );
      }
    }
    if (parsedControl && controlContext) {
      const controlled = await dispatchRuntimeControlActions(
        parsedControl,
        controlContext,
        { secret },
      );
      for (const followup of controlled.followupMessages)
        addMessage(tid, "bot", followup, "sancho");
    }
    console.log(
      `[mc-chat] Bot response → ${tid}: ${botText.slice(0, 60)} (${sealed.length} progress events${errorDetail ? `, errorDetail=${errorDetail.category}` : ""})`,
    );
    return res.status(200).json({
      ok: true,
      messageId: `mc-${Date.now()}`,
      progressCount: sealed.length,
    });
  } finally {
    if (terminalCallbackClaim)
      TERMINAL_CALLBACKS_IN_FLIGHT.delete(terminalCallbackClaim);
    if (terminalRunClaim) TERMINAL_RUNS_IN_FLIGHT.delete(terminalRunClaim);
  }
}

export default withErrorHandler(webhookHandler);
