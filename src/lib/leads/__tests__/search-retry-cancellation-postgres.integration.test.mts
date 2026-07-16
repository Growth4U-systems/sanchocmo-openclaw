import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import type { Db } from "@/db/drizzle";
import { PostgresExecutionControlRepository } from "@/lib/execution-control/postgres";
import {
  ApolloProviderError,
  createLeadsApolloPeopleSearchEffect,
} from "../search-apollo-binding";
import {
  LEADS_APOLLO_EFFECT_STEP,
  LEADS_SEARCH_HANDLER_VERSION,
  LEADS_SEARCH_OPERATION,
  type LeadsApolloPeopleSearchEffect,
} from "../search-contract-v2";
import {
  admitLeadsSearch,
  cancelLeadsSearch,
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

type SqlClient = ReturnType<typeof postgres>;

interface PostgresFixture {
  sql: SqlClient;
  executionRepository: PostgresExecutionControlRepository;
  productProjectionRepository: PostgresLeadsSearchProjectionRepository;
  suffix: string;
}

interface Deferred<Value> {
  promise: Promise<Value>;
  resolve(value: Value): void;
  reject(error: unknown): void;
}

function deferred<Value>(): Deferred<Value> {
  let resolve!: (value: Value) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<Value>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function migrationStatements(name: string): string[] {
  return fs
    .readFileSync(path.join(process.cwd(), "src/db/migrations", name), "utf8")
    .replace(/--.*$/gm, "")
    .split(";")
    .map((statement) => statement.trim())
    .filter(Boolean);
}

async function withPostgresFixture(
  run: (fixture: PostgresFixture) => Promise<void>,
): Promise<void> {
  const schema = `leads_search_control_${crypto.randomUUID().replaceAll("-", "")}`;
  const suffix = crypto.randomUUID().replaceAll("-", "").slice(0, 12);
  const sql = postgres(databaseUrl as string, { max: 1, onnotice: () => {} });
  const projectionSql = postgres(databaseUrl as string, {
    max: 1,
    onnotice: () => {},
  });
  let projectionConnectionClosed = false;

  try {
    await sql.unsafe(`CREATE SCHEMA "${schema}"`);
    await sql.unsafe(`SET search_path TO "${schema}", public`);
    for (const name of migrations) {
      for (const statement of migrationStatements(name)) {
        await sql.unsafe(statement);
      }
    }
    await projectionSql.unsafe(`SET search_path TO "${schema}", public`);

    const executionDatabase = drizzle(sql) as unknown as Db;
    const projectionDatabase = drizzle(projectionSql) as unknown as Db;
    await run({
      sql,
      executionRepository: new PostgresExecutionControlRepository(
        executionDatabase,
      ),
      productProjectionRepository: new PostgresLeadsSearchProjectionRepository(
        projectionDatabase,
      ),
      suffix,
    });
  } finally {
    try {
      await projectionSql.end();
      projectionConnectionClosed = true;
    } catch {
      // Preserve the authoritative migration/assertion failure.
    }
    try {
      await sql.unsafe("RESET search_path");
      await sql.unsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    } finally {
      await sql.end();
      if (!projectionConnectionClosed) await projectionSql.end();
    }
  }
}

function searchInput(slug: string, requestId: string): AdmitLeadsSearchInput {
  return {
    slug,
    requestId,
    criteria: {
      titles: ["Marketing Director"],
      organizationLocations: ["Spain"],
    },
    limit: 2,
  };
}

function enabledEnvironment(slug: string): LeadsSearchEnvironment {
  return {
    LEADS_SEARCH_EXECUTION_V2: "canary",
    LEADS_SEARCH_V2_SLUGS: slug,
  };
}

const drainEnvironment: LeadsSearchEnvironment = {
  LEADS_SEARCH_EXECUTION_V2: "off",
  LEADS_SEARCH_V2_SLUGS: "",
};

function observeEffectKeys(
  effect: LeadsApolloPeopleSearchEffect,
  observed: string[],
): LeadsApolloPeopleSearchEffect {
  return {
    ...effect,
    async invoke(payload, context) {
      observed.push(context.effectKey);
      return effect.invoke(payload, context);
    },
  };
}

async function makeRetryRunnable(sql: SqlClient, runId: string): Promise<void> {
  // Fast-forward the database clock gate without weakening the production
  // transition: both the run and its durable effect must independently be due.
  await sql`
    UPDATE "execution_effects"
    SET "available_at" =
      (clock_timestamp() AT TIME ZONE 'UTC') - interval '1 millisecond'
    WHERE "run_id" = ${runId}
      AND "status" = 'retry_wait'
  `;
  await sql`
    UPDATE "execution_runs"
    SET "available_at" =
      (clock_timestamp() AT TIME ZONE 'UTC') - interval '1 millisecond'
    WHERE "id" = ${runId}
      AND "status" = 'queued'
  `;
}

test(
  "Apollo 429 retries with bounded backoff on one run/effectKey and projects once",
  { skip: !databaseUrl, timeout: 45_000 },
  async () => {
    await withPostgresFixture(
      async ({
        sql,
        executionRepository,
        productProjectionRepository,
        suffix,
      }) => {
        const slug = `leads-retry-${suffix}`;
        const otherTenant = `leads-retry-other-${suffix}`;
        const apiKey = `apollo-retry-key-${suffix}`;
        const invocationKeys: string[] = [];
        let providerCalls = 0;
        const effect = observeEffectKeys(
          createLeadsApolloPeopleSearchEffect({
            timeoutMs: 5_000,
            transport: async ({ signal }) => {
              providerCalls += 1;
              assert.equal(signal.aborted, false);
              if (providerCalls <= 2) {
                throw new ApolloProviderError(
                  "apollo_http_rejected",
                  429,
                  `retry-request-${providerCalls}`,
                );
              }
              return {
                people: [
                  {
                    id: "apollo-person-after-429",
                    name: "Grace Hopper",
                    title: "Marketing Director",
                  },
                ],
                pagination: { total_entries: 1 },
              };
            },
          }),
          invocationKeys,
        );
        const shared = {
          repository: executionRepository,
          apolloPeopleSearchEffect: effect,
          productProjectionRepository,
          wake: () => undefined,
        };
        const admitted = await admitLeadsSearch(
          searchInput(slug, `retry-${crypto.randomUUID()}`),
          { ...shared, env: enabledEnvironment(slug) },
        );
        const execute = (attempt: number) =>
          processNextLeadsSearchRun(slug, {
            ...shared,
            env: drainEnvironment,
            workerId: `leads-retry-${suffix}-${attempt}`,
            resolveApolloApiKey: async (tenantKey) => {
              assert.equal(tenantKey, slug);
              return apiKey;
            },
          });

        assert.equal(await execute(1), true);
        assert.equal(providerCalls, 1);
        let retryEvents = await sql<
          { attempt: number; delayMs: number; errorCode: string }[]
        >`
          SELECT
            row_number() OVER (ORDER BY "ts", "id")::int AS "attempt",
            ("data"->>'delayMs')::int AS "delayMs",
            "data"->>'errorCode' AS "errorCode"
          FROM "execution_events"
          WHERE "run_id" = ${admitted.runId}
            AND "type" = 'effect.retry_scheduled'
          ORDER BY "ts", "id"
        `;
        assert.equal(retryEvents.length, 1);
        assert.equal(
          retryEvents[0]?.errorCode,
          "apollo_search_provider_unavailable",
        );
        assert.ok((retryEvents[0]?.delayMs ?? -1) >= 0);
        assert.ok(
          (retryEvents[0]?.delayMs ?? Number.POSITIVE_INFINITY) <= 1_000,
        );

        await makeRetryRunnable(sql, admitted.runId);
        assert.equal(await execute(2), true);
        assert.equal(providerCalls, 2);
        retryEvents = await sql<
          { attempt: number; delayMs: number; errorCode: string }[]
        >`
          SELECT
            row_number() OVER (ORDER BY "ts", "id")::int AS "attempt",
            ("data"->>'delayMs')::int AS "delayMs",
            "data"->>'errorCode' AS "errorCode"
          FROM "execution_events"
          WHERE "run_id" = ${admitted.runId}
            AND "type" = 'effect.retry_scheduled'
          ORDER BY "ts", "id"
        `;
        assert.equal(retryEvents.length, 2);
        assert.deepEqual(
          retryEvents.map((event) => event.errorCode),
          [
            "apollo_search_provider_unavailable",
            "apollo_search_provider_unavailable",
          ],
        );
        assert.ok((retryEvents[1]?.delayMs ?? -1) >= 0);
        assert.ok(
          (retryEvents[1]?.delayMs ?? Number.POSITIVE_INFINITY) <= 2_000,
        );

        await makeRetryRunnable(sql, admitted.runId);
        assert.equal(await execute(3), true);
        assert.equal(providerCalls, 3);

        const expectedEffectKey = `${LEADS_SEARCH_OPERATION}:run:${admitted.runId}:step:${LEADS_APOLLO_EFFECT_STEP}:v${LEADS_SEARCH_HANDLER_VERSION}`;
        assert.deepEqual(invocationKeys, [
          expectedEffectKey,
          expectedEffectKey,
          expectedEffectKey,
        ]);
        const [persisted] = await sql<
          {
            runStatus: string;
            handlerAttempt: number;
            effectCount: number;
            effectKey: string;
            effectStatus: string;
            effectAttemptCount: number;
            terminalProjectionCount: number;
            productProjectionCount: number;
          }[]
        >`
          SELECT
            r."status" AS "runStatus",
            r."handler_attempt" AS "handlerAttempt",
            (SELECT count(*)::int FROM "execution_effects" e
              WHERE e."run_id" = r."id") AS "effectCount",
            e."effect_key" AS "effectKey",
            e."status" AS "effectStatus",
            e."attempt_count" AS "effectAttemptCount",
            (SELECT count(*)::int FROM "execution_terminal_projections" p
              WHERE p."run_id" = r."id") AS "terminalProjectionCount",
            (SELECT count(*)::int FROM "leads_search_projections" p
              WHERE p."run_id" = r."id") AS "productProjectionCount"
          FROM "execution_runs" r
          JOIN "execution_effects" e ON e."run_id" = r."id"
          WHERE r."id" = ${admitted.runId}
        `;
        assert.equal(persisted?.runStatus, "completed");
        assert.equal(persisted?.handlerAttempt, 3);
        assert.equal(persisted?.effectCount, 1);
        assert.equal(persisted?.effectKey, expectedEffectKey);
        assert.equal(persisted?.effectStatus, "succeeded");
        assert.equal(persisted?.effectAttemptCount, 3);
        assert.equal(persisted?.terminalProjectionCount, 1);
        assert.equal(persisted?.productProjectionCount, 1);

        const status = await getLeadsSearchStatus(
          { slug, runId: admitted.runId },
          { repository: executionRepository },
        );
        assert.equal(status?.status, "completed");
        assert.equal(
          status?.result?.candidates[0]?.providerId,
          "apollo-person-after-429",
        );
        assert.equal(
          await getLeadsSearchStatus(
            { slug: otherTenant, runId: admitted.runId },
            { repository: executionRepository },
          ),
          null,
        );
        assert.equal(
          await productProjectionRepository.get({
            tenantKey: otherTenant,
            runId: admitted.runId,
          }),
          null,
        );

        assert.equal(await execute(4), false);
        assert.equal(providerCalls, 3);
        const [finalCounts] = await sql<
          { terminalProjectionCount: number; productProjectionCount: number }[]
        >`
          SELECT
            (SELECT count(*)::int FROM "execution_terminal_projections"
              WHERE "run_id" = ${admitted.runId}) AS "terminalProjectionCount",
            (SELECT count(*)::int FROM "leads_search_projections"
              WHERE "run_id" = ${admitted.runId}) AS "productProjectionCount"
        `;
        assert.equal(finalCounts?.terminalProjectionCount, 1);
        assert.equal(finalCounts?.productProjectionCount, 1);
      },
    );
  },
);

test(
  "cancellation during Apollo I/O settles an accepted receipt and never invokes again",
  { skip: !databaseUrl, timeout: 45_000 },
  async () => {
    await withPostgresFixture(
      async ({
        sql,
        executionRepository,
        productProjectionRepository,
        suffix,
      }) => {
        const slug = `leads-cancel-${suffix}`;
        const otherTenant = `leads-cancel-other-${suffix}`;
        const requestId = `cancel-search-${crypto.randomUUID()}`;
        const cancelRequestId = `cancel-ui-${crypto.randomUUID()}`;
        const providerStarted = deferred<void>();
        const releaseProvider = deferred<unknown>();
        const invocationKeys: string[] = [];
        const invocationSignals: AbortSignal[] = [];
        let providerCalls = 0;
        const effect = observeEffectKeys(
          createLeadsApolloPeopleSearchEffect({
            timeoutMs: 10_000,
            transport: async ({ signal }) => {
              providerCalls += 1;
              invocationSignals.push(signal);
              providerStarted.resolve(undefined);
              return releaseProvider.promise;
            },
          }),
          invocationKeys,
        );
        const shared = {
          repository: executionRepository,
          apolloPeopleSearchEffect: effect,
          productProjectionRepository,
          wake: () => undefined,
        };
        const admitted = await admitLeadsSearch(searchInput(slug, requestId), {
          ...shared,
          env: enabledEnvironment(slug),
        });
        const processing = processNextLeadsSearchRun(slug, {
          ...shared,
          env: drainEnvironment,
          workerId: `leads-cancel-${suffix}`,
          resolveApolloApiKey: async () => `apollo-cancel-key-${suffix}`,
        });
        await providerStarted.promise;
        assert.equal(providerCalls, 1);
        assert.equal(invocationSignals[0]?.aborted, false);

        const requested = await cancelLeadsSearch(
          {
            slug,
            runId: admitted.runId,
            requestId: cancelRequestId,
            actorId: "user_martin",
          },
          { repository: executionRepository },
        );
        assert.equal(requested?.disposition, "requested");
        assert.equal(requested?.status, "running");
        assert.equal(requested?.replayed, false);
        assert.equal(
          (
            await getLeadsSearchStatus(
              { slug, runId: admitted.runId },
              { repository: executionRepository },
            )
          )?.status,
          "running",
        );

        releaseProvider.resolve({
          people: [
            {
              id: "apollo-person-accepted-before-cancel-safe-point",
              name: "Katherine Johnson",
              title: "Marketing Director",
            },
          ],
          pagination: { total_entries: 1 },
        });
        assert.equal(await processing, true);

        const expectedEffectKey = `${LEADS_SEARCH_OPERATION}:run:${admitted.runId}:step:${LEADS_APOLLO_EFFECT_STEP}:v${LEADS_SEARCH_HANDLER_VERSION}`;
        assert.deepEqual(invocationKeys, [expectedEffectKey]);
        const finalStatus = await getLeadsSearchStatus(
          { slug, runId: admitted.runId },
          { repository: executionRepository },
        );
        assert.equal(finalStatus?.status, "cancelled");
        assert.equal(finalStatus?.completionBoundary, "ledger_admitted");
        assert.equal(finalStatus?.result, undefined);
        assert.equal(
          await getLeadsSearchStatus(
            { slug: otherTenant, runId: admitted.runId },
            { repository: executionRepository },
          ),
          null,
        );

        const projection = await productProjectionRepository.get({
          tenantKey: slug,
          runId: admitted.runId,
        });
        assert.equal(projection?.terminalStatus, "cancelled");
        assert.equal(projection?.candidateCount, 0);
        assert.equal(projection?.result, null);
        assert.equal(
          await productProjectionRepository.get({
            tenantKey: otherTenant,
            runId: admitted.runId,
          }),
          null,
        );

        const [persisted] = await sql<
          {
            runStatus: string;
            cancelAcknowledged: boolean;
            effectCount: number;
            effectStatus: string;
            effectAttemptCount: number;
            effectKey: string;
            receiptProvider: string;
            receiptPersonId: string;
            terminalProjectionCount: number;
            terminalProjectionStatus: string;
            productProjectionCount: number;
            cancelledEventCount: number;
            cancellationSafePoint: string;
          }[]
        >`
          SELECT
            r."status" AS "runStatus",
            (r."cancel_acknowledged_at" IS NOT NULL) AS "cancelAcknowledged",
            (SELECT count(*)::int FROM "execution_effects" ef
              WHERE ef."run_id" = r."id") AS "effectCount",
            e."status" AS "effectStatus",
            e."attempt_count" AS "effectAttemptCount",
            e."effect_key" AS "effectKey",
            e."receipt"->>'provider' AS "receiptProvider",
            e."receipt"#>>'{candidates,0,providerId}' AS "receiptPersonId",
            (SELECT count(*)::int FROM "execution_terminal_projections" p
              WHERE p."run_id" = r."id") AS "terminalProjectionCount",
            p."terminal_status" AS "terminalProjectionStatus",
            (SELECT count(*)::int FROM "leads_search_projections" lp
              WHERE lp."run_id" = r."id") AS "productProjectionCount",
            (SELECT count(*)::int FROM "execution_events" ev
              WHERE ev."run_id" = r."id"
                AND ev."type" = 'run.cancelled') AS "cancelledEventCount",
            (SELECT ev."data"->>'safePoint' FROM "execution_events" ev
              WHERE ev."run_id" = r."id"
                AND ev."type" = 'run.cancelled'
              ORDER BY ev."ts", ev."id" LIMIT 1) AS "cancellationSafePoint"
          FROM "execution_runs" r
          JOIN "execution_effects" e ON e."run_id" = r."id"
          JOIN "execution_terminal_projections" p ON p."run_id" = r."id"
          WHERE r."id" = ${admitted.runId}
        `;
        assert.equal(persisted?.runStatus, "cancelled");
        assert.equal(persisted?.cancelAcknowledged, true);
        assert.equal(persisted?.effectCount, 1);
        assert.equal(persisted?.effectStatus, "succeeded");
        assert.equal(persisted?.effectAttemptCount, 1);
        assert.equal(persisted?.effectKey, expectedEffectKey);
        assert.equal(persisted?.receiptProvider, "apollo");
        assert.equal(
          persisted?.receiptPersonId,
          "apollo-person-accepted-before-cancel-safe-point",
        );
        assert.equal(persisted?.terminalProjectionCount, 1);
        assert.equal(persisted?.terminalProjectionStatus, "cancelled");
        assert.equal(persisted?.productProjectionCount, 1);
        assert.equal(persisted?.cancelledEventCount, 1);
        assert.equal(persisted?.cancellationSafePoint, "before_finish");

        const replay = await cancelLeadsSearch(
          {
            slug,
            runId: admitted.runId,
            requestId: cancelRequestId,
            actorId: "user_martin",
          },
          { repository: executionRepository },
        );
        assert.equal(replay?.disposition, "cancelled");
        assert.equal(replay?.status, "cancelled");
        assert.equal(replay?.replayed, true);

        assert.equal(
          await processNextLeadsSearchRun(slug, {
            ...shared,
            env: drainEnvironment,
            workerId: `leads-cancel-replay-${suffix}`,
            resolveApolloApiKey: async () => `apollo-cancel-key-${suffix}`,
          }),
          false,
        );
        assert.equal(providerCalls, 1);
        assert.deepEqual(invocationKeys, [expectedEffectKey]);
      },
    );
  },
);
