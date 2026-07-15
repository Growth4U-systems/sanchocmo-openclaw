import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/pages/api/auth/[...nextauth]";
import {
  PostgresExecutionControlRepository,
  type ExecutionControlReadRepository,
} from "@/lib/execution-control";
import {
  ExecutionInspectorRequestError,
  ExecutionInspectorSanitizationError,
  buildExecutionInspectorDetailResponse,
  resolveExecutionInspectorDetailQuery,
} from "@/lib/execution-control/inspector";
import type { ExecutionInspectorSession } from "./index";

export interface ExecutionRunDetailRouteDependencies {
  repository: ExecutionControlReadRepository;
  getSession: (
    req: NextApiRequest,
    res: NextApiResponse,
  ) => Promise<ExecutionInspectorSession | null>;
  logError?: (message: string) => void;
}

function safeLog(
  logger: ((message: string) => void) | undefined,
  message: string,
): void {
  try {
    (logger ?? console.error)(message);
  } catch {
    // Logging must not become a second response failure path.
  }
}

export function createExecutionRunDetailHandler(
  dependencies: ExecutionRunDetailRouteDependencies,
) {
  return async function executionRunDetailHandler(
    req: NextApiRequest,
    res: NextApiResponse,
  ) {
    res.setHeader("Cache-Control", "private, no-store");

    if (req.method !== "GET") {
      res.setHeader("Allow", "GET");
      return res.status(405).json({ error: "Method not allowed" });
    }

    let session: ExecutionInspectorSession | null;
    try {
      session = await dependencies.getSession(req, res);
    } catch {
      safeLog(
        dependencies.logError,
        "[execution-inspector] session lookup failed",
      );
      return res.status(500).json({ error: "Execution inspector unavailable" });
    }
    if (!session?.user) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    if (session.user.role !== "admin") {
      return res.status(403).json({ error: "Forbidden" });
    }

    let query;
    try {
      query = resolveExecutionInspectorDetailQuery(req.query);
    } catch (error) {
      if (error instanceof ExecutionInspectorRequestError) {
        return res.status(400).json({ error: error.message });
      }
      safeLog(
        dependencies.logError,
        "[execution-inspector] detail query validation failed",
      );
      return res.status(500).json({ error: "Execution inspector unavailable" });
    }

    try {
      // The tenant condition is part of the repository read. A run belonging
      // to another tenant is deliberately indistinguishable from a missing id.
      const run = await dependencies.repository.getRunByIdForTenant(
        query.tenantKey,
        query.runId,
      );
      if (!run || run.tenantKey !== query.tenantKey)
        return res.status(404).json({ error: "Execution run not found" });

      const [steps, events] = await Promise.all([
        dependencies.repository.listStepsPage({
          tenantKey: query.tenantKey,
          runId: query.runId,
          limit: query.stepsLimit,
        }),
        dependencies.repository.listEventsPage({
          tenantKey: query.tenantKey,
          runId: query.runId,
          ...(query.afterSequence !== undefined
            ? { afterSequence: query.afterSequence }
            : {}),
          limit: query.eventsLimit,
        }),
      ]);

      return res
        .status(200)
        .json(
          buildExecutionInspectorDetailResponse({ query, run, steps, events }),
        );
    } catch (error) {
      if (error instanceof ExecutionInspectorSanitizationError) {
        safeLog(
          dependencies.logError,
          "[execution-inspector] detail redaction failed",
        );
        return res
          .status(500)
          .json({ error: "Execution data could not be sanitized safely" });
      }
      safeLog(
        dependencies.logError,
        "[execution-inspector] detail read failed",
      );
      return res.status(500).json({ error: "Execution inspector unavailable" });
    }
  };
}

const defaultRepository = new PostgresExecutionControlRepository();
const defaultHandler = createExecutionRunDetailHandler({
  repository: defaultRepository,
  getSession: (req, res) => getServerSession(req, res, authOptions),
});

export default defaultHandler;
