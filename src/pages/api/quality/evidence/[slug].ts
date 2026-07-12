import type { NextApiRequest, NextApiResponse } from "next";
import { withErrorHandler } from "@/lib/api-middleware";
import {
  McpAuthError,
  assertMcpClientAccess,
  authenticateMcpRequest,
} from "@/lib/mcp/auth";
import { readAgentRunsSnapshot } from "@/lib/data/agent-runs";
import {
  QUALITY_EVIDENCE_LIMITATIONS,
  QUALITY_EVIDENCE_REDACTION_VERSION,
  QUALITY_EVIDENCE_SCHEMA_VERSION,
  QualityEvidenceRequestError,
  buildQualityEvidencePage,
  resolveQualityEvidencePageRequest,
} from "@/lib/quality/evidence";

function one(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * Read-only shadow evidence surface for an independent Quality Lab.
 *
 * It deliberately reuses MCP principals so the token has an explicit
 * `quality:read` capability and a client allowlist. There is no session/admin
 * fallback and no mutation path in this route.
 */
export async function qualityEvidenceHandler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const slug = one(req.query.slug)?.trim() ?? "";
  if (!/^[a-z0-9][a-z0-9-]*$/i.test(slug)) {
    return res.status(400).json({ error: "Invalid client slug" });
  }

  try {
    const principal = authenticateMcpRequest(req);
    // This surface contains user conversations. Generic `*`/`quality:*`
    // expansion must not silently turn an existing broad MCP credential into
    // a Quality Lab credential; require the dedicated capability explicitly.
    if (!principal.scopes.includes("quality:read")) {
      throw new McpAuthError(
        403,
        "MCP token is missing required scope: quality:read",
      );
    }
    if (principal.clients.includes("*")) {
      throw new McpAuthError(
        403,
        "Quality evidence tokens require an explicit client allowlist",
      );
    }
    assertMcpClientAccess(principal, slug);
  } catch (error) {
    const status = error instanceof McpAuthError ? error.status : 500;
    const message =
      error instanceof Error
        ? error.message
        : "Quality evidence authentication failed";
    return res.status(status).json({ error: message });
  }

  const generatedAt = new Date();
  let pageRequest;
  try {
    pageRequest = resolveQualityEvidencePageRequest({
      clientSlug: slug,
      after: one(req.query.after),
      from: one(req.query.from),
      to: one(req.query.to),
      limit: one(req.query.limit),
      now: generatedAt,
    });
  } catch (error) {
    if (error instanceof QualityEvidenceRequestError) {
      return res.status(400).json({ error: error.message });
    }
    throw error;
  }

  const snapshot = readAgentRunsSnapshot();
  // Defense in depth: do not even pass another tenant's ledger rows into the
  // pure exporter, despite its own tenant filter.
  const tenantRuns = snapshot.runs.filter(
    (run) =>
      typeof run.threadId === "string" && run.threadId.startsWith(`${slug}:`),
  );
  const tenantRunIds = new Set(tenantRuns.map((run) => run.id));
  const tenantEvents = snapshot.events.filter((event) =>
    tenantRunIds.has(event.runId),
  );
  const result = buildQualityEvidencePage({
    clientSlug: slug,
    page: pageRequest,
    runs: tenantRuns,
    events: tenantEvents,
  });

  res.setHeader("Cache-Control", "private, no-store");
  return res.status(200).json({
    schemaVersion: QUALITY_EVIDENCE_SCHEMA_VERSION,
    generatedAt: generatedAt.toISOString(),
    clientSlug: slug,
    window: pageRequest.window,
    page: {
      after: pageRequest.after,
      nextCursor: result.nextCursor,
      hasMore: result.hasMore,
      limit: pageRequest.limit,
    },
    coverage: {
      source: "agent-runs-ledger",
      retainedRuns: tenantRuns.length,
      retainedEvents: tenantEvents.length,
      limitations: [
        ...QUALITY_EVIDENCE_LIMITATIONS,
        ...(result.skippedMalformedRuns > 0
          ? [`Skipped ${result.skippedMalformedRuns} malformed run record(s).`]
          : []),
      ],
    },
    redaction: {
      applied: true,
      version: QUALITY_EVIDENCE_REDACTION_VERSION,
    },
    items: result.items,
  });
}

export default withErrorHandler(qualityEvidenceHandler);
