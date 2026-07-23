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
  type AtomicChatAgentTurnAdmissionReceipt,
} from "../chat/agent-turn-atomic-admission";
import {
  authorizeChatAgentTurnRuntimeRequest,
  claimNextChatAgentTurn,
  completeChatAgentTurnRuntime,
  markChatAgentTurnRuntimeStarted,
  type ChatAgentTurnRemoteClaim,
  type ChatAgentTurnRemoteDependencies,
  type ChatAgentTurnRuntimeAuthority,
} from "../chat/agent-turn-remote-worker";
import { CHAT_AGENT_TURN_OPERATION } from "../chat/agent-turn-contract-v1";
import type { CreateAgentRunInput } from "../data/agent-runs";
import { PostgresAgentRunsRepository } from "../data/agent-runs-postgres";
import { PostgresExecutionControlRepository } from "../execution-control";
import { authorizeRuntimeRunRequest } from "../runtime/runtime-run-request-authority";

// This suite mutates schema state and expires leases directly. It therefore
// only accepts an explicitly disposable integration database and never the
// application's general DATABASE_URL.
const databaseUrl =
  process.env.CHAT_AGENT_TURN_LIFECYCLE_TEST_DATABASE_URL ??
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

async function setSearchPath(sql: Sql, schema: string): Promise<void> {
  // schema is generated locally from UUID hex only.
  await sql.unsafe(`SET search_path TO "${schema}", public`);
}

function admissionDependencies(
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

function parentInput(slug: string, suffix: string): CreateAgentRunInput {
  const threadId = `${slug}:lifecycle-${suffix}`;
  return {
    idempotencyKey: `turn:${suffix}`,
    threadId,
    traceId: `trace_lifecycle_${suffix}`,
    runtime: "openclaw",
    agent: "sancho",
    skill: "partnerships",
    skills: ["partnerships", "leads"],
    skillMode: "auto",
    input: {
      slug,
      threadId,
      text: "Busca partners de salud capilar en Espana",
      userId: "martin",
      userName: "Martin",
      source: "dashboard",
      scope: "workspace",
      senderRole: "admin",
      isAdmin: true,
      runtimeDispatchMode: "ledger-v1",
    },
  };
}

test(
  "durable chat agent turns preserve lifecycle, recovery and cancellation invariants in Postgres",
  {
    skip: databaseUrl
      ? false
      : "set CHAT_AGENT_TURN_LIFECYCLE_TEST_DATABASE_URL (or an existing disposable execution test URL)",
    timeout: 60_000,
  },
  async (t) => {
    const schema = `chat_lifecycle_${crypto.randomUUID().replaceAll("-", "")}`;
    const slug = `tenant-${crypto.randomUUID().slice(0, 8)}`;
    const sql = postgres(databaseUrl as string, {
      max: 1,
      onnotice: () => {},
      connection: { TimeZone: "UTC" },
    });

    try {
      await sql.unsafe(`CREATE SCHEMA "${schema}"`);
      await setSearchPath(sql, schema);
      for (const name of migrations) {
        for (const statement of migrationStatements(name)) {
          await sql.unsafe(statement);
        }
      }

      const database = drizzle(sql) as unknown as Db;
      const agentRuns = new PostgresAgentRunsRepository(database);
      const executions = new PostgresExecutionControlRepository(database);
      const baseRemoteDependencies: ChatAgentTurnRemoteDependencies = {
        repository: executions,
        resolveParentRun: (runId) => agentRuns.getById(runId),
        markParentStarted: (runId, threadId, data) =>
          agentRuns.markDispatched(runId, threadId, data),
        markParentFailed: (runId, threadId, error, type, data) =>
          agentRuns.markFailed(runId, threadId, error, type, data),
        markParentCancelled: (runId, threadId, data) =>
          agentRuns.markCancelled(runId, threadId, data),
      };

      async function admit(): Promise<AtomicChatAgentTurnAdmissionReceipt> {
        const suffix = crypto.randomUUID().replaceAll("-", "");
        return admitChatAgentTurnAtomically(
          parentInput(slug, suffix),
          admissionDependencies(slug, database),
        );
      }

      async function claim(
        workerId: string,
        dependencies: ChatAgentTurnRemoteDependencies = baseRemoteDependencies,
      ): Promise<ChatAgentTurnRemoteClaim> {
        const claimed = await claimNextChatAgentTurn(workerId, dependencies);
        assert.ok(claimed, `expected ${workerId} to claim a durable turn`);
        return claimed;
      }

      async function authorize(
        claimed: ChatAgentTurnRemoteClaim,
        options: {
          allowTerminalParent?: boolean;
          allowCancellationRequested?: boolean;
        } = {},
      ): Promise<ChatAgentTurnRuntimeAuthority> {
        const authority = await authorizeChatAgentTurnRuntimeRequest(
          {
            parentAgentRunId: claimed.parentAgentRunId,
            dispatchRunId: claimed.dispatchRunId,
            leaseToken: claimed.leaseToken,
            runtimeToolCapability: claimed.runtimeToolCapability,
            ...options,
          },
          baseRemoteDependencies,
        );
        assert.ok(authority, "expected the exact dispatch lease to authorize");
        return authority;
      }

      async function expireLease(dispatchRunId: string): Promise<void> {
        await sql`
          UPDATE execution_runs
          SET lease_expires_at = clock_timestamp() - interval '1 second'
          WHERE id = ${dispatchRunId}
        `;
      }

      async function expireRecoveryGrace(dispatchRunId: string): Promise<void> {
        await sql`
          UPDATE execution_runs
          SET available_at = clock_timestamp() - interval '1 second'
          WHERE id = ${dispatchRunId}
            AND status = 'queued'
            AND current_step = 'terminal_recovery_wait'
        `;
      }

      await t.test(
        "atomically admits, authorizes tools, commits runtime and completes both ledgers",
        async () => {
          const admission = await admit();
          assert.equal(admission.created, true);
          assert.equal(admission.dispatchCreated, true);
          assert.equal(admission.dispatchRun.aggregateId, admission.run.id);

          const claimed = await claim("lifecycle-worker-happy");
          assert.equal(claimed.parentAgentRunId, admission.run.id);
          assert.equal(claimed.dispatchRunId, admission.dispatchRun.id);
          assert.equal(claimed.recovered, false);

          const runtimeAuthority = await authorize(claimed);
          assert.equal(
            runtimeAuthority.dispatchRun.currentStep,
            "runtime_claimed",
          );
          assert.deepEqual(runtimeAuthority.dispatchRun.output, {
            stage: "runtime_claimed",
            parentAgentRunId: admission.run.id,
            workerId: "lifecycle-worker-happy",
          });

          const started = await markChatAgentTurnRuntimeStarted(
            runtimeAuthority,
            baseRemoteDependencies,
          );
          assert.equal(started?.status, "running");
          const committed = await executions.getRunById(
            admission.dispatchRun.id,
          );
          assert.equal(committed?.currentStep, "runtime_committed");
          assert.deepEqual(committed?.output, {
            stage: "runtime_committed",
            parentAgentRunId: admission.run.id,
            workerId: "lifecycle-worker-happy",
          });

          const centralToolAuthority = await authorizeRuntimeRunRequest(
            {
              runId: claimed.parentAgentRunId,
              capability: claimed.runtimeToolCapability,
              dispatchRunId: claimed.dispatchRunId,
              dispatchLeaseToken: claimed.leaseToken,
            },
            {
              resolveAgentRun: (runId) => agentRuns.getById(runId),
              authorizeDispatchLease: (input) =>
                authorizeChatAgentTurnRuntimeRequest(
                  input,
                  baseRemoteDependencies,
                ),
            },
          );
          assert.equal(centralToolAuthority?.run.id, admission.run.id);
          assert.equal(centralToolAuthority?.slug, slug);

          const completedParent = await agentRuns.markCompleted(
            admission.run.id,
            admission.run.threadId,
            { text: "20 partners encontrados" },
          );
          assert.equal(completedParent?.status, "completed");
          const completionAuthority = await authorize(claimed, {
            allowTerminalParent: true,
          });
          const completedDispatch = await completeChatAgentTurnRuntime(
            completionAuthority,
            baseRemoteDependencies,
          );
          assert.equal(completedDispatch?.status, "completed");
          assert.equal(completedDispatch?.currentStep, "runtime_finished");
          assert.deepEqual(completedDispatch?.output, {
            completionBoundary: "runtime_finished",
            parentAgentRunId: admission.run.id,
            parentStatus: "completed",
          });
        },
      );

      await t.test(
        "an expired pre-commit lease is reclaimed and the stale token is fenced",
        async () => {
          const admission = await admit();
          const firstClaim = await claim("lifecycle-worker-precommit-1");
          assert.equal(
            (await executions.getRunById(admission.dispatchRun.id))
              ?.currentStep,
            "runtime_claimed",
          );
          await expireLease(admission.dispatchRun.id);

          const secondClaim = await claim("lifecycle-worker-precommit-2");
          assert.equal(secondClaim.dispatchRunId, firstClaim.dispatchRunId);
          assert.equal(
            secondClaim.parentAgentRunId,
            firstClaim.parentAgentRunId,
          );
          assert.equal(secondClaim.recovered, true);
          assert.notEqual(secondClaim.leaseToken, firstClaim.leaseToken);
          assert.equal(
            await authorizeChatAgentTurnRuntimeRequest(
              {
                parentAgentRunId: firstClaim.parentAgentRunId,
                dispatchRunId: firstClaim.dispatchRunId,
                leaseToken: firstClaim.leaseToken,
                runtimeToolCapability: firstClaim.runtimeToolCapability,
              },
              baseRemoteDependencies,
            ),
            null,
          );

          await agentRuns.markCompleted(
            admission.run.id,
            admission.run.threadId,
            { recoveredBeforeRuntimeCommit: true },
          );
          const completionAuthority = await authorize(secondClaim, {
            allowTerminalParent: true,
          });
          assert.equal(
            (
              await completeChatAgentTurnRuntime(
                completionAuthority,
                baseRemoteDependencies,
              )
            )?.status,
            "completed",
          );
          assert.equal(
            (await executions.getRunById(admission.dispatchRun.id))?.claimCount,
            2,
          );
        },
      );

      await t.test(
        "an expired post-commit lease grants callback recovery before projecting loss",
        async () => {
          const admission = await admit();
          const firstClaim = await claim("lifecycle-worker-postcommit-1");
          const runtimeAuthority = await authorize(firstClaim);
          assert.equal(
            (
              await markChatAgentTurnRuntimeStarted(
                runtimeAuthority,
                baseRemoteDependencies,
              )
            )?.status,
            "running",
          );
          await expireLease(admission.dispatchRun.id);

          const recoveryOrder: string[] = [];
          let projectedMessage = "";
          const recoveryDependencies: ChatAgentTurnRemoteDependencies = {
            ...baseRemoteDependencies,
            projectCommittedRuntimeLoss: ({
              parentRun,
              dispatchRun,
              message,
            }) => {
              recoveryOrder.push("project");
              projectedMessage = message;
              assert.equal(parentRun.id, admission.run.id);
              assert.equal(dispatchRun.id, admission.dispatchRun.id);
            },
            markParentFailed: async (runId, threadId, error, type, data) => {
              recoveryOrder.push("fail");
              return agentRuns.markFailed(runId, threadId, error, type, data);
            },
          };
          const graceClaim = await claimNextChatAgentTurn(
            "lifecycle-worker-postcommit-2",
            recoveryDependencies,
          );
          assert.equal(graceClaim, null);
          assert.deepEqual(recoveryOrder, []);
          assert.equal(
            (await agentRuns.getById(admission.run.id))?.status,
            "running",
          );
          const waitingDispatch = await executions.getRunById(
            admission.dispatchRun.id,
          );
          assert.equal(waitingDispatch?.claimCount, 2);
          assert.equal(waitingDispatch?.status, "queued");
          assert.equal(
            waitingDispatch?.currentStep,
            "terminal_recovery_wait",
          );

          await expireRecoveryGrace(admission.dispatchRun.id);
          const redelivery = await claimNextChatAgentTurn(
            "lifecycle-worker-postcommit-3",
            recoveryDependencies,
          );
          assert.equal(redelivery, null);
          assert.deepEqual(recoveryOrder, ["project", "fail"]);
          assert.match(projectedMessage, /No lo reejecut[eé]/);

          const failedParent = await agentRuns.getById(admission.run.id);
          assert.equal(failedParent?.status, "failed");
          assert.equal(failedParent?.error, projectedMessage);
          const recoveredDispatch = await executions.getRunById(
            admission.dispatchRun.id,
          );
          assert.equal(recoveredDispatch?.claimCount, 3);
          assert.equal(recoveredDispatch?.status, "completed");
          assert.deepEqual(recoveredDispatch?.output, {
            completionBoundary: "runtime_finished",
            parentAgentRunId: admission.run.id,
            parentStatus: "failed",
          });

          assert.equal(
            await claimNextChatAgentTurn(
              "lifecycle-worker-postcommit-4",
              recoveryDependencies,
            ),
            null,
          );
          assert.deepEqual(recoveryOrder, ["project", "fail"]);
        },
      );

      await t.test(
        "a running cancellation is observable, fences tools and is acknowledged at the abort safe point",
        async () => {
          const admission = await admit();
          const claimed = await claim("lifecycle-worker-cancel");
          const runtimeAuthority = await authorize(claimed);
          await markChatAgentTurnRuntimeStarted(
            runtimeAuthority,
            baseRemoteDependencies,
          );

          const cancellationId = `cancel_${crypto
            .createHash("sha256")
            .update(admission.run.id)
            .digest("hex")
            .slice(0, 32)}`;
          const requested = await executions.requestRunCancellation({
            tenantKey: slug,
            operation: CHAT_AGENT_TURN_OPERATION,
            mode: "canary",
            runId: admission.dispatchRun.id,
            cancellationId,
            actor: { type: "user", id: "martin" },
            reasonCode: "user_requested",
          });
          assert.equal(requested?.disposition, "requested");
          assert.equal(requested?.run.status, "running");
          assert.equal(requested?.run.cancelRequestId, cancellationId);

          assert.equal(
            await authorizeChatAgentTurnRuntimeRequest(
              {
                parentAgentRunId: claimed.parentAgentRunId,
                dispatchRunId: claimed.dispatchRunId,
                leaseToken: claimed.leaseToken,
                runtimeToolCapability: claimed.runtimeToolCapability,
              },
              baseRemoteDependencies,
            ),
            null,
          );
          const cancellationAuthority = await authorize(claimed, {
            allowCancellationRequested: true,
          });
          assert.equal(
            cancellationAuthority.dispatchRun.cancelRequestId,
            cancellationId,
          );
          assert.ok(cancellationAuthority.dispatchRun.cancelRequestedAt);

          const cancelledParent = await agentRuns.markCancelled(
            admission.run.id,
            admission.run.threadId,
            { cancellationId, reasonCode: "user_requested" },
          );
          assert.equal(cancelledParent?.status, "cancelled");
          const cancelledDispatch = await completeChatAgentTurnRuntime(
            cancellationAuthority,
            baseRemoteDependencies,
          );
          assert.equal(cancelledDispatch?.status, "cancelled");
          assert.equal(cancelledDispatch?.cancelRequestId, cancellationId);
          assert.ok(cancelledDispatch?.cancelAcknowledgedAt);
          assert.equal(cancelledDispatch?.leaseOwner, undefined);

          const events = await executions.listEvents(admission.dispatchRun.id);
          const cancellationEvent = events.find(
            (event) => event.type === "run.cancelled",
          );
          assert.deepEqual(cancellationEvent?.data, {
            cancellationId,
            actor: { type: "user", id: "martin" },
            reasonCode: "user_requested",
            safePoint: "runtime_abort_observed",
            cooperative: true,
          });
        },
      );

      await t.test(
        "an expired cancellation request closes the parent-to-dispatch crash window without redelivery",
        async () => {
          const admission = await admit();
          const firstClaim = await claim("lifecycle-worker-cancel-crash-1");
          const cancellationId = `cancel_${crypto
            .createHash("sha256")
            .update(`crash\0${admission.run.id}`)
            .digest("hex")
            .slice(0, 32)}`;
          const requested = await executions.requestRunCancellation({
            tenantKey: slug,
            operation: CHAT_AGENT_TURN_OPERATION,
            mode: "canary",
            runId: admission.dispatchRun.id,
            cancellationId,
            actor: { type: "user", id: "martin" },
            reasonCode: "user_requested",
          });
          assert.equal(requested?.disposition, "requested");
          assert.equal(
            (await agentRuns.getById(admission.run.id))?.status,
            "queued",
            "simulates a crash before cancel.ts terminalizes the parent",
          );
          await expireLease(admission.dispatchRun.id);

          const redelivery = await claimNextChatAgentTurn(
            "lifecycle-worker-cancel-crash-2",
            baseRemoteDependencies,
          );
          assert.equal(redelivery, null);
          assert.equal(
            (await agentRuns.getById(admission.run.id))?.status,
            "cancelled",
          );
          const cancelledDispatch = await executions.getRunById(
            admission.dispatchRun.id,
          );
          assert.equal(cancelledDispatch?.status, "cancelled");
          assert.equal(cancelledDispatch?.claimCount, 2);
          assert.equal(cancelledDispatch?.cancelRequestId, cancellationId);
          assert.ok(cancelledDispatch?.cancelAcknowledgedAt);
          assert.equal(cancelledDispatch?.leaseOwner, undefined);
          assert.equal(
            await authorizeChatAgentTurnRuntimeRequest(
              {
                parentAgentRunId: firstClaim.parentAgentRunId,
                dispatchRunId: firstClaim.dispatchRunId,
                leaseToken: firstClaim.leaseToken,
                runtimeToolCapability: firstClaim.runtimeToolCapability,
                allowTerminalParent: true,
                allowCancellationRequested: true,
              },
              baseRemoteDependencies,
            ),
            null,
            "the recovered lease rotates and permanently fences the dead worker",
          );
        },
      );
    } finally {
      await sql.unsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await sql.end({ timeout: 5 });
    }
  },
);
