CREATE TABLE IF NOT EXISTS "metric_kpi_runs" (
  "id" text PRIMARY KEY NOT NULL,
  "slug" text NOT NULL,
  "range_start" text NOT NULL,
  "range_end" text NOT NULL,
  "status" text DEFAULT 'running' NOT NULL,
  "trigger" text DEFAULT 'manual' NOT NULL,
  "definition_version" integer,
  "source_snapshot_max_date" text,
  "kpi_count" integer DEFAULT 0 NOT NULL,
  "warnings" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "errors" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "started_at" timestamp DEFAULT now() NOT NULL,
  "finished_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "metric_kpi_runs_slug_range_idx"
  ON "metric_kpi_runs" ("slug", "range_start", "range_end");
CREATE INDEX IF NOT EXISTS "metric_kpi_runs_slug_status_idx"
  ON "metric_kpi_runs" ("slug", "status");

CREATE TABLE IF NOT EXISTS "metric_kpi_values" (
  "id" text PRIMARY KEY NOT NULL,
  "slug" text NOT NULL,
  "metric_date" text NOT NULL,
  "range_start" text NOT NULL,
  "range_end" text NOT NULL,
  "grain" text DEFAULT 'range' NOT NULL,
  "definition_id" text NOT NULL,
  "family" text NOT NULL,
  "surface" text,
  "source" text,
  "value" real,
  "value_text" text,
  "format" text DEFAULT 'number' NOT NULL,
  "calculation_kind" text DEFAULT 'direct' NOT NULL,
  "dimensions" jsonb,
  "dims_key" text DEFAULT '' NOT NULL,
  "delta_value" real,
  "delta_pct" real,
  "trend_points" jsonb,
  "quality_status" text DEFAULT 'missing' NOT NULL,
  "confidence" real,
  "input_refs" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "warnings" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "run_id" text REFERENCES "metric_kpi_runs"("id") ON DELETE SET NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "metric_kpi_values_slug_date_idx"
  ON "metric_kpi_values" ("slug", "metric_date");
CREATE INDEX IF NOT EXISTS "metric_kpi_values_slug_definition_date_idx"
  ON "metric_kpi_values" ("slug", "definition_id", "metric_date");
CREATE INDEX IF NOT EXISTS "metric_kpi_values_slug_surface_date_idx"
  ON "metric_kpi_values" ("slug", "surface", "metric_date");
CREATE INDEX IF NOT EXISTS "metric_kpi_values_run_idx"
  ON "metric_kpi_values" ("run_id");

CREATE TABLE IF NOT EXISTS "metric_funnel_stage_map" (
  "id" text PRIMARY KEY NOT NULL,
  "slug" text NOT NULL,
  "archetype" text DEFAULT 'lead-to-sale' NOT NULL,
  "stage_key" text NOT NULL,
  "stage_label" text NOT NULL,
  "stage_order" integer DEFAULT 0 NOT NULL,
  "source" text NOT NULL,
  "metric_name" text NOT NULL,
  "dimensions" jsonb,
  "dims_key" text DEFAULT '' NOT NULL,
  "entity_type" text,
  "channel" text,
  "cost_source" text,
  "cost_metric_name" text,
  "enabled" boolean DEFAULT true NOT NULL,
  "notes" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "metric_funnel_stage_map_slug_idx"
  ON "metric_funnel_stage_map" ("slug");
CREATE INDEX IF NOT EXISTS "metric_funnel_stage_map_slug_archetype_idx"
  ON "metric_funnel_stage_map" ("slug", "archetype");
CREATE INDEX IF NOT EXISTS "metric_funnel_stage_map_slug_stage_idx"
  ON "metric_funnel_stage_map" ("slug", "stage_key");

CREATE TABLE IF NOT EXISTS "metric_stage_rollups" (
  "id" text PRIMARY KEY NOT NULL,
  "slug" text NOT NULL,
  "metric_date" text NOT NULL,
  "grain" text DEFAULT 'day' NOT NULL,
  "stage_key" text NOT NULL,
  "channel" text DEFAULT '' NOT NULL,
  "count" real DEFAULT 0 NOT NULL,
  "value" real,
  "cost" real,
  "dimensions" jsonb,
  "dims_key" text DEFAULT '' NOT NULL,
  "quality_status" text DEFAULT 'missing' NOT NULL,
  "input_refs" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "run_id" text REFERENCES "metric_kpi_runs"("id") ON DELETE SET NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "metric_stage_rollups_slug_date_idx"
  ON "metric_stage_rollups" ("slug", "metric_date");
CREATE INDEX IF NOT EXISTS "metric_stage_rollups_slug_stage_date_idx"
  ON "metric_stage_rollups" ("slug", "stage_key", "metric_date");
CREATE INDEX IF NOT EXISTS "metric_stage_rollups_slug_channel_date_idx"
  ON "metric_stage_rollups" ("slug", "channel", "metric_date");
CREATE INDEX IF NOT EXISTS "metric_stage_rollups_run_idx"
  ON "metric_stage_rollups" ("run_id");

CREATE TABLE IF NOT EXISTS "metric_stage_events" (
  "id" text PRIMARY KEY NOT NULL,
  "slug" text NOT NULL,
  "entity_id" text NOT NULL,
  "entity_type" text DEFAULT 'lead' NOT NULL,
  "stage_key" text NOT NULL,
  "channel" text,
  "occurred_at" timestamp NOT NULL,
  "metric_date" text NOT NULL,
  "source" text NOT NULL,
  "source_event_id" text,
  "value" real,
  "revenue" real,
  "cost" real,
  "dimensions" jsonb,
  "input_refs" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "metric_stage_events_slug_entity_idx"
  ON "metric_stage_events" ("slug", "entity_type", "entity_id");
CREATE INDEX IF NOT EXISTS "metric_stage_events_slug_stage_date_idx"
  ON "metric_stage_events" ("slug", "stage_key", "metric_date");
CREATE INDEX IF NOT EXISTS "metric_stage_events_slug_channel_date_idx"
  ON "metric_stage_events" ("slug", "channel", "metric_date");

CREATE TABLE IF NOT EXISTS "metric_attribution_results" (
  "id" text PRIMARY KEY NOT NULL,
  "slug" text NOT NULL,
  "model" text NOT NULL,
  "range_start" text NOT NULL,
  "range_end" text NOT NULL,
  "channel" text NOT NULL,
  "stage_key" text,
  "attributed_count" real,
  "attributed_value" real,
  "attributed_revenue" real,
  "attributed_cost" real,
  "weight" real,
  "quality_status" text DEFAULT 'missing' NOT NULL,
  "input_refs" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "run_id" text REFERENCES "metric_kpi_runs"("id") ON DELETE SET NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "metric_attribution_results_slug_range_idx"
  ON "metric_attribution_results" ("slug", "range_start", "range_end");
CREATE INDEX IF NOT EXISTS "metric_attribution_results_slug_model_idx"
  ON "metric_attribution_results" ("slug", "model");
CREATE INDEX IF NOT EXISTS "metric_attribution_results_slug_channel_idx"
  ON "metric_attribution_results" ("slug", "channel");
CREATE INDEX IF NOT EXISTS "metric_attribution_results_run_idx"
  ON "metric_attribution_results" ("run_id");

CREATE TABLE IF NOT EXISTS "metric_annotations" (
  "id" text PRIMARY KEY NOT NULL,
  "slug" text NOT NULL,
  "annotation_date" text NOT NULL,
  "title" text NOT NULL,
  "body" text,
  "category" text DEFAULT 'manual' NOT NULL,
  "source" text DEFAULT 'manual' NOT NULL,
  "created_by" text,
  "scope" text DEFAULT 'dashboard' NOT NULL,
  "metric_definition_id" text,
  "metadata" jsonb,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "metric_annotations_slug_date_idx"
  ON "metric_annotations" ("slug", "annotation_date");
CREATE INDEX IF NOT EXISTS "metric_annotations_slug_metric_idx"
  ON "metric_annotations" ("slug", "metric_definition_id");

CREATE TABLE IF NOT EXISTS "metric_signals" (
  "id" text PRIMARY KEY NOT NULL,
  "slug" text NOT NULL,
  "signal_date" text NOT NULL,
  "surface" text,
  "definition_id" text,
  "severity" text DEFAULT 'info' NOT NULL,
  "title" text NOT NULL,
  "body" text,
  "status" text DEFAULT 'open' NOT NULL,
  "source" text DEFAULT 'system' NOT NULL,
  "input_refs" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "metadata" jsonb,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "metric_signals_slug_date_idx"
  ON "metric_signals" ("slug", "signal_date");
CREATE INDEX IF NOT EXISTS "metric_signals_slug_surface_idx"
  ON "metric_signals" ("slug", "surface");
CREATE INDEX IF NOT EXISTS "metric_signals_slug_definition_idx"
  ON "metric_signals" ("slug", "definition_id");
CREATE INDEX IF NOT EXISTS "metric_signals_slug_status_idx"
  ON "metric_signals" ("slug", "status");
