import type { ExecutionRun } from "@/lib/execution-control";
import {
  DURABLE_EXECUTION_HANDLER_CONTRACT_VERSION_V2,
  type DurableExecutionErrorDecision,
  type DurableExecutionHandlerV2,
  type DurableExecutionTerminalProjectionContext,
  type DurableJson,
  type DurableJsonBounds,
  type DurableJsonContract,
  type DurableJsonObject,
} from "@/lib/durable-execution";

export const CHAT_AGENT_TURN_OPERATION = "chat.agent_turn.dispatch" as const;
export const CHAT_AGENT_TURN_AGGREGATE_TYPE = "agent_run" as const;
export const CHAT_AGENT_TURN_HANDLER_VERSION = 1 as const;

const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:@/+~-]{0,255}$/;
const AGENT_PATTERN = /^[a-z0-9][a-z0-9_-]{0,63}$/;
const TENANT_PATTERN = /^[a-z0-9][a-z0-9-]{0,119}$/;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;

const COMMAND_BOUNDS: DurableJsonBounds = Object.freeze({
  maxBytes: 4 * 1024,
  maxDepth: 3,
  maxNodes: 32,
  maxStringBytes: 512,
  maxArrayItems: 1,
  maxObjectKeys: 8,
});

const CHECKPOINT_BOUNDS: DurableJsonBounds = Object.freeze({
  maxBytes: 2 * 1024,
  maxDepth: 2,
  maxNodes: 16,
  maxStringBytes: 512,
  maxArrayItems: 1,
  maxObjectKeys: 6,
});

export interface ChatAgentTurnCommandV1 extends DurableJsonObject {
  schemaVersion: 1;
  parentAgentRunId: string;
  parentInputFingerprint: string;
  slug: string;
  threadId: string;
  agent: string;
}

export interface ChatAgentTurnCheckpointV1 extends DurableJsonObject {
  stage: "runtime_claimed" | "runtime_committed";
  parentAgentRunId: string;
  workerId: string;
}

export interface ChatAgentTurnResultV1 extends DurableJsonObject {
  completionBoundary: "runtime_finished";
  parentAgentRunId: string;
  parentStatus: "completed" | "failed" | "cancelled";
}

export type ChatAgentTurnTerminalProjector = (
  run: ExecutionRun,
  command: ChatAgentTurnCommandV1,
  context: DurableExecutionTerminalProjectionContext,
) => Promise<void> | void;

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("object required");
  }
  return value as Record<string, unknown>;
}

function exactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
): void {
  const keys = Object.keys(value);
  const allowed = new Set(expected);
  if (keys.length !== expected.length || keys.some((key) => !allowed.has(key))) {
    throw new Error("unexpected object shape");
  }
}

function text(value: unknown, pattern: RegExp, maxBytes = 512): string {
  if (typeof value !== "string") throw new Error("string required");
  const parsed = value.trim();
  if (
    !parsed ||
    Buffer.byteLength(parsed, "utf8") > maxBytes ||
    !pattern.test(parsed) ||
    /[\u0000-\u001f\u007f]/.test(parsed)
  ) {
    throw new Error("invalid string");
  }
  return parsed;
}

export function parseChatAgentTurnCommandV1(
  value: unknown,
): ChatAgentTurnCommandV1 {
  const input = record(value);
  exactKeys(input, [
    "schemaVersion",
    "parentAgentRunId",
    "parentInputFingerprint",
    "slug",
    "threadId",
    "agent",
  ]);
  if (input.schemaVersion !== 1) throw new Error("unsupported schema");
  const slug = text(input.slug, TENANT_PATTERN, 120);
  const threadId = text(input.threadId, ID_PATTERN, 512);
  if (!threadId.startsWith(`${slug}:`)) throw new Error("thread mismatch");
  return {
    schemaVersion: 1,
    parentAgentRunId: text(input.parentAgentRunId, ID_PATTERN, 160),
    parentInputFingerprint: text(
      input.parentInputFingerprint,
      SHA256_PATTERN,
      64,
    ),
    slug,
    threadId,
    agent: text(input.agent, AGENT_PATTERN, 64),
  };
}

function parseCheckpoint(value: unknown): ChatAgentTurnCheckpointV1 {
  const input = record(value);
  exactKeys(input, ["stage", "parentAgentRunId", "workerId"]);
  if (
    input.stage !== "runtime_claimed" &&
    input.stage !== "runtime_committed"
  ) {
    throw new Error("invalid stage");
  }
  return {
    stage: input.stage,
    parentAgentRunId: text(input.parentAgentRunId, ID_PATTERN, 160),
    workerId: text(input.workerId, ID_PATTERN, 160),
  };
}

export function parseChatAgentTurnResultV1(
  value: unknown,
): ChatAgentTurnResultV1 {
  const input = record(value);
  exactKeys(input, [
    "completionBoundary",
    "parentAgentRunId",
    "parentStatus",
  ]);
  if (input.completionBoundary !== "runtime_finished") {
    throw new Error("invalid completion boundary");
  }
  if (
    input.parentStatus !== "completed" &&
    input.parentStatus !== "failed" &&
    input.parentStatus !== "cancelled"
  ) {
    throw new Error("invalid parent status");
  }
  return {
    completionBoundary: "runtime_finished",
    parentAgentRunId: text(input.parentAgentRunId, ID_PATTERN, 160),
    parentStatus: input.parentStatus,
  };
}

function contract<T extends DurableJson>(
  bounds: DurableJsonBounds,
  parse: (value: unknown) => T,
): DurableJsonContract<T> {
  return {
    schemaVersion: 1,
    bounds,
    secrets: { mode: "reject" },
    parse,
  };
}

export const chatAgentTurnCommandContractV1 = contract(
  COMMAND_BOUNDS,
  parseChatAgentTurnCommandV1,
);
export const chatAgentTurnCheckpointContractV1 = contract(
  CHECKPOINT_BOUNDS,
  parseCheckpoint,
);
export const chatAgentTurnResultContractV1 = contract(
  CHECKPOINT_BOUNDS,
  parseChatAgentTurnResultV1,
);

export class RemoteChatAgentTurnWorkerRequiredError extends Error {
  readonly code = "remote_chat_agent_turn_worker_required" as const;

  constructor() {
    super("Chat agent turns must be claimed by the fenced runtime worker");
    this.name = "RemoteChatAgentTurnWorkerRequiredError";
  }
}

export function createChatAgentTurnHandlerV1(
  projectTerminal?: ChatAgentTurnTerminalProjector,
): DurableExecutionHandlerV2<
  ChatAgentTurnCommandV1,
  ChatAgentTurnCheckpointV1,
  ChatAgentTurnResultV1,
  Record<string, never>
> {
  return {
    contractVersion: DURABLE_EXECUTION_HANDLER_CONTRACT_VERSION_V2,
    operation: CHAT_AGENT_TURN_OPERATION,
    version: CHAT_AGENT_TURN_HANDLER_VERSION,
    command: chatAgentTurnCommandContractV1,
    checkpoint: chatAgentTurnCheckpointContractV1,
    result: chatAgentTurnResultContractV1,
    effects: {},
    async execute() {
      throw new RemoteChatAgentTurnWorkerRequiredError();
    },
    classifyPureError(error): DurableExecutionErrorDecision {
      return error instanceof RemoteChatAgentTurnWorkerRequiredError
        ? {
            code: error.code,
            retryable: true,
            exhaustion: "retry_until_cancelled",
            message: error.message,
          }
        : {
            code: "chat_agent_turn_contract_invalid",
            retryable: false,
            message: "Chat agent turn failed closed at a pure boundary",
          };
    },
    projectTerminal(run, command, context) {
      return projectTerminal?.(run, command, context);
    },
  };
}
