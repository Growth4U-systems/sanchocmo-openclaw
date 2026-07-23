import assert from "node:assert/strict";
import { test } from "node:test";
import type { AgentRun } from "@/lib/data/agent-runs";
import {
  executionCommandFingerprint,
  type AcknowledgeExecutionRunCancellationInput,
  type AppendExecutionEventInput,
  type BlockExecutionRunInput,
  type CheckpointExecutionRunInput,
  type ClaimExecutionRunInput,
  type ClaimNextExecutionRunInput,
  type CreateExecutionRunInput,
  type CreateExecutionRunWithTrustedOriginInput,
  type ExecutionAggregateRef,
  type ExecutionControlRepository,
  type ExecutionEvent,
  type ExecutionLeaseReceipt,
  type ExecutionOriginCancellationReceipt,
  type ExecutionRun,
  type ExecutionRunsByOriginPage,
  type FinishExecutionRunInput,
  type ListRunnableExecutionScopesPageInput,
  type ListExecutionRunsByOriginInput,
  type ListExecutionRunsByOriginPageInput,
  type RequestExecutionOriginCancellationInput,
  type RequestExecutionRunCancellationInput,
  type RenewExecutionRunLeaseInput,
  type RequeueExecutionRunInput,
  type RunnableExecutionScopePage,
  type TransitionExecutionRunInput,
} from "@/lib/execution-control";
import { CHAT_AGENT_TURN_OPERATION } from "../agent-turn-contract-v1";
import { admitChatAgentTurnDispatch } from "../agent-turn-durable";
import {
  authorizeChatAgentTurnRuntimeRequest,
  CHAT_AGENT_TURN_REMOTE_LEASE_MS,
  CHAT_AGENT_TURN_REMOTE_POLL_MS,
  CHAT_AGENT_TURN_TERMINAL_RECOVERY_GRACE_MS,
  claimNextChatAgentTurn,
  completeChatAgentTurnRuntime,
  markChatAgentTurnRuntimeStarted,
  requeueChatAgentTurnRuntime,
  runtimeToolCapabilityForDispatchLease,
} from "../agent-turn-remote-worker";

const NOW = "2026-07-16T10:00:00.000Z";
const EXPIRED_AT = "2026-07-16T09:59:00.000Z";
const EXPIRES_AT = "2026-07-16T10:01:00.000Z";
const ENABLED_ENV = Object.freeze({
  CHAT_AGENT_TURN_EXECUTION_V1: "canary",
  CHAT_AGENT_TURN_V1_SLUGS: "hospital-capilar",
  CHAT_AGENT_TURN_DURABLE_WORKER_ENABLED: "1",
});

function parentRun(overrides: Partial<AgentRun> = {}): AgentRun {
  return {
    id: "agent-run-1",
    threadId: "hospital-capilar:partners",
    traceId: "trace-agent-run-1",
    runtime: "openclaw",
    agent: "rocinante",
    skill: "partnerships",
    skills: ["partnerships", "leads"],
    skillMode: "auto",
    status: "queued",
    input: {
      slug: "hospital-capilar",
      threadId: "hospital-capilar:partners",
      text: "Busca partners en Madrid",
      userId: "user-martin",
      userName: "Martin",
      source: "mission-control-chat",
      runtimeDispatchMode: "ledger-v1",
      runtimeEffectIntent: [
        "partnerships_discovery_start",
        "unknown_effect",
        "partnerships_discovery_start",
      ],
      controlBaseUrl: "https://staging.sanchocmo.ai",
    },
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

class MemoryRepository implements ExecutionControlRepository {
  readonly runs = new Map<string, ExecutionRun>();
  readonly leaseTokens = new Map<string, string>();
  readonly checkpoints: CheckpointExecutionRunInput[] = [];
  readonly renewals: RenewExecutionRunLeaseInput[] = [];
  readonly finishes: FinishExecutionRunInput[] = [];
  readonly requeues: RequeueExecutionRunInput[] = [];
  readonly blocks: BlockExecutionRunInput[] = [];
  readonly cancellationAcks: AcknowledgeExecutionRunCancellationInput[] = [];
  readonly trustedOrigins = new Map<
    string,
    { tenantKey: string; parentAgentRunId: string }
  >();
  readonly originCancellations = new Map<
    string,
    ExecutionOriginCancellationReceipt
  >();
  private runSequence = 0;
  private leaseSequence = 0;
  private clock = NOW;

  setNow(value: string): void {
    this.clock = value;
  }

  async createRun(input: CreateExecutionRunInput) {
    const id = `dispatch-run-${++this.runSequence}`;
    const run: ExecutionRun = {
      id,
      tenantKey: input.tenantKey,
      idempotencyKey: input.idempotencyKey,
      aggregateType: input.aggregateType,
      aggregateId: input.aggregateId,
      operation: input.operation,
      mode: input.mode ?? "shadow",
      status: "queued",
      input: input.input,
      metadata: input.metadata ?? {},
      commandFingerprint: executionCommandFingerprint(input),
      traceId: input.traceId,
      availableAt: NOW,
      claimCount: 0,
      handlerAttempt: 0,
      createdAt: NOW,
      updatedAt: NOW,
    };
    this.runs.set(id, run);
    return { run, created: true };
  }

  private originKey(tenantKey: string, parentAgentRunId: string): string {
    return `${tenantKey.toLowerCase()}\0${parentAgentRunId}`;
  }

  async createRunWithTrustedOrigin(
    input: CreateExecutionRunWithTrustedOriginInput,
  ) {
    const key = this.originKey(
      input.command.tenantKey,
      input.origin.parentAgentRunId,
    );
    if (this.originCancellations.has(key)) {
      throw new Error("execution_origin_cancelled");
    }
    const receipt = await this.createRun({
      ...input.command,
      metadata: {
        ...(input.command.metadata ?? {}),
        executionOrigin: input.origin,
      },
    });
    this.trustedOrigins.set(receipt.run.id, {
      tenantKey: receipt.run.tenantKey,
      parentAgentRunId: input.origin.parentAgentRunId,
    });
    return receipt;
  }

  async requestOriginCancellation(
    input: RequestExecutionOriginCancellationInput,
  ): Promise<ExecutionOriginCancellationReceipt> {
    const key = this.originKey(
      input.tenantKey,
      input.origin.parentAgentRunId,
    );
    const existing = this.originCancellations.get(key);
    if (existing) return { ...existing, replayed: true };
    const receipt: ExecutionOriginCancellationReceipt = {
      tenantKey: input.tenantKey,
      origin: input.origin,
      cancellationId: input.cancellationId,
      requestedAt: NOW,
      actor: input.actor,
      reasonCode: input.reasonCode,
      replayed: false,
    };
    this.originCancellations.set(key, receipt);
    return receipt;
  }

  async getRunTrustedExecutionOrigin(input: {
    tenantKey: string;
    runId: string;
  }) {
    const registration = this.trustedOrigins.get(input.runId);
    if (!registration || registration.tenantKey !== input.tenantKey) return null;
    const key = this.originKey(
      registration.tenantKey,
      registration.parentAgentRunId,
    );
    const cancellation = this.originCancellations.get(key);
    return {
      tenantKey: registration.tenantKey,
      runId: input.runId,
      origin: {
        schemaVersion: 1 as const,
        kind: "mc_chat_parent_run" as const,
        parentAgentRunId: registration.parentAgentRunId,
      },
      ...(cancellation
        ? {
            cancellation: {
              cancellationId: cancellation.cancellationId,
              requestedAt: cancellation.requestedAt,
              actor: cancellation.actor,
              reasonCode: cancellation.reasonCode,
            },
          }
        : {}),
    };
  }

  async listRunsByExecutionOriginPage(
    input: ListExecutionRunsByOriginPageInput,
  ): Promise<ExecutionRunsByOriginPage> {
    const matches = [...this.runs.values()]
      .filter((run) => {
        const registration = this.trustedOrigins.get(run.id);
        return (
          registration?.tenantKey === input.tenantKey &&
          registration.parentAgentRunId === input.parentAgentRunId &&
          (!input.afterRunId || run.id > input.afterRunId)
        );
      })
      .sort((left, right) => left.id.localeCompare(right.id));
    const runs = matches.slice(0, input.limit);
    return {
      runs,
      ...(matches.length > input.limit
        ? { nextAfterRunId: runs[runs.length - 1]!.id }
        : {}),
    };
  }

  async appendEvent(input: AppendExecutionEventInput): Promise<ExecutionEvent> {
    const run = this.runs.get(input.runId);
    if (!run) throw new Error("run_missing");
    return {
      id: `event-${input.runId}`,
      sequence: 1,
      runId: run.id,
      aggregateType: run.aggregateType,
      aggregateId: run.aggregateId,
      type: input.type,
      ts: NOW,
      data: input.data,
    };
  }

  async transitionRun(
    runId: string,
    input: TransitionExecutionRunInput,
  ): Promise<ExecutionRun> {
    const run = this.runs.get(runId);
    if (!run) throw new Error("run_missing");
    const next: ExecutionRun = {
      ...run,
      status: input.status,
      currentStep: input.currentStep ?? undefined,
      output: input.output,
      error: input.error ?? undefined,
      updatedAt: NOW,
    };
    this.runs.set(runId, next);
    return next;
  }

  async getRunById(runId: string): Promise<ExecutionRun | null> {
    return this.runs.get(runId) ?? null;
  }

  async getRunByAggregate(
    input: ExecutionAggregateRef,
  ): Promise<ExecutionRun | null> {
    return (
      [...this.runs.values()].find(
        (run) =>
          run.tenantKey === input.tenantKey &&
          run.aggregateType === input.aggregateType &&
          run.aggregateId === input.aggregateId &&
          (!input.operation || run.operation === input.operation),
      ) ?? null
    );
  }

  async listEvents(): Promise<ExecutionEvent[]> {
    return [];
  }

  async listRunsByExecutionOrigin(
    input: ListExecutionRunsByOriginInput,
  ): Promise<ExecutionRun[]> {
    const page = await this.listRunsByExecutionOriginPage(input);
    if (page.nextAfterRunId) throw new Error("origin_fanout");
    return page.runs;
  }

  async requestRunCancellation(input: RequestExecutionRunCancellationInput) {
    const run = this.runs.get(input.runId);
    if (
      !run ||
      run.tenantKey !== input.tenantKey ||
      run.operation !== input.operation ||
      run.mode !== input.mode
    ) {
      return null;
    }
    if (["completed", "partial", "failed", "cancelled"].includes(run.status)) {
      return null;
    }
    const terminal = run.status === "queued" || run.status === "blocked";
    const updated: ExecutionRun = {
      ...run,
      status: terminal ? "cancelled" : run.status,
      cancelRequestId: input.cancellationId,
      cancelRequestedAt: NOW,
      cancelRequestedBy: input.actor,
      cancelReasonCode: input.reasonCode,
      ...(terminal ? { finishedAt: NOW } : {}),
      updatedAt: NOW,
    };
    this.runs.set(run.id, updated);
    return {
      run: updated,
      cancellationId: input.cancellationId,
      disposition: terminal ? ("cancelled" as const) : ("requested" as const),
      replayed: false,
    };
  }

  async claimRun(
    input: ClaimExecutionRunInput,
  ): Promise<ExecutionLeaseReceipt | null> {
    const run = this.runs.get(input.runId);
    return run ? this.claim(run, input.workerId) : null;
  }

  async claimNextRun(
    input: ClaimNextExecutionRunInput,
  ): Promise<ExecutionLeaseReceipt | null> {
    const run = [...this.runs.values()].find(
      (candidate) =>
        this.isClaimable(candidate) &&
        candidate.tenantKey === input.tenantKey &&
        candidate.operation === input.operation &&
        candidate.mode === input.mode,
    );
    return run ? this.claim(run, input.workerId) : null;
  }

  async listRunnableScopesPage(
    input: ListRunnableExecutionScopesPageInput,
  ): Promise<RunnableExecutionScopePage> {
    const scopes = new Map<
      string,
      { tenantKey: string; operation: string; mode: "canary" | "active" }
    >();
    for (const run of this.runs.values()) {
      if (
        !this.isClaimable(run) ||
        run.mode === "shadow" ||
        !input.operations.includes(run.operation) ||
        !input.modes.includes(run.mode)
      ) {
        continue;
      }
      const scope = {
        tenantKey: run.tenantKey,
        operation: run.operation,
        mode: run.mode,
      };
      scopes.set(`${run.tenantKey}\0${run.operation}\0${run.mode}`, scope);
    }
    return { scopes: [...scopes.values()].slice(0, input.limit) };
  }

  async renewRunLease(
    input: RenewExecutionRunLeaseInput,
  ): Promise<ExecutionLeaseReceipt | null> {
    this.renewals.push(input);
    const run = this.runs.get(input.runId);
    if (
      !run ||
      run.status !== "running" ||
      run.tenantKey !== input.tenantKey ||
      run.operation !== input.operation ||
      run.mode !== input.mode ||
      this.leaseTokens.get(run.id) !== input.token
    ) {
      return null;
    }
    const renewed = { ...run, leaseExpiresAt: EXPIRES_AT, updatedAt: NOW };
    this.runs.set(run.id, renewed);
    return {
      run: renewed,
      token: input.token,
      expiresAt: EXPIRES_AT,
      recovered: false,
    };
  }

  async checkpointRun(
    input: CheckpointExecutionRunInput,
  ): Promise<ExecutionRun | null> {
    const run = this.withExactLease(input);
    if (!run) return null;
    this.checkpoints.push(input);
    const checkpointed: ExecutionRun = {
      ...run,
      currentStep: input.currentStep,
      output: input.output,
      handlerAttempt: input.incrementHandlerAttempt
        ? run.handlerAttempt + 1
        : run.handlerAttempt,
      updatedAt: NOW,
    };
    this.runs.set(run.id, checkpointed);
    return checkpointed;
  }

  async requeueRun(
    input: RequeueExecutionRunInput,
  ): Promise<ExecutionRun | null> {
    const run = this.withExactLease(input);
    if (!run) return null;
    this.requeues.push(input);
    this.leaseTokens.delete(run.id);
    const queued: ExecutionRun = {
      ...run,
      status: "queued",
      currentStep: input.currentStep ?? undefined,
      error: input.error,
      availableAt: input.availableAt.toISOString(),
      leaseOwner: undefined,
      leaseExpiresAt: undefined,
      updatedAt: NOW,
    };
    this.runs.set(run.id, queued);
    return queued;
  }

  async blockRun(input: BlockExecutionRunInput): Promise<ExecutionRun | null> {
    const run = this.withExactLease(input);
    if (!run) return null;
    this.blocks.push(input);
    this.leaseTokens.delete(run.id);
    const blocked: ExecutionRun = {
      ...run,
      status: "blocked",
      blockedReasonCode: input.reasonCode,
      blockedAt: NOW,
      leaseOwner: undefined,
      leaseExpiresAt: undefined,
      updatedAt: NOW,
    };
    this.runs.set(run.id, blocked);
    return blocked;
  }

  async finishRun(
    input: FinishExecutionRunInput,
  ): Promise<ExecutionRun | null> {
    const run = this.withExactLease(input);
    if (!run) return null;
    this.finishes.push(input);
    this.leaseTokens.delete(run.id);
    const finished: ExecutionRun = {
      ...run,
      status: input.status,
      currentStep: input.currentStep ?? undefined,
      output: input.output,
      error: input.error ?? undefined,
      leaseOwner: undefined,
      leaseExpiresAt: undefined,
      finishedAt: NOW,
      updatedAt: NOW,
    };
    this.runs.set(run.id, finished);
    return finished;
  }

  async acknowledgeRunCancellation(
    input: AcknowledgeExecutionRunCancellationInput,
  ) {
    const run = this.withExactLease(input);
    if (
      !run ||
      run.cancelRequestId !== input.cancellationId ||
      !run.cancelRequestedAt
    ) {
      return null;
    }
    this.cancellationAcks.push(input);
    this.leaseTokens.delete(run.id);
    const cancelled: ExecutionRun = {
      ...run,
      status: "cancelled",
      cancelAcknowledgedAt: NOW,
      leaseOwner: undefined,
      leaseExpiresAt: undefined,
      finishedAt: NOW,
      updatedAt: NOW,
    };
    this.runs.set(run.id, cancelled);
    return {
      run: cancelled,
      cancellationId: input.cancellationId,
      disposition: "cancelled" as const,
      replayed: false,
    };
  }

  replaceLeaseToken(runId: string, token: string): void {
    this.leaseTokens.set(runId, token);
  }

  private claim(
    run: ExecutionRun,
    workerId: string,
  ): ExecutionLeaseReceipt | null {
    if (!this.isClaimable(run)) return null;
    const recovered = run.status === "running";
    const token = `lease-token-${String(++this.leaseSequence).padStart(32, "0")}`;
    const running: ExecutionRun = {
      ...run,
      status: "running",
      leaseOwner: workerId,
      leaseExpiresAt: EXPIRES_AT,
      claimCount: run.claimCount + 1,
      startedAt: run.startedAt ?? NOW,
      updatedAt: NOW,
    };
    this.runs.set(run.id, running);
    this.leaseTokens.set(run.id, token);
    return {
      run: running,
      token,
      expiresAt: EXPIRES_AT,
      recovered,
    };
  }

  private isClaimable(run: ExecutionRun): boolean {
    if (run.status === "queued") {
      return (
        !run.availableAt ||
        Date.parse(run.availableAt) <= Date.parse(this.clock)
      );
    }
    return (
      run.status === "running" &&
      typeof run.leaseExpiresAt === "string" &&
      Date.parse(run.leaseExpiresAt) <= Date.parse(this.clock)
    );
  }

  private withExactLease(input: {
    tenantKey: string;
    operation: string;
    mode: "canary" | "active";
    runId: string;
    token: string;
  }): ExecutionRun | null {
    const run = this.runs.get(input.runId);
    return run &&
      run.status === "running" &&
      run.tenantKey === input.tenantKey &&
      run.operation === input.operation &&
      run.mode === input.mode &&
      this.leaseTokens.get(run.id) === input.token
      ? run
      : null;
  }
}

async function admittedFixture(parent: AgentRun = parentRun()): Promise<{
  repository: MemoryRepository;
  parent: AgentRun;
  run: ExecutionRun;
}> {
  const repository = new MemoryRepository();
  const receipt = await admitChatAgentTurnDispatch(parent, {
    repository,
    env: ENABLED_ENV,
  });
  return { repository, parent, run: receipt.run };
}

test("remote claim builds the server-owned envelope and lease-bound capability", async () => {
  const { repository, parent } = await admittedFixture();
  const claim = await claimNextChatAgentTurn("openclaw-worker-1", {
    repository,
    resolveParentRun: async (runId) => (runId === parent.id ? parent : null),
  });

  assert.ok(claim);
  assert.equal(claim.parentAgentRunId, parent.id);
  assert.equal(claim.leaseExpiresAt, EXPIRES_AT);
  assert.equal(
    claim.runtimeToolCapability,
    runtimeToolCapabilityForDispatchLease({
      parentAgentRunId: parent.id,
      dispatchRunId: claim.dispatchRunId,
      leaseToken: claim.leaseToken,
    }),
  );
  assert.equal(claim.envelope.missionControlRunId, parent.id);
  assert.equal(
    claim.envelope.runtimeToolCapability,
    claim.runtimeToolCapability,
  );
  assert.equal(claim.envelope.runtimeAuthorityText, "Busca partners en Madrid");
  assert.equal(claim.envelope.userName, "Martin");
  assert.equal(claim.envelope.agent, "rocinante");
  assert.deepEqual(claim.envelope.skills, ["partnerships", "leads"]);
  assert.deepEqual(claim.envelope.runtimeEffectIntent, [
    "partnerships_discovery_start",
  ]);
  assert.equal(repository.checkpoints.length, 1);
  assert.equal(repository.checkpoints[0]?.currentStep, "runtime_claimed");
  assert.equal(repository.checkpoints[0]?.incrementHandlerAttempt, true);
});

test("a terminal parent completes its dispatch without yielding a model envelope", async () => {
  const parent = parentRun({ status: "completed", finishedAt: NOW });
  const { repository, run } = await admittedFixture(parent);

  const claim = await claimNextChatAgentTurn("openclaw-worker-1", {
    repository,
    resolveParentRun: async () => parent,
  });

  assert.equal(claim, null);
  assert.equal(repository.checkpoints.length, 0);
  assert.equal(repository.finishes.length, 1);
  assert.deepEqual(repository.finishes[0]?.output, {
    completionBoundary: "runtime_finished",
    parentAgentRunId: parent.id,
    parentStatus: "completed",
  });
  assert.equal(repository.runs.get(run.id)?.status, "completed");
});

test("a recovered cancelled parent acknowledges the exact request without yielding a model envelope", async () => {
  const { repository, parent, run } = await admittedFixture();
  const initialClaim = await claimNextChatAgentTurn("openclaw-worker-1", {
    repository,
    resolveParentRun: async () => parent,
  });
  assert.ok(initialClaim);
  const cancellationId = `cancel_${"b".repeat(32)}`;
  const running = repository.runs.get(run.id);
  assert.ok(running);
  repository.runs.set(run.id, {
    ...running,
    cancelRequestId: cancellationId,
    cancelRequestedAt: NOW,
    cancelRequestedBy: { type: "user", id: "user-martin" },
    cancelReasonCode: "user_requested",
    leaseExpiresAt: EXPIRED_AT,
  });
  const cancelledParent = {
    ...parent,
    status: "cancelled" as const,
    finishedAt: NOW,
  };

  const recovered = await claimNextChatAgentTurn("openclaw-worker-2", {
    repository,
    resolveParentRun: async () => cancelledParent,
  });

  assert.equal(recovered, null);
  assert.equal(repository.cancellationAcks.length, 1);
  assert.equal(repository.cancellationAcks[0]?.cancellationId, cancellationId);
  assert.equal(
    repository.cancellationAcks[0]?.safePoint,
    "runtime_abort_observed",
  );
  assert.notEqual(
    repository.cancellationAcks[0]?.token,
    initialClaim.leaseToken,
  );
  assert.equal(repository.runs.get(run.id)?.claimCount, 2);
  assert.equal(repository.runs.get(run.id)?.status, "cancelled");
  assert.equal(repository.finishes.length, 0);
  assert.equal(repository.checkpoints.length, 1);
});

test("an expired cancellation marker converges the still-active parent before any redelivery", async () => {
  const { repository, parent, run } = await admittedFixture();
  const initialClaim = await claimNextChatAgentTurn("openclaw-worker-1", {
    repository,
    resolveParentRun: async () => parent,
  });
  assert.ok(initialClaim);
  const cancellationId = `cancel_${"c".repeat(32)}`;
  const running = repository.runs.get(run.id);
  assert.ok(running);
  repository.runs.set(run.id, {
    ...running,
    cancelRequestId: cancellationId,
    cancelRequestedAt: NOW,
    cancelRequestedBy: { type: "user", id: "user-martin" },
    cancelReasonCode: "user_requested",
    leaseExpiresAt: EXPIRED_AT,
  });
  let currentParent: AgentRun = { ...parent, status: "running" };
  let parentCancellations = 0;

  const recovered = await claimNextChatAgentTurn("openclaw-worker-2", {
    repository,
    resolveParentRun: async () => currentParent,
    markParentCancelled: async (runId, threadId, data) => {
      parentCancellations += 1;
      assert.equal(runId, parent.id);
      assert.equal(threadId, parent.threadId);
      assert.deepEqual(data, {
        code: "runtime_cancel_recovered",
        dispatchRunId: run.id,
        childCount: 0,
      });
      currentParent = {
        ...currentParent,
        status: "cancelled",
        finishedAt: NOW,
      };
      return currentParent;
    },
  });

  assert.equal(recovered, null);
  assert.equal(parentCancellations, 1);
  assert.equal(currentParent.status, "cancelled");
  assert.equal(repository.cancellationAcks.length, 1);
  assert.equal(repository.cancellationAcks[0]?.cancellationId, cancellationId);
  assert.notEqual(
    repository.cancellationAcks[0]?.token,
    initialClaim.leaseToken,
  );
  assert.equal(repository.runs.get(run.id)?.status, "cancelled");
  assert.equal(repository.runs.get(run.id)?.claimCount, 2);
  assert.equal(
    repository.checkpoints.length,
    1,
    "recovery must not checkpoint or yield the turn again",
  );
  assert.equal(repository.finishes.length, 0);
  assert.equal(repository.blocks.length, 0);
});

test("a pending child keeps recovered parent cancellation open and unacknowledged", async () => {
  const { repository, parent, run } = await admittedFixture();
  const initialClaim = await claimNextChatAgentTurn("openclaw-worker-1", {
    repository,
    resolveParentRun: async () => parent,
  });
  assert.ok(initialClaim);
  const running = repository.runs.get(run.id);
  assert.ok(running);
  repository.runs.set(run.id, {
    ...running,
    cancelRequestId: `cancel_${"d".repeat(32)}`,
    cancelRequestedAt: NOW,
    cancelRequestedBy: { type: "user", id: "user-martin" },
    cancelReasonCode: "user_requested",
    leaseExpiresAt: EXPIRED_AT,
  });
  let parentCancellations = 0;

  const recovered = await claimNextChatAgentTurn("openclaw-worker-2", {
    repository,
    resolveParentRun: async () => ({ ...parent, status: "running" }),
    markParentCancelled: async () => {
      parentCancellations += 1;
      return null;
    },
    cancelOriginChildren: async () => ({
      originCancellation: {
        tenantKey: "hospital-capilar",
        origin: {
          schemaVersion: 1,
          kind: "mc_chat_parent_run",
          parentAgentRunId: parent.id,
        },
        cancellationId: `cancel_${"d".repeat(32)}`,
        requestedAt: NOW,
        actor: { type: "system", id: "chat-agent-turn-worker" },
        reasonCode: "user_requested",
        replayed: false,
      },
      children: [{ ...run, id: "child-running", status: "running" }],
      requestedRunIds: ["child-running"],
      pendingRunIds: ["child-running"],
    }),
  });

  assert.equal(recovered, null);
  assert.equal(parentCancellations, 0);
  assert.equal(repository.cancellationAcks.length, 0);
  assert.equal(repository.runs.get(run.id)?.status, "running");
  assert.equal(repository.runs.get(run.id)?.claimCount, 2);
  assert.equal(repository.checkpoints.length, 1);
});

test("a corrupt command is fenced and blocked before parent resolution", async () => {
  const { repository, parent, run } = await admittedFixture();
  repository.runs.set(run.id, {
    ...run,
    input: { ...(run.input as Record<string, unknown>), unexpected: true },
  });
  let parentReads = 0;

  const claim = await claimNextChatAgentTurn("openclaw-worker-1", {
    repository,
    resolveParentRun: async () => {
      parentReads += 1;
      return parent;
    },
  });

  assert.equal(claim, null);
  assert.equal(parentReads, 0);
  assert.equal(repository.blocks.length, 1);
  assert.equal(repository.blocks[0]?.reasonCode, "command_contract_mismatch");
  assert.equal(repository.runs.get(run.id)?.status, "blocked");
});

test("a parent changed after admission is fenced and blocks the dispatch", async () => {
  const { repository, parent, run } = await admittedFixture();
  const changedParent = {
    ...parent,
    input: {
      ...(parent.input as Record<string, unknown>),
      text: "Una orden distinta",
    },
  };

  const claim = await claimNextChatAgentTurn("openclaw-worker-1", {
    repository,
    resolveParentRun: async () => changedParent,
  });

  assert.equal(claim, null);
  assert.equal(repository.blocks.length, 1);
  assert.equal(repository.blocks[0]?.reasonCode, "command_contract_mismatch");
  assert.equal(repository.runs.get(run.id)?.status, "blocked");
});

test("runtime authorization renews the exact lease and rejects a stale token", async () => {
  const { repository, parent } = await admittedFixture();
  const claim = await claimNextChatAgentTurn("openclaw-worker-1", {
    repository,
    resolveParentRun: async () => parent,
  });
  assert.ok(claim);

  const authority = await authorizeChatAgentTurnRuntimeRequest(
    {
      parentAgentRunId: parent.id,
      dispatchRunId: claim.dispatchRunId,
      leaseToken: claim.leaseToken,
      runtimeToolCapability: claim.runtimeToolCapability,
    },
    { repository, resolveParentRun: async () => parent },
  );

  assert.ok(authority);
  assert.deepEqual(repository.renewals[0], {
    tenantKey: "hospital-capilar",
    operation: CHAT_AGENT_TURN_OPERATION,
    mode: "canary",
    runId: claim.dispatchRunId,
    token: claim.leaseToken,
    leaseMs: CHAT_AGENT_TURN_REMOTE_LEASE_MS,
  });

  repository.replaceLeaseToken(
    claim.dispatchRunId,
    "lease-token-reclaimed-0000000000000000000000000001",
  );
  const stale = await authorizeChatAgentTurnRuntimeRequest(
    {
      parentAgentRunId: parent.id,
      dispatchRunId: claim.dispatchRunId,
      leaseToken: claim.leaseToken,
      runtimeToolCapability: claim.runtimeToolCapability,
    },
    { repository, resolveParentRun: async () => parent },
  );
  assert.equal(stale, null);
  assert.equal(repository.renewals.at(-1)?.token, claim.leaseToken);
});

test("a cancellation marker fences new tools but remains visible to heartbeat and completion", async () => {
  const { repository, parent } = await admittedFixture();
  const claim = await claimNextChatAgentTurn("openclaw-worker-1", {
    repository,
    resolveParentRun: async () => parent,
  });
  assert.ok(claim);
  const running = repository.runs.get(claim.dispatchRunId);
  assert.ok(running);
  repository.runs.set(claim.dispatchRunId, {
    ...running,
    cancelRequestId: `cancel_${"a".repeat(32)}`,
    cancelRequestedAt: NOW,
    cancelRequestedBy: { type: "user", id: "mc-admin" },
    cancelReasonCode: "user_requested",
  });
  const base = {
    parentAgentRunId: parent.id,
    dispatchRunId: claim.dispatchRunId,
    leaseToken: claim.leaseToken,
    runtimeToolCapability: claim.runtimeToolCapability,
  };

  assert.equal(
    await authorizeChatAgentTurnRuntimeRequest(base, {
      repository,
      resolveParentRun: async () => parent,
    }),
    null,
  );
  const completionAuthority = await authorizeChatAgentTurnRuntimeRequest(
    { ...base, allowCancellationRequested: true },
    { repository, resolveParentRun: async () => parent },
  );
  assert.ok(completionAuthority);
  const cancelledParent = {
    ...parent,
    status: "cancelled" as const,
    finishedAt: NOW,
  };
  const completed = await completeChatAgentTurnRuntime(completionAuthority, {
    repository,
    resolveParentRun: async () => cancelledParent,
  });
  assert.equal(completed?.status, "cancelled");
  assert.equal(repository.cancellationAcks.length, 1);
  assert.equal(
    repository.cancellationAcks[0]?.safePoint,
    "runtime_abort_observed",
  );
});

test("runtime start persists the no-replay boundary before marking the parent running", async () => {
  const { repository, parent } = await admittedFixture();
  const claim = await claimNextChatAgentTurn("openclaw-worker-1", {
    repository,
    resolveParentRun: async () => parent,
  });
  assert.ok(claim);
  const authority = await authorizeChatAgentTurnRuntimeRequest(
    {
      parentAgentRunId: parent.id,
      dispatchRunId: claim.dispatchRunId,
      leaseToken: claim.leaseToken,
      runtimeToolCapability: claim.runtimeToolCapability,
    },
    { repository, resolveParentRun: async () => parent },
  );
  assert.ok(authority);
  let checkpointAtParentStart: unknown;
  const startedParent = { ...parent, status: "running" as const };
  const started = await markChatAgentTurnRuntimeStarted(authority, {
    repository,
    markParentStarted: async () => {
      checkpointAtParentStart = repository.checkpoints.at(-1)?.output;
      return startedParent;
    },
  });

  assert.equal(started?.status, "running");
  assert.deepEqual(checkpointAtParentStart, {
    stage: "runtime_committed",
    parentAgentRunId: parent.id,
    workerId: "openclaw-worker-1",
  });
  assert.equal(repository.checkpoints.at(-1)?.currentStep, "runtime_committed");
});

test("a recovered committed turn keeps one fixed grace window and lets the real callback win", async () => {
  const { repository, parent, run } = await admittedFixture();
  const claim = await claimNextChatAgentTurn("openclaw-worker-1", {
    repository,
    resolveParentRun: async () => parent,
  });
  assert.ok(claim);
  const authority = await authorizeChatAgentTurnRuntimeRequest(
    {
      parentAgentRunId: parent.id,
      dispatchRunId: claim.dispatchRunId,
      leaseToken: claim.leaseToken,
      runtimeToolCapability: claim.runtimeToolCapability,
    },
    { repository, resolveParentRun: async () => parent },
  );
  assert.ok(authority);
  const runningParent = { ...parent, status: "running" as const };
  await markChatAgentTurnRuntimeStarted(authority, {
    repository,
    markParentStarted: async () => runningParent,
  });
  const committedRun = repository.runs.get(run.id);
  assert.ok(committedRun);
  repository.runs.set(run.id, {
    ...committedRun,
    status: "queued",
    leaseOwner: undefined,
    leaseExpiresAt: undefined,
  });
  repository.leaseTokens.delete(run.id);
  let currentParent: AgentRun = runningParent;
  let syntheticProjections = 0;
  let syntheticFailures = 0;
  const recovered = await claimNextChatAgentTurn("openclaw-worker-2", {
    repository,
    now: () => new Date(NOW),
    resolveParentRun: async () => currentParent,
    projectCommittedRuntimeLoss: async () => {
      syntheticProjections += 1;
    },
    markParentFailed: async () => {
      syntheticFailures += 1;
      return null;
    },
  });

  assert.equal(recovered, null);
  assert.equal(syntheticProjections, 0);
  assert.equal(syntheticFailures, 0);
  assert.equal(repository.checkpoints.length, 2);
  assert.equal(repository.finishes.length, 0);
  assert.equal(repository.requeues.length, 1);
  const deadline = new Date(
    Date.parse(NOW) + CHAT_AGENT_TURN_TERMINAL_RECOVERY_GRACE_MS,
  ).toISOString();
  assert.equal(repository.requeues[0]?.availableAt.toISOString(), deadline);
  assert.equal(repository.requeues[0]?.currentStep, "terminal_recovery_wait");
  assert.equal(
    repository.requeues[0]?.error,
    "runtime_terminal_callback_recovery_wait",
  );
  assert.deepEqual(repository.requeues[0]?.eventData, {
    terminalRecoveryDeadline: deadline,
    recoveryWindowMs: CHAT_AGENT_TURN_TERMINAL_RECOVERY_GRACE_MS,
    reusedDeadline: false,
  });
  const waitingRun = repository.runs.get(run.id);
  assert.ok(waitingRun);
  assert.equal(waitingRun.status, "queued");
  assert.equal(waitingRun.availableAt, deadline);
  assert.equal(waitingRun.currentStep, "terminal_recovery_wait");
  assert.deepEqual(waitingRun.output, {
    stage: "runtime_committed",
    parentAgentRunId: parent.id,
    workerId: "openclaw-worker-1",
  });

  // Even if a repository/clock anomaly makes the run claimable early, the
  // persisted deadline is reused rather than granting a fresh full window.
  repository.runs.set(run.id, {
    ...waitingRun,
    status: "running",
    leaseOwner: "dead-openclaw-worker",
    leaseExpiresAt: EXPIRED_AT,
  });
  await claimNextChatAgentTurn("openclaw-worker-3", {
    repository,
    now: () => new Date(NOW),
    resolveParentRun: async () => currentParent,
    projectCommittedRuntimeLoss: async () => {
      syntheticProjections += 1;
    },
    markParentFailed: async () => {
      syntheticFailures += 1;
      return null;
    },
  });
  assert.equal(repository.requeues.length, 2);
  assert.equal(repository.requeues[1]?.availableAt.toISOString(), deadline);
  assert.equal(
    (repository.requeues[1]?.eventData as Record<string, unknown>)
      .reusedDeadline,
    true,
  );
  assert.equal(syntheticProjections, 0);

  // The real outbox callback terminalizes the parent during the grace. The
  // next claim observes that terminal state and never projects runtime loss.
  currentParent = {
    ...runningParent,
    status: "completed" as const,
    finishedAt: deadline,
  };
  repository.setNow(deadline);
  const afterCallback = await claimNextChatAgentTurn("openclaw-worker-4", {
    repository,
    now: () => new Date(deadline),
    resolveParentRun: async () => currentParent,
    projectCommittedRuntimeLoss: async () => {
      syntheticProjections += 1;
    },
    markParentFailed: async () => {
      syntheticFailures += 1;
      return null;
    },
  });
  assert.equal(afterCallback, null);
  assert.equal(syntheticProjections, 0);
  assert.equal(syntheticFailures, 0);
  assert.equal(repository.finishes.length, 1);
  assert.deepEqual(repository.finishes.at(-1)?.output, {
    completionBoundary: "runtime_finished",
    parentAgentRunId: parent.id,
    parentStatus: "completed",
  });
});

test("a failed committed-loss projection stays retryable and terminalizes only after visible recovery", async () => {
  const { repository, parent, run } = await admittedFixture();
  const initialClaim = await claimNextChatAgentTurn("openclaw-worker-1", {
    repository,
    resolveParentRun: async () => parent,
  });
  assert.ok(initialClaim);
  const authority = await authorizeChatAgentTurnRuntimeRequest(
    {
      parentAgentRunId: parent.id,
      dispatchRunId: initialClaim.dispatchRunId,
      leaseToken: initialClaim.leaseToken,
      runtimeToolCapability: initialClaim.runtimeToolCapability,
    },
    { repository, resolveParentRun: async () => parent },
  );
  assert.ok(authority);
  const runningParent = { ...parent, status: "running" as const };
  await markChatAgentTurnRuntimeStarted(authority, {
    repository,
    markParentStarted: async () => runningParent,
  });
  const committed = repository.runs.get(run.id);
  assert.ok(committed);
  repository.runs.set(run.id, {
    ...committed,
    leaseExpiresAt: EXPIRED_AT,
  });

  let currentParent: AgentRun = runningParent;
  let projectionAttempts = 0;
  let successfulProjections = 0;
  let terminalizations = 0;
  const visibleDeliveryKeys = new Set<string>();
  const projectCommittedRuntimeLoss = async ({
    dispatchRun,
  }: {
    dispatchRun: ExecutionRun;
  }) => {
    projectionAttempts += 1;
    visibleDeliveryKeys.add(`agent-turn-terminal:v1:${dispatchRun.id}`);
    if (projectionAttempts === 1) {
      throw new Error("projection_transport_lost");
    }
    successfulProjections += 1;
  };
  const markParentFailed = async () => {
    terminalizations += 1;
    currentParent = {
      ...runningParent,
      status: "failed" as const,
      finishedAt: NOW,
    };
    return currentParent;
  };

  const graceScheduled = await claimNextChatAgentTurn(
    "openclaw-worker-2",
    {
      repository,
      now: () => new Date(NOW),
      resolveParentRun: async () => currentParent,
      projectCommittedRuntimeLoss,
      markParentFailed,
    },
  );
  assert.equal(graceScheduled, null);
  assert.equal(projectionAttempts, 0);
  assert.equal(terminalizations, 0);
  assert.equal(repository.requeues.length, 1);
  const recoveryDeadline = repository.requeues[0]?.availableAt.toISOString();
  assert.ok(recoveryDeadline);
  repository.setNow(
    new Date(Date.parse(recoveryDeadline) + 1).toISOString(),
  );

  await assert.rejects(
    claimNextChatAgentTurn("openclaw-worker-3", {
      repository,
      now: () => new Date(Date.parse(recoveryDeadline) + 1),
      resolveParentRun: async () => currentParent,
      projectCommittedRuntimeLoss,
      markParentFailed,
    }),
    /projection_transport_lost/,
  );

  assert.equal(currentParent.status, "running");
  assert.equal(projectionAttempts, 1);
  assert.equal(successfulProjections, 0);
  assert.equal(visibleDeliveryKeys.size, 1);
  assert.equal(terminalizations, 0);
  assert.equal(repository.finishes.length, 0);
  assert.equal(repository.blocks.length, 0);
  const failedProjectionRun = repository.runs.get(run.id);
  assert.ok(failedProjectionRun);
  assert.equal(failedProjectionRun.status, "running");
  assert.equal(failedProjectionRun.leaseOwner, "openclaw-worker-3");
  assert.equal(failedProjectionRun.currentStep, "terminal_recovery_wait");
  assert.equal(failedProjectionRun.availableAt, recoveryDeadline);
  assert.deepEqual(failedProjectionRun.output, {
    stage: "runtime_committed",
    parentAgentRunId: parent.id,
    workerId: "openclaw-worker-1",
  });

  const recovered = await claimNextChatAgentTurn("openclaw-worker-4", {
    repository,
    now: () => new Date(Date.parse(recoveryDeadline) + 1),
    resolveParentRun: async () => currentParent,
    projectCommittedRuntimeLoss,
    markParentFailed,
  });

  assert.equal(recovered, null);
  assert.equal(projectionAttempts, 2);
  assert.equal(successfulProjections, 1);
  assert.equal(visibleDeliveryKeys.size, 1);
  assert.equal(terminalizations, 1);
  assert.equal(currentParent.status, "failed");
  assert.equal(repository.blocks.length, 0);
  assert.equal(repository.finishes.length, 1);
  assert.equal(repository.runs.get(run.id)?.status, "completed");
  assert.deepEqual(repository.finishes[0]?.output, {
    completionBoundary: "runtime_finished",
    parentAgentRunId: parent.id,
    parentStatus: "failed",
  });

  assert.equal(
    await claimNextChatAgentTurn("openclaw-worker-5", {
      repository,
      now: () => new Date(Date.parse(recoveryDeadline) + 1),
      resolveParentRun: async () => currentParent,
      projectCommittedRuntimeLoss,
      markParentFailed,
    }),
    null,
  );
  assert.equal(projectionAttempts, 2);
  assert.equal(terminalizations, 1);
});

test("busy runtime requeues the exact dispatch lease with the bounded delay", async () => {
  const { repository, parent } = await admittedFixture();
  const claim = await claimNextChatAgentTurn("openclaw-worker-1", {
    repository,
    resolveParentRun: async () => parent,
  });
  assert.ok(claim);
  const authority = await authorizeChatAgentTurnRuntimeRequest(
    {
      parentAgentRunId: parent.id,
      dispatchRunId: claim.dispatchRunId,
      leaseToken: claim.leaseToken,
      runtimeToolCapability: claim.runtimeToolCapability,
    },
    { repository, resolveParentRun: async () => parent },
  );
  assert.ok(authority);

  const requeued = await requeueChatAgentTurnRuntime(
    authority,
    "runtime_session_busy",
    {
      repository,
      now: () => new Date(NOW),
    },
  );

  assert.equal(requeued?.status, "queued");
  assert.equal(requeued?.error, "runtime_session_busy");
  assert.equal(
    requeued?.availableAt,
    new Date(Date.parse(NOW) + CHAT_AGENT_TURN_REMOTE_POLL_MS).toISOString(),
  );
  assert.equal(repository.requeues.length, 1);
  assert.equal(repository.requeues[0]?.token, claim.leaseToken);
  assert.equal(repository.requeues[0]?.currentStep, "runtime_retry_wait");
});
