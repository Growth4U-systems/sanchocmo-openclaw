import crypto from "crypto";
import fs from "fs";
import path from "path";
import { BASE } from "./paths";
import { readJSON, writeJSON } from "./json-io";
import { PostgresAgentRunsRepository } from "./agent-runs-postgres";
import { createTraceContext, getTraceId, normalizeTraceId } from "@/lib/trace-context";
import { terminalCallbackClaimIsStale } from "./agent-run-callback-claim";
import {
  AGENT_RUN_SYNTHETIC_RUNTIME_LOSS_CODE,
  AGENT_RUN_SYNTHETIC_RUNTIME_LOSS_ERROR,
} from "./agent-run-synthetic-runtime-loss";

export type AgentRunStatus = "queued" | "running" | "completed" | "failed" | "cancelled";

export interface AgentRunExpectedOutput {
  path: string;
  source:
    | "deliverable_file"
    | "output_documents"
    | "output_files"
    | "documents"
    | "fallback";
}

/**
 * Minimal immutable description of the task harness at dispatch time.
 *
 * Quality consumers must not reconstruct this from the current task record:
 * task configuration can change after a run and would rewrite history.
 */
export interface AgentRunTaskContractSnapshot {
  name?: string;
  type?: string;
  status?: string;
  completion?: string;
  doneCriteria?: string;
  deliverable?: string;
  expectedOutputs: AgentRunExpectedOutput[];
}

export type AgentRunEventType =
  | "run_created"
  | "runtime_dispatched"
  | "runtime_rejected"
  | "runtime_unreachable"
  | "progress"
  | "artifact_readback"
  | "bot_reply"
  | "cancel_requested"
  | "cancel_dispatched"
  | "cancel_failed"
  | "failed";

export interface AgentRun {
  id: string;
  /** Stable key for an externally retried mutation that must create one run. */
  idempotencyKey?: string;
  threadId: string;
  /** Correlates browser/API/gateway/tool work without exposing payload data. */
  traceId?: string;
  runtime: string;
  agent?: string;
  /** Legacy-compatible seed; advisory when skillMode is auto. */
  skill?: string;
  skills?: string[];
  skillMode?: "auto" | "pinned";
  /** Task harness resolved by Mission Control for this turn, when any. */
  taskId?: string;
  /** Task contract captured when the run was accepted. */
  taskContract?: AgentRunTaskContractSnapshot;
  status: AgentRunStatus;
  input?: unknown;
  output?: unknown;
  error?: string;
  /** Winning terminal transport fingerprint (array-shaped for legacy rows). */
  callbackFingerprints?: string[];
  createdAt: string;
  startedAt?: string;
  finishedAt?: string;
  updatedAt: string;
}

export interface AgentRunEvent {
  id: string;
  runId: string;
  threadId: string;
  traceId?: string;
  type: AgentRunEventType;
  ts: string;
  data?: unknown;
}

export interface AgentRunsSnapshot {
  runs: AgentRun[];
  events: AgentRunEvent[];
}

export interface CreateAgentRunInput {
  idempotencyKey?: string;
  threadId: string;
  traceId?: string;
  runtime: string;
  agent?: string;
  skill?: string;
  skills?: string[];
  skillMode?: "auto" | "pinned";
  taskId?: string;
  taskContract?: AgentRunTaskContractSnapshot;
  input?: unknown;
  now?: Date;
  /**
   * Optional active-parent fence for runtime-created control children. The
   * repository must serialize this check with the parent's Stop tombstone.
   */
  activeParent?: { runId: string; threadId: string };
}

export class AgentRunParentInactiveError extends Error {
  readonly code = "agent_run_parent_inactive";

  constructor() {
    super("agent_runs: active parent fence rejected child admission");
    this.name = "AgentRunParentInactiveError";
  }
}

export interface AppendAgentRunEventInput {
  runId: string;
  threadId: string;
  traceId?: string;
  type: AgentRunEventType;
  data?: unknown;
  now?: Date;
}

export interface UpdateAgentRunInput {
  status?: AgentRunStatus;
  output?: unknown;
  error?: string;
  startedAt?: string;
  finishedAt?: string;
  now?: Date;
}

interface RecoverSyntheticRuntimeLossBase {
  runId: string;
  threadId: string;
  /** Durable dispatch identity also bound into the terminal callback grant. */
  dispatchRunId: string;
  /** Exact terminal payload fingerprint; one competing payload may win. */
  fingerprint: string;
  output: unknown;
  completedAt?: Date;
}

/**
 * Purpose-built exception to terminal immutability. The repository may apply
 * it only to the exact machine-marked `runtime_committed_worker_lost` failure.
 */
export type RecoverSyntheticRuntimeLossInput =
  | (RecoverSyntheticRuntimeLossBase & {
      terminalStatus: "completed";
      terminalError?: never;
    })
  | (RecoverSyntheticRuntimeLossBase & {
      terminalStatus: "failed";
      terminalError: string;
    });

export interface AgentRunsRetention {
  storage: "bounded-json" | "postgres";
  maxRuns: number | null;
  maxEvents: number | null;
  durable: boolean;
  snapshotRunLimit?: number;
  snapshotEventLimit?: number;
}

export interface CreateAgentRunReceipt {
  run: AgentRun;
  /** False when an in-flight/successful idempotency key already owned the run. */
  created: boolean;
}

export interface AgentRunsRepository {
  readonly backend: "json" | "postgres";
  readonly retention: Readonly<AgentRunsRetention>;
  create(input: CreateAgentRunInput): Promise<AgentRun>;
  createWithReceipt(input: CreateAgentRunInput): Promise<CreateAgentRunReceipt>;
  readSnapshot(): Promise<AgentRunsSnapshot>;
  appendEvent(input: AppendAgentRunEventInput): Promise<AgentRunEvent>;
  update(runId: string, input: UpdateAgentRunInput): Promise<AgentRun | null>;
  getById(runId: string): Promise<AgentRun | null>;
  getByIdempotencyKey(threadId: string, idempotencyKey: string): Promise<AgentRun | null>;
  claimCallbackFingerprint(runId: string, fingerprint: string): Promise<boolean>;
  recoverSyntheticRuntimeLoss(
    input: RecoverSyntheticRuntimeLossInput,
  ): Promise<AgentRun | null>;
  getLatestActive(threadId: string): Promise<AgentRun | null>;
  listActive(limit?: number): Promise<AgentRun[]>;
  listActiveChildren(parentRunId: string): Promise<AgentRun[]>;
  markDispatched(runId: string, threadId: string, data?: unknown): Promise<AgentRun | null>;
  markFailed(
    runId: string,
    threadId: string,
    error: string,
    type?: "runtime_rejected" | "runtime_unreachable" | "failed",
    data?: unknown,
  ): Promise<AgentRun | null>;
  markCompleted(
    runId: string,
    threadId: string,
    output?: unknown,
    completedAt?: Date,
  ): Promise<AgentRun | null>;
  markCancelled(runId: string, threadId: string, data?: unknown): Promise<AgentRun | null>;
  listForThread(threadId: string, limit?: number): Promise<AgentRun[]>;
  listEvents(runId: string): Promise<AgentRunEvent[]>;
  listForTrace(traceId: string): Promise<AgentRun[]>;
  listEventsForTrace(traceId: string): Promise<AgentRunEvent[]>;
}

export type AgentRunsBackend = AgentRunsRepository["backend"];

export class AgentRunsConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AgentRunsConfigurationError";
  }
}

/**
 * Legacy synchronous/file coverage. Kept byte-compatible for development,
 * tests and explicit backfill inspection; durable callers should use
 * `getAgentRunsRepository()` or the `*Async` facade below.
 */
export const AGENT_RUN_RETENTION = Object.freeze({
  storage: "bounded-json" as const,
  maxRuns: 2000,
  maxEvents: 10000,
  durable: false,
}) satisfies Readonly<AgentRunsRetention>;

const MAX_RUNS = AGENT_RUN_RETENTION.maxRuns;
const MAX_EVENTS = AGENT_RUN_RETENTION.maxEvents;
const ACTIVE_STATUSES = new Set<AgentRunStatus>(["queued", "running"]);
const TERMINAL_STATUSES = new Set<AgentRunStatus>(["completed", "failed", "cancelled"]);

interface AgentRunsEnvironment {
  DATABASE_URL?: string;
  NODE_ENV?: string;
  SANCHO_AGENT_RUNS_BACKEND?: string;
  SANCHO_AGENT_RUNS_ALLOW_NON_DURABLE?: string;
}

/**
 * Select the ledger deliberately. Production never falls back to JSON after a
 * Postgres error: that would make callback claims look successful while losing
 * the durable idempotency record on process replacement.
 */
export function resolveAgentRunsBackend(
  env: AgentRunsEnvironment = process.env,
): AgentRunsBackend {
  const configured = env.SANCHO_AGENT_RUNS_BACKEND?.trim().toLowerCase();
  if (configured && !["db", "postgres", "json"].includes(configured)) {
    throw new AgentRunsConfigurationError(
      `Unsupported SANCHO_AGENT_RUNS_BACKEND=${env.SANCHO_AGENT_RUNS_BACKEND}`,
    );
  }
  if (configured === "db" || configured === "postgres") {
    if (!env.DATABASE_URL) {
      throw new AgentRunsConfigurationError(
        "SANCHO_AGENT_RUNS_BACKEND=db requires DATABASE_URL",
      );
    }
    return "postgres";
  }
  if (configured === "json") {
    if (
      env.NODE_ENV === "production"
      && env.SANCHO_AGENT_RUNS_ALLOW_NON_DURABLE !== "true"
    ) {
      throw new AgentRunsConfigurationError(
        "JSON agent-run storage is non-durable in production; set "
        + "SANCHO_AGENT_RUNS_ALLOW_NON_DURABLE=true only for an explicit emergency override",
      );
    }
    return "json";
  }
  if (env.NODE_ENV === "production") {
    if (env.DATABASE_URL) return "postgres";
    throw new AgentRunsConfigurationError(
      "Production agent-run storage requires DATABASE_URL (or an explicit emergency JSON override)",
    );
  }
  return "json";
}

function resolvedTraceId(value: unknown): string {
  return normalizeTraceId(value) ?? getTraceId() ?? createTraceContext().traceId;
}

function assertLegacySyncBackend(): void {
  if (resolveAgentRunsBackend() !== "json") {
    throw new AgentRunsConfigurationError(
      "The synchronous agent-run API cannot provide Postgres durability; use the matching *Async export",
    );
  }
}

export function agentRunsFile(): string {
  return path.join(BASE, "_system", "agent-runs.json");
}

function readStore(): AgentRunsSnapshot {
  const store = readJSON<AgentRunsSnapshot>(agentRunsFile(), { runs: [], events: [] });
  return {
    runs: Array.isArray(store.runs) ? store.runs : [],
    events: Array.isArray(store.events) ? store.events : [],
  };
}

function writeStore(store: AgentRunsSnapshot): void {
  writeJSON(agentRunsFile(), {
    runs: store.runs.slice(-MAX_RUNS),
    events: store.events.slice(-MAX_EVENTS),
  });
}

function iso(now: Date | undefined): string {
  return (now ?? new Date()).toISOString();
}

function id(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${crypto.randomUUID().slice(0, 8)}`;
}

export function createAgentRun(input: CreateAgentRunInput): AgentRun {
  assertLegacySyncBackend();
  const now = iso(input.now);
  const traceId = resolvedTraceId(input.traceId);
  const run: AgentRun = {
    id: id("run"),
    idempotencyKey: input.idempotencyKey,
    threadId: input.threadId,
    traceId,
    runtime: input.runtime,
    agent: input.agent,
    skill: input.skill,
    skills: input.skills,
    skillMode: input.skillMode,
    taskId: input.taskId,
    taskContract: input.taskContract,
    status: "queued",
    input: input.input,
    createdAt: now,
    updatedAt: now,
  };
  const store = readStore();
  store.runs.push(run);
  store.events.push({
    id: id("evt"),
    runId: run.id,
    threadId: run.threadId,
    traceId,
    type: "run_created",
    ts: now,
    data: {
      runtime: run.runtime,
      idempotencyKey: run.idempotencyKey,
      agent: run.agent,
      skill: run.skill,
      skills: run.skills,
      skillMode: run.skillMode,
      taskId: run.taskId,
      traceId,
    },
  });
  writeStore(store);
  return run;
}

/**
 * Read-only point-in-time view used by the shadow quality evidence endpoint.
 * The returned objects come from a fresh JSON parse; mutating them cannot write
 * back to the ledger.
 */
export function readAgentRunsSnapshot(): AgentRunsSnapshot {
  assertLegacySyncBackend();
  try {
    const parsed = JSON.parse(fs.readFileSync(agentRunsFile(), "utf8")) as Partial<AgentRunsSnapshot>;
    if (!Array.isArray(parsed.runs) || !Array.isArray(parsed.events)) {
      throw new Error("agent-runs ledger has an invalid shape");
    }
    return { runs: parsed.runs, events: parsed.events };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { runs: [], events: [] };
    throw new Error(`agent-runs ledger is unreadable: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export function appendAgentRunEvent(input: AppendAgentRunEventInput): AgentRunEvent {
  assertLegacySyncBackend();
  const store = readStore();
  const runTraceId = store.runs.find((run) => run.id === input.runId)?.traceId;
  const event: AgentRunEvent = {
    id: id("evt"),
    runId: input.runId,
    threadId: input.threadId,
    traceId: runTraceId ?? normalizeTraceId(input.traceId) ?? getTraceId(),
    type: input.type,
    ts: iso(input.now),
    data: input.data,
  };
  store.events.push(event);
  writeStore(store);
  return event;
}

export function updateAgentRun(runId: string, input: UpdateAgentRunInput): AgentRun | null {
  assertLegacySyncBackend();
  const store = readStore();
  const idx = store.runs.findIndex((run) => run.id === runId);
  if (idx < 0) return null;
  const previous = store.runs[idx];
  // Runtime callbacks may arrive late or be retried. Once a run reaches a
  // terminal state, never let a delayed dispatch/final callback reopen it or
  // replace the terminal output that won the race.
  if (TERMINAL_STATUSES.has(previous.status)) return previous;
  const now = iso(input.now);
  const updated: AgentRun = {
    ...previous,
    ...("status" in input && input.status ? { status: input.status } : {}),
    ...("output" in input ? { output: input.output } : {}),
    ...("error" in input ? { error: input.error } : {}),
    ...(input.startedAt ? { startedAt: input.startedAt } : {}),
    ...(input.finishedAt ? { finishedAt: input.finishedAt } : {}),
    updatedAt: now,
  };
  store.runs[idx] = updated;
  writeStore(store);
  return updated;
}

export function getAgentRunById(runId: string): AgentRun | null {
  assertLegacySyncBackend();
  if (!runId) return null;
  return readStore().runs.find((run) => run.id === runId) ?? null;
}

export function getAgentRunByIdempotencyKey(
  threadId: string,
  idempotencyKey: string,
): AgentRun | null {
  assertLegacySyncBackend();
  if (!threadId || !idempotencyKey) return null;
  const runs = readStore().runs;
  for (let i = runs.length - 1; i >= 0; i -= 1) {
    const run = runs[i];
    if (run.threadId === threadId && run.idempotencyKey === idempotencyKey) return run;
  }
  return null;
}

/**
 * Atomically claims the one terminal callback fingerprint in the JSON ledger.
 * Returns false for both a retry and a competing terminal payload.
 */
export function claimAgentRunCallbackFingerprint(runId: string, fingerprint: string): boolean {
  assertLegacySyncBackend();
  if (!runId || !fingerprint) return false;
  const store = readStore();
  const index = store.runs.findIndex((run) => run.id === runId);
  if (index < 0) return false;
  const current = store.runs[index];
  const existing = current.callbackFingerprints ?? [];
  const recoveringStaleClaim =
    existing.length === 1 &&
    existing[0] === fingerprint &&
    ACTIVE_STATUSES.has(current.status) &&
    terminalCallbackClaimIsStale(current.updatedAt);
  if (existing.length > 0 && !recoveringStaleClaim) return false;
  const now = new Date().toISOString();
  store.runs[index] = {
    ...current,
    callbackFingerprints: [fingerprint],
    updatedAt: now,
  };
  writeStore(store);
  return true;
}

const TERMINAL_CALLBACK_FINGERPRINT_PATTERN = /^[a-f0-9]{64}$/;
const AGENT_RUN_IDENTIFIER_PATTERN =
  /^[A-Za-z0-9][A-Za-z0-9._:@/+~-]{0,159}$/;

/**
 * JSON-backend implementation of the narrowly-scoped late terminal CAS.
 * Production uses the Postgres statement below; this synchronous snapshot
 * mutation keeps local/test behavior contract-compatible without weakening
 * `updateAgentRun`'s general terminal-state fence.
 */
export function recoverAgentRunSyntheticRuntimeLoss(
  input: RecoverSyntheticRuntimeLossInput,
): AgentRun | null {
  assertLegacySyncBackend();
  const completedAt = input.completedAt ?? new Date();
  if (
    !AGENT_RUN_IDENTIFIER_PATTERN.test(input.runId) ||
    !input.threadId ||
    !AGENT_RUN_IDENTIFIER_PATTERN.test(input.dispatchRunId) ||
    !TERMINAL_CALLBACK_FINGERPRINT_PATTERN.test(input.fingerprint) ||
    Number.isNaN(completedAt.getTime()) ||
    (input.terminalStatus === "failed" &&
      (typeof input.terminalError !== "string" ||
        !input.terminalError.trim() ||
        input.terminalError.length > 256)) ||
    (input.terminalStatus === "completed" &&
      input.terminalError !== undefined)
  ) {
    return null;
  }
  const store = readStore();
  const index = store.runs.findIndex((run) => run.id === input.runId);
  if (index < 0) return null;
  const current = store.runs[index];
  const fingerprints = current.callbackFingerprints ?? [];
  const ownsFingerprintSlot =
    fingerprints.length === 0 ||
    (fingerprints.length === 1 && fingerprints[0] === input.fingerprint);
  const hasExactSyntheticMarker = store.events.some((event) => {
    const data =
      event.data && typeof event.data === "object" && !Array.isArray(event.data)
        ? (event.data as Record<string, unknown>)
        : null;
    return (
      event.runId === input.runId &&
      event.threadId === input.threadId &&
      event.type === "runtime_unreachable" &&
      data?.code === AGENT_RUN_SYNTHETIC_RUNTIME_LOSS_CODE &&
      data.dispatchRunId === input.dispatchRunId
    );
  });
  const idempotencyConflict = Boolean(
    current.idempotencyKey &&
      store.runs.some(
        (candidate) =>
          candidate.id !== current.id &&
          candidate.threadId === current.threadId &&
          candidate.idempotencyKey === current.idempotencyKey &&
          (candidate.status === "queued" ||
            candidate.status === "running" ||
            candidate.status === "completed"),
      ),
  );
  if (
    current.threadId !== input.threadId ||
    current.status !== "failed" ||
    current.error !== AGENT_RUN_SYNTHETIC_RUNTIME_LOSS_ERROR ||
    !ownsFingerprintSlot ||
    !hasExactSyntheticMarker ||
    idempotencyConflict
  ) {
    return null;
  }

  const now = completedAt.toISOString();
  const recovered: AgentRun = {
    ...current,
    status: input.terminalStatus,
    output: input.output,
    ...(input.terminalStatus === "failed"
      ? { error: input.terminalError }
      : {}),
    callbackFingerprints: [input.fingerprint],
    finishedAt: now,
    updatedAt: now,
  };
  if (input.terminalStatus === "completed") delete recovered.error;
  store.runs[index] = recovered;
  store.events.push({
    id: id("evt"),
    runId: recovered.id,
    threadId: recovered.threadId,
    traceId: recovered.traceId,
    type: input.terminalStatus === "failed" ? "failed" : "bot_reply",
    ts: now,
    data: input.output,
  });
  writeStore(store);
  return recovered;
}

export function getLatestActiveRun(threadId: string): AgentRun | null {
  assertLegacySyncBackend();
  const store = readStore();
  for (let i = store.runs.length - 1; i >= 0; i -= 1) {
    const run = store.runs[i];
    if (run.threadId === threadId && ACTIVE_STATUSES.has(run.status)) return run;
  }
  return null;
}

export function markAgentRunDispatched(
  runId: string,
  threadId: string,
  data?: unknown,
): AgentRun | null {
  assertLegacySyncBackend();
  const current = getAgentRunById(runId);
  if (!current || TERMINAL_STATUSES.has(current.status)) return current;
  const now = new Date();
  appendAgentRunEvent({ runId, threadId, type: "runtime_dispatched", data, now });
  return updateAgentRun(runId, {
    status: "running",
    startedAt: now.toISOString(),
    now,
  });
}

export function markAgentRunFailed(
  runId: string,
  threadId: string,
  error: string,
  type: "runtime_rejected" | "runtime_unreachable" | "failed" = "failed",
  data?: unknown,
): AgentRun | null {
  assertLegacySyncBackend();
  const current = getAgentRunById(runId);
  if (!current || TERMINAL_STATUSES.has(current.status)) return current;
  const now = new Date();
  appendAgentRunEvent({ runId, threadId, type, data: data ?? { error }, now });
  return updateAgentRun(runId, {
    status: "failed",
    error,
    finishedAt: now.toISOString(),
    now,
  });
}

export function markAgentRunCompleted(
  runId: string,
  threadId: string,
  output?: unknown,
  completedAt?: Date,
): AgentRun | null {
  assertLegacySyncBackend();
  const current = getAgentRunById(runId);
  if (!current || TERMINAL_STATUSES.has(current.status)) return current;
  const now = completedAt ?? new Date();
  appendAgentRunEvent({ runId, threadId, type: "bot_reply", data: output, now });
  return updateAgentRun(runId, {
    status: "completed",
    output,
    finishedAt: now.toISOString(),
    now,
  });
}

export function markAgentRunCancelled(
  runId: string,
  threadId: string,
  data?: unknown,
): AgentRun | null {
  assertLegacySyncBackend();
  const current = getAgentRunById(runId);
  if (!current || TERMINAL_STATUSES.has(current.status)) return current;
  const now = new Date();
  appendAgentRunEvent({ runId, threadId, type: "cancel_requested", data, now });
  return updateAgentRun(runId, {
    status: "cancelled",
    finishedAt: now.toISOString(),
    now,
  });
}

export function listAgentRunsForThread(threadId: string): AgentRun[] {
  assertLegacySyncBackend();
  return readStore().runs.filter((run) => run.threadId === threadId);
}

export function listAgentRunEvents(runId: string): AgentRunEvent[] {
  assertLegacySyncBackend();
  return readStore().events.filter((event) => event.runId === runId);
}

class JsonAgentRunsRepository implements AgentRunsRepository {
  readonly backend = "json" as const;
  readonly retention = AGENT_RUN_RETENTION;

  async create(input: CreateAgentRunInput) {
    return (await this.createWithReceipt(input)).run;
  }

  async createWithReceipt(input: CreateAgentRunInput): Promise<CreateAgentRunReceipt> {
    if (input.idempotencyKey) {
      const existing = getAgentRunByIdempotencyKey(input.threadId, input.idempotencyKey);
      if (existing && (
        existing.status === "queued"
        || existing.status === "running"
        || existing.status === "completed"
      )) {
        return { run: existing, created: false };
      }
    }
    if (input.activeParent) {
      const parent = getAgentRunById(input.activeParent.runId);
      if (
        !parent ||
        parent.threadId !== input.activeParent.threadId ||
        (parent.status !== "queued" && parent.status !== "running")
      ) {
        throw new AgentRunParentInactiveError();
      }
    }
    return { run: createAgentRun(input), created: true };
  }

  async readSnapshot() {
    return readAgentRunsSnapshot();
  }

  async appendEvent(input: AppendAgentRunEventInput) {
    return appendAgentRunEvent(input);
  }

  async update(runId: string, input: UpdateAgentRunInput) {
    return updateAgentRun(runId, input);
  }

  async getById(runId: string) {
    return getAgentRunById(runId);
  }

  async getByIdempotencyKey(threadId: string, idempotencyKey: string) {
    return getAgentRunByIdempotencyKey(threadId, idempotencyKey);
  }

  async claimCallbackFingerprint(runId: string, fingerprint: string) {
    return claimAgentRunCallbackFingerprint(runId, fingerprint);
  }

  async recoverSyntheticRuntimeLoss(
    input: RecoverSyntheticRuntimeLossInput,
  ) {
    return recoverAgentRunSyntheticRuntimeLoss(input);
  }

  async getLatestActive(threadId: string) {
    return getLatestActiveRun(threadId);
  }

  async listActive(limit = 100) {
    const boundedLimit = Math.max(0, limit);
    if (boundedLimit === 0) return [];
    return readStore().runs
      .filter((run) => ACTIVE_STATUSES.has(run.status))
      .sort(
        (left, right) =>
          right.createdAt.localeCompare(left.createdAt) ||
          right.id.localeCompare(left.id),
      )
      .slice(0, boundedLimit);
  }

  async listActiveChildren(parentRunId: string) {
    return readStore().runs.filter((run) => {
      const input =
        run.input && typeof run.input === "object" && !Array.isArray(run.input)
          ? (run.input as Record<string, unknown>)
          : null;
      return (
        input?.controlParentAgentRunId === parentRunId &&
        ACTIVE_STATUSES.has(run.status)
      );
    });
  }

  async markDispatched(runId: string, threadId: string, data?: unknown) {
    return markAgentRunDispatched(runId, threadId, data);
  }

  async markFailed(
    runId: string,
    threadId: string,
    error: string,
    type: "runtime_rejected" | "runtime_unreachable" | "failed" = "failed",
    data?: unknown,
  ) {
    return markAgentRunFailed(runId, threadId, error, type, data);
  }

  async markCompleted(runId: string, threadId: string, output?: unknown, completedAt?: Date) {
    return markAgentRunCompleted(runId, threadId, output, completedAt);
  }

  async markCancelled(runId: string, threadId: string, data?: unknown) {
    return markAgentRunCancelled(runId, threadId, data);
  }

  async listForThread(threadId: string, limit?: number) {
    const runs = listAgentRunsForThread(threadId);
    return limit === undefined ? runs : runs.slice(-Math.max(0, limit));
  }

  async listEvents(runId: string) {
    return listAgentRunEvents(runId);
  }

  async listForTrace(traceId: string) {
    const normalized = normalizeTraceId(traceId);
    if (!normalized) return [];
    return readStore().runs.filter((run) => run.traceId === normalized);
  }

  async listEventsForTrace(traceId: string) {
    const normalized = normalizeTraceId(traceId);
    if (!normalized) return [];
    return readStore().events.filter((event) => event.traceId === normalized);
  }
}

let repositoryCache:
  | { key: string; repository: AgentRunsRepository }
  | undefined;

/**
 * Return the process-wide repository. The cache key includes configuration so
 * tests and controlled runtime reconfiguration cannot accidentally retain a
 * repository selected under older environment values.
 */
export function getAgentRunsRepository(): AgentRunsRepository {
  const backend = resolveAgentRunsBackend();
  const key = `${backend}:${process.env.DATABASE_URL ?? ""}:${process.env.MC_WORKSPACE ?? ""}`;
  if (repositoryCache?.key === key) return repositoryCache.repository;
  const repository: AgentRunsRepository = backend === "postgres"
    ? new PostgresAgentRunsRepository()
    : new JsonAgentRunsRepository();
  repositoryCache = { key, repository };
  return repository;
}

export function getAgentRunsRetention(): Readonly<AgentRunsRetention> {
  return getAgentRunsRepository().retention;
}

// Async facade: argument and receipt shapes intentionally match the historical
// exports so API call sites only need an `Async` suffix and `await` at cutover.
export async function createAgentRunAsync(input: CreateAgentRunInput): Promise<AgentRun> {
  return getAgentRunsRepository().create(input);
}

export async function createAgentRunWithReceiptAsync(
  input: CreateAgentRunInput,
): Promise<CreateAgentRunReceipt> {
  return getAgentRunsRepository().createWithReceipt(input);
}

export async function readAgentRunsSnapshotAsync(): Promise<AgentRunsSnapshot> {
  return getAgentRunsRepository().readSnapshot();
}

export async function appendAgentRunEventAsync(
  input: AppendAgentRunEventInput,
): Promise<AgentRunEvent> {
  return getAgentRunsRepository().appendEvent(input);
}

export async function updateAgentRunAsync(
  runId: string,
  input: UpdateAgentRunInput,
): Promise<AgentRun | null> {
  return getAgentRunsRepository().update(runId, input);
}

export async function getAgentRunByIdAsync(runId: string): Promise<AgentRun | null> {
  return getAgentRunsRepository().getById(runId);
}

export async function getAgentRunByIdempotencyKeyAsync(
  threadId: string,
  idempotencyKey: string,
): Promise<AgentRun | null> {
  return getAgentRunsRepository().getByIdempotencyKey(threadId, idempotencyKey);
}

export async function claimAgentRunCallbackFingerprintAsync(
  runId: string,
  fingerprint: string,
): Promise<boolean> {
  return getAgentRunsRepository().claimCallbackFingerprint(runId, fingerprint);
}

export async function recoverAgentRunSyntheticRuntimeLossAsync(
  input: RecoverSyntheticRuntimeLossInput,
): Promise<AgentRun | null> {
  return getAgentRunsRepository().recoverSyntheticRuntimeLoss(input);
}

export async function getLatestActiveRunAsync(threadId: string): Promise<AgentRun | null> {
  return getAgentRunsRepository().getLatestActive(threadId);
}

export async function listActiveAgentRunsAsync(limit = 100): Promise<AgentRun[]> {
  return getAgentRunsRepository().listActive(limit);
}

export async function listActiveChildAgentRunsAsync(
  parentRunId: string,
): Promise<AgentRun[]> {
  return getAgentRunsRepository().listActiveChildren(parentRunId);
}

export async function markAgentRunDispatchedAsync(
  runId: string,
  threadId: string,
  data?: unknown,
): Promise<AgentRun | null> {
  return getAgentRunsRepository().markDispatched(runId, threadId, data);
}

export async function markAgentRunFailedAsync(
  runId: string,
  threadId: string,
  error: string,
  type: "runtime_rejected" | "runtime_unreachable" | "failed" = "failed",
  data?: unknown,
): Promise<AgentRun | null> {
  return getAgentRunsRepository().markFailed(runId, threadId, error, type, data);
}

export async function markAgentRunCompletedAsync(
  runId: string,
  threadId: string,
  output?: unknown,
  completedAt?: Date,
): Promise<AgentRun | null> {
  return getAgentRunsRepository().markCompleted(runId, threadId, output, completedAt);
}

export async function markAgentRunCancelledAsync(
  runId: string,
  threadId: string,
  data?: unknown,
): Promise<AgentRun | null> {
  return getAgentRunsRepository().markCancelled(runId, threadId, data);
}

export async function listAgentRunsForThreadAsync(
  threadId: string,
  limit?: number,
): Promise<AgentRun[]> {
  return getAgentRunsRepository().listForThread(threadId, limit);
}

export async function listAgentRunEventsAsync(runId: string): Promise<AgentRunEvent[]> {
  return getAgentRunsRepository().listEvents(runId);
}

export async function listAgentRunsForTraceAsync(traceId: string): Promise<AgentRun[]> {
  return getAgentRunsRepository().listForTrace(traceId);
}

export async function listAgentRunEventsForTraceAsync(traceId: string): Promise<AgentRunEvent[]> {
  return getAgentRunsRepository().listEventsForTrace(traceId);
}
