-- SAN-480: authoritative parent/child registration and monotonic Stop.
--
-- `execution_runs.metadata.executionOrigin` remains diagnostic only. A child
-- belongs to a root exclusively when it is registered in
-- `execution_run_origins` by the trusted repository API. The origin row is the
-- serialization gate: child creation locks it with a no-op upsert, while Stop
-- writes the first cancellation receipt once and never clears it.

CREATE UNIQUE INDEX IF NOT EXISTS "execution_runs_id_tenant_idx"
  ON "execution_runs" ("id", "tenant_key");

CREATE TABLE IF NOT EXISTS "execution_origins" (
  "tenant_key" text NOT NULL,
  "kind" text NOT NULL,
  "parent_agent_run_id" text NOT NULL,
  "cancel_request_id" text,
  "cancel_requested_at" timestamp,
  "cancel_actor_type" text,
  "cancel_actor_id" text,
  "cancel_reason_code" text,
  "created_at" timestamp NOT NULL
    DEFAULT (clock_timestamp() AT TIME ZONE 'UTC'),
  "updated_at" timestamp NOT NULL
    DEFAULT (clock_timestamp() AT TIME ZONE 'UTC'),
  CONSTRAINT "execution_origins_pkey"
    PRIMARY KEY ("tenant_key", "kind", "parent_agent_run_id"),
  CONSTRAINT "execution_origins_kind_check"
    CHECK ("kind" = 'mc_chat_parent_run'),
  CONSTRAINT "execution_origins_parent_agent_run_id_check"
    CHECK (
      "parent_agent_run_id" ~ '^[A-Za-z0-9][A-Za-z0-9._:@/+~-]{0,159}$'
    ),
  CONSTRAINT "execution_origins_cancel_request_id_check"
    CHECK (
      "cancel_request_id" IS NULL OR
      "cancel_request_id" ~ '^([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}|cancel_[a-f0-9]{32,64})$'
    ),
  CONSTRAINT "execution_origins_cancel_actor_type_check"
    CHECK (
      "cancel_actor_type" IS NULL OR
      "cancel_actor_type" IN ('user', 'service', 'system')
    ),
  CONSTRAINT "execution_origins_cancel_actor_id_check"
    CHECK (
      "cancel_actor_id" IS NULL OR
      "cancel_actor_id" ~ '^[A-Za-z0-9][A-Za-z0-9._:@-]{0,127}$'
    ),
  CONSTRAINT "execution_origins_cancel_reason_code_check"
    CHECK (
      "cancel_reason_code" IS NULL OR
      "cancel_reason_code" IN (
        'user_requested', 'superseded', 'invalid_command', 'policy_blocked',
        'operator_intervention', 'system_shutdown'
      )
    ),
  CONSTRAINT "execution_origins_cancellation_shape_check"
    CHECK (
      (
        "cancel_request_id" IS NULL AND
        "cancel_requested_at" IS NULL AND
        "cancel_actor_type" IS NULL AND
        "cancel_actor_id" IS NULL AND
        "cancel_reason_code" IS NULL
      ) OR (
        "cancel_request_id" IS NOT NULL AND
        "cancel_requested_at" IS NOT NULL AND
        "cancel_actor_type" IS NOT NULL AND
        "cancel_actor_id" IS NOT NULL AND
        "cancel_reason_code" IS NOT NULL
      )
    )
);

CREATE INDEX IF NOT EXISTS "execution_origins_cancelled_idx"
  ON "execution_origins" (
    "tenant_key", "cancel_requested_at", "parent_agent_run_id"
  )
  WHERE "cancel_request_id" IS NOT NULL;

CREATE TABLE IF NOT EXISTS "execution_run_origins" (
  "run_id" text PRIMARY KEY,
  "tenant_key" text NOT NULL,
  "kind" text NOT NULL,
  "parent_agent_run_id" text NOT NULL,
  "created_at" timestamp NOT NULL
    DEFAULT (clock_timestamp() AT TIME ZONE 'UTC'),
  CONSTRAINT "execution_run_origins_kind_check"
    CHECK ("kind" = 'mc_chat_parent_run'),
  CONSTRAINT "execution_run_origins_run_tenant_fk"
    FOREIGN KEY ("run_id", "tenant_key")
    REFERENCES "execution_runs" ("id", "tenant_key")
    ON DELETE CASCADE,
  CONSTRAINT "execution_run_origins_origin_fk"
    FOREIGN KEY ("tenant_key", "kind", "parent_agent_run_id")
    REFERENCES "execution_origins" (
      "tenant_key", "kind", "parent_agent_run_id"
    )
    ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS "execution_run_origins_root_run_idx"
  ON "execution_run_origins" (
    "tenant_key", "kind", "parent_agent_run_id", "run_id"
  );
