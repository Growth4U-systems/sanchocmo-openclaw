import {
  getAgentRunByIdAsync,
  listAgentRunEventsAsync,
  type AgentRun,
  type AgentRunEvent,
} from "@/lib/data/agent-runs";
import {
  parseDurableExecutionOrigin,
  type DurableExecutionOrigin,
} from "@/lib/durable-execution";
import {
  PostgresExecutionControlRepository,
  type ExecutionOriginControlRepository,
  type ExecutionRun,
} from "@/lib/execution-control";
import { canonicalThreadId, parseThreadId } from "@/lib/thread-id";

const SAFE_AGENT_PATTERN = /^[a-z0-9][a-z0-9_-]{0,63}$/;

export interface ResolvedMcChatExecutionOrigin {
  origin: DurableExecutionOrigin;
  parentRun: AgentRun;
  tenantSlug: string;
  threadId: string;
  agent: string;
}

export interface McChatExecutionOriginDependencies {
  resolveAgentRun?(runId: string): Promise<AgentRun | null>;
  resolveAgentRunEvents?(runId: string): Promise<AgentRunEvent[]>;
  originRepository?: Pick<
    ExecutionOriginControlRepository,
    "getRunTrustedExecutionOrigin"
  >;
}

export class McChatExecutionOriginError extends Error {
  readonly code = "mc_chat_execution_origin_invalid" as const;

  constructor() {
    super("The durable MC Chat execution origin is invalid");
    this.name = "McChatExecutionOriginError";
  }
}

function plainRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null
    ? (value as Record<string, unknown>)
    : null;
}

/**
 * Resolve the asynchronous delivery destination from the server-attested
 * parent run. The thread id is deliberately never copied into Ledger
 * metadata: it is re-read and revalidated at delivery time.
 */
export async function resolveMcChatExecutionOrigin(
  executionRun: Pick<ExecutionRun, "id" | "tenantKey" | "metadata">,
  dependencies: McChatExecutionOriginDependencies = {},
): Promise<ResolvedMcChatExecutionOrigin | null> {
  const rawOrigin = executionRun.metadata.executionOrigin;
  const registration = await (
    dependencies.originRepository ?? new PostgresExecutionControlRepository()
  ).getRunTrustedExecutionOrigin({
    tenantKey: executionRun.tenantKey,
    runId: executionRun.id,
  });
  if (!registration) {
    // Metadata alone is explicitly non-authoritative. A mirrored origin with
    // no PG registration is either legacy/corrupt or caller-controlled.
    if (rawOrigin !== undefined) throw new McChatExecutionOriginError();
    return null;
  }
  const origin = parseDurableExecutionOrigin(registration.origin);
  const mirroredOrigin =
    rawOrigin === undefined ? undefined : parseDurableExecutionOrigin(rawOrigin);
  if (
    !origin ||
    (rawOrigin !== undefined &&
      (!mirroredOrigin ||
        mirroredOrigin.kind !== origin.kind ||
        mirroredOrigin.parentAgentRunId !== origin.parentAgentRunId))
  ) {
    throw new McChatExecutionOriginError();
  }
  // The PG tombstone is the cross-host delivery authority. Agent-run events
  // remain a defense-in-depth compatibility tombstone below.
  if (registration.cancellation) return null;

  const parentRun = await (
    dependencies.resolveAgentRun ?? getAgentRunByIdAsync
  )(origin.parentAgentRunId);
  const input = plainRecord(parentRun?.input);
  const parsedThread = parseThreadId(parentRun?.threadId);
  if (
    !parentRun ||
    parentRun.id !== origin.parentAgentRunId ||
    parentRun.runtime !== "openclaw" ||
    !input ||
    !parsedThread ||
    parsedThread.slug !== parsedThread.slug.toLowerCase() ||
    canonicalThreadId(parentRun.threadId) !== parentRun.threadId ||
    parsedThread.slug !== executionRun.tenantKey ||
    input.slug !== parsedThread.slug ||
    input.threadId !== parentRun.threadId ||
    input.isAdmin !== true ||
    input.senderRole !== "admin" ||
    input.readOnly !== false ||
    input.userId !== "mc-admin"
  ) {
    throw new McChatExecutionOriginError();
  }

  // Stop is a delivery tombstone for the complete parent/child tree. A child
  // may race to a terminal result while cooperative cancellation propagates;
  // that result remains inspectable in the Ledger but must not reappear in the
  // user's chat after the parent was cancelled.
  if (parentRun.status === "cancelled") return null;
  const parentEvents = await (
    dependencies.resolveAgentRunEvents ?? listAgentRunEventsAsync
  )(parentRun.id);
  if (
    parentEvents.some(
      (event) =>
        event.runId === parentRun.id &&
        event.threadId === parentRun.threadId &&
        event.type === "cancel_requested",
    )
  ) {
    return null;
  }

  const agent =
    typeof parentRun.agent === "string" &&
    SAFE_AGENT_PATTERN.test(parentRun.agent)
      ? parentRun.agent
      : "sancho";
  return {
    origin,
    parentRun,
    tenantSlug: parsedThread.slug,
    threadId: parentRun.threadId,
    agent,
  };
}
