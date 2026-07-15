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

export interface GrowieSupportContext {
  pagePath?: string;
  deployedCommit?: string;
  imageDigest?: string;
  environment?: string;
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
