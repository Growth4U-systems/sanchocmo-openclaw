CREATE TABLE IF NOT EXISTS "tasks" (
  "source_key" text PRIMARY KEY NOT NULL,
  "id" text NOT NULL,
  "workspace_slug" text NOT NULL,
  "brand_slug" text NOT NULL,
  "parent_id" text,
  "parent_key" text,
  "type" text NOT NULL,
  "status" text NOT NULL,
  "name" text NOT NULL,
  "brief" text,
  "completion" text,
  "execution_notes" text,
  "description" text,
  "slug" text,
  "owner" text,
  "skill" text,
  "channel" text,
  "deliverable" text,
  "deliverable_file" jsonb,
  "done_criteria" text,
  "depends_on" text,
  "pillar" text,
  "section" text,
  "strategy" text,
  "phase" integer,
  "category" text,
  "objective" jsonb,
  "approach" text,
  "archive_reason" text,
  "blocked_by" text,
  "tool" text,
  "idea_id" text,
  "pipeline_state" text,
  "clarify_status" text,
  "target_channels" jsonb,
  "channel_phases" jsonb,
  "media_policy" jsonb,
  "scheduled_for" timestamp,
  "draft_statuses" jsonb,
  "mc_chat_thread_id" text,
  "discord_thread_id" text,
  "output_files" jsonb,
  "documents" jsonb,
  "attachments" jsonb,
  "idea_ids" jsonb,
  "legacy_extras" jsonb,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  "completed_at" timestamp,
  "approved_at" timestamp,
  "pending_media_at" timestamp,
  "published_at" timestamp,
  "discarded_at" timestamp,
  "deferred_at" timestamp,
  "review_date" timestamp,
  CONSTRAINT "tasks_parent_key_fk"
    FOREIGN KEY ("parent_key") REFERENCES "tasks"("source_key") ON DELETE cascade
);

CREATE INDEX IF NOT EXISTS "tasks_workspace_slug_idx" ON "tasks" ("workspace_slug");
CREATE INDEX IF NOT EXISTS "tasks_brand_slug_idx" ON "tasks" ("brand_slug");
CREATE INDEX IF NOT EXISTS "tasks_workspace_brand_id_idx" ON "tasks" ("workspace_slug", "brand_slug", "id");
CREATE INDEX IF NOT EXISTS "tasks_parent_id_idx" ON "tasks" ("parent_id");
CREATE INDEX IF NOT EXISTS "tasks_parent_key_idx" ON "tasks" ("parent_key");
CREATE INDEX IF NOT EXISTS "tasks_brand_type_idx" ON "tasks" ("brand_slug", "type");
CREATE INDEX IF NOT EXISTS "tasks_brand_status_idx" ON "tasks" ("brand_slug", "status");
CREATE INDEX IF NOT EXISTS "tasks_brand_pillar_idx" ON "tasks" ("brand_slug", "pillar");
CREATE INDEX IF NOT EXISTS "tasks_idea_id_idx" ON "tasks" ("idea_id");
