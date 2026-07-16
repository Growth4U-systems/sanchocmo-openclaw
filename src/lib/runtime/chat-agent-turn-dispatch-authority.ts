import {
  PostgresExecutionControlRepository,
  type ExecutionControlRepository,
  type ExecutionRun,
} from "@/lib/execution-control";
import { getAgentRunByIdAsync, type AgentRun } from "@/lib/data/agent-runs";
import { parseDurableJsonContractValue } from "@/lib/durable-execution";
import {
  CHAT_AGENT_TURN_AGGREGATE_TYPE,
  CHAT_AGENT_TURN_OPERATION,
  chatAgentTurnCommandContractV1,
  type ChatAgentTurnCommandV1,
} from "@/lib/chat/agent-turn-contract-v1";
import {
  agentRunInputFingerprint,
  chatAgentTurnRegistry,
} from "@/lib/chat/agent-turn-durable";
import {
  authorizeRuntimeDispatchLease,
  runtimeDispatchLeaseCapability,
  type RuntimeDispatchLeaseAuthority,
} from "./dispatch-lease-authority";

export const CHAT_AGENT_TURN_REMOTE_LEASE_MS = 60_000 as const;

export type ChatAgentTurnRuntimeAuthority = RuntimeDispatchLeaseAuthority<
  AgentRun,
  ChatAgentTurnCommandV1
>;

export interface ChatAgentTurnDispatchAuthorityDependencies {
  repository?: ExecutionControlRepository;
  resolveParentRun?: (runId: string) => Promise<AgentRun | null>;
}

const defaultRepository = new PostgresExecutionControlRepository();

function parentInput(parent: AgentRun): Record<string, unknown> | null {
  if (
    !parent.input ||
    typeof parent.input !== "object" ||
    Array.isArray(parent.input)
  ) {
    return null;
  }
  return parent.input as Record<string, unknown>;
}

export function parseChatAgentTurnDispatchCommand(
  run: ExecutionRun,
): ChatAgentTurnCommandV1 {
  chatAgentTurnRegistry().resolveRegistered(run);
  return parseDurableJsonContractValue(
    chatAgentTurnCommandContractV1,
    run.input,
    "command",
  ).value;
}

export function chatAgentTurnDispatchBindingMatches(input: {
  parentRun: AgentRun;
  dispatchRun: ExecutionRun;
  command: ChatAgentTurnCommandV1;
}): boolean {
  const parent = input.parentRun;
  const dispatch = input.dispatchRun;
  const command = input.command;
  const persisted = parentInput(parent);
  return Boolean(
    persisted &&
    dispatch.tenantKey === command.slug &&
    dispatch.aggregateType === CHAT_AGENT_TURN_AGGREGATE_TYPE &&
    dispatch.aggregateId === parent.id &&
    command.parentAgentRunId === parent.id &&
    command.parentInputFingerprint === agentRunInputFingerprint(parent) &&
    command.slug === persisted.slug &&
    command.threadId === parent.threadId &&
    command.agent === parent.agent &&
    parent.runtime === "openclaw" &&
    persisted.runtimeDispatchMode === "ledger-v1",
  );
}

/** Backwards-compatible transport field names for the claimed worker. */
export function runtimeToolCapabilityForDispatchLease(input: {
  parentAgentRunId: unknown;
  dispatchRunId: unknown;
  leaseToken: unknown;
}): string {
  return runtimeDispatchLeaseCapability({
    parentRunId: input.parentAgentRunId,
    dispatchRunId: input.dispatchRunId,
    leaseToken: input.leaseToken,
  });
}

export async function authorizeChatAgentTurnRuntimeRequest(
  input: {
    parentAgentRunId: unknown;
    dispatchRunId: unknown;
    leaseToken: unknown;
    runtimeToolCapability: unknown;
    allowTerminalParent?: boolean;
    allowCancellationRequested?: boolean;
  },
  dependencies: ChatAgentTurnDispatchAuthorityDependencies = {},
): Promise<ChatAgentTurnRuntimeAuthority | null> {
  return authorizeRuntimeDispatchLease(
    {
      parentRunId: input.parentAgentRunId,
      dispatchRunId: input.dispatchRunId,
      leaseToken: input.leaseToken,
      capability: input.runtimeToolCapability,
      allowTerminalParent: input.allowTerminalParent,
      allowCancellationRequested: input.allowCancellationRequested,
    },
    {
      repository: dependencies.repository ?? defaultRepository,
      contract: {
        operation: CHAT_AGENT_TURN_OPERATION,
        mode: "canary",
        aggregateType: CHAT_AGENT_TURN_AGGREGATE_TYPE,
        leaseMs: CHAT_AGENT_TURN_REMOTE_LEASE_MS,
        resolveParentRun: dependencies.resolveParentRun ?? getAgentRunByIdAsync,
        parseCommand: parseChatAgentTurnDispatchCommand,
        bindingMatches: chatAgentTurnDispatchBindingMatches,
      },
    },
  );
}
