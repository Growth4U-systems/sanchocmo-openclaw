import fs from "fs";
import path from "path";
import {
  cleanDocPath,
  htmlSiblingOf,
  normalizeBrandDocPath,
  normalizeWorkspaceDocPath,
  slugFromBrandDocPath,
} from "@/lib/doc-paths";

export interface ResolvedDocPath {
  requestedPath: string;
  canonicalPath: string;
  absPath: string;
  exists: boolean;
  usedFallback: boolean;
  slug: string | null;
  /**
   * HTML-canonical sibling (SAN-149): when the resolved doc is a `.md` and
   * a same-basename `.html` exists on disk, this holds its workspace path.
   * Consumers decide whether to open/share the HTML; `canonicalPath` keeps
   * pointing at the resolved file so markdown stays editable.
   */
  htmlSibling: string | null;
}

function safeAbs(baseDir: string, relPath: string): string {
  const safeBase = path.resolve(baseDir);
  const absPath = path.resolve(path.join(safeBase, relPath));
  if (absPath !== safeBase && !absPath.startsWith(`${safeBase}${path.sep}`)) {
    throw new Error("Forbidden");
  }
  return absPath;
}

// Matches a canonical-doc filename: `current.<ext>` or `<name>.current.<ext>`.
const CANONICAL_DOC_RE = /(^|\.)current\.(md|html|json)$/i;

/**
 * Name-agnostic canonical-doc fallback (SAN-103). Foundation pillar docs
 * live one-per-folder and may be physically named either `current.md`
 * (legacy) or `{folder}.current.md` (canonical). A caller may request
 * EITHER name, so when the exact requested file is missing, scan the
 * folder for the single canonical `*.current.*` doc and serve it. This
 * makes the rename safe in both directions:
 *
 *   request `x/current.md`     (legacy)    → serves `x/x.current.md` if present
 *   request `x/x.current.md`   (canonical) → serves `x/current.md` for un-migrated data
 *
 * Preference order: folder-named `{folder}.current.*` first, then any
 * other `*.current.*`, then bare `current.*`.
 */
function currentAliasFallback(absPath: string): string | null {
  if (!CANONICAL_DOC_RE.test(path.basename(absPath))) return null;

  const dir = path.dirname(absPath);
  if (!fs.existsSync(dir)) return null;

  const folderName = path.basename(dir).toLowerCase();
  // Prefer candidates with the requested extension: a folder may hold an
  // md/html canonical pair (SAN-149), and a request for `current.md` must
  // not silently resolve to `*.current.html`.
  const requestedExt = path.extname(absPath).toLowerCase();
  const candidates = fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter((name) => CANONICAL_DOC_RE.test(name))
    .sort((a, b) => {
      const aExt = path.extname(a).toLowerCase() === requestedExt;
      const bExt = path.extname(b).toLowerCase() === requestedExt;
      if (aExt !== bExt) return aExt ? -1 : 1;
      const aFolder = a.toLowerCase().startsWith(`${folderName}.current.`);
      const bFolder = b.toLowerCase().startsWith(`${folderName}.current.`);
      if (aFolder !== bFolder) return aFolder ? -1 : 1;
      const aBare = /^current\./i.test(a);
      const bBare = /^current\./i.test(b);
      if (aBare !== bBare) return aBare ? 1 : -1; // prefer named over bare
      return a.localeCompare(b);
    });

  return candidates[0] ? path.join(dir, candidates[0]) : null;
}

/**
 * Lite sibling fallback: when a caller requests a canonical doc
 * (`current.md` or `{folder}.current.md`) and it does not exist, return
 * the sibling `lite.md` if present. fast-foundation
 * writes preliminary outputs to `lite.md`; full skills produce the real
 * `current.md` later. This fallback lets the dashboard surface preliminary
 * content (with `usedFallback: true` so the UI can badge it as such).
 *
 * Scope: this fallback fires only for read paths exposed via the docs API
 * (used by the dashboard / brand-brain / chat sidebar). Skills running
 * server-side read files directly via the harness, NOT through this
 * resolver, so a downstream skill that consumes another skill's output
 * (positioning reading ECPs, niche-discovery reading SWOT) will NOT
 * silently degrade to lite. That problem (Philippe's complaint,
 * 2026-05-19) was caused by lite content sitting at the `current.md` path
 * itself — solved by the fast-foundation rename, not by this fallback.
 */
function liteSiblingFallback(absPath: string): string | null {
  if (!/(^|\.)current\.md$/i.test(path.basename(absPath))) return null;
  const litePath = path.join(path.dirname(absPath), "lite.md");
  if (fs.existsSync(litePath) && fs.statSync(litePath).isFile()) {
    return litePath;
  }
  return null;
}

/**
 * HTML-canonical sibling on disk (SAN-149): for a resolved `.md` doc,
 * return the workspace path of the same-basename `.html` if it exists.
 */
function htmlSiblingOnDisk(baseDir: string, canonicalPath: string): string | null {
  const sibling = htmlSiblingOf(canonicalPath);
  if (!sibling) return null;
  try {
    const absSibling = safeAbs(baseDir, sibling);
    if (fs.existsSync(absSibling) && fs.statSync(absSibling).isFile()) {
      return sibling;
    }
  } catch {
    // unsafe sibling path — treat as absent
  }
  return null;
}

export function resolveWorkspaceDocPath(
  baseDir: string,
  docPath: string,
  opts: { slug?: string; requireBrand?: boolean } = {},
): ResolvedDocPath {
  const requestedPath = cleanDocPath(docPath);
  const normalizedPath = opts.slug
    ? normalizeBrandDocPath(opts.slug, requestedPath)
    : normalizeWorkspaceDocPath(requestedPath);

  if (opts.requireBrand && !normalizedPath.startsWith("brand/")) {
    throw new Error("Document path must be brand-scoped");
  }

  const absPath = safeAbs(baseDir, normalizedPath);
  const exists = fs.existsSync(absPath) && fs.statSync(absPath).isFile();

  if (exists) {
    return {
      requestedPath,
      canonicalPath: normalizedPath,
      absPath,
      exists: true,
      usedFallback: false,
      slug: opts.slug || slugFromBrandDocPath(normalizedPath),
      htmlSibling: htmlSiblingOnDisk(baseDir, normalizedPath),
    };
  }

  const fallbackAbs = currentAliasFallback(absPath) ?? liteSiblingFallback(absPath);
  if (fallbackAbs) {
    const canonicalPath = path.relative(path.resolve(baseDir), fallbackAbs).split(path.sep).join("/");
    return {
      requestedPath,
      canonicalPath,
      absPath: fallbackAbs,
      exists: true,
      usedFallback: true,
      slug: opts.slug || slugFromBrandDocPath(canonicalPath),
      htmlSibling: htmlSiblingOnDisk(baseDir, canonicalPath),
    };
  }

  return {
    requestedPath,
    canonicalPath: normalizedPath,
    absPath,
    exists: false,
    usedFallback: false,
    slug: opts.slug || slugFromBrandDocPath(normalizedPath),
    htmlSibling: null,
  };
}
