import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import type { ExecutionRun } from "@/lib/execution-control";
import {
  DURABLE_EXECUTION_HANDLER_CONTRACT_VERSION,
  DURABLE_EXECUTION_HANDLER_CONTRACT_VERSION_V2,
} from "@/lib/durable-execution/contract";
import {
  DurableEffectDefinitionValidationError,
  durableEffectPolicyDescriptor,
  durableEffectPolicyFingerprint,
  parseDurableEffectReceipt,
  type DurableEffectDefinition,
  type DurableExecutionHandlerV2,
  validateDurableEffectDefinition,
} from "@/lib/durable-execution/effect-contract";
import {
  DURABLE_JSON_GLOBAL_BOUNDS,
  DurableJsonValidationError,
  canonicalDurableJson,
  findDurableSecret,
  parseDurableJsonContractValue,
  type DurableJson,
  type DurableJsonBounds,
  type DurableJsonContract,
  validateDurableJson,
} from "@/lib/durable-execution/json-contract";
import {
  DurableEffectPolicyDriftError,
  DurableExecutionHandlerContractMismatchError,
  DurableExecutionHandlerPolicyDriftError,
  DurableExecutionPolicyMismatchError,
  DurableExecutionHandlerValidationError,
  DurableExecutionRegistry,
  MAX_DURABLE_EFFECTS_PER_HANDLER,
  UnsupportedDurableExecutionHandlerContractError,
  executionHandlerContractVersionFromRun,
} from "@/lib/durable-execution/registry";
import type { DurableExecutionHandler } from "@/lib/durable-execution/runtime";

const compactBounds: DurableJsonBounds = {
  maxBytes: 4_096,
  maxDepth: 8,
  maxNodes: 100,
  maxStringBytes: 1_024,
  maxArrayItems: 20,
  maxObjectKeys: 20,
};

function bounds(overrides: Partial<DurableJsonBounds> = {}): DurableJsonBounds {
  return { ...compactBounds, ...overrides };
}

function contract<T extends DurableJson>(
  parse: (value: unknown) => T = (value) => value as T,
  overrides: Partial<DurableJsonBounds> = {},
  schemaVersion = 1,
): DurableJsonContract<T> {
  return {
    schemaVersion,
    bounds: bounds(overrides),
    secrets: { mode: "reject" },
    parse,
  };
}

function validationCode(
  code: DurableJsonValidationError["code"],
): (error: unknown) => boolean {
  return (error) =>
    error instanceof Error &&
    (error as Error & { code?: unknown }).code === code;
}

test("canonical JSON is byte-stable, sorts keys, normalizes -0, and fingerprints schema + parsed value", () => {
  assert.equal(
    canonicalDurableJson({ z: -0, a: { y: true, x: null } }),
    '{"a":{"x":null,"y":true},"z":0}',
  );
  const closed = contract<{ keep: string }>((value) => {
    const record = value as { keep?: unknown };
    if (typeof record.keep !== "string") throw new Error("invalid");
    return { keep: record.keep };
  });
  const left = parseDurableJsonContractValue(
    closed,
    { ignored: 1, keep: "yes" },
    "command",
  );
  const right = parseDurableJsonContractValue(
    closed,
    { keep: "yes", ignored: 1 },
    "command",
  );
  assert.deepEqual(left.value, { keep: "yes" });
  assert.equal(left.fingerprint, right.fingerprint);
  assert.match(left.fingerprint, /^[a-f0-9]{64}$/);
  const nextSchema = parseDurableJsonContractValue(
    { ...closed, schemaVersion: 2 },
    { keep: "yes" },
    "command",
  );
  assert.notEqual(left.fingerprint, nextSchema.fingerprint);
});

test("global ceilings are exact and contracts cannot declare broader bounds", () => {
  assert.equal(DURABLE_JSON_GLOBAL_BOUNDS.command.maxBytes, 128 * 1024);
  assert.equal(DURABLE_JSON_GLOBAL_BOUNDS.effect_receipt.maxBytes, 16 * 1024);
  assert.throws(
    () =>
      parseDurableJsonContractValue(
        contract((value) => value as DurableJson, {
          maxBytes: DURABLE_JSON_GLOBAL_BOUNDS.effect_receipt.maxBytes + 1,
        }),
        null,
        "effect_receipt",
      ),
    validationCode("durable_json_contract_invalid"),
  );
});

test("canonical byte limits count UTF-8 without truncating", () => {
  const exact = validateDurableJson<string>("é", {
    bounds: bounds({ maxBytes: 4 }),
  });
  assert.equal(exact.canonicalJson, '"é"');
  assert.equal(exact.bytes, 4);
  assert.throws(
    () => validateDurableJson("éé", { bounds: bounds({ maxBytes: 5 }) }),
    validationCode("durable_json_bytes_exceeded"),
  );
});

test("depth and node limits count the root and reject before persistence", () => {
  assert.equal(
    validateDurableJson({ child: null }, { bounds: bounds({ maxDepth: 2 }) })
      .nodes,
    2,
  );
  assert.throws(
    () =>
      validateDurableJson(
        { child: { nested: null } },
        { bounds: bounds({ maxDepth: 2 }) },
      ),
    validationCode("durable_json_depth_exceeded"),
  );
  assert.throws(
    () =>
      validateDurableJson([null, null], {
        bounds: bounds({ maxNodes: 2 }),
      }),
    validationCode("durable_json_nodes_exceeded"),
  );
});

test("string, array, and object limits apply at every nesting level", () => {
  assert.throws(
    () =>
      validateDurableJson(
        { nested: "éé" },
        {
          bounds: bounds({ maxStringBytes: 3 }),
        },
      ),
    validationCode("durable_json_string_exceeded"),
  );
  assert.throws(
    () =>
      validateDurableJson(
        { nested: [1, 2, 3] },
        {
          bounds: bounds({ maxArrayItems: 2 }),
        },
      ),
    validationCode("durable_json_array_exceeded"),
  );
  assert.throws(
    () =>
      validateDurableJson(
        { nested: { a: 1, b: 2 } },
        {
          bounds: bounds({ maxObjectKeys: 1 }),
        },
      ),
    validationCode("durable_json_object_exceeded"),
  );
});

test("non-JSON values, exotic objects, accessors, sparse arrays, and cycles fail closed", () => {
  const cycle: Record<string, unknown> = {};
  cycle.self = cycle;
  const sparse = new Array(2);
  sparse[1] = "value";
  const accessor = ["safe"];
  Object.defineProperty(accessor, "0", {
    enumerable: true,
    get: () => "computed",
  });
  for (const value of [
    NaN,
    Infinity,
    undefined,
    () => undefined,
    1n,
    Symbol("x"),
    new Date(),
    sparse,
    accessor,
  ]) {
    assert.throws(
      () => validateDurableJson(value, { bounds: compactBounds }),
      validationCode("durable_json_type_invalid"),
    );
  }
  assert.throws(
    () => validateDurableJson(cycle, { bounds: compactBounds }),
    validationCode("durable_json_cycle"),
  );
});

test("defensive scanner rejects sensitive keys and representative secret values", () => {
  for (const key of [
    "authorization",
    "apiKey",
    "access_token",
    "cookie",
    "client-secret",
    "privateKey",
  ]) {
    assert.throws(
      () =>
        validateDurableJson(
          { [key]: "redacted" },
          { bounds: compactBounds, secrets: { mode: "reject" } },
        ),
      validationCode("durable_json_secret_detected"),
    );
  }
  for (const value of [
    "Bearer abcdefghijklmnop",
    "sk-proj-abcdefghijklmnop",
    "eyJabcdefghijk.abcdefghijkl.abcdefghijkl",
    "fixture_secret_value",
    "postgres://user:password@database.internal/db",
    "api_key=abcdefghijklmnop",
  ]) {
    assert.throws(
      () =>
        validateDurableJson(
          { value },
          { bounds: compactBounds, secrets: { mode: "reject" } },
        ),
      validationCode("durable_json_secret_detected"),
    );
  }
  assert.deepEqual(findDurableSecret({ authorization: "anything" }), {
    kind: "sensitive_key",
    path: "$.authorization",
  });
  assert.doesNotThrow(() =>
    validateDurableJson(
      {
        id: "550e8400-e29b-41d4-a716-446655440000",
        note: "keep this secret for later review",
      },
      { bounds: compactBounds, secrets: { mode: "reject" } },
    ),
  );
});

test("credentialRef permits only opaque references matching the contract", () => {
  const secrets = {
    mode: "reject" as const,
    credentialRefPattern: /^vault:\/\/[a-z0-9/_-]+$/,
  };
  assert.deepEqual(
    validateDurableJson(
      { credentialRef: "vault://tenant/provider" },
      { bounds: compactBounds, secrets },
    ).value,
    { credentialRef: "vault://tenant/provider" },
  );
  for (const credentialRef of [
    "plain-value",
    "Bearer abcdefghijklmnop",
    "sk-proj-abcdefghijklmnop",
  ]) {
    assert.throws(
      () =>
        validateDurableJson(
          { credentialRef },
          { bounds: compactBounds, secrets },
        ),
      validationCode("durable_json_secret_detected"),
    );
  }
});

test("raw secret-bearing unknown properties are rejected before a schema can strip them", () => {
  const closed = contract<{ id: string }>((raw) => ({
    id: String((raw as { id?: unknown }).id),
  }));
  assert.throws(
    () =>
      parseDurableJsonContractValue(
        closed,
        { id: "safe-id", token: "never-persist" },
        "command",
      ),
    validationCode("durable_json_secret_detected"),
  );
});

type Payload = { resourceId: string };
type Receipt = { remoteId: string };

function definition(
  overrides: Partial<DurableEffectDefinition<Payload, Receipt>> = {},
): DurableEffectDefinition<Payload, Receipt> {
  return {
    step: "provider.resource.write",
    definitionVersion: 1,
    capability: "provider.resource.write",
    payload: contract<Payload>(),
    receipt: contract<Receipt>(),
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
      return { kind: "outcome_unknown", code: "provider_unknown" };
    },
    ...overrides,
  };
}

function handlerV2(
  effect = definition(),
): DurableExecutionHandlerV2<
  { resourceId: string },
  { stage: string },
  { remoteId: string },
  { "provider.resource.write": DurableEffectDefinition<Payload, Receipt> }
> {
  return {
    contractVersion: DURABLE_EXECUTION_HANDLER_CONTRACT_VERSION_V2,
    operation: "example.resource.sync",
    version: 2,
    command: contract<{ resourceId: string }>(),
    checkpoint: contract<{ stage: string }>(),
    result: contract<{ remoteId: string }>(),
    effects: { "provider.resource.write": effect },
    async execute() {
      return { output: { remoteId: "remote-1" } };
    },
    classifyPureError() {
      return { code: "pure_error", retryable: false, message: "invalid" };
    },
    projectTerminal() {},
  };
}

function handlerV1(): DurableExecutionHandler {
  return {
    contractVersion: DURABLE_EXECUTION_HANDLER_CONTRACT_VERSION,
    operation: "example.resource.sync",
    version: 1,
    decode() {
      return {};
    },
    async execute() {
      return {};
    },
    classifyError() {
      return { code: "failed", retryable: false, message: "failed" };
    },
    projectTerminal() {},
  };
}

function executionRun(metadata: Record<string, unknown>): ExecutionRun {
  return {
    id: "run-1",
    tenantKey: "tenant-a",
    idempotencyKey: "command-1",
    aggregateType: "example.resource",
    aggregateId: "resource-1",
    operation: "example.resource.sync",
    mode: "canary",
    status: "queued",
    input: { schemaVersion: 1 },
    metadata,
    availableAt: "2026-07-16T00:00:00.000Z",
    claimCount: 0,
    handlerAttempt: 0,
    createdAt: "2026-07-16T00:00:00.000Z",
    updatedAt: "2026-07-16T00:00:00.000Z",
  };
}

test("effect policy fingerprint is canonical, deterministic, and policy-sensitive", () => {
  const first = definition();
  const reordered = definition({
    retry: {
      jitter: "full",
      maxDelayMs: 30_000,
      baseDelayMs: 1_000,
      maxAttempts: 3,
    },
    safety: {
      replay: "same_key_same_payload",
      keyPlacement: "header",
      delivery: "at_least_once_attempts",
      kind: "target_idempotency",
    },
    async invoke() {
      return { remoteId: "different-code-is-versioned-externally" };
    },
  });
  assert.equal(
    durableEffectPolicyFingerprint(first),
    durableEffectPolicyFingerprint(reordered),
  );
  assert.match(durableEffectPolicyFingerprint(first), /^[a-f0-9]{64}$/);
  assert.notEqual(
    durableEffectPolicyFingerprint(first),
    durableEffectPolicyFingerprint(
      definition({ retry: { ...first.retry, maxAttempts: 4 } }),
    ),
  );
  assert.deepEqual(durableEffectPolicyDescriptor(first).reconciliation, {
    required: true,
    configured: true,
  });
  const readOnlyWithoutReconciler = definition({
    safety: { kind: "read_only", retry: "bounded" },
    reconcile: undefined,
  });
  const readOnlyWithReconciler = definition({
    safety: { kind: "read_only", retry: "bounded" },
  });
  assert.deepEqual(
    durableEffectPolicyDescriptor(readOnlyWithoutReconciler).reconciliation,
    { required: false, configured: false },
  );
  assert.notEqual(
    durableEffectPolicyFingerprint(readOnlyWithoutReconciler),
    durableEffectPolicyFingerprint(readOnlyWithReconciler),
  );
});

test("effect receipt boundary rejects scalar or array parser output before repository completion", () => {
  for (const parsedReceipt of ["not-an-object", ["not-an-object"]]) {
    const invalidReceipt = definition({
      receipt: contract<Receipt>(() => parsedReceipt as never),
    });
    assert.throws(
      () => parseDurableEffectReceipt(invalidReceipt, { remoteId: "remote-1" }),
      validationCode("durable_json_schema_invalid"),
    );
  }
  assert.deepEqual(
    parseDurableEffectReceipt(definition(), { remoteId: "remote-1" }).value,
    { remoteId: "remote-1" },
  );
});

test("effect definition rejects invalid policy and every mutating safety without reconcile", () => {
  for (const effect of [
    definition({ step: "Provider.Write" }),
    definition({ step: `a${"x".repeat(64)}` }),
    definition({ safety: { kind: "mutating_best_effort" } as never }),
    definition({ retry: { ...definition().retry, maxAttempts: 11 } }),
    definition({ retry: { ...definition().retry, baseDelayMs: 999 } }),
    definition({ timeoutMs: 999 }),
    definition({ reconcile: undefined }),
    definition({ reconcile: "dynamic-reconciler" as never }),
    definition({
      safety: {
        kind: "reconcile_before_replay",
        delivery: "at_least_once_attempts",
        lookup: "by_effect_key",
        absenceMustBeAuthoritative: true,
      },
      reconcile: undefined,
    }),
  ]) {
    assert.throws(
      () => validateDurableEffectDefinition(effect),
      DurableEffectDefinitionValidationError,
    );
  }
  assert.doesNotThrow(() =>
    validateDurableEffectDefinition(
      definition({
        safety: { kind: "read_only", retry: "bounded" },
        reconcile: undefined,
      }),
    ),
  );
  assert.doesNotThrow(() =>
    new DurableExecutionRegistry().register(
      handlerV2(
        definition({
          safety: { kind: "read_only", retry: "bounded" },
          reconcile: undefined,
        }),
      ),
    ),
  );
});

test("registry rejects outcome-unknown mutation handlers without reconciliation before invocation", () => {
  for (const safety of [
    {
      kind: "target_idempotency" as const,
      delivery: "at_least_once_attempts" as const,
      keyPlacement: "header" as const,
      replay: "same_key_same_payload" as const,
    },
    {
      kind: "reconcile_before_replay" as const,
      delivery: "at_least_once_attempts" as const,
      lookup: "by_effect_key" as const,
      absenceMustBeAuthoritative: true as const,
    },
  ]) {
    let providerCalls = 0;
    const invalid = definition({
      safety,
      reconcile: undefined,
      async invoke() {
        providerCalls += 1;
        throw new Error("accepted but response lost");
      },
    });
    assert.throws(
      () => new DurableExecutionRegistry().register(handlerV2(invalid)),
      (error) =>
        error instanceof DurableExecutionHandlerValidationError &&
        error.reason === "effects",
    );
    assert.equal(providerCalls, 0);
  }
});

test("registry coexists with v1/v2, freezes contract identity, and keeps the v1 engine view", () => {
  const v1 = handlerV1();
  const v2 = handlerV2();
  const registry = new DurableExecutionRegistry().register(v1).register(v2);
  assert.deepEqual(registry.contractDescriptors(), [
    {
      operation: "example.resource.sync",
      version: 1,
      contractVersion: 1,
    },
    {
      operation: "example.resource.sync",
      version: 2,
      contractVersion: 2,
    },
  ]);
  assert.equal(registry.handlersForOperation(v1.operation).length, 1);
  assert.equal(registry.registeredHandlersForOperation(v1.operation).length, 2);
  assert.equal(
    registry.resolveRegistered(executionRun({ executionHandlerVersion: 1 }))
      .contractVersion,
    1,
  );
  assert.equal(
    registry.resolveRegistered(
      executionRun({
        executionHandlerVersion: 2,
        executionContractVersion: 2,
        executionPolicyFingerprint: registry.executionPolicyFingerprint(
          "example.resource.sync",
          2,
        ),
      }),
    ).contractVersion,
    2,
  );
  assert.throws(
    () =>
      registry.resolveRegistered(executionRun({ executionHandlerVersion: 2 })),
    DurableExecutionHandlerContractMismatchError,
  );
  assert.throws(
    () =>
      registry.resolveRegistered(
        executionRun({
          executionHandlerVersion: 2,
          executionContractVersion: 2,
        }),
      ),
    DurableExecutionPolicyMismatchError,
  );
  assert.throws(
    () =>
      registry.resolveRegistered(
        executionRun({
          executionHandlerVersion: 2,
          executionContractVersion: 2,
          executionPolicyFingerprint: "0".repeat(64),
        }),
      ),
    DurableExecutionPolicyMismatchError,
  );
  assert.throws(
    () => registry.require("example.resource.sync", 2),
    UnsupportedDurableExecutionHandlerContractError,
  );
  assert.equal(
    registry.effectPolicyFingerprint(
      "example.resource.sync",
      2,
      "provider.resource.write",
    ),
    durableEffectPolicyFingerprint(v2.effects["provider.resource.write"]),
  );
});

test("unknown contract versions and malformed v2 handlers fail closed", () => {
  assert.throws(
    () =>
      executionHandlerContractVersionFromRun(
        executionRun({ executionContractVersion: 3 }),
      ),
    UnsupportedDurableExecutionHandlerContractError,
  );
  assert.throws(
    () =>
      new DurableExecutionRegistry().register({
        ...handlerV1(),
        contractVersion: 3,
      } as never),
    UnsupportedDurableExecutionHandlerContractError,
  );
  assert.throws(
    () =>
      new DurableExecutionRegistry().register(
        handlerV2(definition({ step: "different.step" })),
      ),
    DurableExecutionHandlerValidationError,
  );
  const tooBroad = handlerV2();
  tooBroad.effects["provider.resource.write"].payload.bounds.maxBytes =
    DURABLE_JSON_GLOBAL_BOUNDS.effect_payload.maxBytes + 1;
  assert.throws(
    () => new DurableExecutionRegistry().register(tooBroad),
    DurableExecutionHandlerValidationError,
  );
  const tooManyEffects = handlerV2() as DurableExecutionHandlerV2;
  tooManyEffects.effects = Object.fromEntries(
    Array.from({ length: MAX_DURABLE_EFFECTS_PER_HANDLER + 1 }, (_, index) => {
      const step = `provider.write.${index}`;
      return [step, definition({ step })];
    }),
  );
  assert.throws(
    () => new DurableExecutionRegistry().register(tooManyEffects),
    DurableExecutionHandlerValidationError,
  );
});

test("registry detects effect policy mutation after registration", () => {
  const effect = definition();
  const registry = new DurableExecutionRegistry().register(handlerV2(effect));
  effect.retry.maxAttempts = 4;
  assert.throws(
    () => registry.requireRegistered("example.resource.sync", 2),
    DurableEffectPolicyDriftError,
  );
});

test("registry detects command, checkpoint, and result contract mutation after registration", () => {
  for (const mutate of [
    (handler: ReturnType<typeof handlerV2>) => {
      handler.command.schemaVersion += 1;
    },
    (handler: ReturnType<typeof handlerV2>) => {
      handler.checkpoint.bounds.maxBytes -= 1;
    },
    (handler: ReturnType<typeof handlerV2>) => {
      handler.result.secrets.credentialRefPattern = /^vault:\/\/[a-z]+$/;
    },
  ]) {
    const handler = handlerV2();
    const registry = new DurableExecutionRegistry().register(handler);
    mutate(handler);
    assert.throws(
      () => registry.requireRegistered("example.resource.sync", 2),
      DurableExecutionHandlerPolicyDriftError,
    );
  }
});

test("durable execution core remains free of product-domain branches", () => {
  const testDir = dirname(fileURLToPath(import.meta.url));
  const coreDir = join(testDir, "..", "durable-execution");
  const source = readdirSync(coreDir)
    .filter((name) => name.endsWith(".ts"))
    .map((name) => readFileSync(join(coreDir, name), "utf8"))
    .join("\n");
  for (const forbidden of ["lead", "partnership", "yalc", "hospital"]) {
    assert.doesNotMatch(source, new RegExp(`\\b${forbidden}`, "i"));
  }
});
