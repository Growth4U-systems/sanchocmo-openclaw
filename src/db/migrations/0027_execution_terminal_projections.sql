-- SAN-480: durable, generic terminal projection outbox.
--
-- The row is deliberately identity-only. Command input, terminal output,
-- metadata, provider receipts and error text remain on their authoritative
-- tables and are never copied into this delivery queue.

CREATE TABLE IF NOT EXISTS "execution_terminal_projections" (
  "run_id" text PRIMARY KEY
    REFERENCES "execution_runs"("id") ON DELETE RESTRICT,
  "tenant_key" text NOT NULL,
  "operation" text NOT NULL,
  "mode" text NOT NULL,
  "terminal_status" text NOT NULL,
  "state" text NOT NULL DEFAULT 'pending',
  "available_at" timestamp NOT NULL
    DEFAULT (clock_timestamp() AT TIME ZONE 'UTC'),
  "claim_count" integer NOT NULL DEFAULT 0,
  "lease_owner" text,
  "lease_token_hash" text,
  "lease_expires_at" timestamp,
  "last_attempt_at" timestamp,
  "last_error_code" text,
  "projected_at" timestamp,
  "created_at" timestamp NOT NULL
    DEFAULT (clock_timestamp() AT TIME ZONE 'UTC'),
  "updated_at" timestamp NOT NULL
    DEFAULT (clock_timestamp() AT TIME ZONE 'UTC'),

  CONSTRAINT "execution_terminal_projections_mode_check"
    CHECK ("mode" IN ('canary', 'active')),
  CONSTRAINT "execution_terminal_projections_terminal_status_check"
    CHECK ("terminal_status" IN (
      'completed', 'partial', 'failed', 'cancelled'
    )),
  CONSTRAINT "execution_terminal_projections_state_check"
    CHECK ("state" IN (
      'pending', 'running', 'retry_wait', 'succeeded', 'blocked'
    )),
  CONSTRAINT "execution_terminal_projections_claim_count_check"
    CHECK ("claim_count" >= 0 AND "claim_count" <= 1000000),
  CONSTRAINT "execution_terminal_projections_scope_check"
    CHECK (
      octet_length("tenant_key") BETWEEN 1 AND 128 AND
      "tenant_key" = lower("tenant_key") AND
      "tenant_key" ~ '^[a-z0-9]([a-z0-9._-]*[a-z0-9])?$' AND
      "operation" ~ '^[a-z][a-z0-9._-]{0,127}$'
    ),
  CONSTRAINT "execution_terminal_projections_lease_shape_check"
    CHECK (
      (
        "state" = 'running' AND
        "lease_owner" IS NOT NULL AND
        "lease_token_hash" IS NOT NULL AND
        "lease_expires_at" IS NOT NULL
      ) OR (
        "state" <> 'running' AND
        "lease_owner" IS NULL AND
        "lease_token_hash" IS NULL AND
        "lease_expires_at" IS NULL
      )
    ),
  CONSTRAINT "execution_terminal_projections_lease_owner_check"
    CHECK (
      "lease_owner" IS NULL OR
      (
        octet_length("lease_owner") BETWEEN 1 AND 160 AND
        "lease_owner" !~ '[[:cntrl:]]'
      )
    ),
  CONSTRAINT "execution_terminal_projections_lease_hash_check"
    CHECK (
      "lease_token_hash" IS NULL OR
      "lease_token_hash" ~ '^[a-f0-9]{64}$'
    ),
  CONSTRAINT "execution_terminal_projections_error_code_check"
    CHECK (
      "last_error_code" IS NULL OR
      "last_error_code" ~ '^[a-z][a-z0-9._-]{0,127}$'
    ),
  CONSTRAINT "execution_terminal_projections_error_state_check"
    CHECK (
      (
        "state" IN ('retry_wait', 'blocked') AND
        "last_error_code" IS NOT NULL
      ) OR (
        "state" IN ('pending', 'succeeded') AND
        "last_error_code" IS NULL
      ) OR "state" = 'running'
    ),
  CONSTRAINT "execution_terminal_projections_attempt_shape_check"
    CHECK (
      ("claim_count" = 0 AND "last_attempt_at" IS NULL) OR
      ("claim_count" > 0 AND "last_attempt_at" IS NOT NULL)
    ),
  CONSTRAINT "execution_terminal_projections_projected_check"
    CHECK (("state" = 'succeeded') = ("projected_at" IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS "execution_terminal_projections_claim_idx"
  ON "execution_terminal_projections" (
    "tenant_key", "operation", "mode", "available_at", "created_at", "run_id"
  )
  WHERE "state" IN ('pending', 'retry_wait');

CREATE INDEX IF NOT EXISTS "execution_terminal_projections_stale_lease_idx"
  ON "execution_terminal_projections" (
    "tenant_key", "operation", "mode", "lease_expires_at"
  )
  WHERE "state" = 'running';

CREATE INDEX IF NOT EXISTS "execution_terminal_projections_runnable_scope_idx"
  ON "execution_terminal_projections" ("operation", "mode", "tenant_key")
  WHERE "state" IN ('pending', 'retry_wait', 'running');

CREATE INDEX IF NOT EXISTS "execution_terminal_projections_blocked_idx"
  ON "execution_terminal_projections" (
    "updated_at", "operation", "mode", "tenant_key"
  )
  WHERE "state" = 'blocked';

CREATE INDEX IF NOT EXISTS "execution_terminal_projections_blocked_scope_idx"
  ON "execution_terminal_projections" ("operation", "mode", "tenant_key")
  WHERE "state" = 'blocked';

-- Expand/upgrade safety: every already-terminal managed run receives the same
-- compact obligation. The primary key preserves any existing delivery state
-- during an explicitly reviewed legacy transition; tracked deploys do not
-- replay this file.
INSERT INTO "execution_terminal_projections" (
  "run_id", "tenant_key", "operation", "mode", "terminal_status",
  "state", "available_at", "claim_count", "created_at", "updated_at"
)
SELECT
  r."id", r."tenant_key", r."operation", r."mode", r."status",
  'pending', COALESCE(
    r."finished_at", r."updated_at",
    clock_timestamp() AT TIME ZONE 'UTC'
  ),
  0, COALESCE(
    r."finished_at", r."updated_at",
    clock_timestamp() AT TIME ZONE 'UTC'
  ),
  clock_timestamp() AT TIME ZONE 'UTC'
FROM "execution_runs" AS r
WHERE r."mode" IN ('canary', 'active')
  AND r."status" IN ('completed', 'partial', 'failed', 'cancelled')
  AND r."metadata"->>'authority' = 'execution_ledger_v2'
ON CONFLICT ("run_id") DO NOTHING;
