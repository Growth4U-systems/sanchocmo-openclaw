"use client";

import { useEffect, useState, useCallback } from "react";
import { cn } from "@/lib/utils";

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
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
