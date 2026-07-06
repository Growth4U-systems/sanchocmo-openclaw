/**
 * Admin Recurring Panel — cross-brand snapshot of every openclaw cron.
 *
 * Rendered at /dashboard/admin/settings?tab=recurring. Shows one
 * collapsible section per brand + one for "🌐 Sistema (compartido)"
 * crons. All controls (Run / Toggle) are enabled here — this is the
 * canonical place to manage shared crons that are read-only in
 * per-brand views.
 */
"use client";

import { useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { ComicCard } from "@/components/shared/comic-card";
import { CollapsibleSection } from "@/components/shared/collapsible-section";
import { useAdminCronLive } from "@/components/cron/useAdminCronLive";
import type { CronApi } from "@/components/cron/types";
import { CronCard } from "@/components/cron/CronCard";
import { CronDetailsModal } from "@/components/cron/CronDetailsModal";
import { CronToolbar, type CronFilter } from "@/components/cron/CronToolbar";
import { useClients } from "@/hooks/useClients";
import { useSetCronModel } from "@/hooks/useModels";
import { isEnabled } from "@/components/cron/types";

export function AdminRecurringPanel() {
  const { data: session, status: sessionStatus } = useSession();
  const isAdmin = (session?.user as { role?: string } | undefined)?.role === "admin";

  if (sessionStatus === "loading") {
    return (
      <ComicCard>
        <p className="text-sm text-muted-foreground py-4 text-center">Cargando sesión…</p>
      </ComicCard>
    );
  }

  if (!isAdmin) {
    return (
      <ComicCard>
        <p className="text-sm text-muted-foreground py-4 text-center">
          Esta vista es solo para administradores. Si necesitás ver tus crones, abrí el panel de tu brand desde el selector.
        </p>
      </ComicCard>
    );
  }

  return <AdminRecurringPanelInner />;
}

function AdminRecurringPanelInner() {
  const {
    cronsByBrand,
    brandSlugs,
    systemCrons,
    isLoading,
    isError,
    errorCount,
    flashByJob,
    pendingClicks,
    nowTick,
    run,
    toggle,
    refetch,
  } = useAdminCronLive();

  const { data: clients } = useClients();
  const clientMetaBySlug = useMemo(() => {
    const map: Record<string, { name: string; emoji: string }> = {};
    for (const c of clients || []) map[c.slug] = { name: c.name, emoji: c.emoji || "🏷️" };
    return map;
  }, [clients]);

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<CronFilter>("all");
  const [detailsId, setDetailsId] = useState<string | null>(null);

  const detailsCron = useMemo<CronApi | null>(() => {
    if (!detailsId) return null;
    for (const slug of brandSlugs) {
      const c = (cronsByBrand[slug] || []).find((c) => c.id === detailsId);
      if (c) return c;
    }
    return systemCrons.find((c) => c.id === detailsId) || null;
  }, [detailsId, cronsByBrand, brandSlugs, systemCrons]);

  // Admin recurring panel always renders for admins (gated above), so the
  // mutation is always enabled. Slug comes from the currently opened cron
  // so query invalidation flows back to its brand snapshot too.
  const detailsSlug = detailsCron?.client_slug ?? null;
  const setCronModel = useSetCronModel(detailsSlug);
  const modelSaveError = setCronModel.error
    ? (setCronModel.error as Error).message
    : null;

  const filteredByBrand = useMemo(() => {
    const result: Record<string, CronApi[]> = {};
    for (const slug of brandSlugs) {
      result[slug] = applyFilters(cronsByBrand[slug] || [], search, filter);
    }
    return result;
  }, [cronsByBrand, brandSlugs, search, filter]);

  const filteredSystem = useMemo(
    () => applyFilters(systemCrons, search, filter),
    [systemCrons, search, filter],
  );

  const totalVisible = useMemo(
    () => brandSlugs.reduce((n, s) => n + (filteredByBrand[s]?.length ?? 0), 0) + filteredSystem.length,
    [brandSlugs, filteredByBrand, filteredSystem],
  );

  return (
    <section className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="font-heading text-xl text-navy">🔄 Tareas Recurrentes — Vista Admin</h2>
          <p className="text-sm text-muted-foreground">
            Todos los crons de OpenClaw agrupados por brand · {brandSlugs.length} brand{brandSlugs.length === 1 ? "" : "s"} · {systemCrons.length} sistema
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

      {isLoading && brandSlugs.length === 0 && (
        <ComicCard><p className="text-sm text-muted-foreground py-4 text-center">Cargando snapshot global…</p></ComicCard>
      )}

      {isError && (
        <ComicCard>
          <p className="text-sm text-destructive">No se pudo cargar el snapshot. Click ↻ Refrescar para reintentar.</p>
        </ComicCard>
      )}

      {/* One section per brand */}
      {brandSlugs.map((slug) => {
        const list = filteredByBrand[slug] || [];
        if (list.length === 0 && (search || filter !== "all")) return null;
        const meta = clientMetaBySlug[slug] || { name: slug, emoji: "🏷️" };
        const brandErrors = list.filter((c) => (c.consecutive_errors ?? 0) > 0).length;
        const brandRunning = list.some((c) => c.running);
        return (
          <BrandSection
            key={slug}
            slug={slug}
            name={meta.name}
            icon={meta.emoji}
            crons={list}
            errorCount={brandErrors}
            defaultOpen={brandRunning || brandErrors > 0}
            flashByJob={flashByJob}
            pendingClicks={pendingClicks}
            nowTick={nowTick}
            onRun={run}
            onToggle={toggle}
            onDetails={setDetailsId}
          />
        );
      })}

      {/* System section */}
      {filteredSystem.length > 0 && (
        <BrandSection
          slug="_system"
          name="Sistema (compartido)"
          icon="🌐"
          crons={filteredSystem}
          errorCount={filteredSystem.filter((c) => (c.consecutive_errors ?? 0) > 0).length}
          defaultOpen={filteredSystem.some((c) => c.running || (c.consecutive_errors ?? 0) > 0)}
          flashByJob={flashByJob}
          pendingClicks={pendingClicks}
          nowTick={nowTick}
          onRun={run}
          onToggle={toggle}
          onDetails={setDetailsId}
        />
      )}

      {/* Empty state */}
      {!isLoading && totalVisible === 0 && (
        <ComicCard>
          <p className="text-sm text-muted-foreground text-center py-8">
            {search || filter !== "all"
              ? "Ningún cron coincide con los filtros."
              : "No hay crones configurados en la instancia."}
          </p>
        </ComicCard>
      )}

      <CronDetailsModal
        cron={detailsCron}
        open={!!detailsCron}
        flash={detailsCron ? flashByJob[detailsCron.id] : null}
        pendingClickFresh={detailsCron ? isPendingFresh(pendingClicks[detailsCron.id]) : false}
        nowTick={nowTick}
        onClose={() => setDetailsId(null)}
        onModelChange={(cronId, model) => setCronModel.mutate({ cronId, model })}
        modelSavePending={setCronModel.isPending}
        modelSaveError={modelSaveError}
      />
    </section>
  );
}

// ── Sub-components ────────────────────────────────────────────────

interface BrandSectionProps {
  slug: string;
  name: string;
  icon?: string;
  crons: CronApi[];
  errorCount: number;
  defaultOpen: boolean;
  flashByJob: Record<string, import("@/components/cron/types").CronFlash>;
  pendingClicks: Record<string, number>;
  nowTick: number;
  onRun: (id: string) => void;
  onToggle: (id: string, enable: boolean) => void;
  onDetails: (id: string) => void;
}

function BrandSection(props: BrandSectionProps) {
  const { slug, name, icon, crons, errorCount, defaultOpen, flashByJob, pendingClicks, nowTick, onRun, onToggle, onDetails } = props;
  // System section passes its display name directly; brand sections add
  // the slug to disambiguate when name differs from the slug (e.g.
  // "Example" vs "example").
  const title = slug === "_system" ? name : name.toLowerCase() === slug ? name : `${name} (${slug})`;
  const headerIcon = icon ?? "🏷️";

  return (
    <ComicCard className="p-3">
      <CollapsibleSection
        title={title}
        icon={headerIcon}
        count={crons.length}
        defaultOpen={defaultOpen}
      >
        {errorCount > 0 && (
          <p className="text-[11px] text-destructive mb-2">
            ⚠️ {errorCount} cron{errorCount === 1 ? "" : "s"} con errores consecutivos
          </p>
        )}
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
              // NOTE: shared intentionally not set — admin panel is the
              // canonical place to manage shared crons, so controls stay
              // enabled here.
            />
          ))}
        </div>
      </CollapsibleSection>
    </ComicCard>
  );
}

// ── Helpers ───────────────────────────────────────────────────────

function isPendingFresh(expireAt: number | undefined): boolean {
  return !!expireAt && expireAt > Date.now();
}

function applyFilters(crons: CronApi[], search: string, filter: CronFilter): CronApi[] {
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
}
