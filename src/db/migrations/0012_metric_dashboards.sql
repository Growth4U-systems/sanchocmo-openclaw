CREATE TABLE IF NOT EXISTS "metric_dashboards" (
  "id" text PRIMARY KEY NOT NULL,
  "slug" text NOT NULL,
  "version" integer DEFAULT 1 NOT NULL,
  "definition" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "version_history" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "status" text DEFAULT 'active' NOT NULL,
  "source" text DEFAULT 'neon' NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "metric_dashboards_slug_idx" ON "metric_dashboards" ("slug");
