const RECENT_DELIVERY_TTL_MS = 2 * 60 * 1000;
const MAX_RECENT_DELIVERIES = 500;

const recentVisibleDeliveries = new Map();

export function canonicalThreadKey(slug, threadId) {
  const safeSlug = typeof slug === "string" && slug.trim() ? slug.trim() : "default";
  const safeThreadId = typeof threadId === "string" && threadId.trim() ? threadId.trim() : "general";
  return safeThreadId.startsWith(`${safeSlug}:`) ? safeThreadId : `${safeSlug}:${safeThreadId}`;
}

function prune(now) {
  for (const [key, ts] of recentVisibleDeliveries.entries()) {
    if (now - ts > RECENT_DELIVERY_TTL_MS) recentVisibleDeliveries.delete(key);
  }
  while (recentVisibleDeliveries.size > MAX_RECENT_DELIVERIES) {
    const oldest = recentVisibleDeliveries.keys().next().value;
    if (!oldest) break;
    recentVisibleDeliveries.delete(oldest);
  }
}

export function markVisibleDelivery(slug, threadId, now = Date.now()) {
  prune(now);
  recentVisibleDeliveries.set(canonicalThreadKey(slug, threadId), now);
}

export function hasRecentVisibleDelivery(slug, threadId, sinceMs, now = Date.now()) {
  prune(now);
  const ts = recentVisibleDeliveries.get(canonicalThreadKey(slug, threadId));
  return typeof ts === "number" && ts >= sinceMs;
}

export function resetVisibleDeliveriesForTest() {
  recentVisibleDeliveries.clear();
}
