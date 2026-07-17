-- SAN-480: immutable product projection for the bounded native Leads search.
--
-- Execution lifecycle, retries and provider receipts remain in the generic
-- Ledger. This table is an insert-only, tenant-scoped read model that can be
-- rebuilt from a terminal `leads.search` run.

CREATE TABLE IF NOT EXISTS "leads_search_projections" (
  "run_id" text PRIMARY KEY
    REFERENCES "execution_runs"("id") ON DELETE RESTRICT,
  "tenant_key" text NOT NULL,
  "terminal_status" text NOT NULL,
  "candidate_count" integer NOT NULL DEFAULT 0,
  "result" jsonb,
  "projection_fingerprint" text NOT NULL,
  "projected_at" timestamp NOT NULL
    DEFAULT (clock_timestamp() AT TIME ZONE 'UTC'),

  CONSTRAINT "leads_search_projections_tenant_check"
    CHECK (
      octet_length("tenant_key") BETWEEN 1 AND 128 AND
      "tenant_key" = lower("tenant_key") AND
      "tenant_key" ~ '^[a-z0-9]([a-z0-9._-]*[a-z0-9])?$'
    ),
  CONSTRAINT "leads_search_projections_status_check"
    CHECK ("terminal_status" IN (
      'completed', 'partial', 'failed', 'cancelled'
    )),
  CONSTRAINT "leads_search_projections_candidate_count_check"
    CHECK ("candidate_count" BETWEEN 0 AND 10),
  CONSTRAINT "leads_search_projections_result_check"
    CHECK (
      (
        "terminal_status" = 'completed' AND
        "result" IS NOT NULL AND
        jsonb_typeof("result") = 'object' AND
        octet_length("result"::text) <= 16384
      ) OR (
        "terminal_status" IN ('partial', 'failed', 'cancelled') AND
        "result" IS NULL AND
        "candidate_count" = 0
      )
    ),
  CONSTRAINT "leads_search_projections_fingerprint_check"
    CHECK ("projection_fingerprint" ~ '^[a-f0-9]{64}$')
);

CREATE INDEX IF NOT EXISTS "leads_search_projections_tenant_projected_idx"
  ON "leads_search_projections" (
    "tenant_key", "projected_at" DESC, "run_id" DESC
  );
