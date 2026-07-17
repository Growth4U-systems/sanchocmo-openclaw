#!/usr/bin/env node
import { executionControlMigrationsThrough } from "./lib/execution-control-migration-set.mjs";
import {
  MigrationSafetyError,
  migrationDatabaseUrlFromEnv,
  runTrackedSqlMigrations,
} from "./lib/tracked-sql-migrations.mjs";

const args = process.argv.slice(2);
const dryRun = takeFlag(args, "--dry-run");
const adopt = takeFlag(args, "--adopt");
const through = takeOption(args, "--through");

if (args.length > 0) {
  fail(`Unknown argument: ${args[0]}`);
}
if (dryRun && adopt) {
  fail("--dry-run and --adopt are mutually exclusive.");
}

try {
  const descriptors = executionControlMigrationsThrough(through);
  await runTrackedSqlMigrations({
    descriptors,
    databaseUrl: migrationDatabaseUrlFromEnv(process.env),
    dryRun,
    adopt,
    logger: (message) => console.log(`[execution-migrations] ${message}`),
  });
} catch (error) {
  const message =
    error instanceof MigrationSafetyError || error instanceof Error
      ? error.message
      : "Unknown migration failure";
  fail(redactDatabaseUrls(message));
}

function takeFlag(values, flag) {
  const index = values.indexOf(flag);
  if (index < 0) return false;
  values.splice(index, 1);
  return true;
}

function takeOption(values, option) {
  const inline = values.find((value) => value.startsWith(`${option}=`));
  if (inline) {
    values.splice(values.indexOf(inline), 1);
    return inline.slice(option.length + 1);
  }
  const index = values.indexOf(option);
  if (index < 0) return undefined;
  const value = values[index + 1];
  if (!value || value.startsWith("--")) {
    fail(`${option} requires a value.`);
  }
  values.splice(index, 2);
  return value;
}

function redactDatabaseUrls(value) {
  return value.replace(
    /postgres(?:ql)?:\/\/[^\s]+/gi,
    "[database-url-redacted]",
  );
}

function fail(message) {
  console.error(`[execution-migrations] ${message}`);
  process.exit(1);
}
