import type { NextApiRequest, NextApiResponse } from "next";
import {
  canAccessSlug,
  compose,
  withAuth,
  withErrorHandler,
} from "@/lib/api-middleware";
import {
  listAgentRunEventsAsync,
  listAgentRunsForThreadAsync,
} from "@/lib/data/agent-runs";
import { parseThreadId } from "@/lib/thread-id";

export async function runsHandler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const threadId = typeof req.query.threadId === "string" ? req.query.threadId.trim() : "";
  if (!threadId) {
    return res.status(400).json({ error: "Missing threadId" });
  }
  const parsed = parseThreadId(threadId);
  if (!parsed) return res.status(400).json({ error: "Invalid threadId" });
  if (!canAccessSlug(req.ctx, parsed.slug)) {
    return res.status(403).json({ error: "Forbidden" });
  }

  if (Array.isArray(req.query.limit)) {
    return res.status(400).json({ error: "Invalid limit" });
  }
  const parsedLimit = req.query.limit === undefined ? 50 : Number(req.query.limit);
  if (!Number.isSafeInteger(parsedLimit) || parsedLimit < 1 || parsedLimit > 100) {
    return res.status(400).json({ error: "limit must be an integer from 1 to 100" });
  }
  const threadRunsWithSentinel = await listAgentRunsForThreadAsync(threadId, parsedLimit + 1);
  const hasMore = threadRunsWithSentinel.length > parsedLimit;
  const threadRuns = hasMore ? threadRunsWithSentinel.slice(1) : threadRunsWithSentinel;
  const runs = await Promise.all(threadRuns.map(async (run) => ({
    ...run,
    events: await listAgentRunEventsAsync(run.id),
  })));
  return res.status(200).json({ ok: true, threadId, runs, hasMore });
}

export default compose(withErrorHandler, withAuth)(runsHandler);
