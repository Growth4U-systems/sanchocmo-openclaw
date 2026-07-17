import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import {
  canTransitionExecutionRun,
  executionCommandFingerprint,
  executionEffectFromDatabaseRow,
  executionEventFromDatabaseRow,
  executionRunFromDatabaseRow,
  executionStepFromDatabaseRow,
  hashExecutionLeaseToken,
} from "../execution-control/postgres";
import {
  EXECUTION_COMMAND_CONFLICT_CODE,
  EXECUTION_EFFECT_CONFLICT_CODE,
  ExecutionCommandConflictError,
  ExecutionEffectConflictError,
} from "../execution-control/types";
import { executionControlMigrations } from "../../../scripts/lib/execution-control-migration-set.mjs";

const expectedExecutionControlMigrations = [
  "0019_execution_control.sql",
  "0020_execution_tenant_scope.sql",
  "0021_execution_leases.sql",
  "0022_execution_command_fingerprint.sql",
  "0023_execution_drain.sql",
  "0024_execution_tenant_contract.sql",
  "0025_execution_effects.sql",
  "0026_execution_cancellation.sql",
  "0027_execution_terminal_projections.sql",
  "0028_execution_run_blocking.sql",
  "0029_leads_search_projections.sql",
  "0030_execution_utc_timestamps.sql",
  "0031_execution_origin_lookup.sql",
  "0032_execution_origin_tombstones.sql",
  "0033_execution_origin_command_claim.sql",
] as const;

function assertTrackedExecutionMigration(file: string): void {
  const name = `src/db/migrations/${file}`;
  const matches = executionControlMigrations.filter(
    (migration) => migration.name === name,
  );
  assert.equal(
    matches.length,
    1,
    `${name} must occur once in the tracked manifest`,
  );
  assert.equal(matches[0]?.id, file.slice(0, 4));
  assert.equal(matches[0]?.path, path.join(process.cwd(), name));
  assert.equal(typeof matches[0]?.inspectState, "function");
}

test("execution-control migration is additive, ordered and idempotency-safe", () => {
  const sql = fs.readFileSync(
    path.join(process.cwd(), "src/db/migrations/0019_execution_control.sql"),
    "utf8",
  );

  assert.match(sql, /CREATE TABLE IF NOT EXISTS "execution_runs"/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS "execution_steps"/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS "execution_events"/);
  assert.match(sql, /"sequence" bigserial NOT NULL/);
  assert.match(sql, /FOREIGN KEY \("run_id"\).*REFERENCES "execution_runs"/s);
  assert.match(
    sql,
    /CREATE UNIQUE INDEX IF NOT EXISTS "execution_runs_aggregate_idempotency_idx"[\s\S]*"aggregate_type", "aggregate_id", "operation", "idempotency_key"/,
  );
  assert.match(
    sql,
    /CREATE UNIQUE INDEX IF NOT EXISTS "execution_runs_tenant_aggregate_idempotency_idx"[\s\S]*"tenant_key", "aggregate_type", "aggregate_id", "operation", "idempotency_key"/,
  );
  assert.match(sql, /'completed', 'partial', 'failed'/);
  // Event names stay open so product-specific adapters need no schema change.
  assert.doesNotMatch(sql, /execution_events_type_check/);

  const tenantSql = fs.readFileSync(
    path.join(
      process.cwd(),
      "src/db/migrations/0020_execution_tenant_scope.sql",
    ),
    "utf8",
  );
  assert.match(tenantSql, /ADD COLUMN IF NOT EXISTS "tenant_key" text/);
  assert.doesNotMatch(tenantSql, /ALTER COLUMN "tenant_key" SET NOT NULL/);
  assert.doesNotMatch(tenantSql, /DROP INDEX/);
  assert.match(
    tenantSql,
    /execution_runs_tenant_aggregate_idempotency_idx[\s\S]*"tenant_key", "aggregate_type", "aggregate_id", "operation", "idempotency_key"/,
  );
  assert.match(tenantSql, /execution_runs_tenant_created_idx/);
  assert.match(tenantSql, /execution_runs_tenant_operation_created_idx/);

  assert.deepEqual(
    executionControlMigrations.map((migration) =>
      path.basename(migration.path),
    ),
    expectedExecutionControlMigrations,
  );
  for (const migration of expectedExecutionControlMigrations) {
    assertTrackedExecutionMigration(migration);
  }

  const originCommandSql = fs.readFileSync(
    path.join(
      process.cwd(),
      "src/db/migrations/0033_execution_origin_command_claim.sql",
    ),
    "utf8",
  );
  assert.match(
    originCommandSql,
    /ADD COLUMN IF NOT EXISTS "command_operation"/,
  );
  assert.match(
    originCommandSql,
    /ADD COLUMN IF NOT EXISTS "command_fingerprint"/,
  );
  assert.match(
    originCommandSql,
    /ADD COLUMN IF NOT EXISTS "command_claimed_at"/,
  );
  assert.match(originCommandSql, /execution_origins_command_claim_shape_check/);
  assert.doesNotMatch(originCommandSql, /DROP|TRUNCATE|DELETE|UPDATE/i);

  const packageJson = JSON.parse(
    fs.readFileSync(path.join(process.cwd(), "package.json"), "utf8"),
  ) as { scripts: Record<string, string> };
  assert.equal(
    packageJson.scripts["db:migrate:execution-control"],
    "node scripts/run-execution-control-migrations.mjs",
  );
  assert.equal(
    packageJson.scripts["db:migrate:execution-control:check"],
    "node scripts/run-execution-control-migrations.mjs --dry-run",
  );
  assert.equal(
    packageJson.scripts["db:migrate:execution-control:adopt"],
    "node scripts/run-execution-control-migrations.mjs --adopt",
  );

  const trackedRunner = fs.readFileSync(
    path.join(process.cwd(), "scripts/run-execution-control-migrations.mjs"),
    "utf8",
  );
  assert.match(trackedRunner, /executionControlMigrationsThrough\(through\)/);
  assert.match(trackedRunner, /runTrackedSqlMigrations\(\{/);
  assert.match(trackedRunner, /descriptors,/);

  const localMigrator = fs.readFileSync(
    path.join(process.cwd(), "scripts/migrate-local.mjs"),
    "utf8",
  );
  assert.match(
    localMigrator,
    /import \{ executionControlMigrations \} from "\.\/lib\/execution-control-migration-set\.mjs"/,
  );
  assert.match(
    localMigrator,
    /runTrackedSqlMigrations\(\{[\s\S]*descriptors: executionControlMigrations/,
  );
});

test("blocked-run migration is rerunnable, closed and tracked", () => {
  const migrationSql = fs.readFileSync(
    path.join(
      process.cwd(),
      "src/db/migrations/0028_execution_run_blocking.sql",
    ),
    "utf8",
  );
  assert.match(
    migrationSql,
    /ADD COLUMN IF NOT EXISTS "blocked_reason_code" text/,
  );
  assert.match(migrationSql, /ADD COLUMN IF NOT EXISTS "blocked_at" timestamp/);
  assert.match(
    migrationSql,
    /'queued', 'running', 'waiting_approval', 'blocked'/,
  );
  for (const reasonCode of [
    "handler_version_invalid",
    "handler_contract_unsupported",
    "handler_contract_mismatch",
    "execution_policy_mismatch",
    "command_contract_mismatch",
    "runtime_authority_unavailable",
  ]) {
    assert.match(migrationSql, new RegExp(`'${reasonCode}'`));
  }
  assert.match(
    migrationSql,
    /DROP CONSTRAINT IF EXISTS "execution_runs_status_check"/,
  );
  assert.match(
    migrationSql,
    /DROP CONSTRAINT IF EXISTS "execution_runs_block_reason_code_check"/,
  );
  assert.match(
    migrationSql,
    /DROP CONSTRAINT IF EXISTS "execution_runs_block_shape_check"/,
  );
  assert.match(
    migrationSql,
    /"status" = 'blocked'[\s\S]*"lease_token_hash" IS NULL[\s\S]*"finished_at" IS NULL/,
  );
  assert.match(
    migrationSql,
    /execution_runs_blocked_scope_idx[\s\S]*"operation", "mode", "tenant_key", "blocked_at", "id"[\s\S]*WHERE "status" = 'blocked'/,
  );
  assert.doesNotMatch(migrationSql, /\b(?:DROP TABLE|TRUNCATE)\b/i);

  assertTrackedExecutionMigration("0028_execution_run_blocking.sql");
});

test("block and resume are exact-scope DB-clock CAS operations with closed events", () => {
  const source = fs.readFileSync(
    path.join(process.cwd(), "src/lib/execution-control/postgres.ts"),
    "utf8",
  );
  const methodBody = (method: string): string => {
    const start = source.indexOf(method);
    assert.notEqual(start, -1);
    const end = source.indexOf("\n  async ", start + method.length);
    return source.slice(start, end === -1 ? undefined : end);
  };
  const block = methodBody("async blockRun(");
  const resume = methodBody("async resumeBlockedRun(");

  for (const body of [block, resume]) {
    assert.match(body, /SELECT \$\{databaseUtcClock\(\)\} AS "now"/);
    assert.match(body, /r\."id" = \$\{runId\}/);
    assert.match(body, /r\."tenant_key" = \$\{tenantKey\}/);
    assert.match(body, /r\."operation" = \$\{operation\}/);
    assert.match(body, /r\."mode" = \$\{mode\}/);
    assert.match(body, /INSERT INTO "execution_events"/);
  }
  assert.match(block, /r\."status" = 'running'/);
  assert.match(block, /r\."lease_token_hash" = \$\{tokenHash\}/);
  assert.match(block, /r\."lease_expires_at" > block_clock\."now"/);
  assert.match(block, /'run\.blocked'/);
  assert.match(
    block,
    /jsonb_build_object\('reasonCode', \$\{reasonCode\}::text\)/,
  );
  assert.match(block, /'remoteEffectsReverted', FALSE/);
  assert.match(block, /INSERT INTO "execution_terminal_projections"/);
  assert.doesNotMatch(block, /'token'|'leaseToken'|\$\{input\.token\}/);

  assert.match(resume, /r\."status" = 'blocked'/);
  assert.match(resume, /r\."blocked_reason_code" = \$\{expectedReasonCode\}/);
  assert.match(resume, /"available_at" = resume_clock\."now"/);
  assert.match(resume, /'run\.resumed'/);
  assert.doesNotMatch(resume, /lease_token_hash" = \$\{/);
});

test("terminal projection outbox is compact, fenced and independently discoverable", () => {
  const migrationSql = fs.readFileSync(
    path.join(
      process.cwd(),
      "src/db/migrations/0027_execution_terminal_projections.sql",
    ),
    "utf8",
  );
  assert.match(
    migrationSql,
    /CREATE TABLE IF NOT EXISTS "execution_terminal_projections"/,
  );
  assert.match(
    migrationSql,
    /"run_id" text PRIMARY KEY[\s\S]*ON DELETE RESTRICT/,
  );
  assert.match(migrationSql, /"last_attempt_at" timestamp/);
  assert.match(
    migrationSql,
    /'pending', 'running', 'retry_wait', 'succeeded', 'blocked'/,
  );
  assert.match(
    migrationSql,
    /execution_terminal_projections_runnable_scope_idx[\s\S]*'pending', 'retry_wait', 'running'/,
  );
  assert.match(migrationSql, /execution_terminal_projections_blocked_idx/);
  assert.match(
    migrationSql,
    /"metadata"->>'authority' = 'execution_ledger_v2'/,
  );
  assert.doesNotMatch(
    migrationSql,
    /"(?:command|input|output|payload|receipt|metadata|error_text)"\s/,
  );
  assert.doesNotMatch(migrationSql, /\b(?:DROP|TRUNCATE)\b/i);

  const source = fs.readFileSync(
    path.join(process.cwd(), "src/lib/execution-control/postgres.ts"),
    "utf8",
  );
  for (const eventType of [
    "run.projection_succeeded",
    "run.projection_retry_scheduled",
    "run.projection_blocked",
    "run.projection_resumed",
  ]) {
    assert.match(source, new RegExp(eventType.replace(".", "\\.")));
  }
  assert.match(source, /claimNextTerminalProjection/);
  assert.match(source, /FOR UPDATE OF p SKIP LOCKED/);
  assert.match(source, /clock_timestamp\(\) AT TIME ZONE 'UTC'/);
  const resumeStart = source.indexOf("async resumeBlockedTerminalProjection(");
  assert.notEqual(resumeStart, -1);
  const resumeEnd = source.indexOf("\n  async ", resumeStart + 1);
  const resume = source.slice(
    resumeStart,
    resumeEnd === -1 ? undefined : resumeEnd,
  );
  for (const condition of [
    /p\."run_id" = \$\{runId\}/,
    /p\."tenant_key" = \$\{tenantKey\}/,
    /p\."operation" = \$\{operation\}/,
    /p\."mode" = \$\{mode\}/,
    /p\."state" = 'blocked'/,
    /p\."last_error_code" = \$\{expectedErrorCode\}/,
  ]) {
    assert.match(resume, condition);
  }
  assert.match(resume, /"state" = 'pending'/);
  assert.match(resume, /"available_at" = resume_clock\."now"/);
  assert.match(resume, /'run\.projection_resumed'/);
  assert.doesNotMatch(resume, /"claim_count"\s*=/);

  assertTrackedExecutionMigration("0027_execution_terminal_projections.sql");
});

test("effect ledger migration is additive, bounded and carries no raw payload", () => {
  const effectsSql = fs.readFileSync(
    path.join(process.cwd(), "src/db/migrations/0025_execution_effects.sql"),
    "utf8",
  );
  assert.match(effectsSql, /CREATE TABLE IF NOT EXISTS "execution_effects"/);
  assert.match(effectsSql, /UNIQUE \("run_id", "step_key"\)/);
  assert.match(effectsSql, /UNIQUE \("effect_key"\)/);
  assert.match(effectsSql, /"payload_fingerprint" text NOT NULL/);
  assert.doesNotMatch(effectsSql, /"payload"\s+jsonb/i);
  assert.match(effectsSql, /octet_length\("receipt"::text\) <= 16384/);
  assert.match(
    effectsSql,
    /\("status" = 'succeeded'\) =[\s\S]*"receipt" IS NOT NULL/,
  );
  assert.match(effectsSql, /execution_effects_retry_idx/);
  assert.doesNotMatch(effectsSql, /\b(?:DROP|TRUNCATE)\b/i);

  const schema = fs.readFileSync(
    path.join(process.cwd(), "src/db/schema.ts"),
    "utf8",
  );
  assert.match(
    schema,
    /export const executionEffects = pgTable\(\s*"execution_effects"/,
  );
  assert.doesNotMatch(schema, /executionEffects[\s\S]{0,2500}payload:\s*jsonb/);

  assertTrackedExecutionMigration("0025_execution_effects.sql");
});

test("effect mutations are DB-clock, scope and bearer fenced CTEs", () => {
  const source = fs.readFileSync(
    path.join(process.cwd(), "src/lib/execution-control/postgres.ts"),
    "utf8",
  );
  for (const method of [
    "async prepareEffect(",
    "async completeEffect(",
    "async recordEffectFailure(",
    "async recordEffectReconcile(",
  ]) {
    const start = source.indexOf(method);
    assert.notEqual(start, -1);
    const end = source.indexOf("\n  async ", start + method.length);
    const body = source.slice(start, end === -1 ? undefined : end);
    assert.match(body, /SELECT \$\{databaseUtcClock\(\)\} AS "now"/);
    assert.match(body, /r\."tenant_key" = \$\{tenantKey\}/);
    assert.match(body, /r\."operation" = \$\{operation\}/);
    assert.match(body, /r\."mode" = \$\{mode\}/);
    assert.match(body, /r\."lease_token_hash" = \$\{tokenHash\}/);
    assert.match(body, /r\."lease_expires_at" > lease_clock\."now"/);
  }
  assert.match(source, /'effect\.prepared'/);
  assert.match(source, /'effect\.succeeded'/);
  assert.match(source, /"effect\.retry_scheduled"/);
  assert.match(source, /"effect\.uncertain"/);
  assert.match(source, /'effect\.reconciled'/);
  assert.doesNotMatch(
    source,
    /jsonb_build_object\([\s\S]{0,200}'(?:payload|receipt)'/,
  );
});

test("tenant contract migration closes the global idempotency boundary", () => {
  const contractSql = fs.readFileSync(
    path.join(
      process.cwd(),
      "src/db/migrations/0024_execution_tenant_contract.sql",
    ),
    "utf8",
  );
  assert.match(contractSql, /UPDATE "execution_runs"[\s\S]*"tenant_key"/);
  assert.match(contractSql, /ALTER COLUMN "tenant_key" SET NOT NULL/);
  assert.match(
    contractSql,
    /CREATE UNIQUE INDEX IF NOT EXISTS "execution_runs_tenant_aggregate_idempotency_idx"[\s\S]*"tenant_key", "aggregate_type", "aggregate_id", "operation", "idempotency_key"/,
  );
  assert.match(
    contractSql,
    /DROP INDEX IF EXISTS "execution_runs_aggregate_idempotency_idx"/,
  );
  assert.doesNotMatch(contractSql, /\b(?:DROP TABLE|TRUNCATE)\b/i);

  const schema = fs.readFileSync(
    path.join(process.cwd(), "src/db/schema.ts"),
    "utf8",
  );
  assert.match(schema, /tenantKey: text\("tenant_key"\)\.notNull\(\)/);
  assert.doesNotMatch(
    schema,
    /uniqueIndex\("execution_runs_aggregate_idempotency_idx"\)/,
  );

  assertTrackedExecutionMigration("0024_execution_tenant_contract.sql");
});

test("execution drain migration persists O(1) attempts and indexes restart discovery", () => {
  const drainSql = fs.readFileSync(
    path.join(process.cwd(), "src/db/migrations/0023_execution_drain.sql"),
    "utf8",
  );
  assert.match(
    drainSql,
    /ADD COLUMN IF NOT EXISTS "handler_attempt" integer DEFAULT 0 NOT NULL/,
  );
  assert.match(
    drainSql,
    /execution_runs_runnable_scope_idx[\s\S]*"operation", "mode", "tenant_key"[\s\S]*WHERE "status" IN \('queued', 'running'\)/,
  );
  assert.doesNotMatch(drainSql, /\b(DROP|TRUNCATE)\b/i);

  assertTrackedExecutionMigration("0023_execution_drain.sql");
});

test("command fingerprint migration is additive, nullable and rerunnable", () => {
  const fingerprintSql = fs.readFileSync(
    path.join(
      process.cwd(),
      "src/db/migrations/0022_execution_command_fingerprint.sql",
    ),
    "utf8",
  );
  assert.match(
    fingerprintSql,
    /ADD COLUMN IF NOT EXISTS "command_fingerprint" text/,
  );
  assert.doesNotMatch(fingerprintSql, /\bUPDATE\b/i);
  assert.doesNotMatch(fingerprintSql, /CREATE\s+(?:UNIQUE\s+)?INDEX/i);
  assert.doesNotMatch(fingerprintSql, /command_(?:json|payload|input)/i);

  assertTrackedExecutionMigration("0022_execution_command_fingerprint.sql");
});

test("execution lease migration is additive, hashed and claim-indexed", () => {
  const leaseSql = fs.readFileSync(
    path.join(process.cwd(), "src/db/migrations/0021_execution_leases.sql"),
    "utf8",
  );
  assert.match(
    leaseSql,
    /ADD COLUMN IF NOT EXISTS "available_at" timestamp[\s\S]*DEFAULT \(clock_timestamp\(\) AT TIME ZONE 'UTC'\) NOT NULL/,
  );
  assert.match(leaseSql, /ADD COLUMN IF NOT EXISTS "lease_owner" text/);
  assert.match(leaseSql, /ADD COLUMN IF NOT EXISTS "lease_token_hash" text/);
  assert.doesNotMatch(leaseSql, /ADD COLUMN[^\n]*"lease_token"\s/);
  assert.match(
    leaseSql,
    /ADD COLUMN IF NOT EXISTS "lease_expires_at" timestamp/,
  );
  assert.match(
    leaseSql,
    /ADD COLUMN IF NOT EXISTS "claim_count" integer DEFAULT 0 NOT NULL/,
  );
  assert.match(
    leaseSql,
    /execution_runs_queued_claim_idx[\s\S]*"tenant_key", "operation", "mode", "available_at"[\s\S]*WHERE "status" = 'queued'/,
  );
  assert.match(
    leaseSql,
    /execution_runs_running_expired_lease_idx[\s\S]*"lease_expires_at"[\s\S]*WHERE "status" = 'running'/,
  );
  assert.doesNotMatch(leaseSql, /\b(DROP|TRUNCATE)\b/i);

  assertTrackedExecutionMigration("0021_execution_leases.sql");
});

test("worker mutations use DB-clock leases, exact scopes and atomic events", () => {
  const source = fs.readFileSync(
    path.join(process.cwd(), "src/lib/execution-control/postgres.ts"),
    "utf8",
  );
  assert.match(source, /SELECT \$\{databaseUtcClock\(\)\} AS "now"/);
  assert.match(source, /FOR UPDATE OF r SKIP LOCKED/);
  assert.match(source, /r\."available_at" <= lease_clock\."now"/);
  assert.match(source, /r\."lease_expires_at" <= lease_clock\."now"/);
  assert.match(source, /r\."tenant_key" = \$\{tenantKey\}/);
  assert.match(source, /r\."operation" = \$\{operation\}/);
  assert.match(source, /r\."mode" = \$\{mode\}/);
  assert.match(source, /r\."lease_token_hash" = \$\{tokenHash\}/);
  assert.match(source, /r\."lease_expires_at" > lease_clock\."now"/);
  assert.match(source, /'run\.claimed'/);
  assert.match(source, /'run\.lease_recovered'/);
  assert.match(source, /'run\.retry_scheduled'/);
  assert.match(source, /requiredText\(input\.eventType, "event type"\)/);
  assert.match(source, /"lease_token_hash" = NULL/);
  assert.match(source, /AND "lease_token_hash" IS NULL/);
  assert.match(source, /must not contain the bearer lease token/);
  assert.doesNotMatch(source, /run\.heartbeat/);
});

test("reconciliation lookups apply their complete scopes in one query", () => {
  const source = fs.readFileSync(
    path.join(process.cwd(), "src/lib/execution-control/postgres.ts"),
    "utf8",
  );
  const runStart = source.indexOf("async getRunByIdForScope(");
  const runEnd = source.indexOf("async getRunByAggregate(", runStart);
  assert.notEqual(runStart, -1);
  assert.notEqual(runEnd, -1);
  const runLookup = source.slice(runStart, runEnd);

  assert.match(runLookup, /\.where\(\s*and\(/);
  assert.match(runLookup, /eq\(runsTable\.id, runId\)/);
  assert.match(runLookup, /eq\(runsTable\.tenantKey, tenantKey\)/);
  assert.match(runLookup, /eq\(runsTable\.operation, operation\)/);
  assert.match(runLookup, /eq\(runsTable\.mode, mode\)/);

  const start = source.indexOf("async getRunByAggregateForScope(");
  const end = source.indexOf("async listEvents(", start);
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  const scopedLookup = source.slice(start, end);

  assert.match(scopedLookup, /\.where\(\s*and\(/);
  assert.match(scopedLookup, /eq\(runsTable\.tenantKey, tenantKey\)/);
  assert.match(scopedLookup, /eq\(runsTable\.operation, operation\)/);
  assert.match(scopedLookup, /eq\(runsTable\.mode, mode\)/);
  assert.match(scopedLookup, /eq\(runsTable\.aggregateType, aggregateType\)/);
  assert.match(scopedLookup, /eq\(runsTable\.aggregateId, aggregateId\)/);
});

test("lease token hashing is deterministic and never returns the bearer", () => {
  const token = "lease-token-visible-once";
  const digest = hashExecutionLeaseToken(token);
  assert.equal(digest.length, 64);
  assert.match(digest, /^[a-f0-9]{64}$/);
  assert.equal(digest, hashExecutionLeaseToken(token));
  assert.notEqual(digest, token);
  assert.notEqual(digest, hashExecutionLeaseToken(`${token}-other`));
});

test("command fingerprints canonicalize JSON and reject immutable drift", () => {
  const base = {
    tenantKey: " TENANT-A ",
    aggregateType: " contract.run ",
    aggregateId: " aggregate-1 ",
    operation: " Example.Sync ",
    mode: "canary" as const,
    input: {
      filters: { country: "ES", categories: ["health", "beauty"] },
      target: 20,
    },
    metadata: {
      executionHandlerVersion: 1,
      adapter: { name: "example", version: 2 },
    },
  };
  const fingerprint = executionCommandFingerprint(base);
  assert.match(fingerprint, /^[a-f0-9]{64}$/);
  assert.equal(
    fingerprint,
    executionCommandFingerprint({
      ...base,
      tenantKey: "tenant-a",
      aggregateType: "contract.run",
      aggregateId: "aggregate-1",
      operation: "example.sync",
      input: {
        target: 20,
        filters: { categories: ["health", "beauty"], country: "ES" },
      },
      metadata: {
        adapter: { version: 2, name: "example" },
        executionHandlerVersion: 1,
      },
    }),
  );
  assert.equal(
    fingerprint,
    executionCommandFingerprint({
      ...base,
      traceId: "ignored-trace",
      now: new Date("2026-07-16T00:00:00.000Z"),
    }),
  );
  assert.notEqual(
    fingerprint,
    executionCommandFingerprint({
      ...base,
      input: { ...base.input, target: 21 },
    }),
  );
  assert.notEqual(
    fingerprint,
    executionCommandFingerprint({ ...base, mode: "active" }),
  );
  assert.notEqual(
    fingerprint,
    executionCommandFingerprint({
      ...base,
      metadata: { ...base.metadata, executionHandlerVersion: 2 },
    }),
  );

  const conflict = new ExecutionCommandConflictError();
  assert.equal(conflict.code, EXECUTION_COMMAND_CONFLICT_CODE);
  assert.equal(conflict.code, "execution_command_conflict");
  assert.doesNotMatch(conflict.message, /aggregate-1|tenant-a|[a-f0-9]{64}/i);
});

test("effect conflicts are stable and effect rows map to bounded contracts", () => {
  const conflict = new ExecutionEffectConflictError();
  assert.equal(conflict.code, EXECUTION_EFFECT_CONFLICT_CODE);
  assert.equal(conflict.code, "execution_effect_conflict");
  assert.doesNotMatch(conflict.message, /[a-f0-9]{64}|payload|receipt/i);

  const createdAt = new Date("2026-07-16T10:00:00.000Z");
  const effect = executionEffectFromDatabaseRow({
    id: "xeff_1",
    runId: "xrun_1",
    stepKey: "provider.start",
    effectKey: "operation:run:xrun_1:step:provider.start:v2",
    handlerVersion: 2,
    definitionVersion: 1,
    capability: "provider.workflow.start",
    safety: "target_idempotency",
    payloadSchemaVersion: 1,
    payloadFingerprint: "a".repeat(64),
    policyFingerprint: "b".repeat(64),
    receiptSchemaVersion: 1,
    status: "succeeded",
    attemptCount: 1,
    reconcileCount: 0,
    receipt: { providerId: "provider-1" },
    receiptFingerprint: "c".repeat(64),
    lastErrorCode: null,
    availableAt: createdAt,
    lastAttemptAt: createdAt,
    lastDeadlineAt: new Date("2026-07-16T10:01:00.000Z"),
    finishedAt: new Date("2026-07-16T10:00:01.000Z"),
    createdAt,
    updatedAt: new Date("2026-07-16T10:00:01.000Z"),
  });
  assert.equal(effect.status, "succeeded");
  assert.equal(effect.attemptCount, 1);
  assert.deepEqual(effect.receipt, { providerId: "provider-1" });
  assert.equal(effect.createdAt, createdAt.toISOString());
});

test("repository uses atomic CTE receipts for create and transition", () => {
  const source = fs.readFileSync(
    path.join(process.cwd(), "src/lib/execution-control/postgres.ts"),
    "utf8",
  );

  assert.match(
    source,
    /WITH inserted_run AS \([\s\S]*INSERT INTO "execution_runs"[\s\S]*INSERT INTO "execution_events"/,
  );
  assert.match(source, /'run\.created'/);
  assert.match(
    source,
    /both the legacy and tenant-aware unique indexes coexist/,
  );
  assert.match(source, /ON CONFLICT DO NOTHING/);
  assert.match(source, /normalizedOperation\(input\.operation\)/);
  assert.match(
    source,
    /INSERT INTO "execution_runs"[\s\S]*"command_fingerprint"[\s\S]*\$\{commandFingerprint\}/,
  );
  assert.match(source, /row\.commandFingerprint !== input\.commandFingerprint/);
  assert.match(source, /throw new ExecutionCommandConflictError\(\)/);
  assert.match(
    source,
    /"command_fingerprint" IS NULL[\s\S]*"mode" = \$\{input\.mode\}[\s\S]*"input" IS NOT DISTINCT FROM[\s\S]*"metadata" =/,
  );
  assert.match(
    source,
    /WITH transition_clock AS \([\s\S]*transitioned_run AS \([\s\S]*UPDATE "execution_runs"[\s\S]*INSERT INTO "execution_events"/,
  );
  assert.match(source, /input\.expectedStatus/);
  assert.match(source, /claimLegacyIdempotencyWinner/);
  assert.match(
    source,
    /UPDATE "execution_runs"[\s\S]*"tenant_key" IS NULL[\s\S]*input"->>'slug'[\s\S]*metadata"->>'slug'/,
  );
  assert.doesNotMatch(source, /\.transaction\(/);
});

test("database rows map to stable execution-control contracts", () => {
  const createdAt = new Date("2026-07-15T10:00:00.000Z");
  const updatedAt = new Date("2026-07-15T10:01:00.000Z");
  const run = executionRunFromDatabaseRow({
    id: "xrun_1",
    tenantKey: "hospital-capilar",
    idempotencyKey: "hospital-capilar:ds-1:shadow:v1",
    aggregateType: "partnership_search",
    aggregateId: "ds-1",
    operation: "partners.discovery",
    mode: "shadow",
    status: "partial",
    currentStep: "persist",
    traceId: "trace-1",
    input: { targetVolume: 40 },
    output: { accepted: 18 },
    error: null,
    metadata: { slug: "hospital-capilar" },
    commandFingerprint: "a".repeat(64),
    availableAt: createdAt,
    leaseOwner: null,
    leaseTokenHash: null,
    leaseExpiresAt: null,
    claimCount: 2,
    handlerAttempt: 1,
    cancelRequestId: null,
    cancelRequestedAt: null,
    cancelActorType: null,
    cancelActorId: null,
    cancelReasonCode: null,
    cancelAcknowledgedAt: null,
    createdAt,
    startedAt: createdAt,
    finishedAt: updatedAt,
    updatedAt,
  });

  assert.deepEqual(run, {
    id: "xrun_1",
    tenantKey: "hospital-capilar",
    idempotencyKey: "hospital-capilar:ds-1:shadow:v1",
    aggregateType: "partnership_search",
    aggregateId: "ds-1",
    operation: "partners.discovery",
    mode: "shadow",
    status: "partial",
    currentStep: "persist",
    traceId: "trace-1",
    input: { targetVolume: 40 },
    output: { accepted: 18 },
    metadata: { slug: "hospital-capilar" },
    commandFingerprint: "a".repeat(64),
    availableAt: createdAt.toISOString(),
    claimCount: 2,
    handlerAttempt: 1,
    createdAt: createdAt.toISOString(),
    startedAt: createdAt.toISOString(),
    finishedAt: updatedAt.toISOString(),
    updatedAt: updatedAt.toISOString(),
  });

  const step = executionStepFromDatabaseRow({
    id: "step_1",
    runId: "xrun_1",
    stepKey: "instagram",
    status: "completed",
    attempt: 1,
    input: null,
    output: { accepted: 10 },
    error: null,
    createdAt,
    startedAt: createdAt,
    finishedAt: updatedAt,
    updatedAt,
  });
  assert.equal(
    step.output && (step.output as { accepted: number }).accepted,
    10,
  );
  assert.equal(step.createdAt, createdAt.toISOString());

  const event = executionEventFromDatabaseRow({
    sequence: 7,
    id: "xevt_1",
    runId: "xrun_1",
    aggregateType: "partnership_search",
    aggregateId: "ds-1",
    traceId: "trace-1",
    type: "search.persisted",
    ts: updatedAt,
    data: { count: 18 },
  });
  assert.deepEqual(event, {
    sequence: 7,
    id: "xevt_1",
    runId: "xrun_1",
    aggregateType: "partnership_search",
    aggregateId: "ds-1",
    traceId: "trace-1",
    type: "search.persisted",
    ts: updatedAt.toISOString(),
    data: { count: 18 },
  });
});

test("run transitions are monotonic and partial is terminal", () => {
  assert.equal(canTransitionExecutionRun("queued", "queued"), true);
  assert.equal(canTransitionExecutionRun("queued", "running"), true);
  assert.equal(canTransitionExecutionRun("running", "waiting_approval"), true);
  assert.equal(canTransitionExecutionRun("waiting_approval", "running"), true);
  assert.equal(canTransitionExecutionRun("running", "queued"), false);
  assert.equal(canTransitionExecutionRun("completed", "running"), false);
  assert.equal(canTransitionExecutionRun("partial", "running"), false);
  assert.equal(canTransitionExecutionRun("failed", "failed"), false);
});
