-- Comments v2 (SAN-148): threads (1 level), resolve/reopen, and W3C
-- TextQuoteSelector anchoring (exact + prefix/suffix) ported from the
-- g4u-comments base. v1 rows stay valid: they become open root comments
-- without prefix/suffix (re-anchoring works off anchor_text alone, with
-- anchor_doc_offset as the proximity tie-breaker).

ALTER TABLE "shared_doc_comments"
  ADD COLUMN IF NOT EXISTS "parent_id" text,
  ADD COLUMN IF NOT EXISTS "resolved" boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "resolved_at" timestamp,
  ADD COLUMN IF NOT EXISTS "resolved_by" text,
  ADD COLUMN IF NOT EXISTS "anchor_prefix" text,
  ADD COLUMN IF NOT EXISTS "anchor_suffix" text;

CREATE INDEX IF NOT EXISTS "shared_doc_comments_parent_idx"
  ON "shared_doc_comments" ("parent_id");
CREATE INDEX IF NOT EXISTS "shared_doc_comments_open_idx"
  ON "shared_doc_comments" ("slug", "doc_path", "resolved", "created_at");
