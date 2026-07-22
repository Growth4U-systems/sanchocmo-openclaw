import {
  PostgresExecutionControlRepository,
  type ExecutionCancellationControlRepository,
  type ExecutionControlRepository,
  type ExecutionLeaseReceipt,
  type ExecutionOriginControlRepository,
  type ExecutionRun,
} from "@/lib/execution-control";
import {
  getAgentRunByIdAsync,
  markAgentRunCancelledAsync,
  markAgentRunDispatchedAsync,
  markAgentRunFailedAsync,
  type AgentRun,
} from "@/lib/data/agent-runs";
import { TERMINAL_CALLBACK_CLAIM_LEASE_MS } from "@/lib/data/agent-run-callback-claim";
import {
  AGENT_RUN_SYNTHETIC_RUNTIME_LOSS_CODE,
  AGENT_RUN_SYNTHETIC_RUNTIME_LOSS_ERROR,
} from "@/lib/data/agent-run-synthetic-runtime-loss";
import { clearStatus } from "@/lib/data/mc-chat";
import { appendDurableChatDelivery } from "@/lib/data/mc-chat-durable-delivery";
import type { InboundMessage } from "@/lib/runtime";
import { textWithActiveOutboundWorkflow } from "@/lib/runtime/adapters/openclaw/messaging";
import {
  CHAT_AGENT_TURN_HANDLER_VERSION,
  CHAT_AGENT_TURN_OPERATION,
  chatAgentTurnCheckpointContractV1,
  type ChatAgentTurnCheckpointV1,
  type ChatAgentTurnCommandV1,
  type ChatAgentTurnResultV1,
} from "./agent-turn-contract-v1";
import {
  parseDurableJsonContractValue,
  requestExecutionOriginCancellation,
  type ExecutionOriginCancellationResult,
} from "@/lib/durable-execution";
import {
  CHAT_AGENT_TURN_REMOTE_LEASE_MS,
  chatAgentTurnDispatchBindingMatches,
  parseChatAgentTurnDispatchCommand,
  runtimeToolCapabilityForDispatchLease,
  type ChatAgentTurnRuntimeAuthority,
} from "@/lib/runtime/chat-agent-turn-dispatch-authority";

export {
  authorizeChatAgentTurnRuntimeRequest,
  CHAT_AGENT_TURN_REMOTE_LEASE_MS,
  runtimeToolCapabilityForDispatchLease,
  type ChatAgentTurnRuntimeAuthority,
} from "@/lib/runtime/chat-agent-turn-dispatch-authority";

export const CHAT_AGENT_TURN_REMOTE_POLL_MS = 2_000 as const;
export const CHAT_AGENT_TURN_TERMINAL_RECOVERY_GRACE_MS =
  TERMINAL_CALLBACK_CLAIM_LEASE_MS + 2 * CHAT_AGENT_TURN_REMOTE_POLL_MS;

const WORKER_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:@/+~-]{0,159}$/;
const TERMINAL_RECOVERY_WAIT_STEP = "terminal_recovery_wait";
const TERMINAL_RECOVERY_WAIT_ERROR =
  "runtime_terminal_callback_recovery_wait";

export interface ChatAgentTurnRemoteDependencies {
  repository?: ExecutionControlRepository;
  resolveParentRun?: (runId: string) => Promise<AgentRun | null>;
  markParentStarted?: (
    runId: string,
    threadId: string,
    data?: unknown,
  ) => Promise<AgentRun | null>;
  markParentFailed?: (
    runId: string,
    threadId: string,
    error: string,
    type?: "runtime_rejected" | "runtime_unreachable" | "failed",
    data?: unknown,
  ) => Promise<AgentRun | null>;
  markParentCancelled?: (
    runId: string,
    threadId: string,
    data?: unknown,
  ) => Promise<AgentRun | null>;
  cancelOriginChildren?: (input: {
    tenantKey: string;
    parentAgentRunId: string;
  }) => Promise<ExecutionOriginCancellationResult>;
  projectCommittedRuntimeLoss?: (input: {
    parentRun: AgentRun;
    dispatchRun: ExecutionRun;
    message: string;
  }) => Promise<void> | void;
  now?: () => Date;
}

export interface ChatAgentTurnRemoteClaim {
  dispatchRunId: string;
  parentAgentRunId: string;
  leaseToken: string;
  leaseExpiresAt: string;
  recovered: boolean;
  runtimeToolCapability: string;
  envelope: InboundMessage;
}

const defaultRepository = new PostgresExecutionControlRepository();
const COMMITTED_RUNTIME_LOSS_MESSAGE =
  AGENT_RUN_SYNTHETIC_RUNTIME_LOSS_ERROR;

function projectCommittedRuntimeLoss(input: {
  parentRun: AgentRun;
  dispatchRun: ExecutionRun;
  message: string;
}): void {
  appendDurableChatDelivery({
    threadId: input.parentRun.threadId,
    deliveryKey: `agent-turn-terminal:v1:${input.dispatchRun.id}`,
    message: {
      role: "bot",
      text: input.message,
      agent: input.parentRun.agent ?? "sancho",
    },
  });
  clearStatus(input.parentRun.threadId);
}

function repositoryFrom(
  dependencies: ChatAgentTurnRemoteDependencies,
): ExecutionControlRepository {
  return dependencies.repository ?? defaultRepository;
}

function originCancellationRepository(
  repository: ExecutionControlRepository,
): repository is ExecutionControlRepository &
  ExecutionOriginControlRepository &
  ExecutionCancellationControlRepository {
  return (
    typeof (repository as Partial<ExecutionOriginControlRepository>)
      .requestOriginCancellation === "function" &&
    typeof (repository as Partial<ExecutionOriginControlRepository>)
      .listRunsByExecutionOriginPage === "function" &&
    typeof repository.requestRunCancellation === "function" &&
    typeof repository.acknowledgeRunCancellation === "function"
  );
}

async function cancelOriginChildren(
  repository: ExecutionControlRepository,
  dependencies: ChatAgentTurnRemoteDependencies,
  input: { tenantKey: string; parentAgentRunId: string },
): Promise<ExecutionOriginCancellationResult> {
  if (dependencies.cancelOriginChildren) {
    return dependencies.cancelOriginChildren(input);
  }
  if (!originCancellationRepository(repository)) {
    throw new Error("chat_agent_turn_origin_cancellation_unavailable");
  }
  return requestExecutionOriginCancellation(
    {
      ...input,
      actor: { type: "system", id: "chat-agent-turn-worker" },
    },
    repository,
  );
}

function text(value: unknown, pattern: RegExp, label: string): string {
  if (typeof value !== "string" || !pattern.test(value)) {
    throw new Error(`chat_agent_turn_${label}_invalid`);
  }
  return value;
}

function inputRecord(run: AgentRun): Record<string, unknown> {
  if (!run.input || typeof run.input !== "object" || Array.isArray(run.input)) {
    throw new Error("chat_agent_turn_parent_input_invalid");
  }
  return run.input as Record<string, unknown>;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value ? value : undefined;
}

function stringArray(value: unknown): string[] | undefined {
  return Array.isArray(value) && value.every((item) => typeof item === "string")
    ? value
    : undefined;
}

function runtimeEffectIntent(
  value: unknown,
): InboundMessage["runtimeEffectIntent"] {
  if (!Array.isArray(value)) return undefined;
  const effects = [...new Set(value.filter(
    (item): item is NonNullable<InboundMessage["runtimeEffectIntent"]>[number] =>
      item === "leads_search_start" ||
      item === "partnerships_discovery_start",
  ))];
  return effects.length > 0 ? effects : undefined;
}

function buildEnvelope(
  parent: AgentRun,
  runtimeToolCapability: string,
): InboundMessage {
  const input = inputRecord(parent);
  const rawText = optionalString(input.text);
  const slug = optionalString(input.slug);
  const userId = optionalString(input.userId);
  const userName = optionalString(input.userName);
  const authorizedRuntimeEffectIntent = runtimeEffectIntent(
    input.runtimeEffectIntent,
  );
  if (!rawText || !slug || !userId || !userName || !parent.agent) {
    throw new Error("chat_agent_turn_parent_envelope_invalid");
  }
  const base: InboundMessage = {
    slug,
    threadId: parent.threadId,
    missionControlRunId: parent.id,
    runtimeToolCapability,
    ...(authorizedRuntimeEffectIntent
      ? { runtimeEffectIntent: authorizedRuntimeEffectIntent }
      : {}),
    traceId: parent.traceId,
    controlDepth: input.controlDepth === 1 ? 1 : 0,
    threadName: optionalString(input.threadName),
    text: rawText,
    userId,
    userName,
    linkedTo: optionalString(input.linkedTo),
    skill: parent.skill,
    primarySkill: optionalString(input.primarySkill),
    skills: stringArray(parent.skills),
    scope:
      input.scope === "agent" ||
      input.scope === "skill" ||
      input.scope === "task"
        ? input.scope
        : undefined,
    skillMode: parent.skillMode,
    temporaryAgent: input.temporaryAgent === true || undefined,
    taskRouteProposal:
      input.taskRouteProposal as InboundMessage["taskRouteProposal"],
    activeOutboundWorkflow:
      input.activeOutboundWorkflow as InboundMessage["activeOutboundWorkflow"],
    controlBaseUrl: optionalString(input.controlBaseUrl),
    threadState: input.threadState,
    docPath: optionalString(input.docPath),
    docKind: optionalString(input.docKind),
    attachments: Array.isArray(input.attachments)
      ? input.attachments
      : undefined,
    isAdmin: input.isAdmin === true,
    senderRole: input.senderRole === "admin" ? "admin" : "client",
    readOnly: input.readOnly === true,
    channelMode:
      input.channelMode === "docs-review" ||
      input.channelMode === "support-diagnostic"
        ? input.channelMode
        : undefined,
    supportContext: input.supportContext as InboundMessage["supportContext"],
    priorThreadMessages:
      input.priorThreadMessages as InboundMessage["priorThreadMessages"],
    _source: optionalString(input.source),
    agentId: parent.agent,
    agent: parent.agent,
  };
  return {
    ...base,
    runtimeAuthorityText: rawText,
    text: textWithActiveOutboundWorkflow(base),
  };
}

function parseCheckpoint(run: ExecutionRun): ChatAgentTurnCheckpointV1 | null {
  if (run.output === null || run.output === undefined) return null;
  try {
    return parseDurableJsonContractValue(
      chatAgentTurnCheckpointContractV1,
      run.output,
      "checkpoint",
    ).value;
  } catch {
    return null;
  }
}

function terminalParentStatus(
  parent: AgentRun,
): ChatAgentTurnResultV1["parentStatus"] | null {
  return parent.status === "completed" ||
    parent.status === "failed" ||
    parent.status === "cancelled"
    ? parent.status
    : null;
}

async function finishForTerminalParent(
  repository: ExecutionControlRepository,
  lease: ExecutionLeaseReceipt,
  command: ChatAgentTurnCommandV1,
  parentStatus: ChatAgentTurnResultV1["parentStatus"],
): Promise<ExecutionRun | null> {
  // A running dispatch keeps its lease while cooperative cancellation is in
  // flight. If that worker dies after the parent was cancelled, the next
  // lease owner must acknowledge the exact cancellation marker instead of
  // trying a normal finish (which is intentionally fenced once cancellation
  // was requested). Otherwise the run would be reclaimed on every expiry and
  // could never become terminal.
  if (parentStatus === "cancelled" && lease.run.cancelRequestId) {
    return acknowledgeDispatchCancellation(repository, lease);
  }
  return repository.finishRun({
    tenantKey: lease.run.tenantKey,
    operation: CHAT_AGENT_TURN_OPERATION,
    mode: "canary",
    runId: lease.run.id,
    token: lease.token,
    status: "completed",
    currentStep: "runtime_finished",
    output: {
      completionBoundary: "runtime_finished",
      parentAgentRunId: command.parentAgentRunId,
      parentStatus,
    } satisfies ChatAgentTurnResultV1,
    eventType: "chat.agent_turn.runtime_finished",
    eventData: { parentStatus },
  });
}

async function acknowledgeDispatchCancellation(
  repository: ExecutionControlRepository,
  lease: ExecutionLeaseReceipt,
): Promise<ExecutionRun | null> {
  if (
    !lease.run.cancelRequestId ||
    typeof repository.acknowledgeRunCancellation !== "function"
  ) {
    return null;
  }
  const receipt = await repository.acknowledgeRunCancellation({
    tenantKey: lease.run.tenantKey,
    operation: CHAT_AGENT_TURN_OPERATION,
    mode: "canary",
    runId: lease.run.id,
    token: lease.token,
    cancellationId: lease.run.cancelRequestId,
    safePoint: "runtime_abort_observed",
  });
  return receipt?.run ?? null;
}

/**
 * Give OpenClaw's fsynced terminal callback outbox one fixed recovery window
 * before projecting synthetic runtime loss. The deadline lives in the
 * dispatch run's persisted `availableAt`; `currentStep` records that the
 * window has already been granted, so an early or repeated claim reuses the
 * same deadline instead of extending it indefinitely.
 */
async function deferCommittedRuntimeLoss(
  repository: ExecutionControlRepository,
  lease: ExecutionLeaseReceipt,
  now: Date,
): Promise<boolean> {
  const alreadyWaiting =
    lease.run.currentStep === TERMINAL_RECOVERY_WAIT_STEP;
  const persistedDeadlineMs = alreadyWaiting
    ? Date.parse(lease.run.availableAt)
    : Number.NaN;
  if (alreadyWaiting && !Number.isFinite(persistedDeadlineMs)) {
    throw new Error("chat_agent_turn_terminal_recovery_deadline_invalid");
  }
  if (alreadyWaiting && persistedDeadlineMs <= now.getTime()) {
    return false;
  }
  const availableAt = alreadyWaiting
    ? new Date(persistedDeadlineMs)
    : new Date(
        now.getTime() + CHAT_AGENT_TURN_TERMINAL_RECOVERY_GRACE_MS,
      );
  await repository.requeueRun({
    tenantKey: lease.run.tenantKey,
    operation: CHAT_AGENT_TURN_OPERATION,
    mode: "canary",
    runId: lease.run.id,
    token: lease.token,
    availableAt,
    currentStep: TERMINAL_RECOVERY_WAIT_STEP,
    error: TERMINAL_RECOVERY_WAIT_ERROR,
    eventData: {
      terminalRecoveryDeadline: availableAt.toISOString(),
      recoveryWindowMs: CHAT_AGENT_TURN_TERMINAL_RECOVERY_GRACE_MS,
      reusedDeadline: alreadyWaiting,
    },
  });
  return true;
}

export async function claimNextChatAgentTurn(
  workerIdValue: unknown,
  dependencies: ChatAgentTurnRemoteDependencies = {},
): Promise<ChatAgentTurnRemoteClaim | null> {
  const workerId = text(workerIdValue, WORKER_ID_PATTERN, "worker_id");
  const repository = repositoryFrom(dependencies);
  if (typeof repository.listRunnableScopesPage !== "function") {
    throw new Error("chat_agent_turn_scope_discovery_unavailable");
  }
  const page = await repository.listRunnableScopesPage({
    operations: [CHAT_AGENT_TURN_OPERATION],
    modes: ["canary"],
    limit: 100,
  });
  for (const scope of page.scopes) {
    if (
      scope.operation !== CHAT_AGENT_TURN_OPERATION ||
      scope.mode !== "canary"
    ) {
      continue;
    }
    const lease = await repository.claimNextRun({
      ...scope,
      workerId,
      leaseMs: CHAT_AGENT_TURN_REMOTE_LEASE_MS,
    });
    if (!lease) continue;
    let command: ChatAgentTurnCommandV1;
    let parent: AgentRun | null;
    try {
      command = parseChatAgentTurnDispatchCommand(lease.run);
      parent = await (dependencies.resolveParentRun ?? getAgentRunByIdAsync)(
        command.parentAgentRunId,
      );
      if (!parent) throw new Error("chat_agent_turn_parent_missing");
      if (
        !chatAgentTurnDispatchBindingMatches({
          parentRun: parent,
          dispatchRun: lease.run,
          command,
        })
      ) {
        throw new Error("chat_agent_turn_parent_mismatch");
      }
    } catch {
      if (typeof repository.blockRun === "function") {
        await repository.blockRun({
          ...scope,
          runId: lease.run.id,
          token: lease.token,
          reasonCode: "command_contract_mismatch",
        });
      }
      continue;
    }
    if (lease.run.cancelRequestId) {
      // The cancelling HTTP process can die after the outer Ledger marker is
      // committed but before it terminalizes the parent AgentRun. A new owner
      // must first cascade Stop to every server-attested child; acknowledging
      // the parent while one child is still running would make Stop lie.
      const childCancellation = await cancelOriginChildren(
        repository,
        dependencies,
        {
          tenantKey: lease.run.tenantKey,
          parentAgentRunId: parent.id,
        },
      );
      if (childCancellation.pendingRunIds.length > 0) continue;
      if (parent.status === "queued" || parent.status === "running") {
        parent = await (
          dependencies.markParentCancelled ?? markAgentRunCancelledAsync
        )(parent.id, parent.threadId, {
          code: "runtime_cancel_recovered",
          dispatchRunId: lease.run.id,
          childCount: childCancellation.children.length,
        });
        if (!parent) continue;
      }
      const acknowledged = await acknowledgeDispatchCancellation(
        repository,
        lease,
      );
      if (!acknowledged && typeof repository.blockRun === "function") {
        // blockRun interprets an existing cancellation marker as a terminal
        // cancellation, preserving fail-closed convergence for repositories
        // that cannot expose cooperative acknowledgement.
        await repository.blockRun({
          ...scope,
          runId: lease.run.id,
          token: lease.token,
          reasonCode: "runtime_authority_unavailable",
        });
      }
      continue;
    }
    const terminalStatus = terminalParentStatus(parent);
    if (terminalStatus) {
      await finishForTerminalParent(repository, lease, command, terminalStatus);
      continue;
    }
    const existingCheckpoint = parseCheckpoint(lease.run);
    if (existingCheckpoint?.stage === "runtime_committed") {
      const now = dependencies.now?.() ?? new Date();
      if (Number.isNaN(now.getTime())) {
        throw new Error("chat_agent_turn_terminal_recovery_clock_invalid");
      }
      if (await deferCommittedRuntimeLoss(repository, lease, now)) {
        // Never yield a committed turn to the model again. While this dispatch
        // is unavailable, the terminal callback grant/outbox can converge the
        // parent; a later claim observes that terminal parent before reaching
        // synthetic-loss projection below.
        continue;
      }
      // Publish first, then terminalize. If this process dies between those
      // steps the immutable delivery is replay-safe and the next lease can
      // retry the state transition; the inverse order could leave a terminal
      // parent with no user-visible explanation forever.
      await (
        dependencies.projectCommittedRuntimeLoss ?? projectCommittedRuntimeLoss
      )({
        parentRun: parent,
        dispatchRun: lease.run,
        message: COMMITTED_RUNTIME_LOSS_MESSAGE,
      });
      const failedParent = await (
        dependencies.markParentFailed ?? markAgentRunFailedAsync
      )(
        parent.id,
        parent.threadId,
        COMMITTED_RUNTIME_LOSS_MESSAGE,
        "runtime_unreachable",
        {
          code: AGENT_RUN_SYNTHETIC_RUNTIME_LOSS_CODE,
          dispatchRunId: lease.run.id,
          recovered: lease.recovered,
        },
      );
      const failedStatus = failedParent
        ? terminalParentStatus(failedParent)
        : null;
      if (failedStatus) {
        await finishForTerminalParent(repository, lease, command, failedStatus);
      } else if (typeof repository.blockRun === "function") {
        await repository.blockRun({
          ...scope,
          runId: lease.run.id,
          token: lease.token,
          reasonCode: "runtime_authority_unavailable",
        });
      }
      continue;
    }
    const checkpoint = await repository.checkpointRun({
      ...scope,
      runId: lease.run.id,
      token: lease.token,
      currentStep: "runtime_claimed",
      output: {
        stage: "runtime_claimed",
        parentAgentRunId: parent.id,
        workerId,
      },
      eventType: "chat.agent_turn.runtime_claimed",
      eventData: { workerId, recovered: lease.recovered },
      incrementHandlerAttempt: true,
    });
    if (!checkpoint) continue;
    const runtimeToolCapability = runtimeToolCapabilityForDispatchLease({
      parentAgentRunId: parent.id,
      dispatchRunId: lease.run.id,
      leaseToken: lease.token,
    });
    return {
      dispatchRunId: lease.run.id,
      parentAgentRunId: parent.id,
      leaseToken: lease.token,
      leaseExpiresAt: lease.expiresAt,
      recovered: lease.recovered,
      runtimeToolCapability,
      envelope: buildEnvelope(parent, runtimeToolCapability),
    };
  }
  return null;
}

export async function markChatAgentTurnRuntimeStarted(
  authority: ChatAgentTurnRuntimeAuthority,
  dependencies: ChatAgentTurnRemoteDependencies = {},
): Promise<AgentRun | null> {
  const existingCheckpoint = parseCheckpoint(authority.dispatchRun);
  if (!existingCheckpoint) return null;
  if (existingCheckpoint.stage !== "runtime_committed") {
    const committed = await repositoryFrom(dependencies).checkpointRun({
      tenantKey: authority.dispatchRun.tenantKey,
      operation: CHAT_AGENT_TURN_OPERATION,
      mode: "canary",
      runId: authority.dispatchRun.id,
      token: authority.lease.token,
      currentStep: "runtime_committed",
      output: {
        stage: "runtime_committed",
        parentAgentRunId: authority.parentRun.id,
        workerId: existingCheckpoint.workerId,
      } satisfies ChatAgentTurnCheckpointV1,
      eventType: "chat.agent_turn.runtime_committed",
      eventData: {
        workerId: existingCheckpoint.workerId,
        noReplayAfterThisPoint: true,
      },
    });
    if (!committed) return null;
  }
  return (dependencies.markParentStarted ?? markAgentRunDispatchedAsync)(
    authority.parentRun.id,
    authority.parentRun.threadId,
    {
      dispatchRunId: authority.dispatchRun.id,
      claimCount: authority.dispatchRun.claimCount,
    },
  );
}

export async function completeChatAgentTurnRuntime(
  authority: ChatAgentTurnRuntimeAuthority,
  dependencies: ChatAgentTurnRemoteDependencies = {},
): Promise<ExecutionRun | null> {
  const parent = await (dependencies.resolveParentRun ?? getAgentRunByIdAsync)(
    authority.parentRun.id,
  );
  if (!parent) return null;
  const repository = repositoryFrom(dependencies);
  let convergedParent = parent;
  if (authority.lease.run.cancelRequestId) {
    const childCancellation = await cancelOriginChildren(
      repository,
      dependencies,
      {
        tenantKey: authority.dispatchRun.tenantKey,
        parentAgentRunId: parent.id,
      },
    );
    if (childCancellation.pendingRunIds.length > 0) return null;
    if (parent.status === "queued" || parent.status === "running") {
      const cancelled = await (
        dependencies.markParentCancelled ?? markAgentRunCancelledAsync
      )(parent.id, parent.threadId, {
        code: "runtime_cancel_observed",
        dispatchRunId: authority.dispatchRun.id,
        childCount: childCancellation.children.length,
      });
      if (!cancelled) return null;
      convergedParent = cancelled;
    }
  }
  const parentStatus = terminalParentStatus(convergedParent);
  if (!parentStatus) return null;
  return finishForTerminalParent(
    repository,
    authority.lease,
    authority.command,
    parentStatus,
  );
}

export async function requeueChatAgentTurnRuntime(
  authority: ChatAgentTurnRuntimeAuthority,
  reason: "runtime_session_busy" | "runtime_dispatch_unavailable",
  dependencies: ChatAgentTurnRemoteDependencies = {},
): Promise<ExecutionRun | null> {
  const now = dependencies.now?.() ?? new Date();
  return repositoryFrom(dependencies).requeueRun({
    tenantKey: authority.dispatchRun.tenantKey,
    operation: CHAT_AGENT_TURN_OPERATION,
    mode: "canary",
    runId: authority.dispatchRun.id,
    token: authority.lease.token,
    availableAt: new Date(now.getTime() + CHAT_AGENT_TURN_REMOTE_POLL_MS),
    currentStep: "runtime_retry_wait",
    error: reason,
    eventData: { errorCode: reason },
  });
}

export function chatAgentTurnHandlerVersion(): number {
  return CHAT_AGENT_TURN_HANDLER_VERSION;
}
