import type {
  ExecutionEffect,
  ExecutionEffectControlRepository,
  ExecutionLeaseScope,
  ExecutionRun,
  PrepareExecutionEffectDisposition,
} from "@/lib/execution-control";
import { ExecutionEffectConflictError } from "@/lib/execution-control/types";
import {
  ExecutionLeaseLostError,
  type FencedExecutionLease,
} from "./leased-worker";
import {
  durableEffectPolicyFingerprint,
  parseDurableEffectReceipt,
  validateDurableEffectErrorClassification,
  type AnyDurableEffectDefinition,
  type CapabilityCredentialProvider,
  type DurableEffectErrorClassification,
  type DurableEffectMap,
  type DurableExecutionHandlerV2,
  type PayloadOf,
  type ReceiptOf,
} from "./effect-contract";
import {
  DurableJsonValidationError,
  parseDurableJsonContractValue,
  type DurableJson,
  type DurableJsonObject,
} from "./json-contract";

export interface DurableCapabilityPolicy {
  mayAdmit(input: {
    scope: ExecutionLeaseScope;
    handlerVersion: number;
    capability: string;
  }): boolean;
  mayDrain(input: {
    scope: ExecutionLeaseScope;
    handlerVersion: number;
    capability: string;
  }): "allow" | "temporarily_suspended";
}

export interface DurableEffectDeadlineScheduler {
  setTimeout(callback: () => void, delayMs: number): unknown;
  clearTimeout(handle: unknown): void;
}

const defaultDeadlineScheduler: DurableEffectDeadlineScheduler = {
  setTimeout: (callback, delayMs) => {
    const timer = setTimeout(callback, delayMs);
    timer.unref?.();
    return timer;
  },
  clearTimeout: (handle) =>
    clearTimeout(handle as ReturnType<typeof setTimeout>),
};

const STEP_PATTERN = /^[a-z][a-z0-9._-]{0,63}$/;
const RECONCILE_ERROR_CODE_PATTERN = /^[a-z][a-z0-9._-]{0,127}$/;
const DEFAULT_CAPABILITY_RETRY_MS = 60_000;

export class DurableEffectRuntimeUnavailableError extends Error {
  readonly code = "durable_effect_runtime_unavailable" as const;

  constructor() {
    super("Durable effect runtime is not available for this command");
    this.name = "DurableEffectRuntimeUnavailableError";
  }
}

export class DurableEffectDeadlineExceededError extends Error {
  readonly code = "durable_effect_deadline_exceeded" as const;

  constructor(readonly deadlineAt: string) {
    super("Durable effect exceeded its bounded deadline");
    this.name = "DurableEffectDeadlineExceededError";
  }
}

export class DurableEffectRetryScheduledError extends Error {
  readonly code = "durable_effect_retry_scheduled" as const;

  constructor(
    readonly reasonCode: string,
    readonly availableAt: Date,
    readonly currentStep = "effect_retry_wait",
  ) {
    super("Durable effect is waiting for a safe retry");
    this.name = "DurableEffectRetryScheduledError";
  }
}

export class DurableEffectTerminalError extends Error {
  readonly code: string;

  constructor(code: string) {
    super("Durable effect reached a stable terminal state");
    this.name = "DurableEffectTerminalError";
    this.code = code;
  }
}

/** Cooperative stop at a boundary where no additional capability may start. */
export class DurableCancellationStopError extends Error {
  readonly code = "durable_cancellation_stop" as const;

  constructor(readonly safePoint: string) {
    super("Durable execution stopped at a cooperative cancellation boundary");
    this.name = "DurableCancellationStopError";
  }
}

/** Cancellation remains requested but an external outcome is still ambiguous. */
export class DurableCancellationPendingError extends Error {
  readonly code = "durable_cancellation_pending" as const;

  constructor(readonly reasonCode: string) {
    super("Durable cancellation is waiting for effect reconciliation");
    this.name = "DurableCancellationPendingError";
  }
}

export class DurableEffectStepError extends DurableEffectTerminalError {
  constructor() {
    super("durable_effect_step_invalid");
    this.name = "DurableEffectStepError";
  }
}

export const rejectingCapabilityCredentialProvider: CapabilityCredentialProvider =
  Object.freeze({
    async resolve(): Promise<Readonly<Record<string, string>>> {
      throw new DurableEffectRuntimeUnavailableError();
    },
  });

export interface DurableEffectExecutorOptions {
  repository: ExecutionEffectControlRepository;
  capabilityPolicy: DurableCapabilityPolicy;
  credentialProvider?: CapabilityCredentialProvider;
  handler: DurableExecutionHandlerV2;
  run: ExecutionRun;
  scope: ExecutionLeaseScope;
  lease: FencedExecutionLease;
  signal: AbortSignal;
  deadlineAt: string;
  deadlineScheduler?: DurableEffectDeadlineScheduler;
  now?: () => Date;
  random?: () => number;
  capabilityRetryMs?: number;
}

/**
 * The only contract-v2 boundary allowed to invoke or reconcile a registered
 * capability. It deliberately owns no product-specific code or payloads.
 */
export class DurableEffectExecutor {
  private readonly now: () => Date;
  private readonly random: () => number;
  private readonly deadlineScheduler: DurableEffectDeadlineScheduler;
  private readonly credentialProvider: CapabilityCredentialProvider;
  private readonly capabilityRetryMs: number;
  private readonly runObservedLocallyAt: Date;
  private acceptingEffects = true;
  private nextEffectSequence = 0;
  private readonly trackedEffects = new Map<number, Promise<unknown>>();
  private readonly trackedFailures = new Map<number, unknown>();

  constructor(private readonly options: DurableEffectExecutorOptions) {
    this.now = options.now ?? (() => new Date());
    this.random = options.random ?? Math.random;
    this.deadlineScheduler =
      options.deadlineScheduler ?? defaultDeadlineScheduler;
    this.credentialProvider =
      options.credentialProvider ?? rejectingCapabilityCredentialProvider;
    this.runObservedLocallyAt = this.now();
    const capabilityRetryMs =
      options.capabilityRetryMs ?? DEFAULT_CAPABILITY_RETRY_MS;
    if (
      !Number.isSafeInteger(capabilityRetryMs) ||
      capabilityRetryMs < 1_000 ||
      capabilityRetryMs > 3_600_000
    ) {
      throw new Error("capabilityRetryMs must be from 1000 to 3600000");
    }
    this.capabilityRetryMs = capabilityRetryMs;
  }

  async hasRecordedEffects(): Promise<boolean> {
    for (const step of Object.keys(this.options.handler.effects)) {
      const effect = await this.options.repository.getEffectForScope({
        ...this.options.scope,
        runId: this.options.run.id,
        stepKey: step,
      });
      if (effect) return true;
    }
    return false;
  }

  async cancellationCanAcknowledge(): Promise<boolean> {
    for (const [step, definition] of Object.entries(
      this.options.handler.effects,
    )) {
      const effect = await this.options.repository.getEffectForScope({
        ...this.options.scope,
        runId: this.options.run.id,
        stepKey: step,
      });
      if (!effect) continue;
      if (!this.effectStaticIdentityMatches(step, definition, effect)) {
        return false;
      }
      if (effect.status === "succeeded") {
        try {
          this.validatedStoredReceipt(definition, effect);
        } catch {
          return false;
        }
      }
      if (
        effect.status === "failed" &&
        (!effect.lastErrorCode ||
          effect.lastErrorCode === "effect_outcome_unknown")
      ) {
        return false;
      }
      if (
        (effect.status === "prepared" || effect.status === "uncertain") &&
        definition.safety.kind !== "read_only" &&
        effect.lastErrorCode !== "effect_reconcile_not_found"
      ) {
        return false;
      }
    }
    return true;
  }

  effect<Effects extends DurableEffectMap, Step extends keyof Effects & string>(
    step: Step,
    payload: PayloadOf<Effects[Step]>,
  ): Promise<ReceiptOf<Effects[Step]>> {
    if (!this.acceptingEffects) {
      throw new DurableEffectRuntimeUnavailableError();
    }
    const sequence = this.nextEffectSequence;
    this.nextEffectSequence += 1;
    const pending = this.executeEffect<Effects, Step>(step, payload);
    this.trackedEffects.set(sequence, pending);
    void pending.then(
      () => {
        this.trackedEffects.delete(sequence);
      },
      (error: unknown) => {
        this.trackedFailures.set(sequence, error);
        this.trackedEffects.delete(sequence);
      },
    );
    return pending;
  }

  /**
   * Closes the command-side effect boundary, drains every started operation,
   * and rethrows the first effect control outcome even if an adapter swallowed
   * or ignored its Promise.
   */
  async closeAndSettleTrackedEffects(): Promise<void> {
    this.acceptingEffects = false;
    while (this.trackedEffects.size > 0) {
      await Promise.allSettled([...this.trackedEffects.values()]);
    }
    const firstFailure = [...this.trackedFailures.entries()].sort(
      ([left], [right]) => left - right,
    )[0];
    if (firstFailure) throw firstFailure[1];
  }

  private async executeEffect<
    Effects extends DurableEffectMap,
    Step extends keyof Effects & string,
  >(
    step: Step,
    payload: PayloadOf<Effects[Step]>,
  ): Promise<ReceiptOf<Effects[Step]>> {
    const handler = this.options.handler as DurableExecutionHandlerV2<
      DurableJson,
      DurableJson,
      DurableJson,
      Effects
    >;
    if (
      typeof step !== "string" ||
      !STEP_PATTERN.test(step) ||
      !Object.prototype.hasOwnProperty.call(handler.effects, step)
    ) {
      throw new DurableEffectStepError();
    }
    const definition = handler.effects[step];
    if (!definition || definition.step !== step) {
      throw new DurableEffectStepError();
    }

    let parsedPayload;
    try {
      parsedPayload = parseDurableJsonContractValue(
        definition.payload,
        payload,
        "effect_payload",
      );
    } catch (error) {
      if (error instanceof DurableJsonValidationError) {
        throw new DurableEffectTerminalError(error.code);
      }
      throw error;
    }

    this.assertCapabilityMayDrain(definition);
    const policyFingerprint = durableEffectPolicyFingerprint(definition);
    const effectKey = `${this.options.run.operation}:run:${this.options.run.id}:step:${step}:v${handler.version}`;
    await this.options.lease.renew();
    const existingEffect = await this.options.repository.getEffectForScope({
      ...this.options.scope,
      runId: this.options.run.id,
      stepKey: step,
    });
    if (this.cancellationRequested()) {
      if (!existingEffect) {
        throw new DurableCancellationStopError("before_effect");
      }
      return (await this.handleCancellationEffect(
        definition,
        existingEffect,
        parsedPayload.value,
        parsedPayload.fingerprint,
        policyFingerprint,
        effectKey,
      )) as ReceiptOf<Effects[Step]>;
    }
    const deadlineMs = this.effectDeadlineMsOrRetry(definition.timeoutMs);

    let disposition: PrepareExecutionEffectDisposition | null;
    try {
      disposition = await this.options.repository.prepareEffect({
        ...this.options.scope,
        runId: this.options.run.id,
        token: this.options.lease.token,
        stepKey: step,
        effectKey,
        handlerVersion: handler.version,
        definitionVersion: definition.definitionVersion,
        capability: definition.capability,
        safety: definition.safety.kind,
        payloadSchemaVersion: parsedPayload.schemaVersion,
        payloadFingerprint: parsedPayload.fingerprint,
        policyFingerprint,
        receiptSchemaVersion: definition.receipt.schemaVersion,
        deadlineMs,
        maxAttempts: definition.retry.maxAttempts,
      });
    } catch (error) {
      if (this.isEffectConflict(error)) {
        throw new DurableEffectTerminalError("execution_effect_conflict");
      }
      throw error;
    }
    if (!disposition) {
      await this.options.lease.renew();
      if (this.cancellationRequested()) {
        const cancelledEffect =
          existingEffect ??
          (await this.options.repository.getEffectForScope({
            ...this.options.scope,
            runId: this.options.run.id,
            stepKey: step,
          }));
        if (!cancelledEffect) {
          throw new DurableCancellationStopError("before_effect");
        }
        return (await this.handleCancellationEffect(
          definition,
          cancelledEffect,
          parsedPayload.value,
          parsedPayload.fingerprint,
          policyFingerprint,
          effectKey,
        )) as ReceiptOf<Effects[Step]>;
      }
      this.throwLeaseLost();
    }

    return (await this.handleDisposition(
      disposition,
      definition,
      parsedPayload.value,
      parsedPayload.fingerprint,
      policyFingerprint,
      effectKey,
      existingEffect === null,
    )) as ReceiptOf<Effects[Step]>;
  }

  private async handleDisposition(
    disposition: PrepareExecutionEffectDisposition,
    definition: AnyDurableEffectDefinition,
    payload: DurableJson,
    payloadFingerprint: string,
    policyFingerprint: string,
    effectKey: string,
    safeToCancelBeforeInvoke: boolean,
  ): Promise<DurableJsonObject> {
    if (disposition.kind === "return_receipt") {
      return this.validatedStoredReceipt(definition, disposition.effect);
    }
    if (disposition.kind === "retry_wait") {
      return this.handleRetryWait(
        definition,
        disposition.effect,
        payload,
        payloadFingerprint,
        policyFingerprint,
        effectKey,
      );
    }
    if (disposition.kind === "reconcile") {
      return this.reconcile(
        definition,
        disposition.effect,
        payload,
        payloadFingerprint,
        policyFingerprint,
        effectKey,
        safeToCancelBeforeInvoke,
      );
    }
    return this.invoke(
      definition,
      disposition.effect,
      payload,
      payloadFingerprint,
      policyFingerprint,
      effectKey,
      safeToCancelBeforeInvoke,
    );
  }

  private validatedStoredReceipt(
    definition: AnyDurableEffectDefinition,
    effect: ExecutionEffect,
  ): DurableJsonObject {
    if (!effect.receipt || !effect.receiptFingerprint) {
      throw new DurableEffectTerminalError("effect_receipt_invalid");
    }
    let parsed;
    try {
      parsed = parseDurableEffectReceipt(definition, effect.receipt);
    } catch {
      throw new DurableEffectTerminalError("effect_receipt_invalid");
    }
    if (parsed.fingerprint !== effect.receiptFingerprint) {
      throw new DurableEffectTerminalError("effect_receipt_invalid");
    }
    return parsed.value;
  }

  private async handleRetryWait(
    definition: AnyDurableEffectDefinition,
    effect: ExecutionEffect,
    payload: DurableJson,
    payloadFingerprint: string,
    policyFingerprint: string,
    effectKey: string,
  ): Promise<DurableJsonObject> {
    if (effect.status === "failed" || effect.status === "cancelled") {
      throw new DurableEffectTerminalError(
        effect.lastErrorCode ?? "effect_failed",
      );
    }
    await this.options.lease.renew();
    const retryAt = this.effectRetryAt(effect);
    if (!this.effectIsReadyByDatabaseClock(effect)) {
      throw new DurableEffectRetryScheduledError(
        effect.lastErrorCode ?? "effect_retry_wait",
        retryAt,
      );
    }
    if (effect.attemptCount >= definition.retry.maxAttempts) {
      const ambiguous =
        (effect.status === "prepared" || effect.status === "uncertain") &&
        effect.lastErrorCode !== "effect_reconcile_not_found";
      if (
        ambiguous &&
        definition.safety.kind === "reconcile_before_replay" &&
        definition.reconcile
      ) {
        throw new DurableEffectRetryScheduledError(
          "effect_reconcile_required",
          this.databaseLeaseAvailableAt(1_000),
        );
      }
      if (
        ambiguous &&
        definition.safety.kind === "target_idempotency" &&
        definition.reconcile
      ) {
        return this.reconcileFinalTargetOutcome(
          definition,
          effect,
          payload,
          payloadFingerprint,
          policyFingerprint,
          effectKey,
        );
      }
      const authoritativeAbsence =
        effect.lastErrorCode === "effect_reconcile_not_found";
      const errorCode = ambiguous
        ? "effect_outcome_unknown"
        : authoritativeAbsence
          ? "effect_attempts_exhausted"
          : (effect.lastErrorCode ?? "effect_attempts_exhausted");
      const failed = await this.options.repository.recordEffectFailure({
        ...this.options.scope,
        runId: this.options.run.id,
        token: this.options.lease.token,
        stepKey: effect.stepKey,
        classification: ambiguous ? "outcome_unknown" : "definitive_rejection",
        errorCode,
        terminal: true,
      });
      if (!failed) this.throwLeaseLost();
      throw new DurableEffectTerminalError(errorCode);
    }
    throw new DurableEffectRetryScheduledError(
      effect.lastErrorCode ?? "effect_retry_wait",
      retryAt,
    );
  }

  /**
   * A target-idempotent adapter may safely replay while attempts remain, but
   * the final ambiguous attempt must be observed exactly once before becoming
   * terminal. This path only reconciles; it can never call invoke again.
   */
  private async reconcileFinalTargetOutcome(
    definition: AnyDurableEffectDefinition,
    effect: ExecutionEffect,
    payload: DurableJson,
    payloadFingerprint: string,
    policyFingerprint: string,
    effectKey: string,
  ): Promise<DurableJsonObject> {
    if (!definition.reconcile) {
      throw new DurableEffectRuntimeUnavailableError();
    }
    this.assertEffectIdentity(
      definition,
      effect,
      payloadFingerprint,
      policyFingerprint,
      effectKey,
    );
    await this.options.lease.renew();
    if (this.cancellationRequested()) {
      return this.handleCancellationEffect(
        definition,
        effect,
        payload,
        payloadFingerprint,
        policyFingerprint,
        effectKey,
      );
    }

    const abortScope = this.createAbortScope(definition.timeoutMs, effect);
    let rawOutcome: unknown;
    try {
      rawOutcome = await this.awaitBounded(
        () =>
          definition.reconcile!(payload, {
            effectKey,
            signal: abortScope.signal,
            deadlineAt: abortScope.deadlineAt,
            tenantKey: this.options.scope.tenantKey,
            credentials: this.credentialProvider,
          }),
        abortScope.signal,
      );
    } catch {
      if (this.options.signal.aborted) throw this.parentAbortReason();
      return this.terminalizeFinalReconcileUnknown(effect);
    } finally {
      abortScope.dispose();
    }

    if (!this.isReconcileResult(rawOutcome)) {
      return this.terminalizeFinalReconcileUnknown(effect);
    }
    if (rawOutcome.kind === "found") {
      let parsed;
      try {
        parsed = parseDurableEffectReceipt(definition, rawOutcome.receipt);
      } catch {
        return this.terminalizeFinalReconcileUnknown(effect);
      }
      await this.options.lease.renew();
      const found = await this.options.repository.recordEffectReconcile({
        ...this.options.scope,
        runId: this.options.run.id,
        token: this.options.lease.token,
        stepKey: effect.stepKey,
        outcome: "found",
        receipt: parsed.value,
        receiptFingerprint: parsed.fingerprint,
      });
      if (!found) this.throwLeaseLost();
      return this.validatedStoredReceipt(definition, found);
    }
    if (rawOutcome.kind === "conflict") {
      return this.terminalizeReconcileConflict(effect, rawOutcome.code);
    }
    if (rawOutcome.kind === "unknown") {
      return this.terminalizeFinalReconcileUnknown(effect);
    }

    await this.options.lease.renew();
    const absent = await this.options.repository.recordEffectReconcile({
      ...this.options.scope,
      runId: this.options.run.id,
      token: this.options.lease.token,
      stepKey: effect.stepKey,
      outcome: "not_found",
    });
    if (!absent) this.throwLeaseLost();
    await this.options.lease.renew();
    if (this.cancellationRequested()) {
      throw new DurableCancellationStopError("effect_absent");
    }
    const failed = await this.options.repository.recordEffectFailure({
      ...this.options.scope,
      runId: this.options.run.id,
      token: this.options.lease.token,
      stepKey: effect.stepKey,
      classification: "definitive_rejection",
      errorCode: "effect_attempts_exhausted",
      terminal: true,
    });
    if (!failed) this.throwLeaseLost();
    throw new DurableEffectTerminalError("effect_attempts_exhausted");
  }

  private async terminalizeFinalReconcileUnknown(
    effect: ExecutionEffect,
  ): Promise<never> {
    await this.options.lease.renew();
    const unknown = await this.options.repository.recordEffectReconcile({
      ...this.options.scope,
      runId: this.options.run.id,
      token: this.options.lease.token,
      stepKey: effect.stepKey,
      outcome: "unknown",
    });
    if (!unknown) this.throwLeaseLost();
    await this.options.lease.renew();
    if (this.cancellationRequested()) {
      throw new DurableCancellationPendingError("effect_reconcile_unknown");
    }
    const failed = await this.options.repository.recordEffectFailure({
      ...this.options.scope,
      runId: this.options.run.id,
      token: this.options.lease.token,
      stepKey: effect.stepKey,
      classification: "outcome_unknown",
      errorCode: "effect_outcome_unknown",
      terminal: true,
    });
    if (!failed) this.throwLeaseLost();
    throw new DurableEffectTerminalError("effect_outcome_unknown");
  }

  private async handleCancellationEffect(
    definition: AnyDurableEffectDefinition,
    effect: ExecutionEffect,
    payload: DurableJson,
    payloadFingerprint: string,
    policyFingerprint: string,
    effectKey: string,
  ): Promise<DurableJsonObject> {
    this.assertEffectIdentity(
      definition,
      effect,
      payloadFingerprint,
      policyFingerprint,
      effectKey,
    );
    if (effect.status === "succeeded") {
      return this.validatedStoredReceipt(definition, effect);
    }
    if (
      effect.status === "failed" ||
      effect.status === "cancelled" ||
      effect.status === "retry_wait" ||
      effect.lastErrorCode === "effect_reconcile_not_found" ||
      definition.safety.kind === "read_only"
    ) {
      throw new DurableCancellationStopError("effect_settled");
    }
    if (!definition.reconcile) {
      throw new DurableCancellationPendingError("effect_reconcile_unavailable");
    }
    return this.reconcileForCancellation(
      definition,
      effect,
      payload,
      effectKey,
    );
  }

  private async reconcileForCancellation(
    definition: AnyDurableEffectDefinition,
    effect: ExecutionEffect,
    payload: DurableJson,
    effectKey: string,
  ): Promise<DurableJsonObject> {
    await this.options.lease.renew();
    if (!this.effectIsReadyByDatabaseClock(effect)) {
      throw new DurableCancellationPendingError("effect_reconcile_wait");
    }
    const observedLocallyAt = this.now();
    let abortScope: ReturnType<DurableEffectExecutor["createAbortScope"]>;
    try {
      abortScope = this.createAbortScope(definition.timeoutMs, effect);
    } catch (error) {
      if (error instanceof DurableEffectRetryScheduledError) {
        throw new DurableCancellationPendingError("effect_reconcile_deadline");
      }
      throw error;
    }
    let rawOutcome: unknown;
    try {
      rawOutcome = await this.awaitBounded(
        () =>
          definition.reconcile!(payload, {
            effectKey,
            signal: abortScope.signal,
            deadlineAt: abortScope.deadlineAt,
            tenantKey: this.options.scope.tenantKey,
            credentials: this.credentialProvider,
          }),
        abortScope.signal,
      );
    } catch {
      abortScope.dispose();
      return this.recordCancellationUnknown(
        definition,
        effect,
        observedLocallyAt,
      );
    }
    abortScope.dispose();
    if (!this.isReconcileResult(rawOutcome)) {
      return this.recordCancellationUnknown(
        definition,
        effect,
        observedLocallyAt,
      );
    }
    if (rawOutcome.kind === "found") {
      let parsed;
      try {
        parsed = parseDurableEffectReceipt(definition, rawOutcome.receipt);
      } catch {
        return this.recordCancellationUnknown(
          definition,
          effect,
          observedLocallyAt,
        );
      }
      await this.options.lease.renew();
      const found = await this.options.repository.recordEffectReconcile({
        ...this.options.scope,
        runId: this.options.run.id,
        token: this.options.lease.token,
        stepKey: effect.stepKey,
        outcome: "found",
        receipt: parsed.value,
        receiptFingerprint: parsed.fingerprint,
      });
      if (!found) this.throwLeaseLost();
      return this.validatedStoredReceipt(definition, found);
    }
    if (rawOutcome.kind === "conflict") {
      return this.terminalizeReconcileConflict(effect, rawOutcome.code);
    }
    if (rawOutcome.kind === "not_found") {
      await this.options.lease.renew();
      const absent = await this.options.repository.recordEffectReconcile({
        ...this.options.scope,
        runId: this.options.run.id,
        token: this.options.lease.token,
        stepKey: effect.stepKey,
        outcome: "not_found",
      });
      if (!absent) this.throwLeaseLost();
      throw new DurableCancellationStopError("effect_absent");
    }
    return this.recordCancellationUnknown(
      definition,
      effect,
      observedLocallyAt,
      rawOutcome.retryAfterMs,
    );
  }

  private async recordCancellationUnknown(
    definition: AnyDurableEffectDefinition,
    effect: ExecutionEffect,
    _observedLocallyAt: Date,
    retryAfterMs?: number,
  ): Promise<never> {
    const delayMs = this.reconcileDelayMs(
      definition,
      effect.reconcileCount + 1,
      retryAfterMs,
    );
    await this.options.lease.renew();
    const availableAt = this.databaseLeaseAvailableAt(delayMs);
    const unknown = await this.options.repository.recordEffectReconcile({
      ...this.options.scope,
      runId: this.options.run.id,
      token: this.options.lease.token,
      stepKey: effect.stepKey,
      outcome: "unknown",
      availableAt,
    });
    if (!unknown) this.throwLeaseLost();
    throw new DurableCancellationPendingError("effect_reconcile_unknown");
  }

  private assertEffectIdentity(
    definition: AnyDurableEffectDefinition,
    effect: ExecutionEffect,
    payloadFingerprint: string,
    policyFingerprint: string,
    effectKey: string,
  ): void {
    if (
      !this.effectStaticIdentityMatches(effect.stepKey, definition, effect) ||
      effect.effectKey !== effectKey ||
      effect.payloadFingerprint !== payloadFingerprint ||
      effect.policyFingerprint !== policyFingerprint
    ) {
      throw new DurableEffectTerminalError("execution_effect_conflict");
    }
  }

  private effectStaticIdentityMatches(
    step: string,
    definition: AnyDurableEffectDefinition,
    effect: ExecutionEffect,
  ): boolean {
    const effectKey = `${this.options.run.operation}:run:${this.options.run.id}:step:${step}:v${this.options.handler.version}`;
    return (
      effect.runId === this.options.run.id &&
      effect.stepKey === step &&
      effect.effectKey === effectKey &&
      effect.handlerVersion === this.options.handler.version &&
      effect.definitionVersion === definition.definitionVersion &&
      effect.capability === definition.capability &&
      effect.safety === definition.safety.kind &&
      effect.payloadSchemaVersion === definition.payload.schemaVersion &&
      effect.policyFingerprint === durableEffectPolicyFingerprint(definition) &&
      effect.receiptSchemaVersion === definition.receipt.schemaVersion
    );
  }

  private cancellationRequested(): boolean {
    const run = this.options.lease.run;
    return Boolean(
      run.cancelRequestId &&
      run.cancelRequestedAt &&
      !run.cancelAcknowledgedAt &&
      run.status === "running",
    );
  }

  private async reconcile(
    definition: AnyDurableEffectDefinition,
    effect: ExecutionEffect,
    payload: DurableJson,
    payloadFingerprint: string,
    policyFingerprint: string,
    effectKey: string,
    _safeToCancelBeforeInvoke: boolean,
  ): Promise<DurableJsonObject> {
    if (!definition.reconcile) {
      throw new DurableEffectRuntimeUnavailableError();
    }
    await this.options.lease.renew();
    if (!this.effectIsReadyByDatabaseClock(effect)) {
      throw new DurableEffectRetryScheduledError(
        "effect_reconcile_wait",
        this.effectRetryAt(effect),
      );
    }
    const effectObservedLocallyAt = this.now();
    const abortScope = this.createAbortScope(definition.timeoutMs, effect);
    let rawOutcome: unknown;
    try {
      rawOutcome = await this.awaitBounded(
        () =>
          definition.reconcile!(payload, {
            effectKey,
            signal: abortScope.signal,
            deadlineAt: abortScope.deadlineAt,
            tenantKey: this.options.scope.tenantKey,
            credentials: this.credentialProvider,
          }),
        abortScope.signal,
      );
    } catch (error) {
      abortScope.dispose();
      if (this.options.signal.aborted) throw this.parentAbortReason();
      return this.recordUnknownReconcile(
        definition,
        effect,
        effectObservedLocallyAt,
        error,
      );
    }
    abortScope.dispose();

    if (!this.isReconcileResult(rawOutcome)) {
      return this.recordUnknownReconcile(
        definition,
        effect,
        effectObservedLocallyAt,
        new Error("Invalid reconcile result"),
      );
    }
    if (rawOutcome.kind === "found") {
      let parsed;
      try {
        parsed = parseDurableEffectReceipt(definition, rawOutcome.receipt);
      } catch {
        return this.recordUnknownReconcile(
          definition,
          effect,
          effectObservedLocallyAt,
          new Error("Invalid reconcile receipt"),
        );
      }
      await this.options.lease.renew();
      const reconciled = await this.options.repository.recordEffectReconcile({
        ...this.options.scope,
        runId: this.options.run.id,
        token: this.options.lease.token,
        stepKey: effect.stepKey,
        outcome: "found",
        receipt: parsed.value,
        receiptFingerprint: parsed.fingerprint,
      });
      if (!reconciled) this.throwLeaseLost();
      return this.validatedStoredReceipt(definition, reconciled);
    }
    if (rawOutcome.kind === "conflict") {
      return this.terminalizeReconcileConflict(effect, rawOutcome.code);
    }
    if (rawOutcome.kind === "unknown") {
      return this.recordUnknownReconcile(
        definition,
        effect,
        effectObservedLocallyAt,
        undefined,
        rawOutcome.retryAfterMs,
      );
    }

    await this.options.lease.renew();
    const absent = await this.options.repository.recordEffectReconcile({
      ...this.options.scope,
      runId: this.options.run.id,
      token: this.options.lease.token,
      stepKey: effect.stepKey,
      outcome: "not_found",
    });
    if (!absent) this.throwLeaseLost();
    const next = await this.options.repository.prepareEffect({
      ...this.options.scope,
      runId: this.options.run.id,
      token: this.options.lease.token,
      stepKey: effect.stepKey,
      effectKey,
      handlerVersion: effect.handlerVersion,
      definitionVersion: definition.definitionVersion,
      capability: definition.capability,
      safety: definition.safety.kind,
      payloadSchemaVersion: definition.payload.schemaVersion,
      payloadFingerprint,
      policyFingerprint,
      receiptSchemaVersion: definition.receipt.schemaVersion,
      deadlineMs: this.effectDeadlineMsOrRetry(definition.timeoutMs, effect),
      maxAttempts: definition.retry.maxAttempts,
    });
    if (!next) this.throwLeaseLost();
    return this.handleDisposition(
      next,
      definition,
      payload,
      payloadFingerprint,
      policyFingerprint,
      effectKey,
      true,
    );
  }

  private async recordUnknownReconcile(
    definition: AnyDurableEffectDefinition,
    effect: ExecutionEffect,
    _observedLocallyAt: Date,
    _error?: unknown,
    retryAfterMs?: number,
  ): Promise<never> {
    const delayMs = this.reconcileDelayMs(
      definition,
      effect.reconcileCount + 1,
      retryAfterMs,
    );
    await this.options.lease.renew();
    const availableAt = this.databaseLeaseAvailableAt(delayMs);
    const reconciled = await this.options.repository.recordEffectReconcile({
      ...this.options.scope,
      runId: this.options.run.id,
      token: this.options.lease.token,
      stepKey: effect.stepKey,
      outcome: "unknown",
      availableAt,
    });
    if (!reconciled) this.throwLeaseLost();
    throw new DurableEffectRetryScheduledError(
      "effect_reconcile_unknown",
      this.effectAvailableAt(reconciled),
    );
  }

  private async terminalizeReconcileConflict(
    effect: ExecutionEffect,
    errorCode: string,
  ): Promise<never> {
    await this.options.lease.renew();
    const conflicted = await this.options.repository.recordEffectReconcile({
      ...this.options.scope,
      runId: this.options.run.id,
      token: this.options.lease.token,
      stepKey: effect.stepKey,
      outcome: "conflict",
      errorCode,
    });
    if (!conflicted) this.throwLeaseLost();
    throw new DurableEffectTerminalError(errorCode);
  }

  private async invoke(
    definition: AnyDurableEffectDefinition,
    effect: ExecutionEffect,
    payload: DurableJson,
    payloadFingerprint: string,
    policyFingerprint: string,
    effectKey: string,
    safeToCancelBeforeInvoke: boolean,
  ): Promise<DurableJsonObject> {
    await this.options.lease.renew();
    const effectObservedLocallyAt = this.now();
    if (this.cancellationRequested()) {
      if (safeToCancelBeforeInvoke || definition.safety.kind === "read_only") {
        const cancelled = await this.options.repository.recordEffectFailure({
          ...this.options.scope,
          runId: this.options.run.id,
          token: this.options.lease.token,
          stepKey: effect.stepKey,
          classification: "definitive_rejection",
          errorCode: "effect_cancelled_before_invoke",
          terminal: true,
        });
        if (!cancelled) this.throwLeaseLost();
        throw new DurableCancellationStopError("before_invoke");
      }
      return this.handleCancellationEffect(
        definition,
        effect,
        payload,
        payloadFingerprint,
        policyFingerprint,
        effectKey,
      );
    }
    const abortScope = this.createAbortScope(definition.timeoutMs, effect);
    let phase: "invoke" | "receipt" | "complete" = "invoke";
    try {
      const rawReceipt = await this.awaitBounded(
        () =>
          definition.invoke(payload, {
            effectKey,
            signal: abortScope.signal,
            deadlineAt: abortScope.deadlineAt,
            tenantKey: this.options.scope.tenantKey,
            credentials: this.credentialProvider,
          }),
        abortScope.signal,
      );
      phase = "receipt";
      const parsedReceipt = parseDurableEffectReceipt(definition, rawReceipt);
      await this.options.lease.renew();
      phase = "complete";
      const completed = await this.options.repository.completeEffect({
        ...this.options.scope,
        runId: this.options.run.id,
        token: this.options.lease.token,
        stepKey: effect.stepKey,
        payloadFingerprint,
        policyFingerprint,
        receipt: parsedReceipt.value,
        receiptFingerprint: parsedReceipt.fingerprint,
      });
      if (!completed) this.throwLeaseLost();
      return this.validatedStoredReceipt(definition, completed);
    } catch (error) {
      if (this.options.signal.aborted) throw this.parentAbortReason();
      if (this.isLeaseLost(error)) throw error;
      if (
        this.isEffectConflict(error) ||
        error instanceof DurableEffectTerminalError
      ) {
        throw new DurableEffectTerminalError(
          this.isEffectConflict(error)
            ? "execution_effect_conflict"
            : (error as DurableEffectTerminalError).code,
        );
      }
      if (phase === "complete") {
        const stored = await this.options.repository.getEffectForScope({
          ...this.options.scope,
          runId: this.options.run.id,
          stepKey: effect.stepKey,
        });
        if (stored?.status === "succeeded") {
          return this.validatedStoredReceipt(definition, stored);
        }
      }
      const classification =
        phase === "invoke"
          ? this.classifyInvocationError(definition, error)
          : {
              kind: "outcome_unknown" as const,
              code:
                phase === "receipt"
                  ? "effect_receipt_invalid"
                  : "effect_completion_unknown",
            };
      return this.recordInvocationFailure(
        definition,
        effect,
        classification,
        effectObservedLocallyAt,
        payload,
        payloadFingerprint,
        policyFingerprint,
        effectKey,
      );
    } finally {
      abortScope.dispose();
    }
  }

  private async recordInvocationFailure(
    definition: AnyDurableEffectDefinition,
    effect: ExecutionEffect,
    classification: DurableEffectErrorClassification,
    observedLocallyAt: Date,
    payload: DurableJson,
    payloadFingerprint: string,
    policyFingerprint: string,
    effectKey: string,
  ): Promise<DurableJsonObject> {
    const reconcileableUnknown =
      classification.kind === "outcome_unknown" &&
      definition.safety.kind !== "read_only" &&
      Boolean(definition.reconcile);
    const terminal =
      classification.kind === "definitive_rejection"
        ? !classification.retryable ||
          effect.attemptCount >= definition.retry.maxAttempts
        : effect.attemptCount >= definition.retry.maxAttempts &&
          !reconcileableUnknown;
    const errorCode =
      terminal && classification.kind === "outcome_unknown"
        ? "effect_outcome_unknown"
        : classification.code;
    const delayMs = this.retryDelayMs(definition, effect.attemptCount);
    const availableAt = terminal
      ? undefined
      : this.databaseEffectAvailableAt(effect, observedLocallyAt, delayMs);
    await this.options.lease.renew();
    const failed = await this.options.repository.recordEffectFailure({
      ...this.options.scope,
      runId: this.options.run.id,
      token: this.options.lease.token,
      stepKey: effect.stepKey,
      classification: classification.kind,
      errorCode,
      ...(availableAt ? { availableAt } : {}),
      terminal,
    });
    if (!failed) this.throwLeaseLost();
    await this.options.lease.renew();
    if (this.cancellationRequested()) {
      return this.handleCancellationEffect(
        definition,
        failed,
        payload,
        payloadFingerprint,
        policyFingerprint,
        effectKey,
      );
    }
    if (terminal) throw new DurableEffectTerminalError(errorCode);
    throw new DurableEffectRetryScheduledError(
      errorCode,
      this.effectRetryAt(failed),
    );
  }

  private classifyInvocationError(
    definition: AnyDurableEffectDefinition,
    error: unknown,
  ): DurableEffectErrorClassification {
    if (error instanceof DurableEffectDeadlineExceededError) {
      return { kind: "outcome_unknown", code: error.code };
    }
    if (error instanceof DurableJsonValidationError) {
      return { kind: "outcome_unknown", code: "effect_receipt_invalid" };
    }
    try {
      const classified = definition.classify(error);
      if (validateDurableEffectErrorClassification(classified)) {
        return classified;
      }
    } catch {
      // Invalid classifier output must never make an ambiguous call replayable.
    }
    return {
      kind: "outcome_unknown",
      code: "effect_classification_invalid",
    };
  }

  private assertCapabilityMayDrain(
    definition: AnyDurableEffectDefinition,
  ): void {
    let decision: ReturnType<DurableCapabilityPolicy["mayDrain"]>;
    try {
      decision = this.options.capabilityPolicy.mayDrain({
        scope: this.options.scope,
        handlerVersion: this.options.handler.version,
        capability: definition.capability,
      });
    } catch {
      throw new DurableEffectRuntimeUnavailableError();
    }
    if (decision === "temporarily_suspended") {
      throw new DurableEffectRetryScheduledError(
        "effect_capability_suspended",
        this.databaseRunAvailableAt(this.capabilityRetryMs),
        "awaiting_capability",
      );
    }
    if (decision !== "allow") {
      throw new DurableEffectRuntimeUnavailableError();
    }
  }

  private remainingEffectDeadlineMs(configuredTimeoutMs: number): number {
    const handlerDeadlineMs = Date.parse(this.options.deadlineAt);
    const remainingMs = handlerDeadlineMs - this.now().getTime();
    if (!Number.isFinite(handlerDeadlineMs) || remainingMs < 1_000) {
      throw new DurableEffectDeadlineExceededError(this.options.deadlineAt);
    }
    return Math.max(
      1_000,
      Math.min(configuredTimeoutMs, Math.floor(remainingMs)),
    );
  }

  private effectDeadlineMsOrRetry(
    configuredTimeoutMs: number,
    effect?: ExecutionEffect,
  ): number {
    try {
      return this.remainingEffectDeadlineMs(configuredTimeoutMs);
    } catch (error) {
      if (!(error instanceof DurableEffectDeadlineExceededError)) throw error;
      const availableAt = effect
        ? this.databaseEffectAvailableAt(effect, this.now(), 1_000)
        : this.databaseRunAvailableAt(1_000);
      throw new DurableEffectRetryScheduledError(
        "effect_deadline_before_io",
        availableAt,
      );
    }
  }

  private createAbortScope(
    configuredTimeoutMs: number,
    effect?: ExecutionEffect,
  ): {
    signal: AbortSignal;
    deadlineAt: string;
    dispose(): void;
  } {
    const timeoutMs = this.effectDeadlineMsOrRetry(configuredTimeoutMs, effect);
    const controller = new AbortController();
    const deadlineAt = new Date(this.now().getTime() + timeoutMs).toISOString();
    const abortFromParent = () => {
      if (!controller.signal.aborted) {
        controller.abort(this.parentAbortReason());
      }
    };
    if (this.options.signal.aborted) {
      abortFromParent();
    } else {
      this.options.signal.addEventListener("abort", abortFromParent, {
        once: true,
      });
    }
    const timer = this.deadlineScheduler.setTimeout(() => {
      if (!controller.signal.aborted) {
        controller.abort(new DurableEffectDeadlineExceededError(deadlineAt));
      }
    }, timeoutMs);
    return {
      signal: controller.signal,
      deadlineAt,
      dispose: () => {
        this.deadlineScheduler.clearTimeout(timer);
        this.options.signal.removeEventListener("abort", abortFromParent);
      },
    };
  }

  private async awaitBounded<Result>(
    execute: () => Promise<Result>,
    signal: AbortSignal,
  ): Promise<Result> {
    return new Promise<Result>((resolve, reject) => {
      let settled = false;
      const finish = (callback: () => void) => {
        if (settled) return;
        settled = true;
        signal.removeEventListener("abort", onAbort);
        callback();
      };
      const onAbort = () => {
        finish(() =>
          reject(
            signal.reason instanceof Error
              ? signal.reason
              : new DurableEffectDeadlineExceededError(this.options.deadlineAt),
          ),
        );
      };
      signal.addEventListener("abort", onAbort, { once: true });
      if (signal.aborted) {
        onAbort();
        return;
      }
      Promise.resolve()
        .then(() => {
          if (signal.aborted) {
            throw signal.reason instanceof Error
              ? signal.reason
              : new DurableEffectDeadlineExceededError(this.options.deadlineAt);
          }
          return execute();
        })
        .then(
          (value) => finish(() => resolve(value)),
          (error) => finish(() => reject(error)),
        );
    });
  }

  private retryDelayMs(
    definition: AnyDurableEffectDefinition,
    attemptCount: number,
  ): number {
    const cap = Math.min(
      definition.retry.maxDelayMs,
      definition.retry.baseDelayMs *
        2 ** Math.max(0, Math.floor(attemptCount) - 1),
    );
    const random = this.random();
    const fraction = Number.isFinite(random)
      ? Math.min(Math.max(random, 0), 0.999999999)
      : 0.5;
    return Math.max(1, Math.floor(fraction * cap));
  }

  private reconcileDelayMs(
    definition: AnyDurableEffectDefinition,
    reconcileCount: number,
    retryAfterMs?: number,
  ): number {
    if (
      Number.isSafeInteger(retryAfterMs) &&
      (retryAfterMs as number) >= 1_000
    ) {
      return Math.min(retryAfterMs as number, definition.retry.maxDelayMs);
    }
    return this.retryDelayMs(definition, reconcileCount);
  }

  private effectAvailableAt(effect: ExecutionEffect): Date {
    const parsed = Date.parse(effect.availableAt);
    if (Number.isFinite(parsed)) return new Date(parsed);
    return new Date(this.now().getTime() + 1_000);
  }

  private effectRetryAt(effect: ExecutionEffect): Date {
    const databaseNow = Date.parse(this.options.lease.run.updatedAt);
    const fallback = Number.isFinite(databaseNow)
      ? databaseNow + 1_000
      : this.now().getTime() + 1_000;
    const parsedAvailableAt = Date.parse(effect.availableAt);
    let retryAt = Number.isFinite(parsedAvailableAt)
      ? parsedAvailableAt
      : fallback;
    if (
      (effect.status === "prepared" || effect.status === "uncertain") &&
      effect.lastErrorCode !== "effect_reconcile_not_found"
    ) {
      const lastDeadlineAt = Date.parse(effect.lastDeadlineAt ?? "");
      retryAt = Number.isFinite(lastDeadlineAt)
        ? Math.max(retryAt, lastDeadlineAt)
        : Math.max(retryAt, fallback);
    }
    return new Date(retryAt);
  }

  private effectIsReadyByDatabaseClock(effect: ExecutionEffect): boolean {
    const retryAt = this.effectRetryAt(effect).getTime();
    const databaseNow = Date.parse(this.options.lease.run.updatedAt);
    return (
      Number.isFinite(retryAt) &&
      Number.isFinite(databaseNow) &&
      retryAt <= databaseNow
    );
  }

  private databaseLeaseAvailableAt(delayMs: number): Date {
    const databaseNow = Date.parse(this.options.lease.run.updatedAt);
    return new Date(
      (Number.isFinite(databaseNow) ? databaseNow : this.now().getTime()) +
        delayMs,
    );
  }

  private databaseEffectAvailableAt(
    effect: ExecutionEffect,
    observedLocallyAt: Date,
    delayMs: number,
  ): Date {
    const anchor = Date.parse(
      effect.lastAttemptAt ?? effect.updatedAt ?? effect.availableAt,
    );
    const elapsedMs = Math.max(
      0,
      this.now().getTime() - observedLocallyAt.getTime(),
    );
    return new Date(
      (Number.isFinite(anchor) ? anchor : this.now().getTime()) +
        elapsedMs +
        delayMs,
    );
  }

  private databaseRunAvailableAt(delayMs: number): Date {
    const anchor = Date.parse(this.options.run.updatedAt);
    const elapsedMs = Math.max(
      0,
      this.now().getTime() - this.runObservedLocallyAt.getTime(),
    );
    return new Date(
      (Number.isFinite(anchor) ? anchor : this.now().getTime()) +
        elapsedMs +
        delayMs,
    );
  }

  private isReconcileResult(
    value: unknown,
  ): value is
    | { kind: "found"; receipt: DurableJsonObject }
    | { kind: "not_found" }
    | { kind: "conflict"; code: string }
    | { kind: "unknown"; retryAfterMs?: number } {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return false;
    }
    const candidate = value as Record<string, unknown>;
    const keys = Object.keys(candidate);
    if (candidate.kind === "found") {
      return keys.length === 2 && keys.includes("receipt");
    }
    if (candidate.kind === "not_found") {
      return keys.length === 1;
    }
    if (candidate.kind === "conflict") {
      return (
        keys.length === 2 &&
        keys.includes("code") &&
        typeof candidate.code === "string" &&
        RECONCILE_ERROR_CODE_PATTERN.test(candidate.code)
      );
    }
    if (candidate.kind === "unknown") {
      return (
        keys.every((key) => key === "kind" || key === "retryAfterMs") &&
        (candidate.retryAfterMs === undefined ||
          Number.isSafeInteger(candidate.retryAfterMs))
      );
    }
    return false;
  }

  private parentAbortReason(): Error {
    return this.options.signal.reason instanceof Error
      ? this.options.signal.reason
      : new Error("Durable effect interrupted");
  }

  private isLeaseLost(error: unknown): boolean {
    return (
      error instanceof ExecutionLeaseLostError ||
      (error instanceof Error && error.name === "ExecutionLeaseLostError")
    );
  }

  private isEffectConflict(error: unknown): boolean {
    return (
      error instanceof ExecutionEffectConflictError ||
      (error !== null &&
        typeof error === "object" &&
        "code" in error &&
        error.code === "execution_effect_conflict")
    );
  }

  private throwLeaseLost(): never {
    throw new ExecutionLeaseLostError(this.options.run.id);
  }
}
