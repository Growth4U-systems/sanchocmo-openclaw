import { createHash } from "node:crypto";
import { PostgresExecutionControlRepository } from "@/lib/execution-control";
import type {
  ExecutionControlRepository,
  ExecutionLeaseScope,
  ExecutionRun,
} from "@/lib/execution-control";
import {
  DurableExecutionRegistry,
  prepareDurableExecutionAdmissionV2,
  type DurableCapabilityPolicy,
  type PreparedDurableExecutionAdmissionV2,
} from "@/lib/durable-execution";
import type { AgentRun } from "@/lib/data/agent-runs";
import { isValidTenantSlug } from "@/lib/thread-id";
import {
  CHAT_AGENT_TURN_AGGREGATE_TYPE,
  CHAT_AGENT_TURN_HANDLER_VERSION,
  CHAT_AGENT_TURN_OPERATION,
  createChatAgentTurnHandlerV1,
  parseChatAgentTurnCommandV1,
  type ChatAgentTurnCommandV1,
  type ChatAgentTurnTerminalProjector,
} from "./agent-turn-contract-v1";

export interface ChatAgentTurnEnvironment {
  readonly [key: string]: string | undefined;
  CHAT_AGENT_TURN_EXECUTION_V1?: string;
  CHAT_AGENT_TURN_V1_SLUGS?: string;
  CHAT_AGENT_TURN_DURABLE_WORKER_ENABLED?: string;
}

export interface ChatAgentTurnRolloutPolicy {
  mode: "off" | "canary";
  enabled: boolean;
  reason:
    | "disabled"
    | "invalid_mode"
    | "invalid_allowlist"
    | "invalid_tenant"
    | "slug_not_allowlisted"
    | "worker_disabled"
    | "enabled";
}

export interface AdmitChatAgentTurnDependencies {
  repository?: ExecutionControlRepository;
  env?: ChatAgentTurnEnvironment;
  capabilityPolicy?: DurableCapabilityPolicy;
  projectTerminal?: ChatAgentTurnTerminalProjector;
}

export interface ChatAgentTurnAdmissionReceipt {
  run: ExecutionRun;
  created: boolean;
  command: ChatAgentTurnCommandV1;
}

export interface PreparedChatAgentTurnDispatch
  extends PreparedDurableExecutionAdmissionV2 {
  command: ChatAgentTurnCommandV1;
}

const defaultRepository = new PostgresExecutionControlRepository();

function allowlistedSlugs(raw: string | undefined): {
  slugs: Set<string>;
  invalid: boolean;
} {
  const slugs = new Set<string>();
  let invalid = false;
  for (const item of (raw ?? "").split(",")) {
    const slug = item.trim().toLowerCase();
    if (!slug) continue;
    if (!isValidTenantSlug(slug) || !/^[a-z0-9][a-z0-9-]{0,119}$/.test(slug)) {
      invalid = true;
    } else {
      slugs.add(slug);
    }
  }
  return { slugs, invalid };
}

export function resolveChatAgentTurnPolicy(
  slug: string,
  env: ChatAgentTurnEnvironment = process.env,
): ChatAgentTurnRolloutPolicy {
  const mode = env.CHAT_AGENT_TURN_EXECUTION_V1?.trim().toLowerCase();
  if (!mode || mode === "off") {
    return { mode: "off", enabled: false, reason: "disabled" };
  }
  if (mode !== "canary") {
    return { mode: "off", enabled: false, reason: "invalid_mode" };
  }
  const tenantKey = slug.trim().toLowerCase();
  if (!isValidTenantSlug(tenantKey)) {
    return { mode: "canary", enabled: false, reason: "invalid_tenant" };
  }
  const allowlist = allowlistedSlugs(env.CHAT_AGENT_TURN_V1_SLUGS);
  if (allowlist.invalid) {
    return { mode: "canary", enabled: false, reason: "invalid_allowlist" };
  }
  if (!allowlist.slugs.has(tenantKey)) {
    return {
      mode: "canary",
      enabled: false,
      reason: "slug_not_allowlisted",
    };
  }
  if (env.CHAT_AGENT_TURN_DURABLE_WORKER_ENABLED !== "1") {
    return { mode: "canary", enabled: false, reason: "worker_disabled" };
  }
  return { mode: "canary", enabled: true, reason: "enabled" };
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value) ?? "null";
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(",")}]`;
  }
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    // Match JSON/JSONB persistence: undefined object properties are omitted,
    // while undefined array entries are handled above as JSON null.
    .filter((key) => record[key] !== undefined)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`)
    .join(",")}}`;
}

export function agentRunInputFingerprint(run: Pick<AgentRun, "input">): string {
  return createHash("sha256").update(stableJson(run.input), "utf8").digest("hex");
}

export function chatAgentTurnScope(slug: string): ExecutionLeaseScope {
  return {
    tenantKey: slug.trim().toLowerCase(),
    operation: CHAT_AGENT_TURN_OPERATION,
    mode: "canary",
  };
}

export function chatAgentTurnRegistry(
  projectTerminal?: ChatAgentTurnTerminalProjector,
): DurableExecutionRegistry {
  return new DurableExecutionRegistry().register(
    createChatAgentTurnHandlerV1(projectTerminal),
  );
}

export const chatAgentTurnCapabilityPolicy: DurableCapabilityPolicy =
  Object.freeze({
    mayAdmit: ({
      scope,
      handlerVersion,
    }: Parameters<DurableCapabilityPolicy["mayAdmit"]>[0]) =>
      scope.operation === CHAT_AGENT_TURN_OPERATION &&
      scope.mode === "canary" &&
      isValidTenantSlug(scope.tenantKey) &&
      handlerVersion === CHAT_AGENT_TURN_HANDLER_VERSION,
    mayDrain: ({
      scope,
      handlerVersion,
    }: Parameters<DurableCapabilityPolicy["mayDrain"]>[0]) =>
      scope.operation === CHAT_AGENT_TURN_OPERATION &&
      scope.mode === "canary" &&
      isValidTenantSlug(scope.tenantKey) &&
      handlerVersion === CHAT_AGENT_TURN_HANDLER_VERSION
        ? "allow"
        : "temporarily_suspended",
  });

export function commandForAgentRun(run: AgentRun): ChatAgentTurnCommandV1 {
  const input =
    run.input && typeof run.input === "object" && !Array.isArray(run.input)
      ? (run.input as Record<string, unknown>)
      : null;
  return parseChatAgentTurnCommandV1({
    schemaVersion: 1,
    parentAgentRunId: run.id,
    parentInputFingerprint: agentRunInputFingerprint(run),
    slug: input?.slug,
    threadId: run.threadId,
    agent: run.agent,
  });
}

export async function admitChatAgentTurnDispatch(
  parentRun: AgentRun,
  dependencies: AdmitChatAgentTurnDependencies = {},
): Promise<ChatAgentTurnAdmissionReceipt> {
  const prepared = prepareChatAgentTurnDispatch(parentRun, dependencies);
  const receipt = await (
    dependencies.repository ?? defaultRepository
  ).createRun(prepared.createInput);
  return { run: receipt.run, created: receipt.created, command: prepared.command };
}

export function prepareChatAgentTurnDispatch(
  parentRun: AgentRun,
  dependencies: Omit<AdmitChatAgentTurnDependencies, "repository"> = {},
): PreparedChatAgentTurnDispatch {
  const command = commandForAgentRun(parentRun);
  const env = dependencies.env ?? process.env;
  const policy = resolveChatAgentTurnPolicy(command.slug, env);
  if (!policy.enabled) {
    throw new Error(`chat_agent_turn_rollout_${policy.reason}`);
  }
  const prepared = prepareDurableExecutionAdmissionV2({
    registry: chatAgentTurnRegistry(dependencies.projectTerminal),
    capabilityPolicy:
      dependencies.capabilityPolicy ?? chatAgentTurnCapabilityPolicy,
    scope: chatAgentTurnScope(command.slug),
    handlerVersion: CHAT_AGENT_TURN_HANDLER_VERSION,
    aggregateType: CHAT_AGENT_TURN_AGGREGATE_TYPE,
    aggregateId: parentRun.id,
    idempotencyKey: `${CHAT_AGENT_TURN_OPERATION}:${parentRun.id}:v1`,
    command,
    ...(parentRun.traceId ? { traceId: parentRun.traceId } : {}),
    metadata: { source: "chat.send", parentAgentRunId: parentRun.id },
  });
  return { ...prepared, command };
}
