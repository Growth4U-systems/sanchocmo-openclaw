-- SAN-480: cooperative cancellation for exact, tenant-scoped durable runs.
--
-- A running owner keeps its lease after cancellation is requested. It can
-- checkpoint an accepted downstream receipt and acknowledge cancellation at a
-- safe point. The request identifier makes retries idempotent without storing
-- free-form operator text or bearer credentials.

ALTER TABLE "execution_runs"
  ADD COLUMN IF NOT EXISTS "cancel_request_id" text
    CONSTRAINT "execution_runs_cancel_request_id_check" CHECK (
      "cancel_request_id" IS NULL OR
      "cancel_request_id" ~ '^([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}|cancel_[a-f0-9]{32,64})$'
    );

ALTER TABLE "execution_runs"
  ADD COLUMN IF NOT EXISTS "cancel_requested_at" timestamp;

ALTER TABLE "execution_runs"
  ADD COLUMN IF NOT EXISTS "cancel_actor_type" text
    CONSTRAINT "execution_runs_cancel_actor_type_check" CHECK (
      "cancel_actor_type" IS NULL OR
      "cancel_actor_type" IN ('user', 'service', 'system')
    );

ALTER TABLE "execution_runs"
  ADD COLUMN IF NOT EXISTS "cancel_actor_id" text
    CONSTRAINT "execution_runs_cancel_actor_id_check" CHECK (
      "cancel_actor_id" IS NULL OR
      "cancel_actor_id" ~ '^[A-Za-z0-9][A-Za-z0-9._:@-]{0,127}$'
    );

ALTER TABLE "execution_runs"
  ADD COLUMN IF NOT EXISTS "cancel_reason_code" text
    CONSTRAINT "execution_runs_cancel_reason_code_check" CHECK (
      "cancel_reason_code" IS NULL OR
      "cancel_reason_code" IN (
        'user_requested', 'superseded', 'invalid_command', 'policy_blocked',
        'operator_intervention', 'system_shutdown'
      )
    );

ALTER TABLE "execution_runs"
  ADD COLUMN IF NOT EXISTS "cancel_acknowledged_at" timestamp
    CONSTRAINT "execution_runs_cancellation_shape_check" CHECK (
    (
      "cancel_request_id" IS NULL AND
      "cancel_requested_at" IS NULL AND
      "cancel_actor_type" IS NULL AND
      "cancel_actor_id" IS NULL AND
      "cancel_reason_code" IS NULL AND
      "cancel_acknowledged_at" IS NULL
    ) OR (
      "cancel_request_id" IS NOT NULL AND
      "cancel_requested_at" IS NOT NULL AND
      "cancel_actor_type" IS NOT NULL AND
      "cancel_actor_id" IS NOT NULL AND
      "cancel_reason_code" IS NOT NULL AND
      (
        ("status" = 'running' AND "cancel_acknowledged_at" IS NULL) OR
        ("status" = 'cancelled' AND "cancel_acknowledged_at" IS NOT NULL)
      )
    )
    );

CREATE INDEX IF NOT EXISTS "execution_runs_cancellation_requested_idx"
  ON "execution_runs" (
    "tenant_key", "operation", "mode", "cancel_requested_at", "id"
  )
  WHERE "status" = 'running' AND "cancel_request_id" IS NOT NULL;
