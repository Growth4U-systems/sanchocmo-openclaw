"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

interface Draft {
  meta: {
    idea_id: string;
    channel: string;
    iteration: number;
    content_task_id?: string;
    parent_task_id?: string;
    research_used?: boolean;
    clarify_status?: "pending" | "answered" | "skipped";
    updated_at?: string;
  };
  body: string;
  relPath: string;
  absPath: string;
}

type ChannelPhase =
  | "researching"
  | "clarify-needed"
  | "drafting"
  | "draft"
  | "approved"
  | "published";

interface IdeaLite {
  id: string;
  target_channel: string;
}

interface Props {
  idea: IdeaLite;
  slug: string;
  /**
   * Per-channel phase from `ContentTask.channel_phases` — drives the status
   * chip and the Aprobar button gating. Optional: when missing (orphan idea
   * preview, no CT yet), the card just shows the draft body without phase chips.
   */
  channelPhases?: Partial<Record<string, ChannelPhase>>;
  /**
   * Approve the channel's text. Owner must PATCH
   * `/api/content-engine/content-tasks` with
   * `channel_phases: { [channel]: "approved" }`.
   */
  onApproveChannel?: (channel: string) => Promise<void>;
  onSaveDraft: (ideaId: string, channel: string, body: string) => Promise<void>;
  onRequestIteration?: (ideaId: string, channel: string, instruction: string) => Promise<void>;
  onOpenDoc: (ideaId: string, channel: string) => void;
  onRefresh: () => void;
  hideIteration?: boolean;
}

const CHANNEL_ICONS: Record<string, string> = {
  linkedin: "💼",
  twitter: "🐦",
  blog: "📝",
  newsletter: "📧",
};

const DRAFT_STATUS: Record<ChannelPhase, { bg: string; text: string; label: string }> = {
  researching: { bg: "bg-purple-50", text: "text-purple-700", label: "Researching" },
  "clarify-needed": { bg: "bg-amber-50", text: "text-amber-700", label: "Necesita aclaración" },
  drafting: { bg: "bg-blue-50", text: "text-blue-700", label: "Escribiendo" },
  draft: { bg: "bg-yellow-50", text: "text-yellow-700", label: "Borrador" },
  approved: { bg: "bg-green-50", text: "text-green-700", label: "Aprobado" },
  published: { bg: "bg-emerald-50", text: "text-emerald-700", label: "Publicado" },
};

export function DraftCards({ idea, slug, channelPhases, onApproveChannel, onRequestIteration, onOpenDoc, hideIteration }: Props) {
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [loading, setLoading] = useState(false);
  const [iterationInput, setIterationInput] = useState("");
  const [iteratingChannel, setIteratingChannel] = useState<string | null>(null);

  useEffect(() => {
    if (!slug) return;
    setLoading(true);
    fetch(`/api/content-engine/drafts?slug=${slug}&ideaId=${idea.id}`)
      .then((r) => r.json())
      .then((data) => setDrafts(data?.drafts || []))
      .catch(() => setDrafts([]))
      .finally(() => setLoading(false));
  }, [slug, idea.id]);

  const channels = idea.target_channel === "linkedin"
    ? ["linkedin", "twitter"]
    : idea.target_channel === "blog"
    ? ["blog", "linkedin"]
    : idea.target_channel === "newsletter"
    ? ["newsletter"]
    : [idea.target_channel, "linkedin"];

  return (
    <div className="mt-3 pt-3 border-t border-[#E8E2D9] space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Drafts por canal</span>
        {!loading && drafts.length === 0 && (
          <span className="text-[10px] text-muted-foreground italic">Dulcinea generará los drafts automáticamente tras el Clarify</span>
        )}
      </div>

      {channels.map((channel) => {
        const draft = drafts.find((d) => d.meta.channel === channel);
        const phase = channelPhases?.[channel];
        const st = phase ? DRAFT_STATUS[phase] : null;
        const isTerminal = phase === "approved" || phase === "published";

        return (
          <div key={channel} className="bg-[#FAFAF8] border border-[#E8E2D9] rounded-lg p-3">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-sm">{CHANNEL_ICONS[channel] || "📄"}</span>
              <span className="text-xs font-semibold text-[#2C3E50] capitalize">{channel}</span>
              {st && (
                <span className={cn("text-[9px] font-semibold px-2 py-0.5 rounded-full", st.bg, st.text)}>
                  {st.label}
                </span>
              )}
              {draft?.meta.iteration ? (
                <span className="text-[9px] text-muted-foreground">v{draft.meta.iteration}</span>
              ) : null}
              <div className="ml-auto flex gap-1.5">
                {draft && (
                  <button
                    onClick={() => onOpenDoc(idea.id, channel)}
                    className="text-[10px] px-2 py-0.5 rounded border border-[#E5E2DC] text-[#7A7A7A] hover:bg-[#E5E2DC] transition-colors"
                    title="Abrir el draft en el editor de documentos"
                  >
                    📄 Abrir
                  </button>
                )}
                {draft && !isTerminal && onApproveChannel && (
                  <button
                    onClick={() => onApproveChannel(channel)}
                    className="text-[10px] px-2 py-0.5 rounded border border-green-200 text-green-700 bg-green-50 hover:bg-green-100 transition-colors"
                  >
                    ✅ Aprobar
                  </button>
                )}
                {phase === "approved" && (
                  <span className="text-[10px] text-green-600 font-medium">✓ Listo para publicar</span>
                )}
              </div>
            </div>

            {!draft ? (
              <p className="text-[11px] text-muted-foreground italic py-2">
                Sin draft todavía. Se generará automáticamente cuando Dulcinea ejecute deep-research → Clarify → writer.
              </p>
            ) : (
              <div
                className="text-[12px] text-[#2C3E50] whitespace-pre-wrap leading-relaxed py-1 max-h-32 overflow-hidden cursor-pointer hover:bg-white"
                onClick={() => onOpenDoc(idea.id, channel)}
                title="Click para abrir y editar"
              >
                {draft.body.trim() || "(vacío — Dulcinea está trabajando)"}
              </div>
            )}

            {draft && !isTerminal && !hideIteration && onRequestIteration && (
              <div className="mt-2">
                {iteratingChannel === channel ? (
                  <div className="flex gap-1.5">
                    <input
                      type="text"
                      value={iterationInput}
                      onChange={(e) => setIterationInput(e.target.value)}
                      className="flex-1 text-[11px] border border-[#E8E2D9] rounded px-2 py-1 focus:outline-none focus:border-rust"
                      placeholder='Ej: "hook más fuerte", "más corto", "cita datos de Bnext"'
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && iterationInput.trim()) {
                          onRequestIteration(idea.id, channel, iterationInput);
                          setIterationInput("");
                          setIteratingChannel(null);
                        }
                      }}
                    />
                    <button
                      onClick={() => { setIteratingChannel(null); setIterationInput(""); }}
                      className="text-[10px] text-muted-foreground hover:text-[#2C3E50]"
                    >
                      ✕
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setIteratingChannel(channel)}
                    className="text-[10px] text-rust hover:underline"
                  >
                    🔄 Pedir iteración
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
