/** Toolbar above the cron panel: error banner, search, status filter chips. */
"use client";

import { cn } from "@/lib/utils";

export type CronFilter = "all" | "active" | "error" | "paused";

interface Props {
  search: string;
  filter: CronFilter;
  errorCount: number;
  onSearch: (v: string) => void;
  onFilter: (f: CronFilter) => void;
  onJumpToErrors: () => void;
}

const CHIPS: { key: CronFilter; label: string }[] = [
  { key: "all", label: "Todos" },
  { key: "active", label: "Activos" },
  { key: "error", label: "Con errores" },
  { key: "paused", label: "Pausados" },
];

export function CronToolbar({ search, filter, errorCount, onSearch, onFilter, onJumpToErrors }: Props) {
  return (
    <div className="space-y-2">
      {errorCount > 0 && (
        <button
          type="button"
          onClick={onJumpToErrors}
          className="w-full text-left px-3 py-2 rounded border-2 border-destructive bg-destructive/10 text-destructive text-sm font-semibold hover:bg-destructive/15 transition-colors"
        >
          ⚠️ {errorCount} {errorCount === 1 ? "cron con errores consecutivos" : "crones con errores consecutivos"} · Ver →
        </button>
      )}

      <div className="flex flex-col sm:flex-row gap-2">
        <div className="flex-1">
          <input
            type="search"
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            placeholder="🔍 Buscar por nombre..."
            className="w-full px-3 py-1.5 text-sm border-2 border-ink rounded bg-background focus:outline-none focus:ring-2 focus:ring-rust/30"
          />
        </div>
        <div className="flex gap-1 flex-wrap" role="tablist" aria-label="Filtro por estado">
          {CHIPS.map((c) => (
            <button
              key={c.key}
              type="button"
              role="tab"
              aria-selected={filter === c.key}
              onClick={() => onFilter(c.key)}
              className={cn(
                "text-[11px] font-heading uppercase tracking-wider px-2.5 py-1 rounded border-2 transition-colors",
                filter === c.key
                  ? "bg-navy text-white border-ink"
                  : "bg-background text-muted-foreground border-border hover:border-ink",
              )}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
