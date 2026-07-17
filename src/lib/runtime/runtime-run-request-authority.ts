import crypto from "node:crypto";
import type { AgentRun } from "@/lib/data/agent-runs";
import { canonicalThreadId, parseThreadId } from "@/lib/thread-id";
import { isFreshRuntimeToolCapability } from "@/lib/runtime/runtime-tool-capability";

const RUN_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:@/+~-]{0,159}$/;
const CAPABILITY_PATTERN = /^[a-f0-9]{64}$/;

export interface RuntimeRunRequestAuthority {
  run: AgentRun;
  input: Record<string, unknown>;
  slug: string;
  threadId: string;
}

export interface RuntimeRunRequestAuthorityDependencies {
  resolveAgentRun(runId: string): Promise<AgentRun | null>;
  authorizeDispatchLease?: (input: {
    parentAgentRunId: unknown;
    dispatchRunId: unknown;
    leaseToken: unknown;
    runtimeToolCapability: unknown;
    allowTerminalParent?: boolean;
    allowCancellationRequested?: boolean;
  }) => Promise<{ parentRun: AgentRun } | null>;
  now?: () => Date;
}

function plainRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null
    ? value as Record<string, unknown>
    : null;
}

function capabilityMatches(raw: string, expectedDigest: unknown): boolean {
  if (
    !CAPABILITY_PATTERN.test(raw) ||
    typeof expectedDigest !== "string" ||
    !CAPABILITY_PATTERN.test(expectedDigest)
  ) {
    return false;
  }
  const actual = crypto.createHash("sha256").update(raw).digest();
  const expected = Buffer.from(expectedDigest, "hex");
  return expected.length === actual.length && crypto.timingSafeEqual(actual, expected);
}

export async function authorizeRuntimeRunRequest(
  input: {
    runId: unknown;
    capability: unknown;
    dispatchRunId?: unknown;
    dispatchLeaseToken?: unknown;
    allowTerminal?: boolean;
  },
  dependencies: RuntimeRunRequestAuthorityDependencies,
): Promise<RuntimeRunRequestAuthority | null> {
  if (
    typeof input.runId !== "string" ||
    !RUN_ID_PATTERN.test(input.runId) ||
    typeof input.capability !== "string" ||
    !CAPABILITY_PATTERN.test(input.capability)
  ) {
    return null;
  }
  const hasDispatchRunId = input.dispatchRunId !== undefined;
  const hasDispatchLeaseToken = input.dispatchLeaseToken !== undefined;
  if (hasDispatchRunId !== hasDispatchLeaseToken) return null;
  let run: AgentRun | null;
  let dispatchAuthorized = false;
  if (hasDispatchRunId) {
    if (!dependencies.authorizeDispatchLease) return null;
    const authority = await dependencies.authorizeDispatchLease({
      parentAgentRunId: input.runId,
      dispatchRunId: input.dispatchRunId,
      leaseToken: input.dispatchLeaseToken,
      runtimeToolCapability: input.capability,
      allowTerminalParent: input.allowTerminal,
      ...(input.allowTerminal === true
        ? { allowCancellationRequested: true }
        : {}),
    });
    if (!authority) return null;
    run = authority.parentRun;
    dispatchAuthorized = true;
  } else {
    run = await dependencies.resolveAgentRun(input.runId);
  }
  const persisted = plainRecord(run?.input);
  const parsed = parseThreadId(run?.threadId);
  const allowedStatuses = input.allowTerminal
    ? new Set(["queued", "running", "completed", "failed", "cancelled"])
    : new Set(["queued", "running"]);
  if (
    !run ||
    run.id !== input.runId ||
    !allowedStatuses.has(run.status) ||
    (!dispatchAuthorized &&
      !isFreshRuntimeToolCapability(
        run,
        (dependencies.now?.() ?? new Date()).getTime(),
      )) ||
    !persisted ||
    !parsed ||
    parsed.slug !== parsed.slug.toLowerCase() ||
    canonicalThreadId(run.threadId) !== run.threadId ||
    persisted.slug !== parsed.slug ||
    persisted.threadId !== run.threadId ||
    (!dispatchAuthorized &&
      !capabilityMatches(
        input.capability,
        persisted.runtimeToolCapabilitySha256,
      ))
  ) {
    return null;
  }
  return {
    run,
    input: persisted,
    slug: parsed.slug,
    threadId: run.threadId,
  };
}
