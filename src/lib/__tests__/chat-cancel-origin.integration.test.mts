import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import type { NextApiRequest, NextApiResponse } from "next";
import postgres from "postgres";

const databaseUrl = process.env.CHAT_CANCEL_ORIGIN_TEST_DATABASE_URL;
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

function response() {
  const state: { status: number; body?: Record<string, unknown> } = {
    status: 200,
  };
  const res = {
    status(code: number) {
      state.status = code;
      return this;
    },
    json(body: Record<string, unknown>) {
      state.body = body;
      return this;
    },
  } as unknown as NextApiResponse;
  return { state, res };
}

test(
  "Stop reaches a running durable child after its Hermes parent completed",
  {
    skip: databaseUrl
      ? false
      : "set CHAT_CANCEL_ORIGIN_TEST_DATABASE_URL to a disposable Postgres database",
    timeout: 45_000,
  },
  async () => {
    const workspace = fs.mkdtempSync(
      path.join(os.tmpdir(), "sancho-chat-cancel-origin-"),
    );
    process.env.DATABASE_URL = databaseUrl;
    process.env.DATABASE_DRIVER = "postgres-js";
    process.env.MC_WORKSPACE = workspace;
    process.env.MC_TASKS_BACKEND = "json";
    process.env.SANCHO_AGENT_RUNS_BACKEND = "db";
    process.env.SANCHO_RUNTIME = "hermes";
    process.env.HERMES_GATEWAY_URL = "http://hermes.invalid";
    process.env.HERMES_BRIDGE_SECRET = "cancel-origin-hermes-secret";
    process.env.MC_CHAT_SECRET = "cancel-origin-secret";

    const sql = postgres(databaseUrl as string, {
      max: 1,
      onnotice: () => {},
      connection: { TimeZone: "UTC" },
    });
    let parentRunId = "";
    let agentChildRunId = "";
    let childRunId = "";
    let closeApplicationDatabase: (() => Promise<void>) | undefined;
    try {
      for (const name of migrations) {
        for (const statement of migrationStatements(name)) {
          await sql.unsafe(statement);
        }
      }
      const [
        agentRuns,
        executionControl,
        durableExecution,
        runtimeOrigin,
        api,
        db,
      ] = await Promise.all([
        import("@/lib/data/agent-runs"),
        import("@/lib/execution-control"),
        import("@/lib/durable-execution"),
        import("@/lib/runtime/mc-chat-execution-origin"),
        import("@/pages/api/chat/cancel"),
        import("@/db/drizzle"),
      ]);
      closeApplicationDatabase = db.closeDbForTests;
      const threadId = `hospital-capilar:cancel-origin-${Date.now()}`;
      const parent = await agentRuns.createAgentRunAsync({
        threadId,
        runtime: "hermes",
        agent: "sancho",
        input: {
          slug: "hospital-capilar",
          threadId,
          text: "Busca partners",
          userId: "mc-admin",
          userName: "Martin Fila",
          isAdmin: true,
          senderRole: "admin",
          readOnly: false,
          runtimeEffectMode: "execution-origin-v1",
        },
      });
      parentRunId = parent.id;
      const agentChildThreadId = `${threadId}-child`;
      const agentChild = await agentRuns.createAgentRunAsync({
        threadId: agentChildThreadId,
        runtime: "hermes",
        agent: "rocinante",
        activeParent: { runId: parent.id, threadId },
        input: {
          slug: "hospital-capilar",
          threadId: agentChildThreadId,
          controlParentAgentRunId: parent.id,
          controlParentThreadId: threadId,
        },
      });
      agentChildRunId = agentChild.id;
      await agentRuns.markAgentRunDispatchedAsync(
        agentChild.id,
        agentChild.threadId,
      );
      await agentRuns.markAgentRunCompletedAsync(parent.id, threadId, {
        text: "La búsqueda continúa en segundo plano.",
      });

      const repository =
        new executionControl.PostgresExecutionControlRepository();
      const child = await repository.createRunWithTrustedOrigin({
        command: {
          tenantKey: "hospital-capilar",
          idempotencyKey: `child:${parent.id}`,
          aggregateType: "fixture.external_search",
          aggregateId: parent.id,
          operation: "fixture.external_search.execute",
          mode: "canary",
          input: { fixture: "running-child" },
        },
        origin: durableExecution.durableExecutionMcChatOrigin(parent.id),
      });
      childRunId = child.run.id;
      const childLease = await repository.claimRun({
        tenantKey: "hospital-capilar",
        operation: "fixture.external_search.execute",
        mode: "canary",
        runId: child.run.id,
        workerId: "cancel-origin-child",
        leaseMs: 30_000,
      });
      assert.ok(childLease);

      const first = response();
      await api.cancelHandler(
        {
          method: "POST",
          headers: {},
          query: {},
          body: {
            slug: "hospital-capilar",
            threadId,
            runId: parent.id,
            agent: "sancho",
          },
          ctx: {
            isAdmin: true,
            clientSlug: null,
            allowedSlugs: null,
            adminToken: null,
            portalClient: null,
            identity: {
              name: "Martin Fila",
              email: "martin@example.test",
            },
          },
        } as unknown as NextApiRequest,
        first.res,
      );
      assert.equal(first.state.status, 200, JSON.stringify(first.state.body));
      assert.equal(first.state.body?.cancellationPending, true);
      assert.equal(first.state.body?.childCount, 2);
      assert.equal(first.state.body?.childCancellationCount, 2);
      assert.equal(first.state.body?.agentRunChildCount, 1);
      assert.equal(first.state.body?.agentRunChildCancellationCount, 1);
      assert.equal(first.state.body?.agentRunChildRuntimeCancellationCount, 1);
      assert.equal(
        first.state.body?.agentRunChildRuntimeCancellationUnavailable,
        false,
      );
      assert.equal(
        (await agentRuns.getAgentRunByIdAsync(parent.id))?.status,
        "completed",
      );
      assert.equal(
        (await agentRuns.getAgentRunByIdAsync(agentChild.id))?.status,
        "cancelled",
      );
      const requestedChild = await repository.getRunById(child.run.id);
      assert.equal(requestedChild?.status, "running");
      assert.ok(requestedChild?.cancelRequestId);
      assert.equal(
        (await agentRuns.listAgentRunEventsAsync(parent.id)).filter(
          ({ type }) => type === "cancel_requested",
        ).length,
        1,
      );

      const acknowledged = await repository.acknowledgeRunCancellation?.({
        tenantKey: "hospital-capilar",
        operation: "fixture.external_search.execute",
        mode: "canary",
        runId: child.run.id,
        token: childLease.token,
        cancellationId: requestedChild!.cancelRequestId!,
        safePoint: "fixture_abort_observed",
      });
      assert.equal(acknowledged?.run.status, "cancelled");
      assert.equal(
        await runtimeOrigin.resolveMcChatExecutionOrigin(acknowledged!.run),
        null,
      );

      const replay = response();
      await api.cancelHandler(
        {
          method: "POST",
          headers: {},
          query: {},
          body: {
            slug: "hospital-capilar",
            threadId,
            runId: parent.id,
            agent: "sancho",
          },
          ctx: {
            isAdmin: true,
            clientSlug: null,
            allowedSlugs: null,
            adminToken: null,
            portalClient: null,
            identity: { name: "Martin Fila", email: null },
          },
        } as unknown as NextApiRequest,
        replay.res,
      );
      assert.equal(replay.state.status, 200);
      assert.equal(replay.state.body?.alreadyStopped, true);
      assert.equal(replay.state.body?.cancellationPending, false);
      assert.equal(
        (await agentRuns.listAgentRunEventsAsync(parent.id)).filter(
          ({ type }) => type === "cancel_requested",
        ).length,
        1,
      );
    } finally {
      if (childRunId) {
        await sql`
          DELETE FROM execution_runs
          WHERE id = ${childRunId}
        `;
      }
      if (parentRunId) {
        await sql`
          DELETE FROM execution_origins
          WHERE tenant_key = 'hospital-capilar'
            AND kind = 'mc_chat_parent_run'
            AND parent_agent_run_id = ${parentRunId}
        `;
        await sql`
          DELETE FROM agent_runs
          WHERE id IN (${agentChildRunId || "missing-child"}, ${parentRunId})
        `;
      }
      await closeApplicationDatabase?.();
      await sql.end({ timeout: 5 });
      fs.rmSync(workspace, { recursive: true, force: true });
    }
  },
);
