/**
 * Craft Guides tab: lista de guidelines brand-agnostic. Click → slide-over
 * con el .md renderizado.
 */

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import type { OdCraftGuide } from "@/lib/open-design/types";
import { OdLibraryItemSlideover, type OdLibraryItem } from "./OdLibraryItemSlideover";

interface ListResponse<T> {
  items: T[];
  count: number;
  source: "daemon" | "fs";
}

function useCraftGuides() {
  return useQuery<OdCraftGuide[]>({
    queryKey: ["od-listing", "craft-guides"],
    queryFn: async () => {
      const res = await fetch("/api/open-design/listing/craft-guides");
      if (!res.ok) throw new Error("Failed to load craft guides");
      const payload = (await res.json()) as ListResponse<OdCraftGuide>;
      return payload.items ?? [];
    },
    staleTime: 5 * 60_000,
  });
}

export function CraftGuidesList() {
  const { data, isLoading, error } = useCraftGuides();
  const [selected, setSelected] = useState<OdCraftGuide | null>(null);

  if (isLoading) return <p className="text-sm text-muted-foreground py-8 text-center">Cargando craft guides…</p>;
  if (error) return <p className="text-sm text-red-600 py-8 text-center">Error cargando craft guides.</p>;
  if (!data || data.length === 0) {
    return <p className="text-sm text-muted-foreground py-8 text-center">Sin craft guides disponibles.</p>;
  }

  return (
    <div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {data.map((g) => (
          <article
            key={g.id}
            onClick={() => setSelected(g)}
            className="border border-border rounded-xl bg-white dark:bg-card p-4 hover:border-rust transition cursor-pointer"
          >
            <div className="flex items-start gap-3">
              <span className="text-2xl shrink-0">📐</span>
              <div className="flex-1 min-w-0">
                <h4 className="font-semibold text-sm capitalize">{g.name}</h4>
                {g.summary && (
                  <p className="text-xs text-muted-foreground mt-1 line-clamp-3">{g.summary}</p>
                )}
              </div>
            </div>
          </article>
        ))}
      </div>

      <OdLibraryItemSlideover
        item={
          selected
            ? ({
                id: selected.id,
                title: selected.name,
                type: "craft-guide",
                subtitle: "craft guide · brand-agnostic",
                summary: selected.summary,
                badges: [{ label: "craft", tone: "rust" }],
              } satisfies OdLibraryItem)
            : null
        }
        onClose={() => setSelected(null)}
        onUse={() => {
          // Craft guides son referencias — no tienen acción "usar en este brand".
          // Cierra el slide-over.
          setSelected(null);
        }}
      />
    </div>
  );
}
