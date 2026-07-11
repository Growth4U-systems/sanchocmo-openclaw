import type { NextApiRequest, NextApiResponse } from "next";
import { withErrorHandler } from "@/lib/api-middleware";
import { addMessage, clearStatus, clearProgress } from "@/lib/data/mc-chat";
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
async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { slug, threadId, agent, agentId } = req.body;
  const tid = threadId || slug;
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
  clearStatus(tid);
  clearProgress(tid);
  addMessage(tid, "bot", "Ejecución detenida.", requestedAgent || "sancho");
  console.log(`[mc-chat] Cancelling thread: ${tid}`);

  // Send /stop through the active runtime.
  let runtimeCancelled = false;
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
    try {
      const ack = result.raw ? JSON.parse(result.raw) as { cancelled?: unknown } : null;
      runtimeCancelled = ack?.cancelled === true;
    } catch {
      runtimeCancelled = false;
    }
    if (activeRun) {
      appendAgentRunEvent({
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
      appendAgentRunEvent({
        runId: activeRun.id,
        threadId: tid,
        type: "cancel_failed",
        data: { error: err instanceof Error ? err.message : String(err) },
      });
    }
    console.error(`[mc-chat] Runtime /stop failed: ${err instanceof Error ? err.message : err}`);
  }

  res.status(200).json({ ok: true, runtimeCancelled });
}

export default withErrorHandler(handler);
