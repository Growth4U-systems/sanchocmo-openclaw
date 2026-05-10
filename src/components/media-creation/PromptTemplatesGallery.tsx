/**
 * Prompt Templates tab: prompts upstream de Open Design (image + video + audio)
 * con thumbnails y metadata.
 */

import { useQuery } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import type { OdPromptTemplate } from "@/lib/open-design/types";
import { cn } from "@/lib/utils";
import { OdLibraryItemSlideover, type OdLibraryItem } from "./OdLibraryItemSlideover";

interface ListResponse<T> {
  items: T[];
  count: number;
  source: "daemon" | "fs";
}

interface Props {
  slug: string;
  onUse: (prompt: OdPromptTemplate) => void;
}

function usePromptTemplates() {
  return useQuery<OdPromptTemplate[]>({
    queryKey: ["od-listing", "prompt-templates"],
    queryFn: async () => {
      const res = await fetch("/api/open-design/listing/prompt-templates");
      if (!res.ok) throw new Error("Failed to load prompt templates");
      const payload = (await res.json()) as ListResponse<OdPromptTemplate>;
      return payload.items ?? [];
    },
    staleTime: 5 * 60_000,
  });
}

function surfaceOf(p: OdPromptTemplate): "image" | "video" | "audio" | undefined {
  if (p.surface === "image" || p.surface === "video" || p.surface === "audio") return p.surface;
  if (p.category === "image" || p.category === "video" || p.category === "audio") return p.category;
  return undefined;
}

const SURFACE_ICON: Record<string, string> = { image: "🖼️", video: "🎬", audio: "🎵" };

export function PromptTemplatesGallery({ slug: _slug, onUse }: Props) {
  const { data, isLoading, error } = usePromptTemplates();
  const [surface, setSurface] = useState<"all" | "image" | "video" | "audio">("all");
  const [filter, setFilter] = useState("");
  const [selected, setSelected] = useState<OdPromptTemplate | null>(null);

  const filtered = useMemo(() => {
    if (!data) return [] as OdPromptTemplate[];
    let out = data;
    if (surface !== "all") out = out.filter((p) => surfaceOf(p) === surface);
    if (filter) {
      const q = filter.toLowerCase();
      out = out.filter(
        (p) =>
          p.id.toLowerCase().includes(q) ||
          (p.title ?? p.name ?? "").toLowerCase().includes(q) ||
          (p.summary ?? "").toLowerCase().includes(q),
      );
    }
    return out;
  }, [data, surface, filter]);

  if (isLoading) return <p className="text-sm text-muted-foreground py-8 text-center">Cargando prompt templates…</p>;
  if (error) return <p className="text-sm text-red-600 py-8 text-center">Error cargando prompt templates.</p>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex gap-1.5">
          {(["all", "image", "video", "audio"] as const).map((c) => (
            <button
              key={c}
              onClick={() => setSurface(c)}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-semibold border-2 transition-all whitespace-nowrap flex items-center gap-1.5",
                surface === c ? "bg-rust text-white border-rust" : "border-border hover:border-rust",
              )}
            >
              {c !== "all" && <span>{SURFACE_ICON[c]}</span>}
              <span className="capitalize">{c}</span>
            </button>
          ))}
        </div>
        <input
          type="text"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filtrar prompts…"
          className="border border-border rounded-md px-3 py-1.5 text-sm w-64 focus:outline-none focus:border-rust"
        />
        <span className="text-xs text-muted-foreground">{filtered.length} prompts</span>
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground py-8 text-center">
          {data && data.length === 0
            ? "Sin prompts disponibles."
            : "Sin prompts que coincidan con el filtro."}
        </p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map((p) => {
            const s = surfaceOf(p);
            const title = p.title ?? p.name ?? p.id;
            return (
              <article
                key={p.id}
                onClick={() => setSelected(p)}
                className="border border-border rounded-xl bg-white dark:bg-card p-4 flex flex-col gap-2 hover:border-rust transition cursor-pointer"
              >
                <header className="flex items-start gap-2">
                  <span className="text-xl shrink-0">{s ? SURFACE_ICON[s] : "📄"}</span>
                  <div className="flex-1 min-w-0">
                    <h4 className="font-semibold text-sm">{title}</h4>
                    <code className="text-[10px] text-muted-foreground truncate block">{p.id}</code>
                  </div>
                  {p.category && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground whitespace-nowrap">
                      {p.category}
                    </span>
                  )}
                </header>
                {p.summary && <p className="text-xs text-muted-foreground line-clamp-3">{p.summary}</p>}
                {p.tags && p.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {p.tags.slice(0, 4).map((t) => (
                      <span key={t} className="text-[10px] px-1.5 py-0.5 rounded bg-muted/60 text-muted-foreground">
                        {t}
                      </span>
                    ))}
                  </div>
                )}
                <div className="flex items-center justify-end mt-auto pt-2 border-t border-border/40">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onUse(p);
                    }}
                    className="text-[11px] font-semibold px-2.5 py-1 rounded-md bg-rust/10 text-rust hover:bg-rust/20"
                  >
                    💬 Usar en este brand
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      <OdLibraryItemSlideover
        item={
          selected
            ? ({
                id: selected.id,
                title: selected.title ?? selected.name ?? selected.id,
                filePath: selected.filePath ?? "",
                subtitle: [selected.surface, selected.category, selected.source?.author].filter(Boolean).join(" · "),
                summary: selected.summary,
                badges: [
                  selected.surface && { label: selected.surface, tone: "rust" as const },
                  selected.category && { label: selected.category, tone: "muted" as const },
                  ...(selected.tags ?? []).slice(0, 3).map((t) => ({ label: t, tone: "muted" as const })),
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
