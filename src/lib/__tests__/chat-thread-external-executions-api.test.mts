import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import type { NextApiRequest, NextApiResponse } from "next";
import type { AgentRun } from "../data/agent-runs";
import type {
  ExecutionOriginControlRepository,
  ExecutionRun,
  ListExecutionRunsByOriginPageInput,
} from "../execution-control";

const workspace = fs.mkdtempSync(
  path.join(os.tmpdir(), "sancho-chat-thread-external-api-"),
);
process.env.MC_WORKSPACE = workspace;

const { threadHandler } =
  await import("../../pages/api/chat/thread/[threadId]");
const { CHAT_EXTERNAL_EXECUTION_PARENT_SCAN_LIMIT } =
  await import("../chat/external-execution-projection");

const NOW = "2026-07-16T12:00:00.000Z";

function parent(
  id: string,
  durable: boolean,
  status: AgentRun["status"] = "completed",
): AgentRun {
  return {
    id,
    threadId: "hospital-capilar:general",
    runtime: "openclaw",
    status,
    input: durable ? { runtimeDispatchMode: "ledger-v1" } : { text: "legacy" },
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function child(id: string): ExecutionRun {
  return {
    id,
    tenantKey: "hospital-capilar",
    idempotencyKey: `command:${id}`,
    aggregateType: "fixture.external",
    aggregateId: id,
    operation: "partnerships.discovery",
    mode: "canary",
    status: "running",
    input: {},
    metadata: {},
    availableAt: NOW,
    claimCount: 1,
    handlerAttempt: 1,
    createdAt: NOW,
    updatedAt: NOW,
  };
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

test("thread endpoint projects two durable parents despite a later legacy turn", async (t) => {
  t.after(() => fs.rmSync(workspace, { recursive: true, force: true }));
  const first = parent("run-parent-first", true);
  const second = parent("run-parent-second", true);
  const laterLegacy = parent("run-later-legacy", false, "running");
  const lookupInputs: ListExecutionRunsByOriginPageInput[] = [];
  const repository: Pick<
    ExecutionOriginControlRepository,
    "listRunsByExecutionOriginPage"
  > = {
    async listRunsByExecutionOriginPage(input) {
      lookupInputs.push(input);
      return {
        runs: [
          child(
            input.parentAgentRunId === first.id
              ? "child-first"
              : "child-second",
          ),
        ],
      };
    },
  };
  let requestedRunLimit = 0;
  const mocked = response();

  await threadHandler(
    {
      method: "GET",
      query: { threadId: "hospital-capilar:general" },
      headers: {},
      ctx: {
        isAdmin: true,
        clientSlug: null,
        allowedSlugs: null,
        adminToken: null,
        portalClient: null,
      },
    } as unknown as NextApiRequest,
    mocked.res,
    {
      getLatestActiveRun: async () => laterLegacy,
      listAgentRunsForThread: async (_threadId, limit) => {
        requestedRunLimit = limit ?? 0;
        return [first, second, laterLegacy];
      },
      createExecutionRepository: () => repository,
    },
  );

  assert.equal(mocked.state.status, 200);
  assert.equal(requestedRunLimit, CHAT_EXTERNAL_EXECUTION_PARENT_SCAN_LIMIT);
  assert.deepEqual(
    lookupInputs.map(({ parentAgentRunId }) => parentAgentRunId),
    [first.id, second.id],
  );
  assert.equal(
    (mocked.state.body?.activeRun as { id?: string } | undefined)?.id,
    laterLegacy.id,
  );
  assert.deepEqual(mocked.state.body?.activeExecutionParentRunIds, [
    first.id,
    second.id,
  ]);
  assert.deepEqual(
    (
      mocked.state.body?.activeExecutions as
        Array<{ id: string; parentRunId: string }> | undefined
    )?.map(({ id, parentRunId }) => ({ id, parentRunId })),
    [
      { id: "child-first", parentRunId: first.id },
      { id: "child-second", parentRunId: second.id },
    ],
  );
});
