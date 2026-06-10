/**
 * comments-client.ts — Client-side helpers for the shared-doc comments UI (SAN-15).
 *
 * Pure functions (no DOM, no React) so we can unit-test them. The browser
 * code in `/share/[token]` calls these to derive what to send to the API.
 */

export const ANCHOR_CONTEXT_PADDING = 80;

export interface AnchorPayload {
  anchorText: string;
  anchorContext: string;
  anchorDocOffset: number | null;
}

/**
 * Given the full doc text and a selected substring, return the anchor
 * payload to send with the comment. The context is the selection plus up
 * to `padding` characters before and after — used later for fuzzy-matching
 * the anchor back into a regenerated doc.
 *
 * If `selectedText` is empty or not found in `fullText`, returns null.
 * If found, `anchorDocOffset` is the index of the FIRST character of the
 * selection in `fullText`.
 */
export function buildAnchorPayload(
  fullText: string,
  selectedText: string,
  padding: number = ANCHOR_CONTEXT_PADDING,
): AnchorPayload | null {
  const trimmed = selectedText.trim();
  if (!trimmed) return null;
  const idx = fullText.indexOf(trimmed);
  if (idx < 0) {
    // Fallback: no offset, but still preserve the selection itself as
    // anchor_text — the consumer can search later by content alone.
    return {
      anchorText: trimmed,
      anchorContext: trimmed,
      anchorDocOffset: null,
    };
  }
  const start = Math.max(0, idx - padding);
  const end = Math.min(fullText.length, idx + trimmed.length + padding);
  return {
    anchorText: trimmed,
    anchorContext: fullText.slice(start, end),
    anchorDocOffset: idx,
  };
}

/**
 * Mirror of the server-side EMAIL_RE in `src/lib/comments.ts`. Kept here
 * so the form can give early feedback without a roundtrip.
 */
export const EMAIL_RE = /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i;

export interface PendingComment {
  author: string;
  email: string;
  body: string;
  anchor: AnchorPayload | null;
}

export interface CommentFormValidation {
  ok: boolean;
  errors: {
    author?: string;
    email?: string;
    body?: string;
  };
}

/** Client-side validation that mirrors `validateCommentInput` on the server. */
export function validateCommentForm(c: PendingComment): CommentFormValidation {
  const errors: CommentFormValidation["errors"] = {};
  const author = c.author.trim();
  const body = c.body.trim();
  const email = c.email.trim();

  if (!author) errors.author = "Tu nombre es requerido";
  else if (author.length > 120) errors.author = "Nombre demasiado largo";

  if (!body) errors.body = "El comentario no puede estar vacío";
  else if (body.length > 5000) errors.body = "Comentario demasiado largo (máx 5000)";

  if (email && !EMAIL_RE.test(email)) errors.email = "Email inválido";

  return { ok: Object.keys(errors).length === 0, errors };
}

/**
 * Strip `<!-- cmt:<id> -->` / `<!-- /cmt:<id> -->` markers from a
 * markdown string before rendering. The markers are used server-side
 * to locate comment blocks inside the commented file but react-markdown
 * renders raw HTML comments as visible text — so the share viewer
 * scrubs them before feeding the content to the renderer.
 */
export function stripCommentMarkers(content: string): string {
  return content.replace(/<!--\s*\/?cmt:[^>]*?-->\s*\n?/g, "");
}

/**
 * Derive the title shown in the share page header/title-tag from a
 * brand-relative doc path or filename. When the server is serving the
 * commented sibling (and exposes `originalDocPath`), we prefer the
 * original — so the header never reads "Current.Commented".
 */
export function deriveDocTitle(
  filename: string | undefined,
  originalPath: string | undefined,
): string {
  const source =
    (originalPath ? originalPath.split("/").pop() : undefined) || filename || "";
  if (!source) return "Documento";
  return source
    .replace(/\.commented(\.[a-z0-9]+)?$/i, "$1")
    .replace(/\.(md|html|txt)$/i, "")
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Format an ISO date to a short relative-ish label for the UI. */
export function formatCommentDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const now = Date.now();
  const diffMs = now - d.getTime();
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return "hace un momento";
  if (min < 60) return `hace ${min} min`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `hace ${hr} h`;
  const days = Math.floor(hr / 24);
  if (days < 7) return `hace ${days} d`;
  return d.toLocaleDateString("es-ES", { year: "numeric", month: "short", day: "numeric" });
}
