CREATE TABLE IF NOT EXISTS "mi_sources" (
  "id" text PRIMARY KEY NOT NULL,
  "slug" text NOT NULL,
  "kind" text NOT NULL,
  "name" text NOT NULL,
  "source_id" text,
  "url" text,
  "enabled" boolean DEFAULT true NOT NULL,
  "scope" jsonb,
  "filter" jsonb,
  "status" text DEFAULT 'active' NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "mi_runs" (
  "id" text PRIMARY KEY NOT NULL,
  "slug" text NOT NULL,
  "status" text DEFAULT 'queued' NOT NULL,
  "trigger" text DEFAULT 'agent' NOT NULL,
  "sources_scanned" jsonb,
  "metrics" jsonb,
  "errors" jsonb,
  "started_at" timestamp DEFAULT now() NOT NULL,
  "finished_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "mi_meetings" (
  "id" text PRIMARY KEY NOT NULL,
  "slug" text NOT NULL,
  "source_id" text,
  "run_id" text,
  "external_id" text,
  "title" text NOT NULL,
  "meeting_date" text NOT NULL,
  "meeting_time" text,
  "source_label" text DEFAULT 'Manual' NOT NULL,
  "status" text DEFAULT 'needs_raw_sync' NOT NULL,
  "raw_status" text DEFAULT 'missing' NOT NULL,
  "meeting_type" text DEFAULT 'meeting' NOT NULL,
  "participants" jsonb,
  "source_url" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "mi_meetings_run_id_mi_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "mi_runs"("id") ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS "mi_meeting_artifacts" (
  "id" text PRIMARY KEY NOT NULL,
  "slug" text NOT NULL,
  "meeting_id" text NOT NULL,
  "raw_text" text,
  "summary_text" text,
  "source_payload" jsonb,
  "checksum" text,
  "fetched_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "mi_meeting_artifacts_meeting_id_mi_meetings_id_fk" FOREIGN KEY ("meeting_id") REFERENCES "mi_meetings"("id") ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "mi_insights" (
  "id" text PRIMARY KEY NOT NULL,
  "slug" text NOT NULL,
  "meeting_id" text,
  "run_id" text,
  "kind" text NOT NULL,
  "title" text NOT NULL,
  "body" text,
  "rationale" text,
  "owner" text,
  "confidence" real,
  "evidence" jsonb,
  "status" text DEFAULT 'draft' NOT NULL,
  "source_label" text,
  "event_date" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "mi_insights_meeting_id_mi_meetings_id_fk" FOREIGN KEY ("meeting_id") REFERENCES "mi_meetings"("id") ON DELETE CASCADE,
  CONSTRAINT "mi_insights_run_id_mi_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "mi_runs"("id") ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS "mi_document_impacts" (
  "id" text PRIMARY KEY NOT NULL,
  "slug" text NOT NULL,
  "meeting_id" text,
  "insight_id" text,
  "document_name" text NOT NULL,
  "document_path" text,
  "impact_type" text DEFAULT 'possible_update' NOT NULL,
  "status" text DEFAULT 'possible_update' NOT NULL,
  "severity" text DEFAULT 'medium' NOT NULL,
  "reason" text,
  "proposed_change" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "mi_document_impacts_meeting_id_mi_meetings_id_fk" FOREIGN KEY ("meeting_id") REFERENCES "mi_meetings"("id") ON DELETE CASCADE,
  CONSTRAINT "mi_document_impacts_insight_id_mi_insights_id_fk" FOREIGN KEY ("insight_id") REFERENCES "mi_insights"("id") ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS "mi_recommendations" (
  "id" text PRIMARY KEY NOT NULL,
  "slug" text NOT NULL,
  "meeting_id" text,
  "insight_id" text,
  "impact_id" text,
  "title" text NOT NULL,
  "description" text,
  "priority" text DEFAULT 'medium' NOT NULL,
  "target_type" text DEFAULT 'task' NOT NULL,
  "target_id" text,
  "document_name" text,
  "status" text DEFAULT 'recommended' NOT NULL,
  "task_id" text,
  "task_status" text DEFAULT 'recommended' NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  "approved_at" timestamp,
  "rejected_at" timestamp,
  "converted_at" timestamp,
  CONSTRAINT "mi_recommendations_meeting_id_mi_meetings_id_fk" FOREIGN KEY ("meeting_id") REFERENCES "mi_meetings"("id") ON DELETE CASCADE,
  CONSTRAINT "mi_recommendations_insight_id_mi_insights_id_fk" FOREIGN KEY ("insight_id") REFERENCES "mi_insights"("id") ON DELETE SET NULL,
  CONSTRAINT "mi_recommendations_impact_id_mi_document_impacts_id_fk" FOREIGN KEY ("impact_id") REFERENCES "mi_document_impacts"("id") ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS "mi_sources_slug_idx" ON "mi_sources" ("slug");
CREATE INDEX IF NOT EXISTS "mi_sources_slug_kind_idx" ON "mi_sources" ("slug", "kind");
CREATE INDEX IF NOT EXISTS "mi_runs_slug_idx" ON "mi_runs" ("slug");
CREATE INDEX IF NOT EXISTS "mi_runs_slug_status_idx" ON "mi_runs" ("slug", "status");
CREATE INDEX IF NOT EXISTS "mi_meetings_slug_idx" ON "mi_meetings" ("slug");
CREATE INDEX IF NOT EXISTS "mi_meetings_slug_date_idx" ON "mi_meetings" ("slug", "meeting_date");
CREATE INDEX IF NOT EXISTS "mi_meetings_source_idx" ON "mi_meetings" ("source_id");
CREATE INDEX IF NOT EXISTS "mi_artifacts_slug_idx" ON "mi_meeting_artifacts" ("slug");
CREATE INDEX IF NOT EXISTS "mi_artifacts_meeting_idx" ON "mi_meeting_artifacts" ("meeting_id");
CREATE INDEX IF NOT EXISTS "mi_insights_slug_idx" ON "mi_insights" ("slug");
CREATE INDEX IF NOT EXISTS "mi_insights_meeting_idx" ON "mi_insights" ("meeting_id");
CREATE INDEX IF NOT EXISTS "mi_insights_slug_kind_idx" ON "mi_insights" ("slug", "kind");
CREATE INDEX IF NOT EXISTS "mi_insights_slug_status_idx" ON "mi_insights" ("slug", "status");
CREATE INDEX IF NOT EXISTS "mi_impacts_slug_idx" ON "mi_document_impacts" ("slug");
CREATE INDEX IF NOT EXISTS "mi_impacts_meeting_idx" ON "mi_document_impacts" ("meeting_id");
CREATE INDEX IF NOT EXISTS "mi_impacts_document_idx" ON "mi_document_impacts" ("slug", "document_name");
CREATE INDEX IF NOT EXISTS "mi_recommendations_slug_idx" ON "mi_recommendations" ("slug");
CREATE INDEX IF NOT EXISTS "mi_recommendations_meeting_idx" ON "mi_recommendations" ("meeting_id");
CREATE INDEX IF NOT EXISTS "mi_recommendations_slug_status_idx" ON "mi_recommendations" ("slug", "status");
