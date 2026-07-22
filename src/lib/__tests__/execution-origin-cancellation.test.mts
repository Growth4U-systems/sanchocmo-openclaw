import assert from "node:assert/strict";
import test from "node:test";
import {
  cancelSealedExecutionOriginChildren,
  requestExecutionOriginCancellation,
  sealExecutionOriginCancellation,
  type ExecutionOriginCancellationRepository,
} from "../durable-execution/origin-cancellation";
import type {
  AcknowledgeExecutionRunCancellationInput,
  ExecutionCancellationReceipt,
  ExecutionOriginCancellationReceipt,
  ExecutionRun,
  ExecutionRunsByOriginPage,
  ListExecutionRunsByOriginInput,
  ListExecutionRunsByOriginPageInput,
  RequestExecutionOriginCancellationInput,
  RequestExecutionRunCancellationInput,
  TrustedExecutionOriginRegistration,
} from "../execution-control";

const timestamp = "2026-07-16T12:00:00.000Z";

function executionRun(
  id: string,
  status: ExecutionRun["status"],
): ExecutionRun {
  return {
    id,
    tenantKey: "hospital-capilar",
    idempotencyKey: `command:${id}`,
    aggregateType: "contract.origin-child",
    aggregateId: id,
    operation: "contract.origin-child.execute",
    mode: "canary",
    status,
    metadata: {
      executionOrigin: {
        schemaVersion: 1,
        kind: "mc_chat_parent_run",
        parentAgentRunId: "run-parent-1",
      },
    },
    availableAt: timestamp,
    claimCount: status === "running" ? 1 : 0,
    handlerAttempt: status === "running" ? 1 : 0,
    createdAt: timestamp,
    ...(status === "running" ? { startedAt: timestamp } : {}),
    ...(["completed", "partial", "failed", "cancelled"].includes(status)
      ? { finishedAt: timestamp }
      : {}),
    updatedAt: timestamp,
  };
}

class OriginCancellationRepository implements ExecutionOriginCancellationRepository {
  readonly lookupInputs: ListExecutionRunsByOriginPageInput[] = [];
  readonly cancellationInputs: RequestExecutionRunCancellationInput[] = [];
  readonly firstReceipts = new Map<string, ExecutionCancellationReceipt>();

  constructor(
    readonly children: ExecutionRun[],
  ) {}

  async createRunWithTrustedOrigin(): Promise<never> {
    throw new Error("not used by origin cancellation");
  }

  async requestOriginCancellation(
    input: RequestExecutionOriginCancellationInput,
  ): Promise<ExecutionOriginCancellationReceipt> {
    return {
      tenantKey: input.tenantKey,
      origin: input.origin,
      cancellationId: input.cancellationId,
      requestedAt: timestamp,
      actor: input.actor,
      reasonCode: input.reasonCode,
      replayed: false,
    };
  }

  async getRunTrustedExecutionOrigin(): Promise<TrustedExecutionOriginRegistration | null> {
    throw new Error("not used by origin cancellation");
  }

  async listRunsByExecutionOriginPage(
    input: ListExecutionRunsByOriginPageInput,
  ): Promise<ExecutionRunsByOriginPage> {
    this.lookupInputs.push(input);
    const sorted = [...this.children].sort((left, right) =>
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

  async listRunsByExecutionOrigin(
    input: ListExecutionRunsByOriginInput,
  ): Promise<ExecutionRun[]> {
    this.lookupInputs.push(input);
    if (this.children.length > input.limit) {
      throw new Error("execution origin fanout requires pagination");
    }
    return [...this.children].sort((left, right) =>
      left.id.localeCompare(right.id),
    );
  }

  async requestRunCancellation(
    input: RequestExecutionRunCancellationInput,
  ): Promise<ExecutionCancellationReceipt | null> {
    this.cancellationInputs.push(input);
    const replay = this.firstReceipts.get(input.runId);
    if (replay) return { ...replay, replayed: true };

    const child = this.children.find(({ id }) => id === input.runId);
    assert.ok(child);
    const disposition = child.status === "running" ? "requested" : "cancelled";
    const receipt: ExecutionCancellationReceipt = {
      run: {
        ...child,
        status: disposition === "cancelled" ? "cancelled" : child.status,
        cancelRequestId: input.cancellationId,
        cancelRequestedAt: timestamp,
        cancelRequestedBy: input.actor,
        cancelReasonCode: input.reasonCode,
        ...(disposition === "cancelled"
          ? { cancelAcknowledgedAt: timestamp, finishedAt: timestamp }
          : {}),
      },
      cancellationId: input.cancellationId,
      disposition,
      replayed: false,
    };
    this.firstReceipts.set(input.runId, receipt);
    return receipt;
  }

  async acknowledgeRunCancellation(
    _input: AcknowledgeExecutionRunCancellationInput,
  ): Promise<ExecutionCancellationReceipt | null> {
    throw new Error("not used by origin cancellation");
  }
}

const cancellationInput = {
  tenantKey: "hospital-capilar",
  parentAgentRunId: "run-parent-1",
  actor: { type: "user" as const, id: "user:martin-fila" },
  reasonCode: "user_requested" as const,
};

test("origin seal is independently durable before bounded child draining begins", async () => {
  const repository = new OriginCancellationRepository([
    executionRun("child-running", "running"),
  ]);

  const sealed = await sealExecutionOriginCancellation(
    cancellationInput,
    repository,
  );
  assert.equal(sealed.origin.parentAgentRunId, "run-parent-1");
  assert.equal(repository.lookupInputs.length, 0);
  assert.equal(repository.cancellationInputs.length, 0);

  // Chat Stop installs its AgentRun tombstone at this boundary. Only then may
  // it enumerate and cancel children without a post-scan control-route race.
  const drained = await cancelSealedExecutionOriginChildren(
    cancellationInput,
    sealed,
    repository,
  );
  assert.deepEqual(drained.requestedRunIds, ["child-running"]);
  assert.equal(repository.lookupInputs.length, 1);
});

test("origin cancellation skips terminal children and distinguishes direct from cooperative cancellation", async () => {
  const children = [
    executionRun("child-completed", "completed"),
    executionRun("child-partial", "partial"),
    executionRun("child-failed", "failed"),
    executionRun("child-cancelled", "cancelled"),
    executionRun("child-queued", "queued"),
    executionRun("child-running", "running"),
  ];
  const repository = new OriginCancellationRepository(children);

  const result = await requestExecutionOriginCancellation(
    cancellationInput,
    repository,
  );

  assert.deepEqual(
    new Set(result.children.map(({ id }) => id)),
    new Set(children.map(({ id }) => id)),
  );
  assert.deepEqual(result.requestedRunIds, ["child-queued", "child-running"]);
  assert.deepEqual(result.pendingRunIds, ["child-running"]);
  assert.deepEqual(
    repository.cancellationInputs.map(({ runId }) => runId),
    ["child-queued", "child-running"],
  );
  assert.ok(
    repository.cancellationInputs.every(
      ({ tenantKey, actor, reasonCode }) =>
        tenantKey === "hospital-capilar" &&
        actor.id === "user:martin-fila" &&
        reasonCode === "user_requested",
    ),
  );
});

test("origin cancellation derives stable child cancellation identities on replay", async () => {
  const repository = new OriginCancellationRepository([
    executionRun("child-queued", "queued"),
    executionRun("child-running", "running"),
  ]);

  const first = await requestExecutionOriginCancellation(
    cancellationInput,
    repository,
  );
  const firstIds = repository.cancellationInputs.map(
    ({ runId, cancellationId }) => [runId, cancellationId] as const,
  );
  const second = await requestExecutionOriginCancellation(
    cancellationInput,
    repository,
  );
  const secondIds = repository.cancellationInputs
    .slice(firstIds.length)
    .map(({ runId, cancellationId }) => [runId, cancellationId] as const);

  assert.deepEqual(first.requestedRunIds, ["child-queued", "child-running"]);
  assert.deepEqual(second.requestedRunIds, ["child-queued", "child-running"]);
  assert.deepEqual(second.pendingRunIds, ["child-running"]);
  assert.deepEqual(secondIds, firstIds);
  assert.ok(firstIds.every(([, id]) => /^cancel_[a-f0-9]{32}$/.test(id)));
});

test("origin cancellation exhausts bounded pages without truncating child 101", async () => {
  const repository = new OriginCancellationRepository(
    Array.from({ length: 101 }, (_, index) =>
      executionRun(`child-${index + 1}`, "queued"),
    ),
  );

  const result = await requestExecutionOriginCancellation(
    cancellationInput,
    repository,
  );
  assert.equal(result.children.length, 101);
  assert.equal(result.requestedRunIds.length, 101);
  assert.deepEqual(repository.lookupInputs, [
    {
      tenantKey: "hospital-capilar",
      parentAgentRunId: "run-parent-1",
      limit: 100,
    },
    {
      tenantKey: "hospital-capilar",
      parentAgentRunId: "run-parent-1",
      afterRunId: repository.lookupInputs[0]
        ? result.children[99]!.id
        : "unreachable",
      limit: 100,
    },
  ]);
  assert.equal(repository.cancellationInputs.length, 101);
});
