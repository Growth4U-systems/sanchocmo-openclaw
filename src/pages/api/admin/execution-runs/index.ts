import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/pages/api/auth/[...nextauth]";
import {
  PostgresExecutionControlRepository,
  type ExecutionControlReadRepository,
} from "@/lib/execution-control";
import {
  ExecutionInspectorRequestError,
  buildExecutionInspectorListResponse,
  resolveExecutionInspectorListQuery,
} from "@/lib/execution-control/inspector";

export interface ExecutionInspectorSession {
  user?: { role?: unknown } | null;
}

export interface ExecutionRunsRouteDependencies {
  repository: ExecutionControlReadRepository;
  cursorSecret: string;
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

export function createExecutionRunsHandler(
  dependencies: ExecutionRunsRouteDependencies,
) {
  return async function executionRunsHandler(
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
      query = resolveExecutionInspectorListQuery(
        req.query,
        dependencies.cursorSecret,
      );
    } catch (error) {
      if (error instanceof ExecutionInspectorRequestError) {
        return res.status(400).json({ error: error.message });
      }
      safeLog(
        dependencies.logError,
        "[execution-inspector] list query validation failed",
      );
      return res.status(500).json({ error: "Execution inspector unavailable" });
    }

    try {
      const page = await dependencies.repository.listRuns(
        query.repositoryInput,
      );
      return res.status(200).json(
        buildExecutionInspectorListResponse({
          query,
          page,
          cursorSecret: dependencies.cursorSecret,
        }),
      );
    } catch {
      safeLog(dependencies.logError, "[execution-inspector] list read failed");
      return res.status(500).json({ error: "Execution inspector unavailable" });
    }
  };
}

const defaultRepository = new PostgresExecutionControlRepository();
const defaultHandler = createExecutionRunsHandler({
  repository: defaultRepository,
  cursorSecret: String(
    authOptions.secret ??
      process.env.NEXTAUTH_SECRET ??
      "mc-dev-secret-change-me",
  ),
  getSession: (req, res) => getServerSession(req, res, authOptions),
});

export default defaultHandler;
