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
import { getRuntime, type InboundMessage } from "@/lib/runtime";
import {
  appendAgentRunEventAsync,
  getAgentRunByIdAsync,
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
import { PostgresExecutionControlRepository } from "@/lib/execution-control";
import {
  CHAT_AGENT_TURN_AGGREGATE_TYPE,
  CHAT_AGENT_TURN_OPERATION,
} from "@/lib/chat/agent-turn-contract-v1";
import { requestExecutionOriginCancellation } from "@/lib/durable-execution";

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

  const { slug, threadId, runId, agent, agentId } = req.body;
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
  const requestedAgent =
    typeof agentId === "string" && agentId.trim()
      ? agentId.trim()
      : typeof agent === "string" && agent.trim()
        ? agent.trim()
        : typeof tid === "string" && tid.split(":")[1] === "yalc"
          ? "rocinante"
          : undefined;

  const runtime = getRuntime();
  const activeRun = await getAgentRunByIdAsync(runId.trim());
  if (!activeRun || activeRun.threadId !== tid) {
    return res
      .status(409)
      .json({ error: "Agent run is no longer active in this thread" });
  }
  const parentWasActive =
    activeRun.status === "queued" || activeRun.status === "running";
  const durableTurn =
    record(activeRun.input)?.runtimeDispatchMode === "ledger-v1";
  if (!parentWasActive && !durableTurn) {
    return res
      .status(409)
      .json({ error: "Agent run is no longer active in this thread" });
  }
  let durableCancellationPending = false;
  let durableRuntimeCancelled = false;
  let durableAlreadyStopped = false;
  let durableChildCount = 0;
  let durableChildCancellationCount = 0;
  if (durableTurn) {
    const repository = new PostgresExecutionControlRepository();
    const dispatch = await repository.getRunByAggregate({
      tenantKey: slug,
      aggregateType: CHAT_AGENT_TURN_AGGREGATE_TYPE,
      aggregateId: activeRun.id,
      operation: CHAT_AGENT_TURN_OPERATION,
    });
    if (
      !dispatch ||
      dispatch.mode !== "canary" ||
      typeof repository.requestRunCancellation !== "function"
    ) {
      return res.status(503).json({
        error: "Durable cancellation is unavailable",
        retryable: true,
      });
    }
    const actor = {
      type: "user" as const,
      id: req.ctx?.isAdmin ? "mc-admin" : `client:${slug}`,
    };
    const childCancellation = await requestExecutionOriginCancellation(
      {
        tenantKey: slug,
        parentAgentRunId: activeRun.id,
        actor,
      },
      repository,
    );
    durableChildCount = childCancellation.children.length;
    durableChildCancellationCount = childCancellation.requestedRunIds.length;
    if (!parentWasActive && durableChildCount === 0) {
      return res.status(409).json({
        error: "Agent run has no active durable work in this thread",
      });
    }

    let parentCancellationPending = false;
    if (parentWasActive) {
      const cancellationId = `cancel_${createHash("sha256")
        .update(`chat-agent-turn-cancel-v1\0${activeRun.id}`)
        .digest("hex")
        .slice(0, 32)}`;
      const cancellation = await repository.requestRunCancellation({
        tenantKey: dispatch.tenantKey,
        operation: CHAT_AGENT_TURN_OPERATION,
        mode: dispatch.mode,
        runId: dispatch.id,
        cancellationId,
        actor,
        reasonCode: "user_requested",
      });
      if (!cancellation && durableChildCancellationCount === 0) {
        return res.status(409).json({
          error: "Durable execution is no longer cancellable",
        });
      }
      parentCancellationPending = cancellation?.disposition === "requested";
      durableRuntimeCancelled = cancellation?.disposition === "cancelled";
    } else {
      durableRuntimeCancelled = true;
      durableAlreadyStopped = durableChildCancellationCount === 0;
    }
    durableCancellationPending =
      parentCancellationPending || childCancellation.pendingRunIds.length > 0;
  }
  if (parentWasActive) await runtime.messaging.cancel(tid);
  if (
    durableTurn &&
    (durableCancellationPending ||
      (!parentWasActive && durableChildCancellationCount > 0))
  ) {
    await appendAgentRunEventAsync({
      runId: activeRun.id,
      threadId: tid,
      type: "cancel_requested",
      data: {
        requestedAgent,
        childCount: durableChildCount,
        childCancellationCount: durableChildCancellationCount,
      },
    });
  } else if (parentWasActive) {
    await markAgentRunCancelledAsync(activeRun.id, tid, {
      requestedAgent,
      childCount: durableChildCount,
      childCancellationCount: durableChildCancellationCount,
    });
  }
  // Keep the legacy no-run-id callback path fail-closed during rolling deploys.
  if (parentWasActive) markCancelled(tid);
  clearStatus(tid);
  clearProgress(tid);
  addMessage(
    tid,
    "system",
    durableCancellationPending
      ? "Cancelación solicitada. Esperando confirmación de las tareas activas."
      : durableAlreadyStopped
        ? "No había tareas activas que detener."
        : "Ejecución detenida.",
    requestedAgent || "sancho",
  );
  console.log(`[mc-chat] Cancelling thread: ${tid}`);

  // Send /stop through the active runtime.
  let runtimeCancelled = durableRuntimeCancelled;
  if (durableTurn) {
    return res.status(200).json({
      ok: true,
      cancelled: !durableCancellationPending,
      alreadyStopped: durableAlreadyStopped,
      runtimeCancelled,
      cancellationPending: durableCancellationPending,
      childCount: durableChildCount,
      childCancellationCount: durableChildCancellationCount,
    });
  }
  try {
    const payload: InboundMessage = {
      slug,
      threadId: tid,
      text: "/stop",
      traceId: traceContext.traceId,
      traceparent: traceContext.traceparent,
      userName: "Admin",
      userId: "mc-admin",
      isAdmin: true,
      ...(requestedAgent
        ? { agent: requestedAgent, agentId: requestedAgent }
        : {}),
    };
    const result = await runtime.messaging.sendInbound(payload, {
      headers: tracePropagationHeaders(traceContext),
    });
    try {
      const ack = result.raw
        ? (JSON.parse(result.raw) as { cancelled?: unknown })
        : null;
      runtimeCancelled = ack?.cancelled === true;
    } catch {
      runtimeCancelled = false;
    }
    if (activeRun) {
      await appendAgentRunEventAsync({
        runId: activeRun.id,
        threadId: tid,
        type: result.ok ? "cancel_dispatched" : "cancel_failed",
        data: {
          status: result.status,
          raw: result.raw,
          runtimeCancelled,
        },
      });
    }
  } catch (err) {
    if (activeRun) {
      await appendAgentRunEventAsync({
        runId: activeRun.id,
        threadId: tid,
        type: "cancel_failed",
        data: { error: err instanceof Error ? err.message : String(err) },
      });
    }
    console.error(
      `[mc-chat] Runtime /stop failed: ${err instanceof Error ? err.message : err}`,
    );
  }

  res.status(200).json({
    ok: true,
    cancelled: Boolean(activeRun),
    alreadyStopped: !activeRun,
    runtimeCancelled,
  });
}

export default compose(withErrorHandler, withAuth)(cancelHandler);
