CREATE TABLE IF NOT EXISTS "metric_funnel_stage_map" (
  "id" text PRIMARY KEY NOT NULL,
  "slug" text NOT NULL,
  "archetype" text DEFAULT 'lead-to-sale' NOT NULL,
  "stage_id" text NOT NULL,
  "stage_label" text NOT NULL,
  "stage_order" integer NOT NULL,
  "surface" text,
  "source" text NOT NULL,
  "metric_name" text NOT NULL,
  "source_aliases" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "metric_aliases" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "dimensions_filter" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "channel" text,
  "aggregation" text DEFAULT 'sum' NOT NULL,
  "quality_override" text,
  "enabled" boolean DEFAULT true NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "metric_funnel_stage_map_slug_idx"
  ON "metric_funnel_stage_map" ("slug");
CREATE INDEX IF NOT EXISTS "metric_funnel_stage_map_slug_stage_idx"
  ON "metric_funnel_stage_map" ("slug", "stage_id");

CREATE TABLE IF NOT EXISTS "metric_stage_rollups" (
  "id" text PRIMARY KEY NOT NULL,
  "run_id" text,
  "map_id" text,
  "slug" text NOT NULL,
  "stage_id" text NOT NULL,
  "stage_label" text NOT NULL,
  "stage_order" integer NOT NULL,
  "stage_date" text NOT NULL,
  "channel" text NOT NULL,
  "surface" text,
  "source" text NOT NULL,
  "metric_name" text NOT NULL,
  "value" real NOT NULL,
  "quality_status" text NOT NULL,
  "provenance_label" text NOT NULL,
  "input_refs" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "dimensions" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "range_from" text NOT NULL,
  "range_to" text NOT NULL,
  "definition_version" integer,
  "computed_at" timestamp DEFAULT now() NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "metric_stage_rollups_slug_date_idx"
  ON "metric_stage_rollups" ("slug", "stage_date");
CREATE INDEX IF NOT EXISTS "metric_stage_rollups_slug_stage_idx"
  ON "metric_stage_rollups" ("slug", "stage_id");
CREATE INDEX IF NOT EXISTS "metric_stage_rollups_slug_channel_idx"
  ON "metric_stage_rollups" ("slug", "channel");
CREATE INDEX IF NOT EXISTS "metric_stage_rollups_slug_range_idx"
  ON "metric_stage_rollups" ("slug", "range_from", "range_to");
