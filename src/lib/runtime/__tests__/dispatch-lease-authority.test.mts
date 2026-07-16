import assert from "node:assert/strict";
import test from "node:test";
import type {
  ExecutionLeaseReceipt,
  ExecutionRun,
  RenewExecutionRunLeaseInput,
} from "../../execution-control";
import {
  authorizeRuntimeDispatchLease,
  runtimeDispatchLeaseCapability,
  type RuntimeDispatchLeaseContract,
  type RuntimeDispatchLeaseRepository,
} from "../dispatch-lease-authority";

const parentRunId = "parent-1";
const dispatchRunId = "dispatch-1";
const leaseToken = "l".repeat(48);
const expiresAt = "2026-07-16T12:01:00.000Z";

interface TestParent {
  id: string;
  status: string;
  tenantKey: string;
}

interface TestCommand {
  parentRunId: string;
  tenantKey: string;
}

const parent: TestParent = {
  id: parentRunId,
  status: "running",
  tenantKey: "hospital-capilar",
};

function dispatch(overrides: Partial<ExecutionRun> = {}): ExecutionRun {
  return {
    id: dispatchRunId,
    tenantKey: "hospital-capilar",
    idempotencyKey: "test-dispatch-1",
    aggregateType: "agent_run",
    aggregateId: parentRunId,
    operation: "test.runtime.dispatch",
    mode: "canary",
    status: "running",
    input: { parentRunId, tenantKey: "hospital-capilar" },
    metadata: {},
    availableAt: "2026-07-16T12:00:00.000Z",
    claimCount: 1,
    handlerAttempt: 0,
    createdAt: "2026-07-16T12:00:00.000Z",
    updatedAt: "2026-07-16T12:00:00.000Z",
    ...overrides,
  };
}

function command(run: ExecutionRun): TestCommand {
  const value = run.input as Partial<TestCommand> | undefined;
  if (
    !value ||
    typeof value.parentRunId !== "string" ||
    typeof value.tenantKey !== "string"
  ) {
    throw new Error("invalid command");
  }
  return { parentRunId: value.parentRunId, tenantKey: value.tenantKey };
}

function contract(
  resolveParentRun: (id: string) => Promise<TestParent | null> = async () =>
    parent,
): RuntimeDispatchLeaseContract<TestParent, TestCommand> {
  return {
    operation: "test.runtime.dispatch",
    mode: "canary",
    aggregateType: "agent_run",
    leaseMs: 60_000,
    resolveParentRun,
    parseCommand: command,
    bindingMatches: ({ parentRun, dispatchRun, command: parsed }) =>
      parsed.parentRunId === parentRun.id &&
      parsed.tenantKey === parentRun.tenantKey &&
      dispatchRun.tenantKey === parentRun.tenantKey,
  };
}

function repository(
  input: {
    persisted?: ExecutionRun | null;
    renewed?: ExecutionLeaseReceipt | null;
    onGet?: () => void;
    onRenew?: (value: RenewExecutionRunLeaseInput) => void;
  } = {},
): RuntimeDispatchLeaseRepository {
  const persisted =
    input.persisted === undefined ? dispatch() : input.persisted;
  const renewed =
    input.renewed === undefined
      ? persisted
        ? { run: persisted, token: leaseToken, expiresAt, recovered: false }
        : null
      : input.renewed;
  return {
    async getRunById() {
      input.onGet?.();
      return persisted;
    },
    async renewRunLease(value) {
      input.onRenew?.(value);
      return renewed;
    },
  };
}

function authorityInput(overrides: Record<string, unknown> = {}) {
  return {
    parentRunId,
    dispatchRunId,
    leaseToken,
    capability: runtimeDispatchLeaseCapability({
      parentRunId,
      dispatchRunId,
      leaseToken,
    }),
    ...overrides,
  };
}

test("the exact capability, dispatch scope, lease and parent authorize", async () => {
  let renewal: RenewExecutionRunLeaseInput | undefined;
  const authority = await authorizeRuntimeDispatchLease(authorityInput(), {
    repository: repository({ onRenew: (value) => (renewal = value) }),
    contract: contract(),
  });

  assert.equal(authority?.dispatchRun.id, dispatchRunId);
  assert.equal(authority?.parentRun.id, parentRunId);
  assert.deepEqual(authority?.command, {
    parentRunId,
    tenantKey: "hospital-capilar",
  });
  assert.deepEqual(renewal, {
    tenantKey: "hospital-capilar",
    operation: "test.runtime.dispatch",
    mode: "canary",
    runId: dispatchRunId,
    token: leaseToken,
    leaseMs: 60_000,
  });
});

test("a forged capability fails before any repository access", async () => {
  let reads = 0;
  const authority = await authorizeRuntimeDispatchLease(
    authorityInput({ capability: "f".repeat(64) }),
    {
      repository: repository({ onGet: () => (reads += 1) }),
      contract: contract(),
    },
  );

  assert.equal(authority, null);
  assert.equal(reads, 0);
});

test("wrong dispatch, parent and persisted scope all fail before renewal", async (t) => {
  const cases: Array<[string, Partial<ExecutionRun>]> = [
    ["dispatch id", { id: "dispatch-other" }],
    ["parent aggregate", { aggregateId: "parent-other" }],
    ["aggregate type", { aggregateType: "campaign" }],
    ["operation", { operation: "other.runtime.dispatch" }],
    ["mode", { mode: "active" }],
    ["non-running dispatch", { status: "queued" }],
  ];
  for (const [name, overrides] of cases) {
    await t.test(name, async () => {
      let renewals = 0;
      const authority = await authorizeRuntimeDispatchLease(authorityInput(), {
        repository: repository({
          persisted: dispatch(overrides),
          onRenew: () => (renewals += 1),
        }),
        contract: contract(),
      });
      assert.equal(authority, null);
      assert.equal(renewals, 0);
    });
  }
});

test("a renewed lease cannot swap tenant or dispatch scope", async (t) => {
  const cases: Array<[string, Partial<ExecutionRun>]> = [
    ["tenant", { tenantKey: "other-tenant" }],
    ["dispatch", { id: "dispatch-other" }],
    ["operation", { operation: "other.runtime.dispatch" }],
    ["parent", { aggregateId: "parent-other" }],
  ];
  for (const [name, overrides] of cases) {
    await t.test(name, async () => {
      const renewedRun = dispatch(overrides);
      const authority = await authorizeRuntimeDispatchLease(authorityInput(), {
        repository: repository({
          renewed: {
            run: renewedRun,
            token: leaseToken,
            expiresAt,
            recovered: false,
          },
        }),
        contract: contract(),
      });
      assert.equal(authority, null);
    });
  }
});

test("a stale lease token and a wrong parent binding fail closed", async (t) => {
  await t.test("stale lease", async () => {
    const authority = await authorizeRuntimeDispatchLease(authorityInput(), {
      repository: repository({ renewed: null }),
      contract: contract(),
    });
    assert.equal(authority, null);
  });

  await t.test("wrong resolved parent", async () => {
    const authority = await authorizeRuntimeDispatchLease(authorityInput(), {
      repository: repository(),
      contract: contract(async () => ({ ...parent, id: "parent-other" })),
    });
    assert.equal(authority, null);
  });

  await t.test("wrong command parent", async () => {
    const wrongCommand = dispatch({
      input: { parentRunId: "parent-other", tenantKey: "hospital-capilar" },
    });
    const authority = await authorizeRuntimeDispatchLease(authorityInput(), {
      repository: repository({ persisted: wrongCommand }),
      contract: contract(),
    });
    assert.equal(authority, null);
  });
});

test("a cancelled lease is fenced except at an explicit cancellation boundary", async () => {
  const cancelledRun = dispatch({
    cancelRequestId: `cancel_${"a".repeat(32)}`,
  });
  const cancelledRepository = repository({
    persisted: cancelledRun,
    renewed: {
      run: cancelledRun,
      token: leaseToken,
      expiresAt,
      recovered: false,
    },
  });

  assert.equal(
    await authorizeRuntimeDispatchLease(authorityInput(), {
      repository: cancelledRepository,
      contract: contract(),
    }),
    null,
  );
  assert.ok(
    await authorizeRuntimeDispatchLease(
      authorityInput({ allowCancellationRequested: true }),
      { repository: cancelledRepository, contract: contract() },
    ),
  );
});
