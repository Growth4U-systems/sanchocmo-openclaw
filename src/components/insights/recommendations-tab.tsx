"use client";

import { useState, useMemo, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useProjects } from "@/hooks/useProjects";
import { ComicCard } from "@/components/shared/comic-card";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface Rec {
  id: string;
  title: string;
  type: string;
  priority: string;
  description?: string;
  rationale?: string;
  linked_metric?: string;
  metric?: string;
  linked_project?: string;
  linkedProject?: string;
  status: string;
  source_crons?: string[];
  pieces?: Array<{ title: string; channel?: string; description?: string }>;
  created_at?: string;
  createdAt?: string;
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const TYPE_ICONS: Record<string, string> = {
  optimize: "🔧",
  investigate: "🔍",
  launch: "🚀",
  pause: "⏸️",
  escalate: "⚡",
  content_idea: "✍️",
  outreach_task: "📨",
  operational: "📋",
};

const PRIORITY_STYLES: Record<string, { bg: string; fg: string }> = {
  high: { bg: "#FFEBEE", fg: "#C45D35" },
  medium: { bg: "#FFF8E1", fg: "#B8860B" },
  low: { bg: "#F5F5F5", fg: "#7F8C8D" },
};

const STATUS_LABELS: Record<string, string> = {
  pending: "Pendiente",
  approved: "Aprobada",
  dismissed: "Descartada",
  converted: "Convertida",
};

/* ------------------------------------------------------------------ */
/*  Recommendation Card                                                */
/* ------------------------------------------------------------------ */

function RecCard({
  rec,
  slug,
  projects,
  onAction,
}: {
  rec: Rec;
  slug: string;
  projects: Array<{ id: string; name: string; status: string }>;
  onAction: () => void;
}) {
  const [pickingProject, setPickingProject] = useState(false);
  const [projectSearch, setProjectSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const prioStyle = PRIORITY_STYLES[rec.priority] || PRIORITY_STYLES.low;
  const projRef = rec.linked_project || rec.linkedProject || "";
  const metricRef = rec.linked_metric || rec.metric || "";
  const isPending = rec.status === "pending";

  const doAction = async (action: string, projectOverride?: string) => {
    setLoading(true);
    try {
      await fetch("/api/monitoring/recommendation-action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug,
          recommendationId: rec.id,
          action,
          ...(projectOverride ? { projectOverride } : {}),
        }),
      });
      onAction();
    } finally {
      setLoading(false);
    }
  };

  const handleConvert = () => {
    if (!projRef) {
      setPickingProject(true);
      return;
    }
    doAction("convert");
  };

  return (
    <div
      className={cn(
        "bg-white border border-[#E8E2D9] rounded-[10px] p-4",
        !isPending && "opacity-60",
      )}
      style={{
        borderLeftWidth: 4,
        borderLeftColor: prioStyle.fg,
        boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
      }}
    >
      {/* Header */}
      <div className="flex items-start gap-2">
        <span className="text-[16px] shrink-0 mt-0.5">
          {TYPE_ICONS[rec.type] || "📌"}
        </span>
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-[13px] text-[#2C3E50]">{rec.title}</div>
          {rec.rationale && (
            <p className="text-[12px] text-[#7F8C8D] mt-1 leading-snug">
              {rec.rationale}
            </p>
          )}

          {/* Badges */}
          <div className="flex flex-wrap gap-1.5 mt-2">
            {metricRef && (
              <span className="text-[10px] px-2 py-0.5 bg-[#E3F2FD] text-[#1565C0] rounded-full">
                {metricRef}
              </span>
            )}
            <span
              className="text-[10px] px-2 py-0.5 rounded-full font-semibold uppercase"
              style={{ background: prioStyle.bg, color: prioStyle.fg }}
            >
              {rec.priority}
            </span>
            {rec.type && (
              <span className="text-[10px] px-2 py-0.5 bg-[#F0F0F0] text-[#555] rounded-full">
                {rec.type}
              </span>
            )}
            {!isPending && (
              <span className="text-[10px] px-2 py-0.5 bg-[#F5F5F5] text-[#7F8C8D] rounded-full">
                {STATUS_LABELS[rec.status] || rec.status}
              </span>
            )}
          </div>

          {/* Source crons */}
          {rec.source_crons && rec.source_crons.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {rec.source_crons.map((c) => (
                <span key={c} className="text-[9px] px-1.5 py-0.5 bg-[#F8F6F0] border border-[#E8E2D9] rounded text-[#7F8C8D]">
                  {c}
                </span>
              ))}
            </div>
          )}

          {/* Pieces (sub-items) */}
          {rec.pieces && rec.pieces.length > 0 && (
            <div className="mt-2">
              <button
                type="button"
                onClick={() => setExpanded(!expanded)}
                className="text-[11px] text-rust font-medium hover:underline"
              >
                {expanded ? "▲" : "▼"} {rec.pieces.length} sub-items
              </button>
              {expanded && (
                <div className="mt-1.5 space-y-1 pl-2 border-l-2 border-[#E8E2D9]">
                  {rec.pieces.map((p, i) => (
                    <div key={i} className="text-[11px]">
                      <span className="font-medium text-[#2C3E50]">{p.title}</span>
                      {p.channel && (
                        <span className="ml-1 text-[9px] px-1.5 py-0.5 bg-[#E3F2FD] text-[#1565C0] rounded-full">
                          {p.channel}
                        </span>
                      )}
                      {p.description && (
                        <p className="text-[10px] text-[#7F8C8D] mt-0.5">{p.description}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Actions — only for pending */}
          {isPending && (
            <div className="flex items-center gap-2 mt-3">
              <button
                type="button"
                onClick={handleConvert}
                disabled={loading}
                className="text-[11px] font-semibold text-white bg-[#4A5D23] rounded px-3 py-1 hover:opacity-90 disabled:opacity-50"
              >
                → {projRef ? `Tarea en ${projRef}` : "Crear tarea"}
              </button>
              <button
                type="button"
                onClick={() => doAction("dismiss")}
                disabled={loading}
                className="text-[11px] font-semibold text-[#7F8C8D] border border-[#E8E2D9] rounded px-3 py-1 hover:bg-[#F8F6F0] disabled:opacity-50"
              >
                Descartar
              </button>
            </div>
          )}

          {/* Inline project picker */}
          {pickingProject && (
            <div className="mt-3 p-3 bg-white border border-[#E8E2D9] rounded-lg shadow-sm">
              <div className="text-[11px] font-bold text-[#2C3E50] mb-2">Asignar a proyecto:</div>
              <input
                type="text"
                placeholder="Buscar proyecto..."
                value={projectSearch}
                onChange={(e) => setProjectSearch(e.target.value)}
                className="w-full text-[11px] px-2 py-1 mb-1.5 border border-[#E8E2D9] rounded bg-white outline-none focus:border-[#4A5D23]/50"
              />
              <div className="flex flex-col gap-0.5 max-h-40 overflow-y-auto">
                {projects
                  .filter((p) => {
                    if (["archived", "cancelled", "discarded"].includes(p.status)) return false;
                    if (!projectSearch) return true;
                    const q = projectSearch.toLowerCase();
                    return p.id.toLowerCase().includes(q) || p.name.toLowerCase().includes(q);
                  })
                  .map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => {
                        setPickingProject(false);
                        setProjectSearch("");
                        doAction("convert", p.id);
                      }}
                      className="text-left text-[11px] px-2 py-1.5 rounded hover:bg-[#4A5D23]/10 transition-colors"
                    >
                      <span className="font-bold text-[#4A5D23]">{p.id}</span>{" "}
                      <span className="text-[#2C3E50]">{p.name}</span>
                    </button>
                  ))}
              </div>
              <div className="flex items-center gap-2 mt-2">
                <button
                  type="button"
                  onClick={() => {
                    setPickingProject(false);
                    setProjectSearch("");
                    doAction("convert", "__NEW__");
                  }}
                  className="text-[10px] font-semibold text-[#4A5D23] hover:text-[#4A5D23]/80"
                >
                  + Crear nuevo proyecto
                </button>
                <span className="flex-1" />
                <button
                  type="button"
                  onClick={() => {
                    setPickingProject(false);
                    setProjectSearch("");
                  }}
                  className="text-[10px] text-[#7F8C8D] hover:text-[#2C3E50]"
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Tab                                                           */
/* ------------------------------------------------------------------ */

export function RecommendationsTab({ slug }: { slug: string }) {
  const qc = useQueryClient();

  // Monitoring data — source of recommendations
  const { data: monData, isLoading } = useQuery<{
    pending_recommendations?: { recommendations?: Rec[] } | Rec[];
  }>({
    queryKey: ["monitoring-recs-tab", slug],
    queryFn: async () => {
      const res = await fetch(`/api/monitoring?slug=${slug}`);
      if (!res.ok) return {};
      return res.json();
    },
    enabled: !!slug,
    staleTime: 30_000,
  });

  // Projects for picker
  const { data: projectsData } = useProjects(slug);
  const projectList = useMemo(() =>
    (projectsData || []).map((p: { project: Record<string, unknown> }) => ({
      id: (p.project.id || "") as string,
      name: (p.project.name || p.project.id || "") as string,
      status: (p.project.status || "active") as string,
    })),
    [projectsData],
  );

  // Normalize recs
  const allRecs = useMemo(() => {
    const raw = monData?.pending_recommendations;
    if (!raw) return [];
    if (Array.isArray(raw)) return raw as Rec[];
    return (raw.recommendations || []) as Rec[];
  }, [monData]);

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>("pending");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [priorityFilter, setPriorityFilter] = useState<string>("all");

  const filteredRecs = useMemo(() => {
    return allRecs.filter((r) => {
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (typeFilter !== "all" && r.type !== typeFilter) return false;
      if (priorityFilter !== "all" && r.priority !== priorityFilter) return false;
      return true;
    });
  }, [allRecs, statusFilter, typeFilter, priorityFilter]);

  // Unique types for filter
  const types = useMemo(() => [...new Set(allRecs.map((r) => r.type).filter(Boolean))], [allRecs]);

  const handleAction = useCallback(() => {
    qc.invalidateQueries({ queryKey: ["monitoring-recs-tab", slug] });
    qc.invalidateQueries({ queryKey: ["monitoring", slug] });
    qc.invalidateQueries({ queryKey: ["monitoring-recs", slug] });
  }, [qc, slug]);

  // Counts by status
  const counts = useMemo(() => {
    const c: Record<string, number> = { all: allRecs.length };
    for (const r of allRecs) {
      c[r.status] = (c[r.status] || 0) + 1;
    }
    return c;
  }, [allRecs]);

  return (
    <div className="mt-6 space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        {/* Status pills */}
        <div className="flex gap-1">
          {[
            { value: "pending", label: `Pendientes (${counts.pending || 0})` },
            { value: "converted", label: `Convertidas (${counts.converted || 0})` },
            { value: "dismissed", label: `Descartadas (${counts.dismissed || 0})` },
            { value: "all", label: `Todas (${counts.all})` },
          ].map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setStatusFilter(opt.value)}
              className={cn(
                "text-[11px] px-2.5 py-1 rounded-full border transition-colors",
                statusFilter === opt.value
                  ? "bg-[#2C3E50] text-white border-[#2C3E50]"
                  : "bg-white text-[#7F8C8D] border-[#E8E2D9] hover:bg-[#F8F6F0]",
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* Type filter */}
        {types.length > 1 && (
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="text-[11px] px-2 py-1 border border-[#E8E2D9] rounded bg-white text-[#2C3E50]"
          >
            <option value="all">Todos los tipos</option>
            {types.map((t) => (
              <option key={t} value={t}>
                {TYPE_ICONS[t] || "📌"} {t}
              </option>
            ))}
          </select>
        )}

        {/* Priority filter */}
        <select
          value={priorityFilter}
          onChange={(e) => setPriorityFilter(e.target.value)}
          className="text-[11px] px-2 py-1 border border-[#E8E2D9] rounded bg-white text-[#2C3E50]"
        >
          <option value="all">Todas las prioridades</option>
          <option value="high">🔴 High</option>
          <option value="medium">🟡 Medium</option>
          <option value="low">⚪ Low</option>
        </select>
      </div>

      {/* Loading */}
      {isLoading && (
        <ComicCard>
          <p className="text-[12px] text-[#7F8C8D] animate-pulse py-6 text-center">
            Cargando recomendaciones...
          </p>
        </ComicCard>
      )}

      {/* Recommendations list */}
      {!isLoading && filteredRecs.length > 0 && (
        <div className="space-y-3">
          {filteredRecs.map((rec) => (
            <RecCard
              key={rec.id}
              rec={rec}
              slug={slug}
              projects={projectList}
              onAction={handleAction}
            />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!isLoading && filteredRecs.length === 0 && (
        <ComicCard>
          <div className="text-center py-8">
            <div className="text-2xl mb-2">🎯</div>
            <p className="text-[13px] text-[#7F8C8D]">
              {allRecs.length === 0
                ? "No hay recomendaciones pendientes. Se generan automaticamente desde el analisis de insights."
                : "No hay recomendaciones con estos filtros."}
            </p>
          </div>
        </ComicCard>
      )}
    </div>
  );
}
