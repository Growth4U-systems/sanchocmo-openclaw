/**
 * comments.ts — Read/write helpers for the shared_doc_comments table (SAN-15).
 *
 * Comments are posted by external readers on a shared doc (via the public
 * `/share/[token]` URL). They persist in Postgres and are consumed by:
 *   - The public doc viewer (lists comments inline / by anchor).
 *   - The Intelligence section of the dashboard (thread per doc).
 *   - Skills, when regenerating a doc that has prior comments — they pass
 *     the comments as input so the next regeneration incorporates feedback.
 *
 * Validation is centralized here (`validateCommentInput`) so the endpoints
 * stay thin and tests cover one source of truth.
 */

import crypto from "crypto";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db/drizzle";
import { sharedDocComments } from "@/db/schema";

export interface CommentPatch {
  body?: string;
  anchorText?: string | null;
  anchorContext?: string | null;
  anchorDocOffset?: number | null;
}

export interface CommentRow {
  id: string;
  slug: string;
  docPath: string;
  docVersion: number | null;
  author: string;
  email: string | null;
  body: string;
  anchorText: string | null;
  anchorContext: string | null;
  anchorDocOffset: number | null;
  createdAt: Date;
}

export interface NewCommentInput {
  /** Filled by the endpoint from the verified share token (not from the body). */
  slug: string;
  /** Filled by the endpoint from the verified share token (not from the body). */
  docPath: string;
  docVersion?: number | null;
  author: string;
  email?: string | null;
  body: string;
  anchorText?: string | null;
  anchorContext?: string | null;
  anchorDocOffset?: number | null;
}

export const EMAIL_RE = /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i;
export const MAX_BODY = 5000;
export const MAX_AUTHOR = 120;
export const MAX_ANCHOR_TEXT = 1000;
export const MAX_ANCHOR_CONTEXT = 2000;

export class CommentValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CommentValidationError";
  }
}

/**
 * Validate a request body for a new comment. Does NOT set slug/docPath —
 * those come from the verified share token and are set by the endpoint.
 * Returns a normalized input ready to be merged with slug+docPath and inserted.
 */
export function validateCommentInput(raw: unknown): NewCommentInput {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new CommentValidationError("Invalid request body");
  }
  const r = raw as Record<string, unknown>;

  const author = typeof r.author === "string" ? r.author.trim() : "";
  if (!author) throw new CommentValidationError("author required");
  if (author.length > MAX_AUTHOR) {
    throw new CommentValidationError(`author too long (max ${MAX_AUTHOR} chars)`);
  }

  const body = typeof r.body === "string" ? r.body.trim() : "";
  if (!body) throw new CommentValidationError("body required");
  if (body.length > MAX_BODY) {
    throw new CommentValidationError(`body too long (max ${MAX_BODY} chars)`);
  }

  let email: string | null = null;
  if (r.email != null) {
    const e = typeof r.email === "string" ? r.email.trim() : "";
    if (e) {
      if (!EMAIL_RE.test(e)) throw new CommentValidationError("Invalid email format");
      email = e;
    }
  }

  const anchorText = sanitizeOptionalString(r.anchorText, MAX_ANCHOR_TEXT);
  const anchorContext = sanitizeOptionalString(r.anchorContext, MAX_ANCHOR_CONTEXT);

  let anchorDocOffset: number | null = null;
  if (r.anchorDocOffset != null) {
    const n = Number(r.anchorDocOffset);
    if (!Number.isFinite(n) || n < 0) {
      throw new CommentValidationError("Invalid anchorDocOffset");
    }
    anchorDocOffset = Math.floor(n);
  }

  let docVersion: number | null = null;
  if (r.docVersion != null) {
    const n = Number(r.docVersion);
    if (!Number.isFinite(n) || n < 0) {
      throw new CommentValidationError("Invalid docVersion");
    }
    docVersion = Math.floor(n);
  }

  return {
    slug: "",
    docPath: "",
    docVersion,
    author,
    email,
    body,
    anchorText,
    anchorContext,
    anchorDocOffset,
  };
}

function sanitizeOptionalString(v: unknown, max: number): string | null {
  if (v == null) return null;
  if (typeof v !== "string") return null;
  const t = v.trim();
  if (!t) return null;
  return t.length > max ? t.slice(0, max) : t;
}

/** Insert a comment. Caller must populate slug + docPath from verified context. */
export async function insertComment(input: NewCommentInput): Promise<CommentRow> {
  if (!input.slug || !input.docPath) {
    throw new CommentValidationError("slug + docPath required");
  }
  const id = `cmt_${crypto.randomUUID()}`;
  const rows = await db
    .insert(sharedDocComments)
    .values({
      id,
      slug: input.slug,
      docPath: input.docPath,
      docVersion: input.docVersion ?? null,
      author: input.author,
      email: input.email ?? null,
      body: input.body,
      anchorText: input.anchorText ?? null,
      anchorContext: input.anchorContext ?? null,
      anchorDocOffset: input.anchorDocOffset ?? null,
    })
    .returning();
  return rowToComment(rows[0]);
}

/**
 * Load comments for a slug. If `docPath` is provided, scopes to that doc.
 * Returned newest-first. Used by:
 *   - public GET endpoint (scoped to one doc)
 *   - authenticated client endpoint (all docs)
 *   - skills, when building context to regenerate a doc
 */
export async function loadDocComments(
  slug: string,
  docPath?: string,
): Promise<CommentRow[]> {
  const baseWhere = docPath
    ? and(eq(sharedDocComments.slug, slug), eq(sharedDocComments.docPath, docPath))
    : eq(sharedDocComments.slug, slug);

  const rows = await db
    .select()
    .from(sharedDocComments)
    .where(baseWhere)
    .orderBy(desc(sharedDocComments.createdAt));

  return rows.map(rowToComment);
}

/**
 * Validate a PATCH body. Only body/anchor fields are mutable; author/email/
 * created_at are immutable. Returns the sanitized patch or throws.
 *
 * `body` is optional in PATCH (caller may only want to update anchor), but if
 * present it must not be empty/oversized.
 */
export function validateCommentPatch(raw: unknown): CommentPatch {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new CommentValidationError("Invalid request body");
  }
  const r = raw as Record<string, unknown>;
  const patch: CommentPatch = {};

  if (r.body !== undefined) {
    const body = typeof r.body === "string" ? r.body.trim() : "";
    if (!body) throw new CommentValidationError("body cannot be empty");
    if (body.length > MAX_BODY) {
      throw new CommentValidationError(`body too long (max ${MAX_BODY} chars)`);
    }
    patch.body = body;
  }

  if (r.anchorText !== undefined) {
    patch.anchorText = sanitizeOptionalString(r.anchorText, MAX_ANCHOR_TEXT);
  }
  if (r.anchorContext !== undefined) {
    patch.anchorContext = sanitizeOptionalString(r.anchorContext, MAX_ANCHOR_CONTEXT);
  }
  if (r.anchorDocOffset !== undefined) {
    if (r.anchorDocOffset === null) {
      patch.anchorDocOffset = null;
    } else {
      const n = Number(r.anchorDocOffset);
      if (!Number.isFinite(n) || n < 0) {
        throw new CommentValidationError("Invalid anchorDocOffset");
      }
      patch.anchorDocOffset = Math.floor(n);
    }
  }

  if (Object.keys(patch).length === 0) {
    throw new CommentValidationError("Empty patch");
  }
  return patch;
}

/**
 * Update a comment by id. Caller must pass slug+docPath from the verified
 * share token: a comment is only mutable through a token that grants access
 * to the doc it lives on. Returns the updated row or null if no row matched
 * the (id, slug, docPath) triple.
 */
export async function updateComment(
  id: string,
  slug: string,
  docPath: string,
  patch: CommentPatch,
): Promise<CommentRow | null> {
  if (!id || !slug || !docPath) {
    throw new CommentValidationError("id + slug + docPath required");
  }
  if (Object.keys(patch).length === 0) {
    throw new CommentValidationError("Empty patch");
  }
  const rows = await db
    .update(sharedDocComments)
    .set(patch)
    .where(
      and(
        eq(sharedDocComments.id, id),
        eq(sharedDocComments.slug, slug),
        eq(sharedDocComments.docPath, docPath),
      ),
    )
    .returning();
  if (rows.length === 0) return null;
  return rowToComment(rows[0]);
}

/**
 * Delete a comment by id. Same token-bound (slug, docPath) check as update.
 * Returns true if a row was deleted, false otherwise.
 */
export async function deleteComment(
  id: string,
  slug: string,
  docPath: string,
): Promise<boolean> {
  if (!id || !slug || !docPath) {
    throw new CommentValidationError("id + slug + docPath required");
  }
  const rows = await db
    .delete(sharedDocComments)
    .where(
      and(
        eq(sharedDocComments.id, id),
        eq(sharedDocComments.slug, slug),
        eq(sharedDocComments.docPath, docPath),
      ),
    )
    .returning({ id: sharedDocComments.id });
  return rows.length > 0;
}

function rowToComment(r: typeof sharedDocComments.$inferSelect): CommentRow {
  return {
    id: r.id,
    slug: r.slug,
    docPath: r.docPath,
    docVersion: r.docVersion,
    author: r.author,
    email: r.email,
    body: r.body,
    anchorText: r.anchorText,
    anchorContext: r.anchorContext,
    anchorDocOffset: r.anchorDocOffset,
    createdAt: r.createdAt,
  };
}
