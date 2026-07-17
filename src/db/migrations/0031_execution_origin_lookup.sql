-- SAN-480: bounded reverse lookup for durable work admitted by one MC Chat
-- parent. Cancellation and active-job projection use this server-attested
-- origin; the partial expression index avoids scanning unrelated Ledger runs.

CREATE INDEX IF NOT EXISTS "execution_runs_mc_chat_origin_parent_idx"
  ON "execution_runs" (("metadata" #>> '{executionOrigin,parentAgentRunId}'))
  WHERE "metadata" #>> '{executionOrigin,kind}' = 'mc_chat_parent_run';
