CREATE TABLE IF NOT EXISTS "task_route_proposals" (
  "id" text PRIMARY KEY NOT NULL,
  "client_slug" text NOT NULL,
  "source_thread_id" text NOT NULL,
  "group_id" text NOT NULL,
  "agent" text NOT NULL,
  "skill" text,
  "skills" jsonb,
  "name" text NOT NULL,
  "brief" text NOT NULL,
  "candidate_task_ids" jsonb,
  "created_at" timestamp NOT NULL,
  "expires_at" timestamp NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "task_route_proposals_source_idx"
  ON "task_route_proposals" ("client_slug", "source_thread_id");

CREATE INDEX IF NOT EXISTS "task_route_proposals_expires_idx"
  ON "task_route_proposals" ("expires_at");
