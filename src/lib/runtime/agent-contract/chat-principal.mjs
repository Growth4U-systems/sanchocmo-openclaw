const SAFE_SENDER_ID_RE = /^[a-z0-9][a-z0-9._:@-]{0,127}$/i;

function clientFallback(slug) {
  const safeSlug = typeof slug === "string" && slug.trim() ? slug.trim() : "default";
  return `mc-client-${safeSlug}`;
}

/**
 * Resolve the only sender id that may cross the runtime tool boundary.
 * Browser JSON never chooses its identity. Trusted runtime follow-ups may
 * preserve a Discord/client id, but can never claim the reserved admin id.
 * @param {{ trustedRuntimeRequest?: boolean, isAdmin?: boolean, slug?: string, claimedUserId?: unknown }} input
 * @returns {string}
 */
export function resolveChatUserId({
  trustedRuntimeRequest = false,
  isAdmin = false,
  slug,
  claimedUserId,
} = {}) {
  if (isAdmin === true) return "mc-admin";
  const fallback = clientFallback(slug);
  if (trustedRuntimeRequest !== true || typeof claimedUserId !== "string") return fallback;

  const candidate = claimedUserId.trim();
  if (!SAFE_SENDER_ID_RE.test(candidate) || candidate.toLowerCase() === "mc-admin") {
    return fallback;
  }
  return candidate;
}
