import type { NextApiRequest, NextApiResponse } from "next";
import { compose, withErrorHandler, withSlugAuth } from "@/lib/api-middleware";
import { getDb } from "@/db/drizzle";
import {
  admitLeadsSearch,
  type AdmitLeadsSearchInput,
} from "@/lib/leads/search-durable-worker";
import {
  parseLeadsSearchResultV2,
  type LeadsSearchCriteriaV2,
  type LeadsSearchResultV2,
} from "@/lib/leads/search-contract-v2";
import { PostgresLeadsSearchProjectionRepository } from "@/lib/leads/search-projection-postgres";
import {
  normalizeLeadsSearchProjectionCursor,
  normalizeLeadsSearchProjectionListLimit,
  type LeadsSearchProjection,
  type LeadsSearchProjectionPage,
  type LeadsSearchProjectionRepository,
  type ListLeadsSearchProjectionsInput,
} from "@/lib/leads/search-projection";
import {
  LeadsSearchApiRequestError,
  leadsSearchApiFailure,
  leadsSearchApiSlug,
  leadsSearchIdempotency,
  plainRecord,
  prepareLeadsSearchApiResponse,
  safeLeadsSearchApiLog,
} from "@/lib/leads/search-api-boundary";

const POST_BODY_KEYS = new Set(["slug", "criteria", "limit", "requestId"]);
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
const TERMINAL_RUN_STATUSES = new Set([
  "completed",
  "partial",
  "failed",
  "cancelled",
]);

export type LeadsSearchAdmissionInput = AdmitLeadsSearchInput;

export interface LeadsSearchAdmissionReceiptLike {
  runId: string;
  status: string;
  created: boolean;
  replayed: boolean;
  completionBoundary: "ledger_admitted" | "search_completed";
  result?: unknown;
}

export interface LeadsSearchesRouteDependencies {
  admit(
    input: LeadsSearchAdmissionInput,
  ): Promise<LeadsSearchAdmissionReceiptLike>;
  projections: Pick<LeadsSearchProjectionRepository, "list">;
  logError?: (message: string) => void;
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

function safeText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function publicAdmission(
  slug: string,
  value: LeadsSearchAdmissionReceiptLike,
): {
  runId: string;
  status: string;
  created: boolean;
  replayed: boolean;
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
    typeof candidate.created !== "boolean" ||
    typeof candidate.replayed !== "boolean" ||
    (completionBoundary !== "ledger_admitted" &&
      completionBoundary !== "search_completed")
  ) {
    throw new Error("invalid leads.search admission receipt");
  }
  const result =
    candidate.result === undefined
      ? undefined
      : parseLeadsSearchResultV2(candidate.result);
  return {
    runId,
    status,
    created: candidate.created,
    replayed: candidate.replayed,
    completionBoundary,
    statusUrl: `/api/leads/searches/${encodeURIComponent(runId)}?slug=${encodeURIComponent(slug)}`,
    ...(result ? { result } : {}),
  };
}

function postInput(
  req: NextApiRequest,
  slug: string,
  traceId: string,
): LeadsSearchAdmissionInput {
  const body = plainRecord(req.body);
  if (!body) {
    throw new LeadsSearchApiRequestError("leads_search_body_invalid");
  }
  if (Object.keys(body).some((key) => !POST_BODY_KEYS.has(key))) {
    throw new LeadsSearchApiRequestError("leads_search_body_invalid");
  }
  if (body.slug !== undefined && body.slug !== slug) {
    throw new LeadsSearchApiRequestError("leads_search_slug_invalid");
  }
  const criteria = plainRecord(body.criteria);
  if (!criteria) {
    throw new LeadsSearchApiRequestError("leads_search_criteria_invalid");
  }
  const limit = body.limit === undefined ? 10 : body.limit;
  if (
    !Number.isSafeInteger(limit) ||
    (limit as number) < 1 ||
    (limit as number) > 10
  ) {
    throw new LeadsSearchApiRequestError("leads_search_limit_invalid");
  }
  const base = {
    slug,
    criteria: criteria as LeadsSearchCriteriaV2,
    limit: limit as number,
    traceId,
  };
  const idempotency = leadsSearchIdempotency(req, body);
  return "requestId" in idempotency
    ? { ...base, requestId: idempotency.requestId }
    : { ...base, idempotencyKey: idempotency.idempotencyKey };
}

function singleQueryText(
  value: string | string[] | undefined,
  code: string,
): string | undefined {
  if (value === undefined) return undefined;
  if (Array.isArray(value) || !value.trim()) {
    throw new LeadsSearchApiRequestError(code);
  }
  return value;
}

function listInput(
  req: NextApiRequest,
  slug: string,
): ListLeadsSearchProjectionsInput {
  const rawLimit = singleQueryText(
    req.query.limit,
    "leads_search_list_limit_invalid",
  );
  const parsedLimit = rawLimit === undefined ? undefined : Number(rawLimit);
  let limit: number;
  try {
    limit = normalizeLeadsSearchProjectionListLimit(parsedLimit);
  } catch {
    throw new LeadsSearchApiRequestError("leads_search_list_limit_invalid");
  }
  const projectedAt = singleQueryText(
    req.query.beforeProjectedAt,
    "leads_search_cursor_invalid",
  );
  const runId = singleQueryText(
    req.query.beforeRunId,
    "leads_search_cursor_invalid",
  );
  if ((projectedAt === undefined) !== (runId === undefined)) {
    throw new LeadsSearchApiRequestError("leads_search_cursor_invalid");
  }
  if (projectedAt === undefined || runId === undefined) {
    return { tenantKey: slug, limit };
  }
  try {
    return {
      tenantKey: slug,
      limit,
      before: normalizeLeadsSearchProjectionCursor({ projectedAt, runId }),
    };
  } catch {
    throw new LeadsSearchApiRequestError("leads_search_cursor_invalid");
  }
}

function publicPage(page: LeadsSearchProjectionPage, limit: number) {
  return {
    searches: page.items.map(publicProjection),
    count: page.items.length,
    page: {
      limit,
      hasMore: Boolean(page.nextCursor),
      nextCursor: page.nextCursor
        ? {
            beforeProjectedAt: page.nextCursor.projectedAt,
            beforeRunId: page.nextCursor.runId,
          }
        : null,
    },
  };
}

export function createLeadsSearchesHandler(
  dependencies: LeadsSearchesRouteDependencies,
) {
  return async function leadsSearchesHandler(
    req: NextApiRequest,
    res: NextApiResponse,
  ) {
    const trace = prepareLeadsSearchApiResponse(req, res);
    if (req.method !== "GET" && req.method !== "POST") {
      res.setHeader("Allow", "GET, POST");
      return res.status(405).json({
        error: "leads_search_method_not_allowed",
        traceId: trace.traceId,
      });
    }

    try {
      const slug = leadsSearchApiSlug(req);
      if (req.method === "GET") {
        const input = listInput(req, slug);
        const page = await dependencies.projections.list(input);
        if (page.items.some((item) => item.tenantKey !== slug)) {
          throw new Error("cross-tenant leads.search projection");
        }
        return res.status(200).json({
          ok: true,
          ...publicPage(page, input.limit ?? 20),
          traceId: trace.traceId,
        });
      }

      const admission = publicAdmission(
        slug,
        await dependencies.admit(postInput(req, slug, trace.traceId)),
      );
      const httpStatus = TERMINAL_RUN_STATUSES.has(admission.status)
        ? 200
        : 202;
      return res.status(httpStatus).json({
        ok: true,
        search: admission,
        traceId: trace.traceId,
      });
    } catch (error) {
      const failure = leadsSearchApiFailure(error);
      if (failure.status >= 500) {
        safeLeadsSearchApiLog(
          dependencies.logError,
          req.method === "GET" ? "list" : "admit",
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
  "list"
> = {
  list(input) {
    return new PostgresLeadsSearchProjectionRepository(getDb()).list(input);
  },
};

const defaultHandler = createLeadsSearchesHandler({
  admit: (input) => admitLeadsSearch(input),
  projections: defaultProjectionRepository,
});

export default compose(withErrorHandler, withSlugAuth)(defaultHandler);
