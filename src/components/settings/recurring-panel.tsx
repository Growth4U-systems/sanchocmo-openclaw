/**
 * Recurring crons panel — per-brand view of openclaw crons with live status,
 * manual run, optimistic toggle and rich diagnostics.
 *
 * Composition only — all reusable pieces live under src/components/cron/.
 */
"use client";

import { useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { ComicCard } from "@/components/shared/comic-card";
import { CollapsibleSection } from "@/components/shared/collapsible-section";
import { useAppStore } from "@/stores/app";
import { useCronLive } from "@/components/cron/useCronLive";
import { isEnabled, type CronApi } from "@/components/cron/types";
import { CronCard } from "@/components/cron/CronCard";
import { CronDetailsModal } from "@/components/cron/CronDetailsModal";
import { CronToolbar, type CronFilter } from "@/components/cron/CronToolbar";
import { useSetCronModel } from "@/hooks/useModels";

type CategoryKey = "intelligence" | "metrics" | "outreach" | "content" | "system" | "other";

const CATEGORY_META: Record<CategoryKey, { icon: string; label: string }> = {
  metrics: { icon: "📊", label: "Metrics" },
  intelligence: { icon: "🧠", label: "Intelligence" },
  outreach: { icon: "📨", label: "Outreach" },
  content: { icon: "✍️", label: "Content" },
  system: { icon: "⚙️", label: "System" },
  other: { icon: "📋", label: "Otros" },
};

const CATEGORY_ORDER: CategoryKey[] = ["metrics", "intelligence", "outreach", "content", "system", "other"];

interface RecurringPanelProps {
  /** Client slug — falls back to the active client from the store. */
  slug?: string;
}

export function RecurringPanel({ slug: slugProp }: RecurringPanelProps = {}) {
  const storeSlug = useAppStore((s) => s.selectedClient) || "";
  const slug = slugProp ?? storeSlug;
  const { data: session } = useSession();
  const isAdmin = (session?.user as { role?: string })?.role === "admin";

  const {
    crons,
    systemCrons,
    templates,
    isLoading,
    isError,
    errorCount,
    flashByJob,
    pendingClicks,
    nowTick,
    run,
    toggle,
    refetch,
  } = useCronLive(slug || null, { includeSystem: isAdmin });

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<CronFilter>("all");
  const [detailsId, setDetailsId] = useState<string | null>(null);

  const setCronModel = useSetCronModel(slug || null);
  const modelSaveError = setCronModel.error
    ? (setCronModel.error as Error).message
    : null;

  const detailsCron = useMemo<CronApi | null>(() => {
    if (!detailsId) return null;
    return crons.find((c) => c.id === detailsId) || systemCrons.find((c) => c.id === detailsId) || null;
  }, [detailsId, crons, systemCrons]);

  const visibleCrons = useFilteredCrons(crons, search, filter, flashByJob, pendingClicks);
  const visibleSystem = useFilteredCrons(systemCrons, search, filter, flashByJob, pendingClicks);

  // Group by category
  const grouped = useMemo(() => groupByCategory(visibleCrons), [visibleCrons]);
  const groupedSystem = useMemo(() => groupByCategory(visibleSystem), [visibleSystem]);

  return (
    <section className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="font-heading text-xl text-navy">🔄 Tareas Recurrentes</h2>
          <p className="text-sm text-muted-foreground">
            Crons de OpenClaw — fuente de verdad
            {slug && <> · brand <code>{slug}</code></>}
          </p>
        </div>
        <button
          type="button"
          onClick={() => refetch()}
          className="text-[11px] font-heading uppercase tracking-wider px-2.5 py-1 rounded border-2 border-ink bg-background hover:bg-muted transition-colors"
          title="Refrescar snapshot"
        >
          ↻ Refrescar
        </button>
      </div>

      <CronToolbar
        search={search}
        filter={filter}
        errorCount={errorCount}
        onSearch={setSearch}
        onFilter={setFilter}
        onJumpToErrors={() => setFilter("error")}
      />

      {/* Loading / error */}
      {isLoading && !crons.length && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {[0, 1, 2].map((i) => <Skeleton key={i} />)}
        </div>
      )}
      {isError && (
        <ComicCard>
          <p className="text-sm text-destructive">No se pudo cargar la lista de crones. Click ↻ Refrescar para reintentar.</p>
        </ComicCard>
      )}

      {/* Brand categories */}
      {CATEGORY_ORDER.filter((cat) => grouped[cat]?.length).map((cat) => {
        const list = grouped[cat];
        const meta = CATEGORY_META[cat];
        return (
          <CategorySection
            key={cat}
            title={meta.label}
            icon={meta.icon}
            crons={list}
            flashByJob={flashByJob}
            pendingClicks={pendingClicks}
            nowTick={nowTick}
            onRun={run}
            onToggle={toggle}
            onDetails={setDetailsId}
          />
        );
      })}

      {/* Empty state for brand */}
      {!isLoading && visibleCrons.length === 0 && (
        <ComicCard>
          <p className="text-sm text-muted-foreground text-center py-8">
            {search || filter !== "all"
              ? "Ningún cron coincide con tus filtros."
              : "Este brand no tiene crones configurados. Activá uno de los templates abajo."}
          </p>
        </ComicCard>
      )}

      {/* Available templates */}
      {templates.length > 0 && (
        <ComicCard className="p-3">
          <CollapsibleSection
            title="Disponibles"
            icon="⏸"
            count={templates.length}
            defaultOpen={false}
          >
            <p className="text-xs text-muted-foreground mb-3">
              Estas tareas recurrentes se pueden activar cuando configures las integraciones necesarias.
            </p>
            <div className="space-y-3">
              {templates.map((tmpl) => (
                <div
                  key={tmpl.template_key}
                  className="border border-ink/20 rounded p-3 bg-background"
                >
                  <p className="font-medium text-sm">{(tmpl.name || tmpl.template_key).replace("{NAME}", slug || "")}</p>
                  {tmpl.description && (
                    <p className="text-xs text-muted-foreground mt-1">{tmpl.description}</p>
                  )}
                  {tmpl.requires && (
                    <p className="text-xs mt-1">
                      <span className="font-semibold">Requiere:</span> {tmpl.requires}
                    </p>
                  )}
                  {tmpl.p00_task && (
                    <p className="text-xs text-muted-foreground mt-1">
                      → Tarea: {tmpl.p00_task}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </CollapsibleSection>
        </ComicCard>
      )}

      {/* Shared system crons (admin-only) */}
      {isAdmin && visibleSystem.length > 0 && (
        <ComicCard className="p-3">
          <CollapsibleSection
            title="Sistema (compartido)"
            icon="🌐"
            count={visibleSystem.length}
            defaultOpen={false}
          >
            <p className="text-xs text-muted-foreground mb-3">
              Estos crones no pertenecen a una brand específica. Afectan a toda la instancia — cambiá con cuidado.
            </p>
            {CATEGORY_ORDER.filter((cat) => groupedSystem[cat]?.length).map((cat) => {
              const list = groupedSystem[cat];
              const meta = CATEGORY_META[cat];
              return (
                <CategorySection
                  key={cat}
                  title={meta.label}
                  icon={meta.icon}
                  crons={list}
                  flashByJob={flashByJob}
                  pendingClicks={pendingClicks}
                  nowTick={nowTick}
                  onRun={run}
                  onToggle={toggle}
                  onDetails={setDetailsId}
                  shared
                />
              );
            })}
          </CollapsibleSection>
        </ComicCard>
      )}

      {/* Details modal */}
      <CronDetailsModal
        cron={detailsCron}
        open={!!detailsCron}
        flash={detailsCron ? flashByJob[detailsCron.id] : null}
        pendingClickFresh={detailsCron ? isPendingFresh(pendingClicks[detailsCron.id]) : false}
        nowTick={nowTick}
        onClose={() => setDetailsId(null)}
        onModelChange={
          isAdmin
            ? (cronId, model) => setCronModel.mutate({ cronId, model })
            : undefined
        }
        modelSavePending={setCronModel.isPending}
        modelSaveError={modelSaveError}
      />
    </section>
  );
}

// ── Sub-components ────────────────────────────────────────────────

interface CategorySectionProps {
  title: string;
  icon: string;
  crons: CronApi[];
  flashByJob: Record<string, import("@/components/cron/types").CronFlash>;
  pendingClicks: Record<string, number>;
  nowTick: number;
  onRun: (id: string) => void;
  onToggle: (id: string, enable: boolean) => void;
  onDetails: (id: string) => void;
  shared?: boolean;
}

function CategorySection(props: CategorySectionProps) {
  const { title, icon, crons, flashByJob, pendingClicks, nowTick, onRun, onToggle, onDetails, shared } = props;

  // "Active" means any cron has something interesting to surface — running,
  // pending, queued via flash, or an error band. Otherwise we render compact.
  const hasInterest = crons.some(
    (c) => c.running || pendingClicks[c.id] || (c.consecutive_errors ?? 0) > 0 || flashByJob[c.id],
  );

  return (
    <ComicCard className="p-3">
      <CollapsibleSection
        title={title}
        icon={icon}
        count={crons.length}
        defaultOpen={hasInterest}
      >
        {hasInterest ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {crons.map((c) => (
              <CronCard
                key={c.id}
                cron={c}
                flash={flashByJob[c.id]}
                pendingClickFresh={isPendingFresh(pendingClicks[c.id])}
                nowTick={nowTick}
                onRun={onRun}
                onToggle={onToggle}
                onDetails={onDetails}
                shared={shared}
              />
            ))}
          </div>
        ) : (
          <CompactTable
            crons={crons}
            onDetails={onDetails}
            onRun={onRun}
            onToggle={onToggle}
            shared={shared}
          />
        )}
      </CollapsibleSection>
    </ComicCard>
  );
}

function CompactTable({
  crons,
  onDetails,
  onRun,
  onToggle,
  shared,
}: {
  crons: CronApi[];
  onDetails: (id: string) => void;
  onRun: (id: string) => void;
  onToggle: (id: string, enable: boolean) => void;
  shared?: boolean;
}) {
  const sharedTitle = "Cron de sistema — gestionar desde el panel admin";
  return (
    <div className="overflow-x-auto">
      <p className="text-[11px] text-muted-foreground mb-1.5">
        Todos OK · vista compacta. Click en un nombre para ver detalles.
      </p>
      <table className="w-full text-xs">
        <thead>
          <tr className="text-left text-muted-foreground border-b border-ink/20">
            <th className="py-1.5 px-2">Nombre</th>
            <th className="py-1.5 px-2">Última</th>
            <th className="py-1.5 px-2">Próxima</th>
            <th className="py-1.5 px-2 text-center">Activo</th>
            <th className="py-1.5 px-2 text-right">Acciones</th>
          </tr>
        </thead>
        <tbody>
          {crons.map((c) => (
            <tr key={c.id} className="border-b border-ink/10 hover:bg-muted/50 transition-colors">
              <td className="py-2 px-2">
                <button
                  type="button"
                  onClick={() => onDetails(c.id)}
                  className="font-medium text-left hover:underline"
                >
                  {c.name}
                </button>
              </td>
              <td className="py-2 px-2 text-muted-foreground">
                {c.last_run_at ? relTime(c.last_run_at) : "nunca"}
              </td>
              <td className="py-2 px-2 text-muted-foreground">
                {c.next_run_at ? relTime(c.next_run_at) : "—"}
              </td>
              <td className="py-2 px-2 text-center">
                <button
                  type="button"
                  role="switch"
                  aria-checked={isEnabled(c)}
                  aria-disabled={shared || undefined}
                  disabled={shared}
                  onClick={() => onToggle(c.id, !isEnabled(c))}
                  title={shared ? sharedTitle : undefined}
                  className={
                    "relative inline-flex h-4 w-7 rounded-full border border-ink " +
                    (isEnabled(c) ? "bg-sage" : "bg-muted") +
                    (shared ? " opacity-50 cursor-not-allowed" : "")
                  }
                >
                  <span
                    className={
                      "absolute top-[1px] h-2.5 w-2.5 rounded-full bg-white " +
                      (isEnabled(c) ? "right-[1px]" : "left-[1px]")
                    }
                  />
                </button>
              </td>
              <td className="py-2 px-2 text-right">
                <button
                  type="button"
                  onClick={() => onRun(c.id)}
                  disabled={shared}
                  className="text-[10px] font-heading uppercase tracking-wider px-1.5 py-0.5 rounded border border-ink hover:bg-muted transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                  title={shared ? sharedTitle : "Ejecutar ahora"}
                >
                  ▶
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Skeleton() {
  return (
    <div className="border-2 border-border rounded-lg p-3 animate-pulse">
      <div className="h-4 w-2/3 bg-muted rounded mb-2" />
      <div className="h-3 w-1/2 bg-muted rounded mb-2" />
      <div className="h-3 w-1/3 bg-muted rounded" />
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────

function isPendingFresh(expireAt: number | undefined): boolean {
  return !!expireAt && expireAt > Date.now();
}

function groupByCategory(crons: CronApi[]): Record<string, CronApi[]> {
  const map: Record<string, CronApi[]> = {};
  for (const c of crons) {
    const cat = (c.task_type as string) || "other";
    if (!map[cat]) map[cat] = [];
    map[cat].push(c);
  }
  return map;
}

function useFilteredCrons(
  crons: CronApi[],
  search: string,
  filter: CronFilter,
  flashByJob: Record<string, import("@/components/cron/types").CronFlash>,
  pendingClicks: Record<string, number>,
): CronApi[] {
  return useMemo(() => {
    const q = search.trim().toLowerCase();
    return crons.filter((c) => {
      if (q && !c.name.toLowerCase().includes(q)) return false;
      switch (filter) {
        case "all":
          return true;
        case "active":
          return isEnabled(c) || !!c.running;
        case "error":
          return (c.consecutive_errors ?? 0) > 0;
        case "paused":
          return !isEnabled(c);
      }
    });
    // flashByJob and pendingClicks are passed-through to keep callers in sync,
    // but they don't change which crons are visible.
    void flashByJob;
    void pendingClicks;
  }, [crons, search, filter, flashByJob, pendingClicks]);
}

function relTime(iso: string): string {
  const d = Date.now() - new Date(iso).getTime();
  const abs = Math.abs(d);
  const sign = d < 0 ? "en " : "hace ";
  if (abs < 60_000) return d < 0 ? "en <1 min" : "<1 min";
  if (abs < 3600_000) return sign + Math.round(abs / 60_000) + " min";
  if (abs < 86400_000) return sign + Math.round(abs / 3600_000) + "h";
  return sign + Math.round(abs / 86400_000) + "d";
}
