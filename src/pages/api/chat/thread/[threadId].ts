import type { NextApiRequest, NextApiResponse } from "next";
import {
  canAccessSlug,
  compose,
  withAuth,
  withErrorHandler,
} from "@/lib/api-middleware";
import {
  getThread,
  getStatusEntry,
  getPendingProgress,
} from "@/lib/data/mc-chat";
import {
  getLatestActiveRunAsync,
  listAgentRunsForThreadAsync,
} from "@/lib/data/agent-runs";
import {
  PostgresExecutionControlRepository,
  type ExecutionOriginControlRepository,
} from "@/lib/execution-control";
import {
  CHAT_EXTERNAL_EXECUTION_PARENT_SCAN_LIMIT,
  EMPTY_CHAT_EXTERNAL_EXECUTION_PROJECTION,
  projectActiveExternalExecutions,
  resolveExternalExecutionParents,
} from "@/lib/chat/external-execution-projection";
import { parseThreadId } from "@/lib/thread-id";

export interface ThreadExecutionProjectionDependencies {
  getLatestActiveRun: typeof getLatestActiveRunAsync;
  listAgentRunsForThread: typeof listAgentRunsForThreadAsync;
  createExecutionRepository(): Pick<
    ExecutionOriginControlRepository,
    "listRunsByExecutionOriginPage"
  >;
}

const defaultExecutionProjectionDependencies: ThreadExecutionProjectionDependencies =
  {
    getLatestActiveRun: getLatestActiveRunAsync,
    listAgentRunsForThread: listAgentRunsForThreadAsync,
    createExecutionRepository: () => new PostgresExecutionControlRepository(),
  };

/**
 * GET /api/chat/thread/:threadId
 * Ported from mc-server.js:5301-5314
 * Gets thread messages and current status
 */
export async function threadHandler(
  req: NextApiRequest,
  res: NextApiResponse,
  executionDependencies: ThreadExecutionProjectionDependencies = defaultExecutionProjectionDependencies,
) {
  if (req.method !== "GET")
    return res.status(405).json({ error: "Method not allowed" });

  const threadId =
    typeof req.query.threadId === "string" ? req.query.threadId : "";
  if (!threadId) return res.status(400).json({ error: "Missing threadId" });
  const parsed = parseThreadId(threadId);
  if (!parsed) return res.status(400).json({ error: "Invalid threadId" });
  if (!canAccessSlug(req.ctx, parsed.slug)) {
    return res.status(403).json({ error: "Forbidden" });
  }

  const thread = getThread(threadId);
  const statusEntry = getStatusEntry(threadId);

  // Suppress status that's been superseded by a newer non-user message — protects
  // against a race where the webhook receives the bot reply between client polls
  // and clearStatus has fired but addMessage hasn't been read yet.
  let liveStatus = statusEntry;
  const STATUS_TTL_MS = 10 * 60 * 1000;
  if (liveStatus && Date.now() - liveStatus.ts > STATUS_TTL_MS) {
    liveStatus = null;
  }
  if (statusEntry && thread?.messages?.length) {
    let lastNonUserTs = 0;
    for (let i = thread.messages.length - 1; i >= 0; i--) {
      const m = thread.messages[i];
      if (
        m.role !== "user" &&
        m.role !== "system" &&
        typeof m.ts === "number"
      ) {
        lastNonUserTs = m.ts;
        break;
      }
    }
    if (lastNonUserTs >= statusEntry.ts) liveStatus = null;
  }

  const pendingProgress = getPendingProgress(threadId);
  const [activeRun, latestRuns] = await Promise.all([
    executionDependencies.getLatestActiveRun(threadId),
    executionDependencies.listAgentRunsForThread(
      threadId,
      CHAT_EXTERNAL_EXECUTION_PARENT_SCAN_LIMIT,
    ),
  ]);
  const executionParents = resolveExternalExecutionParents(
    latestRuns,
    threadId,
  );
  const externalExecutionProjection =
    executionParents.length > 0
      ? await projectActiveExternalExecutions(
          { tenantKey: parsed.slug, parentRuns: executionParents },
          executionDependencies.createExecutionRepository(),
        )
      : EMPTY_CHAT_EXTERNAL_EXECUTION_PROJECTION;

  res.status(200).json({
    ok: true,
    threadId,
    messages: thread?.messages || [],
    routing: thread?.routing || null,
    status: liveStatus,
    pendingProgress,
    activeRun: activeRun
      ? {
          id: activeRun.id,
          status: activeRun.status,
          createdAt: activeRun.createdAt,
        }
      : null,
    ...externalExecutionProjection,
  });
}

const sessionAuthed = compose(withErrorHandler, withAuth)(threadHandler);
const runtimeDisabled = withErrorHandler(
  async (_req: NextApiRequest, res: NextApiResponse) =>
    res.status(403).json({ error: "Runtime thread reads are disabled" }),
);

export default function entry(req: NextApiRequest, res: NextApiResponse) {
  if (req.headers["x-mc-secret"] !== undefined)
    return runtimeDisabled(req, res);
  return sessionAuthed(req, res);
}
