"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { useTranslations } from "next-intl";
import Head from "next/head";
import Link from "next/link";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { useGlobalStats } from "@/hooks/useDashboardStats";
import { useClients } from "@/hooks/useClients";
import { useBrandBrain } from "@/hooks/useBrandBrain";
import { StatCard } from "@/components/shared/stat-card";
import { ComicCard } from "@/components/shared/comic-card";
import { ProgressBar } from "@/components/shared/progress-bar";
import { ActivityFeed, type ActivityItem } from "@/components/shared/activity-feed";
import { ActivityBar } from "@/components/dashboard/activity-bar";
import { BrandColumn } from "@/components/dashboard/brand-column";
import { MetricsColumn } from "@/components/dashboard/metrics-column";
import { NextStepsColumn } from "@/components/dashboard/nextsteps-column";
import { useQuery } from "@tanstack/react-query";
import { DocSlideOver } from "@/components/shared/doc-slideover";
import { cn } from "@/lib/utils";

/**
 * /dashboard — global overview across all clients.
 * The per-client variant lives at /dashboard/[slug].
 */
export default function DashboardPage() {
  const t = useTranslations();
  const { data: session } = useSession();
  const isAdmin = (session?.user as { role?: string })?.role === "admin";

  return (
    <DashboardLayout>
      <Head>
        <title>{t("dashboard.title")} — Mission Control</title>
      </Head>
      <GlobalDashboard isAdmin={isAdmin} />
    </DashboardLayout>
  );
}

// ============================================================
// Global Dashboard — All clients overview
// ============================================================

function GlobalDashboard({ isAdmin }: { isAdmin: boolean }) {
  const t = useTranslations();
  const { data: stats, isLoading } = useGlobalStats();
  const { data: clients } = useClients();
  const { data: costs } = useCosts();
  const { data: integrations } = useIntegrationsSummary();

  return (
    <div>
      <h1 className="font-heading text-2xl text-navy mb-1">{t("dashboard.global")}</h1>
      <p className="text-sm text-muted-foreground mb-6">{t("dashboard.allClients")}</p>

      {/* Stats grid — 6 cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4 mb-8">
        <StatCard
          value={isLoading ? "..." : stats?.activeClients ?? 0}
          label={t("dashboard.activeClients")}
          color="text-rust"
          icon="🏢"
        />
        <StatCard
          value={
            isLoading
              ? "..."
              : `${stats?.approvedPillars ?? 0}/${stats?.totalPillars ?? 0}`
          }
          label={t("dashboard.completedPillars")}
          color="text-sage"
          icon="✅"
        />
        <StatCard
          value={isLoading ? "..." : stats?.activeProjects ?? 0}
          label={t("dashboard.activeProjects")}
          color="text-navy"
          icon="📋"
        />
        <StatCard
          value={isLoading ? "..." : stats?.pendingTasks ?? 0}
          label={t("dashboard.pendingTasks")}
          color="text-rust"
          icon="📝"
        />
        <StatCard
          value={isLoading ? "..." : stats?.totalIdeas ?? 0}
          label={t("dashboard.ideas")}
          color="text-yellow-600"
          icon="💡"
        />
        <StatCard
          value={
            costs?.period
              ? `€${costs.total_cost_eur?.toFixed(0)}`
              : "—"
          }
          label={costs?.period ? t("dashboard.costsWithPeriod", { period: costs.period }) : t("dashboard.costs")}
          color={costs?.period ? "text-rust" : "text-muted-foreground"}
          icon="💰"
        />
        <StatCard
          value={
            integrations
              ? `${integrations.connected}/${integrations.connected + integrations.disconnected + integrations.error}`
              : "—"
          }
          label={t("dashboard.integrations")}
          color={integrations ? "text-sage" : "text-muted-foreground"}
          icon="🔌"
        />
      </div>

      {/* System card */}
      <ComicCard className="mb-5">
        <h2 className="font-heading text-base text-navy mb-3">⚡ {t("dashboard.system")}</h2>
        <SystemStatusRows />
      </ComicCard>

      {/* Clients grid */}
      {isAdmin && clients && clients.length > 0 && (
        <>
          <h2 className="font-heading text-lg text-navy mb-3">{t("dashboard.clients")}</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-5">
            {clients
              .filter((c) => c.active)
              .map((client) => (
                <ClientCard
                  key={client.slug}
                  slug={client.slug}
                  name={client.name}
                  emoji={client.emoji || "🏢"}
                  phase={client.phase}
                />
              ))}
          </div>
        </>
      )}

      {/* Costs card */}
      <CostsCard />

      {/* Integrations card */}
      <IntegrationsCard />

      {/* Activity feed */}
      <ComicCard>
        <div className="flex justify-between items-center mb-3">
          <h2 className="font-heading text-base text-navy">{"📡"} {t("dashboard.recentActivity")}</h2>
          <Link
            href="/dashboard/admin/activity"
            className="text-xs font-semibold text-rust hover:underline"
          >
            {t("common.viewAll")} {"→"}
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
}: {
  slug: string;
  name: string;
  emoji: string;
  phase: number;
}) {
  const { data: foundation } = useBrandBrain(slug);

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

  const t = useTranslations("common");

  return (
    <Link
      href={`/dashboard/${slug}`}
      className="block rounded-lg border-[3px] border-ink bg-card p-4 shadow-comic-sm hover:shadow-comic transition-shadow text-left w-full"
    >
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xl">{emoji}</span>
        <span className="font-heading font-bold text-base">{name}</span>
      </div>
      <div className="text-[11px] text-muted-foreground mb-2">
        {t("phase")} {phase} {"·"} {slug}
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
    </Link>
  );
}

function GlobalActivityFeed() {
  const { data } = useQuery<ActivityItem[]>({
    queryKey: ["global-activity"],
    queryFn: async () => {
      const res = await fetch("/api/activity?limit=10");
      if (!res.ok) return [];
      const json = await res.json();
      // The /api/activity response shape is `{ events: [{ id, message,
      // timestamp, time, level, isCron }] }`. ActivityFeed reads `title` and
      // `status`, not `text`/`ok` — the previous mapping shipped wrong field
      // names so the component rendered blank rows for every entry.
      return (json.events || json || []).map((e: Record<string, unknown>) => ({
        id: (e.id as string) || `${e.timestamp || ""}-${e.message || ""}`,
        title: (e.message || e.event || e.raw || "") as string,
        timestamp: (e.timestamp || e.date || "") as string,
        type: e.isCron ? "cron" : ((e.type as string) || "system"),
        client: (e.client || e.slug || undefined) as string | undefined,
        status: ((e.level as string) || (e.status as string) || "ok") as "ok" | "error" | "warning",
      }));
    },
    staleTime: 30_000,
  });

  return <ActivityFeed items={data || []} limit={10} />;
}

// ============================================================
// Client Dashboard V2 — 3-column layout with activity bar
// Faithful replica of legacy view-client with v2-grid
// ============================================================

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- stale duplicate of components/dashboard/client-dashboard.tsx (canonical, used by [slug]/index.tsx); remove in a separate cleanup
function ClientDashboardV2({ slug }: { slug: string }) {
  const t = useTranslations("dashboard");
  const [activeTab, setActiveTab] = useState(0);
  const [docPath, setDocPath] = useState<string | null>(null);

  const tabs = [
    { emoji: "🏢", label: t("brandSnapshot") },
    { emoji: "📈", label: t("metricas") },
    { emoji: "🎯", label: t("nextSteps") },
  ];

  return (
    <div className="flex flex-col h-screen">
      {/* Activity Bar (collapsible terminal) */}
      <ActivityBar slug={slug} />

      {/* Mobile tab bar — visible < lg */}
      <div className="flex lg:hidden bg-card border-b-2 border-ink p-1">
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
      <div className="grid grid-cols-1 lg:grid-cols-3 flex-1 min-h-0 overflow-hidden">
        {/* Col 1: Brand + Foundation */}
        <div
          className={cn(
            "lg:border-r border-border bg-white dark:bg-card flex flex-col min-h-0",
            activeTab !== 0 && "hidden lg:flex"
          )}
        >
          {/* Column header */}
          <div className="flex items-center justify-between px-5 py-3 border-b border-border bg-muted/20">
            <span className="text-xs font-bold">{"🏢"} {t("brandSnapshot")}</span>
            <Link
              href={`/dashboard/${slug}/brand-brain`}
              className="text-[10px] font-semibold text-rust hover:underline"
            >
              {t("brandSnapshot")} {"→"}
            </Link>
          </div>
          {/* Column body */}
          <div className="px-5 py-3 overflow-y-auto flex-1">
            <BrandColumn slug={slug} onOpenDoc={setDocPath} />
          </div>
        </div>

        {/* Col 2: Metrics */}
        <div
          className={cn(
            "lg:border-r border-border bg-white dark:bg-card flex flex-col min-h-0",
            activeTab !== 1 && "hidden lg:flex"
          )}
        >
          <div className="flex items-center justify-between px-5 py-3 border-b border-border bg-muted/20">
            <span className="text-xs font-bold">{"📈"} {t("metricas")}</span>
            <Link
              href={`/dashboard/${slug}/metrics`}
              className="text-[10px] font-semibold text-rust hover:underline"
            >
              {t("title")} {"→"}
            </Link>
          </div>
          <div className="px-5 py-3 overflow-y-auto flex-1">
            <MetricsColumn slug={slug} />
          </div>
        </div>

        {/* Col 3: Next Steps */}
        <div className={cn("bg-white dark:bg-card flex flex-col min-h-0", activeTab !== 2 && "hidden lg:flex")}>
          <div className="flex items-center justify-between px-5 py-3 border-b border-border bg-muted/20">
            <span className="text-xs font-bold">{"🎯"} {t("nextSteps")}</span>
            <Link
              href={`/dashboard/${slug}/projects`}
              className="text-[10px] font-semibold text-rust hover:underline"
            >
              {t("nextSteps")} {"→"}
            </Link>
          </div>
          <div className="px-5 py-3 overflow-y-auto flex-1">
            <NextStepsColumn slug={slug} onOpenDoc={setDocPath} />
          </div>
        </div>
      </div>

      {/* Doc slide-over */}
      <DocSlideOver slug={slug} docPath={docPath} onClose={() => setDocPath(null)} />
    </div>
  );
}

// ============================================================
// Shared hooks for costs & integrations
// ============================================================

interface CostsData {
  period: string;
  total_cost_usd: number;
  total_cost_eur: number;
  total_turns: number;
  total_sessions: number;
  system?: { agents?: Record<string, { cost_usd: number; turns: number; sessions: number }> };
  clients?: Record<string, { cost_usd: number; turns: number; sessions: number }>;
}

interface IntegrationsSummary {
  connected: number;
  disconnected: number;
  error: number;
  clients: { slug: string; name: string; sources: { name: string; status: string }[] }[];
}

function useCosts() {
  return useQuery<CostsData | null>({
    queryKey: ["costs"],
    queryFn: async () => {
      const res = await fetch("/api/system/costs");
      if (!res.ok) return null;
      return res.json();
    },
    staleTime: 60_000,
  });
}

function useIntegrationsSummary() {
  return useQuery<IntegrationsSummary | null>({
    queryKey: ["integrations-summary"],
    queryFn: async () => {
      const res = await fetch("/api/system/integrations-summary");
      if (!res.ok) return null;
      return res.json();
    },
    staleTime: 60_000,
  });
}

// ============================================================
// Costs Card — real data from costs-global.json
// ============================================================

function CostsCard() {
  const t = useTranslations("dashboard");
  const { data } = useCosts();

  return (
    <ComicCard className="mb-5">
      <h2 className="font-heading text-base text-navy mb-3">💰 {t("costsGlobal")}</h2>
      {!data?.period ? (
        <p className="text-xs text-muted-foreground">{t("noCosts")}</p>
      ) : (
        <>
          <div className="flex gap-6 mb-3">
            <div>
              <div className="font-heading text-2xl text-rust">${data.total_cost_usd?.toFixed(2)}</div>
              <div className="text-[10px] text-muted-foreground uppercase">USD · {data.period}</div>
            </div>
            <div>
              <div className="font-heading text-2xl text-navy">€{data.total_cost_eur?.toFixed(2)}</div>
              <div className="text-[10px] text-muted-foreground uppercase">EUR</div>
            </div>
            <div>
              <div className="font-heading text-xl">{data.total_sessions}</div>
              <div className="text-[10px] text-muted-foreground uppercase">{t("sessions")}</div>
            </div>
            <div>
              <div className="font-heading text-xl">{data.total_turns}</div>
              <div className="text-[10px] text-muted-foreground uppercase">{t("turns")}</div>
            </div>
          </div>
          {/* Agent breakdown */}
          {data.system?.agents && (
            <div className="border-t border-border pt-2 mt-2">
              <div className="text-[10px] font-bold uppercase text-muted-foreground mb-1.5">{t("byAgent")}</div>
              <div className="flex gap-4 flex-wrap">
                {Object.entries(data.system.agents).map(([agent, info]) => (
                  <div key={agent} className="text-xs">
                    <span className="font-semibold capitalize">{agent}</span>
                    <span className="text-muted-foreground"> ${info.cost_usd?.toFixed(2)} · {info.turns}t</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {/* Client breakdown */}
          {data.clients && Object.keys(data.clients).length > 0 && (
            <div className="border-t border-border pt-2 mt-2">
              <div className="text-[10px] font-bold uppercase text-muted-foreground mb-1.5">{t("byClient")}</div>
              <div className="flex gap-4 flex-wrap">
                {Object.entries(data.clients).map(([slug, info]) => (
                  <div key={slug} className="text-xs">
                    <span className="font-semibold">{slug}</span>
                    <span className="text-muted-foreground"> ${info.cost_usd?.toFixed(2)} · {info.sessions}s</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </ComicCard>
  );
}

// ============================================================
// Integrations Card — real data from all clients
// ============================================================

function IntegrationsCard() {
  const t = useTranslations("dashboard");
  const { data } = useIntegrationsSummary();

  const SOURCE_NAMES: Record<string, string> = {
    ga4: "GA4", gsc: "Search Console", metricool: "Social",
    "meta-ads": "Meta Ads", meta_ads: "Meta Ads", ghl: "CRM",
    instantly: "Outreach", sheets: "Manual",
  };

  return (
    <ComicCard className="mb-5">
      <h2 className="font-heading text-base text-navy mb-3">🔌 {t("integrationsGlobal")}</h2>
      {!data ? (
        <p className="text-xs text-muted-foreground">{t("connectedCount", { count: "..." })}</p>
      ) : (
        <>
          <div className="flex gap-4 mb-3">
            <div className="flex items-center gap-1.5 text-xs">
              <span className="w-2.5 h-2.5 rounded-full bg-green-500" />
              <span>{t("connectedCount", { count: data.connected })}</span>
            </div>
            <div className="flex items-center gap-1.5 text-xs">
              <span className="w-2.5 h-2.5 rounded-full bg-border" />
              <span>{t("disconnectedCount", { count: data.disconnected })}</span>
            </div>
            {data.error > 0 && (
              <div className="flex items-center gap-1.5 text-xs">
                <span className="w-2.5 h-2.5 rounded-full bg-red-500" />
                <span>{t("errorCount", { count: data.error })}</span>
              </div>
            )}
          </div>
          {data.clients.map((client) => (
            <div key={client.slug} className="flex items-center gap-3 py-1.5 border-t border-border text-xs">
              <span className="font-semibold w-28 truncate">{client.name}</span>
              <div className="flex gap-2 flex-wrap">
                {client.sources.map((src) => (
                  <span
                    key={src.name}
                    className={cn(
                      "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium",
                      src.status === "connected" ? "bg-green-500/10 text-green-700" :
                        src.status === "error" ? "bg-red-500/10 text-red-700" :
                          "bg-muted text-muted-foreground"
                    )}
                  >
                    <span className={cn(
                      "w-1.5 h-1.5 rounded-full",
                      src.status === "connected" ? "bg-green-500" :
                        src.status === "error" ? "bg-red-500" : "bg-muted-foreground"
                    )} />
                    {SOURCE_NAMES[src.name] || src.name}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </>
      )}
    </ComicCard>
  );
}
