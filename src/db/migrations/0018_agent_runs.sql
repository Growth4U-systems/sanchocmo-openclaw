-- SAN-469: durable Mission Control agent-run/event ledger.
-- Existing bounded JSON ledgers are intentionally not backfilled here. The
-- application keeps their reader available for an explicit, audited backfill.

CREATE TABLE IF NOT EXISTS "agent_runs" (
  "id" text PRIMARY KEY NOT NULL,
  "idempotency_key" text,
  "thread_id" text NOT NULL,
  "trace_id" text,
  "runtime" text NOT NULL,
  "agent" text,
  "skill" text,
  "skills" jsonb,
  "skill_mode" text,
  "task_id" text,
  "task_contract" jsonb,
  "status" text DEFAULT 'queued' NOT NULL,
  "input" jsonb,
  "output" jsonb,
  "error" text,
  "callback_fingerprints" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "started_at" timestamp,
  "finished_at" timestamp,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "agent_runs_status_check"
    CHECK ("status" IN ('queued', 'running', 'completed', 'failed', 'cancelled')),
  CONSTRAINT "agent_runs_skill_mode_check"
    CHECK ("skill_mode" IS NULL OR "skill_mode" IN ('auto', 'pinned')),
  CONSTRAINT "agent_runs_callback_fingerprints_array_check"
    CHECK (jsonb_typeof("callback_fingerprints") = 'array')
);

CREATE UNIQUE INDEX IF NOT EXISTS "agent_runs_thread_idempotency_idx"
  ON "agent_runs" ("thread_id", "idempotency_key")
  WHERE "idempotency_key" IS NOT NULL
    AND "status" IN ('queued', 'running', 'completed');
CREATE INDEX IF NOT EXISTS "agent_runs_thread_created_idx"
  ON "agent_runs" ("thread_id", "created_at");
CREATE INDEX IF NOT EXISTS "agent_runs_thread_status_idx"
  ON "agent_runs" ("thread_id", "status", "created_at");
CREATE INDEX IF NOT EXISTS "agent_runs_trace_idx"
  ON "agent_runs" ("trace_id");
CREATE INDEX IF NOT EXISTS "agent_runs_task_idx"
  ON "agent_runs" ("task_id");

CREATE TABLE IF NOT EXISTS "agent_run_events" (
  "sequence" bigserial NOT NULL,
  "id" text PRIMARY KEY NOT NULL,
  "run_id" text NOT NULL,
  "thread_id" text NOT NULL,
  "trace_id" text,
  "type" text NOT NULL,
  "ts" timestamp DEFAULT now() NOT NULL,
  "data" jsonb,
  CONSTRAINT "agent_run_events_run_id_agent_runs_id_fk"
    FOREIGN KEY ("run_id") REFERENCES "agent_runs"("id")
    ON DELETE CASCADE,
  CONSTRAINT "agent_run_events_type_check"
    CHECK ("type" IN (
      'run_created',
      'runtime_dispatched',
      'runtime_rejected',
      'runtime_unreachable',
      'progress',
      'artifact_readback',
      'bot_reply',
      'cancel_requested',
      'cancel_dispatched',
      'cancel_failed',
      'failed'
    ))
);

CREATE INDEX IF NOT EXISTS "agent_run_events_run_sequence_idx"
  ON "agent_run_events" ("run_id", "sequence");
CREATE INDEX IF NOT EXISTS "agent_run_events_thread_sequence_idx"
  ON "agent_run_events" ("thread_id", "sequence");
CREATE INDEX IF NOT EXISTS "agent_run_events_trace_idx"
  ON "agent_run_events" ("trace_id");
CREATE INDEX IF NOT EXISTS "agent_run_events_ts_idx"
  ON "agent_run_events" ("ts");
