"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { useTranslations } from "next-intl";
import Head from "next/head";
import Link from "next/link";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { useAppStore } from "@/stores/app";
import { useGlobalStats } from "@/hooks/useDashboardStats";
import { useClients } from "@/hooks/useClients";
import { useFoundation } from "@/hooks/useFoundation";
import { StatCard } from "@/components/shared/stat-card";
import { ComicCard } from "@/components/shared/comic-card";
import { ProgressBar } from "@/components/shared/progress-bar";
import { ActivityFeed, type ActivityItem } from "@/components/shared/activity-feed";
import { ActivityBar } from "@/components/dashboard/activity-bar";
import { BrandColumn } from "@/components/dashboard/brand-column";
import { MetricsColumn } from "@/components/dashboard/metrics-column";
import { NextStepsColumn } from "@/components/dashboard/nextsteps-column";
import { cn } from "@/lib/utils";

// ============================================================
// Dashboard Page — Faithful replica of legacy Mission Control
// Two modes: global (no client) and client V2 (selected client)
// ============================================================

export default function DashboardPage() {
  const t = useTranslations("dashboard");
  const { data: session } = useSession();
  const { selectedClient } = useAppStore();
  const isAdmin = (session?.user as { role?: string })?.role === "admin";

  return (
    <DashboardLayout>
      <Head>
        <title>{t("title")} — Mission Control</title>
      </Head>

      {!selectedClient ? (
        <GlobalDashboard isAdmin={isAdmin} />
      ) : (
        <ClientDashboardV2 slug={selectedClient} />
      )}
    </DashboardLayout>
  );
}

// ============================================================
// Global Dashboard — All clients overview
// ============================================================

function GlobalDashboard({ isAdmin }: { isAdmin: boolean }) {
  const t = useTranslations("dashboard");
  const { data: stats, isLoading } = useGlobalStats();
  const { data: clients } = useClients();
  const { setSelectedClient } = useAppStore();

  return (
    <div>
      <h1 className="font-heading text-2xl text-navy mb-1">Dashboard Global</h1>
      <p className="text-sm text-muted-foreground mb-6">Todos los clientes</p>

      {/* Stats grid — 6 cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
        <StatCard
          value={isLoading ? "..." : stats?.activeClients ?? 0}
          label={t("activeClients")}
          color="text-rust"
          icon="\uD83C\uDFE2"
        />
        <StatCard
          value={
            isLoading
              ? "..."
              : `${stats?.approvedPillars ?? 0}/${stats?.totalPillars ?? 0}`
          }
          label={t("completedPillars")}
          color="text-sage"
          icon="\u2705"
        />
        <StatCard
          value={isLoading ? "..." : stats?.activeProjects ?? 0}
          label={t("activeProjects")}
          color="text-navy"
          icon="\uD83D\uDCCB"
        />
        <StatCard
          value={isLoading ? "..." : stats?.pendingTasks ?? 0}
          label={t("pendingTasks")}
          color="text-rust"
          icon="\uD83D\uDCDD"
        />
        <StatCard
          value={isLoading ? "..." : stats?.totalIdeas ?? 0}
          label="Ideas"
          color="text-yellow-600"
          icon="\uD83D\uDCA1"
        />
        <StatCard
          value="—"
          label="Costes"
          color="text-muted-foreground"
          icon="\uD83D\uDCB0"
        />
      </div>

      {/* System card */}
      <ComicCard className="mb-5">
        <h2 className="font-heading text-base text-navy mb-3">{"\u26A1"} Sistema</h2>
        <SystemStatusRows />
      </ComicCard>

      {/* Clients grid */}
      {isAdmin && clients && clients.length > 0 && (
        <>
          <h2 className="font-heading text-lg text-navy mb-3">Clientes</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-5">
            {clients
              .filter((c) => c.active)
              .map((client) => (
                <ClientCard
                  key={client.slug}
                  slug={client.slug}
                  name={client.name}
                  emoji={client.emoji || "\uD83C\uDFE2"}
                  phase={client.phase}
                  onClick={() => setSelectedClient(client.slug)}
                />
              ))}
          </div>
        </>
      )}

      {/* Costs card */}
      <ComicCard className="mb-5">
        <h2 className="font-heading text-base text-navy">{"\uD83D\uDCB0"} Costes — Global</h2>
        <p className="text-xs text-muted-foreground mt-2">Proximamente</p>
      </ComicCard>

      {/* Integrations card */}
      <ComicCard className="mb-5">
        <h2 className="font-heading text-base text-navy">{"\uD83D\uDD0C"} Integraciones — Global</h2>
        <p className="text-xs text-muted-foreground mt-2">Proximamente</p>
      </ComicCard>

      {/* Activity feed */}
      <ComicCard>
        <div className="flex justify-between items-center mb-3">
          <h2 className="font-heading text-base text-navy">{"\uD83D\uDCE1"} Actividad Reciente</h2>
          <Link
            href="/activity"
            className="text-xs font-semibold text-rust hover:underline"
          >
            Ver todo {"\u2192"}
          </Link>
        </div>
        <GlobalActivityFeed />
      </ComicCard>
    </div>
  );
}

// --- Global sub-components ---

function SystemStatusRows() {
  return (
    <div className="space-y-1.5">
      <StatusRow label="Gateway" status="running" ok />
      <StatusRow label="Discord" status="Connected" ok />
      <StatusRow label="APIs" status="ok" ok />
    </div>
  );
}

function StatusRow({ label, status, ok }: { label: string; status: string; ok: boolean }) {
  return (
    <div className="flex justify-between items-center text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className="flex items-center gap-1.5">
        <span
          className={cn(
            "h-2 w-2 rounded-full",
            ok ? "bg-green-500" : "bg-red-500"
          )}
        />
        {status}
      </span>
    </div>
  );
}

function ClientCard({
  slug,
  name,
  emoji,
  phase,
  onClick,
}: {
  slug: string;
  name: string;
  emoji: string;
  phase: number;
  onClick: () => void;
}) {
  const { data: foundation } = useFoundation(slug);

  // Mini foundation stats
  let fApproved = 0;
  let fTotal = 0;
  if (foundation?.sections) {
    const excluded = ["fast-foundation", "foundation-presentation"];
    for (const [secKey, secData] of Object.entries(foundation.sections)) {
      if (excluded.includes(secKey)) continue;
      for (const [, pInfo] of Object.entries(secData.pillars || {})) {
        if (pInfo.optional) continue;
        fTotal++;
        if (["approved", "done"].includes(pInfo.status)) fApproved++;
      }
    }
  }
  const fPct = fTotal > 0 ? Math.round((fApproved / fTotal) * 100) : 0;

  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-lg border-[3px] border-ink bg-card p-4 shadow-comic-sm hover:shadow-comic transition-shadow text-left w-full"
    >
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xl">{emoji}</span>
        <span className="font-heading font-bold text-base">{name}</span>
      </div>
      <div className="text-[11px] text-muted-foreground mb-2">
        Fase {phase} {"\u00B7"} {slug}
      </div>
      {fTotal > 0 && (
        <div>
          <ProgressBar
            value={fApproved}
            max={fTotal}
            color={fPct >= 80 ? "bg-green-500" : fPct >= 40 ? "bg-yellow-400" : "bg-red-400"}
            height="sm"
          />
          <p className="text-[9px] text-muted-foreground mt-0.5">
            Foundation {fApproved}/{fTotal}
          </p>
        </div>
      )}
    </button>
  );
}

function GlobalActivityFeed() {
  // Placeholder — will be populated from API
  const items: ActivityItem[] = [];
  return <ActivityFeed items={items} limit={10} />;
}

// ============================================================
// Client Dashboard V2 — 3-column layout with activity bar
// Faithful replica of legacy view-client with v2-grid
// ============================================================

function ClientDashboardV2({ slug }: { slug: string }) {
  const [activeTab, setActiveTab] = useState(0);

  const tabs = [
    { emoji: "\uD83C\uDFE2", label: "Brand" },
    { emoji: "\uD83D\uDCC8", label: "Metricas" },
    { emoji: "\uD83C\uDFAF", label: "Pasos" },
  ];

  return (
    <div>
      {/* Activity Bar (collapsible terminal) */}
      <ActivityBar slug={slug} />

      {/* Mobile tab bar — visible < lg */}
      <div className="flex lg:hidden mb-3 bg-card border-2 border-ink rounded-lg p-1">
        {tabs.map((tab, i) => (
          <button
            key={tab.label}
            type="button"
            onClick={() => setActiveTab(i)}
            className={cn(
              "flex-1 px-3 py-2 rounded text-xs font-semibold transition-colors text-center",
              activeTab === i ? "bg-rust text-white" : "hover:bg-muted"
            )}
          >
            {tab.emoji} {tab.label}
          </button>
        ))}
      </div>

      {/* 3-Column Grid — desktop: all visible, mobile: tab-switched */}
      <div className="grid grid-cols-1 lg:grid-cols-3 min-h-[calc(100vh-200px)]">
        {/* Col 1: Brand + Foundation */}
        <div
          className={cn(
            "lg:border-r border-border",
            activeTab !== 0 && "hidden lg:block"
          )}
        >
          {/* Column header */}
          <div className="flex items-center justify-between px-5 py-3 border-b border-border bg-muted/20">
            <span className="text-xs font-bold">{"\uD83C\uDFE2"} Brand Snapshot</span>
            <Link
              href="/foundation"
              className="text-[10px] font-semibold text-rust hover:underline"
            >
              Documents {"\u2192"}
            </Link>
          </div>
          {/* Column body */}
          <div className="px-5 py-3 overflow-y-auto max-h-[calc(100vh-280px)]">
            <BrandColumn slug={slug} />
          </div>
        </div>

        {/* Col 2: Metrics */}
        <div
          className={cn(
            "lg:border-r border-border",
            activeTab !== 1 && "hidden lg:block"
          )}
        >
          <div className="flex items-center justify-between px-5 py-3 border-b border-border bg-muted/20">
            <span className="text-xs font-bold">{"\uD83D\uDCC8"} Metricas</span>
            <Link
              href="/metrics"
              className="text-[10px] font-semibold text-rust hover:underline"
            >
              Dashboard {"\u2192"}
            </Link>
          </div>
          <div className="px-5 py-3 overflow-y-auto max-h-[calc(100vh-280px)]">
            <MetricsColumn slug={slug} />
          </div>
        </div>

        {/* Col 3: Next Steps */}
        <div className={cn(activeTab !== 2 && "hidden lg:block")}>
          <div className="flex items-center justify-between px-5 py-3 border-b border-border bg-muted/20">
            <span className="text-xs font-bold">{"\uD83C\uDFAF"} Proximos Pasos</span>
            <Link
              href="/projects"
              className="text-[10px] font-semibold text-rust hover:underline"
            >
              Ver todo {"\u2192"}
            </Link>
          </div>
          <div className="px-5 py-3 overflow-y-auto max-h-[calc(100vh-280px)]">
            <NextStepsColumn slug={slug} />
          </div>
        </div>
      </div>
    </div>
  );
}
