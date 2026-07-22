import type { NextApiRequest, NextApiResponse } from "next";
import { getAgentRunByIdAsync } from "@/lib/data/agent-runs";
import { loadClient } from "@/lib/data/clients";
import {
  LeadsSearchAgentBridgeError,
  admitLeadsSearchFromAgent,
  type LeadsSearchAgentBridgeDependencies,
} from "@/lib/leads/search-agent-bridge";
import {
  leadsSearchApiFailure,
  plainRecord,
  prepareLeadsSearchApiResponse,
  safeLeadsSearchApiLog,
} from "@/lib/leads/search-api-boundary";
import { createRuntimeAdapter, resolveRuntimeId } from "@/lib/runtime";
import { authorizeChatAgentTurnRuntimeRequest } from "@/lib/runtime/chat-agent-turn-dispatch-authority";
import {
  authorizeRuntimeRunRequest,
  type RuntimeRunRequestAuthorityDependencies,
} from "@/lib/runtime/runtime-run-request-authority";
import { authorizeRuntimeTransportSecret } from "@/lib/runtime/runtime-transport-secret";

const POST_BODY_KEYS = new Set(["criteria", "limit"]);
const TERMINAL_STATUSES = new Set([
  "completed",
  "partial",
  "failed",
  "cancelled",
]);

export interface AgentLeadsSearchRouteDependencies
  extends
    LeadsSearchAgentBridgeDependencies,
    RuntimeRunRequestAuthorityDependencies {
  sharedSecret(runtime: string): string | undefined;
  clientExists(slug: string): boolean;
  logError?: (message: string) => void;
}

interface AgentLeadsSearchAuthority {
  tenantSlug: string;
  threadId: string;
  agentRunId: string;
  principal: "mc-admin";
}

function singleHeader(req: NextApiRequest, name: string): string | undefined {
  const value = req.headers[name];
  return Array.isArray(value) ? undefined : value;
}

function invalidAgentContext(): LeadsSearchAgentBridgeError {
  return new LeadsSearchAgentBridgeError(
    "leads_search_agent_context_invalid",
    403,
  );
}

async function trustedRuntimeAuthority(
  req: NextApiRequest,
  dependencies: AgentLeadsSearchRouteDependencies,
): Promise<AgentLeadsSearchAuthority> {
  // Tenant claims are never part of this trust boundary. Reject the legacy
  // header rather than accidentally reintroducing it during a rolling deploy.
  if (singleHeader(req, "x-sancho-client-slug") !== undefined) {
    throw invalidAgentContext();
  }
  const authority = await authorizeRuntimeRunRequest(
    {
      runId: singleHeader(req, "x-mission-control-run-id"),
      capability: singleHeader(req, "x-sancho-run-capability"),
      dispatchRunId: singleHeader(req, "x-sancho-dispatch-run-id"),
      dispatchLeaseToken: singleHeader(req, "x-sancho-dispatch-lease-token"),
    },
    dependencies,
  );
  const run = authority?.run;
  const input = authority?.input;
  const transportAuthorization =
    authority && run && input
      ? authorizeRuntimeTransportSecret({
          suppliedSecret: singleHeader(req, "x-mc-secret"),
          runInput: input,
          resolveLegacySecret: () => dependencies.sharedSecret(run.runtime),
        })
      : "forbidden";
  if (transportAuthorization === "legacy_secret_missing") {
    throw new LeadsSearchAgentBridgeError(
      "leads_search_agent_bridge_unavailable",
      503,
    );
  }
  if (
    !authority ||
    !run ||
    !input ||
    transportAuthorization !== "authorized" ||
    input.isAdmin !== true ||
    input.senderRole !== "admin" ||
    input.readOnly !== false ||
    input.userId !== "mc-admin" ||
    input.controlDepth !== 0 ||
    input.temporaryAgent === true ||
    !dependencies.clientExists(authority.slug)
  ) {
    throw invalidAgentContext();
  }
  return {
    tenantSlug: authority.slug,
    threadId: run.threadId,
    agentRunId: run.id,
    principal: "mc-admin",
  };
}

function publicReceipt(value: {
  operation: string;
  runId: string;
  status: string;
  completionBoundary: string;
  created?: boolean;
  replayed?: boolean;
}) {
  return {
    operation: value.operation,
    runId: value.runId,
    status: value.status,
    completionBoundary: value.completionBoundary,
    ...(typeof value.created === "boolean" ? { created: value.created } : {}),
    ...(typeof value.replayed === "boolean"
      ? { replayed: value.replayed }
      : {}),
  };
}

function bridgeFailure(error: unknown): { status: number; code: string } {
  if (error instanceof LeadsSearchAgentBridgeError) {
    return { status: error.status, code: error.code };
  }
  return leadsSearchApiFailure(error);
}

export function createAgentLeadsSearchHandler(
  dependencies: AgentLeadsSearchRouteDependencies,
) {
  return async function agentLeadsSearchHandler(
    req: NextApiRequest,
    res: NextApiResponse,
  ) {
    const trace = prepareLeadsSearchApiResponse(req, res);
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      return res.status(405).json({
        error: "leads_search_method_not_allowed",
        traceId: trace.traceId,
      });
    }

    try {
      const authority = await trustedRuntimeAuthority(req, dependencies);
      const tenantSlug = authority.tenantSlug;
      if (Object.keys(req.query).length > 0) {
        throw new LeadsSearchAgentBridgeError(
          "leads_search_query_invalid",
          400,
        );
      }

      const body = plainRecord(req.body);
      if (!body || Object.keys(body).some((key) => !POST_BODY_KEYS.has(key))) {
        throw new LeadsSearchAgentBridgeError("leads_search_body_invalid", 400);
      }
      const { receipt } = await admitLeadsSearchFromAgent(
        {
          tenantSlug,
          agentRunId: authority.agentRunId,
          traceId: trace.traceId,
        },
        {
          criteria: body.criteria as Record<string, unknown>,
          limit: body.limit as number | undefined,
        },
        dependencies,
      );
      return res
        .status(TERMINAL_STATUSES.has(receipt.status) ? 200 : 202)
        .json({
          ok: true,
          // A replay may already be terminal, but provider data never returns
          // to the model-facing start call. The durable terminal projector
          // publishes the deterministic result in the same chat thread.
          search: publicReceipt(receipt),
          traceId: trace.traceId,
        });
    } catch (error) {
      const failure = bridgeFailure(error);
      if (failure.status >= 500) {
        safeLeadsSearchApiLog(
          dependencies.logError,
          "agent-admit",
          trace.traceId,
        );
      }
      return res.status(failure.status).json({
        error: failure.code,
        traceId: trace.traceId,
      });
    }
  };
}

const defaultHandler = createAgentLeadsSearchHandler({
  sharedSecret: (runtime) => {
    const runtimeId = resolveRuntimeId(runtime);
    return runtimeId
      ? createRuntimeAdapter(runtimeId).messaging.getSharedSecret?.()
      : undefined;
  },
  clientExists: (slug) => Boolean(loadClient(slug)),
  resolveAgentRun: getAgentRunByIdAsync,
  authorizeDispatchLease: (input) =>
    authorizeChatAgentTurnRuntimeRequest(input),
});

export default defaultHandler;
