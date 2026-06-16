CREATE TABLE IF NOT EXISTS "intake_submissions" (
  "id" text PRIMARY KEY NOT NULL,
  "slug" text NOT NULL UNIQUE,
  "respondent_name" text NOT NULL,
  "respondent_email" text,
  "answers" jsonb NOT NULL,
  "status" text DEFAULT 'submitted' NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "submitted_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "intake_submissions_slug_idx"
  ON "intake_submissions" ("slug");
