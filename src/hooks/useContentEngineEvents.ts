import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";

/**
 * Subscribe to the content-engine SSE stream for a brand and invalidate the
 * relevant React Query caches in real time. Replaces the previous
 * polling-based "is the CT still advancing?" loop — the agent can now flip
 * a CT from Draft to Pending Media (or any other transition) and the open
 * tab will reflect it within ~one network round-trip.
 *
 * The hook keeps a single EventSource open per (slug, mounted hook). Pages
 * that mount it on layout level get coverage for every CT they render.
 */
export function useContentEngineEvents(slug: string | null) {
  const qc = useQueryClient();
  const slugRef = useRef(slug);
  slugRef.current = slug;

  useEffect(() => {
    if (!slug) return;
    if (typeof window === "undefined") return;
    if (typeof EventSource === "undefined") return;

    const url = `/api/content-engine/events?slug=${encodeURIComponent(slug)}`;
    const es = new EventSource(url);

    const onContentTaskUpdated = (ev: MessageEvent) => {
      try {
        const data = JSON.parse(ev.data) as {
          slug: string;
          parentTaskId: string;
          contentTaskId: string;
        };
        // Invalidate both the single-CT and parent list queries so anything
        // visible (stepper button, kanban card, etc) refetches on the next
        // tick. Cheap — React Query batches downstream refetches.
        qc.invalidateQueries({
          queryKey: ["content-task", data.slug, data.parentTaskId, data.contentTaskId],
        });
        qc.invalidateQueries({
          queryKey: ["content-tasks", data.slug, data.parentTaskId],
        });
      } catch {
        /* malformed event — ignore */
      }
    };

    const onContentTaskListChanged = (ev: MessageEvent) => {
      try {
        const data = JSON.parse(ev.data) as {
          slug: string;
          parentTaskId: string;
        };
        qc.invalidateQueries({
          queryKey: ["content-tasks", data.slug, data.parentTaskId],
        });
      } catch {
        /* ignore */
      }
    };

    const onDraftUpdated = (ev: MessageEvent) => {
      try {
        const data = JSON.parse(ev.data) as {
          slug: string;
          ideaId: string;
          channel: string;
        };
        qc.invalidateQueries({
          queryKey: ["draft", data.slug, data.ideaId, data.channel],
        });
        qc.invalidateQueries({
          queryKey: ["drafts", data.slug, data.ideaId],
        });
      } catch {
        /* ignore */
      }
    };

    es.addEventListener("content-task-updated", onContentTaskUpdated);
    es.addEventListener("content-task-list-changed", onContentTaskListChanged);
    es.addEventListener("draft-updated", onDraftUpdated);

    // No-op on error — EventSource auto-reconnects with backoff. The visible
    // symptom of a broken stream is just slower invalidation; the existing
    // polling fallback in useContentTask keeps things consistent eventually.
    return () => {
      es.removeEventListener("content-task-updated", onContentTaskUpdated);
      es.removeEventListener("content-task-list-changed", onContentTaskListChanged);
      es.removeEventListener("draft-updated", onDraftUpdated);
      es.close();
    };
  }, [slug, qc]);
}
