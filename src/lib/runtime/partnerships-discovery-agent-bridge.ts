import { createHash } from "node:crypto";
import {
  partnershipsDiscoveryEffectsV2Requested,
  preflightPartnershipsDiscoveryV2,
  type PartnershipsDiscoveryV2Environment,
  type PartnershipsDiscoveryV2PreflightReceipt,
} from "@/lib/partnerships/discovery-admission-v2";
import {
  ExecutionOriginCancelledError,
  ExecutionOriginCommandConflictError,
  PostgresExecutionControlRepository,
  type ExecutionControlRepository,
  type ExecutionOriginCommandClaimRepository,
} from "@/lib/execution-control";
import { durableExecutionMcChatOrigin } from "@/lib/durable-execution";
import {
  createDiscoverySearch,
  DiscoveryCommandError,
  DiscoveryPlanError,
  DiscoverySetupCommandError,
  isDiscoverySetupPending,
  type CreateDiscoverySearchResult,
} from "@/lib/partnerships";
import {
  DISCOVERY_EXECUTION_OPERATION,
  DISCOVERY_SETUP_OPERATION,
  isPartnershipsDurableWorkerBootEnabled,
  resolveDiscoveryExecutionPolicy,
  type DiscoveryExecutionEnvironment,
  type DiscoveryExecutionPolicy,
} from "@/lib/partnerships/discovery-execution-policy";
import { isValidTenantSlug } from "@/lib/thread-id";
import { parsePartnershipsDiscoveryStartInput } from "./partnerships-discovery-tool-contract.mjs";
import { withTrustedExecutionOrigin } from "./trusted-execution-origin-repository";

const SAFE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:@/+~-]*$/;
const AGENT_RUN_ID_MAX_BYTES = 160;
const THREAD_ID_MAX_BYTES = 512;

export type PartnershipsDiscoveryAgentBridgeErrorCode =
  | "partnerships_discovery_agent_context_invalid"
  | "partnerships_discovery_request_invalid"
  | "partnerships_discovery_not_enabled"
  | "partnerships_discovery_runtime_disabled"
  | "partnerships_discovery_response_invalid"
  | "execution_command_conflict"
  | "execution_origin_cancelled";

export class PartnershipsDiscoveryAgentBridgeError extends Error {
  constructor(
    readonly code: PartnershipsDiscoveryAgentBridgeErrorCode,
    readonly status: 400 | 403 | 409 | 503,
  ) {
    super(code);
    this.name = "PartnershipsDiscoveryAgentBridgeError";
  }
}

export interface PartnershipsDiscoveryAgentRuntimeContext {
  tenantSlug: string;
  threadId: string;
  agentRunId: string;
}

export interface PartnershipsDiscoveryAgentAdmissionIdentity {
  /** Stable aggregate anchor derived exclusively from the persisted chat run. */
  commandId: string;
  /** Evidence for drift tests/log-free diagnostics; never used as authority. */
  commandFingerprint: string;
}

export interface PartnershipsDiscoveryAgentReceipt {
  operation: "partnerships.discovery";
  runId: string;
  setupRunId: string;
  discoveryRunId?: string;
  searchId: string;
  status: "queued" | "running" | "completed";
  completionBoundary: "ledger_admitted" | "discovery_admitted";
  created: boolean;
  replayed: boolean;
}

export interface PartnershipsDiscoveryAgentAdmissionResult {
  identity: PartnershipsDiscoveryAgentAdmissionIdentity;
  receipt: PartnershipsDiscoveryAgentReceipt;
}

type CreateSearchPort = typeof createDiscoverySearch;

export interface PartnershipsDiscoveryAgentBridgeDependencies {
  repository?: ExecutionControlRepository;
  originCommandRepository?: ExecutionOriginCommandClaimRepository;
  env?: PartnershipsDiscoveryV2Environment;
  createSearch?: CreateSearchPort;
  policyFor?: (
    slug: string,
    env?: DiscoveryExecutionEnvironment,
  ) => DiscoveryExecutionPolicy;
  workerBootEnabled?: (env?: DiscoveryExecutionEnvironment) => boolean;
  preflightV2?: (
    slug: string,
    dependencies: { env?: PartnershipsDiscoveryV2Environment },
  ) => Promise<PartnershipsDiscoveryV2PreflightReceipt>;
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .filter(([, child]) => child !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => `${JSON.stringify(key)}:${canonicalJson(child)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function canonicalTenantSlug(value: unknown): string {
  const slug = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!isValidTenantSlug(slug) || !/^[a-z0-9][a-z0-9-]{0,119}$/.test(slug)) {
    throw new PartnershipsDiscoveryAgentBridgeError(
      "partnerships_discovery_agent_context_invalid",
      403,
    );
  }
  return slug;
}

function canonicalOpaqueId(value: unknown, maximumBytes: number): string {
  const id = typeof value === "string" ? value.trim() : "";
  if (
    !id ||
    Buffer.byteLength(id, "utf8") > maximumBytes ||
    !SAFE_ID_PATTERN.test(id)
  ) {
    throw new PartnershipsDiscoveryAgentBridgeError(
      "partnerships_discovery_agent_context_invalid",
      403,
    );
  }
  return id;
}

function canonicalThreadId(value: unknown, tenantSlug: string): string {
  const threadId =
    typeof value === "string" && value === value.trim() ? value : "";
  if (
    !threadId.startsWith(`${tenantSlug}:`) ||
    Buffer.byteLength(threadId, "utf8") > THREAD_ID_MAX_BYTES
  ) {
    throw new PartnershipsDiscoveryAgentBridgeError(
      "partnerships_discovery_agent_context_invalid",
      403,
    );
  }
  return threadId;
}

export function partnershipsDiscoveryAgentAdmissionIdentity(input: {
  tenantSlug: string;
  agentRunId: string;
  plan: unknown;
}): PartnershipsDiscoveryAgentAdmissionIdentity {
  const tenantSlug = canonicalTenantSlug(input.tenantSlug);
  const agentRunId = canonicalOpaqueId(
    input.agentRunId,
    AGENT_RUN_ID_MAX_BYTES,
  );
  return {
    // The model plan is deliberately absent. Changed arguments under the same
    // parent run reach the same aggregate and are rejected by Partnerships'
    // frozen request fingerprint instead of creating a second provider effect.
    commandId: `mc-chat-${sha256(`${tenantSlug}\u0000${agentRunId}`).slice(0, 48)}`,
    commandFingerprint: sha256(
      canonicalJson({ schemaVersion: 1, tenantSlug, plan: input.plan }),
    ),
  };
}

function mapAdmissionFailure(error: unknown): never {
  if (error instanceof PartnershipsDiscoveryAgentBridgeError) throw error;
  const code =
    error && typeof error === "object" && "code" in error
      ? (error as { code?: unknown }).code
      : undefined;
  if (
    error instanceof ExecutionOriginCommandConflictError ||
    code === "execution_origin_command_conflict"
  ) {
    throw new PartnershipsDiscoveryAgentBridgeError(
      "execution_command_conflict",
      409,
    );
  }
  if (
    error instanceof ExecutionOriginCancelledError ||
    code === "execution_origin_cancelled"
  ) {
    throw new PartnershipsDiscoveryAgentBridgeError(
      "execution_origin_cancelled",
      409,
    );
  }
  if (
    (error instanceof DiscoveryCommandError ||
      error instanceof DiscoverySetupCommandError) &&
    error.status === 409
  ) {
    throw new PartnershipsDiscoveryAgentBridgeError(
      "execution_command_conflict",
      409,
    );
  }
  if (
    error instanceof DiscoveryPlanError ||
    ((error instanceof DiscoveryCommandError ||
      error instanceof DiscoverySetupCommandError) &&
      error.status === 400)
  ) {
    throw new PartnershipsDiscoveryAgentBridgeError(
      "partnerships_discovery_request_invalid",
      400,
    );
  }
  throw new PartnershipsDiscoveryAgentBridgeError(
    "partnerships_discovery_runtime_disabled",
    503,
  );
}

function receiptFromResult(
  result: CreateDiscoverySearchResult,
): PartnershipsDiscoveryAgentReceipt {
  if (isDiscoverySetupPending(result)) {
    return {
      operation: "partnerships.discovery",
      runId: result.setupRunId,
      setupRunId: result.setupRunId,
      searchId: result.searchId,
      status: result.status,
      completionBoundary: "ledger_admitted",
      created: !result.replayed,
      replayed: result.replayed,
    };
  }
  const setupRunId = result.search.executionControl?.setupRunId;
  if (!setupRunId || !SAFE_ID_PATTERN.test(setupRunId)) {
    throw new PartnershipsDiscoveryAgentBridgeError(
      "partnerships_discovery_response_invalid",
      503,
    );
  }
  const discoveryRunId = result.search.executionControl?.runId;
  if (discoveryRunId && !SAFE_ID_PATTERN.test(discoveryRunId)) {
    throw new PartnershipsDiscoveryAgentBridgeError(
      "partnerships_discovery_response_invalid",
      503,
    );
  }
  return {
    operation: "partnerships.discovery",
    runId: setupRunId,
    setupRunId,
    ...(discoveryRunId ? { discoveryRunId } : {}),
    searchId: result.search.id,
    status: "completed",
    completionBoundary: "discovery_admitted",
    created: !result.replayed,
    replayed: result.replayed,
  };
}

/**
 * Admission-only bridge. Contract-v2 performs one bounded, read-only Yalc
 * attestation before creating setup/product receipts. The repository decorator
 * propagates the server-owned chat origin into setup and discovery Ledger rows.
 */
export async function admitPartnershipsDiscoveryFromAgent(
  context: PartnershipsDiscoveryAgentRuntimeContext,
  rawInput: unknown,
  dependencies: PartnershipsDiscoveryAgentBridgeDependencies = {},
): Promise<PartnershipsDiscoveryAgentAdmissionResult> {
  const tenantSlug = canonicalTenantSlug(context.tenantSlug);
  const agentRunId = canonicalOpaqueId(
    context.agentRunId,
    AGENT_RUN_ID_MAX_BYTES,
  );
  const threadId = canonicalThreadId(context.threadId, tenantSlug);
  const input = parsePartnershipsDiscoveryStartInput(rawInput);
  if (!input) {
    throw new PartnershipsDiscoveryAgentBridgeError(
      "partnerships_discovery_request_invalid",
      400,
    );
  }
  const policy = (dependencies.policyFor ?? resolveDiscoveryExecutionPolicy)(
    tenantSlug,
    dependencies.env,
  );
  if (!policy.enabled || policy.mode !== "canary") {
    throw new PartnershipsDiscoveryAgentBridgeError(
      "partnerships_discovery_not_enabled",
      403,
    );
  }
  if (
    !(dependencies.workerBootEnabled ?? isPartnershipsDurableWorkerBootEnabled)(
      dependencies.env,
    )
  ) {
    throw new PartnershipsDiscoveryAgentBridgeError(
      "partnerships_discovery_runtime_disabled",
      503,
    );
  }
  if (partnershipsDiscoveryEffectsV2Requested(dependencies.env)) {
    try {
      await (dependencies.preflightV2 ?? preflightPartnershipsDiscoveryV2)(
        tenantSlug,
        { env: dependencies.env },
      );
    } catch {
      throw new PartnershipsDiscoveryAgentBridgeError(
        "partnerships_discovery_runtime_disabled",
        503,
      );
    }
  }

  const identity = partnershipsDiscoveryAgentAdmissionIdentity({
    tenantSlug,
    agentRunId,
    plan: input.plan,
  });
  const origin = durableExecutionMcChatOrigin(agentRunId);
  const originCommandRepository =
    dependencies.originCommandRepository ??
    new PostgresExecutionControlRepository();
  const repository = withTrustedExecutionOrigin(
    dependencies.repository ?? new PostgresExecutionControlRepository(),
    {
      origin,
      operations: [DISCOVERY_SETUP_OPERATION, DISCOVERY_EXECUTION_OPERATION],
    },
  );
  try {
    await originCommandRepository.claimExecutionOriginCommand({
      tenantKey: tenantSlug,
      origin,
      operation: DISCOVERY_EXECUTION_OPERATION,
      commandFingerprint: identity.commandFingerprint,
    });
    const result = await (dependencies.createSearch ?? createDiscoverySearch)(
      {
        slug: tenantSlug,
        plan: input.plan,
        threadId,
        commandId: identity.commandId,
        executionIntent: "auto",
      },
      {
        repository,
        env: dependencies.env,
        // Start the durable processor but never turn this model-facing API into
        // a seven-second synchronous provider request.
        setup: { inlineTimeoutMs: 0 },
      },
    );
    return { identity, receipt: receiptFromResult(result) };
  } catch (error) {
    return mapAdmissionFailure(error);
  }
}
