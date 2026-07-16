import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import type { Db } from "@/db/drizzle";
import { PostgresExecutionControlRepository } from "@/lib/execution-control/postgres";
import { createLeadsApolloPeopleSearchEffect } from "../search-apollo-binding";
import {
  LEADS_APOLLO_EFFECT_STEP,
  LEADS_SEARCH_OPERATION,
} from "../search-contract-v2";
import {
  admitLeadsSearch,
  getLeadsSearchStatus,
  processNextLeadsSearchRun,
  type AdmitLeadsSearchInput,
  type LeadsSearchEnvironment,
} from "../search-durable-worker";
import { PostgresLeadsSearchProjectionRepository } from "../search-projection-postgres";

const databaseUrl =
  process.env.LEADS_SEARCH_POSTGRES_TEST_DATABASE_URL ??
  process.env.AGENT_RUNS_TEST_DATABASE_URL;

const migrations = [
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
  "0029_leads_search_projections.sql",
] as const;

function migrationStatements(name: string): string[] {
  return fs
    .readFileSync(path.join(process.cwd(), "src/db/migrations", name), "utf8")
    .replace(/--.*$/gm, "")
    .split(";")
    .map((statement) => statement.trim())
    .filter(Boolean);
}

test(
  "leads.search completes and projects exactly once on PostgreSQL",
  { skip: !databaseUrl, timeout: 45_000 },
  async () => {
    const schema = `leads_search_e2e_${crypto.randomUUID().replaceAll("-", "")}`;
    const suffix = crypto.randomUUID().replaceAll("-", "").slice(0, 12);
    const slug = `leads-e2e-${suffix}`;
    const otherTenant = `leads-other-${suffix}`;
    const rawRequestId = `browser-request-${crypto.randomUUID()}`;
    const apiKey = `apollo-test-key-${crypto.randomUUID()}`;
    const sql = postgres(databaseUrl as string, {
      max: 1,
      onnotice: () => {},
    });
    const projectionSql = postgres(databaseUrl as string, {
      max: 1,
      onnotice: () => {},
    });
    let projectionConnectionClosed = false;

    try {
      await sql.unsafe(`CREATE SCHEMA "${schema}"`);
      await sql.unsafe(`SET search_path TO "${schema}", public`);

      // The curated migration chain is deliberately re-runnable. Running it
      // twice here catches ordering and fresh-install drift in the real DB.
      for (let pass = 0; pass < 2; pass += 1) {
        for (const name of migrations) {
          for (const statement of migrationStatements(name)) {
            await sql.unsafe(statement);
          }
        }
      }
      await projectionSql.unsafe(`SET search_path TO "${schema}", public`);

      const executionDatabase = drizzle(sql) as unknown as Db;
      const projectionDatabase = drizzle(projectionSql) as unknown as Db;
      const executionRepository = new PostgresExecutionControlRepository(
        executionDatabase,
      );
      const productProjectionRepository =
        new PostgresLeadsSearchProjectionRepository(projectionDatabase);

      let providerCalls = 0;
      let credentialResolutions = 0;
      let chatDeliveryCalls = 0;
      const apolloPeopleSearchEffect = createLeadsApolloPeopleSearchEffect({
        timeoutMs: 5_000,
        transport: async (input) => {
          providerCalls += 1;
          assert.equal(input.apiKey, apiKey);
          assert.equal(input.limit, 2);
          assert.equal(input.page, 1);
          assert.deepEqual(input.criteria.titles, ["Marketing Director"]);
          assert.equal(input.signal.aborted, false);
          return {
            people: [
              {
                id: "apollo-person-postgres-1",
                name: "Ada Lovelace",
                title: "Marketing Director",
                linkedin_url:
                  "https://www.linkedin.com/in/ada-lovelace-postgres",
                organization: {
                  name: "Analytical Engines",
                  primary_domain: "analytical.example",
                },
              },
            ],
            pagination: { total_entries: 1 },
          };
        },
      });
      const enabledEnv: LeadsSearchEnvironment = {
        LEADS_SEARCH_EXECUTION_V2: "canary",
        LEADS_SEARCH_V2_SLUGS: slug,
      };
      const disabledEnv: LeadsSearchEnvironment = {
        LEADS_SEARCH_EXECUTION_V2: "off",
        LEADS_SEARCH_V2_SLUGS: "",
      };
      const command = {
        slug,
        requestId: rawRequestId,
        criteria: {
          titles: ["Marketing Director"],
          organizationLocations: ["Spain"],
        },
        limit: 2,
      } satisfies AdmitLeadsSearchInput;
      const shared = {
        repository: executionRepository,
        apolloPeopleSearchEffect,
        productProjectionRepository,
        deliverChat: async () => {
          chatDeliveryCalls += 1;
        },
        wake: () => undefined,
      };

      const admitted = await admitLeadsSearch(command, {
        ...shared,
        env: enabledEnv,
      });
      assert.equal(admitted.created, true);
      assert.equal(admitted.replayed, false);
      assert.equal(admitted.status, "queued");
      assert.equal(providerCalls, 0, "admission must never call Apollo");
      assert.equal(
        await productProjectionRepository.get({
          tenantKey: slug,
          runId: admitted.runId,
        }),
        null,
      );

      // Rollout is off while draining: the persisted Ledger command remains
      // authoritative and must not be stranded by a later flag change.
      assert.equal(
        await processNextLeadsSearchRun(slug, {
          ...shared,
          env: disabledEnv,
          workerId: `leads-search-e2e-${suffix}`,
          resolveApolloApiKey: async (tenantKey) => {
            credentialResolutions += 1;
            assert.equal(tenantKey, slug);
            return apiKey;
          },
        }),
        true,
      );
      assert.equal(providerCalls, 1);
      assert.equal(credentialResolutions, 1);
      assert.equal(chatDeliveryCalls, 1);

      const status = await getLeadsSearchStatus(
        { slug, runId: admitted.runId },
        { repository: executionRepository },
      );
      assert.equal(status?.status, "completed");
      assert.equal(status?.completionBoundary, "search_completed");
      assert.equal(status?.result?.returned, 1);
      assert.equal(
        status?.result?.candidates[0]?.providerId,
        "apollo-person-postgres-1",
      );

      const projection = await productProjectionRepository.get({
        tenantKey: slug,
        runId: admitted.runId,
      });
      assert.equal(projection?.terminalStatus, "completed");
      assert.equal(projection?.candidateCount, 1);
      assert.equal(projection?.result?.returned, 1);
      assert.equal(
        await productProjectionRepository.get({
          tenantKey: otherTenant,
          runId: admitted.runId,
        }),
        null,
      );
      assert.equal(
        await getLeadsSearchStatus(
          { slug: otherTenant, runId: admitted.runId },
          { repository: executionRepository },
        ),
        null,
      );

      const effects = await sql<
        {
          stepKey: string;
          effectKey: string;
          status: string;
          attemptCount: number;
        }[]
      >`
        SELECT
          "step_key" AS "stepKey",
          "effect_key" AS "effectKey",
          "status",
          "attempt_count" AS "attemptCount"
        FROM "execution_effects"
        WHERE "run_id" = ${admitted.runId}
      `;
      assert.equal(effects.length, 1);
      assert.equal(effects[0]?.stepKey, LEADS_APOLLO_EFFECT_STEP);
      assert.equal(effects[0]?.status, "succeeded");
      assert.equal(effects[0]?.attemptCount, 1);
      assert.ok(effects[0]?.effectKey);

      const [terminalProjection] = await sql<
        { state: string; claimCount: number }[]
      >`
        SELECT "state", "claim_count" AS "claimCount"
        FROM "execution_terminal_projections"
        WHERE "run_id" = ${admitted.runId}
      `;
      assert.equal(terminalProjection?.state, "succeeded");
      assert.equal(terminalProjection?.claimCount, 1);

      const replay = await admitLeadsSearch(command, {
        ...shared,
        env: disabledEnv,
      });
      assert.equal(replay.runId, admitted.runId);
      assert.equal(replay.created, false);
      assert.equal(replay.replayed, true);
      assert.equal(replay.status, "completed");
      assert.equal(replay.result?.returned, 1);

      assert.equal(
        await processNextLeadsSearchRun(slug, {
          ...shared,
          env: disabledEnv,
          workerId: `leads-search-e2e-replay-${suffix}`,
          resolveApolloApiKey: async () => {
            credentialResolutions += 1;
            return apiKey;
          },
        }),
        false,
      );
      assert.equal(
        providerCalls,
        1,
        "idle replay must perform zero provider I/O",
      );
      assert.equal(
        credentialResolutions,
        1,
        "idle replay must not resolve credentials",
      );
      assert.equal(
        chatDeliveryCalls,
        1,
        "idle replay must not redeliver the terminal result",
      );

      const [rowCounts] = await sql<
        { effectCount: number; productProjectionCount: number }[]
      >`
        SELECT
          (SELECT count(*)::int FROM "execution_effects"
            WHERE "run_id" = ${admitted.runId}) AS "effectCount",
          (SELECT count(*)::int FROM "leads_search_projections"
            WHERE "run_id" = ${admitted.runId}) AS "productProjectionCount"
      `;
      assert.equal(rowCounts?.effectCount, 1);
      assert.equal(rowCounts?.productProjectionCount, 1);

      // Inspect every execution-owned row plus the product projection. Raw
      // browser idempotency keys and runtime credentials must never persist.
      const [persisted] = await sql<{ serialized: string }[]>`
        SELECT coalesce(string_agg("row"::text, E'\n'), '') AS "serialized"
        FROM (
          SELECT to_jsonb(r) AS "row" FROM "execution_runs" AS r
          UNION ALL
          SELECT to_jsonb(s) AS "row" FROM "execution_steps" AS s
          UNION ALL
          SELECT to_jsonb(e) AS "row" FROM "execution_events" AS e
          UNION ALL
          SELECT to_jsonb(f) AS "row" FROM "execution_effects" AS f
          UNION ALL
          SELECT to_jsonb(p) AS "row"
            FROM "execution_terminal_projections" AS p
          UNION ALL
          SELECT to_jsonb(l) AS "row"
            FROM "leads_search_projections" AS l
        ) AS persisted_rows
      `;
      const serialized = persisted?.serialized ?? "";
      assert.ok(serialized.includes(LEADS_SEARCH_OPERATION));
      assert.equal(serialized.includes(rawRequestId), false);
      assert.equal(serialized.includes(apiKey), false);
    } finally {
      try {
        await projectionSql.end();
        projectionConnectionClosed = true;
      } catch {
        // The original migration or assertion failure remains authoritative.
      }
      try {
        await sql.unsafe("RESET search_path");
        await sql.unsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      } finally {
        await sql.end();
        if (!projectionConnectionClosed) await projectionSql.end();
      }
    }
  },
);
