-- Generic durable execution ledger for staged control-plane pilots.
-- Additive and safe to apply repeatedly; no existing product data is changed.

CREATE TABLE IF NOT EXISTS "execution_runs" (
  "id" text PRIMARY KEY NOT NULL,
  "tenant_key" text,
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
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "execution_runs_mode_check"
    CHECK ("mode" IN ('shadow', 'canary', 'active')),
  CONSTRAINT "execution_runs_status_check"
    CHECK ("status" IN (
      'queued', 'running', 'waiting_approval', 'completed', 'partial', 'failed', 'cancelled'
    )),
  CONSTRAINT "execution_runs_metadata_object_check"
    CHECK (jsonb_typeof("metadata") = 'object')
);

-- `0019` is intentionally re-runnable by the curated deploy script. Add the
-- nullable column here too so an installation created by the original 0019 can
-- safely reach the tenant-aware index before 0020 backfills it. A later
-- contract migration will enforce the non-null invariant.
ALTER TABLE "execution_runs"
  ADD COLUMN IF NOT EXISTS "tenant_key" text;

CREATE UNIQUE INDEX IF NOT EXISTS "execution_runs_aggregate_idempotency_idx"
  ON "execution_runs" (
    "aggregate_type", "aggregate_id", "operation", "idempotency_key"
  );

CREATE UNIQUE INDEX IF NOT EXISTS "execution_runs_tenant_aggregate_idempotency_idx"
  ON "execution_runs" (
    "tenant_key", "aggregate_type", "aggregate_id", "operation", "idempotency_key"
  );
CREATE INDEX IF NOT EXISTS "execution_runs_aggregate_created_idx"
  ON "execution_runs" ("aggregate_type", "aggregate_id", "created_at");
CREATE INDEX IF NOT EXISTS "execution_runs_status_updated_idx"
  ON "execution_runs" ("status", "updated_at");
CREATE INDEX IF NOT EXISTS "execution_runs_trace_idx"
  ON "execution_runs" ("trace_id");

CREATE TABLE IF NOT EXISTS "execution_steps" (
  "id" text PRIMARY KEY NOT NULL,
  "run_id" text NOT NULL,
  "step_key" text NOT NULL,
  "status" text DEFAULT 'pending' NOT NULL,
  "attempt" integer DEFAULT 0 NOT NULL,
  "input" jsonb,
  "output" jsonb,
  "error" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "started_at" timestamp,
  "finished_at" timestamp,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "execution_steps_run_id_execution_runs_id_fk"
    FOREIGN KEY ("run_id") REFERENCES "execution_runs"("id")
    ON DELETE CASCADE,
  CONSTRAINT "execution_steps_status_check"
    CHECK ("status" IN (
      'pending', 'running', 'waiting_approval', 'completed', 'failed', 'cancelled', 'skipped'
    )),
  CONSTRAINT "execution_steps_attempt_check" CHECK ("attempt" >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS "execution_steps_run_key_idx"
  ON "execution_steps" ("run_id", "step_key");
CREATE INDEX IF NOT EXISTS "execution_steps_run_status_idx"
  ON "execution_steps" ("run_id", "status");

CREATE TABLE IF NOT EXISTS "execution_events" (
  "sequence" bigserial NOT NULL,
  "id" text PRIMARY KEY NOT NULL,
  "run_id" text NOT NULL,
  "aggregate_type" text NOT NULL,
  "aggregate_id" text NOT NULL,
  "trace_id" text,
  "type" text NOT NULL,
  "ts" timestamp DEFAULT now() NOT NULL,
  "data" jsonb,
  CONSTRAINT "execution_events_run_id_execution_runs_id_fk"
    FOREIGN KEY ("run_id") REFERENCES "execution_runs"("id")
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "execution_events_run_sequence_idx"
  ON "execution_events" ("run_id", "sequence");
CREATE INDEX IF NOT EXISTS "execution_events_aggregate_sequence_idx"
  ON "execution_events" ("aggregate_type", "aggregate_id", "sequence");
CREATE INDEX IF NOT EXISTS "execution_events_trace_idx"
  ON "execution_events" ("trace_id");
CREATE INDEX IF NOT EXISTS "execution_events_ts_idx"
  ON "execution_events" ("ts");
