"use client";

import { useState, useMemo } from "react";
import { useDraggable } from "@dnd-kit/core";
import type { IdeaForDetail } from "@/components/content/IdeaDetailSlideOver";

interface Props {
  slug: string;
  ideas: IdeaForDetail[];
  onSelectIdea: (idea: IdeaForDetail) => void;
  onAssignDate: (ideaId: string, dateIso: string) => Promise<void> | void;
}

const CHANNEL_VISUAL: Record<string, { label: string; emoji: string; bg: string; fg: string }> = {
  linkedin:   { label: "LinkedIn",   emoji: "💼", bg: "#DCE6F2", fg: "#0A66C2" },
  twitter:    { label: "Twitter",    emoji: "🐦", bg: "#E8F1FA", fg: "#1B2C5B" },
  blog:       { label: "Blog",       emoji: "📝", bg: "var(--sc-rust-100)", fg: "var(--sc-rust-700)" },
  newsletter: { label: "Newsletter", emoji: "📧", bg: "var(--sc-sun-100)",  fg: "var(--sc-rust-700)" },
};

const CHANNELS = ["all", "linkedin", "twitter", "blog", "newsletter"] as const;
type ChannelFilter = typeof CHANNELS[number];

function shortTitle(idea: IdeaForDetail): string {
  if (idea.title && idea.title.trim()) return idea.title.trim();
  const angle = (idea.angle_draft || "").replace(/^\s*(nuestro\s+pov|our\s+pov|pov)\s*:\s*/i, "").trim();
  const candidate = angle || (idea.signal?.summary || "").trim() || idea.id;
  return candidate.length > 110 ? candidate.slice(0, 107).trimEnd() + "…" : candidate;
}

function daysAgo(date?: string): number | null {
  if (!date) return null;
  const d = new Date(date);
  if (isNaN(d.getTime())) return null;
  return Math.floor((Date.now() - d.getTime()) / 86400000);
}

export function UnassignedBin({ ideas, onSelectIdea, onAssignDate }: Props) {
  const [channelFilter, setChannelFilter] = useState<ChannelFilter>("all");

  const visible = useMemo(() => {
    if (channelFilter === "all") return ideas;
    return ideas.filter((i) => i.target_channel === channelFilter);
  }, [ideas, channelFilter]);

  const countsByChannel = useMemo(() => {
    const map: Record<string, number> = {};
    for (const i of ideas) map[i.target_channel] = (map[i.target_channel] || 0) + 1;
    return map;
  }, [ideas]);

  return (
    <aside
      className="rounded-sc-lg border-[3px] overflow-hidden flex flex-col"
      style={{
        background: "var(--sc-paper-3)",
        borderColor: "var(--sc-ink)",
        boxShadow: "var(--pop-md)",
        position: "sticky",
        top: 12,
        maxHeight: "calc(100vh - 24px)",
      }}
    >
      {/* Header */}
      <div
        className="flex items-center gap-2 px-3 py-2.5 border-b-2 border-dashed"
        style={{ background: "var(--sc-paper-2)", borderColor: "var(--sc-ink)" }}
      >
        <span style={{ color: "var(--sc-rust-500)" }}>📥</span>
        <span className="font-heading uppercase text-[12px] tracking-wider font-bold">Sin fecha</span>
        <span
          className="font-mono text-[10.5px] px-1.5 py-0.5 rounded-sc-pill border ml-auto"
          style={{ background: "var(--sc-paper-3)", borderColor: "var(--sc-ink)" }}
        >{ideas.length}</span>
      </div>

      {/* Channel filter chips */}
      <div className="flex flex-wrap gap-1 px-2 py-2 border-b-2 border-dashed" style={{ borderColor: "var(--sc-ink)" }}>
        {CHANNELS.map((ch) => {
          const cv = ch === "all" ? null : CHANNEL_VISUAL[ch];
          const active = channelFilter === ch;
          const n = ch === "all" ? ideas.length : (countsByChannel[ch] || 0);
          return (
            <button
              key={ch}
              type="button"
              onClick={() => setChannelFilter(ch)}
              className="font-heading uppercase text-[10px] tracking-wider px-1.5 py-1 rounded-sc-md border inline-flex items-center gap-1"
              style={{
                background: active ? "var(--sc-rust-500)" : "var(--sc-paper-3)",
                color: active ? "var(--sc-paper-3)" : "var(--sc-ink)",
                borderColor: "var(--sc-ink)",
                boxShadow: active ? "var(--pop-xs)" : undefined,
              }}
              title={cv?.label || "Todos"}
            >
              {cv ? cv.emoji : "★"} {n}
            </button>
          );
        })}
      </div>

      {/* List */}
      <div className="overflow-y-auto flex-1">
        {visible.length === 0 ? (
          <div className="px-3 py-8 text-center text-xs italic" style={{ color: "var(--sc-fg-muted)" }}>
            {ideas.length === 0 ? "🎉 Todo programado" : "Sin ideas en este canal"}
          </div>
        ) : visible.map((idea) => (
          <UnassignedCard
            key={idea.id}
            idea={idea}
            onSelect={() => onSelectIdea(idea)}
            onAssignDate={(dateIso) => onAssignDate(idea.id, dateIso)}
          />
        ))}
      </div>
    </aside>
  );
}

function UnassignedCard({
  idea, onSelect, onAssignDate,
}: {
  idea: IdeaForDetail;
  onSelect: () => void;
  onAssignDate: (dateIso: string) => Promise<void> | void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `idea-${idea.id}`,
    data: { idea },
  });

  const cv = CHANNEL_VISUAL[idea.target_channel] || CHANNEL_VISUAL.blog;
  const conf = Math.round((idea.pov_confidence || 0) * 100);
  const days = daysAgo(idea.signal?.date);
  const statusBg = idea.status === "Approved" ? "var(--sc-navy-500)" : "var(--sc-sage-100)";
  const statusFg = idea.status === "Approved" ? "var(--sc-paper-3)" : "var(--sc-ink)";

  return (
    <div
      ref={setNodeRef}
      className="px-2 py-2 border-b border-dashed"
      style={{
        borderColor: "rgba(31,20,16,0.15)",
        opacity: isDragging ? 0.4 : 1,
      }}
    >
      <div
        {...attributes}
        {...listeners}
        className="flex items-start gap-2 cursor-grab active:cursor-grabbing"
        title="Arrastra a un día del calendario para programar"
      >
        <span
          className="grid place-items-center w-5 h-5 rounded text-[10px] border flex-shrink-0 mt-0.5"
          style={{ background: cv.bg, color: cv.fg, borderColor: "var(--sc-ink)" }}
        >{cv.emoji}</span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1 mb-0.5 flex-wrap">
            <span
              className="font-heading uppercase text-[8.5px] tracking-wider px-1 py-0.5 rounded-sc-pill border inline-flex items-center"
              style={{ background: statusBg, color: statusFg, borderColor: "var(--sc-ink)" }}
            >{idea.status}</span>
            <span className="font-mono text-[9px]" style={{ color: "var(--sc-rust-500)" }}>{conf}%</span>
            {days !== null && (
              <span className="font-mono text-[9px]" style={{ color: "var(--sc-fg-muted)" }}>· {days}d</span>
            )}
          </div>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onSelect(); }}
            onPointerDown={(e) => e.stopPropagation()}
            className="text-[11px] leading-tight text-left hover:underline w-full"
            style={{
              color: "var(--sc-ink)",
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
            }}
          >{shortTitle(idea)}</button>
        </div>
      </div>

      {/* Date picker fallback */}
      <div className="flex items-center gap-1 mt-1.5 ml-7">
        <input
          type="date"
          onPointerDown={(e) => e.stopPropagation()}
          onChange={(e) => { if (e.target.value) onAssignDate(e.target.value); }}
          className="font-mono text-[10px] px-1 py-0.5 rounded border"
          style={{ background: "var(--sc-paper-2)", borderColor: "var(--sc-ink)" }}
          title="Asignar fecha"
        />
      </div>
    </div>
  );
}
