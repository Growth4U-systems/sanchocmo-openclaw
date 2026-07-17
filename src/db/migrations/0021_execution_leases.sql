-- SAN-480: durable, database-clock worker leases for executable Ledger runs.
-- This additive immutable file is applied once. Shadow evidence remains
-- unclaimable.

ALTER TABLE "execution_runs"
  ADD COLUMN IF NOT EXISTS "available_at" timestamp
    DEFAULT (clock_timestamp() AT TIME ZONE 'UTC') NOT NULL,
  ADD COLUMN IF NOT EXISTS "lease_owner" text,
  ADD COLUMN IF NOT EXISTS "lease_token_hash" text,
  ADD COLUMN IF NOT EXISTS "lease_expires_at" timestamp,
  ADD COLUMN IF NOT EXISTS "claim_count" integer DEFAULT 0 NOT NULL;

CREATE INDEX IF NOT EXISTS "execution_runs_queued_claim_idx"
  ON "execution_runs" (
    "tenant_key", "operation", "mode", "available_at", "created_at", "id"
  )
  WHERE "status" = 'queued' AND "mode" IN ('canary', 'active');

CREATE INDEX IF NOT EXISTS "execution_runs_running_expired_lease_idx"
  ON "execution_runs" (
    "tenant_key", "operation", "mode", "lease_expires_at"
  )
  WHERE "status" = 'running' AND "lease_expires_at" IS NOT NULL;
