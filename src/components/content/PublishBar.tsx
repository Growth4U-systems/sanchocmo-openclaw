"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { Draft, PublishingMeta } from "@/lib/data/drafts";
import {
  useCancelPublishing,
  usePublishDraft,
  usePublishProviders,
  usePublishingStatus,
} from "@/hooks/usePublishing";

/**
 * Sticky footer that lets the user pick a publishing provider, schedule a
 * post, or publish immediately. Hidden until the draft has been approved.
 *
 * State machine driven by `draft.meta.publishing.status`:
 *   (none)    → show "Publicar ahora" + "Programar"
 *   scheduled → show pill + "Cancelar" / "Editar fecha"
 *   publishing → show spinner pill (poll status)
 *   published → show "Ver post publicado" + "Republicar"
 *   failed    → show error + retry
 */
export function PublishBar({
  slug,
  ideaId,
  channel,
  draft,
  onPublishedToast,
}: {
  slug: string;
  ideaId: string;
  channel: string;
  draft: Draft;
  onPublishedToast?: (msg: string) => void;
}) {
  const providersQuery = usePublishProviders(slug, channel);
  const publish = usePublishDraft();
  const cancel = useCancelPublishing();

  const [providerId, setProviderId] = useState<string>("");
  const [scheduleAt, setScheduleAt] = useState<string>("");
  const pub = draft.meta.publishing;
  const isLive = pub?.status === "scheduled" || pub?.status === "publishing";

  const live = usePublishingStatus(slug, ideaId, channel, isLive);
  const effective: PublishingMeta | null = live.data || pub || null;

  // Auto-select the first configured provider supporting the channel.
  const configured = useMemo(
    () => (providersQuery.data || []).filter((p) => p.configured),
    [providersQuery.data],
  );
  useEffect(() => {
    if (!providerId && configured.length > 0) setProviderId(configured[0].id);
  }, [providerId, configured]);

  const status = effective?.status;
  const showPublishControls = !status || status === "failed" || status === "canceled";

  const error = publish.error || cancel.error;

  function handlePublishNow() {
    if (!providerId) return;
    publish.mutate(
      { slug, ideaId, channel, providerId },
      {
        onSuccess: (data) => {
          if (data.publishing?.status === "published") {
            onPublishedToast?.("Post publicado.");
          } else {
            onPublishedToast?.("Publicación enviada.");
          }
        },
      },
    );
  }

  function handleSchedule() {
    if (!providerId || !scheduleAt) return;
    const iso = new Date(scheduleAt).toISOString();
    publish.mutate(
      { slug, ideaId, channel, providerId, schedule: { publishAt: iso } },
      {
        onSuccess: () => {
          onPublishedToast?.("Programado correctamente.");
          setScheduleAt("");
        },
      },
    );
  }

  function handleCancel() {
    cancel.mutate({ slug, ideaId, channel });
  }

  if (providersQuery.isLoading) return null;

  return (
    <div className="sticky bottom-3 z-10 mx-auto max-w-3xl bg-white border border-[#E5E2DC] rounded-xl px-4 py-2.5 flex items-center gap-3 shadow-[0_4px_16px_rgba(0,0,0,0.06)]">
      {/* Provider selector */}
      {configured.length === 0 ? (
        <Link
          href={`/dashboard/${slug}/settings`}
          className="text-xs px-3 py-1.5 bg-[#FFFBEB] border border-[#FCD34D] text-[#92400E] rounded-md font-medium hover:bg-[#FEF3C7] transition-colors"
        >
          ⚠️ Conectar herramienta de publishing
        </Link>
      ) : (
        <div className="flex items-center gap-2 px-2.5 py-1 bg-[#E6F4E8] rounded-md text-xs">
          <span className="w-1.5 h-1.5 rounded-full bg-[#2F7D3B]" />
          <span className="text-[#2F7D3B]">Vía</span>
          <select
            value={providerId}
            onChange={(e) => setProviderId(e.target.value)}
            className="bg-transparent border-0 font-semibold text-[#2F7D3B] focus:outline-none"
          >
            {configured.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Status pill — when something is in flight */}
      {effective && status === "scheduled" && (
        <span className="text-xs px-2.5 py-1 bg-[#FFF8E6] border border-[#F0D97A] text-[#92400E] rounded-md">
          ⏰ Programado
          {effective.scheduled_at && (
            <span className="ml-1 font-mono">
              {new Date(effective.scheduled_at).toLocaleString("es-ES", {
                day: "numeric",
                month: "short",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          )}
        </span>
      )}
      {effective && status === "publishing" && (
        <span className="text-xs px-2.5 py-1 bg-[#DBEAFE] text-[#1E40AF] rounded-md">
          🚀 Publicando…
        </span>
      )}
      {effective && status === "published" && (
        <span className="text-xs px-2.5 py-1 bg-[#D1FAE5] text-[#065F46] rounded-md">
          ✅ Publicado
        </span>
      )}
      {effective && status === "failed" && (
        <span className="text-xs px-2.5 py-1 bg-red-50 text-red-700 rounded-md truncate max-w-xs" title={effective.error || ""}>
          ❌ Error: {effective.error || "desconocido"}
        </span>
      )}

      <div className="flex-1" />

      {showPublishControls && configured.length > 0 && (
        <>
          <input
            type="datetime-local"
            value={scheduleAt}
            onChange={(e) => setScheduleAt(e.target.value)}
            className="text-xs px-2 py-1 border border-[#E8E2D9] rounded-md"
          />
          <button
            type="button"
            onClick={handleSchedule}
            disabled={!providerId || !scheduleAt || publish.isPending}
            className="text-xs px-3 py-1.5 bg-white border border-[#E8E2D9] rounded-md hover:border-[#2C3E50] disabled:opacity-50 transition-colors"
          >
            📅 Programar
          </button>
          <button
            type="button"
            onClick={handlePublishNow}
            disabled={!providerId || publish.isPending}
            className="text-xs px-3 py-1.5 bg-rust text-white rounded-md font-medium hover:opacity-90 disabled:opacity-50"
          >
            {publish.isPending ? "Publicando..." : "🚀 Publicar ahora"}
          </button>
        </>
      )}

      {effective?.status === "scheduled" && (
        <button
          type="button"
          onClick={handleCancel}
          disabled={cancel.isPending}
          className="text-xs px-3 py-1.5 bg-white border border-[#E8E2D9] rounded-md hover:border-red-500 hover:text-red-600 transition-colors"
        >
          {cancel.isPending ? "Cancelando..." : "Cancelar"}
        </button>
      )}

      {effective?.status === "published" && effective.external_url && (
        <a
          href={effective.external_url}
          target="_blank"
          rel="noreferrer"
          className="text-xs px-3 py-1.5 bg-white border border-[#E8E2D9] rounded-md hover:border-[#2C3E50] transition-colors"
        >
          Ver post ↗
        </a>
      )}

      {error && (
        <span className="text-[11px] text-red-600 truncate max-w-[200px]" title={error.message}>
          {error.message}
        </span>
      )}
    </div>
  );
}
