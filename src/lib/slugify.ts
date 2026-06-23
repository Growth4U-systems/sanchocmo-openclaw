/**
 * Canonical URL/identifier slugifier (SAN-282).
 *
 * Lowercase → NFD → strip combining diacritics → collapse every run of
 * non-`[a-z0-9]` into a single `-` → trim leading/trailing `-`. Optionally
 * truncate, then fall back to a default when the result is empty.
 *
 * This is the single source for the slug chain that `slugifyTemplateName`
 * (partnerships/templates), `slugifyPath` (publishing/alarife) and `personaId`
 * (data/persona-loops) used to each re-implement. Behaviour is byte-identical
 * to those three — they now delegate here.
 *
 *   slugify("Café Olé!")                              // "cafe-ole"
 *   slugify("Plantilla X", { maxLen: 4 })             // "plan"
 *   slugify("***", { fallback: "articulo" })          // "articulo"
 */
export interface SlugifyOptions {
  /** Truncate the slug to at most this many chars (applied before `fallback`). Omit = no limit. */
  maxLen?: number;
  /** Returned when the slug is empty (after truncation). Defaults to `""`. */
  fallback?: string;
}

export function slugify(input: string, opts: SlugifyOptions = {}): string {
  const { maxLen, fallback = "" } = opts;
  let slug = (input ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (maxLen != null) slug = slug.slice(0, maxLen);
  return slug || fallback;
}
