CREATE TABLE IF NOT EXISTS "shared_doc_comments" (
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

CREATE INDEX IF NOT EXISTS "shared_doc_comments_slug_idx"
  ON "shared_doc_comments" ("slug");
CREATE INDEX IF NOT EXISTS "shared_doc_comments_slug_doc_idx"
  ON "shared_doc_comments" ("slug", "doc_path", "created_at");
