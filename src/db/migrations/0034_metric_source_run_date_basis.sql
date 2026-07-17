ALTER TABLE "metric_source_runs"
  ADD COLUMN IF NOT EXISTS "date_basis" text DEFAULT 'collection' NOT NULL;

CREATE INDEX IF NOT EXISTS "metric_source_runs_slug_source_basis_date_idx"
  ON "metric_source_runs" ("slug", "source", "date_basis", "metric_date");
