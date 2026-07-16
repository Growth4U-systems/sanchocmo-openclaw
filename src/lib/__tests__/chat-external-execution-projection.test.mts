import assert from "node:assert/strict";
import test from "node:test";
import {
  CHAT_EXTERNAL_EXECUTION_LIMIT,
  EMPTY_CHAT_EXTERNAL_EXECUTION_PROJECTION,
  projectActiveExternalExecutions,
  resolveExternalExecutionParent,
  resolveExternalExecutionParents,
} from "../chat/external-execution-projection";
import type { AgentRun } from "../data/agent-runs";
import type {
  ExecutionOriginControlRepository,
  ExecutionRun,
  ListExecutionRunsByOriginPageInput,
} from "../execution-control";

const NOW = "2026-07-16T12:00:00.000Z";

function parentRun(
  id: string,
  input: unknown,
  overrides: Partial<AgentRun> = {},
): AgentRun {
  return {
    id,
    threadId: "hospital-capilar:general",
    runtime: "openclaw",
    status: "completed",
    input,
    createdAt: NOW,
    finishedAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function childRun(
  id: string,
  status: ExecutionRun["status"],
  overrides: Partial<ExecutionRun> = {},
): ExecutionRun {
  return {
    id,
    tenantKey: "hospital-capilar",
    idempotencyKey: `command:${id}`,
    aggregateType: "contract.external-task",
    aggregateId: id,
    operation: "leads.search",
    mode: "canary",
    status,
    input: { secret: "never-return-this-input" },
    output: { secret: "never-return-this-output" },
    metadata: { secret: "never-return-this-metadata" },
    availableAt: NOW,
    claimCount: status === "running" ? 1 : 0,
    handlerAttempt: status === "running" ? 1 : 0,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

class OriginRepository implements Pick<
  ExecutionOriginControlRepository,
  "listRunsByExecutionOriginPage"
> {
  readonly inputs: ListExecutionRunsByOriginPageInput[] = [];

  constructor(
    readonly children:
      ExecutionRun[] | Readonly<Record<string, readonly ExecutionRun[]>>,
  ) {}

  async listRunsByExecutionOriginPage(
    input: ListExecutionRunsByOriginPageInput,
  ) {
    this.inputs.push(input);
    const children = Array.isArray(this.children)
      ? this.children
      : [...(this.children[input.parentAgentRunId] ?? [])];
    const filtered = input.statuses
      ? children.filter(({ status }) => input.statuses!.includes(status))
      : children;
    const sorted = [...filtered].sort((left, right) =>
      left.id.localeCompare(right.id),
    );
    const eligible = input.afterRunId
      ? sorted.filter(({ id }) => id > input.afterRunId!)
      : sorted;
    const runs = eligible.slice(0, input.limit);
    return {
      runs,
      ...(eligible.length > input.limit
        ? { nextAfterRunId: runs[runs.length - 1]!.id }
        : {}),
    };
  }
}

test("latest persisted durable parent remains discoverable after the chat turn completes", () => {
  const durable = parentRun("run-parent-durable", {
    runtimeDispatchMode: "ledger-v1",
  });
  const runs = [
    parentRun("run-legacy", { text: "legacy" }),
    durable,
    parentRun(
      "run-other-thread",
      { runtimeDispatchMode: "ledger-v1" },
      { threadId: "another-client:general" },
    ),
  ];

  assert.equal(
    resolveExternalExecutionParent(runs, "hospital-capilar:general"),
    durable,
  );
  assert.equal(
    resolveExternalExecutionParent(
      [parentRun("run-legacy-only", { text: "legacy" })],
      "hospital-capilar:general",
    ),
    null,
  );
  assert.deepEqual(
    resolveExternalExecutionParents(
      [
        durable,
        parentRun("run-parent-durable-2", {
          runtimeDispatchMode: "ledger-v1",
        }),
        parentRun("run-later-legacy", { text: "legacy after both" }),
      ],
      "hospital-capilar:general",
    ).map(({ id }) => id),
    ["run-parent-durable", "run-parent-durable-2"],
  );
});

test("two durable parents stay visible after a later legacy turn", async () => {
  const first = parentRun("run-parent-first", {
    runtimeDispatchMode: "ledger-v1",
  });
  const second = parentRun("run-parent-second", {
    runtimeDispatchMode: "ledger-v1",
  });
  const legacy = parentRun("run-later-legacy", { text: "ordinary reply" });
  const parents = resolveExternalExecutionParents(
    [first, second, legacy],
    "hospital-capilar:general",
  );
  const repository = new OriginRepository({
    [first.id]: [childRun("child-first", "running")],
    [second.id]: [childRun("child-second", "queued")],
  });

  const projection = await projectActiveExternalExecutions(
    { tenantKey: "hospital-capilar", parentRuns: parents },
    repository,
  );

  assert.deepEqual(
    repository.inputs.map(({ parentAgentRunId }) => parentAgentRunId),
    [first.id, second.id],
  );
  assert.deepEqual(projection.activeExecutionParentRunIds, [
    first.id,
    second.id,
  ]);
  assert.equal(projection.activeExecutionsParentRunId, second.id);
  assert.deepEqual(
    projection.activeExecutions.map(({ id, parentRunId }) => ({
      id,
      parentRunId,
    })),
    [
      { id: "child-first", parentRunId: first.id },
      { id: "child-second", parentRunId: second.id },
    ],
  );
});

test("projection uses the exact tenant and parent and returns only bounded safe active fields", async () => {
  const parent = parentRun("run-parent-1", {
    runtimeDispatchMode: "ledger-v1",
  });
  const repository = new OriginRepository([
    childRun("child-running", "running", {
      startedAt: "2026-07-16T14:00:00+02:00",
      cancelRequestedAt: "2026-07-16T14:01:00+02:00",
    }),
    childRun("child-waiting", "waiting_approval", {
      cancelRequestedAt: "not-a-timestamp",
    }),
    childRun("child-completed", "completed", { finishedAt: NOW }),
    childRun("child-other-tenant", "running", { tenantKey: "other-client" }),
    childRun("child-invalid-operation", "running", {
      operation: "invalid\noperation",
    }),
  ]);

  const projection = await projectActiveExternalExecutions(
    { tenantKey: "HOSPITAL-CAPILAR", parentRuns: [parent] },
    repository,
  );

  assert.deepEqual(repository.inputs, [
    {
      tenantKey: "hospital-capilar",
      parentAgentRunId: "run-parent-1",
      statuses: ["queued", "running", "waiting_approval", "blocked"],
      limit: CHAT_EXTERNAL_EXECUTION_LIMIT,
    },
  ]);
  assert.equal(projection.activeExecutionsParentRunId, "run-parent-1");
  assert.deepEqual(projection.activeExecutionParentRunIds, ["run-parent-1"]);
  assert.deepEqual(projection.activeExecutions, [
    {
      id: "child-running",
      parentRunId: "run-parent-1",
      operation: "leads.search",
      status: "running",
      createdAt: NOW,
      updatedAt: NOW,
      startedAt: NOW,
      cancelRequestedAt: "2026-07-16T12:01:00.000Z",
    },
    {
      id: "child-waiting",
      parentRunId: "run-parent-1",
      operation: "leads.search",
      status: "waiting_approval",
      createdAt: NOW,
      updatedAt: NOW,
    },
  ]);
  const serialized = JSON.stringify(projection);
  assert.doesNotMatch(serialized, /never-return-this/);
  assert.doesNotMatch(serialized, /input|output|metadata/);
});

test("legacy, cross-tenant and terminal-only origins project an empty list", async () => {
  const repository = new OriginRepository([
    childRun("child-running", "running"),
  ]);
  const legacy = parentRun("run-legacy", { text: "legacy" });

  assert.deepEqual(
    await projectActiveExternalExecutions(
      { tenantKey: "hospital-capilar", parentRuns: [legacy] },
      repository,
    ),
    EMPTY_CHAT_EXTERNAL_EXECUTION_PROJECTION,
  );
  assert.equal(repository.inputs.length, 0);

  const wrongTenant = parentRun("run-wrong-tenant", {
    runtimeDispatchMode: "ledger-v1",
  });
  assert.deepEqual(
    await projectActiveExternalExecutions(
      { tenantKey: "other-client", parentRuns: [wrongTenant] },
      repository,
    ),
    EMPTY_CHAT_EXTERNAL_EXECUTION_PROJECTION,
  );
  assert.equal(repository.inputs.length, 0);

  const terminalRepository = new OriginRepository([
    childRun("child-completed", "completed", { finishedAt: NOW }),
    childRun("child-failed", "failed", { finishedAt: NOW }),
  ]);
  const durable = parentRun("run-durable", {
    runtimeDispatchMode: "ledger-v1",
  });
  assert.deepEqual(
    await projectActiveExternalExecutions(
      { tenantKey: "hospital-capilar", parentRuns: [durable] },
      terminalRepository,
    ),
    EMPTY_CHAT_EXTERNAL_EXECUTION_PROJECTION,
  );
});

test("an active child after 100 terminal siblings stays visible in one bounded query", async () => {
  const parent = parentRun("run-parent-overflow", {
    runtimeDispatchMode: "ledger-v1",
  });
  const repository = new OriginRepository([
    ...Array.from({ length: 100 }, (_, index) =>
      childRun(`child-${String(index).padStart(3, "0")}`, "completed", {
        finishedAt: NOW,
      }),
    ),
    childRun("child-100", "running"),
  ]);

  const projection = await projectActiveExternalExecutions(
    { tenantKey: "hospital-capilar", parentRuns: [parent] },
    repository,
  );

  assert.deepEqual(repository.inputs, [
    {
      tenantKey: "hospital-capilar",
      parentAgentRunId: parent.id,
      statuses: ["queued", "running", "waiting_approval", "blocked"],
      limit: CHAT_EXTERNAL_EXECUTION_LIMIT,
    },
  ]);
  assert.deepEqual(projection.activeExecutionParentRunIds, [parent.id]);
  assert.deepEqual(
    projection.activeExecutions.map(({ id, parentRunId }) => ({
      id,
      parentRunId,
    })),
    [{ id: "child-100", parentRunId: parent.id }],
  );
});
