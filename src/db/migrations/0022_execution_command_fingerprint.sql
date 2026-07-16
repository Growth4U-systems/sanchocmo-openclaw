-- SAN-480 R3: bind each idempotency key to one immutable normalized command.
-- Existing rows stay nullable and are adopted lazily only after an exact
-- payload comparison in the repository. No raw canonical command is stored.

ALTER TABLE "execution_runs"
  ADD COLUMN IF NOT EXISTS "command_fingerprint" text;
