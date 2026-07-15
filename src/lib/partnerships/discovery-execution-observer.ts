import {
  PostgresExecutionControlRepository,
  type ExecutionControlRepository,
  type ExecutionRun,
  type ExecutionRunStatus,
} from "@/lib/execution-control";
import { sanitizeSupportBundle } from "@/lib/support/redaction";
import {
  buildDiscoveryExecutionSnapshot,
  DISCOVERY_EXECUTION_AGGREGATE,
  DISCOVERY_EXECUTION_OPERATION,
  DISCOVERY_EXECUTION_SNAPSHOT_VERSION,
  discoveryExecutionAttempt,
  discoveryExecutionAggregateId,
  discoveryExecutionIdempotencyKey,
  resolveDiscoveryExecutionPolicy,
  type DiscoveryExecutionEnvironment,
} from "./discovery-execution-policy";
import type { DiscoverySearchRecord } from "./discovery-types";

interface DiscoveryExecutionObserverDependencies {
  repository?: ExecutionControlRepository;
  env?: DiscoveryExecutionEnvironment;
  logError?: (message: string) => void;
  timeoutMs?: number;
}

export interface DiscoveryExecutionObservationResult {
  enabled: boolean;
  recorded: boolean;
  runId?: string;
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
  const receipt = await repository.createRun({
    tenantKey: search.slug,
    aggregateType: DISCOVERY_EXECUTION_AGGREGATE,
    aggregateId: discoveryExecutionAggregateId(search.slug, search.id),
    operation: DISCOVERY_EXECUTION_OPERATION,
    idempotencyKey: discoveryExecutionIdempotencyKey(
      search.slug,
      search.id,
      discoveryExecutionAttempt(search),
    ),
    mode:
      resolveDiscoveryExecutionPolicy(search.slug, dependencies.env).mode ===
      "canary"
        ? "canary"
        : "shadow",
    input: sanitizeObservationValue(buildDiscoveryExecutionSnapshot(search)),
    metadata: {
      schemaVersion: DISCOVERY_EXECUTION_SNAPSHOT_VERSION,
      source: "partnerships.searches",
      authority: "legacy_projection",
    },
  });
  return receipt;
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
  if (!policy.enabled) return { enabled: false, recorded: false };
  return protectedObservation(
    search,
    dependencies,
    async (repository) => {
      const receipt = await ensureObservedRun(
        search,
        dependencies,
        repository,
      );
      return {
        enabled: true,
        recorded: true,
        runId: receipt.run.id,
        created: receipt.created,
      };
    },
  );
}

export async function observeDiscoveryExecutionEvent(
  search: DiscoverySearchRecord,
  eventType: string,
  data?: unknown,
  dependencies: DiscoveryExecutionObserverDependencies = {},
): Promise<DiscoveryExecutionObservationResult> {
  const policy = resolveDiscoveryExecutionPolicy(search.slug, dependencies.env);
  if (!policy.enabled) return { enabled: false, recorded: false };
  return protectedObservation(
    search,
    dependencies,
    async (repository) => {
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
    },
  );
}

export async function observeDiscoveryExecutionTransition(
  search: DiscoverySearchRecord,
  eventType: string,
  transition: DiscoveryExecutionTransition,
  eventData?: unknown,
  dependencies: DiscoveryExecutionObserverDependencies = {},
): Promise<DiscoveryExecutionObservationResult> {
  const policy = resolveDiscoveryExecutionPolicy(search.slug, dependencies.env);
  if (!policy.enabled) return { enabled: false, recorded: false };
  return protectedObservation(
    search,
    dependencies,
    async (repository) => {
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
    },
  );
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
