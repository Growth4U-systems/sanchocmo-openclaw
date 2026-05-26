"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

interface PillarData {
  id: string;
  name: string;
  funnel_role: string;
  status: string;
  pain_origin?: string[];
  expertise?: string[];
  related_topics?: string[];
}

interface Props {
  slug: string;
}

const FUNNEL_COLORS: Record<string, string> = {
  top: "bg-blue-50 text-blue-700 border-blue-200",
  middle: "bg-yellow-50 text-yellow-700 border-yellow-200",
  bottom: "bg-green-50 text-green-700 border-green-200",
};

export function PillarsTab({ slug }: Props) {
  const [pillars, setPillars] = useState<PillarData[]>([]);
  const [rawContent, setRawContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/content-engine/pillars?slug=${slug}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.ok) {
          setPillars(data.pillars || []);
          setRawContent(data.content);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [slug]);

  if (loading) return <p className="text-muted-foreground text-sm py-8 text-center">Cargando pillars...</p>;

  if (!rawContent) {
    return (
      <div className="text-center py-12">
        <span className="text-4xl mb-3 block">🏗️</span>
        <p className="text-sm text-muted-foreground mb-2">No hay Content Pillars definidos todavia</p>
        <p className="text-xs text-muted-foreground">Ejecuta la skill <code>content-pillars</code> para generar los pillars de este cliente</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs text-muted-foreground">{pillars.length} pillars activos</p>
        <div className="flex gap-2 text-[10px]">
          <span className="px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">Top</span>
          <span className="px-2 py-0.5 rounded-full bg-yellow-50 text-yellow-700 border border-yellow-200">Middle</span>
          <span className="px-2 py-0.5 rounded-full bg-green-50 text-green-700 border border-green-200">Bottom</span>
        </div>
      </div>

      {pillars.map((p) => (
        <div
          key={p.id}
          className="bg-white border border-[#E8E2D9] rounded-lg overflow-hidden"
          style={{ boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}
        >
          <button
            type="button"
            onClick={() => setExpanded(expanded === p.id ? null : p.id)}
            className="w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-muted/20 transition-colors"
          >
            <span className="text-lg font-bold text-muted-foreground w-8">{p.id}</span>
            <div className="flex-1 min-w-0">
              <span className="text-sm font-semibold text-[#2C3E50] truncate block">{p.name}</span>
            </div>
            <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full border", FUNNEL_COLORS[p.funnel_role] || "bg-muted")}>
              {p.funnel_role}
            </span>
            <span className="text-[#7A7A7A] text-xs">{expanded === p.id ? "▾" : "▸"}</span>
          </button>

          {expanded === p.id && (
            <div className="px-4 pb-4 pt-1 border-t border-[#E8E2D9] space-y-3">
              {p.pain_origin && p.pain_origin.length > 0 && (
                <div>
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Pain Origin</p>
                  <ul className="text-xs text-[#2C3E50] space-y-0.5">
                    {p.pain_origin.map((po, i) => <li key={i}>- {po}</li>)}
                  </ul>
                </div>
              )}
              {p.expertise && p.expertise.length > 0 && (
                <div>
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Expertise</p>
                  <ul className="text-xs text-[#2C3E50] space-y-0.5">
                    {p.expertise.map((e, i) => <li key={i}>- {e}</li>)}
                  </ul>
                </div>
              )}
              {p.related_topics && p.related_topics.length > 0 && (
                <div>
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Subtopics</p>
                  <div className="flex flex-wrap gap-1">
                    {p.related_topics.map((t, i) => (
                      <span key={i} className="text-[10px] bg-muted/40 px-2 py-0.5 rounded">{t}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
