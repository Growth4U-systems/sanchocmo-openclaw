export class DocPathError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DocPathError";
  }
}

export function cleanDocPath(input: string): string {
  const cleaned = String(input || "")
    .trim()
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
    .replace(/\/+/g, "/");

  if (!cleaned) throw new DocPathError("Missing path");

  const parts = cleaned.split("/").filter(Boolean);
  if (parts.some((part) => part === "." || part === "..")) {
    throw new DocPathError("Path traversal not allowed");
  }

  return parts.join("/");
}

export function collapseDuplicateBrandPrefix(input: string): string {
  let cleaned = cleanDocPath(input);
  const parts = cleaned.split("/");

  if (parts[0] !== "brand" || !parts[1]) return cleaned;

  const slug = parts[1];
  const duplicate = `brand/${slug}/brand/${slug}/`;
  const canonical = `brand/${slug}/`;

  while (cleaned.startsWith(duplicate)) {
    cleaned = canonical + cleaned.slice(duplicate.length);
  }

  return cleaned;
}

export function normalizeBrandDocPath(slug: string, input: string): string {
  if (!slug) throw new DocPathError("Missing slug");

  const cleaned = collapseDuplicateBrandPrefix(input);
  const prefix = `brand/${slug}/`;

  if (cleaned.startsWith(prefix)) return cleaned;

  if (cleaned.startsWith("brand/")) {
    throw new DocPathError("docPath belongs to a different brand");
  }

  return `${prefix}${cleaned}`;
}

export function normalizeWorkspaceDocPath(input: string, slug?: string): string {
  if (slug) return normalizeBrandDocPath(slug, input);
  return collapseDuplicateBrandPrefix(input);
}

export function stripBrandPrefix(input: string, slug?: string): string {
  const cleaned = collapseDuplicateBrandPrefix(input);
  if (slug && cleaned.startsWith(`brand/${slug}/`)) {
    return cleaned.slice(`brand/${slug}/`.length);
  }
  return cleaned.replace(/^brand\/[^/]+\//, "");
}

/**
 * HTML-canonical sibling (SAN-149). A markdown doc may have a sibling
 * `.html` with the same basename (`current.md` → `current.html`) generated
 * by the html-output skill. When that sibling exists, the HTML is the
 * canonical client-facing document and the `.md` is its source.
 */
export function htmlSiblingOf(docPath: string): string | null {
  const cleaned = cleanDocPath(docPath);
  if (!/\.md$/i.test(cleaned)) return null;
  return cleaned.replace(/\.md$/i, ".html");
}

export function mdSourceOf(docPath: string): string | null {
  const cleaned = cleanDocPath(docPath);
  if (!/\.html$/i.test(cleaned)) return null;
  return cleaned.replace(/\.html$/i, ".md");
}

/** True when the two paths form a md/html canonical pair (same basename). */
export function isCanonicalPair(a: string, b: string): boolean {
  try {
    const ca = cleanDocPath(a);
    const cb = cleanDocPath(b);
    return htmlSiblingOf(ca) === cb || htmlSiblingOf(cb) === ca;
  } catch {
    return false;
  }
}

export function slugFromBrandDocPath(input: string): string | null {
  const cleaned = collapseDuplicateBrandPrefix(input);
  const match = cleaned.match(/^brand\/([^/]+)\//);
  return match?.[1] || null;
}
