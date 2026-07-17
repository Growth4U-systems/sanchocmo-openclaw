import type { NextApiRequest, NextApiResponse } from "next";
import { createHash } from "node:crypto";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/pages/api/auth/[...nextauth]";
import {
  PostgresExecutionControlRepository,
  type ExecutionCancellationControlRepository,
  type ExecutionControlReadRepository,
} from "@/lib/execution-control";
import { ExecutionCancellationConflictError } from "@/lib/execution-control/types";
import {
  ExecutionInspectorRequestError,
  ExecutionInspectorSanitizationError,
  buildExecutionInspectorDetailResponse,
  resolveExecutionInspectorDetailQuery,
} from "@/lib/execution-control/inspector";

const DELETE_BODY_KEYS = new Set(["requestId"]);
const REQUEST_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:@/+~-]{0,159}$/;

export interface ExecutionRunDetailSession {
  user?: {
    role?: unknown;
    /** Only an individually authenticated Google session may cancel. */
    authProvider?: unknown;
    /** Stable provider subject when the auth layer exposes one. */
    subject?: unknown;
    /** Standard NextAuth fallback; it is hashed before Ledger persistence. */
    email?: unknown;
  } | null;
}

type ExecutionRunDetailRepository = ExecutionControlReadRepository &
  Pick<ExecutionCancellationControlRepository, "requestRunCancellation">;

export interface ExecutionRunDetailRouteDependencies {
  repository: ExecutionRunDetailRepository;
  getSession: (
    req: NextApiRequest,
    res: NextApiResponse,
  ) => Promise<ExecutionRunDetailSession | null>;
  logError?: (message: string) => void;
}

function plainBody(value: unknown): Record<string, unknown> {
  if (value === undefined || value === null) return {};
  if (
    typeof value !== "object" ||
    Array.isArray(value) ||
    (Object.getPrototypeOf(value) !== Object.prototype &&
      Object.getPrototypeOf(value) !== null)
  ) {
    throw new ExecutionInspectorRequestError("DELETE body is invalid");
  }
  return value as Record<string, unknown>;
}

function normalizedRequestId(value: unknown): string | null {
  if (value === undefined) return null;
  if (typeof value !== "string") {
    throw new ExecutionInspectorRequestError("requestId is invalid");
  }
  const normalized = value.trim();
  if (!REQUEST_ID_PATTERN.test(normalized)) {
    throw new ExecutionInspectorRequestError("requestId is invalid");
  }
  return normalized;
}

/** Exactly one caller-controlled idempotency source is accepted. */
function cancellationRequestId(req: NextApiRequest): string {
  const body = plainBody(req.body);
  if (Object.keys(body).some((key) => !DELETE_BODY_KEYS.has(key))) {
    throw new ExecutionInspectorRequestError("DELETE body is invalid");
  }
  const rawHeader = req.headers["idempotency-key"];
  if (Array.isArray(rawHeader)) {
    throw new ExecutionInspectorRequestError("requestId is invalid");
  }
  const header = normalizedRequestId(rawHeader);
  const requestId = normalizedRequestId(body.requestId);
  if ((header === null) === (requestId === null)) {
    throw new ExecutionInspectorRequestError(
      header === null
        ? "requestId is required"
        : "requestId must be supplied exactly once",
    );
  }
  return requestId ?? (header as string);
}

function boundedIdentity(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized && Buffer.byteLength(normalized, "utf8") <= 320
    ? normalized
    : null;
}

/**
 * Cancellation is an audited human action. A shared legacy admin identity is
 * deliberately insufficient; the persisted value is an opaque per-person
 * digest rather than an email address or display name.
 */
function adminCancellationActorId(
  session: ExecutionRunDetailSession,
): string | null {
  const user = session.user;
  if (!user || user.authProvider !== "google") return null;
  const subject = boundedIdentity(user.subject);
  const email = boundedIdentity(user.email)?.toLowerCase();
  const identity = subject
    ? `google-subject\0${subject}`
    : email && email !== "admin@localhost"
      ? `google-email\0${email}`
      : null;
  if (!identity) return null;
  return `user:${createHash("sha256")
    .update(`execution-admin-cancel-actor-v1\0${identity}`, "utf8")
    .digest("hex")}`;
}

function cancellationId(input: {
  tenantKey: string;
  operation: string;
  mode: string;
  runId: string;
  requestId: string;
}): string {
  return `cancel_${createHash("sha256")
    .update(
      [
        "execution-admin-cancel-v1",
        input.tenantKey,
        input.operation,
        input.mode,
        input.runId,
        input.requestId,
      ].join("\0"),
      "utf8",
    )
    .digest("hex")}`;
}

function isCancellationConflict(error: unknown): boolean {
  return (
    error instanceof ExecutionCancellationConflictError ||
    (!!error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "execution_cancellation_conflict")
  );
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

    if (req.method !== "GET" && req.method !== "DELETE") {
      res.setHeader("Allow", "GET, DELETE");
      return res.status(405).json({ error: "Method not allowed" });
    }

    let session: ExecutionRunDetailSession | null;
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

    let requestId: string | undefined;
    let actorId: string | undefined;
    if (req.method === "DELETE") {
      try {
        requestId = cancellationRequestId(req);
      } catch (error) {
        if (error instanceof ExecutionInspectorRequestError) {
          return res.status(400).json({ error: error.message });
        }
        safeLog(
          dependencies.logError,
          "[execution-inspector] cancellation request validation failed",
        );
        return res
          .status(500)
          .json({ error: "Execution cancellation unavailable" });
      }
      const resolvedActorId = adminCancellationActorId(session);
      if (!resolvedActorId) {
        return res
          .status(403)
          .json({ error: "Individual admin identity required" });
      }
      actorId = resolvedActorId;
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

      if (req.method === "DELETE") {
        // DELETE is a cooperative state transition. It never removes the run,
        // its effects, events, or terminal projection from the Ledger.
        const receipt = await dependencies.repository.requestRunCancellation({
          tenantKey: run.tenantKey,
          operation: run.operation,
          mode: run.mode,
          runId: run.id,
          cancellationId: cancellationId({
            tenantKey: run.tenantKey,
            operation: run.operation,
            mode: run.mode,
            runId: run.id,
            requestId: requestId as string,
          }),
          actor: { type: "user", id: actorId as string },
          reasonCode: "operator_intervention",
        });
        if (!receipt) {
          return res
            .status(409)
            .json({ error: "Execution cancellation conflict" });
        }
        if (
          receipt.run.id !== run.id ||
          receipt.run.tenantKey !== run.tenantKey ||
          receipt.run.operation !== run.operation ||
          receipt.run.mode !== run.mode ||
          (receipt.disposition !== "requested" &&
            receipt.disposition !== "cancelled") ||
          typeof receipt.replayed !== "boolean"
        ) {
          throw new Error("cross-scope execution cancellation receipt");
        }
        return res
          .status(receipt.disposition === "requested" ? 202 : 200)
          .json({
            ok: true,
            cancellation: {
              runId: receipt.run.id,
              status: receipt.run.status,
              disposition: receipt.disposition,
              replayed: receipt.replayed,
            },
          });
      }

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
      if (req.method === "DELETE" && isCancellationConflict(error)) {
        return res
          .status(409)
          .json({ error: "Execution cancellation conflict" });
      }
      if (req.method === "DELETE") {
        safeLog(
          dependencies.logError,
          "[execution-inspector] cancellation failed",
        );
        return res
          .status(500)
          .json({ error: "Execution cancellation unavailable" });
      }
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
