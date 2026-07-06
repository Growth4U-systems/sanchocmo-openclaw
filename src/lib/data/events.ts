/**
 * In-process pub/sub for content-task / content-engine state changes.
 *
 * Used by the SSE endpoint at `/api/content-engine/events` to push updates to
 * the frontend the moment a mutator writes them, eliminating the polling
 * window where the UI shows stale state (e.g. a "Aprobar texto" button right
 * after the agent advanced the CT to Pending Media).
 *
 * Topic = brand slug. Subscribers receive *every* event under that slug; the
 * client decides what to invalidate. Keeping the topic coarse avoids
 * subscription churn when the user navigates between CTs.
 */

export type ContentEngineEvent =
  | {
      type: "content-task-updated";
      slug: string;
      parentTaskId: string;
      contentTaskId: string;
    }
  | {
      type: "content-task-list-changed";
      slug: string;
      parentTaskId: string;
    }
  | {
      type: "draft-updated";
      slug: string;
      ideaId: string;
      channel: string;
    };

type Subscriber = (event: ContentEngineEvent) => void;

// Survive Next.js HMR by hanging the registry off globalThis. Without this,
// every dev hot reload spawns a fresh map and existing SSE clients silently
// stop receiving events from mutator modules that loaded later.
const GLOBAL_KEY = "__mc_content_engine_events__";
type Registry = Map<string, Set<Subscriber>>;
function getRegistry(): Registry {
  const g = globalThis as unknown as Record<string, Registry | undefined>;
  if (!g[GLOBAL_KEY]) g[GLOBAL_KEY] = new Map();
  return g[GLOBAL_KEY]!;
}

export function subscribe(slug: string, onEvent: Subscriber): () => void {
  const registry = getRegistry();
  let set = registry.get(slug);
  if (!set) {
    set = new Set();
    registry.set(slug, set);
  }
  set.add(onEvent);
  return () => {
    const s = registry.get(slug);
    if (!s) return;
    s.delete(onEvent);
    if (s.size === 0) registry.delete(slug);
  };
}

export function publish(event: ContentEngineEvent): void {
  const set = getRegistry().get(event.slug);
  if (!set) return;
  // Snapshot to a list — subscribers may unsubscribe synchronously and
  // mutating the set during iteration would skip handlers.
  for (const handler of [...set]) {
    try {
      handler(event);
    } catch {
      // Subscriber errors must never affect the mutator that triggered the
      // publish. Drop silently — the SSE endpoint handles its own teardown.
    }
  }
}
