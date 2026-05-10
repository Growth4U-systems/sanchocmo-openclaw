/**
 * Skills tab del Open Design Library: skills upstream de OD, agrupadas por mode,
 * con metadata visible: surface, platform, scenario, triggers.
 */

import { useState, useMemo } from "react";
import { useOpenDesignSkills } from "@/hooks/useOpenDesignSkills";
import type { OdSkill } from "@/lib/open-design/types";
import { OdLibraryItemSlideover, type OdLibraryItem } from "./OdLibraryItemSlideover";

interface Props {
  slug: string;
  onUse: (skill: OdSkill) => void;
}

const SURFACE_ICON: Record<string, string> = {
  video: "🎬",
  audio: "🎵",
  image: "🖼️",
  deck: "🎤",
  html: "💻",
  web: "🌐",
  doc: "📄",
};

const MODE_LABEL: Record<string, string> = {
  template: "Template",
  "design-system": "Design system",
  prototype: "Prototipo",
  deck: "Deck",
  audit: "Auditoría",
  research: "Research",
  infra: "Infra",
  page: "Página",
  dashboard: "Dashboard",
};

export function SkillsList({ slug: _slug, onUse }: Props) {
  const { data, isLoading, error } = useOpenDesignSkills();
  const [filter, setFilter] = useState("");
  const [selected, setSelected] = useState<OdSkill | null>(null);

  const filtered = useMemo(() => {
    if (!data) return [] as OdSkill[];
    // IDs con `:` son ejemplos/variants — los excluimos
    const real = data.filter((s) => !s.id.includes(":"));
    if (!filter) return real;
    const q = filter.toLowerCase();
    return real.filter(
      (s) =>
        s.id.toLowerCase().includes(q) ||
        (s.name ?? "").toLowerCase().includes(q) ||
        (s.description ?? "").toLowerCase().includes(q) ||
        (s.mode ?? "").toLowerCase().includes(q) ||
        (s.surface ?? "").toLowerCase().includes(q),
    );
  }, [data, filter]);

  if (isLoading) return <p className="text-sm text-muted-foreground py-8 text-center">Cargando skills upstream…</p>;
  if (error) return <p className="text-sm text-red-600 py-8 text-center">Error cargando skills. ¿Daemon OD encendido?</p>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <input
          type="text"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filtrar skills (nombre, mode, surface)…"
          className="border border-border rounded-md px-3 py-1.5 text-sm w-80 focus:outline-none focus:border-rust"
        />
        <span className="text-xs text-muted-foreground">{filtered.length} skills</span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {filtered.map((s) => {
          const surfaceIcon = s.surface ? SURFACE_ICON[s.surface] ?? "🔧" : "🔧";
          const modeLabel = s.mode ? MODE_LABEL[s.mode] ?? s.mode : null;
          return (
            <article
              key={s.id}
              onClick={() => setSelected(s)}
              className="border border-border rounded-xl bg-white dark:bg-card p-4 flex flex-col gap-2 hover:border-rust transition cursor-pointer"
            >
              <header className="flex items-start gap-2">
                <span className="text-xl shrink-0" title={s.surface}>
                  {surfaceIcon}
                </span>
                <div className="flex-1 min-w-0">
                  <h4 className="font-semibold text-sm">{s.name ?? s.id}</h4>
                  <code className="text-[10px] text-muted-foreground block truncate">{s.id}</code>
                </div>
              </header>

              {/* Metadata badges */}
              <div className="flex flex-wrap gap-1">
                {modeLabel && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-rust/10 text-rust font-semibold">
                    {modeLabel}
                  </span>
                )}
                {s.surface && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                    {s.surface}
                  </span>
                )}
                {s.platform && s.platform !== "auto" && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                    {s.platform}
                  </span>
                )}
                {s.scenario && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                    {s.scenario}
                  </span>
                )}
                {s.designSystemRequired && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 dark:bg-amber-900/30">
                    requiere DESIGN.md
                  </span>
                )}
              </div>

              {s.description && <p className="text-xs text-muted-foreground line-clamp-3">{s.description}</p>}

              {(() => {
                const stringTriggers = (s.triggers ?? []).filter((t): t is string => typeof t === "string");
                if (stringTriggers.length === 0) return null;
                return (
                  <div className="text-[10px] text-muted-foreground">
                    <span className="font-semibold">Triggers:</span>{" "}
                    {stringTriggers.slice(0, 3).map((t, i) => (
                      <span key={i} className="italic">
                        {i > 0 && " · "}&ldquo;{t}&rdquo;
                      </span>
                    ))}
                    {stringTriggers.length > 3 && <span className="text-muted-foreground"> +{stringTriggers.length - 3}</span>}
                  </div>
                );
              })()}

              <div className="flex items-center justify-end mt-auto pt-2 border-t border-border/40">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onUse(s);
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

      <OdLibraryItemSlideover
        item={
          selected
            ? ({
                id: selected.id,
                title: selected.name ?? selected.id,
                filePath: selected.filePath ?? "",
                subtitle: [selected.mode, selected.surface, selected.platform, selected.scenario].filter(Boolean).join(" · "),
                summary: selected.description,
                badges: [
                  selected.mode && { label: MODE_LABEL[selected.mode] ?? selected.mode, tone: "rust" as const },
                  selected.surface && { label: selected.surface, tone: "muted" as const },
                  selected.designSystemRequired && { label: "requiere DESIGN.md", tone: "amber" as const },
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
