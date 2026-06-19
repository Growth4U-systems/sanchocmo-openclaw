-- Intelligence Engine (SAN-270) — spine: normalized signal + proposals + metrics plan.
-- Additive only (CREATE ... IF NOT EXISTS); no destructive statements so the
-- prod deploy runner (scripts/apply-sql-migration.mjs) accepts it.

CREATE TABLE IF NOT EXISTS "signals" (
  "id" text PRIMARY KEY NOT NULL,
  "slug" text NOT NULL,
  "category" text NOT NULL,
  "provider" text NOT NULL,
  "entity_type" text,
  "entity_id" text,
  "dims" jsonb,
  "metric" text NOT NULL,
  "value" real,
  "text" text,
  "captured_at" timestamp NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "signals_slug_idx" ON "signals" ("slug");
CREATE INDEX IF NOT EXISTS "signals_slug_category_metric_idx" ON "signals" ("slug","category","metric");
CREATE INDEX IF NOT EXISTS "signals_captured_at_idx" ON "signals" ("captured_at");

CREATE TABLE IF NOT EXISTS "improvement_proposals" (
  "id" text PRIMARY KEY NOT NULL,
  "slug" text NOT NULL,
  "domain" text NOT NULL,
  "rule_id" text,
  "signal_ref" text,
  "title" text NOT NULL,
  "description" text,
  "rationale" text,
  "confidence" real,
  "priority" text DEFAULT 'medium' NOT NULL,
  "target_type" text DEFAULT 'task' NOT NULL,
  "target_id" text,
  "target_skill" text,
  "target_agent" text,
  "document_name" text,
  "status" text DEFAULT 'recommended' NOT NULL,
  "task_id" text,
  "task_status" text DEFAULT 'recommended' NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  "approved_at" timestamp,
  "rejected_at" timestamp,
  "converted_at" timestamp
);
CREATE INDEX IF NOT EXISTS "improvement_proposals_slug_idx" ON "improvement_proposals" ("slug");
CREATE INDEX IF NOT EXISTS "improvement_proposals_slug_status_idx" ON "improvement_proposals" ("slug","status");
CREATE INDEX IF NOT EXISTS "improvement_proposals_slug_domain_idx" ON "improvement_proposals" ("slug","domain");

CREATE TABLE IF NOT EXISTS "metrics_plan" (
  "id" text PRIMARY KEY NOT NULL,
  "slug" text NOT NULL,
  "category" text NOT NULL,
  "provider" text,
  "metric" text,
  "target" real,
  "direction" text,
  "is_north_star" boolean DEFAULT false NOT NULL,
  "active" boolean DEFAULT true NOT NULL,
  "approval_mode" text DEFAULT 'review_all' NOT NULL,
  "auto_apply_confidence_threshold" real,
  "config" jsonb,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "metrics_plan_slug_idx" ON "metrics_plan" ("slug");
CREATE INDEX IF NOT EXISTS "metrics_plan_slug_category_idx" ON "metrics_plan" ("slug","category");

CREATE TABLE IF NOT EXISTS "proposal_outcomes" (
  "id" text PRIMARY KEY NOT NULL,
  "slug" text NOT NULL,
  "proposal_id" text NOT NULL,
  "outcome" text NOT NULL,
  "metric_before" real,
  "metric_after" real,
  "notes" text,
  "measured_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "proposal_outcomes_proposal_id_improvement_proposals_id_fk" FOREIGN KEY ("proposal_id") REFERENCES "improvement_proposals"("id") ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "proposal_outcomes_slug_idx" ON "proposal_outcomes" ("slug");
CREATE INDEX IF NOT EXISTS "proposal_outcomes_proposal_idx" ON "proposal_outcomes" ("proposal_id");
