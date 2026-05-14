CREATE TABLE IF NOT EXISTS "pov_banks" (
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

CREATE TABLE IF NOT EXISTS "pov_pillars" (
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
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "pov_pillars_bank_id_pov_banks_id_fk" FOREIGN KEY ("bank_id") REFERENCES "pov_banks"("id") ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "pov_evidence_items" (
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
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "pov_evidence_items_bank_id_pov_banks_id_fk" FOREIGN KEY ("bank_id") REFERENCES "pov_banks"("id") ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "pov_clarify_patterns" (
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
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "pov_clarify_patterns_bank_id_pov_banks_id_fk" FOREIGN KEY ("bank_id") REFERENCES "pov_banks"("id") ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "pov_update_proposals" (
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
  "rejected_at" timestamp,
  CONSTRAINT "pov_update_proposals_bank_id_pov_banks_id_fk" FOREIGN KEY ("bank_id") REFERENCES "pov_banks"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "pov_banks_slug_idx" ON "pov_banks" ("slug");
CREATE INDEX IF NOT EXISTS "pov_banks_status_idx" ON "pov_banks" ("status");
CREATE INDEX IF NOT EXISTS "pov_pillars_slug_idx" ON "pov_pillars" ("slug");
CREATE INDEX IF NOT EXISTS "pov_pillars_slug_pillar_idx" ON "pov_pillars" ("slug", "pillar_id");
CREATE INDEX IF NOT EXISTS "pov_pillars_bank_idx" ON "pov_pillars" ("bank_id");
CREATE INDEX IF NOT EXISTS "pov_evidence_slug_idx" ON "pov_evidence_items" ("slug");
CREATE INDEX IF NOT EXISTS "pov_evidence_slug_pillar_idx" ON "pov_evidence_items" ("slug", "pillar_id");
CREATE INDEX IF NOT EXISTS "pov_evidence_source_idx" ON "pov_evidence_items" ("slug", "source_type");
CREATE INDEX IF NOT EXISTS "pov_evidence_status_idx" ON "pov_evidence_items" ("slug", "status");
CREATE INDEX IF NOT EXISTS "pov_clarify_patterns_slug_idx" ON "pov_clarify_patterns" ("slug");
CREATE INDEX IF NOT EXISTS "pov_clarify_patterns_slug_pillar_idx" ON "pov_clarify_patterns" ("slug", "pillar_id");
CREATE INDEX IF NOT EXISTS "pov_clarify_patterns_status_idx" ON "pov_clarify_patterns" ("slug", "status");
CREATE INDEX IF NOT EXISTS "pov_update_proposals_slug_idx" ON "pov_update_proposals" ("slug");
CREATE INDEX IF NOT EXISTS "pov_update_proposals_status_idx" ON "pov_update_proposals" ("slug", "status");
CREATE INDEX IF NOT EXISTS "pov_update_proposals_target_idx" ON "pov_update_proposals" ("slug", "pillar_id", "target_field");
