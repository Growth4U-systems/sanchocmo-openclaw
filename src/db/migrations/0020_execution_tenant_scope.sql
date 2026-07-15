-- SAN-480: make the execution Ledger explicitly tenant-scoped before any
-- human or machine reader is exposed. Existing phase-0 rows are backfilled;
-- `system` is the deliberate scope for global/legacy smoke executions.
--
-- This is the EXPAND half of an expand/contract rollout. The column remains
-- nullable and the original idempotency index remains in place so the version
-- serving during migration (and an automatic rollback) can still write shadow
-- evidence. A later migration may enforce NOT NULL and remove the old index
-- after every writer and the rollback window are tenant-aware.

ALTER TABLE "execution_runs"
  ADD COLUMN IF NOT EXISTS "tenant_key" text;

UPDATE "execution_runs"
SET "tenant_key" = COALESCE(
  NULLIF(lower(btrim("input"->>'slug')), ''),
  NULLIF(lower(btrim("metadata"->>'slug')), ''),
  CASE
    WHEN "aggregate_type" = 'partnerships.search'
      AND strpos("aggregate_id", ':') > 1
      THEN lower(split_part("aggregate_id", ':', 1))
    ELSE 'system'
  END
)
WHERE "tenant_key" IS NULL OR btrim("tenant_key") = '';

CREATE UNIQUE INDEX IF NOT EXISTS "execution_runs_tenant_aggregate_idempotency_idx"
  ON "execution_runs" (
    "tenant_key", "aggregate_type", "aggregate_id", "operation", "idempotency_key"
  );

CREATE INDEX IF NOT EXISTS "execution_runs_tenant_created_idx"
  ON "execution_runs" ("tenant_key", "created_at" DESC, "id" DESC);

CREATE INDEX IF NOT EXISTS "execution_runs_tenant_status_created_idx"
  ON "execution_runs" ("tenant_key", "status", "created_at" DESC, "id" DESC);

CREATE INDEX IF NOT EXISTS "execution_runs_tenant_operation_status_created_idx"
  ON "execution_runs" (
    "tenant_key", "operation", "status", "created_at" DESC, "id" DESC
  );

CREATE INDEX IF NOT EXISTS "execution_runs_tenant_operation_created_idx"
  ON "execution_runs" (
    "tenant_key", "operation", "created_at" DESC, "id" DESC
  );
