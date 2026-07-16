import { promises as fs } from "node:fs";
import { pathToFileURL } from "node:url";

export const LEGACY_MIGRATION_BUNDLE_CLASS = Object.freeze({
  SAFE: "safe-pre-execution-control",
  UNSAFE: "unsafe-execution-control-replay",
  MISSING: "missing-deploy-script",
});

/**
 * Classify, but never execute, the deploy migration script shipped in an
 * already-built image. Old images whose curated bundle predates 0019 are safe
 * to run. A bundle mentioning 0019 or 0020 must never be replayed after the
 * later tenant contract migration.
 */
export function classifyLegacyMigrationBundle(packageJson) {
  const deployScript = packageJson?.scripts?.["db:migrate:deploy"];
  if (typeof deployScript !== "string" || deployScript.trim() === "") {
    return LEGACY_MIGRATION_BUNDLE_CLASS.MISSING;
  }

  // Fail closed on variables, wrappers and indirect npm scripts. The only
  // runner-less bundle we can prove safe is a literal `&&` list using the
  // historical single-file runner, with every numbered SQL file predating
  // execution-control migration 0019.
  const commands = deployScript.split(/\s*&&\s*/);
  if (commands.length === 0) return LEGACY_MIGRATION_BUNDLE_CLASS.UNSAFE;
  const literalMigration =
    /^src\/db\/migrations\/(\d{4})_[A-Za-z0-9._-]+\.sql$/;
  for (const command of commands) {
    const tokens = command.trim().split(/\s+/);
    if (
      tokens.length < 3 ||
      tokens[0] !== "node" ||
      tokens[1] !== "scripts/apply-sql-migration.mjs"
    ) {
      return LEGACY_MIGRATION_BUNDLE_CLASS.UNSAFE;
    }
    for (const migrationPath of tokens.slice(2)) {
      const match = migrationPath.match(literalMigration);
      if (!match || Number.parseInt(match[1], 10) >= 19) {
        return LEGACY_MIGRATION_BUNDLE_CLASS.UNSAFE;
      }
    }
  }
  return LEGACY_MIGRATION_BUNDLE_CLASS.SAFE;
}

export async function classifyLegacyMigrationBundleFile(packageJsonPath) {
  const packageJson = JSON.parse(await fs.readFile(packageJsonPath, "utf8"));
  return classifyLegacyMigrationBundle(packageJson);
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const packageJsonPath = process.argv[2];
  if (!packageJsonPath) {
    console.error(
      "Usage: node classify-legacy-migration-bundle.mjs <package.json>",
    );
    process.exitCode = 2;
  } else {
    try {
      process.stdout.write(
        `${await classifyLegacyMigrationBundleFile(packageJsonPath)}\n`,
      );
    } catch {
      // Fail closed without echoing a potentially sensitive path or parser
      // error from an operator-managed image.
      process.stdout.write(`${LEGACY_MIGRATION_BUNDLE_CLASS.MISSING}\n`);
    }
  }
}
