ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "brief" text;
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "completion" text;
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "execution_notes" text;

