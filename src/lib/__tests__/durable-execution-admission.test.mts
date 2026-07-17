import assert from "node:assert/strict";
import { test } from "node:test";
import type {
  CreateExecutionRunInput,
  CreateExecutionRunReceipt,
  ExecutionRun,
} from "@/lib/execution-control";
import {
  DurableExecutionAdmissionError,
  admitDurableExecutionV2,
  type AdmitDurableExecutionV2Input,
} from "@/lib/durable-execution/admission";
import { DURABLE_EXECUTION_HANDLER_CONTRACT_VERSION_V2 } from "@/lib/durable-execution/contract";
import { durableExecutionMcChatOrigin } from "@/lib/durable-execution/execution-origin";
import type {
  DurableEffectDefinition,
  DurableEffectSafety,
  DurableExecutionHandlerV2,
} from "@/lib/durable-execution/effect-contract";
import type {
  DurableJsonBounds,
  DurableJsonContract,
} from "@/lib/durable-execution/json-contract";
import {
  DurableEffectPolicyDriftError,
  DurableExecutionRegistry,
} from "@/lib/durable-execution/registry";

type Command = { value: string };
type Checkpoint = { stage: string };
type Result = { done: boolean };
type Payload = { value: string };
type Receipt = { remoteId: string };

const bounds: DurableJsonBounds = {
  maxBytes: 4_096,
  maxDepth: 8,
  maxNodes: 100,
  maxStringBytes: 1_024,
  maxArrayItems: 20,
  maxObjectKeys: 20,
};

function objectContract<T extends Record<string, unknown>>(
  parse: (value: unknown) => T,
): DurableJsonContract<T> {
  return {
    schemaVersion: 1,
    bounds: { ...bounds },
    secrets: { mode: "reject" },
    parse,
  };
}

function commandContract(): DurableJsonContract<Command> {
  return objectContract((value) => {
    if (
      !value ||
      typeof value !== "object" ||
      Array.isArray(value) ||
      typeof (value as { value?: unknown }).value !== "string" ||
      Object.keys(value).some((key) => key !== "value")
    ) {
      throw new Error("invalid command");
    }
    return { value: (value as Command).value };
  });
}

function effect(
  step: string,
  capability: string,
): DurableEffectDefinition<Payload, Receipt> {
  return {
    step,
    definitionVersion: 1,
    capability,
    payload: objectContract((value) => value as Payload),
    receipt: objectContract((value) => value as Receipt),
    safety: {
      kind: "target_idempotency",
      delivery: "at_least_once_attempts",
      keyPlacement: "header",
      replay: "same_key_same_payload",
    },
    retry: {
      maxAttempts: 3,
      baseDelayMs: 1_000,
      maxDelayMs: 30_000,
      jitter: "full",
    },
    timeoutMs: 10_000,
    async invoke() {
      return { remoteId: "remote-1" };
    },
    async reconcile() {
      return { kind: "unknown" };
    },
    classify() {
      return { kind: "outcome_unknown", code: "remote_unknown" };
    },
  };
}

function handler(): DurableExecutionHandlerV2<
  Command,
  Checkpoint,
  Result,
  Record<string, DurableEffectDefinition<Payload, Receipt>>
> {
  return {
    contractVersion: DURABLE_EXECUTION_HANDLER_CONTRACT_VERSION_V2,
    operation: "fixture.command.execute",
    version: 2,
    command: commandContract(),
    checkpoint: objectContract((value) => value as Checkpoint),
    result: objectContract((value) => value as Result),
    effects: {
      "fixture.read": effect("fixture.read", "provider.shared"),
      "fixture.write": effect("fixture.write", "provider.shared"),
    },
    async execute() {
      return { output: { done: true } };
    },
    classifyPureError() {
      return { code: "fixture_invalid", retryable: false, message: "invalid" };
    },
    projectTerminal() {},
  };
}

function run(input: CreateExecutionRunInput): ExecutionRun {
  return {
    id: "xrun-admission",
    tenantKey: input.tenantKey,
    idempotencyKey: input.idempotencyKey,
    aggregateType: input.aggregateType,
    aggregateId: input.aggregateId,
    operation: input.operation,
    mode: input.mode ?? "active",
    status: "queued",
    input: input.input,
    metadata: input.metadata ?? {},
    availableAt: "2026-07-16T00:00:00.000Z",
    claimCount: 0,
    handlerAttempt: 0,
    createdAt: "2026-07-16T00:00:00.000Z",
    updatedAt: "2026-07-16T00:00:00.000Z",
  };
}

const baseInput = {
  scope: {
    tenantKey: "tenant-a",
    operation: "fixture.command.execute",
    mode: "canary" as const,
  },
  handlerVersion: 2,
  aggregateType: "fixture.command",
  aggregateId: "command-a",
  idempotencyKey: "fixture-command-a",
  command: { value: "alpha" },
};

test("v2 admission validates, authorizes unique capabilities, and freezes policy before create", async () => {
  const registry = new DurableExecutionRegistry().register(handler());
  const calls: CreateExecutionRunInput[] = [];
  const capabilities: string[] = [];
  const receipt = await admitDurableExecutionV2({
    ...baseInput,
    registry,
    repository: {
      async createRun(input): Promise<CreateExecutionRunReceipt> {
        assert.equal(Object.isFrozen(input), true);
        calls.push(input);
        return { run: run(input), created: true };
      },
    },
    capabilityPolicy: {
      mayAdmit({ capability, scope }) {
        assert.equal(Object.isFrozen(scope), true);
        capabilities.push(capability);
        return true;
      },
    },
    metadata: { source: "fixture" },
  });
  assert.deepEqual(capabilities, ["provider.shared"]);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0]?.input, { value: "alpha" });
  assert.equal(calls[0]?.metadata?.executionContractVersion, 2);
  assert.equal(calls[0]?.metadata?.executionHandlerVersion, 2);
  assert.equal(
    calls[0]?.metadata?.executionPolicyFingerprint,
    registry.executionPolicyFingerprint("fixture.command.execute", 2),
  );
  assert.equal(calls[0]?.metadata?.authority, "execution_ledger_v2");
  assert.equal(receipt.created, true);
  assert.match(receipt.commandFingerprint, /^[a-f0-9]{64}$/);
  assert.equal(registry.resolveRegistered(receipt.run).contractVersion, 2);
});

test("v2 admission canonicalizes one immutable identity for policy and persistence", async () => {
  const registry = new DurableExecutionRegistry().register(handler());
  let policyScope: unknown;
  let createdInput: CreateExecutionRunInput | undefined;
  await admitDurableExecutionV2({
    ...baseInput,
    scope: {
      tenantKey: "  TENANT-A  ",
      operation: "  FIXTURE.COMMAND.EXECUTE  ",
      mode: "active",
    },
    aggregateType: "  FIXTURE.COMMAND  ",
    aggregateId: "  Command-A  ",
    idempotencyKey: "  fixture:Command-A:v2  ",
    traceId: "  trace-ABC-1  ",
    registry,
    capabilityPolicy: {
      mayAdmit({ scope }) {
        policyScope = scope;
        return true;
      },
    },
    repository: {
      async createRun(input) {
        createdInput = input;
        return { run: run(input), created: true };
      },
    },
  });

  assert.deepEqual(policyScope, {
    tenantKey: "tenant-a",
    operation: "fixture.command.execute",
    mode: "active",
  });
  assert.equal(Object.isFrozen(policyScope), true);
  assert.equal(Object.isFrozen(createdInput), true);
  assert.deepEqual(
    createdInput && {
      tenantKey: createdInput.tenantKey,
      operation: createdInput.operation,
      mode: createdInput.mode,
      aggregateType: createdInput.aggregateType,
      aggregateId: createdInput.aggregateId,
      idempotencyKey: createdInput.idempotencyKey,
      traceId: createdInput.traceId,
    },
    {
      tenantKey: "tenant-a",
      operation: "fixture.command.execute",
      mode: "active",
      aggregateType: "fixture.command",
      aggregateId: "Command-A",
      idempotencyKey: "fixture:Command-A:v2",
      traceId: "trace-ABC-1",
    },
  );
});

test("unsafe scopes and opaque identities fail before policy or database I/O", async () => {
  const registry = new DurableExecutionRegistry().register(handler());
  const invalidInputs: Array<Partial<AdmitDurableExecutionV2Input>> = [
    { scope: { ...baseInput.scope, tenantKey: "-tenant-a" } },
    { scope: { ...baseInput.scope, tenantKey: "tenant\nadmin" } },
    { scope: { ...baseInput.scope, operation: "fixture command execute" } },
    {
      scope: {
        ...baseInput.scope,
        mode: "shadow",
      } as unknown as AdmitDurableExecutionV2Input["scope"],
    },
    { aggregateType: "fixture command" },
    { aggregateId: `aggregate-${"x".repeat(300)}` },
    { idempotencyKey: "Bearer fixture-secret-token-value" },
    { idempotencyKey: "command\u0000admin" },
    { traceId: "https://user:password@example.test" },
  ];

  for (const invalid of invalidInputs) {
    let policyCalls = 0;
    let databaseCalls = 0;
    await assert.rejects(
      admitDurableExecutionV2({
        ...baseInput,
        ...invalid,
        registry,
        capabilityPolicy: {
          mayAdmit() {
            policyCalls += 1;
            return true;
          },
        },
        repository: {
          async createRun(input) {
            databaseCalls += 1;
            return { run: run(input), created: true };
          },
        },
      }),
      (error) =>
        error instanceof DurableExecutionAdmissionError &&
        (error.code === "durable_scope_invalid" ||
          error.code === "durable_identity_invalid"),
    );
    assert.equal(policyCalls, 0);
    assert.equal(databaseCalls, 0);
  }
});

test("invalid commands and metadata fail before capability policy or database mutation", async () => {
  const registry = new DurableExecutionRegistry().register(handler());
  for (const invalid of [
    { command: { value: "alpha", token: "never-persist" } },
    { metadata: { executionContractVersion: 1 } },
    {
      metadata: {
        executionOrigin: durableExecutionMcChatOrigin("run-model-controlled"),
      },
    },
    { metadata: ["not-an-object"] },
  ]) {
    let policyCalls = 0;
    let databaseCalls = 0;
    await assert.rejects(
      admitDurableExecutionV2({
        ...baseInput,
        ...invalid,
        registry,
        repository: {
          async createRun(input) {
            databaseCalls += 1;
            return { run: run(input), created: true };
          },
        },
        capabilityPolicy: {
          mayAdmit() {
            policyCalls += 1;
            return true;
          },
        },
      }),
    );
    assert.equal(policyCalls, 0);
    assert.equal(databaseCalls, 0);
  }
});

test("only the server-attested origin path can persist a parent chat run", async () => {
  const registry = new DurableExecutionRegistry().register(handler());
  let createdInput: CreateExecutionRunInput | undefined;
  await admitDurableExecutionV2({
    ...baseInput,
    registry,
    trustedOrigin: durableExecutionMcChatOrigin("run-parent-001"),
    repository: {
      async createRun(input) {
        throw new Error(`untrusted create called for ${input.operation}`);
      },
      async createRunWithTrustedOrigin({ command, origin }) {
        createdInput = {
          ...command,
          metadata: { ...(command.metadata ?? {}), executionOrigin: origin },
        };
        return { run: run(createdInput), created: true };
      },
    },
    capabilityPolicy: { mayAdmit: () => true },
  });

  assert.deepEqual(createdInput?.metadata?.executionOrigin, {
    schemaVersion: 1,
    kind: "mc_chat_parent_run",
    parentAgentRunId: "run-parent-001",
  });

  await assert.rejects(
    admitDurableExecutionV2({
      ...baseInput,
      registry,
      trustedOrigin: {
        schemaVersion: 1,
        kind: "mc_chat_parent_run",
        parentAgentRunId: "../other-run",
      } as never,
      repository: {
        async createRun(input) {
          return { run: run(input), created: true };
        },
      },
      capabilityPolicy: { mayAdmit: () => true },
    }),
    (error: unknown) =>
      error instanceof DurableExecutionAdmissionError &&
      error.code === "durable_metadata_invalid",
  );
});

test("admission revalidates mutating reconciliation before cancellation or outcome-unknown can reach I/O", async () => {
  const mutatingSafeties: DurableEffectSafety[] = [
    {
      kind: "target_idempotency",
      delivery: "at_least_once_attempts",
      keyPlacement: "header",
      replay: "same_key_same_payload",
    },
    {
      kind: "reconcile_before_replay",
      delivery: "at_least_once_attempts",
      lookup: "by_effect_key",
      absenceMustBeAuthoritative: true,
    },
  ];

  for (const safety of mutatingSafeties) {
    const candidate = handler();
    for (const definition of Object.values(candidate.effects)) {
      (definition as { safety: DurableEffectSafety }).safety = safety;
    }
    const registry = new DurableExecutionRegistry().register(candidate);
    for (const definition of Object.values(candidate.effects)) {
      (definition as { reconcile?: unknown }).reconcile = undefined;
    }
    let policyCalls = 0;
    let databaseCalls = 0;
    await assert.rejects(
      admitDurableExecutionV2({
        ...baseInput,
        registry,
        capabilityPolicy: {
          mayAdmit() {
            policyCalls += 1;
            return true;
          },
        },
        repository: {
          async createRun(input) {
            databaseCalls += 1;
            return { run: run(input), created: true };
          },
        },
      }),
      DurableEffectPolicyDriftError,
    );
    assert.equal(policyCalls, 0);
    assert.equal(databaseCalls, 0);
  }
});

test("capability denial or policy failure is fail-closed before create", async () => {
  const registry = new DurableExecutionRegistry().register(handler());
  for (const policy of [
    () => false,
    () => {
      throw new Error("policy unavailable");
    },
  ]) {
    let databaseCalls = 0;
    await assert.rejects(
      admitDurableExecutionV2({
        ...baseInput,
        registry,
        repository: {
          async createRun(input) {
            databaseCalls += 1;
            return { run: run(input), created: true };
          },
        },
        capabilityPolicy: { mayAdmit: policy },
      }),
      DurableExecutionAdmissionError,
    );
    assert.equal(databaseCalls, 0);
  }
});
