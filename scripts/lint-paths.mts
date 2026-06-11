/**
 * lint:paths (F0) — guards against the pillar-doc-path drift that is the root of
 * dolor #1: SKILL.md files declaring `*.current.md` brand-doc paths that no longer
 * match the canonical paths in config/pillar-manifest.json (e.g. the stale
 * `brand/{slug}/brand-book/...current.md` declarations).
 *
 * It scans every skills/​**​/SKILL.md, reads the `context_required` /
 * `context_optional` / `context_writes` lists from the frontmatter, and for each
 * declared CANONICAL pillar doc (a `…current.md` path with no glob/placeholder
 * beyond {slug}) checks that the path exists among the manifest's known doc paths.
 *
 * Report-only by default (exit 0). Pass `--strict` to exit 1 on findings — that is
 * what the pre-push hook uses once the declarations are normalized (F1).
 *
 *   tsx scripts/lint-paths.mts [--strict]
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const STRICT = process.argv.includes("--strict");

// --- valid canonical doc paths, from the single source of truth ----------------
type ManifestEntry = { docPaths?: string[] };
const manifest = JSON.parse(
  fs.readFileSync(path.join(ROOT, "config", "pillar-manifest.json"), "utf8"),
) as { pillars: Record<string, ManifestEntry> };
const VALID_DOC_PATHS = new Set<string>(
  Object.values(manifest.pillars).flatMap((e) => e.docPaths ?? []),
);

// --- walk skills/​**​/SKILL.md ---------------------------------------------------
function findSkillFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...findSkillFiles(full));
    else if (entry.name === "SKILL.md") out.push(full);
  }
  return out;
}

/** Extract the path items from context_required/optional/writes in the frontmatter. */
function declaredPaths(md: string): string[] {
  const fm = md.match(/^---\n([\s\S]*?)\n---/);
  if (!fm) return [];
  const lines = fm[1].split("\n");
  const keys = new Set(["context_required", "context_optional", "context_writes"]);
  const out: string[] = [];
  let inBlock = false;
  for (const line of lines) {
    const keyMatch = line.match(/^(\w+):\s*$/);
    if (keyMatch) {
      inBlock = keys.has(keyMatch[1]);
      continue;
    }
    if (inBlock) {
      const item = line.match(/^\s*-\s+(.+?)\s*(?:#.*)?$/);
      if (item) out.push(item[1].trim());
      else if (!/^\s*#/.test(line) && line.trim() !== "") inBlock = false; // left the list
    }
  }
  return out;
}

/** Canonical pillar doc: `{name}-current.md` (canonical), `{name}.current.md`
 *  (legacy dot form) or bare `current.md` — all statically checkable against the
 *  manifest. Since the manifest is now hyphen-form, a leftover `.current.md`
 *  declaration won't match and is flagged as stale. */
function isCheckableCanonicalDoc(rel: string): boolean {
  if (rel.includes("*") || /\{(?!slug\})/.test(rel)) return false; // glob or non-slug placeholder
  return /(^|\/)([a-z0-9][a-z0-9-]*[.-])?current\.md$/i.test(rel);
}

const skillFiles = findSkillFiles(path.join(ROOT, "skills"));
const findings: { file: string; declared: string; rel: string }[] = [];

for (const file of skillFiles) {
  const md = fs.readFileSync(file, "utf8");
  for (const declared of declaredPaths(md)) {
    if (!declared.startsWith("brand/{slug}/")) continue;
    const rel = declared.replace(/^brand\/\{slug\}\//, "");
    if (!isCheckableCanonicalDoc(rel)) continue;
    if (!VALID_DOC_PATHS.has(rel)) {
      findings.push({ file: path.relative(ROOT, file), declared, rel });
    }
  }
}

// --- report --------------------------------------------------------------------
console.log(
  `lint:paths — scanned ${skillFiles.length} SKILL.md, ${VALID_DOC_PATHS.size} canonical paths in the manifest`,
);
if (findings.length === 0) {
  console.log("✓ no stale canonical-doc declarations");
  process.exit(0);
}

console.log(`\n✗ ${findings.length} stale canonical-doc declaration(s) — not in config/pillar-manifest.json:\n`);
for (const f of findings) {
  console.log(`  ${f.file}`);
  console.log(`    declared: ${f.declared}`);
}
console.log(
  `\n${findings.length} finding(s). ${STRICT ? "Failing (--strict)." : "Report-only (pass --strict to fail)."}`,
);
process.exit(STRICT ? 1 : 0);
