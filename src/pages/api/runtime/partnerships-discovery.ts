import crypto from "node:crypto";
import type { NextApiRequest, NextApiResponse } from "next";
import { authorizeChatAgentTurnRuntimeRequest } from "@/lib/runtime/chat-agent-turn-dispatch-authority";
import { getAgentRunByIdAsync } from "@/lib/data/agent-runs";
import { loadClient } from "@/lib/data/clients";
import { getRuntime } from "@/lib/runtime";
import {
  admitPartnershipsDiscoveryFromAgent,
  PartnershipsDiscoveryAgentBridgeError,
  type PartnershipsDiscoveryAgentAdmissionResult,
  type PartnershipsDiscoveryAgentBridgeDependencies,
  type PartnershipsDiscoveryAgentRuntimeContext,
} from "@/lib/runtime/partnerships-discovery-agent-bridge";
import {
  authorizeRuntimeRunRequest,
  type RuntimeRunRequestAuthorityDependencies,
} from "@/lib/runtime/runtime-run-request-authority";
import { traceContextFromHeaders } from "@/lib/trace-context";

const BODY_FIELDS = new Set(["plan"]);
const BRIDGE_ERROR_CODES = new Set([
  "partnerships_discovery_agent_context_invalid",
  "partnerships_discovery_request_invalid",
  "partnerships_discovery_not_enabled",
  "partnerships_discovery_runtime_disabled",
  "partnerships_discovery_response_invalid",
  "execution_command_conflict",
  "execution_origin_cancelled",
]);

type AdmitPort = (
  context: PartnershipsDiscoveryAgentRuntimeContext,
  input: unknown,
  dependencies?: PartnershipsDiscoveryAgentBridgeDependencies,
) => Promise<PartnershipsDiscoveryAgentAdmissionResult>;

export interface AgentPartnershipsDiscoveryRouteDependencies extends RuntimeRunRequestAuthorityDependencies {
  sharedSecret(): string | undefined;
  clientExists(slug: string): boolean;
  admit?: AdmitPort;
  bridge?: PartnershipsDiscoveryAgentBridgeDependencies;
  logError?: (message: string) => void;
}

interface AgentPartnershipsDiscoveryAuthority {
  tenantSlug: string;
  threadId: string;
  agentRunId: string;
}

function plainRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null
    ? (value as Record<string, unknown>)
    : null;
}

function singleHeader(req: NextApiRequest, name: string): string | undefined {
  const value = req.headers[name];
  return Array.isArray(value) ? undefined : value;
}

function safeEqual(left: string | undefined, right: string): boolean {
  if (!left) return false;
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return (
    leftBuffer.length === rightBuffer.length &&
    crypto.timingSafeEqual(leftBuffer, rightBuffer)
  );
}

function bridgeError(
  code: ConstructorParameters<typeof PartnershipsDiscoveryAgentBridgeError>[0],
  status: ConstructorParameters<
    typeof PartnershipsDiscoveryAgentBridgeError
  >[1],
): PartnershipsDiscoveryAgentBridgeError {
  return new PartnershipsDiscoveryAgentBridgeError(code, status);
}

async function trustedRuntimeAuthority(
  req: NextApiRequest,
  dependencies: AgentPartnershipsDiscoveryRouteDependencies,
): Promise<AgentPartnershipsDiscoveryAuthority> {
  const expectedSecret = dependencies.sharedSecret();
  if (!expectedSecret) {
    throw bridgeError("partnerships_discovery_runtime_disabled", 503);
  }
  if (!safeEqual(singleHeader(req, "x-mc-secret"), expectedSecret)) {
    throw bridgeError("partnerships_discovery_agent_context_invalid", 403);
  }
  // Reject public/model tenant claims. Scope comes exclusively from the exact
  // parent run authorized by the currently leased chat dispatch.
  if (singleHeader(req, "x-sancho-client-slug") !== undefined) {
    throw bridgeError("partnerships_discovery_agent_context_invalid", 403);
  }
  const dispatchRunId = singleHeader(req, "x-sancho-dispatch-run-id");
  const dispatchLeaseToken = singleHeader(req, "x-sancho-dispatch-lease-token");
  if (!dispatchRunId || !dispatchLeaseToken) {
    throw bridgeError("partnerships_discovery_agent_context_invalid", 403);
  }
  const authority = await authorizeRuntimeRunRequest(
    {
      runId: singleHeader(req, "x-mission-control-run-id"),
      capability: singleHeader(req, "x-sancho-run-capability"),
      dispatchRunId,
      dispatchLeaseToken,
    },
    dependencies,
  );
  const run = authority?.run;
  const input = authority?.input;
  if (
    !authority ||
    !run ||
    !input ||
    input.runtimeDispatchMode !== "ledger-v1" ||
    input.isAdmin !== true ||
    input.senderRole !== "admin" ||
    input.readOnly !== false ||
    input.userId !== "mc-admin" ||
    !dependencies.clientExists(authority.slug)
  ) {
    throw bridgeError("partnerships_discovery_agent_context_invalid", 403);
  }
  return {
    tenantSlug: authority.slug,
    threadId: authority.threadId,
    agentRunId: run.id,
  };
}

function failure(error: unknown): { status: number; code: string } {
  if (error instanceof PartnershipsDiscoveryAgentBridgeError) {
    return { status: error.status, code: error.code };
  }
  // `tsx` and some bundled route loaders may materialize the same module under
  // two specifiers, so preserve the closed error contract across that boundary
  // without accepting arbitrary object-supplied status codes.
  if (error && typeof error === "object") {
    const candidate = error as {
      name?: unknown;
      status?: unknown;
      code?: unknown;
    };
    if (
      candidate.name === "PartnershipsDiscoveryAgentBridgeError" &&
      typeof candidate.status === "number" &&
      [400, 403, 409, 503].includes(candidate.status) &&
      typeof candidate.code === "string" &&
      BRIDGE_ERROR_CODES.has(candidate.code)
    ) {
      return { status: candidate.status, code: candidate.code };
    }
  }
  return { status: 503, code: "partnerships_discovery_unavailable" };
}

function safeLog(
  logger: ((message: string) => void) | undefined,
  traceId: string,
): void {
  try {
    (logger ?? console.error)(
      `[partnerships-discovery-api] agent admission failed traceId=${traceId}`,
    );
  } catch {
    // Stable API responses must not depend on an observer.
  }
}

export function createAgentPartnershipsDiscoveryHandler(
  dependencies: AgentPartnershipsDiscoveryRouteDependencies,
) {
  return async function agentPartnershipsDiscoveryHandler(
    req: NextApiRequest,
    res: NextApiResponse,
  ) {
    const trace = req.traceContext ?? traceContextFromHeaders(req.headers);
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("X-Request-Id", trace.traceId);
    res.setHeader("traceparent", trace.traceparent);
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      return res.status(405).json({
        error: "partnerships_discovery_method_not_allowed",
        traceId: trace.traceId,
      });
    }

    try {
      const authority = await trustedRuntimeAuthority(req, dependencies);
      if (Object.keys(req.query).length > 0) {
        throw bridgeError("partnerships_discovery_request_invalid", 400);
      }
      const body = plainRecord(req.body);
      if (
        !body ||
        Object.keys(body).length !== 1 ||
        Object.keys(body).some((key) => !BODY_FIELDS.has(key))
      ) {
        throw bridgeError("partnerships_discovery_request_invalid", 400);
      }
      const admitted = await (
        dependencies.admit ?? admitPartnershipsDiscoveryFromAgent
      )(authority, body, dependencies.bridge);
      return res.status(admitted.receipt.created ? 202 : 200).json({
        ok: true,
        discovery: admitted.receipt,
        traceId: trace.traceId,
      });
    } catch (error) {
      const result = failure(error);
      if (result.status >= 500) safeLog(dependencies.logError, trace.traceId);
      return res.status(result.status).json({
        error: result.code,
        traceId: trace.traceId,
      });
    }
  };
}

const defaultHandler = createAgentPartnershipsDiscoveryHandler({
  sharedSecret: () => getRuntime().messaging.getSharedSecret?.(),
  clientExists: (slug) => Boolean(loadClient(slug)),
  resolveAgentRun: getAgentRunByIdAsync,
  authorizeDispatchLease: (input) =>
    authorizeChatAgentTurnRuntimeRequest(input),
});

export default defaultHandler;
