-- SAN-480: contract the execution Ledger onto its tenant-scoped identity.
--
-- Every current writer supplies tenant_key. Re-run the expand backfill before
-- enforcing NOT NULL so installations that skipped 0020 still converge. The
-- legacy global unique index is intentionally removed: keeping it would make
-- otherwise independent tenants conflict on the same aggregate/command tuple.

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

ALTER TABLE "execution_runs"
  ALTER COLUMN "tenant_key" SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "execution_runs_tenant_aggregate_idempotency_idx"
  ON "execution_runs" (
    "tenant_key", "aggregate_type", "aggregate_id", "operation", "idempotency_key"
  );

DROP INDEX IF EXISTS "execution_runs_aggregate_idempotency_idx";
