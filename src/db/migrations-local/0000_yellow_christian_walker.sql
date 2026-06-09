CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"accountId" text NOT NULL,
	"providerId" text NOT NULL,
	"userId" text NOT NULL,
	"accessToken" text,
	"refreshToken" text,
	"idToken" text,
	"accessTokenExpiresAt" timestamp,
	"refreshTokenExpiresAt" timestamp,
	"scope" text,
	"password" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "feedback_insights" (
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
--> statement-breakpoint
CREATE TABLE "mcp_audit_events" (
	"id" text PRIMARY KEY NOT NULL,
	"principal_id" text NOT NULL,
	"token_hash" text NOT NULL,
	"tool_name" text NOT NULL,
	"client_slug" text,
	"ok" boolean NOT NULL,
	"error" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mi_document_impacts" (
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
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mi_insights" (
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
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mi_meeting_artifacts" (
	"id" text PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"meeting_id" text NOT NULL,
	"raw_text" text,
	"summary_text" text,
	"source_payload" jsonb,
	"checksum" text,
	"fetched_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mi_meetings" (
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
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mi_recommendations" (
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
	"converted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "mi_runs" (
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
--> statement-breakpoint
CREATE TABLE "mi_settings" (
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
--> statement-breakpoint
CREATE TABLE "mi_sources" (
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
--> statement-breakpoint
CREATE TABLE "pov_banks" (
	"id" text PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"version" integer DEFAULT 3 NOT NULL,
	"global" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"version_history" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"source" text DEFAULT 'neon' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pov_clarify_patterns" (
	"id" text PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"bank_id" text,
	"pillar_id" text NOT NULL,
	"pattern_type" text NOT NULL,
	"pattern" text NOT NULL,
	"evidence_count" integer DEFAULT 1 NOT NULL,
	"confidence" real,
	"source_refs" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pov_evidence_items" (
	"id" text PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"bank_id" text,
	"pillar_id" text NOT NULL,
	"source_type" text NOT NULL,
	"signal_type" text NOT NULL,
	"statement" text NOT NULL,
	"exact_quote" text,
	"speaker" text,
	"context" text,
	"source_ref" jsonb,
	"privacy" text DEFAULT 'internal_exact_public_anonymous' NOT NULL,
	"status" text DEFAULT 'candidate' NOT NULL,
	"used_in" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pov_pillars" (
	"id" text PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"bank_id" text,
	"pillar_id" text NOT NULL,
	"pillar_name" text,
	"core_belief" text,
	"we_say_yes_to" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"we_say_no_to" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"preferred_angles" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"evidence_we_cite" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pov_update_proposals" (
	"id" text PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"bank_id" text,
	"pillar_id" text,
	"target_field" text NOT NULL,
	"current_value" jsonb,
	"proposed_value" jsonb,
	"rationale" text,
	"evidence_item_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" text DEFAULT 'recommended' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"approved_at" timestamp,
	"rejected_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expiresAt" timestamp NOT NULL,
	"token" text NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	"ipAddress" text,
	"userAgent" text,
	"userId" text NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "shared_doc_comments" (
	"id" text PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"doc_path" text NOT NULL,
	"doc_version" integer,
	"author" text NOT NULL,
	"email" text,
	"body" text NOT NULL,
	"anchor_text" text,
	"anchor_context" text,
	"anchor_doc_offset" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscription" (
	"id" text PRIMARY KEY NOT NULL,
	"createdAt" timestamp NOT NULL,
	"modifiedAt" timestamp,
	"amount" integer NOT NULL,
	"currency" text NOT NULL,
	"recurringInterval" text NOT NULL,
	"status" text NOT NULL,
	"currentPeriodStart" timestamp NOT NULL,
	"currentPeriodEnd" timestamp NOT NULL,
	"cancelAtPeriodEnd" boolean DEFAULT false NOT NULL,
	"canceledAt" timestamp,
	"startedAt" timestamp NOT NULL,
	"endsAt" timestamp,
	"endedAt" timestamp,
	"customerId" text NOT NULL,
	"productId" text NOT NULL,
	"discountId" text,
	"checkoutId" text NOT NULL,
	"customerCancellationReason" text,
	"customerCancellationComment" text,
	"metadata" text,
	"customFieldData" text,
	"userId" text
);
--> statement-breakpoint
CREATE TABLE "tasks" (
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
	"agent" text,
	"skill" text,
	"skills" jsonb,
	"channel" text,
	"deliverable" text,
	"deliverable_file" jsonb,
	"done_criteria" text,
	"depends_on" text,
	"input_documents" jsonb,
	"required_inputs" jsonb,
	"output_documents" jsonb,
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
	"review_date" timestamp
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"emailVerified" boolean DEFAULT false NOT NULL,
	"image" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expiresAt" timestamp NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mi_document_impacts" ADD CONSTRAINT "mi_document_impacts_meeting_id_mi_meetings_id_fk" FOREIGN KEY ("meeting_id") REFERENCES "public"."mi_meetings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mi_document_impacts" ADD CONSTRAINT "mi_document_impacts_insight_id_mi_insights_id_fk" FOREIGN KEY ("insight_id") REFERENCES "public"."mi_insights"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mi_insights" ADD CONSTRAINT "mi_insights_meeting_id_mi_meetings_id_fk" FOREIGN KEY ("meeting_id") REFERENCES "public"."mi_meetings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mi_insights" ADD CONSTRAINT "mi_insights_run_id_mi_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."mi_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mi_meeting_artifacts" ADD CONSTRAINT "mi_meeting_artifacts_meeting_id_mi_meetings_id_fk" FOREIGN KEY ("meeting_id") REFERENCES "public"."mi_meetings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mi_meetings" ADD CONSTRAINT "mi_meetings_run_id_mi_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."mi_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mi_recommendations" ADD CONSTRAINT "mi_recommendations_meeting_id_mi_meetings_id_fk" FOREIGN KEY ("meeting_id") REFERENCES "public"."mi_meetings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mi_recommendations" ADD CONSTRAINT "mi_recommendations_insight_id_mi_insights_id_fk" FOREIGN KEY ("insight_id") REFERENCES "public"."mi_insights"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mi_recommendations" ADD CONSTRAINT "mi_recommendations_impact_id_mi_document_impacts_id_fk" FOREIGN KEY ("impact_id") REFERENCES "public"."mi_document_impacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pov_clarify_patterns" ADD CONSTRAINT "pov_clarify_patterns_bank_id_pov_banks_id_fk" FOREIGN KEY ("bank_id") REFERENCES "public"."pov_banks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pov_evidence_items" ADD CONSTRAINT "pov_evidence_items_bank_id_pov_banks_id_fk" FOREIGN KEY ("bank_id") REFERENCES "public"."pov_banks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pov_pillars" ADD CONSTRAINT "pov_pillars_bank_id_pov_banks_id_fk" FOREIGN KEY ("bank_id") REFERENCES "public"."pov_banks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pov_update_proposals" ADD CONSTRAINT "pov_update_proposals_bank_id_pov_banks_id_fk" FOREIGN KEY ("bank_id") REFERENCES "public"."pov_banks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription" ADD CONSTRAINT "subscription_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_parent_key_fk" FOREIGN KEY ("parent_key") REFERENCES "public"."tasks"("source_key") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "feedback_insights_slug_idx" ON "feedback_insights" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "feedback_insights_slug_status_idx" ON "feedback_insights" USING btree ("slug","status");--> statement-breakpoint
CREATE INDEX "feedback_insights_run_idx" ON "feedback_insights" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "mcp_audit_events_created_at_idx" ON "mcp_audit_events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "mcp_audit_events_principal_idx" ON "mcp_audit_events" USING btree ("principal_id");--> statement-breakpoint
CREATE INDEX "mcp_audit_events_tool_idx" ON "mcp_audit_events" USING btree ("tool_name");--> statement-breakpoint
CREATE INDEX "mcp_audit_events_client_idx" ON "mcp_audit_events" USING btree ("client_slug");--> statement-breakpoint
CREATE INDEX "mcp_audit_events_ok_idx" ON "mcp_audit_events" USING btree ("ok");--> statement-breakpoint
CREATE INDEX "mi_impacts_slug_idx" ON "mi_document_impacts" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "mi_impacts_meeting_idx" ON "mi_document_impacts" USING btree ("meeting_id");--> statement-breakpoint
CREATE INDEX "mi_impacts_document_idx" ON "mi_document_impacts" USING btree ("slug","document_name");--> statement-breakpoint
CREATE INDEX "mi_insights_slug_idx" ON "mi_insights" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "mi_insights_meeting_idx" ON "mi_insights" USING btree ("meeting_id");--> statement-breakpoint
CREATE INDEX "mi_insights_slug_kind_idx" ON "mi_insights" USING btree ("slug","kind");--> statement-breakpoint
CREATE INDEX "mi_insights_slug_status_idx" ON "mi_insights" USING btree ("slug","status");--> statement-breakpoint
CREATE INDEX "mi_artifacts_slug_idx" ON "mi_meeting_artifacts" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "mi_artifacts_meeting_idx" ON "mi_meeting_artifacts" USING btree ("meeting_id");--> statement-breakpoint
CREATE INDEX "mi_meetings_slug_idx" ON "mi_meetings" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "mi_meetings_slug_date_idx" ON "mi_meetings" USING btree ("slug","meeting_date");--> statement-breakpoint
CREATE INDEX "mi_meetings_source_idx" ON "mi_meetings" USING btree ("source_id");--> statement-breakpoint
CREATE INDEX "mi_recommendations_slug_idx" ON "mi_recommendations" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "mi_recommendations_meeting_idx" ON "mi_recommendations" USING btree ("meeting_id");--> statement-breakpoint
CREATE INDEX "mi_recommendations_slug_status_idx" ON "mi_recommendations" USING btree ("slug","status");--> statement-breakpoint
CREATE INDEX "mi_runs_slug_idx" ON "mi_runs" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "mi_runs_slug_status_idx" ON "mi_runs" USING btree ("slug","status");--> statement-breakpoint
CREATE INDEX "mi_settings_slug_idx" ON "mi_settings" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "mi_sources_slug_idx" ON "mi_sources" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "mi_sources_slug_kind_idx" ON "mi_sources" USING btree ("slug","kind");--> statement-breakpoint
CREATE INDEX "pov_banks_slug_idx" ON "pov_banks" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "pov_banks_status_idx" ON "pov_banks" USING btree ("status");--> statement-breakpoint
CREATE INDEX "pov_clarify_patterns_slug_idx" ON "pov_clarify_patterns" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "pov_clarify_patterns_slug_pillar_idx" ON "pov_clarify_patterns" USING btree ("slug","pillar_id");--> statement-breakpoint
CREATE INDEX "pov_clarify_patterns_status_idx" ON "pov_clarify_patterns" USING btree ("slug","status");--> statement-breakpoint
CREATE INDEX "pov_evidence_slug_idx" ON "pov_evidence_items" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "pov_evidence_slug_pillar_idx" ON "pov_evidence_items" USING btree ("slug","pillar_id");--> statement-breakpoint
CREATE INDEX "pov_evidence_source_idx" ON "pov_evidence_items" USING btree ("slug","source_type");--> statement-breakpoint
CREATE INDEX "pov_evidence_status_idx" ON "pov_evidence_items" USING btree ("slug","status");--> statement-breakpoint
CREATE INDEX "pov_pillars_slug_idx" ON "pov_pillars" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "pov_pillars_slug_pillar_idx" ON "pov_pillars" USING btree ("slug","pillar_id");--> statement-breakpoint
CREATE INDEX "pov_pillars_bank_idx" ON "pov_pillars" USING btree ("bank_id");--> statement-breakpoint
CREATE INDEX "pov_update_proposals_slug_idx" ON "pov_update_proposals" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "pov_update_proposals_status_idx" ON "pov_update_proposals" USING btree ("slug","status");--> statement-breakpoint
CREATE INDEX "pov_update_proposals_target_idx" ON "pov_update_proposals" USING btree ("slug","pillar_id","target_field");--> statement-breakpoint
CREATE INDEX "shared_doc_comments_slug_idx" ON "shared_doc_comments" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "shared_doc_comments_slug_doc_idx" ON "shared_doc_comments" USING btree ("slug","doc_path","created_at");--> statement-breakpoint
CREATE INDEX "tasks_workspace_slug_idx" ON "tasks" USING btree ("workspace_slug");--> statement-breakpoint
CREATE INDEX "tasks_brand_slug_idx" ON "tasks" USING btree ("brand_slug");--> statement-breakpoint
CREATE INDEX "tasks_workspace_brand_id_idx" ON "tasks" USING btree ("workspace_slug","brand_slug","id");--> statement-breakpoint
CREATE INDEX "tasks_parent_id_idx" ON "tasks" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "tasks_parent_key_idx" ON "tasks" USING btree ("parent_key");--> statement-breakpoint
CREATE INDEX "tasks_brand_type_idx" ON "tasks" USING btree ("brand_slug","type");--> statement-breakpoint
CREATE INDEX "tasks_brand_status_idx" ON "tasks" USING btree ("brand_slug","status");--> statement-breakpoint
CREATE INDEX "tasks_brand_agent_idx" ON "tasks" USING btree ("brand_slug","agent");--> statement-breakpoint
CREATE INDEX "tasks_brand_pillar_idx" ON "tasks" USING btree ("brand_slug","pillar");--> statement-breakpoint
CREATE INDEX "tasks_idea_id_idx" ON "tasks" USING btree ("idea_id");