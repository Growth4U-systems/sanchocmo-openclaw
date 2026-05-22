/**
 * mc-chat error tracker
 *
 * In-memory cache that remembers the most recent classified error per agent so
 * the deliver callback can correlate a watchdog_abort with the agent's last
 * real failure (e.g. "session timed out — last seen rate_limit").
 *
 * - Single entry per agent (latest record wins).
 * - TTL: 15 minutes by default.
 * - Bounded to `maxEntries` (default 50); on insert evict the entry with the
 *   oldest `recordedAt` timestamp.
 * - No persistence. Cleared on process restart — correlation is best-effort.
 *
 * The factory accepts a `now` function so tests can drive time deterministically.
 */

const DEFAULT_TTL_MS = 15 * 60 * 1000;
const DEFAULT_MAX_ENTRIES = 50;

export function createErrorTracker(options = {}) {
  const ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
  const maxEntries = options.maxEntries ?? DEFAULT_MAX_ENTRIES;
  const now = options.now ?? Date.now;

  /** @type {Map<string, { detail: object, recordedAt: number }>} */
  const store = new Map();

  function evictIfNeeded() {
    if (store.size <= maxEntries) return;
    let oldestKey = null;
    let oldestAt = Infinity;
    for (const [k, v] of store) {
      if (v.recordedAt < oldestAt) {
        oldestAt = v.recordedAt;
        oldestKey = k;
      }
    }
    if (oldestKey !== null) store.delete(oldestKey);
  }

  function record(agentId, detail) {
    if (!agentId || !detail) return;
    store.set(agentId, { detail, recordedAt: now() });
    evictIfNeeded();
  }

  function getRecent(agentId, withinMs = ttlMs) {
    const entry = store.get(agentId);
    if (!entry) return null;
    if (now() - entry.recordedAt > withinMs) return null;
    return entry.detail;
  }

  return { record, getRecent };
}

// Singleton used by the plugin runtime. Tests should create their own via the
// factory so they can inject a fake clock.
export const errorTracker = createErrorTracker();
