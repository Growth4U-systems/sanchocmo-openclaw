import crypto from "crypto";
import path from "path";
import { BASE } from "./paths";
import { readJSON, writeJSON } from "./json-io";

export type AgentRunStatus = "queued" | "running" | "completed" | "failed" | "cancelled";

export type AgentRunEventType =
  | "run_created"
  | "runtime_dispatched"
  | "runtime_rejected"
  | "runtime_unreachable"
  | "progress"
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
  runtime: string;
  agent?: string;
  /** Legacy-compatible seed; advisory when skillMode is auto. */
  skill?: string;
  skills?: string[];
  skillMode?: "auto" | "pinned";
  status: AgentRunStatus;
  input?: unknown;
  output?: unknown;
  error?: string;
  /** Bounded transport fingerprints used to make terminal callbacks idempotent. */
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
  type: AgentRunEventType;
  ts: string;
  data?: unknown;
}

interface AgentRunsStore {
  runs: AgentRun[];
  events: AgentRunEvent[];
}

export interface CreateAgentRunInput {
  idempotencyKey?: string;
  threadId: string;
  runtime: string;
  agent?: string;
  skill?: string;
  skills?: string[];
  skillMode?: "auto" | "pinned";
  input?: unknown;
  now?: Date;
}

export interface AppendAgentRunEventInput {
  runId: string;
  threadId: string;
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

const MAX_RUNS = 2000;
const MAX_EVENTS = 10000;
const ACTIVE_STATUSES = new Set<AgentRunStatus>(["queued", "running"]);
const TERMINAL_STATUSES = new Set<AgentRunStatus>(["completed", "failed", "cancelled"]);

export function agentRunsFile(): string {
  return path.join(BASE, "_system", "agent-runs.json");
}

function readStore(): AgentRunsStore {
  const store = readJSON<AgentRunsStore>(agentRunsFile(), { runs: [], events: [] });
  return {
    runs: Array.isArray(store.runs) ? store.runs : [],
    events: Array.isArray(store.events) ? store.events : [],
  };
}

function writeStore(store: AgentRunsStore): void {
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
  const now = iso(input.now);
  const run: AgentRun = {
    id: id("run"),
    idempotencyKey: input.idempotencyKey,
    threadId: input.threadId,
    runtime: input.runtime,
    agent: input.agent,
    skill: input.skill,
    skills: input.skills,
    skillMode: input.skillMode,
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
    type: "run_created",
    ts: now,
    data: {
      runtime: run.runtime,
      idempotencyKey: run.idempotencyKey,
      agent: run.agent,
      skill: run.skill,
      skills: run.skills,
      skillMode: run.skillMode,
    },
  });
  writeStore(store);
  return run;
}

export function appendAgentRunEvent(input: AppendAgentRunEventInput): AgentRunEvent {
  const event: AgentRunEvent = {
    id: id("evt"),
    runId: input.runId,
    threadId: input.threadId,
    type: input.type,
    ts: iso(input.now),
    data: input.data,
  };
  const store = readStore();
  store.events.push(event);
  writeStore(store);
  return event;
}

export function updateAgentRun(runId: string, input: UpdateAgentRunInput): AgentRun | null {
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
  if (!runId) return null;
  return readStore().runs.find((run) => run.id === runId) ?? null;
}

export function getAgentRunByIdempotencyKey(
  threadId: string,
  idempotencyKey: string,
): AgentRun | null {
  if (!threadId || !idempotencyKey) return null;
  const runs = readStore().runs;
  for (let i = runs.length - 1; i >= 0; i -= 1) {
    const run = runs[i];
    if (run.threadId === threadId && run.idempotencyKey === idempotencyKey) return run;
  }
  return null;
}

/**
 * Atomically claims a runtime callback fingerprint in the JSON ledger.
 * Returns false when a transport retry already delivered the same callback.
 */
export function claimAgentRunCallbackFingerprint(runId: string, fingerprint: string): boolean {
  if (!runId || !fingerprint) return false;
  const store = readStore();
  const index = store.runs.findIndex((run) => run.id === runId);
  if (index < 0) return false;
  const existing = store.runs[index].callbackFingerprints ?? [];
  if (existing.includes(fingerprint)) return false;
  store.runs[index] = {
    ...store.runs[index],
    callbackFingerprints: [...existing, fingerprint].slice(-100),
  };
  writeStore(store);
  return true;
}

export function getLatestActiveRun(threadId: string): AgentRun | null {
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
): AgentRun | null {
  const current = getAgentRunById(runId);
  if (!current || TERMINAL_STATUSES.has(current.status)) return current;
  const now = new Date();
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
  return readStore().runs.filter((run) => run.threadId === threadId);
}

export function listAgentRunEvents(runId: string): AgentRunEvent[] {
  return readStore().events.filter((event) => event.runId === runId);
}
