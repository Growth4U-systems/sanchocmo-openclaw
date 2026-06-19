CREATE TABLE IF NOT EXISTS "metric_snapshots" (
  "id" text PRIMARY KEY NOT NULL,
  "slug" text NOT NULL,
  "metric_date" text NOT NULL,
  "source" text NOT NULL,
  "metric_name" text NOT NULL,
  "value" real,
  "value_text" text,
  "dimensions" jsonb,
  "dims_key" text DEFAULT '' NOT NULL,
  "grain" text DEFAULT 'day' NOT NULL,
  "collected_at" timestamp,
  "ingest_run_id" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

-- Uniqueness is enforced by the deterministic hashed `id` primary key
-- (collision-negligible). A raw-dims_key btree unique index could exceed
-- Postgres' index-row size limit on long GSC/GA4 URL/query dimensions.
CREATE INDEX IF NOT EXISTS "metric_snapshots_slug_date_idx"
  ON "metric_snapshots" ("slug", "metric_date");
CREATE INDEX IF NOT EXISTS "metric_snapshots_slug_source_metric_idx"
  ON "metric_snapshots" ("slug", "source", "metric_name");
CREATE INDEX IF NOT EXISTS "metric_snapshots_slug_source_date_idx"
  ON "metric_snapshots" ("slug", "source", "metric_date");
