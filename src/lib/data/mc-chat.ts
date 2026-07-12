import fs from "fs";
import path from "path";
import { BASE, chatReadStateFile } from "./paths";
import { readJSON, writeJSON } from "./json-io";
import { sanitizeShortId } from "../thread-id";
import {
  normalizeThreadRouting,
  type ThreadRouting,
} from "../runtime/agent-execution-policy";

/**
 * MC-Chat state management — ported from mc-server.js in-memory state.
 * In-memory caches for status updates and cancelled threads.
 */

// In-memory status cache (status updates don't persist to disk)
const statusCache = new Map<string, { text: string; agent?: string; ts: number }>();
const cancelledThreads = new Map<string, number>();

export function getStatusEntry(threadId: string) {
  return statusCache.get(threadId) || null;
}

export function setStatusEntry(threadId: string, data: { text: string; agent?: string; ts: number }) {
  statusCache.set(threadId, data);
}

export function clearStatus(threadId: string) {
  statusCache.delete(threadId);
}

export function markCancelled(threadId: string, cancelledAt = Date.now()) {
  cancelledThreads.set(threadId, cancelledAt);
}

interface MessageForCancellation {
  role: string;
  ts?: number;
}

export function consumeCancelled(
  threadId: string,
  messages: readonly MessageForCancellation[] = [],
): boolean {
  const cancelledAt = cancelledThreads.get(threadId);
  if (cancelledAt === undefined) return false;

  // A cancel marker is meant to suppress the in-flight reply that was stopped.
  // If the user has already sent a newer message, don't let a stale cancel flag
  // eat the next valid answer.
  const hasNewerUserMessage = messages.some((m) => m.role === "user" && (m.ts ?? 0) > cancelledAt);
  cancelledThreads.delete(threadId);
  if (hasNewerUserMessage) {
    return false;
  }
  return true;
}

// Backward-compatible shims for older code paths. New outbound/runtime code
// should use `getRuntime().messaging` instead.
export {
  getChatSecret,
  getGatewayUrl,
} from "@/lib/runtime/adapters/openclaw/messaging";

// Attachment type for chat messages
export interface ChatAttachment {
  url: string;
  filename: string;
  mimeType: string;
  size: number;
}

// ---------------------------------------------------------------------------
// Structured error detail — set by the mc-chat plugin's error-rewriter when
// an upstream runtime error (rate limit, missing auth, watchdog abort, …) is
// detected. The user-facing `text` of the bot message is rewritten to a clear
// Spanish summary; this field carries the raw payload + classification so the
// UI can open a modal with the full technical detail.
// ---------------------------------------------------------------------------
export type ErrorCategory =
  | "insufficient_quota"
  | "anthropic_billing"
  | "rate_limit"
  | "auth"
  | "missing_context"
  | "context_overflow"
  | "invalid_thinking_signature"
  | "watchdog_abort"
  | "model_unavailable"
  | "session_concurrency"
  | "cost_guard"
  | "network";

export interface ErrorDetail {
  category: ErrorCategory;
  raw: string;
  provider?: string;
  account?: string;
  model?: string;
  authMode?: string;
  anthropicAuthMode?: string;
  classifiedAt: number;
  correlatedWith?: ErrorCategory;
}

export interface WorkflowJobEvent {
  jobId: string;
  type: string;
  status: "completed" | "failed";
  workflowStatus?: string;
  command?: string;
  campaignId?: string;
  runId?: string;
  summary?: string;
  errorMessage?: string;
  batch?: {
    itemCount: number;
    sample: Array<{ leadId?: string; messageBody: string }>;
  };
  stats?: {
    found: number;
    enriched: number;
    usable: number;
    totalAvailable: number | null;
    truncated: boolean;
    hasMore?: boolean;
    nextPage?: number | null;
  };
}

const VALID_CATEGORIES: ReadonlySet<ErrorCategory> = new Set([
  "insufficient_quota",
  "anthropic_billing",
  "rate_limit",
  "auth",
  "missing_context",
  "context_overflow",
  "invalid_thinking_signature",
  "watchdog_abort",
  "model_unavailable",
  "session_concurrency",
  "cost_guard",
  "network",
]);
const MAX_RAW_LEN = 4096;

// Defensive normalizer used by the webhook. Returns `undefined` for any input
// that doesn't match the contract — never throws — so a malformed errorDetail
// never blocks the bot message itself from being persisted.
export function normalizeErrorDetail(input: unknown): ErrorDetail | undefined {
  if (!input || typeof input !== "object") return undefined;
  const v = input as Record<string, unknown>;
  if (typeof v.category !== "string" || !VALID_CATEGORIES.has(v.category as ErrorCategory)) {
    return undefined;
  }
  if (typeof v.raw !== "string") return undefined;
  const raw = v.raw.length > MAX_RAW_LEN ? v.raw.slice(0, MAX_RAW_LEN) + "…" : v.raw;
  const out: ErrorDetail = {
    category: v.category as ErrorCategory,
    raw,
    classifiedAt: typeof v.classifiedAt === "number" ? v.classifiedAt : Date.now(),
  };
  if (typeof v.provider === "string") out.provider = v.provider.slice(0, 64);
  if (typeof v.account === "string") out.account = v.account.slice(0, 128);
  if (typeof v.model === "string") out.model = v.model.slice(0, 64);
  if (typeof v.authMode === "string") out.authMode = v.authMode.slice(0, 32);
  if (typeof v.anthropicAuthMode === "string") out.anthropicAuthMode = v.anthropicAuthMode.slice(0, 32);
  if (
    typeof v.correlatedWith === "string" &&
    VALID_CATEGORIES.has(v.correlatedWith as ErrorCategory)
  ) {
    out.correlatedWith = v.correlatedWith as ErrorCategory;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Progress events — granular updates emitted by the gateway during a turn
// (tool calls, file writes, sub-agent handoffs, etc.). Accumulate in
// `pendingProgress` while the agent is working, then get sealed into the
// bot message's `progress` field when the final reply arrives.
// ---------------------------------------------------------------------------

export type ProgressKind =
  | "thinking"
  | "tool_call"
  | "file_write"
  | "agent_handoff"
  | "search"
  | "read";

export interface ProgressEvent {
  kind: ProgressKind;
  label: string;
  detail?: string;
  target?: string;
  agent?: string;
  ts: number;
}

const MAX_PENDING_PROGRESS = 200;
const MAX_SEALED_PROGRESS = 50;

// Thread persistence (disk-based, same as legacy)
// role can be "user" | "bot" | "status" | "system" | "workflow" | "handoff". When role === "handoff",
// `from_agent` and `to_agent` carry the source/target agent slugs and `text` is the reason.
export interface ThreadData {
  messages: {
    role: string;
    text: string;
    ts: number;
    agent?: string;
    attachments?: ChatAttachment[];
    progress?: ProgressEvent[];
    from_agent?: string;
    to_agent?: string;
    errorDetail?: ErrorDetail;
    workflowJob?: WorkflowJobEvent;
  }[];
  discordThreadId?: string;
  discordChannelId?: string;
  updatedAt?: number;
  pendingProgress?: ProgressEvent[];
  /** Durable agent route. Skills remain hints; no active skill is persisted. */
  routing?: ThreadRouting;
}

function threadFile(threadId: string): string {
  const colonIdx = threadId.indexOf(":");
  if (colonIdx < 0) return path.join(BASE, "brand", threadId, "chat", "general.json");
  const slug = threadId.slice(0, colonIdx);
  const shortId = threadId.slice(colonIdx + 1);
  // Sanitize shortId for filesystem — shared with the client via thread-id.ts
  // so the id the client registers matches the one we persist/list (SAN-193).
  const safeId = sanitizeShortId(shortId);
  const chatDir = path.join(BASE, "brand", slug, "chat");
  return path.join(chatDir, `${safeId}.json`);
}

export function getThread(threadId: string): ThreadData {
  return readJSON<ThreadData>(threadFile(threadId), { messages: [] });
}

export function saveThread(threadId: string, data: ThreadData) {
  writeJSON(threadFile(threadId), data);
}

export function getThreadRouting(threadId: string): ThreadRouting | undefined {
  return normalizeThreadRouting(getThread(threadId).routing);
}

export function setThreadRouting(threadId: string, routing: ThreadRouting) {
  const thread = getThread(threadId);
  thread.routing = normalizeThreadRouting(routing);
  saveThread(threadId, thread);
}

export function addMessage(
  threadId: string,
  role: string,
  text: string,
  agent?: string,
  attachments?: ChatAttachment[],
  progress?: ProgressEvent[],
  fromAgent?: string,
  toAgent?: string,
  errorDetail?: ErrorDetail,
) {
  if (role === "handoff" && (!fromAgent || !toAgent)) {
    throw new Error("addMessage: role 'handoff' requires both fromAgent and toAgent");
  }
  const thread = getThread(threadId);
  const sealed = progress?.length ? progress.slice(-MAX_SEALED_PROGRESS) : undefined;
  thread.messages.push({
    role,
    text,
    ts: Date.now(),
    agent,
    attachments: attachments?.length ? attachments : undefined,
    progress: sealed,
    from_agent: fromAgent,
    to_agent: toAgent,
    errorDetail,
  });
  // Cap messages at 200
  if (thread.messages.length > 200) {
    thread.messages = thread.messages.slice(-200);
  }
  thread.updatedAt = Date.now();
  saveThread(threadId, thread);
}

/**
 * Persist one visible result per asynchronous workflow job. Callback retries
 * update the same entry instead of adding chat turns, and no model is involved.
 */
export function upsertWorkflowJobMessage(
  threadId: string,
  text: string,
  workflowJob: WorkflowJobEvent,
  agent?: string,
) {
  const thread = getThread(threadId);
  const isCampaignWorkflow = workflowJob.type.startsWith("campaign.workflow.") && Boolean(workflowJob.runId);
  if (isCampaignWorkflow) {
    const existing = thread.messages.find(
      (message) => message.role === "workflow" && (
        message.workflowJob?.jobId === workflowJob.jobId
        || (
          message.workflowJob?.type.startsWith("campaign.workflow.")
          && message.workflowJob.runId === workflowJob.runId
        )
      ),
    );
    thread.messages = thread.messages.filter(
      (message) => !(
        message.role === "workflow"
        && (
          message.workflowJob?.jobId === workflowJob.jobId
          || (
            message.workflowJob?.type.startsWith("campaign.workflow.")
            && message.workflowJob.runId === workflowJob.runId
          )
        )
      ),
    );
    const now = Date.now();
    thread.messages.push({ role: "workflow", text, ts: existing?.ts ?? now, agent, workflowJob });
    if (thread.messages.length > 200) thread.messages = thread.messages.slice(-200);
    thread.updatedAt = now;
    saveThread(threadId, thread);
    return;
  }
  const existingIndex = thread.messages.findIndex(
    (message) => message.workflowJob?.jobId === workflowJob.jobId,
  );
  const now = Date.now();
  const message = {
    role: "workflow",
    text,
    ts: existingIndex >= 0 ? thread.messages[existingIndex].ts : now,
    agent,
    workflowJob,
  };

  if (existingIndex >= 0) {
    thread.messages[existingIndex] = message;
  } else {
    thread.messages.push(message);
  }
  if (thread.messages.length > 200) {
    thread.messages = thread.messages.slice(-200);
  }
  thread.updatedAt = now;
  saveThread(threadId, thread);
}

// ---------------------------------------------------------------------------
// Stale-watchdog guard
//
// The openclaw runtime occasionally emits a `watchdog_abort` deliver right
// after the agent has already produced its real reply (20ms gap observed in
// production on 2026-05-22). The watchdog hint is meaningless in that case —
// the work succeeded. This helper lets the webhook drop such a message when
// the same thread already received a successful bot reply within the window.
// ---------------------------------------------------------------------------

interface MessageForSuppression {
  role: string;
  ts?: number;
  errorDetail?: ErrorDetail;
}

export function isStaleWatchdogAfterRecentSuccess(
  messages: readonly MessageForSuppression[],
  now: number,
  windowMs: number,
): boolean {
  // Walk backwards to the most recent bot message (ignore user/system/handoff).
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role !== "bot") continue;
    if (m.errorDetail) return false;
    return now - (m.ts ?? 0) <= windowMs;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Progress accumulator — pendingProgress lives in the thread file so it
// survives Next.js process restarts and is visible to all polling clients.
// ---------------------------------------------------------------------------

export function appendProgress(threadId: string, event: ProgressEvent) {
  const thread = getThread(threadId);
  const list = thread.pendingProgress ?? [];
  list.push(event);
  if (list.length > MAX_PENDING_PROGRESS) {
    list.splice(0, list.length - MAX_PENDING_PROGRESS);
  }
  thread.pendingProgress = list;
  thread.updatedAt = Date.now();
  saveThread(threadId, thread);
}

export function getPendingProgress(threadId: string): ProgressEvent[] {
  return getThread(threadId).pendingProgress ?? [];
}

/** Returns the accumulated events and clears them from disk. */
export function sealProgress(threadId: string): ProgressEvent[] {
  const thread = getThread(threadId);
  const list = thread.pendingProgress ?? [];
  if (list.length === 0) return [];
  thread.pendingProgress = [];
  saveThread(threadId, thread);
  return list;
}

export function clearProgress(threadId: string) {
  const thread = getThread(threadId);
  if (!thread.pendingProgress?.length) return;
  thread.pendingProgress = [];
  saveThread(threadId, thread);
}

// ---------------------------------------------------------------------------
// Read-state helpers
// ---------------------------------------------------------------------------

type ReadStateMap = Record<string, { lastReadTs: number }>;

export function getReadState(slug: string): ReadStateMap {
  return readJSON<ReadStateMap>(chatReadStateFile(slug), {});
}

export function markThreadRead(slug: string, shortId: string) {
  const state = getReadState(slug);
  state[shortId] = { lastReadTs: Date.now() };
  writeJSON(chatReadStateFile(slug), state);
}

/** Return the epoch-ms ts of the last bot/assistant message, or null. */
function getLastBotTs(messages: { role: string; ts: string | number }[]): number | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role !== "user") {
      const raw = messages[i].ts;
      if (!raw) return null;
      // ts can be ISO string or epoch number
      return typeof raw === "number" ? raw : new Date(raw).getTime();
    }
  }
  return null;
}

export function listThreadsForSlug(slug: string) {
  const chatDir = path.join(BASE, "brand", slug, "chat");
  const threads: unknown[] = [];
  const readState = getReadState(slug);

  try {
    if (!fs.existsSync(chatDir)) return threads;
    for (const f of fs.readdirSync(chatDir).filter((f) => f.endsWith(".json") && !f.startsWith("_"))) {
      try {
        const data = JSON.parse(fs.readFileSync(path.join(chatDir, f), "utf-8"));
        const shortId = f.replace(".json", "");
        const tid = slug + ":" + shortId;
        const msgs = data.messages || [];
        const last = msgs[msgs.length - 1];
        const lastBotTs = getLastBotTs(msgs);
        const lastReadTs = readState[shortId]?.lastReadTs ?? 0;
        const hasUnread = lastBotTs !== null && lastBotTs > lastReadTs;
        threads.push({
          id: tid,
          shortId,
          name: shortId.replace(/-/g, " "),
          messageCount: msgs.length,
          updatedAt: data.updatedAt || 0,
          lastMessage: last
            ? { role: last.role, text: (last.text || "").slice(0, 80), ts: last.ts }
            : null,
          hasUnread,
          lastBotTs,
          routing: normalizeThreadRouting(data.routing),
        });
      } catch {
        // skip invalid files
      }
    }
  } catch {
    // dir doesn't exist
  }

  // Sort: general first, then unread (by lastBotTs desc), then read (by updatedAt desc)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  threads.sort((a: any, b: any) => {
    if (a.shortId === "general") return -1;
    if (b.shortId === "general") return 1;
    if (a.hasUnread && !b.hasUnread) return -1;
    if (!a.hasUnread && b.hasUnread) return 1;
    if (a.hasUnread && b.hasUnread) return (b.lastBotTs || 0) - (a.lastBotTs || 0);
    return (b.updatedAt || 0) - (a.updatedAt || 0);
  });
  return threads;
}
