CREATE TABLE "metric_dashboards" (
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
--> statement-breakpoint
CREATE TABLE "metric_snapshots" (
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
--> statement-breakpoint
CREATE INDEX "metric_dashboards_slug_idx" ON "metric_dashboards" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "metric_snapshots_slug_date_idx" ON "metric_snapshots" USING btree ("slug","metric_date");--> statement-breakpoint
CREATE INDEX "metric_snapshots_slug_source_metric_idx" ON "metric_snapshots" USING btree ("slug","source","metric_name");--> statement-breakpoint
CREATE INDEX "metric_snapshots_slug_source_date_idx" ON "metric_snapshots" USING btree ("slug","source","metric_date");