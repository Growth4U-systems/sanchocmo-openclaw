import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  EXECUTION_CANCELLATION_CONFLICT_CODE,
  ExecutionCancellationConflictError,
} from "../execution-control/types";
import { executionControlMigrations } from "../../../scripts/lib/execution-control-migration-set.mjs";

test("cancellation migration is bounded, closed and tracked", () => {
  const migration = fs.readFileSync(
    path.join(
      process.cwd(),
      "src/db/migrations/0026_execution_cancellation.sql",
    ),
    "utf8",
  );
  assert.match(migration, /ADD COLUMN IF NOT EXISTS "cancel_request_id" text/);
  assert.match(migration, /"cancel_requested_at" timestamp/);
  assert.match(migration, /"cancel_acknowledged_at" timestamp/);
  assert.match(
    migration,
    /"cancel_actor_type" IN \('user', 'service', 'system'\)/,
  );
  assert.match(
    migration,
    /"cancel_reason_code" IN \([\s\S]*'user_requested'[\s\S]*'system_shutdown'/,
  );
  assert.match(migration, /\{0,127\}/);
  assert.match(migration, /execution_runs_cancellation_requested_idx/);
  assert.doesNotMatch(migration, /(?:comment|detail|message|lease_token)"/i);
  assert.doesNotMatch(migration, /\b(?:DROP TABLE|TRUNCATE)\b/i);

  const tracked = executionControlMigrations.filter(
    (migration) =>
      migration.name === "src/db/migrations/0026_execution_cancellation.sql",
  );
  assert.equal(tracked.length, 1);
  assert.equal(tracked[0]?.id, "0026");
  assert.equal(
    tracked[0]?.path,
    path.join(
      process.cwd(),
      "src/db/migrations/0026_execution_cancellation.sql",
    ),
  );
  assert.equal(typeof tracked[0]?.inspectState, "function");
});

test("cancellation mutations are exact-scope, DB-clock and lease fenced", () => {
  const source = fs.readFileSync(
    path.join(process.cwd(), "src/lib/execution-control/postgres.ts"),
    "utf8",
  );
  for (const method of [
    "async requestRunCancellation(",
    "async acknowledgeRunCancellation(",
  ]) {
    const start = source.indexOf(method);
    assert.notEqual(start, -1);
    const end = source.indexOf("\n  async ", start + method.length);
    const body = source.slice(start, end === -1 ? undefined : end);
    assert.match(body, /SELECT \$\{databaseUtcClock\(\)\} AS "now"/);
    assert.match(body, /r\."id" = \$\{runId\}/);
    assert.match(body, /r\."tenant_key" = \$\{tenantKey\}/);
    assert.match(body, /r\."operation" = \$\{operation\}/);
    assert.match(body, /r\."mode" = \$\{mode\}/);
    assert.match(body, /INSERT INTO "execution_events"/);
  }
  const acknowledge = source.slice(
    source.indexOf("async acknowledgeRunCancellation("),
    source.indexOf(
      "\n  async claimRun(",
      source.indexOf("async acknowledgeRunCancellation("),
    ),
  );
  assert.match(acknowledge, /r\."lease_token_hash" = \$\{tokenHash\}/);
  assert.match(
    acknowledge,
    /r\."lease_expires_at" > cancellation_clock\."now"/,
  );
  assert.match(acknowledge, /'safePoint', \$\{safePoint\}::text/);
  assert.doesNotMatch(acknowledge, /'token'|'leaseToken'|\$\{input\.token\}/);

  for (const method of [
    "async transitionRun(",
    "async requeueRun(",
    "async finishRun(",
  ]) {
    const start = source.indexOf(method);
    const end = source.indexOf("\n  async ", start + method.length);
    const body = source.slice(start, end === -1 ? undefined : end);
    assert.match(body, /"cancel_requested_at" IS NULL/);
  }
});

test("cancellation conflict exposes only a stable closed code", () => {
  const conflict = new ExecutionCancellationConflictError();
  assert.equal(conflict.code, EXECUTION_CANCELLATION_CONFLICT_CODE);
  assert.equal(conflict.code, "execution_cancellation_conflict");
  assert.doesNotMatch(
    conflict.message,
    /tenant|operation|actor|reason|request[-_ ]?id|token/i,
  );
});
