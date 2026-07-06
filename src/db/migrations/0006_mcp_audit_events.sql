CREATE TABLE IF NOT EXISTS "mcp_audit_events" (
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

CREATE INDEX IF NOT EXISTS "mcp_audit_events_created_at_idx"
  ON "mcp_audit_events" ("created_at");
CREATE INDEX IF NOT EXISTS "mcp_audit_events_principal_idx"
  ON "mcp_audit_events" ("principal_id");
CREATE INDEX IF NOT EXISTS "mcp_audit_events_tool_idx"
  ON "mcp_audit_events" ("tool_name");
CREATE INDEX IF NOT EXISTS "mcp_audit_events_client_idx"
  ON "mcp_audit_events" ("client_slug");
CREATE INDEX IF NOT EXISTS "mcp_audit_events_ok_idx"
  ON "mcp_audit_events" ("ok");
