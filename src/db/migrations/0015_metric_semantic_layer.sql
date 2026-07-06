CREATE TABLE IF NOT EXISTS "metric_kpi_runs" (
  "id" text PRIMARY KEY NOT NULL,
  "slug" text NOT NULL,
  "range_from" text NOT NULL,
  "range_to" text NOT NULL,
  "status" text DEFAULT 'running' NOT NULL,
  "trigger" text DEFAULT 'agent' NOT NULL,
  "definition_version" integer,
  "values_count" integer DEFAULT 0 NOT NULL,
  "quality_summary" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "errors" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "started_at" timestamp DEFAULT now() NOT NULL,
  "finished_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "metric_kpi_runs_slug_range_idx"
  ON "metric_kpi_runs" ("slug", "range_from", "range_to");
CREATE INDEX IF NOT EXISTS "metric_kpi_runs_slug_status_idx"
  ON "metric_kpi_runs" ("slug", "status");

CREATE TABLE IF NOT EXISTS "metric_kpi_values" (
  "id" text PRIMARY KEY NOT NULL,
  "run_id" text NOT NULL REFERENCES "metric_kpi_runs"("id") ON DELETE CASCADE,
  "slug" text NOT NULL,
  "kpi_id" text NOT NULL,
  "label" text NOT NULL,
  "dashboard_block" text NOT NULL,
  "surface" text,
  "source" text,
  "metric_name" text,
  "value" real,
  "value_text" text,
  "unit" text,
  "quality_status" text NOT NULL,
  "provenance_label" text NOT NULL,
  "input_refs" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "source_coverage" real DEFAULT 0 NOT NULL,
  "range_from" text NOT NULL,
  "range_to" text NOT NULL,
  "definition_version" integer,
  "computed_at" timestamp DEFAULT now() NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "metric_kpi_values_run_idx"
  ON "metric_kpi_values" ("run_id");
CREATE INDEX IF NOT EXISTS "metric_kpi_values_slug_kpi_idx"
  ON "metric_kpi_values" ("slug", "kpi_id");
CREATE INDEX IF NOT EXISTS "metric_kpi_values_slug_block_idx"
  ON "metric_kpi_values" ("slug", "dashboard_block");
CREATE INDEX IF NOT EXISTS "metric_kpi_values_slug_surface_idx"
  ON "metric_kpi_values" ("slug", "surface");
