"use client";

import { useEffect, useState, useCallback } from "react";
import { cn } from "@/lib/utils";

interface Draft {
  channel: string;
  content: string;
  status: "draft" | "edited" | "approved" | "published";
  iterations: { role: string; text: string; ts: string }[];
}

interface Idea {
  id: string;
  pillar_id: string;
  content_type: string;
  target_channel: string;
  signal: { summary: string; source: string; url?: string; date: string };
  angle_draft: string;
  pov_confidence: number;
  created_at: string;
  status: string;
  approved_at?: string;
  drafts?: Draft[];
}

interface IdeasCounts {
  total: number;
  ready: number;
  approved: number;
  stale: number;
  archived: number;
  published: number;
}

interface Props {
  slug: string;
}

const STATUS_COLORS: Record<string, string> = {
  ready: "bg-blue-50 text-blue-700 border-blue-200",
  approved: "bg-green-50 text-green-700 border-green-200",
  stale: "bg-gray-50 text-gray-500 border-gray-200",
  archived: "bg-red-50 text-red-600 border-red-200",
  published: "bg-emerald-50 text-emerald-700 border-emerald-200",
};

const CHANNEL_ICONS: Record<string, string> = {
  linkedin: "💼",
  twitter: "🐦",
  blog: "📝",
  newsletter: "📧",
};

export function IdeaQueueTab({ slug }: Props) {
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [counts, setCounts] = useState<IdeasCounts | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("all");

  const fetchIdeas = useCallback(() => {
    const statusParam = filter !== "all" ? `&status=${filter}` : "";
    fetch(`/api/content-engine/ideas?slug=${slug}${statusParam}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.ok) {
          setIdeas(data.ideas || []);
          setCounts(data.counts || null);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [slug, filter]);

  useEffect(() => { fetchIdeas(); }, [fetchIdeas]);

  const updateIdea = useCallback(async (ideaId: string, fields: Record<string, unknown>) => {
    await fetch("/api/content-engine/ideas", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug, ideaId, fields }),
    });
    fetchIdeas();
  }, [slug, fetchIdeas]);

  const saveDraft = useCallback(async (ideaId: string, channel: string, content: string, status?: string) => {
    await fetch("/api/content-engine/drafts", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug, ideaId, channel, content, status }),
    });
    fetchIdeas();
  }, [slug, fetchIdeas]);

  const requestIteration = useCallback(async (ideaId: string, channel: string, instruction: string) => {
    await fetch("/api/content-engine/drafts", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug, ideaId, channel, iteration: { role: "user", text: instruction } }),
    });
    fetchIdeas();
  }, [slug, fetchIdeas]);

  // Expanded idea for draft editing
  const [expandedIdea, setExpandedIdea] = useState<string | null>(null);

  if (loading) return <p className="text-muted-foreground text-sm py-8 text-center">Cargando ideas...</p>;

  const FILTERS = [
    { key: "all", label: "Todas", count: counts?.total },
    { key: "ready", label: "Ready", count: counts?.ready },
    { key: "approved", label: "Aprobadas", count: counts?.approved },
    { key: "stale", label: "Stale", count: counts?.stale },
    { key: "archived", label: "Archivadas", count: counts?.archived },
    { key: "published", label: "Publicadas", count: counts?.published },
  ];

  return (
    <div>
      {/* Settings link */}
      <div className="flex items-center justify-end mb-3">
        <a
          href={`/dashboard/${slug}/settings`}
          className="text-[11px] text-muted-foreground hover:text-rust transition-colors flex items-center gap-1"
        >
          ⚙️ Configurar canal de aprobacion (Settings)
        </a>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1.5 mb-4 overflow-x-auto">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={cn(
              "text-[11px] px-3 py-1.5 rounded-md whitespace-nowrap transition-colors font-medium",
              filter === f.key
                ? "bg-rust text-white"
                : "bg-muted/40 text-muted-foreground hover:bg-muted"
            )}
          >
            {f.label}{f.count !== undefined ? ` (${f.count})` : ""}
          </button>
        ))}
      </div>

      {/* Ideas list */}
      {ideas.length === 0 ? (
        <div className="text-center py-12">
          <span className="text-4xl mb-3 block">💡</span>
          <p className="text-sm text-muted-foreground mb-2">
            {filter === "all" ? "Sin ideas todavia" : `Sin ideas con status "${filter}"`}
          </p>
          <p className="text-xs text-muted-foreground">
            Las ideas se generan automaticamente via los crons del Content Engine (7:30am L-V)
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {ideas.map((idea) => (
            <div
              key={idea.id}
              className="bg-white border border-[#E8E2D9] rounded-lg p-4"
              style={{ boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}
            >
              {/* Header */}
              <div className="flex items-start gap-2 mb-2">
                <span className="text-lg">{CHANNEL_ICONS[idea.target_channel] || "📄"}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full border", STATUS_COLORS[idea.status] || "bg-muted")}>
                      {idea.status}
                    </span>
                    <span className="text-[10px] text-muted-foreground">{idea.pillar_id}</span>
                    <span className="text-[10px] text-muted-foreground">·</span>
                    <span className="text-[10px] text-muted-foreground">{idea.content_type}</span>
                    <span className="text-[10px] text-muted-foreground">·</span>
                    <span className="text-[10px] text-muted-foreground">{idea.target_channel}</span>
                  </div>
                </div>
                <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                  {new Date(idea.created_at).toLocaleDateString("es-ES", { day: "numeric", month: "short" })}
                </span>
              </div>

              {/* Signal */}
              <div className="bg-muted/20 rounded px-3 py-2 mb-2">
                <p className="text-[11px] text-muted-foreground font-medium mb-0.5">📰 Signal:</p>
                <p className="text-xs text-[#2C3E50]">{idea.signal.summary}</p>
                <p className="text-[10px] text-muted-foreground mt-1">
                  {idea.signal.source} · {idea.signal.date}
                  {idea.signal.url && (
                    <> · <a href={idea.signal.url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">🔗</a></>
                  )}
                </p>
              </div>

              {/* Angle draft */}
              <div className="mb-3">
                <p className="text-[11px] text-muted-foreground font-medium mb-0.5">✍️ Angulo:</p>
                <p className="text-xs text-[#2C3E50] leading-relaxed">{idea.angle_draft}</p>
              </div>

              {/* Confidence + Actions */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-muted-foreground">Confianza:</span>
                  <div className="w-16 h-1.5 bg-muted/40 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full bg-rust"
                      style={{ width: `${(idea.pov_confidence || 0) * 100}%` }}
                    />
                  </div>
                  <span className="text-[10px] text-muted-foreground">{Math.round((idea.pov_confidence || 0) * 100)}%</span>
                </div>

                {idea.status === "ready" && (
                  <div className="flex gap-1.5">
                    <button
                      onClick={() => updateIdea(idea.id, { status: "approved", approved_at: new Date().toISOString(), approved_via: "mc-ui" })}
                      className="text-[11px] px-3 py-1 bg-green-50 text-green-700 border border-green-200 rounded-md hover:bg-green-100 transition-colors font-medium"
                    >
                      ✅ Aprobar
                    </button>
                    <button
                      onClick={() => updateIdea(idea.id, { status: "archived" })}
                      className="text-[11px] px-3 py-1 bg-red-50 text-red-600 border border-red-200 rounded-md hover:bg-red-100 transition-colors font-medium"
                    >
                      ❌ Descartar
                    </button>
                  </div>
                )}

                {idea.status === "approved" && (
                  <div className="flex gap-1.5">
                    {(!idea.drafts || idea.drafts.length === 0) && (
                      <button
                        onClick={async () => {
                          await fetch("/api/content-engine/generate-drafts", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ slug, ideaId: idea.id }),
                          });
                          fetchIdeas();
                          setExpandedIdea(idea.id);
                        }}
                        className="text-[11px] px-3 py-1 bg-rust text-white rounded-md hover:bg-rust/90 transition-colors font-medium"
                      >
                        ✍️ Generar drafts
                      </button>
                    )}
                    <button
                      onClick={() => setExpandedIdea(expandedIdea === idea.id ? null : idea.id)}
                      className="text-[11px] px-3 py-1 bg-rust/10 text-rust border border-rust/20 rounded-md hover:bg-rust/20 transition-colors font-medium"
                    >
                      {expandedIdea === idea.id ? "▾ Cerrar" : `✏️ Drafts${idea.drafts?.length ? ` (${idea.drafts.length})` : ""}`}
                    </button>
                  </div>
                )}
              </div>

              {/* Draft cards — shown when idea is approved and expanded */}
              {idea.status === "approved" && expandedIdea === idea.id && (
                <DraftCards
                  idea={idea}
                  slug={slug}
                  onSaveDraft={saveDraft}
                  onRequestIteration={requestIteration}
                  onRefresh={fetchIdeas}
                />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── DRAFT CARDS COMPONENT ─────────────────────────────────────
function DraftCards({
  idea, slug, onSaveDraft, onRequestIteration, onRefresh,
}: {
  idea: Idea; slug: string;
  onSaveDraft: (ideaId: string, channel: string, content: string, status?: string) => Promise<void>;
  onRequestIteration: (ideaId: string, channel: string, instruction: string) => Promise<void>;
  onRefresh: () => void;
}) {
  const drafts = idea.drafts || [];
  const [editingChannel, setEditingChannel] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  const [iterationInput, setIterationInput] = useState("");
  const [iteratingChannel, setIteratingChannel] = useState<string | null>(null);

  // Channels this idea should have drafts for
  const channels = idea.target_channel === "linkedin"
    ? ["linkedin", "twitter"]
    : idea.target_channel === "blog"
    ? ["blog", "linkedin"]
    : idea.target_channel === "newsletter"
    ? ["newsletter"]
    : [idea.target_channel, "linkedin"];

  const DRAFT_STATUS: Record<string, { bg: string; text: string; label: string }> = {
    draft: { bg: "bg-yellow-50", text: "text-yellow-700", label: "Borrador" },
    edited: { bg: "bg-blue-50", text: "text-blue-700", label: "Editado" },
    approved: { bg: "bg-green-50", text: "text-green-700", label: "Aprobado" },
    published: { bg: "bg-emerald-50", text: "text-emerald-700", label: "Publicado" },
  };

  return (
    <div className="mt-3 pt-3 border-t border-[#E8E2D9] space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Drafts por canal</span>
        {drafts.length === 0 && (
          <span className="text-[10px] text-muted-foreground italic">Escudero Content generara los drafts automaticamente tras el Clarify</span>
        )}
      </div>

      {channels.map((channel) => {
        const draft = drafts.find(d => d.channel === channel);
        const st = draft ? (DRAFT_STATUS[draft.status] || DRAFT_STATUS.draft) : null;
        const isEditing = editingChannel === channel;

        return (
          <div key={channel} className="bg-[#FAFAF8] border border-[#E8E2D9] rounded-lg p-3">
            {/* Channel header */}
            <div className="flex items-center gap-2 mb-2">
              <span className="text-sm">{CHANNEL_ICONS[channel] || "📄"}</span>
              <span className="text-xs font-semibold text-[#2C3E50] capitalize">{channel}</span>
              {st && (
                <span className={cn("text-[9px] font-semibold px-2 py-0.5 rounded-full", st.bg, st.text)}>
                  {st.label}
                </span>
              )}
              <div className="ml-auto flex gap-1.5">
                {draft && draft.status !== "approved" && draft.status !== "published" && (
                  <>
                    <button
                      onClick={() => {
                        if (isEditing) {
                          onSaveDraft(idea.id, channel, editContent, "edited");
                          setEditingChannel(null);
                        } else {
                          setEditContent(draft.content);
                          setEditingChannel(channel);
                        }
                      }}
                      className="text-[10px] px-2 py-0.5 rounded border border-[#E5E2DC] text-[#7A7A7A] hover:bg-[#E5E2DC] transition-colors"
                    >
                      {isEditing ? "💾 Guardar" : "✏️ Editar"}
                    </button>
                    <button
                      onClick={() => onSaveDraft(idea.id, channel, draft.content, "approved")}
                      className="text-[10px] px-2 py-0.5 rounded border border-green-200 text-green-700 bg-green-50 hover:bg-green-100 transition-colors"
                    >
                      ✅ Aprobar
                    </button>
                  </>
                )}
                {draft?.status === "approved" && (
                  <span className="text-[10px] text-green-600 font-medium">✓ Listo para publicar</span>
                )}
              </div>
            </div>

            {/* Draft content */}
            {!draft ? (
              <p className="text-[11px] text-muted-foreground italic py-2">
                Sin draft todavia. Se generara automaticamente cuando Escudero Content ejecute el Clarify + Writer.
              </p>
            ) : isEditing ? (
              <textarea
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                className="w-full text-[12px] border border-[#E8E2D9] rounded p-2 min-h-[120px] resize-y focus:outline-none focus:border-rust leading-relaxed"
                placeholder="Contenido del draft..."
              />
            ) : (
              <div className="text-[12px] text-[#2C3E50] whitespace-pre-wrap leading-relaxed py-1">
                {draft.content || "(vacio)"}
              </div>
            )}

            {/* Iteration request */}
            {draft && draft.status !== "approved" && draft.status !== "published" && (
              <div className="mt-2">
                {iteratingChannel === channel ? (
                  <div className="flex gap-1.5">
                    <input
                      type="text"
                      value={iterationInput}
                      onChange={(e) => setIterationInput(e.target.value)}
                      className="flex-1 text-[11px] border border-[#E8E2D9] rounded px-2 py-1 focus:outline-none focus:border-rust"
                      placeholder='Ej: "hook mas fuerte", "mas corto", "cita datos de Bnext"'
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
                    🔄 Pedir iteracion
                  </button>
                )}

                {/* Show iteration history */}
                {draft.iterations.length > 0 && (
                  <div className="mt-1.5 space-y-1">
                    {draft.iterations.map((it, i) => (
                      <div key={i} className="text-[10px] text-muted-foreground bg-white rounded px-2 py-1 border border-[#E8E2D9]">
                        <span className="font-medium">{it.role === "user" ? "Tu" : "Escudero"}:</span> {it.text}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
