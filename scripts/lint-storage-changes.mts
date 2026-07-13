/**
 * lint:storage (SAN-239) — enforces the first engineering non-negotiable:
 * a change to how data is stored must ship with its migration AND record how it
 * is applied in the storage-change runbook. See docs/engineering-standards.md
 * (§Data & storage changes) and docs/runbooks/storage-structure-change.md.
 *
 * Deterministic, low-false-positive. v1 reliably covers the DB backend (schema →
 * migration), and requires the runbook to be updated whenever a storage surface
 * changes. Brand-file / JSON-shape surfaces are opt-in via EXTRA_STORAGE_SURFACES
 * (the list is meant to grow as those surfaces are identified) — we do NOT guess
 * them with fuzzy regexes that would cry wolf.
 *
 * Report-only by default (exit 0). Pass --strict to exit 1 on findings — that is
 * what the pre-push hook and CI use.
 *
 *   tsx scripts/lint-storage-changes.mts [--strict] [--base <ref>]
 *
 * Scope = everything this branch changes vs its merge-base with the base ref
 * (default origin/staging) plus any staged/unstaged working-tree changes, so it
 * works the same in a local pre-push and in CI.
 */
import { execFileSync } from "node:child_process";

const STRICT = process.argv.includes("--strict");
const baseIdx = process.argv.indexOf("--base");
const BASE_REF = baseIdx !== -1 ? process.argv[baseIdx + 1] : "origin/staging";

// --- storage surfaces -----------------------------------------------------------
const DB_SCHEMA = "src/db/schema.ts";
const MIGRATIONS_DIR = "src/db/migrations/";
const RUNBOOK = "docs/runbooks/storage-structure-change.md";

// Opt-in surfaces for the brand-file / JSON-shape backends. Add a path (exact) or
// a prefix ending in "/" as those shapes are identified. Kept empty by default so
// v1 has zero false positives; extend deliberately.
const EXTRA_STORAGE_SURFACES: string[] = [
  // e.g. "src/lib/data/foundation-state.ts",
  // e.g. "src/lib/data/mc-chat.ts",
];

function git(args: string[]): string {
  try {
    return execFileSync("git", args, { encoding: "utf8" }).trim();
  } catch {
    return "";
  }
}

/** Union of committed (vs merge-base) + staged + unstaged changed paths. */
function changedFiles(): string[] {
  const set = new Set<string>();
  const base = git(["merge-base", "HEAD", BASE_REF]);
  if (base) {
    for (const f of git(["diff", "--name-only", `${base}...HEAD`]).split("\n")) {
      if (f) set.add(f);
    }
  }
  for (const f of git(["diff", "--name-only"]).split("\n")) if (f) set.add(f); // unstaged
  for (const f of git(["diff", "--name-only", "--cached"]).split("\n")) if (f) set.add(f); // staged
  return [...set];
}

const matchesSurface = (f: string) =>
  EXTRA_STORAGE_SURFACES.some((s) => (s.endsWith("/") ? f.startsWith(s) : f === s));

const changed = changedFiles();
const schemaChanged = changed.includes(DB_SCHEMA);
const migrationChanged = changed.some((f) => f.startsWith(MIGRATIONS_DIR));
const extraChanged = changed.some(matchesSurface);
const runbookTouched = changed.includes(RUNBOOK);
const storageTouched = schemaChanged || migrationChanged || extraChanged;

console.log(
  `lint:storage — base ${BASE_REF}, ${changed.length} changed file(s); storage surface touched: ${storageTouched ? "yes" : "no"}`,
);

const findings: string[] = [];

// Rule 1 (DB): schema change must come with a migration.
if (schemaChanged && !migrationChanged) {
  findings.push(
    `${DB_SCHEMA} changed but no migration under ${MIGRATIONS_DIR} is in this diff.\n` +
      `    → Generate one with drizzle-kit and verify with \`npm run db:verify\`.`,
  );
}

// Rule 2 (plan): any storage-surface change must record its application plan.
if (storageTouched && !runbookTouched) {
  findings.push(
    `A storage surface changed but ${RUNBOOK} was not updated.\n` +
      `    → Add a Change Log entry (the application plan: how/where it's applied, rollback).`,
  );
}

if (findings.length === 0) {
  console.log("✓ storage changes are accompanied by migration + application plan");
  process.exit(0);
}

console.log(`\n✗ ${findings.length} storage-discipline finding(s):\n`);
for (const f of findings) console.log(`  • ${f}\n`);
console.log(
  `See the \`storage-change\` skill + docs/engineering-standards.md (§Data & storage changes).\n` +
    `${STRICT ? "Failing (--strict)." : "Report-only (pass --strict to fail)."}`,
);
process.exit(STRICT ? 1 : 0);
