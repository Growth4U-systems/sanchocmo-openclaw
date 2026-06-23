CREATE TABLE IF NOT EXISTS "metric_collection_schedule" (
  "id" text PRIMARY KEY NOT NULL,
  "slug" text NOT NULL,
  "source" text NOT NULL,
  "cadence" text DEFAULT 'daily' NOT NULL,
  "days_of_week" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "cron_expr" text,
  "enabled" boolean DEFAULT true NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "metric_collection_schedule_slug_idx" ON "metric_collection_schedule" ("slug");

CREATE TABLE IF NOT EXISTS "metric_source_runs" (
  "id" text PRIMARY KEY NOT NULL,
  "slug" text NOT NULL,
  "metric_date" text NOT NULL,
  "source" text NOT NULL,
  "status" text NOT NULL,
  "collected_at" timestamp,
  "row_count" integer DEFAULT 0 NOT NULL,
  "deleted_count" integer DEFAULT 0 NOT NULL,
  "cadence" text,
  "error" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "metric_source_runs_slug_date_idx" ON "metric_source_runs" ("slug", "metric_date");
CREATE INDEX IF NOT EXISTS "metric_source_runs_slug_source_idx" ON "metric_source_runs" ("slug", "source");
