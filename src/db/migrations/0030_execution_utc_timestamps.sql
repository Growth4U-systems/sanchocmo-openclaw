-- SAN-480: make the generic Ledger's timestamp-without-time-zone convention
-- explicit at the database boundary. This changes catalog defaults only; it
-- does not rewrite existing rows. Runtime mutations use the same UTC wall
-- clock convention.

ALTER TABLE "execution_runs"
  ALTER COLUMN "available_at"
    SET DEFAULT (clock_timestamp() AT TIME ZONE 'UTC'),
  ALTER COLUMN "created_at"
    SET DEFAULT (clock_timestamp() AT TIME ZONE 'UTC'),
  ALTER COLUMN "updated_at"
    SET DEFAULT (clock_timestamp() AT TIME ZONE 'UTC');

ALTER TABLE "execution_steps"
  ALTER COLUMN "created_at"
    SET DEFAULT (clock_timestamp() AT TIME ZONE 'UTC'),
  ALTER COLUMN "updated_at"
    SET DEFAULT (clock_timestamp() AT TIME ZONE 'UTC');

ALTER TABLE "execution_events"
  ALTER COLUMN "ts"
    SET DEFAULT (clock_timestamp() AT TIME ZONE 'UTC');

ALTER TABLE "execution_effects"
  ALTER COLUMN "available_at"
    SET DEFAULT (clock_timestamp() AT TIME ZONE 'UTC'),
  ALTER COLUMN "created_at"
    SET DEFAULT (clock_timestamp() AT TIME ZONE 'UTC'),
  ALTER COLUMN "updated_at"
    SET DEFAULT (clock_timestamp() AT TIME ZONE 'UTC');

ALTER TABLE "execution_terminal_projections"
  ALTER COLUMN "available_at"
    SET DEFAULT (clock_timestamp() AT TIME ZONE 'UTC'),
  ALTER COLUMN "created_at"
    SET DEFAULT (clock_timestamp() AT TIME ZONE 'UTC'),
  ALTER COLUMN "updated_at"
    SET DEFAULT (clock_timestamp() AT TIME ZONE 'UTC');

ALTER TABLE "leads_search_projections"
  ALTER COLUMN "projected_at"
    SET DEFAULT (clock_timestamp() AT TIME ZONE 'UTC');
