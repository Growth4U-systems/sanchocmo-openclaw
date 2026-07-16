import type { NextApiRequest, NextApiResponse } from "next";
import { compose, withErrorHandler, withSlugAuth } from "@/lib/api-middleware";
import { getDb } from "@/db/drizzle";
import {
  cancelLeadsSearch,
  getLeadsSearchStatus,
  type LeadsSearchCancellationInput,
  type LeadsSearchCancellationReceipt,
  type LeadsSearchStatusInput,
  type LeadsSearchStatusReceipt,
} from "@/lib/leads/search-durable-worker";
import {
  parseLeadsSearchResultV2,
  type LeadsSearchResultV2,
} from "@/lib/leads/search-contract-v2";
import { PostgresLeadsSearchProjectionRepository } from "@/lib/leads/search-projection-postgres";
import type {
  LeadsSearchProjection,
  LeadsSearchProjectionRepository,
} from "@/lib/leads/search-projection";
import {
  LeadsSearchApiRequestError,
  leadsSearchActorId,
  leadsSearchApiFailure,
  leadsSearchApiRunId,
  leadsSearchApiSlug,
  leadsSearchIdempotency,
  plainRecord,
  prepareLeadsSearchApiResponse,
  safeLeadsSearchApiLog,
} from "@/lib/leads/search-api-boundary";

const DELETE_BODY_KEYS = new Set(["slug", "requestId"]);
const RUN_STATUSES = new Set([
  "queued",
  "running",
  "waiting_approval",
  "blocked",
  "completed",
  "partial",
  "failed",
  "cancelled",
]);

export interface LeadsSearchDetailRouteDependencies {
  status(
    input: LeadsSearchStatusInput,
  ): Promise<LeadsSearchStatusReceipt | null>;
  cancel(
    input: LeadsSearchCancellationInput,
  ): Promise<LeadsSearchCancellationReceipt | null>;
  projections: Pick<LeadsSearchProjectionRepository, "get">;
  logError?: (message: string) => void;
}

function safeText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function publicProjection(projection: LeadsSearchProjection) {
  return {
    id: projection.runId,
    status: projection.terminalStatus,
    candidateCount: projection.candidateCount,
    result: projection.result,
    projectedAt: projection.projectedAt,
  };
}

function publicStatus(
  slug: string,
  value: LeadsSearchStatusReceipt,
): {
  runId: string;
  status: string;
  completionBoundary: "ledger_admitted" | "search_completed";
  statusUrl: string;
  result?: LeadsSearchResultV2;
} {
  const candidate = value as unknown as Record<string, unknown>;
  const runId = safeText(candidate.runId);
  const status = safeText(candidate.status);
  const completionBoundary = candidate.completionBoundary;
  if (
    !runId ||
    !status ||
    !RUN_STATUSES.has(status) ||
    (completionBoundary !== "ledger_admitted" &&
      completionBoundary !== "search_completed")
  ) {
    throw new Error("invalid leads.search status receipt");
  }
  const result =
    candidate.result === undefined
      ? undefined
      : parseLeadsSearchResultV2(candidate.result);
  return {
    runId,
    status,
    completionBoundary,
    statusUrl: `/api/leads/searches/${encodeURIComponent(runId)}?slug=${encodeURIComponent(slug)}`,
    ...(result ? { result } : {}),
  };
}

function publicCancellation(
  slug: string,
  value: LeadsSearchCancellationReceipt,
) {
  const candidate = value as unknown as Record<string, unknown>;
  const runId = safeText(candidate.runId);
  const status = safeText(candidate.status);
  if (
    !runId ||
    !status ||
    !RUN_STATUSES.has(status) ||
    (candidate.disposition !== "requested" &&
      candidate.disposition !== "cancelled") ||
    typeof candidate.replayed !== "boolean"
  ) {
    throw new Error("invalid leads.search cancellation receipt");
  }
  return {
    runId,
    status,
    disposition: candidate.disposition,
    replayed: candidate.replayed,
    statusUrl: `/api/leads/searches/${encodeURIComponent(runId)}?slug=${encodeURIComponent(slug)}`,
  };
}

function deleteInput(
  req: NextApiRequest,
  slug: string,
  runId: string,
): LeadsSearchCancellationInput {
  const body =
    req.body === undefined || req.body === null ? {} : plainRecord(req.body);
  if (!body) {
    throw new LeadsSearchApiRequestError("leads_search_body_invalid");
  }
  if (Object.keys(body).some((key) => !DELETE_BODY_KEYS.has(key))) {
    throw new LeadsSearchApiRequestError("leads_search_body_invalid");
  }
  if (body.slug !== undefined && body.slug !== slug) {
    throw new LeadsSearchApiRequestError("leads_search_slug_invalid");
  }
  const idempotency = leadsSearchIdempotency(req, body);
  return {
    slug,
    runId,
    requestId:
      "requestId" in idempotency
        ? idempotency.requestId
        : idempotency.idempotencyKey,
    actorId: leadsSearchActorId(req, slug),
  };
}

export function createLeadsSearchDetailHandler(
  dependencies: LeadsSearchDetailRouteDependencies,
) {
  return async function leadsSearchDetailHandler(
    req: NextApiRequest,
    res: NextApiResponse,
  ) {
    const trace = prepareLeadsSearchApiResponse(req, res);
    if (req.method !== "GET" && req.method !== "DELETE") {
      res.setHeader("Allow", "GET, DELETE");
      return res.status(405).json({
        error: "leads_search_method_not_allowed",
        traceId: trace.traceId,
      });
    }

    try {
      const slug = leadsSearchApiSlug(req);
      const runId = leadsSearchApiRunId(req);
      if (req.method === "GET") {
        const receipt = await dependencies.status({ slug, runId });
        if (!receipt) {
          return res.status(404).json({
            error: "leads_search_not_found",
            traceId: trace.traceId,
          });
        }
        const status = publicStatus(slug, receipt);
        if (status.runId !== runId) {
          throw new Error("mismatched leads.search status receipt");
        }
        const projection = await dependencies.projections.get({
          tenantKey: slug,
          runId,
        });
        if (
          projection &&
          (projection.tenantKey !== slug || projection.runId !== runId)
        ) {
          throw new Error("cross-tenant leads.search projection");
        }
        return res.status(200).json({
          ok: true,
          search: {
            ...status,
            projection: projection ? publicProjection(projection) : null,
          },
          traceId: trace.traceId,
        });
      }

      const receipt = await dependencies.cancel(deleteInput(req, slug, runId));
      if (!receipt) {
        return res.status(404).json({
          error: "leads_search_not_found",
          traceId: trace.traceId,
        });
      }
      const cancellation = publicCancellation(slug, receipt);
      if (cancellation.runId !== runId) {
        throw new Error("mismatched leads.search cancellation receipt");
      }
      return res
        .status(cancellation.disposition === "requested" ? 202 : 200)
        .json({
          ok: true,
          cancellation,
          traceId: trace.traceId,
        });
    } catch (error) {
      const failure = leadsSearchApiFailure(error);
      if (failure.status >= 500) {
        safeLeadsSearchApiLog(
          dependencies.logError,
          req.method === "GET" ? "status" : "cancel",
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

const defaultProjectionRepository: Pick<
  LeadsSearchProjectionRepository,
  "get"
> = {
  get(input) {
    return new PostgresLeadsSearchProjectionRepository(getDb()).get(input);
  },
};

const defaultHandler = createLeadsSearchDetailHandler({
  status: (input) => getLeadsSearchStatus(input),
  cancel: (input) => cancelLeadsSearch(input),
  projections: defaultProjectionRepository,
});

export default compose(withErrorHandler, withSlugAuth)(defaultHandler);
