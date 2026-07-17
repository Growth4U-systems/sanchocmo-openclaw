import {
  PostgresExecutionControlRepository,
  type ExecutionControlRepository,
  type ExecutionRun,
  type ExecutionRunStatus,
} from "@/lib/execution-control";
import { sanitizeSupportBundle } from "@/lib/support/redaction";
import type { DurableExecutionOrigin } from "@/lib/durable-execution";
import type { YalcRuntimeConfig } from "@/lib/yalc/client";
import {
  admitPartnershipsDiscoveryV2,
  partnershipsDiscoveryEffectsV2Requested,
  type PartnershipsDiscoveryV2Environment,
  type PartnershipsYalcAssignCapabilityReceipt,
} from "./discovery-admission-v2";
import {
  buildDiscoveryExecutionSnapshot,
  DISCOVERY_DEFERRED_EXECUTION_OPERATION,
  DISCOVERY_EXECUTION_AGGREGATE,
  DISCOVERY_EXECUTION_OPERATION,
  DISCOVERY_EXECUTION_SNAPSHOT_VERSION,
  discoveryCanaryExecutionIdempotencyKey,
  discoveryExecutionAttempt,
  discoveryExecutionAggregateId,
  discoveryExecutionIdempotencyKey,
  DiscoveryDurableAuthorityError,
  isDiscoveryLedgerAuthoritative,
  isPartnershipsDurableWorkerBootEnabled,
  resolveDiscoveryExecutionPolicy,
  type DiscoveryExecutionEnvironment,
} from "./discovery-execution-policy";
import type { DiscoverySearchRecord } from "./discovery-types";
import { searchExecutionGeneration } from "./discovery-store";

export interface DiscoveryExecutionObserverDependencies {
  repository?: ExecutionControlRepository;
  env?: PartnershipsDiscoveryV2Environment;
  logError?: (message: string) => void;
  timeoutMs?: number;
  resolveYalc?: (slug: string) => YalcRuntimeConfig;
  verifyYalcCapability?: (
    config: YalcRuntimeConfig,
    targetBindingFingerprint: string,
  ) => Promise<PartnershipsYalcAssignCapabilityReceipt>;
  trustedOrigin?: DurableExecutionOrigin;
}

export interface DiscoveryExecutionObservationResult {
  enabled: boolean;
  recorded: boolean;
  runId?: string;
  commandFingerprint?: string;
  created?: boolean;
  degraded?: "ledger_unavailable";
}

interface DiscoveryExecutionTransition {
  status: ExecutionRunStatus;
  currentStep?: string | null;
  output?: unknown;
  error?: string | null;
}

const defaultRepository = new PostgresExecutionControlRepository();
const DEFAULT_SHADOW_TIMEOUT_MS = 750;
const MAX_SHADOW_TIMEOUT_MS = 5_000;
const SHADOW_CIRCUIT_FAILURE_THRESHOLD = 2;
const SHADOW_CIRCUIT_COOLDOWN_MS = 15_000;

interface ShadowCircuitState {
  failures: number;
  openUntil: number;
}

const shadowCircuits = new WeakMap<
  ExecutionControlRepository,
  Map<string, ShadowCircuitState>
>();

function assertDefaultCanaryBootAuthority(
  search: DiscoverySearchRecord,
  policy: ReturnType<typeof resolveDiscoveryExecutionPolicy>,
  dependencies: DiscoveryExecutionObserverDependencies,
): void {
  if (
    dependencies.repository ||
    isPartnershipsDurableWorkerBootEnabled(
      process.env as DiscoveryExecutionEnvironment,
    )
  ) {
    return;
  }
  const control = search.executionControl;
  const linkedStickyReceipt = Boolean(control?.runId || control?.setupRunId);
  if (isDiscoveryLedgerAuthoritative(search) && linkedStickyReceipt) return;
  if (
    (policy.enabled && policy.mode === "canary") ||
    isDiscoveryLedgerAuthoritative(search)
  ) {
    throw new DiscoveryDurableAuthorityError(
      "Durable Partnerships discovery admission requires its worker boot flag",
    );
  }
}

class DiscoveryExecutionObservationTimeoutError extends Error {
  constructor() {
    super("execution shadow deadline exceeded");
    this.name = "DiscoveryExecutionObservationTimeoutError";
  }
}

class DiscoveryExecutionCircuitOpenError extends Error {
  constructor() {
    super("execution shadow circuit is open");
    this.name = "DiscoveryExecutionCircuitOpenError";
  }
}

function observationTimeoutMs(
  dependencies: DiscoveryExecutionObserverDependencies,
): number {
  const requested = dependencies.timeoutMs ?? DEFAULT_SHADOW_TIMEOUT_MS;
  if (!Number.isFinite(requested)) return DEFAULT_SHADOW_TIMEOUT_MS;
  return Math.max(1, Math.min(Math.floor(requested), MAX_SHADOW_TIMEOUT_MS));
}

async function withinObservationDeadline<T>(
  operation: () => Promise<T>,
  dependencies: DiscoveryExecutionObserverDependencies,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation(),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(
          () => reject(new DiscoveryExecutionObservationTimeoutError()),
          observationTimeoutMs(dependencies),
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function repositoryFor(
  dependencies: DiscoveryExecutionObserverDependencies,
): ExecutionControlRepository {
  return dependencies.repository ?? defaultRepository;
}

function safeFailureName(error: unknown): string {
  if (error instanceof Error && error.name) return error.name;
  return "UnknownError";
}

function isTerminalStatus(status: ExecutionRunStatus): boolean {
  return (
    status === "completed" ||
    status === "partial" ||
    status === "failed" ||
    status === "cancelled"
  );
}

function reportDegraded(
  search: DiscoverySearchRecord,
  error: unknown,
  dependencies: DiscoveryExecutionObserverDependencies,
): DiscoveryExecutionObservationResult {
  const message =
    `[partnerships] execution shadow unavailable for ` +
    `${search.slug}/${search.id} (${safeFailureName(error)})`;
  try {
    (dependencies.logError ?? console.error)(message);
  } catch {
    // Observability must never become a second failure path for shadow mode.
  }
  return { enabled: true, recorded: false, degraded: "ledger_unavailable" };
}

function circuitStateFor(
  repository: ExecutionControlRepository,
  slug: string,
): ShadowCircuitState {
  let bySlug = shadowCircuits.get(repository);
  if (!bySlug) {
    bySlug = new Map();
    shadowCircuits.set(repository, bySlug);
  }
  const key = searchCircuitKey(slug);
  let state = bySlug.get(key);
  if (!state) {
    state = { failures: 0, openUntil: 0 };
    bySlug.set(key, state);
  }
  return state;
}

function searchCircuitKey(slug: string): string {
  return slug.trim().toLowerCase();
}

async function protectedObservation(
  search: DiscoverySearchRecord,
  dependencies: DiscoveryExecutionObserverDependencies,
  operation: (
    repository: ExecutionControlRepository,
  ) => Promise<DiscoveryExecutionObservationResult>,
): Promise<DiscoveryExecutionObservationResult> {
  const repository = repositoryFor(dependencies);
  const circuit = circuitStateFor(repository, search.slug);
  if (circuit.openUntil > Date.now()) {
    return reportDegraded(
      search,
      new DiscoveryExecutionCircuitOpenError(),
      dependencies,
    );
  }

  try {
    const result = await withinObservationDeadline(
      () => operation(repository),
      dependencies,
    );
    circuit.failures = 0;
    circuit.openUntil = 0;
    return result;
  } catch (error) {
    circuit.failures += 1;
    if (circuit.failures >= SHADOW_CIRCUIT_FAILURE_THRESHOLD) {
      circuit.openUntil = Date.now() + SHADOW_CIRCUIT_COOLDOWN_MS;
    }
    return reportDegraded(search, error, dependencies);
  }
}

function sanitizeObservationValue(value: unknown): unknown {
  if (value === undefined) return undefined;
  return sanitizeSupportBundle(value, { destination: "internal" }).value;
}

function sanitizeTransition(
  transition: DiscoveryExecutionTransition,
): DiscoveryExecutionTransition {
  return {
    status: transition.status,
    ...(Object.prototype.hasOwnProperty.call(transition, "currentStep")
      ? { currentStep: transition.currentStep }
      : {}),
    ...(Object.prototype.hasOwnProperty.call(transition, "output")
      ? { output: sanitizeObservationValue(transition.output) }
      : {}),
    ...(Object.prototype.hasOwnProperty.call(transition, "error")
      ? {
          error:
            transition.error === null
              ? null
              : String(sanitizeObservationValue(transition.error)),
        }
      : {}),
  };
}

async function ensureObservedRun(
  search: DiscoverySearchRecord,
  dependencies: DiscoveryExecutionObserverDependencies,
  repository = repositoryFor(dependencies),
): Promise<{ run: ExecutionRun; created: boolean }> {
  const policy = resolveDiscoveryExecutionPolicy(search.slug, dependencies.env);
  const canary = policy.mode === "canary" && policy.enabled;
  const deferred = canary && (search.executionIntent ?? "auto") === "none";
  if (
    canary &&
    !deferred &&
    partnershipsDiscoveryEffectsV2Requested(dependencies.env)
  ) {
    return admitPartnershipsDiscoveryV2(
      buildDiscoveryExecutionSnapshot(search),
      {
        repository,
        env: dependencies.env,
        ...(dependencies.resolveYalc
          ? { resolveYalc: dependencies.resolveYalc }
          : {}),
        ...(dependencies.verifyYalcCapability
          ? { verifyYalcCapability: dependencies.verifyYalcCapability }
          : {}),
        ...(dependencies.trustedOrigin
          ? { trustedOrigin: dependencies.trustedOrigin }
          : {}),
      },
    );
  }
  const receipt = await repository.createRun({
    tenantKey: search.slug,
    aggregateType: DISCOVERY_EXECUTION_AGGREGATE,
    aggregateId: discoveryExecutionAggregateId(search.slug, search.id),
    operation: deferred
      ? DISCOVERY_DEFERRED_EXECUTION_OPERATION
      : DISCOVERY_EXECUTION_OPERATION,
    idempotencyKey: canary
      ? discoveryCanaryExecutionIdempotencyKey(
          search.slug,
          search.id,
          discoveryExecutionAttempt(search),
        )
      : discoveryExecutionIdempotencyKey(
          search.slug,
          search.id,
          discoveryExecutionAttempt(search),
        ),
    mode: canary ? "canary" : "shadow",
    input: sanitizeObservationValue(buildDiscoveryExecutionSnapshot(search)),
    metadata: {
      schemaVersion: DISCOVERY_EXECUTION_SNAPSHOT_VERSION,
      source: "partnerships.searches",
      authority: canary ? "execution_ledger" : "legacy_projection",
    },
  });
  return receipt;
}

async function ensureCanaryRun(
  search: DiscoverySearchRecord,
  dependencies: DiscoveryExecutionObserverDependencies,
): Promise<DiscoveryExecutionObservationResult> {
  const repository = repositoryFor(dependencies);
  const control = search.executionControl;
  const scope = {
    tenantKey: search.slug,
    operation: DISCOVERY_EXECUTION_OPERATION,
    mode: "canary" as const,
  };
  let existing: ExecutionRun | null = null;
  if (control?.runId) {
    if (!repository.getRunByIdForScope) {
      throw new Error(
        "execution_control: exact-scope canary replay lookup is unavailable",
      );
    }
    existing = await repository.getRunByIdForScope({
      ...scope,
      runId: control.runId,
    });
    if (!existing) {
      throw new Error(
        "execution_control: linked durable canary run is missing from its exact scope",
      );
    }
  } else if (control?.setupRunId) {
    // The setup handler is the sole child producer. If it crashed after child
    // create but before filesystem binding, recover that frozen child instead
    // of rebuilding a command from mutable runner projection state.
    if (!repository.getRunByAggregateForScope) {
      throw new Error(
        "execution_control: exact-scope setup child lookup is unavailable",
      );
    }
    existing = await repository.getRunByAggregateForScope({
      ...scope,
      aggregateType: DISCOVERY_EXECUTION_AGGREGATE,
      aggregateId: discoveryExecutionAggregateId(search.slug, search.id),
    });
    if (!existing) {
      throw new Error(
        "execution_control: durable setup has not admitted its discovery child",
      );
    }
  }
  if (existing) {
    const snapshot =
      existing.input && typeof existing.input === "object"
        ? (existing.input as Record<string, unknown>)
        : {};
    if (
      existing.tenantKey !== search.slug.trim().toLowerCase() ||
      existing.operation !== DISCOVERY_EXECUTION_OPERATION ||
      existing.mode !== "canary" ||
      existing.aggregateType !== DISCOVERY_EXECUTION_AGGREGATE ||
      existing.aggregateId !==
        discoveryExecutionAggregateId(search.slug, search.id) ||
      snapshot.searchId !== search.id ||
      snapshot.executionGeneration !== searchExecutionGeneration(search) ||
      (control?.runId && existing.id !== control.runId) ||
      (control?.commandFingerprint &&
        existing.commandFingerprint !== control.commandFingerprint) ||
      (control?.setupRunId && snapshot.setupRunId !== control.setupRunId) ||
      (control?.preparedFingerprint &&
        snapshot.preparedFingerprint !== control.preparedFingerprint)
    ) {
      throw new Error(
        "execution_control: durable canary replay receipt does not match its product projection",
      );
    }
    return {
      enabled: true,
      recorded: true,
      runId: existing.id,
      ...(existing.commandFingerprint
        ? { commandFingerprint: existing.commandFingerprint }
        : {}),
      created: false,
    };
  }
  const receipt = await ensureObservedRun(search, dependencies, repository);
  if (receipt.run.mode !== "canary") {
    throw new Error(
      `execution_control: expected canary run for ${search.slug}/${search.id}`,
    );
  }

  // `run:none` is an explicit product deferral. Park the durable command in a
  // non-claimable state rather than letting a generic worker execute it.
  if (
    (search.executionIntent ?? "auto") === "none" &&
    receipt.run.status === "queued"
  ) {
    await repository.transitionRun(
      receipt.run.id,
      {
        status: "waiting_approval",
        expectedStatus: "queued",
        currentStep: "deferred",
      },
      "execution.deferred",
      { route: "none" },
    );
  }

  return {
    enabled: true,
    recorded: true,
    runId: receipt.run.id,
    ...(receipt.run.commandFingerprint
      ? { commandFingerprint: receipt.run.commandFingerprint }
      : {}),
    created: receipt.created,
  };
}

/**
 * Shadow-create a durable run. This is deliberately fail-open: until canary
 * cutover, the existing search path remains authoritative and must not fail
 * because its observer is unavailable.
 */
export async function observeDiscoveryExecutionCreated(
  search: DiscoverySearchRecord,
  dependencies: DiscoveryExecutionObserverDependencies = {},
): Promise<DiscoveryExecutionObservationResult> {
  const policy = resolveDiscoveryExecutionPolicy(search.slug, dependencies.env);
  const stickyCanary = isDiscoveryLedgerAuthoritative(search);
  assertDefaultCanaryBootAuthority(search, policy, dependencies);
  if (!policy.enabled && !stickyCanary) {
    return { enabled: false, recorded: false };
  }
  // Canary is an execution authority, not telemetry. Never put it behind the
  // shadow deadline/circuit: creation and replay must fail closed when its
  // durable receipt cannot be persisted.
  if (policy.mode === "canary" || stickyCanary) {
    return ensureCanaryRun(search, dependencies);
  }
  return protectedObservation(search, dependencies, async (repository) => {
    const receipt = await ensureObservedRun(search, dependencies, repository);
    return {
      enabled: true,
      recorded: true,
      runId: receipt.run.id,
      ...(receipt.run.commandFingerprint
        ? { commandFingerprint: receipt.run.commandFingerprint }
        : {}),
      created: receipt.created,
    };
  });
}

export async function observeDiscoveryExecutionEvent(
  search: DiscoverySearchRecord,
  eventType: string,
  data?: unknown,
  dependencies: DiscoveryExecutionObserverDependencies = {},
): Promise<DiscoveryExecutionObservationResult> {
  const policy = resolveDiscoveryExecutionPolicy(search.slug, dependencies.env);
  assertDefaultCanaryBootAuthority(search, policy, dependencies);
  if (!policy.enabled) return { enabled: false, recorded: false };
  return protectedObservation(search, dependencies, async (repository) => {
    const { run, created } = await ensureObservedRun(
      search,
      dependencies,
      repository,
    );
    await repository.appendEvent({
      runId: run.id,
      type: eventType,
      data: sanitizeObservationValue(data),
    });
    return { enabled: true, recorded: true, runId: run.id, created };
  });
}

export async function observeDiscoveryExecutionTransition(
  search: DiscoverySearchRecord,
  eventType: string,
  transition: DiscoveryExecutionTransition,
  eventData?: unknown,
  dependencies: DiscoveryExecutionObserverDependencies = {},
): Promise<DiscoveryExecutionObservationResult> {
  const policy = resolveDiscoveryExecutionPolicy(search.slug, dependencies.env);
  assertDefaultCanaryBootAuthority(search, policy, dependencies);
  if (!policy.enabled) return { enabled: false, recorded: false };
  if (policy.mode === "canary") {
    throw new Error(
      "partnerships discovery canary transitions require an active execution lease",
    );
  }
  return protectedObservation(search, dependencies, async (repository) => {
    const { run, created } = await ensureObservedRun(
      search,
      dependencies,
      repository,
    );
    const safeTransition = sanitizeTransition(transition);
    const safeEventData = sanitizeObservationValue(eventData);
    if (isTerminalStatus(run.status)) {
      await repository.appendEvent({
        runId: run.id,
        type: "shadow.observed_after_terminal",
        data: {
          observedEvent: eventType,
          observedStatus: safeTransition.status,
        },
      });
    } else {
      try {
        await repository.transitionRun(
          run.id,
          { ...safeTransition, expectedStatus: run.status },
          eventType,
          safeEventData,
        );
      } catch (error) {
        // A concurrent observer may have terminalized the same attempt after
        // our read. Preserve the losing observation instead of overwriting
        // the winner or silently dropping evidence.
        const latest = await repository.getRunById(run.id);
        if (!latest || !isTerminalStatus(latest.status)) throw error;
        await repository.appendEvent({
          runId: run.id,
          type: "shadow.observed_after_terminal",
          data: {
            observedEvent: eventType,
            observedStatus: safeTransition.status,
            concurrentWinner: latest.status,
          },
        });
      }
    }
    return { enabled: true, recorded: true, runId: run.id, created };
  });
}

export async function observeDiscoveryExecutionDispatch(
  search: DiscoverySearchRecord,
  dispatch: { route: string; forwarded: boolean; error?: string | null },
  dependencies: DiscoveryExecutionObserverDependencies = {},
): Promise<DiscoveryExecutionObservationResult> {
  if (dispatch.forwarded) {
    return observeDiscoveryExecutionEvent(
      search,
      "runtime.dispatched",
      { route: dispatch.route, forwarded: true },
      dependencies,
    );
  }
  return observeDiscoveryExecutionTransition(
    search,
    "runtime.dispatch_failed",
    {
      status: "failed",
      currentStep: "dispatch",
      error: dispatch.error || "Runtime dispatch failed",
    },
    { route: dispatch.route, forwarded: false },
    dependencies,
  );
}
