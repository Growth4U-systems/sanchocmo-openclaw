import { canonicalThreadId, parseThreadId } from "@/lib/thread-id";

export const GROWIE_SUPPORT_THREAD_PREFIX = "support-growie-";
export const GROWIE_SUPPORT_SOURCE = "growie-support";

export interface GrowieSupportContext {
  pagePath?: string;
  deployedCommit?: string;
  imageDigest?: string;
  environment?: string;
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
