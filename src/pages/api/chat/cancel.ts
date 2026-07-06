import type { NextApiRequest, NextApiResponse } from "next";
import { withErrorHandler } from "@/lib/api-middleware";
import { clearStatus, clearProgress } from "@/lib/data/mc-chat";
import { getRuntime } from "@/lib/runtime";

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

  clearStatus(tid);
  clearProgress(tid);
  console.log(`[mc-chat] Cancelling thread: ${tid}`);

  // Ask the selected runtime to cancel the active turn.
  try {
    await getRuntime().messaging.cancel(tid, {
      slug,
      ...(requestedAgent ? { agent: requestedAgent, agentId: requestedAgent } : {}),
    });
  } catch (err) {
    console.error(`[mc-chat] Runtime cancel failed: ${err instanceof Error ? err.message : err}`);
  }

  res.status(200).json({ ok: true });
}

export default withErrorHandler(handler);
