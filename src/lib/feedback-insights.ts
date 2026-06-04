/**
 * feedback-insights.ts — Read/write helpers + validation for the
 * feedback_insights table.
 *
 * Sansón (via the OpenClaw gateway) classifies client comments into
 * improvement suggestions and POSTs them back to MC, which validates them
 * here and persists. Validation is centralized (`validateIngestPayload`) so
 * the endpoints stay thin and tests cover one pure source of truth — same
 * split as comments.ts (pure validators are unit-tested; DB calls are not).
 */

import crypto from "crypto";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db/drizzle";
import { feedbackInsights } from "@/db/schema";

export const VALID_CATEGORIES = ["skill", "client", "form", "other"] as const;
export type InsightCategory = (typeof VALID_CATEGORIES)[number];

export const MAX_TITLE = 200;
export const MAX_DETAIL = 5000;
export const MAX_PROPOSED = 5000;
export const MAX_INSIGHTS_PER_RUN = 50;
export const MAX_COMMENT_IDS = 50;

export class FeedbackInsightValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FeedbackInsightValidationError";
  }
}

export interface InsightInput {
  category: InsightCategory;
  title: string;
  detail: string;
  proposedChange: string | null;
  sourceCommentIds: string[];
}

export interface IngestPayload {
  runId: string;
  slug: string;
  docPath: string;
  skillId: string | null;
  insights: InsightInput[];
}

export interface InsightRow {
  id: string;
  runId: string;
  slug: string;
  docPath: string;
  skillId: string | null;
  category: InsightCategory;
  title: string;
  detail: string;
  proposedChange: string | null;
  sourceCommentIds: string[];
  status: string;
  routedRef: string | null;
  createdAt: Date;
}

function reqString(v: unknown, field: string, max: number): string {
  const s = typeof v === "string" ? v.trim() : "";
  if (!s) throw new FeedbackInsightValidationError(`${field} required`);
  if (s.length > max) throw new FeedbackInsightValidationError(`${field} too long (max ${max})`);
  return s;
}

function optString(v: unknown, field: string, max: number): string | null {
  if (v == null) return null;
  if (typeof v !== "string") throw new FeedbackInsightValidationError(`${field} must be a string`);
  const s = v.trim();
  if (!s) return null;
  if (s.length > max) throw new FeedbackInsightValidationError(`${field} too long (max ${max})`);
  return s;
}

function validateInsight(raw: unknown): InsightInput {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new FeedbackInsightValidationError("insight must be an object");
  }
  const r = raw as Record<string, unknown>;

  const category = typeof r.category === "string" ? r.category.trim() : "";
  if (!VALID_CATEGORIES.includes(category as InsightCategory)) {
    throw new FeedbackInsightValidationError(`invalid category: ${category}`);
  }

  let sourceCommentIds: string[] = [];
  if (r.sourceCommentIds != null) {
    if (!Array.isArray(r.sourceCommentIds)) {
      throw new FeedbackInsightValidationError("sourceCommentIds must be an array");
    }
    sourceCommentIds = r.sourceCommentIds.slice(0, MAX_COMMENT_IDS).map((id) => {
      if (typeof id !== "string" || !id.trim()) {
        throw new FeedbackInsightValidationError("sourceCommentIds must be non-empty strings");
      }
      return id.trim();
    });
  }

  return {
    category: category as InsightCategory,
    title: reqString(r.title, "title", MAX_TITLE),
    detail: reqString(r.detail, "detail", MAX_DETAIL),
    proposedChange: optString(r.proposedChange, "proposedChange", MAX_PROPOSED),
    sourceCommentIds,
  };
}

/**
 * Validate the agent's ingest body. `slug` comes from the route, not the body.
 */
export function validateIngestPayload(slug: string, raw: unknown): IngestPayload {
  if (!slug) throw new FeedbackInsightValidationError("slug required");
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new FeedbackInsightValidationError("Invalid request body");
  }
  const r = raw as Record<string, unknown>;

  const runId = reqString(r.runId, "runId", 120);
  const docPath = reqString(r.docPath, "docPath", 1000);
  const skillId = optString(r.skillId, "skillId", 200);

  if (!Array.isArray(r.insights) || r.insights.length === 0) {
    throw new FeedbackInsightValidationError("insights must be a non-empty array");
  }
  if (r.insights.length > MAX_INSIGHTS_PER_RUN) {
    throw new FeedbackInsightValidationError(`too many insights (max ${MAX_INSIGHTS_PER_RUN})`);
  }
  const insights = r.insights.map(validateInsight);

  return { runId, slug, docPath, skillId, insights };
}

/** Group rows into the four category buckets (all keys always present). */
export function groupInsightsByCategory<T extends { category: string }>(
  rows: T[],
): Record<InsightCategory, T[]> {
  const out: Record<InsightCategory, T[]> = { skill: [], client: [], form: [], other: [] };
  for (const row of rows) {
    if (row.category in out) out[row.category as InsightCategory].push(row);
    else out.other.push(row);
  }
  return out;
}

function rowToInsight(r: typeof feedbackInsights.$inferSelect): InsightRow {
  return {
    id: r.id,
    runId: r.runId,
    slug: r.slug,
    docPath: r.docPath,
    skillId: r.skillId,
    category: (VALID_CATEGORIES.includes(r.category as InsightCategory)
      ? r.category
      : "other") as InsightCategory,
    title: r.title,
    detail: r.detail,
    proposedChange: r.proposedChange,
    sourceCommentIds: Array.isArray(r.sourceCommentIds) ? r.sourceCommentIds : [],
    status: r.status,
    routedRef: r.routedRef,
    createdAt: r.createdAt,
  };
}

/**
 * Persist a run's insights. Idempotent on runId: re-posting the same run
 * replaces only its still-`new` rows (accepted/dismissed/applied rows are
 * kept), so a retried gateway call never duplicates.
 */
export async function insertInsights(payload: IngestPayload): Promise<InsightRow[]> {
  await db
    .delete(feedbackInsights)
    .where(
      and(
        eq(feedbackInsights.runId, payload.runId),
        eq(feedbackInsights.slug, payload.slug),
        eq(feedbackInsights.status, "new"),
      ),
    );

  const values = payload.insights.map((ins) => ({
    id: `fbi_${crypto.randomUUID()}`,
    runId: payload.runId,
    slug: payload.slug,
    docPath: payload.docPath,
    skillId: payload.skillId,
    category: ins.category,
    title: ins.title,
    detail: ins.detail,
    proposedChange: ins.proposedChange,
    sourceCommentIds: ins.sourceCommentIds,
    status: "new" as const,
  }));

  const rows = await db.insert(feedbackInsights).values(values).returning();
  return rows.map(rowToInsight);
}

/** Load all insights for a client, newest-first. */
export async function loadInsights(slug: string): Promise<InsightRow[]> {
  const rows = await db
    .select()
    .from(feedbackInsights)
    .where(eq(feedbackInsights.slug, slug))
    .orderBy(desc(feedbackInsights.createdAt));
  return rows.map(rowToInsight);
}

/** Fetch one insight scoped to its slug. */
export async function getInsight(id: string, slug: string): Promise<InsightRow | null> {
  const rows = await db
    .select()
    .from(feedbackInsights)
    .where(and(eq(feedbackInsights.id, id), eq(feedbackInsights.slug, slug)))
    .limit(1);
  return rows.length ? rowToInsight(rows[0]) : null;
}

/** Update an insight's status (and optional routed ref). Returns updated row or null. */
export async function updateInsightStatus(
  id: string,
  slug: string,
  status: "new" | "accepted" | "dismissed" | "applied",
  routedRef?: string | null,
): Promise<InsightRow | null> {
  const rows = await db
    .update(feedbackInsights)
    .set({ status, ...(routedRef !== undefined ? { routedRef } : {}) })
    .where(and(eq(feedbackInsights.id, id), eq(feedbackInsights.slug, slug)))
    .returning();
  return rows.length ? rowToInsight(rows[0]) : null;
}
