import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const mod = await import("../agent-runs");
const agentRuns = (mod as unknown as { default: typeof mod }).default ?? mod;

test("agent-run backend fails closed in production and never silently falls back", () => {
  assert.throws(
    () => agentRuns.resolveAgentRunsBackend({ NODE_ENV: "production" }),
    /requires DATABASE_URL/,
  );
  assert.throws(
    () => agentRuns.resolveAgentRunsBackend({
      NODE_ENV: "production",
      SANCHO_AGENT_RUNS_BACKEND: "json",
    }),
    /non-durable in production/,
  );
  assert.equal(agentRuns.resolveAgentRunsBackend({
    NODE_ENV: "production",
    SANCHO_AGENT_RUNS_BACKEND: "json",
    SANCHO_AGENT_RUNS_ALLOW_NON_DURABLE: "true",
  }), "json");
  assert.equal(agentRuns.resolveAgentRunsBackend({
    NODE_ENV: "production",
    DATABASE_URL: "postgresql://example.invalid/db",
  }), "postgres");
  assert.throws(
    () => agentRuns.resolveAgentRunsBackend({ SANCHO_AGENT_RUNS_BACKEND: "db" }),
    /requires DATABASE_URL/,
  );
});

test("agent-run migration encodes durable ordering, correlation and retry idempotency", () => {
  const sql = fs.readFileSync(
    path.join(process.cwd(), "src/db/migrations/0018_agent_runs.sql"),
    "utf8",
  );
  assert.match(sql, /CREATE TABLE IF NOT EXISTS "agent_runs"/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS "agent_run_events"/);
  assert.match(sql, /"sequence" bigserial NOT NULL/);
  assert.match(sql, /"trace_id" text/);
  assert.match(sql, /FOREIGN KEY \("run_id"\).*REFERENCES "agent_runs"/s);
  assert.match(
    sql,
    /CREATE UNIQUE INDEX IF NOT EXISTS "agent_runs_thread_idempotency_idx"[\s\S]*"status" IN \('queued', 'running', 'completed'\)/,
  );
});
