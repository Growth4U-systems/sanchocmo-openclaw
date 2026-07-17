-- SAN-480: O(1) durable handler attempts and restart discovery for runnable work.
-- Additive, immutable, and compatible with the pre-worker writer.

ALTER TABLE "execution_runs"
  ADD COLUMN IF NOT EXISTS "handler_attempt" integer DEFAULT 0 NOT NULL;

CREATE INDEX IF NOT EXISTS "execution_runs_runnable_scope_idx"
  ON "execution_runs" ("operation", "mode", "tenant_key")
  WHERE "status" IN ('queued', 'running')
    AND "mode" IN ('canary', 'active');
