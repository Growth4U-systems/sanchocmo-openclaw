import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { MediaAsset, PostMetricsSnapshot } from "@/lib/data/drafts";

export interface CalendarEvent {
  ideaId: string;
  contentTaskId: string;
  parentTaskId: string;
  channel: string;
  scheduled_at: string;
  status: "scheduled" | "publishing" | "published" | "failed" | "canceled";
  provider: string;
  external_url?: string | null;
  external_job_id?: string;
  title: string;
  hero_media_url?: string;
  body: string;
  media: MediaAsset[];
  metrics?: PostMetricsSnapshot;
  /** Drift watchdog flag: set by the API when a scheduled event is past-due
   *  without confirmation from the provider. Drives the alarm visual in the
   *  Posting Calendar (see PostingCalendarTab UNCONFIRMED_VISUAL). */
  unconfirmed_drift?: boolean;
}

export interface ReadyDraft {
  ideaId: string;
  contentTaskId: string;
  parentTaskId: string;
  channel: string;
  title: string;
  pillar_id?: string;
  ready_at: string;
  hero_media_url?: string;
  has_media: boolean;
  body: string;
  media: MediaAsset[];
  /** Per-channel media requirement: `"required"` blocks publishing without media. */
  media_policy?: "required" | "optional";
}

export interface CalendarPayload {
  scheduled: CalendarEvent[];
  ready_queue: ReadyDraft[];
}

/**
 * Fetches both buckets that the Posting Calendar tab renders:
 *   - `scheduled`: per-channel drafts with a `scheduled_at` in [from, to]
 *   - `ready_queue`: drafts with CT.status === "Ready" and no scheduled_at
 *
 * The endpoint reads from disk on each call (drafts + tasks.json) so the
 * `staleTime: 0` keeps the UI honest after a publish/cancel mutation.
 */
export function usePostingCalendar(
  slug: string | null,
  fromIso: string,
  toIso: string,
) {
  return useQuery<CalendarPayload>({
    queryKey: ["posting-calendar", slug, fromIso, toIso],
    queryFn: async () => {
      const qs = new URLSearchParams({ slug: slug!, from: fromIso, to: toIso });
      const res = await fetch(`/api/content-engine/calendar?${qs}`);
      if (!res.ok) throw new Error(`Failed to load calendar (${res.status})`);
      const data = await res.json();
      return { scheduled: data.scheduled || [], ready_queue: data.ready_queue || [] };
    },
    enabled: !!slug,
    staleTime: 0,
  });
}

export function useInvalidatePostingCalendar() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ["posting-calendar"] });
}
