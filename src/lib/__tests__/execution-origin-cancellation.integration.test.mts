import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import type { Db } from "../../db/drizzle";
import { durableExecutionMcChatOrigin } from "../durable-execution/execution-origin";
import { requestExecutionOriginCancellation } from "../durable-execution/origin-cancellation";
import { PostgresExecutionControlRepository } from "../execution-control/postgres";
import type {
  ExecutionRun,
  ExecutionRunMode,
  ExecutionRunStatus,
} from "../execution-control/types";

const databaseUrl =
  process.env.EXECUTION_CONTROL_ORIGIN_TEST_DATABASE_URL ??
  process.env.EXECUTION_CONTROL_CANCELLATION_TEST_DATABASE_URL ??
  process.env.EXECUTION_CONTROL_LEASE_TEST_DATABASE_URL ??
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
  "0030_execution_utc_timestamps.sql",
  "0031_execution_origin_lookup.sql",
  "0032_execution_origin_tombstones.sql",
];

function migration(name: string): string[] {
  return fs
    .readFileSync(path.join(process.cwd(), "src/db/migrations", name), "utf8")
    .replace(/--.*$/gm, "")
    .split(";")
    .map((statement) => statement.trim())
    .filter(Boolean);
}

test(
  "Postgres execution-origin lookup is isolated, bounded and cancellation-safe",
  { skip: !databaseUrl, timeout: 60_000 },
  async (t) => {
    const suiteSchema = `execution_origin_${crypto.randomUUID().replaceAll("-", "")}`;
    const adminSql = postgres(databaseUrl as string, {
      max: 1,
      onnotice: () => {},
    });
    const sql = postgres(databaseUrl as string, {
      max: 12,
      onnotice: () => {},
      connection: { search_path: `${suiteSchema},public` },
    });
    const repository = new PostgresExecutionControlRepository(
      drizzle(sql) as unknown as Db,
    );
    const operation = `contract.execution-origin.${crypto.randomUUID()}`;

    async function createOriginRun(options: {
      tenantKey: string;
      parentAgentRunId: string;
      mode?: ExecutionRunMode;
      status?: ExecutionRunStatus;
    }): Promise<ExecutionRun> {
      const mode = options.mode ?? "canary";
      const { run } = await repository.createRunWithTrustedOrigin({
        command: {
          tenantKey: options.tenantKey,
          idempotencyKey: `command:${crypto.randomUUID()}`,
          aggregateType: "contract.origin-child",
          aggregateId: crypto.randomUUID(),
          operation,
          mode,
          input: { fixture: "origin-cancellation" },
        },
        origin: durableExecutionMcChatOrigin(options.parentAgentRunId),
      });
      if (!options.status || options.status === "queued") return run;

      const claim = await repository.claimRun({
        tenantKey: run.tenantKey,
        operation,
        mode,
        runId: run.id,
        workerId: `origin-fixture-${crypto.randomUUID()}`,
        leaseMs: 30_000,
      });
      assert.ok(claim);
      if (options.status === "running") return claim.run;
      assert.ok(
        ["completed", "partial", "failed"].includes(options.status),
        `unsupported fixture status: ${options.status}`,
      );
      const finished = await repository.finishRun({
        tenantKey: run.tenantKey,
        operation,
        mode,
        runId: run.id,
        token: claim.token,
        status: options.status as "completed" | "partial" | "failed",
        eventType: `run.${options.status}`,
      });
      assert.ok(finished);
      return finished;
    }

    try {
      await adminSql.unsafe(`CREATE SCHEMA "${suiteSchema}"`);
      await sql.begin(async (migrationSql) => {
        await migrationSql`SELECT pg_advisory_xact_lock(hashtext('sancho_execution_control_migrations'))`;
        for (const name of migrations) {
          for (const statement of migration(name)) {
            await migrationSql.unsafe(statement);
          }
        }
      });

      await t.test(
        "exact tenant and parent lookup feeds terminal, queued and running cancellation semantics",
        async () => {
          const parentAgentRunId = "run-parent-origin-a";
          const completed = await createOriginRun({
            tenantKey: "tenant-a",
            parentAgentRunId,
            status: "completed",
          });
          const queued = await createOriginRun({
            tenantKey: "tenant-a",
            parentAgentRunId,
            mode: "active",
          });
          const running = await createOriginRun({
            tenantKey: "tenant-a",
            parentAgentRunId,
            status: "running",
          });
          const otherParent = await createOriginRun({
            tenantKey: "tenant-a",
            parentAgentRunId: "run-parent-origin-b",
          });
          const otherTenant = await createOriginRun({
            tenantKey: "tenant-b",
            parentAgentRunId,
          });
          const shadow = await createOriginRun({
            tenantKey: "tenant-a",
            parentAgentRunId,
            mode: "shadow",
          });

          const exact = await repository.listRunsByExecutionOrigin({
            tenantKey: "TENANT-A",
            parentAgentRunId,
            limit: 10,
          });
          assert.deepEqual(
            new Set(exact.map(({ id }) => id)),
            new Set([completed.id, queued.id, running.id, shadow.id]),
          );
          assert.deepEqual(
            (
              await repository.listRunsByExecutionOrigin({
                tenantKey: "tenant-a",
                parentAgentRunId: "run-parent-origin-b",
                limit: 10,
              })
            ).map(({ id }) => id),
            [otherParent.id],
          );
          assert.deepEqual(
            (
              await repository.listRunsByExecutionOrigin({
                tenantKey: "tenant-b",
                parentAgentRunId,
                limit: 10,
              })
            ).map(({ id }) => id),
            [otherTenant.id],
          );
          const activeOnly = await repository.listRunsByExecutionOriginPage({
            tenantKey: "tenant-a",
            parentAgentRunId,
            statuses: ["queued", "running", "waiting_approval", "blocked"],
            limit: 10,
          });
          assert.deepEqual(
            new Set(activeOnly.runs.map(({ id }) => id)),
            new Set([queued.id, running.id, shadow.id]),
            "the server-side filter must exclude terminal history before applying the limit",
          );
          await assert.rejects(
            repository.listRunsByExecutionOriginPage({
              tenantKey: "tenant-a",
              parentAgentRunId,
              statuses: [] as ExecutionRunStatus[],
              limit: 10,
            }),
            /invalid run status filter/,
          );
          await assert.rejects(
            repository.listRunsByExecutionOriginPage({
              tenantKey: "tenant-a",
              parentAgentRunId,
              statuses: ["foreign_status" as ExecutionRunStatus],
              limit: 10,
            }),
            /invalid run status filter/,
          );
          const result = await requestExecutionOriginCancellation(
            {
              tenantKey: "tenant-a",
              parentAgentRunId,
              actor: { type: "user", id: "user:martin-fila" },
              reasonCode: "user_requested",
            },
            repository,
          );
          assert.deepEqual(
            new Set(result.requestedRunIds),
            new Set([queued.id, running.id, shadow.id]),
          );
          assert.deepEqual(result.pendingRunIds, [running.id]);
          assert.equal(
            (await repository.getRunById(completed.id))?.status,
            "completed",
          );
          assert.equal(
            (await repository.getRunById(queued.id))?.status,
            "cancelled",
          );
          const requestedRunning = await repository.getRunById(running.id);
          assert.equal(requestedRunning?.status, "running");
          assert.ok(requestedRunning?.cancelRequestId);

          const replay = await requestExecutionOriginCancellation(
            {
              tenantKey: "tenant-a",
              parentAgentRunId,
              actor: { type: "user", id: "user:martin-fila" },
              reasonCode: "user_requested",
            },
            repository,
          );
          assert.deepEqual(replay.requestedRunIds, []);
          assert.deepEqual(replay.pendingRunIds, [running.id]);
          assert.equal(replay.originCancellation.replayed, true);
          assert.equal(
            (await repository.getRunById(running.id))?.cancelRequestId,
            requestedRunning?.cancelRequestId,
          );
          assert.equal(
            (await repository.listEvents(running.id)).filter(
              ({ type }) => type === "run.cancellation_requested",
            ).length,
            1,
          );
        },
      );

      await t.test(
        "pagination cancels every child when one parent exceeds 100 children",
        async () => {
          const parentAgentRunId = "run-parent-origin-overflow";
          const children = await Promise.all(
            Array.from({ length: 101 }, () =>
              createOriginRun({
                tenantKey: "tenant-overflow",
                parentAgentRunId,
              }),
            ),
          );

          await assert.rejects(
            repository.listRunsByExecutionOrigin({
              tenantKey: "tenant-overflow",
              parentAgentRunId,
              limit: 100,
            }),
            /execution origin fanout requires pagination/,
          );
          const cancellation = await requestExecutionOriginCancellation(
            {
              tenantKey: "tenant-overflow",
              parentAgentRunId,
              actor: { type: "system", id: "chat-cancel-worker" },
            },
            repository,
          );
          assert.equal(cancellation.children.length, 101);
          assert.equal(cancellation.requestedRunIds.length, 101);
          assert.equal(
            (await repository.getRunById(children[0]!.id))?.status,
            "cancelled",
          );

          const indexes = await sql<{ indexdef: string }[]>`
            SELECT "indexdef"
            FROM pg_indexes
            WHERE schemaname = ${suiteSchema}
              AND indexname = 'execution_run_origins_root_run_idx'
          `;
          assert.equal(indexes.length, 1);
          assert.match(indexes[0]!.indexdef, /parent_agent_run_id/);
          assert.match(indexes[0]!.indexdef, /run_id/);
        },
      );
    } finally {
      await sql.end({ timeout: 5 });
      await adminSql.unsafe(`DROP SCHEMA IF EXISTS "${suiteSchema}" CASCADE`);
      await adminSql.end({ timeout: 5 });
    }
  },
);
