-- SAN-480: one immutable external command per trusted chat parent.
--
-- The origin row already serializes Stop against child admission. These
-- fields extend that same authority so two tools, processes or retries cannot
-- admit different external commands under one model turn. Exact replays keep
-- the original claim; command drift fails closed before product/provider I/O.

ALTER TABLE "execution_origins"
  ADD COLUMN IF NOT EXISTS "command_operation" text
    CONSTRAINT "execution_origins_command_operation_check" CHECK (
      "command_operation" IS NULL OR
      "command_operation" ~ '^[a-z][a-z0-9._-]{0,127}$'
    );

ALTER TABLE "execution_origins"
  ADD COLUMN IF NOT EXISTS "command_fingerprint" text
    CONSTRAINT "execution_origins_command_fingerprint_check" CHECK (
      "command_fingerprint" IS NULL OR
      "command_fingerprint" ~ '^[a-f0-9]{64}$'
    );

ALTER TABLE "execution_origins"
  ADD COLUMN IF NOT EXISTS "command_claimed_at" timestamp
    CONSTRAINT "execution_origins_command_claim_shape_check" CHECK (
      (
        "command_operation" IS NULL AND
        "command_fingerprint" IS NULL AND
        "command_claimed_at" IS NULL
      ) OR (
        "command_operation" IS NOT NULL AND
        "command_fingerprint" IS NOT NULL AND
        "command_claimed_at" IS NOT NULL
      )
    );
