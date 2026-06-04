CREATE TABLE IF NOT EXISTS "feedback_insights" (
  "id" text PRIMARY KEY NOT NULL,
  "run_id" text NOT NULL,
  "slug" text NOT NULL,
  "doc_path" text NOT NULL,
  "skill_id" text,
  "category" text NOT NULL,
  "title" text NOT NULL,
  "detail" text NOT NULL,
  "proposed_change" text,
  "source_comment_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "status" text DEFAULT 'new' NOT NULL,
  "routed_ref" text,
  "created_at" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "feedback_insights_slug_idx" ON "feedback_insights" ("slug");
CREATE INDEX IF NOT EXISTS "feedback_insights_slug_status_idx" ON "feedback_insights" ("slug","status");
CREATE INDEX IF NOT EXISTS "feedback_insights_run_idx" ON "feedback_insights" ("run_id");
