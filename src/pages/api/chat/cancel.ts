import type { NextApiRequest, NextApiResponse } from "next";
import {
  canAccessSlug,
  compose,
  withAuth,
  withErrorHandler,
} from "@/lib/api-middleware";
import { addMessage, clearStatus, clearProgress, markCancelled } from "@/lib/data/mc-chat";
import { getRuntime, type InboundMessage } from "@/lib/runtime";
import {
  appendAgentRunEventAsync,
  getAgentRunByIdAsync,
  markAgentRunCancelledAsync,
} from "@/lib/data/agent-runs";
import { traceContextFromHeaders, tracePropagationHeaders } from "@/lib/trace-context";
import {
  canonicalThreadId,
  isValidTenantSlug,
  parseThreadId,
} from "@/lib/thread-id";

/**
 * POST /api/chat/cancel
 * Ported from mc-server.js:5046-5076
 * Cancels a running agent and discards its response
 */
export async function cancelHandler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
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
  if (
    !activeRun
    || activeRun.threadId !== tid
    || (activeRun.status !== "queued" && activeRun.status !== "running")
  ) {
    return res.status(409).json({ error: "Agent run is no longer active in this thread" });
  }
  await runtime.messaging.cancel(tid);
  await markAgentRunCancelledAsync(activeRun.id, tid, { requestedAgent });
  // Keep the legacy no-run-id callback path fail-closed during rolling deploys.
  markCancelled(tid);
  clearStatus(tid);
  clearProgress(tid);
  if (activeRun) {
    addMessage(tid, "system", "Ejecución detenida.", requestedAgent || "sancho");
  }
  console.log(`[mc-chat] Cancelling thread: ${tid}`);

  // Send /stop through the active runtime.
  let runtimeCancelled = false;
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
      ...(requestedAgent ? { agent: requestedAgent, agentId: requestedAgent } : {}),
    };
    const result = await runtime.messaging.sendInbound(payload, {
      headers: tracePropagationHeaders(traceContext),
    });
    try {
      const ack = result.raw ? JSON.parse(result.raw) as { cancelled?: unknown } : null;
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
    console.error(`[mc-chat] Runtime /stop failed: ${err instanceof Error ? err.message : err}`);
  }

  res.status(200).json({
    ok: true,
    cancelled: Boolean(activeRun),
    alreadyStopped: !activeRun,
    runtimeCancelled,
  });
}

export default compose(withErrorHandler, withAuth)(cancelHandler);
