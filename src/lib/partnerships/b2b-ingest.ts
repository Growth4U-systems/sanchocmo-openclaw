/**
 * SAN-349 P1b · B2B company-DB ingestion into the shared YALC Lead model.
 *
 * This is the first impure step after the pure normalizer: raw rows from
 * company-finder / decision-maker-finder / contact-enrichment become normal
 * campaign leads through the same `/campaigns/:id/leads/assign` write path used
 * by Partnerships.
 */

import {
  assertCampaignLeadEditsUnlocked,
  yalcGuardErrorResponse,
} from "@/lib/yalc/campaign-guards";
import { yalcErrorResponse, yalcFetch, type YalcRuntimeConfig } from "@/lib/yalc/client";
import { buildB2BLead, normalizeB2BContacts } from "./b2b-normalize";
import { isOutreachB2BEnabled } from "./flags";
import type { B2BCandidate, B2BLeadPayload } from "./b2b-types";

type RecordLike = Record<string, unknown>;

interface YalcAssignResponse {
  ok?: boolean;
  campaignId?: string;
  leads?: Array<RecordLike>;
  dropped?: Array<RecordLike>;
}

export interface B2BIngestInput {
  campaignId?: unknown;
  contacts?: unknown;
  leads?: unknown;
  candidates?: unknown;
  items?: unknown;
  searchId?: unknown;
  jobId?: unknown;
}

export interface B2BIngestStats {
  candidates: number;
  invalid: number;
  inserted: number;
  dropped: number;
}

export interface B2BIngestResult {
  ok: true;
  campaignId: string;
  stats: B2BIngestStats;
  candidates: B2BCandidate[];
  response: YalcAssignResponse;
}

export class B2BIngestError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "B2BIngestError";
    this.status = status;
  }
}

function asRecord(value: unknown): RecordLike {
  return value && typeof value === "object" && !Array.isArray(value) ? value as RecordLike : {};
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function listFromInput(input: B2BIngestInput): unknown {
  const criteria = asRecord((input as RecordLike).criteria);
  return (
    input.contacts ??
    input.leads ??
    input.candidates ??
    input.items ??
    criteria.contacts ??
    criteria.leads ??
    criteria.candidates ??
    criteria.items
  );
}

function enrichedLead(
  lead: B2BLeadPayload,
  meta: { searchId?: string; jobId?: string },
): B2BLeadPayload & RecordLike {
  const provenance = {
    provider: "company-db",
    operation: "b2b_ingest",
    source: "sancho_b2b_ingest",
    ...(meta.searchId ? { searchId: meta.searchId } : {}),
    ...(meta.jobId ? { jobId: meta.jobId } : {}),
  };
  return {
    ...lead,
    profileKind: "b2b_contact",
    provenance,
    scoreProvenance: {
      provider: "company-db",
      operation: "b2b_fit_score",
      ...(meta.searchId ? { searchId: meta.searchId } : {}),
      ...(meta.jobId ? { jobId: meta.jobId } : {}),
    },
  };
}

export async function ingestB2BContacts(
  config: YalcRuntimeConfig,
  rawInput: unknown,
): Promise<B2BIngestResult> {
  if (!isOutreachB2BEnabled()) {
    throw new B2BIngestError("OUTREACH_B2B is disabled", 403);
  }

  const input = asRecord(rawInput) as B2BIngestInput;
  const campaignId = text(input.campaignId);
  if (!campaignId) throw new B2BIngestError("campaignId is required");

  const { candidates, invalid } = normalizeB2BContacts(listFromInput(input));
  if (candidates.length === 0) {
    throw new B2BIngestError(`No valid B2B contacts to ingest (${invalid} invalid)`);
  }

  await assertCampaignLeadEditsUnlocked(config, campaignId, "b2b");

  const searchId = text(input.searchId);
  const jobId = text(input.jobId) || `b2b-ingest:${campaignId}:${searchId || "manual"}`;
  const leads = candidates.map((candidate) =>
    enrichedLead(buildB2BLead(candidate, searchId ? { searchId } : {}), { searchId, jobId }),
  );
  const response = await yalcFetch<YalcAssignResponse>(
    config,
    `/api/campaigns/${encodeURIComponent(campaignId)}/leads/assign`,
    {
      method: "POST",
      headers: { "Idempotency-Key": jobId },
      body: {
        leads,
        expectedKind: "b2b",
        campaignKind: "b2b",
        type: "B2B",
        provider: "company-db",
        profileKind: "b2b_contact",
        source: "outbound.b2b-ingest",
      },
    },
  );

  const inserted = Array.isArray(response.leads) ? response.leads.length : 0;
  const dropped = Array.isArray(response.dropped) ? response.dropped.length : 0;
  return {
    ok: true,
    campaignId,
    candidates,
    response,
    stats: {
      candidates: candidates.length,
      invalid,
      inserted,
      dropped,
    },
  };
}

export function b2bIngestErrorResponse(err: unknown) {
  if (err instanceof B2BIngestError) {
    return { status: err.status, body: { error: err.message } };
  }
  return yalcGuardErrorResponse(err) ?? yalcErrorResponse(err);
}
