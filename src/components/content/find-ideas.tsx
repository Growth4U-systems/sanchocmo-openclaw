/** Cron-based idea finder panel for Content Creation page. */

"use client";

import { cn } from "@/lib/utils";
import { ComicCard } from "@/components/shared/comic-card";
import { StatusPill } from "@/components/shared/status-pill";

interface Cron {
  name: string;
  schedule: string;
  lastRun: string | null;
  status: string;
  ideasCount: number;
  description?: string;
}

interface FindIdeasProps {
  slug: string;
  crons: Cron[];
  onOpenChat: (cronName: string) => void;
  onExecuteCron: (cronName: string) => void;
}

function formatDate(iso: string | null): string {
  if (!iso) return "Nunca";
  const d = new Date(iso);
  return d.toLocaleDateString("es", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

export function FindIdeas({ crons, onOpenChat, onExecuteCron }: FindIdeasProps) {
  const activeCrons = crons.filter((c) => c.status === "active").length;
  const totalIdeas = crons.reduce((sum, c) => sum + c.ideasCount, 0);
  const errorCount = crons.filter((c) => c.status === "error").length;

  return (
    <div className="space-y-5">
      {/* Stats row */}
      <div className="grid grid-cols-3 gap-3">
        <StatBox value={activeCrons} label="Crons activos" color="text-sage" />
        <StatBox value={totalIdeas} label="Ideas esta semana" color="text-navy" />
        <StatBox value={errorCount} label="Errores" color={errorCount > 0 ? "text-destructive" : "text-muted-foreground"} />
      </div>

      {/* Cron cards grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {crons.map((cron) => (
          <ComicCard key={cron.name}>
            <div className="space-y-3">
              {/* Header */}
              <div className="flex items-start justify-between gap-2">
                <h4 className="text-sm font-semibold leading-tight">{cron.name}</h4>
                <StatusPill status={cron.status} size="sm" />
              </div>

              {/* Description */}
              {cron.description && (
                <p className="text-[11px] text-muted-foreground line-clamp-2">
                  {cron.description}
                </p>
              )}

              {/* Schedule + last run */}
              <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                <span className="font-mono">{cron.schedule}</span>
                <span className="flex items-center gap-1">
                  <span
                    className={cn(
                      "inline-block h-2 w-2 rounded-full",
                      cron.lastRun ? "bg-sage" : "bg-muted",
                    )}
                  />
                  {formatDate(cron.lastRun)}
                </span>
              </div>

              {/* Ideas count */}
              <p className="text-xs">
                <span className="font-semibold text-navy">{cron.ideasCount}</span>{" "}
                <span className="text-muted-foreground">ideas generadas</span>
              </p>

              {/* Actions */}
              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => onOpenChat(cron.name)}
                  className="text-[11px] px-3 py-1.5 rounded-md border border-ink/20 hover:bg-muted transition-colors"
                >
                  Ver output
                </button>
                <button
                  type="button"
                  onClick={() => onExecuteCron(cron.name)}
                  className="text-[11px] px-3 py-1.5 rounded-md bg-navy text-white font-semibold hover:opacity-90 transition-opacity"
                >
                  Ejecutar
                </button>
                <button
                  type="button"
                  onClick={() => onOpenChat(cron.name)}
                  className="text-[11px] px-3 py-1.5 rounded-md bg-sage/15 text-sage font-semibold hover:bg-sage/25 transition-colors"
                >
                  Thread
                </button>
              </div>
            </div>
          </ComicCard>
        ))}
      </div>

      {crons.length === 0 && (
        <div className="flex flex-col items-center py-12">
          <span className="text-4xl mb-3">🔍</span>
          <p className="text-sm text-muted-foreground">
            No hay crons de búsqueda de ideas configurados.
          </p>
        </div>
      )}
    </div>
  );
}

/* ---------- Sub-component ---------- */

function StatBox({
  value,
  label,
  color,
}: {
  value: number;
  label: string;
  color: string;
}) {
  return (
    <div className="rounded-lg border-[2px] border-ink/20 bg-card px-3 py-2 text-center">
      <p className={cn("font-heading text-xl font-bold", color)}>{value}</p>
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
    </div>
  );
}
