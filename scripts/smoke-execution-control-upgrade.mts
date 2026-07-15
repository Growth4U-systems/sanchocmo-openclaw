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
      assert.deepEqual([...rows], [
        { id: "legacy-aggregate", tenant_key: "hospital-capilar" },
        { id: "legacy-input", tenant_key: "growth4u" },
        { id: "legacy-system", tenant_key: "system" },
      ]);

      const [column] = await tx<{ is_nullable: string }[]>`
        SELECT "is_nullable"
        FROM information_schema.columns
        WHERE table_schema = ${schema}
          AND table_name = 'execution_runs'
          AND column_name = 'tenant_key'
      `;
      assert.equal(column?.is_nullable, "YES");

      const indexes = await tx<{ indexname: string }[]>`
        SELECT indexname
        FROM pg_indexes
        WHERE schemaname = ${schema}
          AND tablename = 'execution_runs'
      `;
      const names = new Set(indexes.map((index) => index.indexname));
      assert.ok(names.has("execution_runs_aggregate_idempotency_idx"));
      assert.ok(names.has("execution_runs_tenant_aggregate_idempotency_idx"));
      assert.ok(names.has("execution_runs_tenant_operation_created_idx"));

      // The old writer remains valid during deploy and automatic rollback.
      await tx.unsafe(`
        INSERT INTO "execution_runs" (
          "id", "idempotency_key", "aggregate_type", "aggregate_id", "operation"
        ) VALUES ('rollback-writer', 'old-k', 'partnerships.search',
                  'rollback:ds-4', 'partnerships.discovery')
        ON CONFLICT (
          "aggregate_type", "aggregate_id", "operation", "idempotency_key"
        ) DO NOTHING
      `);
      const [rollbackRow] = await tx<{ tenant_key: string | null }[]>`
        SELECT "tenant_key" FROM "execution_runs" WHERE "id" = 'rollback-writer'
      `;
      assert.equal(rollbackRow?.tenant_key, null);
    });

    console.log(
      JSON.stringify({
        ok: true,
        backfill: true,
        rerunnable: true,
        rollbackWriterCompatible: true,
        oldAndNewIndexesPresent: true,
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
