import assert from "node:assert/strict";
import test from "node:test";
import {
  executionCommandFingerprint,
  type CreateExecutionRunInput,
  type ExecutionControlRepository,
  type ExecutionRun,
  type ExecutionScopedAggregateRef,
  type ExecutionScopedRunRef,
} from "@/lib/execution-control";
import { ExecutionCommandConflictError } from "@/lib/execution-control/types";
import { createLeadsApolloPeopleSearchEffect } from "../search-apollo-binding";
import {
  admitLeadsSearchFromAgent,
  LeadsSearchAgentBridgeError,
} from "../search-agent-bridge";
import {
  LeadsSearchError,
  admitLeadsSearch,
  getLeadsSearchStatus,
  type LeadsSearchAdmissionDependencies,
  type LeadsSearchEnvironment,
} from "../search-durable-worker";

const timestamp = "2026-07-16T10:00:00.000Z";
const enabledEnv: LeadsSearchEnvironment = {
  LEADS_SEARCH_DURABLE_WORKER_BOOT_ENABLED: "1",
  LEADS_SEARCH_EXECUTION_V2: "canary",
  LEADS_SEARCH_V2_SLUGS: "hospital-capilar,other-client",
};
const offEnv: LeadsSearchEnvironment = {
  LEADS_SEARCH_DURABLE_WORKER_BOOT_ENABLED: "1",
  LEADS_SEARCH_EXECUTION_V2: "off",
  LEADS_SEARCH_V2_SLUGS: "",
};
const originCommandRepository = {
  async claimExecutionOriginCommand(input: {
    tenantKey: string;
    origin: {
      schemaVersion: 1;
      kind: "mc_chat_parent_run";
      parentAgentRunId: string;
    };
    operation: string;
  }) {
    return {
      tenantKey: input.tenantKey,
      origin: input.origin,
      operation: input.operation,
      claimedAt: timestamp,
    };
  },
};

function matchesScope(
  run: ExecutionRun,
  input: { tenantKey: string; operation: string; mode: string },
): boolean {
  return (
    run.tenantKey === input.tenantKey.trim().toLowerCase() &&
    run.operation === input.operation.trim().toLowerCase() &&
    run.mode === input.mode
  );
}

class AdmissionRepository {
  readonly runs = new Map<string, ExecutionRun>();
  readonly creates: CreateExecutionRunInput[] = [];
  private sequence = 0;

  async createRun(input: CreateExecutionRunInput) {
    this.creates.push(input);
    const fingerprint = executionCommandFingerprint(input);
    const existing = [...this.runs.values()].find(
      (run) =>
        matchesScope(run, {
          tenantKey: input.tenantKey,
          operation: input.operation,
          mode: input.mode ?? "shadow",
        }) &&
        run.aggregateType === input.aggregateType &&
        run.aggregateId === input.aggregateId &&
        run.idempotencyKey === input.idempotencyKey,
    );
    if (existing) {
      if (existing.commandFingerprint !== fingerprint) {
        throw new ExecutionCommandConflictError();
      }
      return { run: existing, created: false };
    }
    const run: ExecutionRun = {
      id: `xrun-agent-${++this.sequence}`,
      tenantKey: input.tenantKey.trim().toLowerCase(),
      idempotencyKey: input.idempotencyKey,
      aggregateType: input.aggregateType,
      aggregateId: input.aggregateId,
      operation: input.operation.trim().toLowerCase(),
      mode: input.mode ?? "shadow",
      status: "queued",
      ...(input.traceId ? { traceId: input.traceId } : {}),
      input: input.input,
      metadata: input.metadata ?? {},
      commandFingerprint: fingerprint,
      availableAt: timestamp,
      claimCount: 0,
      handlerAttempt: 0,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    this.runs.set(run.id, run);
    return { run, created: true };
  }

  async createRunWithTrustedOrigin(input: {
    command: CreateExecutionRunInput;
    origin: { schemaVersion: 1; kind: "mc_chat_parent_run"; parentAgentRunId: string };
  }) {
    return this.createRun({
      ...input.command,
      metadata: {
        ...(input.command.metadata ?? {}),
        executionOrigin: input.origin,
      },
    });
  }

  async getRunByAggregateForScope(
    input: ExecutionScopedAggregateRef,
  ): Promise<ExecutionRun | null> {
    return (
      [...this.runs.values()].find(
        (run) =>
          matchesScope(run, input) &&
          run.aggregateType === input.aggregateType &&
          run.aggregateId === input.aggregateId,
      ) ?? null
    );
  }

  async getRunByIdForScope(
    input: ExecutionScopedRunRef,
  ): Promise<ExecutionRun | null> {
    const run = this.runs.get(input.runId);
    return run && matchesScope(run, input) ? run : null;
  }

  asExecutionRepository(): ExecutionControlRepository {
    return this as unknown as ExecutionControlRepository;
  }
}

test("chat run plus canonical tenant command gives deterministic replay and 409 conflict", async () => {
  const repository = new AdmissionRepository();
  let providerCalls = 0;
  const effect = createLeadsApolloPeopleSearchEffect({
    transport: async () => {
      providerCalls += 1;
      return { people: [], pagination: { total_entries: 0 } };
    },
  });
  const coreDependencies = {
    repository: repository.asExecutionRepository(),
    env: enabledEnv,
    wake: () => undefined,
    apolloPeopleSearchEffect: effect,
  };
  const bridgeDependencies = {
    originCommandRepository,
    admit: (
      input: Parameters<typeof admitLeadsSearch>[0],
      admissionDependencies?: LeadsSearchAdmissionDependencies,
    ) =>
      admitLeadsSearch(input, {
        ...coreDependencies,
        ...admissionDependencies,
      }),
  };
  const context = {
    tenantSlug: "Hospital-Capilar",
    agentRunId: "arun-chat-001",
  };

  const first = await admitLeadsSearchFromAgent(
    context,
    {
      criteria: {
        titles: [" Marketing Director "],
        organizationDomains: ["Example.COM."],
        seniorities: [" Director "],
      },
      limit: 5,
    },
    bridgeDependencies,
  );
  const duplicate = await admitLeadsSearchFromAgent(
    context,
    {
      criteria: {
        titles: ["Marketing Director"],
        organizationDomains: ["example.com"],
        seniorities: ["director"],
      },
      limit: 5,
    },
    bridgeDependencies,
  );

  assert.equal(first.receipt.created, true);
  assert.equal(duplicate.receipt.replayed, true);
  assert.equal(duplicate.receipt.runId, first.receipt.runId);
  assert.deepEqual(duplicate.identity, first.identity);
  assert.equal(repository.runs.size, 1);
  assert.deepEqual(repository.creates[0].metadata?.executionOrigin, {
    schemaVersion: 1,
    kind: "mc_chat_parent_run",
    parentAgentRunId: "arun-chat-001",
  });
  assert.equal(providerCalls, 0, "admission never owns provider I/O");

  await assert.rejects(
    admitLeadsSearchFromAgent(
      context,
      { criteria: { titles: ["Sales Director"] }, limit: 5 },
      bridgeDependencies,
    ),
    (error: unknown) =>
      error instanceof LeadsSearchError &&
      error.code === "execution_command_conflict" &&
      error.status === 409,
  );
  assert.equal(repository.runs.size, 1);
  assert.equal(providerCalls, 0);
});

test("tenant scope is part of command identity and the public status read cannot cross it", async () => {
  const repository = new AdmissionRepository();
  const coreDependencies = {
    repository: repository.asExecutionRepository(),
    env: enabledEnv,
    wake: () => undefined,
  };
  const admit = (input: Parameters<typeof admitLeadsSearch>[0]) =>
    admitLeadsSearch(input, coreDependencies);
  const status = (input: Parameters<typeof getLeadsSearchStatus>[0]) =>
    getLeadsSearchStatus(input, coreDependencies);
  const input = { criteria: { titles: ["Marketing Director"] }, limit: 5 };
  const first = await admitLeadsSearchFromAgent(
    { tenantSlug: "hospital-capilar", agentRunId: "arun-shared" },
    input,
    { admit, originCommandRepository },
  );
  const second = await admitLeadsSearchFromAgent(
    { tenantSlug: "other-client", agentRunId: "arun-shared" },
    input,
    { admit, originCommandRepository },
  );

  assert.notEqual(
    first.identity.commandFingerprint,
    second.identity.commandFingerprint,
  );
  assert.notEqual(first.receipt.runId, second.receipt.runId);
  assert.equal(
    await status({
      slug: "other-client",
      runId: first.receipt.runId,
    }),
    null,
  );
  assert.equal(
    (
      await status({
        slug: "hospital-capilar",
        runId: first.receipt.runId,
      })
    )?.runId,
    first.receipt.runId,
  );
});

test("the durable parent claim rejects command drift before product admission", async () => {
  const repository = new AdmissionRepository();
  let claims = 0;
  await assert.rejects(
    admitLeadsSearchFromAgent(
      { tenantSlug: "hospital-capilar", agentRunId: "arun-other-tool-won" },
      { criteria: { titles: ["Marketing Director"] }, limit: 5 },
      {
        originCommandRepository: {
          async claimExecutionOriginCommand() {
            claims += 1;
            throw Object.assign(new Error("redacted"), {
              code: "execution_origin_command_conflict",
            });
          },
        },
        admit: (input, admissionDependencies) =>
          admitLeadsSearch(input, {
            ...admissionDependencies,
            repository: repository.asExecutionRepository(),
            env: enabledEnv,
            wake: () => undefined,
          }),
      },
    ),
    (error: unknown) =>
      error instanceof LeadsSearchAgentBridgeError &&
      error.code === "execution_command_conflict" &&
      error.status === 409,
  );
  assert.equal(claims, 1);
  assert.equal(repository.creates.length, 0);
});

test("rollout off rejects a new chat command before Ledger mutation or provider I/O", async () => {
  const repository = new AdmissionRepository();
  let providerCalls = 0;
  let claims = 0;
  const effect = createLeadsApolloPeopleSearchEffect({
    transport: async () => {
      providerCalls += 1;
      return { people: [], pagination: { total_entries: 0 } };
    },
  });

  await assert.rejects(
    admitLeadsSearchFromAgent(
      { tenantSlug: "hospital-capilar", agentRunId: "arun-off" },
      { criteria: { titles: ["Marketing Director"] }, limit: 5 },
      {
        originCommandRepository: {
          async claimExecutionOriginCommand(input) {
            claims += 1;
            return originCommandRepository.claimExecutionOriginCommand(input);
          },
        },
        admit: (input) =>
          admitLeadsSearch(input, {
            repository: repository.asExecutionRepository(),
            env: offEnv,
            wake: () => undefined,
            apolloPeopleSearchEffect: effect,
          }),
      },
    ),
    (error: unknown) =>
      error instanceof LeadsSearchError &&
      error.code === "leads_search_not_enabled" &&
      error.status === 403,
  );
  assert.equal(repository.creates.length, 0);
  assert.equal(repository.runs.size, 0);
  assert.equal(providerCalls, 0);
  assert.equal(claims, 0, "disabled rollout must not consume the parent claim");
});
