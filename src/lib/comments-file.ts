/**
 * comments-file.ts — Materialize comments into a "commented" sibling
 * file alongside the original doc (SAN-15).
 *
 * Doctrine (decided 2026-05-28):
 *
 *  - The original doc (e.g. `current.md`) stays clean. Comments NEVER
 *    touch it.
 *  - On the first comment for a doc, Sancho duplicates it to
 *    `current.commented.md` and appends every subsequent comment there
 *    as a markdown block under a single `## Comentarios` section.
 *  - Blocks are id-wrapped with HTML comment markers
 *    `<!-- cmt:<id> -->` … `<!-- /cmt:<id> -->` so PATCH/DELETE can
 *    target them deterministically.
 *  - The DB is still the source of truth for the comment UI overlay
 *    (anchor highlights, hover tooltip, click modal). The commented
 *    file is the human-readable / git-friendly / skill-input
 *    representation of the same data. Both stay in sync because both
 *    are written by the same endpoint on the same code path.
 *
 * This module owns the file-level half. The DB-level half lives in
 * `comments.ts`. The endpoints orchestrate both.
 *
 * The pure path helper (`getCommentedDocPath`) and the markdown block
 * formatter/parser (`formatCommentBlock`, `findCommentBlockRange`) are
 * exported and unit-tested. The disk I/O wrappers (`ensureCommentedFile`,
 * `appendCommentToFile`, …) are not unit-tested directly — they're
 * thin and exercised by the endpoint flow.
 */

import fs from "fs";
import path from "path";

/**
 * Derive the "commented" sibling path of an original doc path.
 *
 * Examples (brand-relative paths kept verbatim):
 *   current.md                       -> current.commented.md
 *   foo/bar.html                     -> foo/bar.commented.html
 *   brand/x/y/current.md             -> brand/x/y/current.commented.md
 *   already-commented.commented.md   -> already-commented.commented.md  (idempotent)
 *   noext                            -> noext.commented                  (no extension)
 *
 * Idempotency matters: a token that lands on a path ending in
 * `.commented.<ext>` is already the commented file — calling this
 * function again should return the same path so we don't end up with
 * `.commented.commented.md`.
 */
export function getCommentedDocPath(docPath: string): string {
  if (!docPath) return docPath;
  const ext = path.extname(docPath);
  const base = ext ? docPath.slice(0, -ext.length) : docPath;
  if (base.endsWith(".commented")) return docPath;
  return `${base}.commented${ext}`;
}

/** True if the path looks like a `*.commented.<ext>` sibling. */
export function isCommentedDocPath(docPath: string): boolean {
  if (!docPath) return false;
  const ext = path.extname(docPath);
  const base = ext ? docPath.slice(0, -ext.length) : docPath;
  return base.endsWith(".commented");
}

/** Reverse of `getCommentedDocPath`. */
export function getOriginalDocPath(docPath: string): string {
  if (!isCommentedDocPath(docPath)) return docPath;
  const ext = path.extname(docPath);
  const base = ext ? docPath.slice(0, -ext.length) : docPath;
  return `${base.slice(0, -".commented".length)}${ext}`;
}

/**
 * All commented docPaths a doc's feedback may live under (SAN-149): a
 * deliverable can be shared as its `.md` source OR as its HTML-canonical
 * sibling, and comments anchor to whichever was shared. Consumers that
 * read or mutate feedback must look across the whole family.
 *
 * Accepts any member (original/commented, md/html); returns deduped
 * commented paths, the requested form first.
 */
export function commentedDocPathFamily(docPath: string): string[] {
  const original = getOriginalDocPath(docPath);
  const family = [getCommentedDocPath(original)];
  if (/\.md$/i.test(original)) {
    family.push(getCommentedDocPath(original.replace(/\.md$/i, ".html")));
  } else if (/\.html$/i.test(original)) {
    family.push(getCommentedDocPath(original.replace(/\.html$/i, ".md")));
  }
  return [...new Set(family)];
}

export interface CommentBlockInput {
  id: string;
  author: string;
  createdAt: Date | string;
  body: string;
  anchorText?: string | null;
  /** v2 (SAN-148): reply blocks reference their root and quote no anchor. */
  parentId?: string | null;
  /** Optional display name of the root author, for the reply citation line. */
  parentAuthor?: string | null;
  /** v2 (SAN-148): resolved threads get a RESUELTO mark in the heading. */
  resolved?: boolean;
}

const HEADING = "## Comentarios";
// v2 (SAN-148): reply blocks carry ` parent:<id>` inside the start marker.
// findCommentBlockRange matches on the `cmt:<id>` prefix, tolerant of the
// optional attribute, so v1 blocks and PATCH/DELETE keep working.
const BLOCK_START = (id: string, parentId?: string | null) =>
  parentId ? `<!-- cmt:${id} parent:${parentId} -->` : `<!-- cmt:${id} -->`;
const BLOCK_END = (id: string) => `<!-- /cmt:${id} -->`;

/**
 * Format a single comment block in the canonical markdown layout used
 * inside the commented file. Self-contained between its id markers.
 */
export function formatCommentBlock(c: CommentBlockInput): string {
  const date =
    typeof c.createdAt === "string"
      ? c.createdAt
      : c.createdAt.toISOString();
  const dateShort = date.slice(0, 16).replace("T", " ");
  const quote = c.parentId
    ? `> ↳ en respuesta a ${c.parentAuthor || "comentario"} (${c.parentId})\n>\n`
    : c.anchorText && c.anchorText.trim()
      ? `> "${truncate(c.anchorText.trim(), 600)}"\n>\n`
      : "";
  const safeBody = c.body.trimEnd();
  const resolvedMark = !c.parentId && c.resolved ? " · RESUELTO" : "";
  return [
    BLOCK_START(c.id, c.parentId),
    `### ${c.author} · ${dateShort}${resolvedMark}`,
    "",
    quote ? quote.trimEnd() : null,
    safeBody,
    BLOCK_END(c.id),
    "",
  ]
    .filter((x) => x !== null)
    .join("\n");
}

function truncate(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

/**
 * Find the start/end byte offsets of a comment block inside the full
 * file content (or -1, -1 if not found). The end is inclusive of the
 * trailing newline after the BLOCK_END marker, if any, so PATCH/DELETE
 * can splice cleanly.
 */
export function findCommentBlockRange(
  content: string,
  commentId: string,
): { start: number; end: number } {
  // Match `<!-- cmt:<id> -->` AND the v2 reply form
  // `<!-- cmt:<id> parent:<pid> -->` — the id is followed by either a
  // space (attributes) or the closing of the marker.
  const startPrefix = `<!-- cmt:${commentId}`;
  const endMarker = BLOCK_END(commentId);
  let start = -1;
  let from = 0;
  while (from <= content.length) {
    const hit = content.indexOf(startPrefix, from);
    if (hit < 0) break;
    const nextChar = content[hit + startPrefix.length];
    if (nextChar === " " || nextChar === undefined) {
      start = hit;
      break;
    }
    from = hit + startPrefix.length;
  }
  if (start < 0) return { start: -1, end: -1 };
  const endAt = content.indexOf(endMarker, start + startPrefix.length);
  if (endAt < 0) return { start: -1, end: -1 };
  let end = endAt + endMarker.length;
  // Swallow the trailing newline(s) so the block is excised cleanly.
  while (end < content.length && (content[end] === "\n" || content[end] === "\r")) {
    end++;
  }
  return { start, end };
}

/**
 * Resolve the absolute filesystem path of a brand-relative docPath
 * under the workspace root. Defends against trivial path traversal —
 * the resolved path MUST stay under `${base}/brand/`.
 */
export function resolveBrandDocAbsPath(base: string, docPath: string): string {
  const abs = path.resolve(base, docPath);
  const brandRoot = path.resolve(base, "brand");
  if (!abs.startsWith(brandRoot + path.sep) && abs !== brandRoot) {
    throw new Error("Path traversal blocked");
  }
  return abs;
}

/**
 * Ensure the commented sibling file exists for an original doc.
 * If it doesn't exist yet, copy the original verbatim. Returns the
 * brand-relative commented path either way.
 *
 * Throws if the original doc doesn't exist on disk.
 */
export function ensureCommentedFile(base: string, originalDocPath: string): string {
  const commentedRel = getCommentedDocPath(originalDocPath);
  if (isCommentedDocPath(originalDocPath)) return commentedRel;
  const commentedAbs = resolveBrandDocAbsPath(base, commentedRel);
  if (fs.existsSync(commentedAbs)) return commentedRel;
  const originalAbs = resolveBrandDocAbsPath(base, originalDocPath);
  if (!fs.existsSync(originalAbs)) {
    throw new Error(`Original doc not found: ${originalDocPath}`);
  }
  fs.copyFileSync(originalAbs, commentedAbs);
  return commentedRel;
}

/**
 * Append a comment block to the commented file, creating the
 * `## Comentarios` section if it does not yet exist. Idempotent on
 * existing id: if a block with the same id is already there, it's
 * replaced in place.
 */
export function appendCommentToFile(
  base: string,
  commentedDocPath: string,
  block: CommentBlockInput,
): void {
  const abs = resolveBrandDocAbsPath(base, commentedDocPath);
  let content = fs.existsSync(abs) ? fs.readFileSync(abs, "utf-8") : "";

  // If the same id is already present, treat as replacement.
  const existing = findCommentBlockRange(content, block.id);
  if (existing.start >= 0) {
    content =
      content.slice(0, existing.start) +
      formatCommentBlock(block) +
      content.slice(existing.end);
    fs.writeFileSync(abs, content);
    return;
  }

  const formatted = formatCommentBlock(block);
  if (content.includes(`\n${HEADING}\n`) || content.startsWith(`${HEADING}\n`)) {
    // Section exists — append the new block after the last block (i.e.
    // at the end of file). Ensure we end with a newline before adding.
    if (!content.endsWith("\n")) content += "\n";
    content += formatted;
  } else {
    // Create the section.
    if (!content.endsWith("\n")) content += "\n";
    if (!content.endsWith("\n\n")) content += "\n";
    content += `---\n\n${HEADING}\n\n${formatted}`;
  }
  fs.writeFileSync(abs, content);
}

/** Replace the body of an existing block (PATCH support). No-op if id not found. */
export function updateCommentInFile(
  base: string,
  commentedDocPath: string,
  block: CommentBlockInput,
): void {
  const abs = resolveBrandDocAbsPath(base, commentedDocPath);
  if (!fs.existsSync(abs)) return;
  const content = fs.readFileSync(abs, "utf-8");
  const range = findCommentBlockRange(content, block.id);
  if (range.start < 0) {
    // Nothing to update; fall back to append so we don't silently lose
    // the new body. This covers the case where a comment was created
    // before the file-side write existed.
    appendCommentToFile(base, commentedDocPath, block);
    return;
  }
  const next = content.slice(0, range.start) + formatCommentBlock(block) + content.slice(range.end);
  fs.writeFileSync(abs, next);
}

/** Excise a block from the file by id. No-op if not found. */
export function removeCommentFromFile(
  base: string,
  commentedDocPath: string,
  commentId: string,
): void {
  const abs = resolveBrandDocAbsPath(base, commentedDocPath);
  if (!fs.existsSync(abs)) return;
  const content = fs.readFileSync(abs, "utf-8");
  const range = findCommentBlockRange(content, commentId);
  if (range.start < 0) return;
  const next = content.slice(0, range.start) + content.slice(range.end);
  fs.writeFileSync(abs, next);
}

/**
 * Detect whether the commented file still holds at least one comment
 * block. Uses a simple substring scan for `<!-- cmt:` — fast and good
 * enough since the marker is unique to this feature.
 */
export function commentedFileHasAnyComment(
  base: string,
  commentedDocPath: string,
): boolean {
  const abs = resolveBrandDocAbsPath(base, commentedDocPath);
  if (!fs.existsSync(abs)) return false;
  const content = fs.readFileSync(abs, "utf-8");
  return content.includes("<!-- cmt:");
}

/**
 * Remove the commented sibling file if it no longer holds any
 * comments. Returns true when the file was unlinked. No-op if the
 * file doesn't exist or still has comments.
 *
 * Used after a DELETE op: when the last comment goes away, the
 * sibling is no longer needed and the share viewer should fall back
 * transparently to the clean original.
 */
export function deleteCommentedFileIfEmpty(
  base: string,
  commentedDocPath: string,
): boolean {
  const abs = resolveBrandDocAbsPath(base, commentedDocPath);
  if (!fs.existsSync(abs)) return false;
  if (commentedFileHasAnyComment(base, commentedDocPath)) return false;
  fs.unlinkSync(abs);
  return true;
}
