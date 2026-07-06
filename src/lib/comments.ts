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
import { and, desc, eq, inArray } from "drizzle-orm";
import { commentedDocPathFamily } from "@/lib/comments-file";
import { db } from "@/db/drizzle";
import { sharedDocComments } from "@/db/schema";

export interface CommentPatch {
  body?: string;
  anchorText?: string | null;
  anchorContext?: string | null;
  anchorDocOffset?: number | null;
  /** v2 (SAN-148): resolve/reopen — roots only, public and reversible. */
  resolved?: boolean;
  resolvedBy?: string | null;
  resolvedAt?: Date | null;
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
  /** v2 (SAN-148): root comment id when this row is a reply */
  parentId: string | null;
  resolved: boolean;
  resolvedAt: Date | null;
  resolvedBy: string | null;
  /** v2 (SAN-148): W3C TextQuoteSelector context */
  anchorPrefix: string | null;
  anchorSuffix: string | null;
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
  /** v2 (SAN-148): reply to a root comment. Replies carry NO anchor. */
  parentId?: string | null;
  anchorPrefix?: string | null;
  anchorSuffix?: string | null;
}

export const EMAIL_RE = /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i;
export const MAX_BODY = 5000;
export const MAX_AUTHOR = 120;
export const MAX_ANCHOR_TEXT = 1000;
export const MAX_ANCHOR_CONTEXT = 2000;
/** TextQuoteSelector prefix/suffix cap. g4u-comments captures 32 chars; 256 leaves margin. */
export const MAX_ANCHOR_AFFIX = 256;

/**
 * Anti-spam honeypot (SAN-148): the public form ships a hidden `website`
 * field humans never fill. When a bot fills it the endpoint replies with a
 * fake 201 and inserts nothing — never reveal the filter to the bot.
 */
export function isHoneypotTripped(raw: unknown): boolean {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return false;
  const v = (raw as Record<string, unknown>).website;
  return typeof v === "string" && v.trim().length > 0;
}

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
  const anchorPrefix = sanitizeOptionalString(r.anchorPrefix, MAX_ANCHOR_AFFIX);
  const anchorSuffix = sanitizeOptionalString(r.anchorSuffix, MAX_ANCHOR_AFFIX);

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

  // v2 (SAN-148): replies. One level only; a reply inherits the root's
  // anchor, so sending anchor fields alongside parentId is an error.
  let parentId: string | null = null;
  if (r.parentId != null) {
    const p = typeof r.parentId === "string" ? r.parentId.trim() : "";
    if (!p || !/^cmt_[A-Za-z0-9-]+$/.test(p)) {
      throw new CommentValidationError("Invalid parentId");
    }
    if (anchorText || anchorContext || anchorPrefix || anchorSuffix || anchorDocOffset != null) {
      throw new CommentValidationError("Replies cannot carry an anchor (inherited from the root comment)");
    }
    parentId = p;
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
    parentId,
    anchorPrefix,
    anchorSuffix,
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

  // v2 (SAN-148): a reply's parent must exist, live on the same doc, and be
  // a root itself (threads are one level deep, like g4u-comments).
  if (input.parentId) {
    const parents = await db
      .select({ id: sharedDocComments.id, parentId: sharedDocComments.parentId })
      .from(sharedDocComments)
      .where(
        and(
          eq(sharedDocComments.id, input.parentId),
          eq(sharedDocComments.slug, input.slug),
          eq(sharedDocComments.docPath, input.docPath),
        ),
      );
    if (parents.length === 0) {
      throw new CommentValidationError("parentId not found on this document");
    }
    if (parents[0].parentId) {
      throw new CommentValidationError("Cannot reply to a reply (threads are one level deep)");
    }
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
      parentId: input.parentId ?? null,
      anchorPrefix: input.anchorPrefix ?? null,
      anchorSuffix: input.anchorSuffix ?? null,
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
 *
 * `openOnly` keeps unresolved roots AND their replies (a reply's open-ness
 * follows its root).
 */
export async function loadDocComments(
  slug: string,
  docPath?: string,
  opts: { openOnly?: boolean } = {},
): Promise<CommentRow[]> {
  const baseWhere = docPath
    ? and(eq(sharedDocComments.slug, slug), eq(sharedDocComments.docPath, docPath))
    : eq(sharedDocComments.slug, slug);
  return loadWhere(baseWhere, opts);
}

/**
 * Load every comment for a doc FAMILY (SAN-149): a deliverable shared both
 * as `.md` and as its HTML-canonical sibling stores comments under either
 * commented path. Use this whenever the caller identifies the doc rather
 * than the exact shared file (agent loop, dashboards, triage).
 */
export async function loadDocCommentsFamily(
  slug: string,
  docPath: string,
  opts: { openOnly?: boolean } = {},
): Promise<CommentRow[]> {
  const family = commentedDocPathFamily(docPath);
  return loadWhere(
    and(eq(sharedDocComments.slug, slug), inArray(sharedDocComments.docPath, family)),
    opts,
  );
}

async function loadWhere(
  baseWhere: ReturnType<typeof and> | ReturnType<typeof eq>,
  opts: { openOnly?: boolean },
): Promise<CommentRow[]> {

  const rows = await db
    .select()
    .from(sharedDocComments)
    .where(baseWhere)
    .orderBy(desc(sharedDocComments.createdAt));

  const all = rows.map(rowToComment);
  if (!opts.openOnly) return all;

  const openRoots = new Set(
    all.filter((c) => !c.parentId && !c.resolved).map((c) => c.id),
  );
  return all.filter((c) =>
    c.parentId ? openRoots.has(c.parentId) : openRoots.has(c.id),
  );
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

  // v2 (SAN-148): resolve/reopen. Public and reversible (Notion model).
  if (r.resolved !== undefined) {
    if (typeof r.resolved !== "boolean") {
      throw new CommentValidationError("Invalid resolved (boolean expected)");
    }
    patch.resolved = r.resolved;
    patch.resolvedAt = r.resolved ? new Date() : null;
    const by = sanitizeOptionalString(r.resolvedBy, MAX_AUTHOR);
    patch.resolvedBy = r.resolved ? by : null;
  } else if (r.resolvedBy !== undefined) {
    throw new CommentValidationError("resolvedBy requires resolved");
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

  // v2 (SAN-148): resolve applies to roots only — the whole thread shows
  // as resolved through its root. Replies reject the resolved field.
  if (patch.resolved !== undefined) {
    const existing = await db
      .select({ parentId: sharedDocComments.parentId })
      .from(sharedDocComments)
      .where(
        and(
          eq(sharedDocComments.id, id),
          eq(sharedDocComments.slug, slug),
          eq(sharedDocComments.docPath, docPath),
        ),
      );
    if (existing.length === 0) return null;
    if (existing[0].parentId) {
      throw new CommentValidationError("Only root comments can be resolved");
    }
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
 * Deleting a root cascades to its replies (v2). Returns the ids of every
 * deleted row (root first) so callers can excise file blocks, or [] if no
 * row matched.
 */
export async function deleteComment(
  id: string,
  slug: string,
  docPath: string,
): Promise<string[]> {
  if (!id || !slug || !docPath) {
    throw new CommentValidationError("id + slug + docPath required");
  }
  const replyRows = await db
    .delete(sharedDocComments)
    .where(
      and(
        eq(sharedDocComments.parentId, id),
        eq(sharedDocComments.slug, slug),
        eq(sharedDocComments.docPath, docPath),
      ),
    )
    .returning({ id: sharedDocComments.id });
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
  if (rows.length === 0) return [];
  return [...rows.map((r) => r.id), ...replyRows.map((r) => r.id)];
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
    parentId: r.parentId,
    resolved: r.resolved,
    resolvedAt: r.resolvedAt,
    resolvedBy: r.resolvedBy,
    anchorPrefix: r.anchorPrefix,
    anchorSuffix: r.anchorSuffix,
    createdAt: r.createdAt,
  };
}
