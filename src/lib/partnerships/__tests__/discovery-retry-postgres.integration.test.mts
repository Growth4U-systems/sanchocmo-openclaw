import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import type { Db } from "@/db/drizzle";
import { DEFAULT_CREATOR_MODEL_CONFIG } from "@/lib/calc-creator-core";
import { PostgresExecutionControlRepository } from "@/lib/execution-control/postgres";
import type { DiscoverySearchRecord } from "../discovery-types";

const databaseUrl =
  process.env.EXECUTION_CONTROL_LEASE_TEST_DATABASE_URL ??
  process.env.AGENT_RUNS_TEST_DATABASE_URL;

function migration(name: string): string[] {
  return fs
    .readFileSync(path.join(process.cwd(), "src/db/migrations", name), "utf8")
    .replace(/--.*$/gm, "")
    .split(";")
    .map((statement) => statement.trim())
    .filter(Boolean);
}

test(
  "two PostgreSQL retry processes create one generation and one executable run",
  { skip: !databaseUrl, timeout: 30_000 },
  async () => {
    const workspace = fs.mkdtempSync(
      path.join(os.tmpdir(), "sancho-pg-retry-"),
    );
    process.env.MC_WORKSPACE = workspace;
    process.env.MC_TASKS_BACKEND = "json";
    process.env.YALC_BASE_URL = "http://yalc.pg-retry.test";
    const slug = `retry-${crypto.randomUUID()}`;
    const searchId = `ds-${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`;
    const env = {
      PARTNERSHIPS_DISCOVERY_EXECUTION_V2: "canary",
      PARTNERSHIPS_DISCOVERY_V2_SLUGS: slug,
      PARTNERSHIPS_DISCOVERY_ARTIFACT_STORE: "local-persistent-single-host",
    };
    const suiteSchema = `partnerships_retry_${crypto.randomUUID().replaceAll("-", "")}`;
    const adminSql = postgres(databaseUrl as string, {
      max: 1,
      onnotice: () => {},
    });
    const sql = postgres(databaseUrl as string, {
      max: 10,
      onnotice: () => {},
      connection: { search_path: `${suiteSchema},public` },
    });
    const secondSql = postgres(databaseUrl as string, {
      max: 10,
      onnotice: () => {},
      connection: { search_path: `${suiteSchema},public` },
    });
    const repository = new PostgresExecutionControlRepository(
      drizzle(sql) as unknown as Db,
    );
    const secondRepository = new PostgresExecutionControlRepository(
      drizzle(secondSql) as unknown as Db,
    );
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ ok: true, overrides: {} }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })) as typeof fetch;

    try {
      await adminSql.unsafe(`CREATE SCHEMA "${suiteSchema}"`);
      await sql.begin(async (migrationSql) => {
        await migrationSql`SELECT pg_advisory_xact_lock(hashtext('sancho_execution_control_migrations'))`;
        for (const name of [
          "0019_execution_control.sql",
          "0020_execution_tenant_scope.sql",
          "0021_execution_leases.sql",
          "0022_execution_command_fingerprint.sql",
          "0023_execution_drain.sql",
          "0024_execution_tenant_contract.sql",
          "0025_execution_effects.sql",
          "0026_execution_cancellation.sql",
          "0027_execution_terminal_projections.sql",
          "0028_execution_run_blocking.sql",
        ]) {
          for (const statement of migration(name)) {
            await migrationSql.unsafe(statement);
          }
        }
      });
      const store = await import("../discovery-store");
      const observer = await import("../discovery-execution-observer");
      const worker = await import("../discovery-durable-worker");
      let record: DiscoverySearchRecord = {
        id: searchId,
        slug,
        commandId: `command-${searchId}`,
        executionIntent: "fixtures",
        executionControl: {
          mode: "canary",
          admittedAt: "2026-07-16T10:00:00.000Z",
          generation: 1,
        },
        executionModelConfig: JSON.parse(
          JSON.stringify(DEFAULT_CREATOR_MODEL_CONFIG),
        ),
        title: "Postgres retry",
        plan: {
          title: "Postgres retry",
          sectors: ["salud capilar"],
          networks: ["instagram"],
          tiers: ["micro"],
          targetVolume: 1,
        },
        campaignId: `campaign-${searchId}`,
        projectId: null,
        taskId: null,
        threadId: null,
        runner: {
          status: "queued",
          mode: "fixtures",
          attempts: 1,
          queuedAt: "2026-07-16T10:00:00.000Z",
          startedAt: null,
          finishedAt: null,
          error: null,
          stats: null,
        },
        createdAt: "2026-07-16T10:00:00.000Z",
        updatedAt: "2026-07-16T10:00:00.000Z",
      };
      record = store.saveSearch(record);
      const observed = await observer.observeDiscoveryExecutionCreated(record, {
        repository,
        env,
      });
      assert.ok(observed.runId);
      assert.ok(observed.commandFingerprint);
      record = store.bindSearchExecutionRun(slug, searchId, {
        generation: 1,
        runId: observed.runId!,
        commandFingerprint: observed.commandFingerprint,
      }).search;
      await repository.transitionRun(
        observed.runId!,
        {
          status: "failed",
          expectedStatus: "queued",
          error: "provider timeout",
        },
        "discovery.failed",
      );
      record = store.updateRunnerState(slug, searchId, {
        status: "error",
        error: "stale JSON timeout",
        errorCode: "provider_timeout",
        retryable: true,
      });

      const [left, right] = await Promise.all([
        worker.requestDiscoverySearchRun(
          { slug, searchId, fixtures: true },
          { repository, env },
        ),
        worker.requestDiscoverySearchRun(
          { slug, searchId, fixtures: true },
          { repository: secondRepository, env },
        ),
      ]);
      assert.equal(left.executionControl?.generation, 2);
      assert.equal(right.executionControl?.generation, 2);
      assert.equal(left.executionControl?.runId, right.executionControl?.runId);

      const [count] = await sql<{ count: string }[]>`
        SELECT count(*)::text AS "count"
        FROM "execution_runs"
        WHERE "tenant_key" = ${slug}
          AND "aggregate_type" = 'partnerships.search'
          AND "aggregate_id" = ${`${slug}:${searchId}`}
          AND "operation" = 'partnerships.discovery'
          AND "mode" = 'canary'
          AND ("input"->>'executionGeneration')::int = 2
      `;
      assert.equal(Number(count?.count ?? 0), 1);
    } finally {
      globalThis.fetch = originalFetch;
      try {
        await sql`
          DELETE FROM "execution_runs"
          WHERE "tenant_key" = ${slug}
            AND "operation" = 'partnerships.discovery'
        `;
      } catch {
        // Migration/connectivity failure is already surfaced by the test body.
      }
      await Promise.all([sql.end(), secondSql.end()]);
      await adminSql.unsafe(`DROP SCHEMA IF EXISTS "${suiteSchema}" CASCADE`);
      await adminSql.end({ timeout: 5 });
      fs.rmSync(workspace, { recursive: true, force: true });
    }
  },
);
