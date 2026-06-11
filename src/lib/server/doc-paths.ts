import fs from "fs";
import path from "path";
import {
  cleanDocPath,
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
}

function safeAbs(baseDir: string, relPath: string): string {
  const safeBase = path.resolve(baseDir);
  const absPath = path.resolve(path.join(safeBase, relPath));
  if (absPath !== safeBase && !absPath.startsWith(`${safeBase}${path.sep}`)) {
    throw new Error("Forbidden");
  }
  return absPath;
}

// Matches a canonical-doc filename: `current.<ext>`, `<name>.current.<ext>`
// (legacy SAN-103 dot form) or `<name>-current.<ext>` (canonical hyphen form, SAN-156).
const CANONICAL_DOC_RE = /(^|[.-])current\.(md|html|json)$/i;

/**
 * Name-agnostic canonical-doc fallback (SAN-103 / SAN-156). Foundation pillar
 * docs live one-per-folder and may be physically named `{folder}-current.md`
 * (canonical, SAN-156), `{folder}.current.md` (legacy SAN-103 dot form) or bare
 * `current.md` (older legacy). A caller may request ANY of these names, so when
 * the exact requested file is missing, scan the folder for the single canonical
 * `*current.*` doc and serve it. This makes the rename safe in every direction:
 *
 *   request `x/x.current.md`   → serves `x/x-current.md` if present (and vice versa)
 *   request `x/current.md`     → serves `x/x-current.md` if present
 *   request `x/x-current.md`   → serves `x/current.md` for un-migrated data
 *
 * Preference order: folder-named `{folder}-current.*` / `{folder}.current.*`
 * first, then any other `*current.*`, then bare `current.*`.
 */
function currentAliasFallback(absPath: string): string | null {
  if (!CANONICAL_DOC_RE.test(path.basename(absPath))) return null;

  const dir = path.dirname(absPath);
  if (!fs.existsSync(dir)) return null;

  const folderName = path.basename(dir).toLowerCase();
  const isFolderNamed = (name: string) => {
    const lower = name.toLowerCase();
    return lower.startsWith(`${folderName}-current.`) || lower.startsWith(`${folderName}.current.`);
  };
  const candidates = fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter((name) => CANONICAL_DOC_RE.test(name))
    .sort((a, b) => {
      const aFolder = isFolderNamed(a);
      const bFolder = isFolderNamed(b);
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
  if (!/(^|[.-])current\.md$/i.test(path.basename(absPath))) return null;
  const litePath = path.join(path.dirname(absPath), "lite.md");
  if (fs.existsSync(litePath) && fs.statSync(litePath).isFile()) {
    return litePath;
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
    };
  }

  return {
    requestedPath,
    canonicalPath: normalizedPath,
    absPath,
    exists: false,
    usedFallback: false,
    slug: opts.slug || slugFromBrandDocPath(normalizedPath),
  };
}
