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
  /** Still "scheduled" >2h past scheduled_at — reconciliation hasn't caught
   *  up. Rendered as a red "⚠️ Sin confirmar" badge instead of the regular
   *  "⏰ Programado" so the human investigates Metricool directly. */
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
  /** Per-channel media requirement, mirrored from `ContentTask.media_policy`.
   *  When `"required"` and `has_media === false`, the Ready Queue card
   *  disables the "Programar" action. */
  media_policy?: "required" | "optional";
}

export interface CalendarPayload {
  scheduled: CalendarEvent[];
  ready_queue: ReadyDraft[];
}

type AnyRecord = Record<string, unknown>;

function asRecord(value: unknown): AnyRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as AnyRecord)
    : {};
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function asNullableString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function asBoolean(value: unknown, fallback = false): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function normalizeMedia(raw: unknown): MediaAsset[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((item) => {
    const media = asRecord(item);
    const url = asString(media.url);
    if (!url) return [];
    return [{
      url,
      type: asString(media.type),
      source: media.source === "ai-generated" ? "ai-generated" as const : "uploaded" as const,
      ...(typeof media.prompt === "string" ? { prompt: media.prompt } : {}),
      ...(typeof media.model === "string" ? { model: media.model } : {}),
      ...(typeof media.aspect_ratio === "string" ? { aspect_ratio: media.aspect_ratio } : {}),
      created_at: asString(media.created_at, new Date(0).toISOString()),
    }];
  });
}

function normalizeCalendarEvent(raw: unknown): CalendarEvent {
  const event = asRecord(raw);
  const status = event.status === "publishing"
    || event.status === "published"
    || event.status === "failed"
    || event.status === "canceled"
    ? event.status
    : "scheduled";
  return {
    ideaId: asString(event.ideaId),
    contentTaskId: asString(event.contentTaskId),
    parentTaskId: asString(event.parentTaskId),
    channel: asString(event.channel, "blog"),
    scheduled_at: asString(event.scheduled_at, new Date(0).toISOString()),
    status,
    provider: asString(event.provider),
    external_url: asNullableString(event.external_url),
    ...(typeof event.external_job_id === "string" ? { external_job_id: event.external_job_id } : {}),
    title: asString(event.title, "(sin titulo)"),
    ...(typeof event.hero_media_url === "string" ? { hero_media_url: event.hero_media_url } : {}),
    body: asString(event.body),
    media: normalizeMedia(event.media),
    ...(event.metrics && typeof event.metrics === "object" ? { metrics: event.metrics as PostMetricsSnapshot } : {}),
    ...(typeof event.unconfirmed_drift === "boolean" ? { unconfirmed_drift: event.unconfirmed_drift } : {}),
  };
}

function normalizeReadyDraft(raw: unknown): ReadyDraft {
  const draft = asRecord(raw);
  const media = normalizeMedia(draft.media);
  const mediaPolicy = draft.media_policy === "required" ? "required" : draft.media_policy === "optional" ? "optional" : undefined;
  return {
    ideaId: asString(draft.ideaId),
    contentTaskId: asString(draft.contentTaskId),
    parentTaskId: asString(draft.parentTaskId),
    channel: asString(draft.channel, "blog"),
    title: asString(draft.title, "(sin titulo)"),
    pillar_id: asString(draft.pillar_id),
    ready_at: asString(draft.ready_at, new Date(0).toISOString()),
    ...(typeof draft.hero_media_url === "string" ? { hero_media_url: draft.hero_media_url } : {}),
    has_media: asBoolean(draft.has_media, media.length > 0 || typeof draft.hero_media_url === "string"),
    body: asString(draft.body),
    media,
    ...(mediaPolicy ? { media_policy: mediaPolicy } : {}),
  };
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
      return {
        scheduled: Array.isArray(data?.scheduled) ? data.scheduled.map(normalizeCalendarEvent) : [],
        ready_queue: Array.isArray(data?.ready_queue) ? data.ready_queue.map(normalizeReadyDraft) : [],
      };
    },
    enabled: !!slug,
    staleTime: 0,
  });
}

export function useInvalidatePostingCalendar() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ["posting-calendar"] });
}
