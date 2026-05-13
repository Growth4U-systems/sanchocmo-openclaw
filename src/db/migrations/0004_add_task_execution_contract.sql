ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "agent" text;
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "skills" jsonb;
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "input_documents" jsonb;
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "required_inputs" jsonb;
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "output_documents" jsonb;

CREATE INDEX IF NOT EXISTS "tasks_brand_agent_idx" ON "tasks" ("brand_slug", "agent");
