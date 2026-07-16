-- SAN-480: durable authority for non-transactional external effects.
--
-- The raw effect payload is deliberately absent. Workers reconstruct it from
-- the immutable run command/checkpoint and compare only its SHA-256
-- fingerprint. Receipts are closed, bounded projections rather than provider
-- responses.

CREATE TABLE IF NOT EXISTS "execution_effects" (
  "id" text PRIMARY KEY,
  "run_id" text NOT NULL
    REFERENCES "execution_runs"("id") ON DELETE CASCADE,
  "step_key" text NOT NULL,
  "effect_key" text NOT NULL,
  "handler_version" integer NOT NULL,
  "definition_version" integer NOT NULL,
  "capability" text NOT NULL,
  "safety" text NOT NULL,
  "payload_schema_version" integer NOT NULL,
  "payload_fingerprint" text NOT NULL,
  "policy_fingerprint" text NOT NULL,
  "receipt_schema_version" integer NOT NULL,
  "status" text NOT NULL DEFAULT 'prepared',
  "attempt_count" integer NOT NULL DEFAULT 0,
  "reconcile_count" integer NOT NULL DEFAULT 0,
  "receipt" jsonb,
  "receipt_fingerprint" text,
  "last_error_code" text,
  "available_at" timestamp NOT NULL
    DEFAULT (clock_timestamp() AT TIME ZONE 'UTC'),
  "last_attempt_at" timestamp,
  "last_deadline_at" timestamp,
  "finished_at" timestamp,
  "created_at" timestamp NOT NULL
    DEFAULT (clock_timestamp() AT TIME ZONE 'UTC'),
  "updated_at" timestamp NOT NULL
    DEFAULT (clock_timestamp() AT TIME ZONE 'UTC'),

  CONSTRAINT "execution_effects_run_step_unique"
    UNIQUE ("run_id", "step_key"),
  CONSTRAINT "execution_effects_effect_key_unique"
    UNIQUE ("effect_key"),
  CONSTRAINT "execution_effects_status_check"
    CHECK ("status" IN (
      'prepared', 'retry_wait', 'uncertain',
      'succeeded', 'failed', 'cancelled'
    )),
  CONSTRAINT "execution_effects_safety_check"
    CHECK ("safety" IN (
      'read_only', 'target_idempotency', 'reconcile_before_replay'
    )),
  CONSTRAINT "execution_effects_attempt_check"
    CHECK ("attempt_count" >= 0 AND "reconcile_count" >= 0),
  CONSTRAINT "execution_effects_versions_check"
    CHECK (
      "handler_version" > 0 AND "definition_version" > 0 AND
      "payload_schema_version" > 0 AND "receipt_schema_version" > 0
    ),
  CONSTRAINT "execution_effects_step_key_check"
    CHECK ("step_key" ~ '^[a-z][a-z0-9._-]{0,63}$'),
  CONSTRAINT "execution_effects_effect_key_check"
    CHECK (
      octet_length("effect_key") BETWEEN 1 AND 512 AND
      "effect_key" !~ '[[:space:]]'
    ),
  CONSTRAINT "execution_effects_capability_check"
    CHECK ("capability" ~ '^[a-z][a-z0-9._-]{0,127}$'),
  CONSTRAINT "execution_effects_payload_hash_check"
    CHECK ("payload_fingerprint" ~ '^[a-f0-9]{64}$'),
  CONSTRAINT "execution_effects_policy_hash_check"
    CHECK ("policy_fingerprint" ~ '^[a-f0-9]{64}$'),
  CONSTRAINT "execution_effects_receipt_hash_check"
    CHECK (
      "receipt_fingerprint" IS NULL OR
      "receipt_fingerprint" ~ '^[a-f0-9]{64}$'
    ),
  CONSTRAINT "execution_effects_error_code_check"
    CHECK (
      "last_error_code" IS NULL OR
      "last_error_code" ~ '^[a-z][a-z0-9._-]{0,127}$'
    ),
  CONSTRAINT "execution_effects_receipt_size_check"
    CHECK (
      "receipt" IS NULL OR
      (jsonb_typeof("receipt") = 'object' AND
       octet_length("receipt"::text) <= 16384)
    ),
  CONSTRAINT "execution_effects_succeeded_receipt_check"
    CHECK (
      ("status" = 'succeeded') =
      ("receipt" IS NOT NULL AND "receipt_fingerprint" IS NOT NULL)
    )
);

CREATE INDEX IF NOT EXISTS "execution_effects_run_status_idx"
  ON "execution_effects" ("run_id", "status", "step_key");

CREATE INDEX IF NOT EXISTS "execution_effects_retry_idx"
  ON "execution_effects" ("available_at", "run_id")
  WHERE "status" IN ('retry_wait', 'uncertain');
