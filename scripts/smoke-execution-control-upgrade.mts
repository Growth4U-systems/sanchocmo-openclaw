import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import postgres from "postgres";

function localDatabaseUrl(): string {
  const value = process.env.DATABASE_URL;
  if (!value) throw new Error("DATABASE_URL is required");
  const url = new URL(value);
  if (!["localhost", "127.0.0.1", "::1"].includes(url.hostname)) {
    throw new Error(
      "Upgrade smoke is destructive inside a temporary schema and only runs against localhost",
    );
  }
  return value;
}

function migration(name: string): string[] {
  const source = fs.readFileSync(
    path.join(process.cwd(), "src/db/migrations", name),
    "utf8",
  );
  return source
    .replace(/--.*$/gm, "")
    .split(";")
    .map((statement) => statement.trim())
    .filter(Boolean);
}

async function applyStatements(
  sql: postgres.TransactionSql,
  statements: string[],
): Promise<void> {
  for (const statement of statements) await sql.unsafe(statement);
}

async function main(): Promise<void> {
  const sql = postgres(localDatabaseUrl(), { max: 1, onnotice: () => {} });
  const schema = `execution_upgrade_${crypto.randomUUID().replaceAll("-", "")}`;
  const migrations = [
    ...migration("0019_execution_control.sql"),
    ...migration("0020_execution_tenant_scope.sql"),
    ...migration("0021_execution_leases.sql"),
    ...migration("0022_execution_command_fingerprint.sql"),
    ...migration("0023_execution_drain.sql"),
    ...migration("0024_execution_tenant_contract.sql"),
    ...migration("0025_execution_effects.sql"),
    ...migration("0026_execution_cancellation.sql"),
    ...migration("0027_execution_terminal_projections.sql"),
    ...migration("0028_execution_run_blocking.sql"),
    ...migration("0029_leads_search_projections.sql"),
    ...migration("0030_execution_utc_timestamps.sql"),
    ...migration("0031_execution_origin_lookup.sql"),
    ...migration("0032_execution_origin_tombstones.sql"),
    ...migration("0033_execution_origin_command_claim.sql"),
  ];

  try {
    await sql.unsafe(`CREATE SCHEMA "${schema}"`);
    await sql.begin(async (tx) => {
      await tx.unsafe(`SET LOCAL search_path TO "${schema}", public`);
      // Exact phase-0 execution_runs shape and conflict target, before tenant.
      await tx.unsafe(`
        CREATE TABLE "execution_runs" (
          "id" text PRIMARY KEY NOT NULL,
          "idempotency_key" text NOT NULL,
          "aggregate_type" text NOT NULL,
          "aggregate_id" text NOT NULL,
          "operation" text NOT NULL,
          "mode" text DEFAULT 'shadow' NOT NULL,
          "status" text DEFAULT 'queued' NOT NULL,
          "current_step" text,
          "trace_id" text,
          "input" jsonb,
          "output" jsonb,
          "error" text,
          "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
          "created_at" timestamp DEFAULT now() NOT NULL,
          "started_at" timestamp,
          "finished_at" timestamp,
          "updated_at" timestamp DEFAULT now() NOT NULL
        )
      `);
      await tx.unsafe(`
        CREATE UNIQUE INDEX "execution_runs_aggregate_idempotency_idx"
        ON "execution_runs" (
          "aggregate_type", "aggregate_id", "operation", "idempotency_key"
        )
      `);
      await tx.unsafe(`
        INSERT INTO "execution_runs" (
          "id", "idempotency_key", "aggregate_type", "aggregate_id",
          "operation", "input", "metadata"
        ) VALUES
          ('legacy-input', 'k1', 'partnerships.search', 'growth4u:ds-1',
           'partnerships.discovery', '{"slug":"growth4u"}'::jsonb, '{}'::jsonb),
          ('legacy-aggregate', 'k2', 'partnerships.search', 'hospital-capilar:ds-2',
           'partnerships.discovery', NULL, '{}'::jsonb),
          ('legacy-system', 'k3', 'system.smoke', 'smoke:3',
           'verify', NULL, '{}'::jsonb)
      `);
      await applyStatements(tx, migrations);
    });

    // Re-running the curated migrations must remain safe after backfill.
    await sql.begin(async (tx) => {
      await tx.unsafe(`SET LOCAL search_path TO "${schema}", public`);
      await applyStatements(tx, migrations);
    });

    await sql.begin(async (tx) => {
      await tx.unsafe(`SET LOCAL search_path TO "${schema}", public`);
      const rows = await tx<{ id: string; tenant_key: string | null }[]>`
        SELECT "id", "tenant_key"
        FROM "execution_runs"
        WHERE "id" LIKE 'legacy-%'
        ORDER BY "id"
      `;
      assert.deepEqual(
        [...rows],
        [
          { id: "legacy-aggregate", tenant_key: "hospital-capilar" },
          { id: "legacy-input", tenant_key: "growth4u" },
          { id: "legacy-system", tenant_key: "system" },
        ],
      );

      const [column] = await tx<{ is_nullable: string }[]>`
        SELECT "is_nullable"
        FROM information_schema.columns
        WHERE table_schema = ${schema}
          AND table_name = 'execution_runs'
          AND column_name = 'tenant_key'
      `;
      assert.equal(column?.is_nullable, "NO");

      const indexes = await tx<{ indexname: string }[]>`
        SELECT indexname
        FROM pg_indexes
        WHERE schemaname = ${schema}
          AND tablename = 'execution_runs'
      `;
      const names = new Set(indexes.map((index) => index.indexname));
      assert.equal(
        names.has("execution_runs_aggregate_idempotency_idx"),
        false,
      );
      assert.ok(names.has("execution_runs_tenant_aggregate_idempotency_idx"));
      assert.ok(names.has("execution_runs_tenant_operation_created_idx"));
      assert.ok(names.has("execution_runs_queued_claim_idx"));
      assert.ok(names.has("execution_runs_running_expired_lease_idx"));
      assert.ok(names.has("execution_runs_runnable_scope_idx"));
      assert.ok(names.has("execution_runs_blocked_scope_idx"));

      const [leaseColumns] = await tx<
        {
          available_at: Date;
          lease_owner: string | null;
          lease_token_hash: string | null;
          lease_expires_at: Date | null;
          claim_count: number;
          handler_attempt: number;
        }[]
      >`
        SELECT "available_at", "lease_owner", "lease_token_hash",
               "lease_expires_at", "claim_count", "handler_attempt"
        FROM "execution_runs"
        WHERE "id" = 'legacy-input'
      `;
      assert.ok(leaseColumns?.available_at instanceof Date);
      assert.equal(leaseColumns?.lease_owner, null);
      assert.equal(leaseColumns?.lease_token_hash, null);
      assert.equal(leaseColumns?.lease_expires_at, null);
      assert.equal(leaseColumns?.claim_count, 0);
      assert.equal(leaseColumns?.handler_attempt, 0);

      const [fingerprintColumn] = await tx<
        {
          is_nullable: string;
          command_fingerprint: string | null;
        }[]
      >`
        SELECT columns."is_nullable", runs."command_fingerprint"
        FROM information_schema.columns AS columns
        CROSS JOIN "execution_runs" AS runs
        WHERE columns.table_schema = ${schema}
          AND columns.table_name = 'execution_runs'
          AND columns.column_name = 'command_fingerprint'
          AND runs."id" = 'legacy-input'
      `;
      assert.equal(fingerprintColumn?.is_nullable, "YES");
      assert.equal(fingerprintColumn?.command_fingerprint, null);

      const effectColumns = await tx<{ column_name: string }[]>`
        SELECT "column_name"
        FROM information_schema.columns
        WHERE table_schema = ${schema}
          AND table_name = 'execution_effects'
      `;
      const effectColumnNames = new Set(
        effectColumns.map((effectColumn) => effectColumn.column_name),
      );
      assert.ok(effectColumnNames.has("payload_fingerprint"));
      assert.ok(effectColumnNames.has("policy_fingerprint"));
      assert.ok(effectColumnNames.has("receipt"));
      assert.equal(effectColumnNames.has("payload"), false);

      const effectIndexes = await tx<{ indexname: string }[]>`
        SELECT indexname
        FROM pg_indexes
        WHERE schemaname = ${schema}
          AND tablename = 'execution_effects'
      `;
      const effectIndexNames = new Set(
        effectIndexes.map((index) => index.indexname),
      );
      assert.ok(effectIndexNames.has("execution_effects_run_step_unique"));
      assert.ok(effectIndexNames.has("execution_effects_effect_key_unique"));
      assert.ok(effectIndexNames.has("execution_effects_retry_idx"));

      const cancellationColumns = await tx<
        {
          column_name: string;
        }[]
      >`
        SELECT "column_name"
        FROM information_schema.columns
        WHERE table_schema = ${schema}
          AND table_name = 'execution_runs'
          AND column_name LIKE 'cancel_%'
      `;
      const cancellationColumnNames = new Set(
        cancellationColumns.map((column) => column.column_name),
      );
      assert.deepEqual(
        cancellationColumnNames,
        new Set([
          "cancel_request_id",
          "cancel_requested_at",
          "cancel_actor_type",
          "cancel_actor_id",
          "cancel_reason_code",
          "cancel_acknowledged_at",
        ]),
      );
      assert.ok(names.has("execution_runs_cancellation_requested_idx"));

      const blockColumns = await tx<
        {
          column_name: string;
          is_nullable: string;
        }[]
      >`
        SELECT "column_name", "is_nullable"
        FROM information_schema.columns
        WHERE table_schema = ${schema}
          AND table_name = 'execution_runs'
          AND column_name IN ('blocked_reason_code', 'blocked_at')
        ORDER BY "column_name"
      `;
      assert.deepEqual(
        [...blockColumns],
        [
          { column_name: "blocked_at", is_nullable: "YES" },
          { column_name: "blocked_reason_code", is_nullable: "YES" },
        ],
      );
      const blockConstraints = await tx<{ conname: string }[]>`
        SELECT constraint_row."conname"
        FROM pg_constraint AS constraint_row
        JOIN pg_class AS table_row
          ON table_row."oid" = constraint_row."conrelid"
        JOIN pg_namespace AS namespace_row
          ON namespace_row."oid" = table_row."relnamespace"
        WHERE namespace_row."nspname" = ${schema}
          AND table_row."relname" = 'execution_runs'
          AND constraint_row."conname" IN (
            'execution_runs_status_check',
            'execution_runs_block_reason_code_check',
            'execution_runs_block_shape_check'
          )
      `;
      assert.deepEqual(
        new Set(blockConstraints.map((constraint) => constraint.conname)),
        new Set([
          "execution_runs_status_check",
          "execution_runs_block_reason_code_check",
          "execution_runs_block_shape_check",
        ]),
      );

      const originTables = await tx<{ table_name: string }[]>`
        SELECT "table_name"
        FROM information_schema.tables
        WHERE table_schema = ${schema}
          AND table_name IN ('execution_origins', 'execution_run_origins')
        ORDER BY "table_name"
      `;
      assert.deepEqual(
        originTables.map(({ table_name }) => table_name),
        ["execution_origins", "execution_run_origins"],
      );
      const originIndexes = await tx<{ indexname: string }[]>`
        SELECT "indexname"
        FROM pg_indexes
        WHERE schemaname = ${schema}
          AND indexname IN (
            'execution_runs_id_tenant_idx',
            'execution_origins_cancelled_idx',
            'execution_run_origins_root_run_idx'
          )
      `;
      assert.deepEqual(
        new Set(originIndexes.map(({ indexname }) => indexname)),
        new Set([
          "execution_runs_id_tenant_idx",
          "execution_origins_cancelled_idx",
          "execution_run_origins_root_run_idx",
        ]),
      );
      const originCommandColumns = await tx<
        { column_name: string; is_nullable: string }[]
      >`
        SELECT "column_name", "is_nullable"
        FROM information_schema.columns
        WHERE table_schema = ${schema}
          AND table_name = 'execution_origins'
          AND column_name IN (
            'command_operation', 'command_fingerprint', 'command_claimed_at'
          )
        ORDER BY "column_name"
      `;
      assert.deepEqual(
        [...originCommandColumns],
        [
          { column_name: "command_claimed_at", is_nullable: "YES" },
          { column_name: "command_fingerprint", is_nullable: "YES" },
          { column_name: "command_operation", is_nullable: "YES" },
        ],
      );
      const originCommandConstraints = await tx<{ conname: string }[]>`
        SELECT constraint_row."conname"
        FROM pg_constraint AS constraint_row
        JOIN pg_class AS table_row
          ON table_row."oid" = constraint_row."conrelid"
        JOIN pg_namespace AS namespace_row
          ON namespace_row."oid" = table_row."relnamespace"
        WHERE namespace_row."nspname" = ${schema}
          AND table_row."relname" = 'execution_origins'
          AND constraint_row."conname" IN (
            'execution_origins_command_operation_check',
            'execution_origins_command_fingerprint_check',
            'execution_origins_command_claim_shape_check'
          )
      `;
      assert.deepEqual(
        new Set(
          originCommandConstraints.map((constraint) => constraint.conname),
        ),
        new Set([
          "execution_origins_command_operation_check",
          "execution_origins_command_fingerprint_check",
          "execution_origins_command_claim_shape_check",
        ]),
      );

      // `tenant_key IS_NULLABLE = NO` above is the contract that rejects
      // pre-tenant writers. Avoid intentionally aborting this verification
      // transaction with a failing INSERT.
    });

    console.log(
      JSON.stringify({
        ok: true,
        backfill: true,
        rerunnable: true,
        commandFingerprintColumn: true,
        executionEffects: true,
        executionCancellation: true,
        executionRunBlocking: true,
        executionOriginTombstones: true,
        executionOriginCommandClaim: true,
        rawEffectPayloadStored: false,
        legacyWriterRejectedBySchema: true,
        tenantScopedIndexOnly: true,
      }),
    );
  } finally {
    await sql.unsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await sql.end({ timeout: 5 });
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
