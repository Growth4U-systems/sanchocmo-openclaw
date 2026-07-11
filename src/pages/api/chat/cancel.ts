import type { NextApiRequest, NextApiResponse } from "next";
import {
  canAccessSlug,
  compose,
  withAuth,
  withErrorHandler,
} from "@/lib/api-middleware";
import { clearStatus, clearProgress, markCancelled } from "@/lib/data/mc-chat";
import { getRuntime, type InboundMessage } from "@/lib/runtime";
import {
  appendAgentRunEvent,
  getLatestActiveRun,
  markAgentRunCancelled,
} from "@/lib/data/agent-runs";

/**
 * POST /api/chat/cancel
 * Ported from mc-server.js:5046-5076
 * Cancels a running agent and discards its response
 */
export async function cancelHandler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { slug, threadId, agent, agentId } = req.body;
  if (typeof slug !== "string" || !slug.trim()) {
    return res.status(400).json({ error: "Missing slug" });
  }
  if (!canAccessSlug(req.ctx, slug)) {
    return res.status(403).json({ error: "Forbidden" });
  }
  const tid = threadId || `${slug}:general`;
  if (typeof tid !== "string" || !tid.startsWith(`${slug}:`)) {
    return res.status(400).json({ error: "Thread does not belong to slug" });
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
  await runtime.messaging.cancel(tid);
  const activeRun = getLatestActiveRun(tid);
  if (activeRun) {
    markAgentRunCancelled(activeRun.id, tid, { requestedAgent });
  }
  // Keep the legacy no-run-id callback path fail-closed during rolling deploys.
  markCancelled(tid);
  clearStatus(tid);
  clearProgress(tid);
  console.log(`[mc-chat] Cancelling thread: ${tid}`);

  // Send /stop through the active runtime.
  try {
    const payload: InboundMessage = {
      slug,
      threadId: tid,
      text: "/stop",
      userName: "Admin",
      userId: "mc-admin",
      isAdmin: true,
      ...(requestedAgent ? { agent: requestedAgent, agentId: requestedAgent } : {}),
    };
    const result = await runtime.messaging.sendInbound(payload);
    if (activeRun) {
      appendAgentRunEvent({
        runId: activeRun.id,
        threadId: tid,
        type: result.ok ? "cancel_dispatched" : "cancel_failed",
        data: {
          status: result.status,
          raw: result.raw,
        },
      });
    }
  } catch (err) {
    if (activeRun) {
      appendAgentRunEvent({
        runId: activeRun.id,
        threadId: tid,
        type: "cancel_failed",
        data: { error: err instanceof Error ? err.message : String(err) },
      });
    }
    console.error(`[mc-chat] Runtime /stop failed: ${err instanceof Error ? err.message : err}`);
  }

  res.status(200).json({ ok: true });
}

export default compose(withErrorHandler, withAuth)(cancelHandler);
