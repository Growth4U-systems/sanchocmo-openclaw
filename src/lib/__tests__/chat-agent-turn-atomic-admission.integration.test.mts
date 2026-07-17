import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres, { type Sql } from "postgres";
import type { Db } from "../../db/drizzle";
import {
  admitChatAgentTurnAtomically,
  type AtomicChatAgentTurnAdmissionDependencies,
} from "../chat/agent-turn-atomic-admission";
import {
  agentRunInputFingerprint,
  prepareChatAgentTurnDispatch,
} from "../chat/agent-turn-durable";
import {
  CHAT_AGENT_TURN_AGGREGATE_TYPE,
  CHAT_AGENT_TURN_OPERATION,
} from "../chat/agent-turn-contract-v1";
import type { CreateAgentRunInput } from "../data/agent-runs";
import { PostgresAgentRunsRepository } from "../data/agent-runs-postgres";
import { executionCommandFingerprint } from "../execution-control";

// This suite mutates schema and constraints on purpose. It therefore only
// accepts explicitly disposable integration databases and never falls back to
// the application's DATABASE_URL.
const databaseUrl =
  process.env.CHAT_AGENT_TURN_ATOMIC_TEST_DATABASE_URL ??
  process.env.DURABLE_EXECUTION_ACCEPTANCE_TEST_DATABASE_URL ??
  process.env.EXECUTION_CONTROL_LEASE_TEST_DATABASE_URL ??
  process.env.AGENT_RUNS_TEST_DATABASE_URL;

const migrations = [
  "0018_agent_runs.sql",
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
] as const;

function migrationStatements(name: string): string[] {
  return fs
    .readFileSync(path.join(process.cwd(), "src/db/migrations", name), "utf8")
    .replace(/--.*$/gm, "")
    .split(";")
    .map((statement) => statement.trim())
    .filter(Boolean);
}

function rolloutDependencies(
  slug: string,
  database: Db,
): AtomicChatAgentTurnAdmissionDependencies {
  return {
    database,
    env: {
      CHAT_AGENT_TURN_EXECUTION_V1: "canary",
      CHAT_AGENT_TURN_V1_SLUGS: slug,
      CHAT_AGENT_TURN_DURABLE_WORKER_ENABLED: "1",
    },
  };
}

function parentInput(input: {
  slug: string;
  suffix: string;
  idempotencyKey: string;
}): CreateAgentRunInput {
  const threadId = `${input.slug}:atomic-${input.suffix}`;
  return {
    idempotencyKey: input.idempotencyKey,
    threadId,
    traceId: `trace_atomic_${input.suffix}`,
    runtime: "openclaw",
    agent: "sancho",
    skill: "partnerships",
    skills: ["partnerships", "leads"],
    skillMode: "auto",
    input: {
      slug: input.slug,
      threadId,
      text: "Busca partners de salud capilar en España",
      userId: "martin",
      source: "dashboard",
      scope: "workspace",
    },
    now: new Date("2026-07-16T12:00:00.000Z"),
  };
}

async function setSearchPath(sql: Sql, schema: string): Promise<void> {
  // schema is generated locally from hex only; it is never external input.
  await sql.unsafe(`SET search_path TO "${schema}", public`);
}

test("agent-run input fingerprint matches its JSONB-persisted representation", () => {
  const inMemoryInput = {
    slug: "hospital-capilar",
    docPath: undefined,
    nested: { present: true, omitted: undefined },
    attachments: [undefined, { name: "brief.pdf", optional: undefined }],
  };
  const persistedInput = JSON.parse(JSON.stringify(inMemoryInput)) as unknown;

  assert.equal(
    agentRunInputFingerprint({ input: inMemoryInput }),
    agentRunInputFingerprint({ input: persistedInput }),
  );
  assert.deepEqual(persistedInput, {
    slug: "hospital-capilar",
    nested: { present: true },
    attachments: [null, { name: "brief.pdf" }],
  });
});

test(
  "Postgres admits a chat parent and its durable dispatch as one idempotent command",
  {
    skip: databaseUrl
      ? false
      : "set CHAT_AGENT_TURN_ATOMIC_TEST_DATABASE_URL (or an existing disposable execution test URL)",
    timeout: 45_000,
  },
  async (t) => {
    const schema = `chat_atomic_${crypto.randomUUID().replaceAll("-", "")}`;
    const slug = `tenant-${crypto.randomUUID().slice(0, 8)}`;
    const admin = postgres(databaseUrl as string, {
      max: 1,
      onnotice: () => {},
      connection: { TimeZone: "UTC" },
    });
    const concurrentClients: Sql[] = [];

    try {
      await admin.unsafe(`CREATE SCHEMA "${schema}"`);
      await setSearchPath(admin, schema);
      for (const name of migrations) {
        for (const statement of migrationStatements(name)) {
          await admin.unsafe(statement);
        }
      }

      const database = drizzle(admin) as unknown as Db;
      const dependencies = rolloutDependencies(slug, database);
      const agentRuns = new PostgresAgentRunsRepository(database);

      await t.test(
        "persists the bound parent, command fingerprint and both creation events",
        async () => {
          const suffix = crypto.randomUUID().replaceAll("-", "");
          const input = parentInput({
            slug,
            suffix,
            idempotencyKey: `turn:${suffix}`,
          });
          const receipt = await admitChatAgentTurnAtomically(
            input,
            dependencies,
          );

          assert.equal(receipt.atomic, true);
          assert.equal(receipt.created, true);
          assert.equal(receipt.dispatchCreated, true);
          assert.equal(receipt.run.status, "queued");
          assert.equal(receipt.dispatchRun.status, "queued");
          assert.equal(receipt.dispatchRun.tenantKey, slug);
          assert.equal(receipt.dispatchRun.mode, "canary");
          assert.equal(
            receipt.dispatchRun.aggregateType,
            CHAT_AGENT_TURN_AGGREGATE_TYPE,
          );
          assert.equal(receipt.dispatchRun.aggregateId, receipt.run.id);
          assert.equal(
            receipt.dispatchRun.operation,
            CHAT_AGENT_TURN_OPERATION,
          );
          assert.equal(receipt.dispatchRun.traceId, receipt.run.traceId);

          const command = receipt.dispatchRun.input as Record<string, unknown>;
          assert.deepEqual(command, {
            schemaVersion: 1,
            parentAgentRunId: receipt.run.id,
            parentInputFingerprint: agentRunInputFingerprint(receipt.run),
            slug,
            threadId: receipt.run.threadId,
            agent: receipt.run.agent,
          });

          const prepared = prepareChatAgentTurnDispatch(receipt.run, {
            env: dependencies.env,
          });
          assert.equal(
            receipt.dispatchRun.metadata.executionCommandFingerprint,
            prepared.commandFingerprint,
          );
          assert.equal(
            receipt.dispatchRun.commandFingerprint,
            executionCommandFingerprint({
              tenantKey: receipt.dispatchRun.tenantKey,
              aggregateType: receipt.dispatchRun.aggregateType,
              aggregateId: receipt.dispatchRun.aggregateId,
              operation: receipt.dispatchRun.operation,
              mode: receipt.dispatchRun.mode,
              input: receipt.dispatchRun.input,
              metadata: receipt.dispatchRun.metadata,
            }),
          );

          const [counts] = await admin<
            [
              {
                parents: number;
                parentEvents: number;
                dispatches: number;
                dispatchEvents: number;
              },
            ]
          >`
            SELECT
              (SELECT count(*)::int FROM agent_runs WHERE id = ${receipt.run.id}) AS parents,
              (SELECT count(*)::int FROM agent_run_events WHERE run_id = ${receipt.run.id}) AS "parentEvents",
              (SELECT count(*)::int FROM execution_runs WHERE id = ${receipt.dispatchRun.id}) AS dispatches,
              (SELECT count(*)::int FROM execution_events WHERE run_id = ${receipt.dispatchRun.id}) AS "dispatchEvents"
          `;
          assert.deepEqual(counts, {
            parents: 1,
            parentEvents: 1,
            dispatches: 1,
            dispatchEvents: 1,
          });
        },
      );

      await t.test(
        "binds the dispatch to the JSON-persisted form of optional parent input",
        async () => {
          const suffix = crypto.randomUUID().replaceAll("-", "");
          const base = parentInput({
            slug,
            suffix,
            idempotencyKey: `turn:${suffix}`,
          });
          const input: CreateAgentRunInput = {
            ...base,
            // chat/send builds this object with optional properties set to
            // undefined. JSONB omits them; the dispatch fingerprint must bind
            // to that persisted representation, not an in-memory variant.
            input: {
              ...(base.input as Record<string, unknown>),
              docPath: undefined,
              trigger: undefined,
              threadState: undefined,
            },
          };

          const receipt = await admitChatAgentTurnAtomically(
            input,
            dependencies,
          );
          const persistedInput = receipt.run.input as Record<string, unknown>;
          assert.equal("docPath" in persistedInput, false);
          assert.equal("trigger" in persistedInput, false);
          assert.equal("threadState" in persistedInput, false);
          assert.equal(
            (
              receipt.dispatchRun.input as {
                parentInputFingerprint: string;
              }
            ).parentInputFingerprint,
            agentRunInputFingerprint(receipt.run),
          );
          assert.deepEqual(
            receipt.dispatchRun.input,
            prepareChatAgentTurnDispatch(receipt.run, {
              env: dependencies.env,
            }).command,
          );
        },
      );

      await t.test(
        "concurrent admission and later replay retain exactly one parent and dispatch",
        async () => {
          const suffix = crypto.randomUUID().replaceAll("-", "");
          const input = parentInput({
            slug,
            suffix,
            idempotencyKey: `turn:${suffix}`,
          });
          const clientCount = 8;
          for (let index = 0; index < clientCount; index += 1) {
            const client = postgres(databaseUrl as string, {
              max: 1,
              onnotice: () => {},
              connection: { TimeZone: "UTC" },
            });
            await setSearchPath(client, schema);
            concurrentClients.push(client);
          }

          const receipts = await Promise.all(
            concurrentClients.map((client) =>
              admitChatAgentTurnAtomically(
                input,
                rolloutDependencies(slug, drizzle(client) as unknown as Db),
              ),
            ),
          );
          assert.equal(receipts.filter((receipt) => receipt.created).length, 1);
          assert.equal(
            receipts.filter((receipt) => receipt.dispatchCreated).length,
            1,
          );
          assert.equal(
            new Set(receipts.map((receipt) => receipt.run.id)).size,
            1,
          );
          assert.equal(
            new Set(receipts.map((receipt) => receipt.dispatchRun.id)).size,
            1,
          );
          assert.ok(receipts.every((receipt) => receipt.atomic));

          const replay = await admitChatAgentTurnAtomically(
            input,
            dependencies,
          );
          assert.equal(replay.created, false);
          assert.equal(replay.dispatchCreated, false);
          assert.equal(replay.run.id, receipts[0].run.id);
          assert.equal(replay.dispatchRun.id, receipts[0].dispatchRun.id);

          const [counts] = await admin<
            [
              {
                parents: number;
                parentEvents: number;
                dispatches: number;
                dispatchEvents: number;
              },
            ]
          >`
            SELECT
              (SELECT count(*)::int FROM agent_runs WHERE thread_id = ${input.threadId}) AS parents,
              (SELECT count(*)::int FROM agent_run_events WHERE thread_id = ${input.threadId}) AS "parentEvents",
              (SELECT count(*)::int FROM execution_runs WHERE aggregate_id = ${receipts[0].run.id}) AS dispatches,
              (SELECT count(*)::int FROM execution_events WHERE run_id = ${receipts[0].dispatchRun.id}) AS "dispatchEvents"
          `;
          assert.deepEqual(counts, {
            parents: 1,
            parentEvents: 1,
            dispatches: 1,
            dispatchEvents: 1,
          });
        },
      );

      await t.test(
        "a failed parent releases the key and retry creates a new atomic pair",
        async () => {
          const suffix = crypto.randomUUID().replaceAll("-", "");
          const input = parentInput({
            slug,
            suffix,
            idempotencyKey: `turn:${suffix}`,
          });
          const first = await admitChatAgentTurnAtomically(input, dependencies);
          const failed = await agentRuns.markFailed(
            first.run.id,
            first.run.threadId,
            "synthetic terminal failure",
          );
          assert.equal(failed?.status, "failed");

          const retry = await admitChatAgentTurnAtomically(input, dependencies);
          assert.equal(retry.atomic, true);
          assert.equal(retry.created, true);
          assert.equal(retry.dispatchCreated, true);
          assert.notEqual(retry.run.id, first.run.id);
          assert.notEqual(retry.dispatchRun.id, first.dispatchRun.id);
          assert.equal(retry.dispatchRun.aggregateId, retry.run.id);
          assert.equal(
            (retry.dispatchRun.input as Record<string, unknown>)
              .parentAgentRunId,
            retry.run.id,
          );

          const [counts] = await admin<
            [
              {
                parents: number;
                parentCreatedEvents: number;
                dispatches: number;
                dispatchCreatedEvents: number;
              },
            ]
          >`
            SELECT
              (SELECT count(*)::int FROM agent_runs WHERE thread_id = ${input.threadId}) AS parents,
              (SELECT count(*)::int FROM agent_run_events WHERE thread_id = ${input.threadId} AND type = 'run_created') AS "parentCreatedEvents",
              (SELECT count(*)::int FROM execution_runs WHERE operation = ${CHAT_AGENT_TURN_OPERATION} AND aggregate_id IN (
                SELECT id FROM agent_runs WHERE thread_id = ${input.threadId}
              )) AS dispatches,
              (SELECT count(*)::int FROM execution_events WHERE type = 'run.created' AND run_id IN (
                SELECT id FROM execution_runs WHERE operation = ${CHAT_AGENT_TURN_OPERATION} AND aggregate_id IN (
                  SELECT id FROM agent_runs WHERE thread_id = ${input.threadId}
                )
              )) AS "dispatchCreatedEvents"
          `;
          assert.deepEqual(counts, {
            parents: 2,
            parentCreatedEvents: 2,
            dispatches: 2,
            dispatchCreatedEvents: 2,
          });
        },
      );

      await t.test(
        "an active idempotency key rejects a different parent input fingerprint",
        async () => {
          const suffix = crypto.randomUUID().replaceAll("-", "");
          const input = parentInput({
            slug,
            suffix,
            idempotencyKey: `turn:${suffix}`,
          });
          const first = await admitChatAgentTurnAtomically(input, dependencies);
          const changedInput: CreateAgentRunInput = {
            ...input,
            input: {
              ...(input.input as Record<string, unknown>),
              text: "Busca leads distintos con la misma clave",
            },
          };

          await assert.rejects(
            admitChatAgentTurnAtomically(changedInput, dependencies),
            (error: unknown) =>
              Boolean(
                error &&
                  typeof error === "object" &&
                  "code" in error &&
                  (error as { code?: unknown }).code ===
                    "chat_agent_turn_idempotency_conflict",
              ),
          );

          const [counts] = await admin<
            [{ parents: number; dispatches: number }]
          >`
            SELECT
              (SELECT count(*)::int FROM agent_runs WHERE thread_id = ${input.threadId}) AS parents,
              (SELECT count(*)::int FROM execution_runs WHERE operation = ${CHAT_AGENT_TURN_OPERATION} AND aggregate_id = ${first.run.id}) AS dispatches
          `;
          assert.deepEqual(counts, { parents: 1, dispatches: 1 });
        },
      );

      await t.test(
        "a rejected dispatch insert rolls back the parent and parent event",
        async () => {
          await admin.unsafe(`
            ALTER TABLE execution_runs
            ADD CONSTRAINT reject_chat_agent_turn_for_atomicity_test
            CHECK (operation <> '${CHAT_AGENT_TURN_OPERATION}') NOT VALID
          `);
          const suffix = crypto.randomUUID().replaceAll("-", "");
          const input = parentInput({
            slug,
            suffix,
            idempotencyKey: `turn:${suffix}`,
          });

          // Drizzle intentionally wraps driver errors and its public message
          // need not expose the underlying constraint name. The zero-row
          // assertions below prove that this rejection rolled back the CTE.
          await assert.rejects(
            admitChatAgentTurnAtomically(input, dependencies),
          );

          const [counts] = await admin<
            [{ parents: number; parentEvents: number; dispatches: number }]
          >`
            SELECT
              (SELECT count(*)::int FROM agent_runs WHERE thread_id = ${input.threadId}) AS parents,
              (SELECT count(*)::int FROM agent_run_events WHERE thread_id = ${input.threadId}) AS "parentEvents",
              (SELECT count(*)::int FROM execution_runs
                WHERE operation = ${CHAT_AGENT_TURN_OPERATION}
                  AND trace_id = ${input.traceId ?? null}) AS dispatches
          `;
          assert.deepEqual(counts, {
            parents: 0,
            parentEvents: 0,
            dispatches: 0,
          });
        },
      );
    } finally {
      await Promise.allSettled(
        concurrentClients.map((client) => client.end({ timeout: 5 })),
      );
      await admin.unsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await admin.end({ timeout: 5 });
    }
  },
);
