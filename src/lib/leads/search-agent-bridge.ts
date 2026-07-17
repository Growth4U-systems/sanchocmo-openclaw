import { createHash } from "node:crypto";
import {
  LEADS_SEARCH_HANDLER_VERSION,
  LEADS_SEARCH_MAX_RESULTS,
  LEADS_SEARCH_OPERATION,
  parseLeadsSearchCriteriaV2,
  type LeadsSearchCriteriaV2,
} from "./search-contract-v2";
import {
  admitLeadsSearch,
  type LeadsSearchAdmissionReceipt,
} from "./search-durable-worker";
import { isValidTenantSlug } from "@/lib/thread-id";
import { durableExecutionMcChatOrigin } from "@/lib/durable-execution";
import {
  ExecutionOriginCancelledError,
  ExecutionOriginCommandConflictError,
  PostgresExecutionControlRepository,
  type ExecutionOriginCommandClaimRepository,
} from "@/lib/execution-control";

const AGENT_RUN_ID_MAX_BYTES = 256;
const SAFE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:@/+~-]*$/;

export class LeadsSearchAgentBridgeError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
  ) {
    super(code);
    this.name = "LeadsSearchAgentBridgeError";
  }
}

export interface LeadsSearchAgentRuntimeContext {
  tenantSlug: string;
  agentRunId: string;
  traceId?: string;
}

export interface LeadsSearchAgentAdmissionInput {
  criteria: LeadsSearchCriteriaV2 | Record<string, unknown>;
  limit?: number;
}

export interface LeadsSearchAgentAdmissionIdentity {
  /** Stable aggregate anchor. A changed command under this anchor conflicts. */
  requestId: string;
  /** Fingerprint of the closed, canonical command supplied to admission. */
  commandFingerprint: string;
}

export interface LeadsSearchAgentBridgeDependencies {
  admit?: typeof admitLeadsSearch;
  originCommandRepository?: ExecutionOriginCommandClaimRepository;
}

export interface LeadsSearchAgentAdmissionResult {
  identity: LeadsSearchAgentAdmissionIdentity;
  receipt: LeadsSearchAdmissionReceipt;
}

function canonicalAgentRunId(value: unknown): string {
  if (typeof value !== "string") {
    throw new LeadsSearchAgentBridgeError(
      "leads_search_agent_context_invalid",
      403,
    );
  }
  const normalized = value.trim();
  if (
    !normalized ||
    Buffer.byteLength(normalized, "utf8") > AGENT_RUN_ID_MAX_BYTES ||
    !SAFE_ID_PATTERN.test(normalized)
  ) {
    throw new LeadsSearchAgentBridgeError(
      "leads_search_agent_context_invalid",
      403,
    );
  }
  return normalized;
}

function canonicalTenantSlug(value: unknown): string {
  if (typeof value !== "string") {
    throw new LeadsSearchAgentBridgeError(
      "leads_search_agent_context_invalid",
      403,
    );
  }
  const normalized = value.trim().toLowerCase();
  if (
    !isValidTenantSlug(normalized) ||
    !/^[a-z0-9][a-z0-9-]{0,119}$/.test(normalized)
  ) {
    throw new LeadsSearchAgentBridgeError(
      "leads_search_agent_context_invalid",
      403,
    );
  }
  return normalized;
}

function canonicalLimit(value: unknown): number {
  const limit = value === undefined ? LEADS_SEARCH_MAX_RESULTS : value;
  if (
    typeof limit !== "number" ||
    !Number.isSafeInteger(limit) ||
    limit < 1 ||
    limit > LEADS_SEARCH_MAX_RESULTS
  ) {
    throw new LeadsSearchAgentBridgeError("leads_search_limit_invalid", 400);
  }
  return limit;
}

function canonicalCriteria(value: unknown): LeadsSearchCriteriaV2 {
  try {
    return parseLeadsSearchCriteriaV2(value);
  } catch {
    throw new LeadsSearchAgentBridgeError("leads_search_criteria_invalid", 400);
  }
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/**
 * The chat run is the stable aggregate anchor. The canonical command
 * fingerprint is the second half of the identity contract: the durable
 * admission layer replays the same pair and rejects the same anchor with a
 * different command as a 409 instead of creating another provider effect.
 */
export function leadsSearchAgentAdmissionIdentity(input: {
  tenantSlug: string;
  agentRunId: string;
  criteria: LeadsSearchCriteriaV2;
  limit: number;
}): LeadsSearchAgentAdmissionIdentity {
  const tenantSlug = canonicalTenantSlug(input.tenantSlug);
  const agentRunId = canonicalAgentRunId(input.agentRunId);
  const command = {
    schemaVersion: LEADS_SEARCH_HANDLER_VERSION,
    slug: tenantSlug,
    credentialRef: `apollo://tenant/${tenantSlug}`,
    criteria: input.criteria,
    limit: input.limit,
  } as const;
  return {
    requestId: `mc-chat-${sha256(agentRunId).slice(0, 48)}`,
    commandFingerprint: sha256(JSON.stringify(command)),
  };
}

export async function admitLeadsSearchFromAgent(
  context: LeadsSearchAgentRuntimeContext,
  input: LeadsSearchAgentAdmissionInput,
  dependencies: LeadsSearchAgentBridgeDependencies = {},
): Promise<LeadsSearchAgentAdmissionResult> {
  const tenantSlug = canonicalTenantSlug(context.tenantSlug);
  const agentRunId = canonicalAgentRunId(context.agentRunId);
  const criteria = canonicalCriteria(input.criteria);
  const limit = canonicalLimit(input.limit);
  const identity = leadsSearchAgentAdmissionIdentity({
    tenantSlug,
    agentRunId,
    criteria,
    limit,
  });
  const origin = durableExecutionMcChatOrigin(agentRunId);
  const originCommandRepository =
    dependencies.originCommandRepository ??
    new PostgresExecutionControlRepository();
  try {
    const receipt = await (dependencies.admit ?? admitLeadsSearch)(
      {
        slug: tenantSlug,
        requestId: identity.requestId,
        criteria,
        limit,
        ...(context.traceId ? { traceId: context.traceId } : {}),
      },
      {
        trustedOrigin: origin,
        beforeLedgerAdmission: async () => {
          await originCommandRepository.claimExecutionOriginCommand({
            tenantKey: tenantSlug,
            origin,
            operation: LEADS_SEARCH_OPERATION,
            commandFingerprint: identity.commandFingerprint,
          });
        },
      },
    );
    return { identity, receipt };
  } catch (error) {
    const code =
      error && typeof error === "object" && "code" in error
        ? (error as { code?: unknown }).code
        : undefined;
    if (
      error instanceof ExecutionOriginCommandConflictError ||
      code === "execution_origin_command_conflict"
    ) {
      throw new LeadsSearchAgentBridgeError("execution_command_conflict", 409);
    }
    if (
      error instanceof ExecutionOriginCancelledError ||
      code === "execution_origin_cancelled"
    ) {
      throw new LeadsSearchAgentBridgeError("execution_origin_cancelled", 409);
    }
    throw error;
  }
}
