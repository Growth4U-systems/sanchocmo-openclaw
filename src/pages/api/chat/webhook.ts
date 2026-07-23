import type { NextApiRequest, NextApiResponse } from "next";
import { createHash } from "node:crypto";
import { withErrorHandler } from "@/lib/api-middleware";
import { createRuntimeAdapter, resolveRuntimeId } from "@/lib/runtime";
import {
  appendAgentRunEventAsync,
  claimAgentRunCallbackFingerprintAsync,
  getAgentRunByIdAsync,
  getLatestActiveRunAsync,
  listAgentRunEventsAsync,
  markAgentRunCompletedAsync,
  markAgentRunFailedAsync,
  recoverAgentRunSyntheticRuntimeLossAsync,
  type AgentRun,
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
import { authorizeRuntimeTransportSecret } from "@/lib/runtime/runtime-transport-secret";
import { authorizeChatAgentTurnRuntimeRequest } from "@/lib/runtime/chat-agent-turn-dispatch-authority";
import { authorizeRuntimeTerminalCallbackRequest } from "@/lib/runtime/runtime-terminal-callback-grant";

// How long after a successful bot reply we should treat a watchdog_abort on
// the same thread as a stale runtime echo and drop it. Empirically the gap
// observed in production is in the 20-ms range; 5 s is generous without ever
// hiding a real subsequent timeout.
const STALE_WATCHDOG_WINDOW_MS = 5000;
const TERMINAL_TEXT_MAX_CHARS = 64_000;

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

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

const LATE_RECOVERY_CONTROLS_SUPPRESSED_NOTICE =
  "⚠️ Esta respuesta llegó después de que el turno se marcara como interrumpido. No ejecuté sus acciones, efectos ni cambios de tarea tardíos para evitar duplicados.";

function parsedControlContainsAction(
  parsed: ReturnType<typeof parseRuntimeControlReply>,
): boolean {
  return Boolean(
    parsed.intervention ||
      parsed.routeRequests.length > 0 ||
      parsed.effectRequests.length > 0 ||
      parsed.malformedCount > 0 ||
      parsed.blockedCount > 0,
  );
}

function recoverClaimedTerminalProjection(input: {
  run: AgentRun;
  threadId: string;
  fingerprint: string;
  fallbackText: unknown;
  fallbackAgent: unknown;
  fallbackErrorDetail: unknown;
}): boolean {
  if (!input.run.callbackFingerprints?.includes(input.fingerprint)) {
    return false;
  }
  const output = record(input.run.output);
  const visibleText =
    typeof output?.text === "string"
      ? output.text
      : typeof input.fallbackText === "string"
        ? input.fallbackText
        : "";
  const visibleAgent =
    typeof output?.agent === "string"
      ? output.agent
      : typeof input.fallbackAgent === "string"
        ? input.fallbackAgent
        : input.run.agent || "sancho";
  const errorDetail = normalizeErrorDetail(
    output?.errorDetail ?? input.fallbackErrorDetail,
  );
  const progress = Array.isArray(output?.progress)
    ? (output.progress as ProgressEvent[])
    : undefined;
  const deliveryKey = `${input.run.id}:${input.fingerprint}`;
  addMessage(
    input.threadId,
    "bot",
    visibleText,
    visibleAgent,
    undefined,
    progress,
    undefined,
    undefined,
    errorDetail || undefined,
    deliveryKey,
  );
  const followups = Array.isArray(output?.controlFollowups)
    ? output.controlFollowups.filter(
        (item): item is string => typeof item === "string" && item.length > 0,
      )
    : [];
  followups.forEach((followup, index) => {
    addMessage(
      input.threadId,
      "bot",
      followup,
      "sancho",
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      `${deliveryKey}:control:${index}`,
    );
  });
  return true;
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
  const isTerminalDelivery = role === undefined || role === "bot";
  const boundedTerminalText =
    isTerminalDelivery && typeof text === "string"
      ? text.slice(0, TERMINAL_TEXT_MAX_CHARS)
      : text;
  const recognizedNonTerminalRole =
    role === "status" ||
    role === "progress" ||
    role === "system" ||
    role === "handoff";
  if (!isTerminalDelivery && !recognizedNonTerminalRole) {
    return res.status(400).json({ error: "Runtime callback role invalid" });
  }
  const terminalGrant = singleHeader(
    req,
    "x-sancho-terminal-callback-grant",
  );
  if (terminalGrant && !isTerminalDelivery) {
    return res
      .status(403)
      .json({ error: "Terminal callback grant cannot authorize this role" });
  }
  const dispatchRunId = singleHeader(req, "x-sancho-dispatch-run-id");
  const dispatchLeaseToken = singleHeader(
    req,
    "x-sancho-dispatch-lease-token",
  );
  const callbackAuthority = terminalGrant
    ? await authorizeRuntimeTerminalCallbackRequest(
        {
          parentAgentRunId: singleHeader(req, "x-mission-control-run-id"),
          dispatchRunId,
          runtimeToolCapability: singleHeader(
            req,
            "x-sancho-run-capability",
          ),
          terminalGrant,
        },
        { resolveParentRun: getAgentRunByIdAsync },
      )
    : await authorizeRuntimeRunRequest(
        {
          runId: singleHeader(req, "x-mission-control-run-id"),
          capability: singleHeader(req, "x-sancho-run-capability"),
          dispatchRunId,
          dispatchLeaseToken,
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
  // Every newly-admitted async turn persists its transport binding and gets a
  // dedicated terminal-only grant. Never let its ordinary short-lived tool
  // capability fall through into terminal authority. The one compatibility
  // lane is deliberately narrow: an active pre-grant, direct-dispatch run
  // with no persisted transport owner may still finish while its capability
  // is fresh. Progress/status/system/handoff continue to use that ordinary
  // active-run authority and cannot carry the terminal grant.
  if (
    isTerminalDelivery &&
    !terminalGrant &&
    (Object.hasOwn(
      callbackAuthority.input,
      "runtimeTransportSecretSha256",
    ) ||
      callbackAuthority.input.runtimeDispatchMode === "ledger-v1" ||
      dispatchRunId !== undefined ||
      dispatchLeaseToken !== undefined)
  ) {
    return res.status(403).json({
      error: "Runtime terminal callback grant required",
    });
  }
  // Resolve transport authentication from the runtime that admitted this run,
  // never from the adapter selected now. A runtime switch must not strand an
  // in-flight callback or let the new runtime's secret authorize an old run.
  const callbackRuntimeId = resolveRuntimeId(callbackAuthority.run.runtime);
  if (!callbackRuntimeId) {
    return res.status(403).json({ error: "Runtime callback binding invalid" });
  }
  const suppliedTransportSecret = singleHeader(req, "x-mc-secret");
  const transportAuthorization = authorizeRuntimeTransportSecret({
    suppliedSecret: suppliedTransportSecret,
    runInput: callbackAuthority.input,
    resolveLegacySecret: () =>
      createRuntimeAdapter(callbackRuntimeId).messaging.getSharedSecret?.(),
  });
  if (transportAuthorization === "legacy_secret_missing") {
    return res
      .status(503)
      .json({ error: "Runtime callback secret not configured" });
  }
  if (transportAuthorization !== "authorized") {
    return res.status(403).json({ error: "Forbidden" });
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
  const callbackFingerprint = isTerminalDelivery
    ? createHash("sha256")
        .update(
          JSON.stringify({
            role: role || "bot",
            text: boundedTerminalText,
            agent,
            errorDetail: rawErrorDetail,
          }),
        )
        .digest("hex")
    : undefined;
  // A durable runtime may finish after the control-plane worker projected its
  // one synthetic `runtime_committed_worker_lost` failure. A valid long-lived
  // terminal grant may recover only that exact failure. This branch is
  // deliberately projection-only: after the user was told a retry is safe,
  // admitting a late effect, delegation or child turn could duplicate work or
  // spend performed by the retry.
  if (isTerminalDelivery && exactRun.status === "failed" && terminalGrant) {
    const dispatchRunId = singleHeader(req, "x-sancho-dispatch-run-id");
    if (dispatchRunId) {
      const callbackInput = record(exactRun.input) ?? {};
      const errorDetail =
        rawErrorDetail !== undefined
          ? normalizeErrorDetail(rawErrorDetail)
          : undefined;
      if (rawErrorDetail !== undefined && !errorDetail) {
        console.warn(
          `[mc-chat] dropped malformed late errorDetail on thread ${tid}`,
        );
      }
      const parsedControl = parseRuntimeControlReply(
        typeof boundedTerminalText === "string" ? boundedTerminalText : "",
        {
          respondingAgent:
            typeof agent === "string" ? agent : exactRun.agent || "sancho",
          temporaryAgent: callbackInput.temporaryAgent === true,
        },
      );
      const controlsSuppressed = parsedControlContainsAction(parsedControl);
      const recoveryNotice = controlsSuppressed
        ? LATE_RECOVERY_CONTROLS_SUPPRESSED_NOTICE
        : "";
      const visibleTextLimit = recoveryNotice
        ? TERMINAL_TEXT_MAX_CHARS - recoveryNotice.length - 2
        : TERMINAL_TEXT_MAX_CHARS;
      const recoveredText = [
        parsedControl.text.slice(0, Math.max(0, visibleTextLimit)),
        recoveryNotice,
      ]
        .filter(Boolean)
        .join("\n\n");
      const terminalOutput: Record<string, unknown> = {
        agent,
        text: recoveredText,
        progressCount: 0,
        progress: [],
        artifactReadbackCount: 0,
        errorDetail,
        controlFollowups: [],
        lateTerminalRecovery: true,
        controlsSuppressedOnLateRecovery: controlsSuppressed,
      };
      const commonRecovery = {
        runId: exactRun.id,
        threadId: tid,
        dispatchRunId,
        fingerprint: callbackFingerprint as string,
        output: terminalOutput,
      };
      const recoveredRun = errorDetail
        ? await recoverAgentRunSyntheticRuntimeLossAsync({
            ...commonRecovery,
            terminalStatus: "failed",
            terminalError: errorDetail.category,
          })
        : await recoverAgentRunSyntheticRuntimeLossAsync({
            ...commonRecovery,
            terminalStatus: "completed",
          });
      if (recoveredRun) {
        if (
          !recoverClaimedTerminalProjection({
            run: recoveredRun,
            threadId: tid,
            fingerprint: callbackFingerprint as string,
            fallbackText: recoveredText,
            fallbackAgent: agent,
            fallbackErrorDetail: errorDetail,
          })
        ) {
          throw new Error("late_terminal_callback_projection_claim_missing");
        }
        console.log(
          `[mc-chat] Late runtime terminal recovered → ${tid}: ${recoveredText.slice(0, 60)}`,
        );
        return res.status(200).json({
          ok: true,
          recovered: true,
          runId: recoveredRun.id,
        });
      }

      // The CAS may have been won by the same exact callback on another
      // replica before its visible projection. Re-read and repair only that
      // singleton fingerprint; a competing payload remains stale.
      const currentRun = await getAgentRunByIdAsync(exactRun.id);
      if (
        currentRun &&
        (currentRun.status === "completed" || currentRun.status === "failed") &&
        recoverClaimedTerminalProjection({
          run: currentRun,
          threadId: tid,
          fingerprint: callbackFingerprint as string,
          fallbackText: recoveredText,
          fallbackAgent: agent,
          fallbackErrorDetail: errorDetail,
        })
      ) {
        return res.status(200).json({
          ok: true,
          recovered: true,
          duplicate: true,
          runId: currentRun.id,
        });
      }
      return res.status(200).json({
        ok: true,
        stale: true,
        runId: exactRun.id,
      });
    }
  }
  // One run has one terminal result. Multipart replies are joined by the
  // runtime adapter before they reach this endpoint; any later terminal event
  // is stale noise and must not become another chat card.
  if (
    isTerminalDelivery &&
    (exactRun.status === "completed" || exactRun.status === "failed")
  ) {
    recoverClaimedTerminalProjection({
      run: exactRun,
      threadId: tid,
      fingerprint: callbackFingerprint as string,
      fallbackText: boundedTerminalText,
      fallbackAgent: agent,
      fallbackErrorDetail: rawErrorDetail,
    });
    return res.status(200).json({ ok: true, stale: true, runId: exactRun.id });
  }
  // Claim before persistence so concurrent retries are no-ops, while a retry
  // after a crash can finish an active run without duplicating its chat card.
  let terminalRunClaim: string | undefined;
  if (isTerminalDelivery) {
    if (TERMINAL_RUNS_IN_FLIGHT.has(exactRun.id)) {
      res.setHeader?.("Retry-After", "2");
      return res.status(503).json({
        ok: false,
        duplicate: true,
        retryable: true,
        runId: exactRun.id,
      });
    }
    TERMINAL_RUNS_IN_FLIGHT.add(exactRun.id);
    terminalRunClaim = exactRun.id;
    let newlyClaimed: boolean;
    let currentRun;
    try {
      newlyClaimed = await claimAgentRunCallbackFingerprintAsync(
        exactRun.id,
        callbackFingerprint as string,
      );
      currentRun = await getAgentRunByIdAsync(exactRun.id);
    } catch (error) {
      TERMINAL_RUNS_IN_FLIGHT.delete(exactRun.id);
      throw error;
    }
    const ownsPersistedFingerprint = Boolean(
      currentRun?.callbackFingerprints?.includes(callbackFingerprint as string),
    );
    if (!newlyClaimed) {
      if (
        ownsPersistedFingerprint &&
        currentRun &&
        (currentRun.status === "queued" || currentRun.status === "running")
      ) {
        // The same delivery is already leased by another replica. A 2xx here
        // would make the runtime outbox delete its only durable copy; keep it
        // retrying until the winner terminalizes or the stale lease is reclaimed.
        TERMINAL_RUNS_IN_FLIGHT.delete(exactRun.id);
        res.setHeader?.("Retry-After", "2");
        return res.status(503).json({
          ok: false,
          duplicate: true,
          retryable: true,
          runId: exactRun.id,
        });
      }
      if (
        ownsPersistedFingerprint &&
        currentRun &&
        (currentRun.status === "completed" || currentRun.status === "failed")
      ) {
        recoverClaimedTerminalProjection({
          run: currentRun,
          threadId: tid,
          fingerprint: callbackFingerprint as string,
          fallbackText: boundedTerminalText,
          fallbackAgent: agent,
          fallbackErrorDetail: rawErrorDetail,
        });
      }
      TERMINAL_RUNS_IN_FLIGHT.delete(exactRun.id);
      return res
        .status(200)
        .json({ ok: true, duplicate: true, runId: exactRun.id });
    }
    // A newly claimed row is either the first terminal delivery or an atomic
    // recovery of the same fingerprint after its prior claim lease expired.
    // Exact concurrent retries cannot execute this pipeline on another host.
  } else if (["completed", "failed"].includes(exactRun.status)) {
    return res.status(200).json({ ok: true, stale: true, runId: exactRun.id });
  }
  try {
    // Re-read after the callback claim. `/cancel` may have installed a
    // cross-replica AgentRun tombstone after the initial authority lookup;
    // process-local `consumeCancelled` cannot close that race by itself.
    const callbackRun = await getAgentRunByIdAsync(exactRun.id);
    if (!callbackRun) {
      return res.status(409).json({ error: "Runtime callback run disappeared" });
    }
    if (callbackRun.status === "cancelled") {
      consumeCancelled(tid, getThread(tid).messages);
      return res.status(200).json({
        ok: true,
        cancelled: true,
        runId: callbackRun.id,
      });
    }
    if (
      isTerminalDelivery &&
      (callbackRun.status === "completed" || callbackRun.status === "failed")
    ) {
      recoverClaimedTerminalProjection({
        run: callbackRun,
        threadId: tid,
        fingerprint: callbackFingerprint as string,
        fallbackText: boundedTerminalText,
        fallbackAgent: agent,
        fallbackErrorDetail: rawErrorDetail,
      });
      return res
        .status(200)
        .json({ ok: true, stale: true, runId: callbackRun.id });
    }
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
    let botText =
      typeof boundedTerminalText === "string" ? boundedTerminalText : "";
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
        parentCapability: singleHeader(req, "x-sancho-run-capability"),
        parentDispatchRunId: singleHeader(req, "x-sancho-dispatch-run-id"),
        parentDispatchLeaseToken: singleHeader(
          req,
          "x-sancho-dispatch-lease-token",
        ),
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
        readOnly: input.readOnly === true,
        traceId: callbackRun.traceId,
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
    let controlFollowups: string[] = [];
    // The callback boundary has already authenticated the exact parent run.
    // Admit runtime-neutral effects and child controls while that parent is
    // active, then persist the authoritative ACK as its terminal response.
    if (parsedControl && controlContext) {
      const controlled = await dispatchRuntimeControlActions(
        parsedControl,
        controlContext,
        { secret: suppliedTransportSecret },
      );
      botText = controlled.text;
      controlFollowups = controlled.followupMessages;
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
        text: botText.slice(0, TERMINAL_TEXT_MAX_CHARS),
        progressCount: sealed.length,
        progress: sealed,
        artifactReadbackCount,
        errorDetail,
        controlFollowups,
      };
    }
    // Win the shared terminal transition before projecting a visible card.
    // This is the cross-replica cancellation barrier: if Stop won, the
    // transition returns the cancelled tombstone and this callback is dropped.
    let terminalRunForProjection: AgentRun | null = null;
    if (callbackRunWasActive && terminalRunOutput) {
      const terminalRun = errorDetail
        ? await markAgentRunFailedAsync(
            callbackRun.id,
            tid,
            errorDetail.category,
            "failed",
            terminalRunOutput,
          )
        : await markAgentRunCompletedAsync(
            callbackRun.id,
            tid,
            terminalRunOutput,
          );
      const expectedStatus = errorDetail ? "failed" : "completed";
      if (!terminalRun || terminalRun.status !== expectedStatus) {
        if (terminalRun?.status === "cancelled") {
          consumeCancelled(tid, getThread(tid).messages);
          return res.status(200).json({
            ok: true,
            cancelled: true,
            runId: callbackRun.id,
          });
        }
        return res.status(200).json({
          ok: true,
          stale: true,
          runId: callbackRun.id,
        });
      }
      terminalRunForProjection = terminalRun;
    }
    if (
      !terminalRunForProjection ||
      !recoverClaimedTerminalProjection({
        run: terminalRunForProjection,
        threadId: tid,
        fingerprint: callbackFingerprint as string,
        fallbackText: botText,
        fallbackAgent: agent,
        fallbackErrorDetail: errorDetail,
      })
    ) {
      throw new Error("terminal_callback_projection_claim_missing");
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
    if (terminalRunClaim) TERMINAL_RUNS_IN_FLIGHT.delete(terminalRunClaim);
  }
}

export default withErrorHandler(webhookHandler);
