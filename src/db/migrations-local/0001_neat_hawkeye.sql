CREATE TABLE "improvement_proposals" (
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
--> statement-breakpoint
CREATE TABLE "intake_submissions" (
	"id" text PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"respondent_name" text NOT NULL,
	"respondent_email" text,
	"answers" jsonb NOT NULL,
	"status" text DEFAULT 'submitted' NOT NULL,
	"attachments" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"submitted_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "intake_submissions_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "metrics_plan" (
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
--> statement-breakpoint
CREATE TABLE "proposal_outcomes" (
	"id" text PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"proposal_id" text NOT NULL,
	"outcome" text NOT NULL,
	"metric_before" real,
	"metric_after" real,
	"notes" text,
	"measured_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "signals" (
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
--> statement-breakpoint
ALTER TABLE "shared_doc_comments" ADD COLUMN "parent_id" text;--> statement-breakpoint
ALTER TABLE "shared_doc_comments" ADD COLUMN "resolved" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "shared_doc_comments" ADD COLUMN "resolved_at" timestamp;--> statement-breakpoint
ALTER TABLE "shared_doc_comments" ADD COLUMN "resolved_by" text;--> statement-breakpoint
ALTER TABLE "shared_doc_comments" ADD COLUMN "anchor_prefix" text;--> statement-breakpoint
ALTER TABLE "shared_doc_comments" ADD COLUMN "anchor_suffix" text;--> statement-breakpoint
ALTER TABLE "proposal_outcomes" ADD CONSTRAINT "proposal_outcomes_proposal_id_improvement_proposals_id_fk" FOREIGN KEY ("proposal_id") REFERENCES "public"."improvement_proposals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "improvement_proposals_slug_idx" ON "improvement_proposals" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "improvement_proposals_slug_status_idx" ON "improvement_proposals" USING btree ("slug","status");--> statement-breakpoint
CREATE INDEX "improvement_proposals_slug_domain_idx" ON "improvement_proposals" USING btree ("slug","domain");--> statement-breakpoint
CREATE INDEX "intake_submissions_slug_idx" ON "intake_submissions" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "metrics_plan_slug_idx" ON "metrics_plan" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "metrics_plan_slug_category_idx" ON "metrics_plan" USING btree ("slug","category");--> statement-breakpoint
CREATE INDEX "proposal_outcomes_slug_idx" ON "proposal_outcomes" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "proposal_outcomes_proposal_idx" ON "proposal_outcomes" USING btree ("proposal_id");--> statement-breakpoint
CREATE INDEX "signals_slug_idx" ON "signals" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "signals_slug_category_metric_idx" ON "signals" USING btree ("slug","category","metric");--> statement-breakpoint
CREATE INDEX "signals_captured_at_idx" ON "signals" USING btree ("captured_at");--> statement-breakpoint
CREATE INDEX "shared_doc_comments_parent_idx" ON "shared_doc_comments" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "shared_doc_comments_open_idx" ON "shared_doc_comments" USING btree ("slug","doc_path","resolved","created_at");