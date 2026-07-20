import { canonicalThreadId, parseThreadId } from "@/lib/thread-id";

export const GROWIE_SUPPORT_THREAD_PREFIX = "support-growie-";
export const GROWIE_SUPPORT_SOURCE = "growie-support";
export const GROWIE_HISTORY_MAX_MESSAGES = 32;
export const GROWIE_HISTORY_MAX_TEXT_CHARS = 24_000;

const GROWIE_HISTORY_MAX_MESSAGE_CHARS = 4_000;
const GROWIE_HISTORY_ROLES = new Set(["user", "bot", "system"]);

export interface GrowieThreadHistoryAttachment {
  url: string;
  filename: string;
  mimeType: string;
  size: number;
}

export interface GrowieThreadHistoryMessage {
  role: "user" | "bot" | "system";
  text: string;
  ts?: number;
  agent?: string;
  attachments?: GrowieThreadHistoryAttachment[];
}

interface GrowieThreadHistorySourceMessage {
  role?: unknown;
  text?: unknown;
  ts?: unknown;
  agent?: unknown;
  attachments?: unknown;
}

export const GROWIE_RECENT_THREADS_MAX = 12;
export const GROWIE_RECENT_RUNS_MAX = 20;
export const GROWIE_RUN_TRACE_MAX_EVENTS = 30;
export const GROWIE_DOC_EXCERPT_MAX_CHARS = 6_000;

const GROWIE_THREAD_PREVIEW_MAX_CHARS = 160;
const GROWIE_RUN_ERROR_MAX_CHARS = 300;
const GROWIE_RUN_EVENT_DETAIL_MAX_CHARS = 400;

export interface GrowieSupportThreadSummary {
  id: string;
  messageCount?: number;
  updatedAt?: number;
  lastMessage?: { role: string; text: string; ts?: number };
}

export interface GrowieSupportRunSummary {
  id: string;
  threadId: string;
  status: string;
  agent?: string;
  skill?: string;
  runtime?: string;
  error?: string;
  createdAt?: string;
  finishedAt?: string;
}

export interface GrowieSupportRunEvent {
  type: string;
  ts?: string;
  detail?: string;
}

export interface GrowieSupportRunTrace {
  runId: string;
  threadId?: string;
  events: GrowieSupportRunEvent[];
}

export interface GrowieSupportDoc {
  path: string;
  excerpt: string;
  truncated: boolean;
}

export interface GrowieSupportContext {
  pagePath?: string;
  deployedCommit?: string;
  imageDigest?: string;
  environment?: string;
  /** Recent Sancho threads in this tenant (the Growie case thread excluded). */
  recentThreads?: GrowieSupportThreadSummary[];
  /** Recent agent runs across those threads — covers every run, ledger or not. */
  recentRuns?: GrowieSupportRunSummary[];
  /** Event trail of the most diagnostic-relevant run (latest failed, else latest). */
  lastRunTrace?: GrowieSupportRunTrace;
  /** Bounded excerpt of the document the user is viewing, tenant-scoped. */
  activeDoc?: GrowieSupportDoc;
}

function normalizeHistoryAttachments(value: unknown): GrowieThreadHistoryAttachment[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const attachments = value.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const attachment = item as Record<string, unknown>;
    if (
      typeof attachment.url !== "string"
      || typeof attachment.filename !== "string"
      || typeof attachment.mimeType !== "string"
      || typeof attachment.size !== "number"
      || !Number.isFinite(attachment.size)
    ) {
      return [];
    }
    return [{
      url: attachment.url.slice(0, 2_048),
      filename: attachment.filename.slice(0, 240),
      mimeType: attachment.mimeType.slice(0, 120),
      size: Math.max(0, attachment.size),
    }];
  }).slice(0, 3);
  return attachments.length > 0 ? attachments : undefined;
}

/**
 * Capture only the bounded, user-visible conversation before the current turn.
 * OpenClaw transcripts include provider-specific thinking and tool traffic, so
 * they are deliberately not a safe source for cross-model history hydration.
 */
export function snapshotGrowieThreadHistory(
  messages: readonly GrowieThreadHistorySourceMessage[],
): GrowieThreadHistoryMessage[] {
  const normalized = messages.flatMap((message) => {
    if (typeof message.role !== "string" || !GROWIE_HISTORY_ROLES.has(message.role)) return [];
    if (typeof message.text !== "string" || !message.text.trim()) return [];
    const role = message.role as GrowieThreadHistoryMessage["role"];
    const agent = typeof message.agent === "string" && message.agent.trim()
      ? message.agent.trim().slice(0, 64)
      : undefined;
    const attachments = normalizeHistoryAttachments(message.attachments);
    return [{
      role,
      text: message.text.trim().slice(0, GROWIE_HISTORY_MAX_MESSAGE_CHARS),
      ...(typeof message.ts === "number" && Number.isFinite(message.ts) ? { ts: message.ts } : {}),
      ...(agent ? { agent } : {}),
      ...(attachments ? { attachments } : {}),
    }];
  });

  const selected: GrowieThreadHistoryMessage[] = [];
  let remainingChars = GROWIE_HISTORY_MAX_TEXT_CHARS;
  for (let index = normalized.length - 1; index >= 0; index -= 1) {
    if (selected.length >= GROWIE_HISTORY_MAX_MESSAGES || remainingChars <= 0) break;
    const message = normalized[index];
    const text = message.text.slice(0, remainingChars);
    if (!text) break;
    selected.unshift({ ...message, text });
    remainingChars -= text.length;
  }
  return selected;
}

/**
 * Support mode is selected by a server-recognised thread namespace, never by
 * a browser-provided `readOnly` or source flag. That makes the safety boundary
 * stable when a request is retried, reopened, or forged from DevTools.
 */
export function isGrowieSupportThreadId(threadId: unknown, expectedSlug?: string): boolean {
  if (typeof threadId !== "string") return false;
  const canonical = canonicalThreadId(threadId);
  const parsed = parseThreadId(canonical);
  if (!parsed) return false;
  if (expectedSlug && parsed.slug !== expectedSlug) return false;
  return parsed.shortId.startsWith(GROWIE_SUPPORT_THREAD_PREFIX);
}

/** Keep only the pathname from Referer. Query values can contain credentials,
 * email addresses, search terms, or other data that should not enter a model
 * prompt merely because the user opened support from that screen. */
export function supportPagePathFromReferrer(referrer: unknown): string | undefined {
  if (typeof referrer !== "string" || !referrer.trim()) return undefined;
  try {
    const pathname = new URL(referrer).pathname;
    if (!pathname.startsWith("/") || pathname.length > 500) return undefined;
    return pathname;
  } catch {
    return undefined;
  }
}

function boundedString(value: unknown, max: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const clean = value.trim();
  return clean ? clean.slice(0, max) : undefined;
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

/**
 * Normalize the thread index (listThreadsForSlug output) into bounded
 * diagnostic evidence. Growie's own support threads are excluded: the case
 * history already travels as priorThreadMessages, and echoing other open
 * support cases would leak unrelated complaints between conversations.
 */
export function snapshotGrowieRecentThreads(
  threads: readonly unknown[],
): GrowieSupportThreadSummary[] {
  if (!Array.isArray(threads)) return [];
  const normalized = threads.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const thread = item as Record<string, unknown>;
    const id = boundedString(thread.id, 200);
    if (!id || isGrowieSupportThreadId(id)) return [];
    const last = thread.lastMessage && typeof thread.lastMessage === "object"
      ? thread.lastMessage as Record<string, unknown>
      : undefined;
    const lastRole = boundedString(last?.role, 24);
    const lastText = boundedString(last?.text, GROWIE_THREAD_PREVIEW_MAX_CHARS);
    return [{
      id,
      ...(finiteNumber(thread.messageCount) !== undefined
        ? { messageCount: finiteNumber(thread.messageCount) }
        : {}),
      ...(finiteNumber(thread.updatedAt) !== undefined
        ? { updatedAt: finiteNumber(thread.updatedAt) }
        : {}),
      ...(lastRole && lastText
        ? {
            lastMessage: {
              role: lastRole,
              text: lastText,
              ...(finiteNumber(last?.ts) !== undefined ? { ts: finiteNumber(last?.ts) } : {}),
            },
          }
        : {}),
    }];
  });
  normalized.sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
  return normalized.slice(0, GROWIE_RECENT_THREADS_MAX);
}

/**
 * Normalize agent runs (from agent_runs — present for EVERY chat dispatch,
 * durable-ledger or not) into bounded diagnostic evidence, newest first.
 */
export function snapshotGrowieRecentRuns(runs: readonly unknown[]): GrowieSupportRunSummary[] {
  if (!Array.isArray(runs)) return [];
  const normalized = runs.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const run = item as Record<string, unknown>;
    const id = boundedString(run.id, 120);
    const threadId = boundedString(run.threadId, 200);
    const status = boundedString(run.status, 32);
    if (!id || !threadId || !status || isGrowieSupportThreadId(threadId)) return [];
    return [{
      id,
      threadId,
      status,
      ...(boundedString(run.agent, 64) ? { agent: boundedString(run.agent, 64) } : {}),
      ...(boundedString(run.skill, 80) ? { skill: boundedString(run.skill, 80) } : {}),
      ...(boundedString(run.runtime, 40) ? { runtime: boundedString(run.runtime, 40) } : {}),
      ...(boundedString(run.error, GROWIE_RUN_ERROR_MAX_CHARS)
        ? { error: boundedString(run.error, GROWIE_RUN_ERROR_MAX_CHARS) }
        : {}),
      ...(boundedString(run.createdAt, 40) ? { createdAt: boundedString(run.createdAt, 40) } : {}),
      ...(boundedString(run.finishedAt, 40) ? { finishedAt: boundedString(run.finishedAt, 40) } : {}),
    }];
  });
  normalized.sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
  return normalized.slice(0, GROWIE_RECENT_RUNS_MAX);
}

/** Bounded event trail for one run. Keeps the newest events when over cap. */
export function snapshotGrowieRunTrace(
  runId: unknown,
  threadId: unknown,
  events: readonly unknown[],
): GrowieSupportRunTrace | undefined {
  const id = boundedString(runId, 120);
  if (!id || !Array.isArray(events)) return undefined;
  const normalized = events.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const event = item as Record<string, unknown>;
    const type = boundedString(event.type, 48);
    if (!type) return [];
    let detail: string | undefined;
    if (event.data !== undefined && event.data !== null) {
      try {
        const raw = typeof event.data === "string" ? event.data : JSON.stringify(event.data);
        detail = boundedString(raw, GROWIE_RUN_EVENT_DETAIL_MAX_CHARS);
      } catch {
        detail = undefined;
      }
    }
    return [{
      type,
      ...(boundedString(event.ts, 40) ? { ts: boundedString(event.ts, 40) } : {}),
      ...(detail ? { detail } : {}),
    }];
  });
  return {
    runId: id,
    ...(boundedString(threadId, 200) ? { threadId: boundedString(threadId, 200) } : {}),
    events: normalized.slice(-GROWIE_RUN_TRACE_MAX_EVENTS),
  };
}

/**
 * Extract the workspace doc path from a dashboard docs route for THIS tenant.
 * Any other route shape (or another slug's docs) yields undefined — the doc
 * read stays scoped to the tenant the support case belongs to.
 */
export function growieDocPathFromPagePath(pagePath: unknown, slug: string): string | undefined {
  if (typeof pagePath !== "string" || !slug) return undefined;
  const prefix = `/dashboard/${slug}/docs/`;
  if (!pagePath.startsWith(prefix)) return undefined;
  const rest = pagePath.slice(prefix.length);
  if (!rest || rest.length > 500) return undefined;
  let decoded: string;
  try {
    decoded = rest.split("/").map((part) => decodeURIComponent(part)).join("/");
  } catch {
    return undefined;
  }
  if (decoded.split("/").some((part) => part === ".." || part === "." || !part)) return undefined;
  return decoded;
}

/** Bounded excerpt of a document body; flags truncation instead of hiding it. */
export function buildGrowieSupportDoc(docPath: string, content: string): GrowieSupportDoc | undefined {
  const path = boundedString(docPath, 500);
  if (!path || typeof content !== "string") return undefined;
  const truncated = content.length > GROWIE_DOC_EXCERPT_MAX_CHARS;
  return {
    path,
    excerpt: content.slice(0, GROWIE_DOC_EXCERPT_MAX_CHARS),
    truncated,
  };
}

export function buildGrowieSupportContext(input: {
  referrer?: unknown;
  deployedCommit?: unknown;
  imageDigest?: unknown;
  environment?: unknown;
}): GrowieSupportContext {
  const pagePath = supportPagePathFromReferrer(input.referrer);
  const bounded = (value: unknown, max: number): string | undefined => {
    if (typeof value !== "string") return undefined;
    const clean = value.trim();
    return clean ? clean.slice(0, max) : undefined;
  };

  return {
    ...(pagePath ? { pagePath } : {}),
    ...(bounded(input.deployedCommit, 80)
      ? { deployedCommit: bounded(input.deployedCommit, 80) }
      : {}),
    ...(bounded(input.imageDigest, 200)
      ? { imageDigest: bounded(input.imageDigest, 200) }
      : {}),
    ...(bounded(input.environment, 80)
      ? { environment: bounded(input.environment, 80) }
      : {}),
  };
}
