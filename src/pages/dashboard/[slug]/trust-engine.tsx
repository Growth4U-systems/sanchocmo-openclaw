import { useRouter } from "next/router";
import { useState, useMemo, useCallback } from "react";
import Head from "next/head";
import { useTranslations } from "next-intl";
import { useQuery } from "@tanstack/react-query";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Timeline, type TimelinePhase } from "@/components/shared/timeline";
import { EmptyState } from "@/components/shared/empty-state";
import { useOpenChat } from "@/hooks/useChat";
import { cn } from "@/lib/utils";

// ============================================================
// Trust Engine constants — ported from legacy mission-control.html
// ============================================================

interface TEModuleDef {
  id: string;
  name: string;
  icon: string;
  cmd: string;
  skill: string;
  file: string; // JSON filename for module data
}

interface TEPhaseDef {
  num: number;
  title: string;
  desc: string;
  modules: TEModuleDef[];
}

const TE_PHASES: TEPhaseDef[] = [
  {
    num: 1,
    title: "Configuraci\u00f3n",
    desc: "Elegir el nicho a analizar y cargar datos del cliente",
    modules: [
      { id: "foundation-import", name: "Choose Niche", icon: "\uD83C\uDFAF", cmd: "trust-engine init", skill: "trust-engine", file: "config.json" },
    ],
  },
  {
    num: 2,
    title: "Auditor\u00eda",
    desc: "Analizar SEO, medios propios y presencia en IA",
    modules: [
      { id: "seo-audit", name: "SEO Audit", icon: "\uD83D\uDD0D", cmd: "trust-engine seo-audit", skill: "trust-engine", file: "seo-audit.json" },
      { id: "own-media-audit", name: "Own Media", icon: "\uD83C\uDF10", cmd: "trust-engine own-media", skill: "trust-engine", file: "own-media-audit.json" },
      { id: "geo-analysis", name: "GEO Analysis", icon: "\uD83E\uDD16", cmd: "trust-engine geo", skill: "trust-engine", file: "geo-analysis.json" },
      { id: "serp-analysis", name: "SERP Analysis", icon: "\uD83D\uDCCA", cmd: "trust-engine serp", skill: "trust-engine", file: "serp-analysis.json" },
    ],
  },
  {
    num: 3,
    title: "An\u00e1lisis",
    desc: "Identificar brechas y generar recomendaciones",
    modules: [
      { id: "gap-analysis", name: "Gap Analysis", icon: "\uD83D\uDD17", cmd: "trust-engine gaps", skill: "trust-engine", file: "gap-analysis.json" },
      { id: "recommendations", name: "Recommendations", icon: "\u2705", cmd: "trust-engine recs", skill: "trust-engine", file: "recommendations.json" },
    ],
  },
  {
    num: 4,
    title: "Acci\u00f3n",
    desc: "Generar activos ejecutables: keywords e influencers",
    modules: [
      { id: "keywords", name: "Keywords", icon: "\uD83D\uDD11", cmd: "trust-engine keywords", skill: "trust-engine", file: "keywords.json" },
      { id: "influencers", name: "Influencers", icon: "\uD83C\uDFAF", cmd: "trust-engine influencers", skill: "trust-engine", file: "influencers.json" },
    ],
  },
];

const TE_MODULES = TE_PHASES.flatMap((p) => p.modules);

type TEStatus = "completed" | "running" | "pending" | "locked" | "error";

// ============================================================
// Types for API responses
// ============================================================

interface TERunState {
  modules: Record<string, {
    status: TEStatus;
    depends_on?: string[];
    last_run?: string;
    error?: string;
  }>;
}

// ============================================================
// Component
// ============================================================

export default function TrustEnginePage() {
  const router = useRouter();
  const slug = router.query.slug as string;
  const t = useTranslations("trustEngine");
  const openChat = useOpenChat();

  // Detail view state
  const [detailModId, setDetailModId] = useState<string | null>(null);

  // Fetch run state
  const { data: runState, isLoading } = useQuery<TERunState>({
    queryKey: ["trust-engine-state", slug],
    queryFn: async () => {
      const res = await fetch(`/api/trust-engine/run-state?slug=${slug}`);
      if (!res.ok) return { modules: {} };
      return res.json();
    },
    enabled: !!slug,
    staleTime: 10_000,
  });

  // Fetch individual module data when viewing detail
  const { data: moduleDetail } = useQuery<Record<string, unknown>>({
    queryKey: ["trust-engine-module", slug, detailModId],
    queryFn: async () => {
      if (!detailModId) return {};
      const mod = TE_MODULES.find((m) => m.id === detailModId);
      if (!mod) return {};
      const res = await fetch(`/api/trust-engine/module?slug=${slug}&file=${mod.file}`);
      if (!res.ok) return {};
      return res.json();
    },
    enabled: !!slug && !!detailModId,
    staleTime: 30_000,
  });

  // Get effective status for a module
  const getStatus = useCallback(
    (modId: string): TEStatus => {
      const mod = runState?.modules?.[modId];
      if (!mod) return "pending";
      if (["completed", "running", "error"].includes(mod.status)) return mod.status;
      const deps = mod.depends_on || [];
      for (const dep of deps) {
        const d = runState?.modules?.[dep];
        if (!d || d.status !== "completed") return "locked";
      }
      return mod.status || "pending";
    },
    [runState]
  );

  // Summary counts
  const counts = useMemo(() => {
    const c: Record<TEStatus, number> = { completed: 0, running: 0, pending: 0, locked: 0, error: 0 };
    TE_MODULES.forEach((m) => c[getStatus(m.id)]++);
    return c;
  }, [getStatus]);

  // Launch a module via chat
  const handleLaunch = useCallback(
    (modId: string) => {
      const mod = TE_MODULES.find((m) => m.id === modId);
      if (!mod) return;
      const phase = TE_PHASES.find((p) => p.modules.some((m) => m.id === modId));
      const phaseIdx = phase ? phase.modules.findIndex((m) => m.id === modId) + 1 : 0;
      const total = phase ? phase.modules.length : 0;
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const cmd = `${mod.cmd} ${slug}${phase ? ` [Fase ${phase.num}: ${phase.title} \u2014 paso ${phaseIdx}/${total}]` : ""}`;

      openChat(slug, {
        threadId: `${slug}:trust-engine`,
        threadName: `Trust Engine \u2014 ${slug}`,
        skill: mod.skill,
        skills: [mod.skill],
        linkedTo: `trust-engine/${modId}`,
        docPath: null,
        threadState: "continue",
      });
    },
    [slug, openChat]
  );

  // Build Timeline phases
  const timelinePhases: TimelinePhase[] = useMemo(() => {
    return TE_PHASES.map((phase) => ({
      number: phase.num,
      title: phase.title,
      description: phase.desc,
      items: phase.modules.map((mod) => {
        const status = getStatus(mod.id);
        const modState = runState?.modules?.[mod.id];
        const lastRun = modState?.last_run
          ? new Date(modState.last_run).toLocaleDateString("es-ES", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
          : undefined;

        const actions: { label: string; variant: "primary" | "secondary" | "navy"; onClick: () => void }[] = [];

        if (status === "completed") {
          actions.push({ label: `\uD83D\uDC41 ${t("viewData")}`, variant: "navy", onClick: () => setDetailModId(mod.id) });
          actions.push({ label: `\uD83D\uDD04 ${t("rerun")}`, variant: "secondary", onClick: () => handleLaunch(mod.id) });
        } else if (status === "pending") {
          actions.push({ label: `\u25B6 ${t("launch")}`, variant: "primary", onClick: () => handleLaunch(mod.id) });
        } else if (status === "error") {
          actions.push({ label: `\uD83D\uDD04 ${t("retry")}`, variant: "primary", onClick: () => handleLaunch(mod.id) });
        }

        // Always add chat button
        actions.push({
          label: "\uD83D\uDCAC Chat",
          variant: "secondary",
          onClick: () => handleLaunch(mod.id),
        });

        return {
          id: mod.id,
          title: mod.name,
          icon: mod.icon,
          description: status === "running" ? "Ejecutando..." : lastRun ? `\u00DAltimo run: ${lastRun}` : undefined,
          status,
          meta: status === "locked"
            ? `Necesita: ${(modState?.depends_on || []).join(", ")}`
            : undefined,
          actions,
        };
      }),
    }));
  }, [getStatus, runState, handleLaunch, t]);

  if (!slug) {
    return (
      <DashboardLayout>
        <EmptyState icon="\uD83D\uDD0D" message={t("selectClient")} />
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <Head>
        <title>{t("title")} — {slug} — Mission Control</title>
      </Head>

      <div className="mb-6">
        <h1 className="font-heading text-2xl text-navy mb-1">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>

      {/* Summary bar */}
      <div className="flex flex-wrap gap-2 mb-6">
        {counts.completed > 0 && (
          <SummaryPill color="bg-sage" label={`${counts.completed} ${t("completed")}`} />
        )}
        {counts.running > 0 && (
          <SummaryPill color="bg-yellow-400" label={`${counts.running} ${t("running")}`} />
        )}
        {counts.pending > 0 && (
          <SummaryPill color="bg-border" label={`${counts.pending} ${t("pending")}`} />
        )}
        {counts.locked > 0 && (
          <SummaryPill color="bg-muted-foreground/30" label={`${counts.locked} ${t("locked")}`} />
        )}
        {counts.error > 0 && (
          <SummaryPill color="bg-destructive" label={`${counts.error} ${t("error")}`} />
        )}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <p className="text-muted-foreground">Cargando Trust Engine...</p>
        </div>
      ) : (
        <>
          {/* Detail view */}
          {detailModId && moduleDetail && (
            <div className="border-[3px] border-ink rounded-lg bg-card p-5 shadow-comic mb-6">
              <div className="flex items-center justify-between mb-4">
                <button
                  onClick={() => setDetailModId(null)}
                  className="px-3 py-1.5 border-2 border-ink rounded-md bg-card text-sm font-semibold hover:bg-muted transition-colors"
                >
                  {"\u2190"} {t("back")}
                </button>
                <h3 className="font-heading text-lg text-navy">
                  {TE_MODULES.find((m) => m.id === detailModId)?.icon}{" "}
                  {TE_MODULES.find((m) => m.id === detailModId)?.name}
                </h3>
              </div>
              <pre className="bg-background border border-border rounded-lg p-4 text-[12px] whitespace-pre-wrap break-all max-h-[60vh] overflow-y-auto">
                {JSON.stringify(moduleDetail, null, 2)}
              </pre>
            </div>
          )}

          {/* Timeline */}
          {!detailModId && <Timeline phases={timelinePhases} />}
        </>
      )}
    </DashboardLayout>
  );
}

// ============================================================
// Summary pill component
// ============================================================

function SummaryPill({ color, label }: { color: string; label: string }) {
  return (
    <div className="inline-flex items-center gap-2 px-3.5 py-1.5 bg-card border border-border rounded-full text-[12px] font-medium">
      <span className={cn("w-2 h-2 rounded-full shrink-0", color)} />
      {label}
    </div>
  );
}
