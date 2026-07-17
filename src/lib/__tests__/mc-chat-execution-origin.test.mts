import assert from "node:assert/strict";
import test from "node:test";
import type { AgentRun } from "../data/agent-runs";
import { durableExecutionMcChatOrigin } from "../durable-execution/execution-origin";
import type { ExecutionRun } from "../execution-control";
import type { ExecutionOriginControlRepository } from "../execution-control";
import {
  McChatExecutionOriginError,
  resolveMcChatExecutionOrigin,
} from "../runtime/mc-chat-execution-origin";

const timestamp = "2026-07-16T12:00:00.000Z";

function executionRun(overrides: Partial<ExecutionRun> = {}): ExecutionRun {
  return {
    id: "xrun-origin-1",
    tenantKey: "hospital-capilar",
    idempotencyKey: "hospital-capilar:leads-search:request-1",
    aggregateType: "leads_search",
    aggregateId: "search-1",
    operation: "leads.search",
    mode: "canary",
    status: "completed",
    metadata: {
      executionOrigin: durableExecutionMcChatOrigin("run-parent-1"),
    },
    availableAt: timestamp,
    claimCount: 1,
    handlerAttempt: 1,
    createdAt: timestamp,
    startedAt: timestamp,
    finishedAt: timestamp,
    updatedAt: timestamp,
    ...overrides,
  };
}

function parentRun(
  overrides: Partial<AgentRun> & { input?: unknown } = {},
): AgentRun {
  return {
    id: "run-parent-1",
    threadId: "hospital-capilar:leads-search-1",
    runtime: "openclaw",
    agent: "sancho",
    status: "completed",
    input: {
      slug: "hospital-capilar",
      threadId: "hospital-capilar:leads-search-1",
      isAdmin: true,
      senderRole: "admin",
      readOnly: false,
      userId: "mc-admin",
    },
    createdAt: timestamp,
    finishedAt: timestamp,
    updatedAt: timestamp,
    ...overrides,
  };
}

function originError(error: unknown): boolean {
  return error instanceof McChatExecutionOriginError;
}

const noParentEvents = async (): Promise<[]> => [];

function originRepositoryFor(
  run: ExecutionRun,
  options: { cancelled?: boolean } = {},
): Pick<ExecutionOriginControlRepository, "getRunTrustedExecutionOrigin"> {
  return {
    getRunTrustedExecutionOrigin: async (input) => {
      assert.deepEqual(input, { tenantKey: run.tenantKey, runId: run.id });
      if (run.metadata.executionOrigin === undefined) return null;
      return {
        tenantKey: run.tenantKey,
        runId: run.id,
        origin: durableExecutionMcChatOrigin("run-parent-1"),
        ...(options.cancelled
          ? {
              cancellation: {
                cancellationId: `cancel_${"a".repeat(32)}`,
                requestedAt: timestamp,
                actor: { type: "user" as const, id: "user:martin-fila" },
                reasonCode: "user_requested" as const,
              },
            }
          : {}),
      };
    },
  };
}

test("an execution without a trusted origin resolves to no chat destination", async () => {
  let parentLookups = 0;
  const run = executionRun({ metadata: {} });
  const resolved = await resolveMcChatExecutionOrigin(
    run,
    {
      originRepository: originRepositoryFor(run),
      resolveAgentRun: async () => {
        parentLookups += 1;
        return parentRun();
      },
      resolveAgentRunEvents: noParentEvents,
    },
  );

  assert.equal(resolved, null);
  assert.equal(parentLookups, 0);
});

test("a server-attested parent derives the canonical tenant and thread", async () => {
  const run = executionRun();
  const resolved = await resolveMcChatExecutionOrigin(run, {
    originRepository: originRepositoryFor(run),
    resolveAgentRun: async (runId) => {
      assert.equal(runId, "run-parent-1");
      return parentRun();
    },
    resolveAgentRunEvents: noParentEvents,
  });

  assert.ok(resolved);
  assert.equal(resolved.origin.parentAgentRunId, "run-parent-1");
  assert.equal(resolved.parentRun.id, "run-parent-1");
  assert.equal(resolved.tenantSlug, "hospital-capilar");
  assert.equal(resolved.threadId, "hospital-capilar:leads-search-1");
  assert.equal(resolved.agent, "sancho");
});

test("a cancelled parent suppresses a child result that finishes during Stop", async () => {
  const run = executionRun();
  const resolved = await resolveMcChatExecutionOrigin(run, {
    originRepository: originRepositoryFor(run),
    resolveAgentRun: async () =>
      parentRun({
        status: "cancelled",
        finishedAt: timestamp,
      }),
    resolveAgentRunEvents: noParentEvents,
  });

  assert.equal(resolved, null);
});

test("a Stop tombstone suppresses a late child even after the parent completed", async () => {
  const parent = parentRun({ status: "completed", finishedAt: timestamp });
  const run = executionRun();
  const resolved = await resolveMcChatExecutionOrigin(run, {
    originRepository: originRepositoryFor(run),
    resolveAgentRun: async () => parent,
    resolveAgentRunEvents: async () => [
      {
        id: "event-stop-1",
        runId: parent.id,
        threadId: parent.threadId,
        type: "cancel_requested",
        ts: timestamp,
      },
    ],
  });

  assert.equal(resolved, null);
});

test("the PostgreSQL origin tombstone suppresses delivery before parent lookup", async () => {
  const run = executionRun();
  let parentLookups = 0;
  const resolved = await resolveMcChatExecutionOrigin(run, {
    originRepository: originRepositoryFor(run, { cancelled: true }),
    resolveAgentRun: async () => {
      parentLookups += 1;
      return parentRun();
    },
    resolveAgentRunEvents: noParentEvents,
  });
  assert.equal(resolved, null);
  assert.equal(parentLookups, 0);
});

test("false parent, thread, tenant and admin claims are rejected", async (t) => {
  const cases: Array<{
    name: string;
    run?: ExecutionRun;
    parent: AgentRun | null;
  }> = [
    {
      name: "missing parent",
      parent: null,
    },
    {
      name: "different parent identity",
      parent: parentRun({ id: "run-parent-other" }),
    },
    {
      name: "non-OpenClaw parent",
      parent: parentRun({ runtime: "claude-code" }),
    },
    {
      name: "non-canonical thread",
      parent: parentRun({
        threadId: "hospital-capilar:leads:search-1",
        input: {
          slug: "hospital-capilar",
          threadId: "hospital-capilar:leads:search-1",
          isAdmin: true,
          senderRole: "admin",
          readOnly: false,
          userId: "mc-admin",
        },
      }),
    },
    {
      name: "input thread differs from persisted thread",
      parent: parentRun({
        input: {
          slug: "hospital-capilar",
          threadId: "hospital-capilar:another-thread",
          isAdmin: true,
          senderRole: "admin",
          readOnly: false,
          userId: "mc-admin",
        },
      }),
    },
    {
      name: "execution tenant differs from thread tenant",
      run: executionRun({ tenantKey: "growth4u" }),
      parent: parentRun(),
    },
    {
      name: "input tenant differs from thread tenant",
      parent: parentRun({
        input: {
          slug: "growth4u",
          threadId: "hospital-capilar:leads-search-1",
          isAdmin: true,
          senderRole: "admin",
          readOnly: false,
          userId: "mc-admin",
        },
      }),
    },
    {
      name: "non-admin input",
      parent: parentRun({
        input: {
          slug: "hospital-capilar",
          threadId: "hospital-capilar:leads-search-1",
          isAdmin: false,
          senderRole: "member",
          readOnly: true,
          userId: "external-user",
        },
      }),
    },
  ];

  for (const candidate of cases) {
    await t.test(candidate.name, async () => {
      const run = candidate.run ?? executionRun();
      await assert.rejects(
        resolveMcChatExecutionOrigin(run, {
          originRepository: originRepositoryFor(run),
          resolveAgentRun: async () => candidate.parent,
          resolveAgentRunEvents: noParentEvents,
        }),
        originError,
      );
    });
  }
});
