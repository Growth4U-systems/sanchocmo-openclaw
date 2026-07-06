CREATE TABLE IF NOT EXISTS "mi_settings" (
  "id" text PRIMARY KEY NOT NULL,
  "slug" text NOT NULL,
  "enabled" boolean DEFAULT true NOT NULL,
  "sync_enabled" boolean DEFAULT false NOT NULL,
  "sync_time" text DEFAULT '18:00' NOT NULL,
  "sync_timezone" text DEFAULT 'Europe/Madrid' NOT NULL,
  "sync_cron_expr" text DEFAULT '0 18 * * *' NOT NULL,
  "sync_limit" integer DEFAULT 60 NOT NULL,
  "cron_job_id" text,
  "routing" jsonb,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "mi_settings_slug_idx" ON "mi_settings" ("slug");
