-- SAN-480: durable quarantine for commands that cannot safely execute until
-- code or runtime configuration is repaired explicitly.
--
-- `blocked` is non-terminal: it is never claimable and never creates a
-- terminal projection. Resume is an exact-scope CAS; cancellation remains a
-- terminal operation and creates the normal managed-v2 projection.

ALTER TABLE "execution_runs"
  ADD COLUMN IF NOT EXISTS "blocked_reason_code" text,
  ADD COLUMN IF NOT EXISTS "blocked_at" timestamp;

ALTER TABLE "execution_runs"
  DROP CONSTRAINT IF EXISTS "execution_runs_status_check";

ALTER TABLE "execution_runs"
  ADD CONSTRAINT "execution_runs_status_check"
    CHECK ("status" IN (
      'queued', 'running', 'waiting_approval', 'blocked',
      'completed', 'partial', 'failed', 'cancelled'
    ));

ALTER TABLE "execution_runs"
  DROP CONSTRAINT IF EXISTS "execution_runs_block_reason_code_check";

ALTER TABLE "execution_runs"
  ADD CONSTRAINT "execution_runs_block_reason_code_check" CHECK (
    "blocked_reason_code" IS NULL OR "blocked_reason_code" IN (
      'handler_version_invalid',
      'handler_contract_unsupported',
      'handler_contract_mismatch',
      'execution_policy_mismatch',
      'command_contract_mismatch',
      'runtime_authority_unavailable'
    )
  );

ALTER TABLE "execution_runs"
  DROP CONSTRAINT IF EXISTS "execution_runs_block_shape_check";

ALTER TABLE "execution_runs"
  ADD CONSTRAINT "execution_runs_block_shape_check" CHECK (
    (
      "status" = 'blocked' AND
      "blocked_reason_code" IS NOT NULL AND
      "blocked_at" IS NOT NULL AND
      "lease_owner" IS NULL AND
      "lease_token_hash" IS NULL AND
      "lease_expires_at" IS NULL AND
      "finished_at" IS NULL
    ) OR (
      "status" <> 'blocked' AND
      "blocked_reason_code" IS NULL AND
      "blocked_at" IS NULL
    )
  );

CREATE INDEX IF NOT EXISTS "execution_runs_blocked_scope_idx"
  ON "execution_runs" (
    "operation", "mode", "tenant_key", "blocked_at", "id"
  )
  WHERE "status" = 'blocked' AND "mode" IN ('canary', 'active');
