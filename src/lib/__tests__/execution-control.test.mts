import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import {
  canTransitionExecutionRun,
  executionEventFromDatabaseRow,
  executionRunFromDatabaseRow,
  executionStepFromDatabaseRow,
} from "../execution-control/postgres";

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

  const localMigrator = fs.readFileSync(
    path.join(process.cwd(), "scripts/migrate-local.mjs"),
    "utf8",
  );
  assert.match(localMigrator, /0019_execution_control\.sql/);
  assert.match(localMigrator, /0020_execution_tenant_scope\.sql/);
  assert.match(
    localMigrator,
    /for \(const migration of EXECUTION_CONTROL_MIGRATIONS\)/,
  );
  assert.match(localMigrator, /sql\.file\(migration\)/);
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
  assert.match(
    source,
    /WITH transitioned_run AS \([\s\S]*UPDATE "execution_runs"[\s\S]*INSERT INTO "execution_events"/,
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
