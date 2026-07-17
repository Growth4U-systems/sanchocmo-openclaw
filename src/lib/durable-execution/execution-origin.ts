import type { DurableJsonObject } from "./json-contract";

export const DURABLE_EXECUTION_ORIGIN_SCHEMA_VERSION = 1 as const;
export const DURABLE_EXECUTION_MC_CHAT_ORIGIN_KIND =
  "mc_chat_parent_run" as const;

const PARENT_RUN_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:@/+~-]{0,159}$/;

export interface DurableExecutionMcChatOrigin extends DurableJsonObject {
  schemaVersion: typeof DURABLE_EXECUTION_ORIGIN_SCHEMA_VERSION;
  kind: typeof DURABLE_EXECUTION_MC_CHAT_ORIGIN_KIND;
  parentAgentRunId: string;
}

export type DurableExecutionOrigin = DurableExecutionMcChatOrigin;

export function durableExecutionMcChatOrigin(
  parentAgentRunId: unknown,
): DurableExecutionMcChatOrigin {
  if (
    typeof parentAgentRunId !== "string" ||
    !PARENT_RUN_ID_PATTERN.test(parentAgentRunId)
  ) {
    throw new Error("durable_execution_origin_invalid");
  }
  return Object.freeze({
    schemaVersion: DURABLE_EXECUTION_ORIGIN_SCHEMA_VERSION,
    kind: DURABLE_EXECUTION_MC_CHAT_ORIGIN_KIND,
    parentAgentRunId,
  });
}

export function parseDurableExecutionOrigin(
  value: unknown,
): DurableExecutionOrigin | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  if (
    Object.keys(raw).length !== 3 ||
    raw.schemaVersion !== DURABLE_EXECUTION_ORIGIN_SCHEMA_VERSION ||
    raw.kind !== DURABLE_EXECUTION_MC_CHAT_ORIGIN_KIND
  ) {
    return null;
  }
  try {
    return durableExecutionMcChatOrigin(raw.parentAgentRunId);
  } catch {
    return null;
  }
}
