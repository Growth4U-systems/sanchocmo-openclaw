import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import type { NextApiRequest, NextApiResponse } from "next";

process.env.SANCHO_RUNTIME_TERMINAL_GRANT_SECRET =
  "durable-send-terminal-grant-secret".padEnd(64, "x");
import postgres from "postgres";

const databaseUrl = process.env.CHAT_AGENT_TURN_SEND_TEST_DATABASE_URL;
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

function browserRequest(
  threadId: string,
  idempotencyKey: string,
  text = "Busca partners de salud capilar en España",
): NextApiRequest {
  return {
    method: "POST",
    query: {},
    headers: {
      "x-request-id": `trace-${idempotencyKey}`,
    },
    body: {
      slug: "hospital-capilar",
      threadId,
      threadName: "Partnerships canary",
      text,
      userName: "Martin",
      agent: "sancho",
      scope: "agent",
      skillMode: "auto",
      idempotencyKey,
      _source: "mission-control-chat",
    },
    ctx: {
      isAdmin: true,
      clientSlug: null,
      allowedSlugs: null,
      adminToken: null,
      portalClient: null,
      identity: { name: "Martin", email: "martin@example.test" },
    },
  } as unknown as NextApiRequest;
}

test(
  "chat/send returns only after durable parent+dispatch admission and replays without gateway delivery",
  {
    skip: databaseUrl
      ? false
      : "set CHAT_AGENT_TURN_SEND_TEST_DATABASE_URL to a disposable Postgres database",
    timeout: 45_000,
  },
  async () => {
    const workspace = fs.mkdtempSync(
      path.join(os.tmpdir(), "sancho-chat-send-durable-"),
    );
    let closeApplicationDatabase: (() => Promise<void>) | undefined;
    process.env.DATABASE_URL = databaseUrl;
    process.env.DATABASE_DRIVER = "postgres-js";
    process.env.MC_WORKSPACE = workspace;
    process.env.MC_TASKS_BACKEND = "json";
    process.env.SANCHO_AGENT_RUNS_BACKEND = "db";
    process.env.SANCHO_RUNTIME = "openclaw";
    process.env.MC_CHAT_SECRET = "integration-runtime-secret";
    process.env.MC_CHAT_GATEWAY = "http://127.0.0.1:1";
    process.env.CHAT_AGENT_TURN_EXECUTION_V1 = "canary";
    process.env.CHAT_AGENT_TURN_V1_SLUGS = "hospital-capilar";
    process.env.CHAT_AGENT_TURN_DURABLE_WORKER_ENABLED = "1";

    const sql = postgres(databaseUrl as string, {
      max: 1,
      onnotice: () => {},
      connection: { TimeZone: "UTC" },
    });
    try {
      for (const name of migrations) {
        for (const statement of migrationStatements(name)) {
          await sql.unsafe(statement);
        }
      }

      const [
        { sendHandler },
        { cancelHandler },
        { addMessage, getThread },
        { closeDbForTests },
      ] = await Promise.all([
        import("@/pages/api/chat/send"),
        import("@/pages/api/chat/cancel"),
        import("@/lib/data/mc-chat"),
        import("@/db/drizzle"),
      ]);
      closeApplicationDatabase = closeDbForTests;
      const threadId = "hospital-capilar:partnerships-ledger-canary";
      const idempotencyKey = "browser-partnerships-ledger-canary-1";

      const first = response();
      await sendHandler(browserRequest(threadId, idempotencyKey), first.res);
      assert.equal(first.state.status, 202);
      assert.equal(first.state.body?.ok, true);
      assert.equal(first.state.body?.durable, true);
      assert.equal(first.state.body?.status, "queued");
      assert.equal(typeof first.state.body?.runId, "string");
      assert.equal(typeof first.state.body?.dispatchRunId, "string");

      const replay = response();
      await sendHandler(browserRequest(threadId, idempotencyKey), replay.res);
      assert.equal(replay.state.status, 200);
      assert.equal(replay.state.body?.duplicate, true);
      assert.equal(replay.state.body?.durable, true);
      assert.equal(replay.state.body?.runId, first.state.body?.runId);
      assert.equal(
        replay.state.body?.dispatchRunId,
        first.state.body?.dispatchRunId,
      );

      const drift = response();
      await sendHandler(
        browserRequest(
          threadId,
          idempotencyKey,
          "Busca partners de salud capilar en Francia",
        ),
        drift.res,
      );
      assert.equal(drift.state.status, 409);
      assert.equal(
        drift.state.body?.code,
        "chat_agent_turn_idempotency_conflict",
      );
      assert.equal(drift.state.body?.retryable, false);

      const [counts] = await sql<
        [
          {
            parents: number;
            dispatches: number;
            parentEvents: number;
            dispatchEvents: number;
          },
        ]
      >`
        SELECT
          (SELECT count(*)::int FROM agent_runs WHERE thread_id = ${threadId}) AS parents,
          (SELECT count(*)::int FROM execution_runs WHERE aggregate_id = ${first.state.body?.runId as string}) AS dispatches,
          (SELECT count(*)::int FROM agent_run_events WHERE run_id = ${first.state.body?.runId as string}) AS "parentEvents",
          (SELECT count(*)::int FROM execution_events WHERE run_id = ${first.state.body?.dispatchRunId as string}) AS "dispatchEvents"
      `;
      assert.deepEqual(counts, {
        parents: 1,
        dispatches: 1,
        parentEvents: 1,
        dispatchEvents: 1,
      });
      assert.equal(
        getThread(threadId).messages.filter(
          (message) =>
            message.role === "user" &&
            message.text === "Busca partners de salud capilar en España",
        ).length,
        1,
      );
      assert.equal(
        getThread(threadId).messages.filter(
          (message) => message.role === "user",
        ).length,
        1,
      );

      const cancelled = response();
      await cancelHandler(
        {
          ...browserRequest(threadId, "unused-cancel-key"),
          body: {
            slug: "hospital-capilar",
            threadId,
            runId: first.state.body?.runId,
            agent: "sancho",
          },
        } as NextApiRequest,
        cancelled.res,
      );
      assert.equal(
        cancelled.state.status,
        200,
        JSON.stringify(cancelled.state.body),
      );
      assert.equal(cancelled.state.body?.cancelled, true);
      assert.equal(cancelled.state.body?.runtimeCancelled, true);
      assert.equal(cancelled.state.body?.cancellationPending, false);
      const [cancelState] = await sql<
        [
          {
            parentStatus: string;
            dispatchStatus: string;
            reasonCode: string | null;
          },
        ]
      >`
        SELECT
          (SELECT status FROM agent_runs WHERE id = ${first.state.body?.runId as string}) AS "parentStatus",
          status AS "dispatchStatus",
          cancel_reason_code AS "reasonCode"
        FROM execution_runs
        WHERE id = ${first.state.body?.dispatchRunId as string}
      `;
      assert.deepEqual(cancelState, {
        parentStatus: "cancelled",
        dispatchStatus: "cancelled",
        reasonCode: "user_requested",
      });

      // Legacy outbound shortcuts used to return before the parent turn was
      // admitted. In a chat canary, even the chooser prose and its structured
      // answers belong to the fenced OpenClaw turn. No direct Yalc call is
      // possible before these durable receipts exist.
      const chooserThread = "hospital-capilar:durable-outbound-chooser";
      const chooser = response();
      await sendHandler(
        {
          ...browserRequest(chooserThread, "durable-outbound-chooser-1"),
          body: {
            ...browserRequest(chooserThread, "durable-outbound-chooser-1").body,
            text: "Quiero crear una campaña B2B por LinkedIn.",
          },
        } as NextApiRequest,
        chooser.res,
      );
      assert.equal(chooser.state.status, 202);
      assert.equal(chooser.state.body?.durable, true);
      assert.equal(
        getThread(chooserThread).messages.filter(
          (message) =>
            message.role === "bot" && message.text.includes(":::ask"),
        ).length,
        0,
      );

      const selectionThread = "hospital-capilar:durable-outbound-selection";
      addMessage(
        selectionThread,
        "bot",
        [
          "Selecciona el problema.",
          "",
          ":::ask",
          JSON.stringify({
            id: "outbound_ecp_v1",
            prompt: "¿Qué problema abordamos?",
            mode: "single",
            options: [
              {
                id: "ecp-sistema",
                label: "Sistema repetible",
                workflowIntent: {
                  channel: "linkedin",
                  discoveryStrategy: "account_first_v1",
                  targetSegment: "Clínicas capilares en España",
                  contactReason: "Mejorar su captación",
                  accountTarget: { country: "ES" },
                  personTarget: { titles: ["CEO"] },
                },
              },
            ],
          }),
          ":::",
        ].join("\n"),
        "rocinante",
      );
      const selection = response();
      await sendHandler(
        {
          ...browserRequest(selectionThread, "durable-outbound-selection-1"),
          body: {
            ...browserRequest(selectionThread, "durable-outbound-selection-1")
              .body,
            text: "[ask:outbound_ecp_v1] respuesta: Sistema repetible <!--workflow-option:ecp-sistema-->",
          },
        } as NextApiRequest,
        selection.res,
      );
      assert.equal(selection.state.status, 202);
      assert.equal(selection.state.body?.durable, true);
      assert.equal(
        getThread(selectionThread).messages.some(
          (message) =>
            message.role === "bot" &&
            /Inicié la campaña|Preparé la campaña/.test(message.text),
        ),
        false,
      );

      const invalidThread = "hospital-capilar:durable-outbound-invalid";
      const invalid = response();
      await sendHandler(
        {
          ...browserRequest(invalidThread, "durable-outbound-invalid-1"),
          body: {
            ...browserRequest(invalidThread, "durable-outbound-invalid-1").body,
            text: "[ask:outbound_ecp_v1] respuesta: Inventado <!--workflow-option:not-real-->",
          },
        } as NextApiRequest,
        invalid.res,
      );
      assert.equal(invalid.state.status, 202);
      assert.equal(invalid.state.body?.durable, true);

      const [{ parentCount, dispatchCount }] = await sql<
        [{ parentCount: number; dispatchCount: number }]
      >`
        SELECT
          (SELECT count(*)::int FROM agent_runs WHERE thread_id IN (${chooserThread}, ${selectionThread}, ${invalidThread})) AS "parentCount",
          (SELECT count(*)::int FROM execution_runs WHERE aggregate_id IN (
            ${chooser.state.body?.runId as string},
            ${selection.state.body?.runId as string},
            ${invalid.state.body?.runId as string}
          )) AS "dispatchCount"
      `;
      assert.deepEqual(
        { parentCount, dispatchCount },
        {
          parentCount: 3,
          dispatchCount: 3,
        },
      );

      process.env.CHAT_AGENT_TURN_DURABLE_WORKER_ENABLED = "0";
      const unavailableThread =
        "hospital-capilar:partnerships-ledger-unavailable";
      const unavailable = response();
      await sendHandler(
        browserRequest(unavailableThread, "browser-ledger-unavailable-1"),
        unavailable.res,
      );
      assert.equal(unavailable.state.status, 503);
      const [{ parents }] = await sql<[{ parents: number }]>`
        SELECT count(*)::int AS parents
        FROM agent_runs
        WHERE thread_id = ${unavailableThread}
      `;
      assert.equal(parents, 0);
      assert.equal(getThread(unavailableThread).messages.length, 0);
    } finally {
      await closeApplicationDatabase?.();
      await sql.end({ timeout: 5 });
      fs.rmSync(workspace, { recursive: true, force: true });
    }
  },
);
