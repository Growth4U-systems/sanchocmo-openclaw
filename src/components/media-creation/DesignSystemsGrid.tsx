/**
 * Design Systems tab: design systems upstream de Open Design (149+ DESIGN.md
 * brand-grade). Cards con paleta, tipografía y CTA "Usar como starter".
 */

import { useState, useMemo } from "react";
import { useOpenDesignSystems } from "@/hooks/useOpenDesignSystems";
import type { OdDesignSystem } from "@/lib/open-design/types";
import { OdLibraryItemSlideover, type OdLibraryItem } from "./OdLibraryItemSlideover";

interface Props {
  slug: string;
  onUse: (ds: OdDesignSystem) => void;
}

export function DesignSystemsGrid({ slug: _slug, onUse }: Props) {
  const { data, isLoading, error } = useOpenDesignSystems();
  const [filter, setFilter] = useState("");
  const [category, setCategory] = useState<string | "all">("all");
  const [selected, setSelected] = useState<OdDesignSystem | null>(null);

  const categories = useMemo(() => {
    if (!data) return [] as string[];
    return Array.from(new Set(data.map((d) => d.category).filter(Boolean) as string[])).sort();
  }, [data]);

  const filtered = useMemo(() => {
    if (!data) return [] as OdDesignSystem[];
    let out = data;
    if (category !== "all") out = out.filter((d) => d.category === category);
    if (filter) {
      const q = filter.toLowerCase();
      out = out.filter(
        (d) =>
          d.id.toLowerCase().includes(q) ||
          (d.title ?? d.name ?? "").toLowerCase().includes(q) ||
          (d.summary ?? "").toLowerCase().includes(q),
      );
    }
    return out;
  }, [data, filter, category]);

  if (isLoading) return <p className="text-sm text-muted-foreground py-8 text-center">Cargando design systems…</p>;
  if (error) return <p className="text-sm text-red-600 py-8 text-center">Error cargando design systems.</p>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <input
          type="text"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filtrar (claude, airbnb, brutalism…)"
          className="border border-border rounded-md px-3 py-1.5 text-sm w-80 focus:outline-none focus:border-rust"
        />
        {categories.length > 0 && (
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="border border-border rounded-md px-3 py-1.5 text-sm bg-card focus:outline-none focus:border-rust"
          >
            <option value="all">Todas las categorías</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        )}
        <span className="text-xs text-muted-foreground">{filtered.length} design systems</span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
        {filtered.map((ds) => {
          const swatches = ds.swatches?.length ? ds.swatches : ["#0F172A", "#F8FAFC", "#3B82F6"];
          const title = ds.title ?? ds.name ?? ds.id;
          return (
            <article
              key={ds.id}
              onClick={() => setSelected(ds)}
              className="border border-border rounded-xl bg-white dark:bg-card overflow-hidden hover:border-rust transition flex flex-col cursor-pointer"
            >
              <div className="flex h-16">
                {swatches.slice(0, 4).map((c, i) => (
                  <div key={i} className="flex-1" style={{ backgroundColor: c }} />
                ))}
              </div>
              <div className="p-3 space-y-2 flex flex-col flex-1">
                <div>
                  <div className="flex items-start gap-2">
                    <h4 className="font-semibold text-sm capitalize flex-1 min-w-0 truncate">{title}</h4>
                    {ds.category && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground whitespace-nowrap">
                        {ds.category}
                      </span>
                    )}
                  </div>
                  <code className="text-[10px] text-muted-foreground">{ds.id}</code>
                </div>
                {ds.summary && <p className="text-xs text-muted-foreground line-clamp-3">{ds.summary}</p>}
                <div className="flex items-center justify-end gap-2 pt-2 border-t border-border/40 mt-auto">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onUse(ds);
                    }}
                    className="text-[11px] font-semibold px-2.5 py-1 rounded-md bg-rust/10 text-rust hover:bg-rust/20"
                  >
                    💬 Usar como starter
                  </button>
                </div>
              </div>
            </article>
          );
        })}
      </div>

      <OdLibraryItemSlideover
        item={
          selected
            ? ({
                id: selected.id,
                title: selected.title ?? selected.name ?? selected.id,
                type: "design-system",
                subtitle: [selected.category, selected.surface, selected.source].filter(Boolean).join(" · "),
                summary: selected.summary,
                badges: [
                  selected.category && { label: selected.category, tone: "rust" as const },
                  selected.surface && { label: selected.surface, tone: "muted" as const },
                ].filter(Boolean) as { label: string; tone?: "rust" | "muted" | "amber" }[],
              } satisfies OdLibraryItem)
            : null
        }
        onClose={() => setSelected(null)}
        onUse={() => {
          if (selected) {
            onUse(selected);
            setSelected(null);
          }
        }}
      />
    </div>
  );
}
