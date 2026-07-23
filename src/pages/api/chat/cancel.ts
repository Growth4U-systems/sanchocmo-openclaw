import type { NextApiRequest, NextApiResponse } from "next";
import { createHash } from "node:crypto";
import {
  canAccessSlug,
  compose,
  withAuth,
  withErrorHandler,
} from "@/lib/api-middleware";
import {
  addMessage,
  clearStatus,
  clearProgress,
  markCancelled,
} from "@/lib/data/mc-chat";
import {
  createRuntimeAdapter,
  resolveRuntimeId,
  type InboundMessage,
} from "@/lib/runtime";
import {
  appendAgentRunEventAsync,
  getAgentRunByIdAsync,
  listActiveChildAgentRunsAsync,
  listAgentRunEventsAsync,
  markAgentRunCancelledAsync,
} from "@/lib/data/agent-runs";
import {
  traceContextFromHeaders,
  tracePropagationHeaders,
} from "@/lib/trace-context";
import {
  canonicalThreadId,
  isValidTenantSlug,
  parseThreadId,
} from "@/lib/thread-id";
import {
  PostgresExecutionControlRepository,
  type ExecutionOriginCancellationReceipt,
  type ExecutionRun,
} from "@/lib/execution-control";
import {
  CHAT_AGENT_TURN_AGGREGATE_TYPE,
  CHAT_AGENT_TURN_OPERATION,
} from "@/lib/chat/agent-turn-contract-v1";
import {
  cancelSealedExecutionOriginChildren,
  sealExecutionOriginCancellation,
  type ExecutionOriginCancellationInput,
} from "@/lib/durable-execution";
import { RUNTIME_EFFECT_ORIGIN_MODE } from "@/lib/runtime/effect-actions";

const CHAT_STOP_CANCELLATION_CODE = "chat_stop_requested";

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/**
 * POST /api/chat/cancel
 * Ported from mc-server.js:5046-5076
 * Cancels a running agent and discards its response
 */
export async function cancelHandler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  const traceContext = req.traceContext ?? traceContextFromHeaders(req.headers);

  const { slug, threadId, runId } = req.body;
  if (!isValidTenantSlug(slug)) {
    return res.status(400).json({ error: "Missing slug" });
  }
  if (!canAccessSlug(req.ctx, slug)) {
    return res.status(403).json({ error: "Forbidden" });
  }
  const rawThreadId = threadId || `${slug}:general`;
  const parsedThread = parseThreadId(rawThreadId);
  if (!parsedThread || parsedThread.slug !== slug) {
    return res.status(400).json({ error: "Thread does not belong to slug" });
  }
  const tid = canonicalThreadId(rawThreadId);
  if (typeof runId !== "string" || !runId.trim()) {
    return res.status(400).json({ error: "Missing runId" });
  }
  const activeRun = await getAgentRunByIdAsync(runId.trim());
  if (!activeRun || activeRun.threadId !== tid) {
    return res
      .status(409)
      .json({ error: "Agent run is no longer active in this thread" });
  }
  const runtimeId = resolveRuntimeId(activeRun.runtime);
  if (!runtimeId) {
    return res.status(409).json({ error: "Agent run runtime binding is invalid" });
  }
  // Cancellation authority comes from the persisted run, never from browser
  // JSON. The deterministic fallback only covers legacy rows that predate the
  // required agent binding.
  const requestedAgent =
    typeof activeRun.agent === "string" && activeRun.agent.trim()
      ? activeRun.agent.trim()
      : tid.split(":")[1] === "yalc"
        ? "rocinante"
        : "sancho";
  const runtime = createRuntimeAdapter(runtimeId);
  const parentWasActive =
    activeRun.status === "queued" || activeRun.status === "running";
  const activeRunInput = record(activeRun.input);
  const durableTurn = activeRunInput?.runtimeDispatchMode === "ledger-v1";
  const runtimeEffectOrigin =
    activeRunInput?.runtimeEffectMode === RUNTIME_EFFECT_ORIGIN_MODE;
  const originTracked = durableTurn || runtimeEffectOrigin;
  let stoppedByChatStop = false;
  let retryingRuntimeStop = false;
  let previousRuntimeStopDelivery:
    | { runtimeCancelled: boolean }
    | undefined;
  if (
    !parentWasActive &&
    !durableTurn &&
    activeRun.status === "cancelled"
  ) {
    try {
      const events = await listAgentRunEventsAsync(activeRun.id);
      stoppedByChatStop = events.some(
        (event) =>
          event.type === "cancel_requested" &&
          record(event.data)?.code === CHAT_STOP_CANCELLATION_CODE,
      );
      const lastRuntimeStopDelivery = [...events]
        .reverse()
        .find(
          (event) =>
            (event.type === "cancel_dispatched" ||
              event.type === "cancel_failed") &&
            record(event.data)?.runtimeStopDelivery === true,
        );
      if (stoppedByChatStop && lastRuntimeStopDelivery) {
        const deliveryData = record(lastRuntimeStopDelivery.data);
        if (lastRuntimeStopDelivery.type === "cancel_dispatched") {
          previousRuntimeStopDelivery = {
            runtimeCancelled: deliveryData?.runtimeCancelled === true,
          };
        }
      }
      retryingRuntimeStop =
        stoppedByChatStop && !previousRuntimeStopDelivery;
    } catch (error) {
      console.error(
        "[mc-chat] Stop retry authority lookup failed:",
        error instanceof Error ? error.message : String(error),
      );
      return res.status(503).json({
        error: "Runtime Stop retry authority is temporarily unavailable",
        code: "runtime_stop_retry_authority_unavailable",
        retryable: true,
      });
    }
  }
  const shouldDispatchRuntimeStop = parentWasActive || retryingRuntimeStop;
  let parentTombstoned = !parentWasActive;
  let parentCancellationUnavailable = false;
  let originCancellationPending = false;
  let originCancellationUnavailable = false;
  let durableRuntimeCancelled = false;
  let originAlreadyStopped = false;
  let originChildCount = 0;
  let originChildCancellationCount = 0;
  let agentRunChildCount = 0;
  let agentRunChildCancellationCount = 0;
  let agentRunChildCancellationPending = false;
  let agentRunChildRuntimeCancellationCount = 0;
  let agentRunChildRuntimeCancellationUnavailable = false;
  let originRepository: PostgresExecutionControlRepository | null = null;
  let originCancellation: ExecutionOriginCancellationReceipt | null = null;
  let durableDispatch: ExecutionRun | null = null;
  const originCancellationInput: ExecutionOriginCancellationInput = {
    tenantKey: slug,
    parentAgentRunId: activeRun.id,
    actor: {
      type: "user",
      id: req.ctx?.isAdmin ? "mc-admin" : `client:${slug}`,
    },
  };
  if (originTracked) {
    try {
      originRepository = new PostgresExecutionControlRepository();
      if (typeof originRepository.requestRunCancellation !== "function") {
        throw new Error("execution_origin_cancellation_unavailable");
      }
      durableDispatch = durableTurn
        ? await originRepository.getRunByAggregate({
            tenantKey: slug,
            aggregateType: CHAT_AGENT_TURN_AGGREGATE_TYPE,
            aggregateId: activeRun.id,
            operation: CHAT_AGENT_TURN_OPERATION,
          })
        : null;
      if (
        durableTurn &&
        (!durableDispatch || durableDispatch.mode !== "canary")
      ) {
        throw new Error("chat_turn_cancellation_dispatch_unavailable");
      }
      originCancellation = await sealExecutionOriginCancellation(
        originCancellationInput,
        originRepository,
      );
    } catch (error) {
      // An unavailable origin ledger must never prevent `/stop` from reaching
      // Hermes/external runtimes. Keep the request retryable so a later Stop
      // can still cancel any durable child. The AgentRun tombstone below still
      // prevents its result from being projected into chat.
      originCancellationUnavailable = true;
      originCancellationPending = true;
      console.error(
        "[mc-chat] Durable origin cancellation failed:",
        error instanceof Error ? error.message : String(error),
      );
    }
  }
  // The execution-origin tombstone above is the linearization point against a
  // concurrent effect claim. Terminalize the chat parent afterwards even while
  // its children drain: Hermes/generic HTTP need not send a terminal callback
  // after `/stop`. If a callback won this race, keep cancelling the origin tree
  // and treat its now-terminal parent as already sealed.
  if (parentWasActive) {
    try {
      const tombstone = await markAgentRunCancelledAsync(activeRun.id, tid, {
        code: CHAT_STOP_CANCELLATION_CODE,
        requestedAgent,
        originTracked,
      });
      parentTombstoned = Boolean(
        tombstone &&
          ["cancelled", "completed", "failed"].includes(tombstone.status),
      );
      parentCancellationUnavailable = !parentTombstoned;
    } catch (error) {
      parentCancellationUnavailable = true;
      console.error(
        "[mc-chat] AgentRun cancellation tombstone failed:",
        error instanceof Error ? error.message : String(error),
      );
    }
    originCancellationPending =
      originCancellationPending || parentCancellationUnavailable;
    // Keep the legacy no-run-id callback path fail-closed during rolling
    // deploys while the durable AgentRun tombstone is authoritative.
    markCancelled(tid);
  }
  // Child admission locks this exact parent row FOR UPDATE. Therefore either
  // the child committed before this tombstone (and is visible to this scan),
  // or it observes the terminal parent and is rejected before dispatch. There
  // is no post-scan admission window once `parentTombstoned` is true.
  if (parentTombstoned) {
    try {
      const activeChildren = await listActiveChildAgentRunsAsync(activeRun.id);
      agentRunChildCount = activeChildren.length;
      for (const child of activeChildren) {
        const cancelledChild = await markAgentRunCancelledAsync(
          child.id,
          child.threadId,
          {
            code: "control_parent_stopped",
            controlParentAgentRunId: activeRun.id,
            requestedAgent,
          },
        );
        if (cancelledChild?.status === "cancelled") {
          agentRunChildCancellationCount += 1;
          try {
            const childRuntimeId = resolveRuntimeId(child.runtime);
            const childThread = parseThreadId(child.threadId);
            if (!childRuntimeId || !childThread) {
              throw new Error("control_child_runtime_binding_invalid");
            }
            await createRuntimeAdapter(childRuntimeId).messaging.cancel(
              child.threadId,
              {
                slug: childThread.slug,
                missionControlRunId: child.id,
                ...(child.agent
                  ? { agent: child.agent, agentId: child.agent }
                  : {}),
              },
            );
            agentRunChildRuntimeCancellationCount += 1;
          } catch (error) {
            // The AgentRun tombstone is authoritative even when a runtime is
            // temporarily unreachable. A late child callback cannot reopen or
            // overwrite it; expose the transport failure without reopening the
            // already-sealed execution tree.
            agentRunChildRuntimeCancellationUnavailable = true;
            console.error(
              `[mc-chat] Child runtime cancellation failed for ${child.id}:`,
              error instanceof Error ? error.message : String(error),
            );
          }
        } else if (
          cancelledChild?.status === "queued" ||
          cancelledChild?.status === "running" ||
          !cancelledChild
        ) {
          agentRunChildCancellationPending = true;
        }
      }
    } catch (error) {
      agentRunChildCancellationPending = true;
      console.error(
        "[mc-chat] Active child AgentRun cancellation failed:",
        error instanceof Error ? error.message : String(error),
      );
    }
  }
  originCancellationPending =
    originCancellationPending || agentRunChildCancellationPending;
  if (
    !parentWasActive &&
    !stoppedByChatStop &&
    !originTracked &&
    agentRunChildCount === 0
  ) {
    return res
      .status(409)
      .json({ error: "Agent run is no longer active in this thread" });
  }
  // Once the execution origin and transport parent are both sealed, no effect
  // or route/intervention child can enter the tree. Only now is it safe to page
  // and drain the children without leaving a post-scan admission window.
  if (originTracked && originRepository && originCancellation) {
    try {
      const childCancellation = await cancelSealedExecutionOriginChildren(
        originCancellationInput,
        originCancellation,
        originRepository,
      );
      originChildCount = childCancellation.children.length;
      originChildCancellationCount = childCancellation.requestedRunIds.length;
      if (
        !parentWasActive &&
        !stoppedByChatStop &&
        originChildCount === 0 &&
        agentRunChildCount === 0
      ) {
        return res.status(409).json({
          error: "Agent run has no active durable work in this thread",
        });
      }

      let parentCancellationPending = false;
      if (parentWasActive && durableTurn && durableDispatch) {
        const cancellationId = `cancel_${createHash("sha256")
          .update(`chat-agent-turn-cancel-v1\0${activeRun.id}`)
          .digest("hex")
          .slice(0, 32)}`;
        const cancellation = await originRepository.requestRunCancellation({
          tenantKey: durableDispatch.tenantKey,
          operation: CHAT_AGENT_TURN_OPERATION,
          mode: durableDispatch.mode,
          runId: durableDispatch.id,
          cancellationId,
          actor: originCancellationInput.actor,
          reasonCode: "user_requested",
        });
        if (!cancellation && originChildCancellationCount === 0) {
          originAlreadyStopped = true;
          durableRuntimeCancelled = true;
        } else {
          parentCancellationPending =
            cancellation?.disposition === "requested";
          durableRuntimeCancelled =
            cancellation?.disposition === "cancelled";
        }
      } else {
        durableRuntimeCancelled = !parentWasActive;
        originAlreadyStopped =
          !parentWasActive &&
          originChildCancellationCount === 0 &&
          agentRunChildCancellationCount === 0;
      }
      originCancellationPending =
        originCancellationPending ||
        parentCancellationPending ||
        childCancellation.pendingRunIds.length > 0;
    } catch (error) {
      originCancellationUnavailable = true;
      originCancellationPending = true;
      console.error(
        "[mc-chat] Durable origin child cancellation failed:",
        error instanceof Error ? error.message : String(error),
      );
    }
  }
  let runtimeCancellationMarkerError: string | undefined;
  if (shouldDispatchRuntimeStop) {
    try {
      await runtime.messaging.cancel(tid, {
        slug,
        missionControlRunId: activeRun.id,
        ...(requestedAgent
          ? { agent: requestedAgent, agentId: requestedAgent }
          : {}),
      });
    } catch (error) {
      runtimeCancellationMarkerError =
        error instanceof Error ? error.message : String(error);
      console.error(
        "[mc-chat] Runtime cancellation marker failed:",
        runtimeCancellationMarkerError,
      );
    }
  }
  if (originTracked && (!parentWasActive || originCancellationUnavailable)) {
    try {
      await appendAgentRunEventAsync({
        runId: activeRun.id,
        threadId: tid,
        type: originCancellationUnavailable
          ? "cancel_failed"
          : "cancel_requested",
        data: {
          requestedAgent,
          childCount: originChildCount + agentRunChildCount,
          childCancellationCount:
            originChildCancellationCount + agentRunChildCancellationCount,
          durableChildCount: originChildCount,
          agentRunChildCount,
          agentRunChildRuntimeCancellationCount,
          agentRunChildRuntimeCancellationUnavailable,
          originCancellationUnavailable,
        },
      });
    } catch (error) {
      console.error(
        "[mc-chat] Cancellation event persistence failed:",
        error instanceof Error ? error.message : String(error),
      );
    }
  }
  clearStatus(tid);
  clearProgress(tid);
  addMessage(
    tid,
    "system",
    originCancellationPending
      ? "Cancelación solicitada. Esperando confirmación de las tareas activas."
      : originAlreadyStopped
        ? "No había tareas activas que detener."
        : "Ejecución detenida.",
    requestedAgent || "sancho",
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    `chat-stop:${activeRun.id}`,
  );
  console.log(`[mc-chat] Cancelling thread: ${tid}`);

  // Send /stop through the active runtime.
  let runtimeCancelled = durableRuntimeCancelled;
  if (durableTurn) {
    return res.status(200).json({
      ok: true,
      cancelled: parentTombstoned && !originCancellationPending,
      alreadyStopped: originAlreadyStopped,
      runtimeCancelled,
      cancellationPending: originCancellationPending,
      parentTombstoned,
      originCancellationUnavailable,
      childCount: originChildCount + agentRunChildCount,
      childCancellationCount:
        originChildCancellationCount + agentRunChildCancellationCount,
      durableChildCount: originChildCount,
      durableChildCancellationCount: originChildCancellationCount,
      agentRunChildCount,
      agentRunChildCancellationCount,
      agentRunChildRuntimeCancellationCount,
      agentRunChildRuntimeCancellationUnavailable,
    });
  }
  if (!shouldDispatchRuntimeStop) {
    const priorRuntimeCancelled =
      previousRuntimeStopDelivery?.runtimeCancelled ?? true;
    return res.status(200).json({
      ok: true,
      cancelled: parentTombstoned && !originCancellationPending,
      alreadyStopped: originAlreadyStopped,
      runtimeCancelled: priorRuntimeCancelled,
      runtimeStopDelivered: Boolean(previousRuntimeStopDelivery),
      runtimeAlreadyStopped:
        Boolean(previousRuntimeStopDelivery) && !priorRuntimeCancelled,
      cancellationPending: originCancellationPending,
      parentTombstoned,
      originCancellationUnavailable,
      childCount: originChildCount + agentRunChildCount,
      childCancellationCount:
        originChildCancellationCount + agentRunChildCancellationCount,
      durableChildCount: originChildCount,
      durableChildCancellationCount: originChildCancellationCount,
      agentRunChildCount,
      agentRunChildCancellationCount,
      agentRunChildRuntimeCancellationCount,
      agentRunChildRuntimeCancellationUnavailable,
    });
  }

  const recordRuntimeStopDelivery = async (
    type: "cancel_dispatched" | "cancel_failed",
    data: Record<string, unknown>,
  ) => {
    try {
      await appendAgentRunEventAsync({
        runId: activeRun.id,
        threadId: tid,
        type,
        data,
      });
    } catch (error) {
      console.error(
        "[mc-chat] Runtime Stop delivery event persistence failed:",
        error instanceof Error ? error.message : String(error),
      );
    }
  };

  try {
    const payload: InboundMessage = {
      slug,
      threadId: tid,
      missionControlRunId: activeRun.id,
      ...(runtimeId === "openclaw"
        ? { runtimeControlAction: "stop" as const }
        : {}),
      text: "/stop",
      traceId: traceContext.traceId,
      traceparent: traceContext.traceparent,
      userName: "Admin",
      userId: "mc-admin",
      isAdmin: true,
      agent: requestedAgent,
      agentId: requestedAgent,
    };
    const result = await runtime.messaging.sendInbound(payload, {
      headers: {
        ...tracePropagationHeaders(traceContext),
        ...(runtimeId === "openclaw"
          ? { "X-Sancho-Control-Action": "stop" }
          : {}),
      },
    });
    let acknowledgedCancellation = false;
    try {
      const ack = result.raw
        ? (JSON.parse(result.raw) as { cancelled?: unknown })
        : null;
      acknowledgedCancellation = ack?.cancelled === true;
    } catch {
      acknowledgedCancellation = false;
    }
    runtimeCancelled = acknowledgedCancellation;

    if (!result.ok) {
      await recordRuntimeStopDelivery("cancel_failed", {
        runtimeStopDelivery: true,
        status: result.status,
        error: result.error ?? result.raw,
        runtimeCancelled: false,
        ...(runtimeCancellationMarkerError
          ? { runtimeCancellationMarkerError }
          : {}),
      });
      return res.status(503).json({
        ok: false,
        error: "Runtime Stop delivery failed",
        code: "runtime_stop_delivery_failed",
        retryable: true,
        cancelled: parentTombstoned && !originCancellationPending,
        alreadyStopped: originAlreadyStopped,
        runtimeCancelled: false,
        runtimeStopDelivered: false,
        runtimeAlreadyStopped: false,
        cancellationPending: true,
        parentTombstoned,
        originCancellationUnavailable,
        childCount: originChildCount + agentRunChildCount,
        childCancellationCount:
          originChildCancellationCount + agentRunChildCancellationCount,
        durableChildCount: originChildCount,
        durableChildCancellationCount: originChildCancellationCount,
        agentRunChildCount,
        agentRunChildCancellationCount,
        agentRunChildRuntimeCancellationCount,
        agentRunChildRuntimeCancellationUnavailable,
      });
    }

    await recordRuntimeStopDelivery("cancel_dispatched", {
      runtimeStopDelivery: true,
      status: result.status,
      runtimeCancelled,
      runtimeStopDelivered: true,
      ...(runtimeCancellationMarkerError
        ? { runtimeCancellationMarkerError }
        : {}),
    });
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    await recordRuntimeStopDelivery("cancel_failed", {
      runtimeStopDelivery: true,
      error,
      runtimeCancelled: false,
      ...(runtimeCancellationMarkerError
        ? { runtimeCancellationMarkerError }
        : {}),
    });
    console.error(`[mc-chat] Runtime /stop failed: ${error}`);
    return res.status(503).json({
      ok: false,
      error: "Runtime Stop delivery failed",
      code: "runtime_stop_delivery_failed",
      retryable: true,
      cancelled: parentTombstoned && !originCancellationPending,
      alreadyStopped: originAlreadyStopped,
      runtimeCancelled: false,
      runtimeStopDelivered: false,
      runtimeAlreadyStopped: false,
      cancellationPending: true,
      parentTombstoned,
      originCancellationUnavailable,
      childCount: originChildCount + agentRunChildCount,
      childCancellationCount:
        originChildCancellationCount + agentRunChildCancellationCount,
      durableChildCount: originChildCount,
      durableChildCancellationCount: originChildCancellationCount,
      agentRunChildCount,
      agentRunChildCancellationCount,
      agentRunChildRuntimeCancellationCount,
      agentRunChildRuntimeCancellationUnavailable,
    });
  }

  return res.status(200).json({
    ok: true,
    cancelled: parentTombstoned && !originCancellationPending,
    alreadyStopped: originAlreadyStopped,
    runtimeCancelled,
    runtimeStopDelivered: true,
    runtimeAlreadyStopped: !runtimeCancelled,
    cancellationPending: originCancellationPending,
    parentTombstoned,
    originCancellationUnavailable,
    childCount: originChildCount + agentRunChildCount,
    childCancellationCount:
      originChildCancellationCount + agentRunChildCancellationCount,
    durableChildCount: originChildCount,
    durableChildCancellationCount: originChildCancellationCount,
    agentRunChildCount,
    agentRunChildCancellationCount,
    agentRunChildRuntimeCancellationCount,
    agentRunChildRuntimeCancellationUnavailable,
  });
}

export default compose(withErrorHandler, withAuth)(cancelHandler);
