import { useSession } from "next-auth/react";
import { useTranslations } from "next-intl";
import Head from "next/head";
import Link from "next/link";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { useAppStore } from "@/stores/app";
import { useGlobalStats, useClientStats } from "@/hooks/useDashboardStats";
import { useClients } from "@/hooks/useClients";

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
        <ClientDashboard slug={selectedClient} />
      )}
    </DashboardLayout>
  );
}

function GlobalDashboard({ isAdmin }: { isAdmin: boolean }) {
  const t = useTranslations("dashboard");
  const { data: stats, isLoading } = useGlobalStats();
  const { data: clients } = useClients();
  const { setSelectedClient } = useAppStore();

  return (
    <div>
      <h1 className="font-heading text-2xl text-navy mb-1">Dashboard Global</h1>
      <p className="text-sm text-muted-foreground mb-6">Todos los clientes</p>

      {/* Stats grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <StatCard
          value={isLoading ? "..." : stats?.activeClients ?? 0}
          label={t("activeClients")}
          color="text-rust"
        />
        <StatCard
          value={isLoading ? "..." : `${stats?.approvedPillars ?? 0}/${stats?.totalPillars ?? 0}`}
          label={t("completedPillars")}
          color="text-sage"
        />
        <StatCard
          value={isLoading ? "..." : stats?.activeProjects ?? 0}
          label={t("activeProjects")}
          color="text-navy"
        />
        <StatCard
          value={isLoading ? "..." : stats?.pendingTasks ?? 0}
          label={t("pendingTasks")}
          color="text-rust"
        />
      </div>

      {/* Client cards */}
      {isAdmin && clients && clients.length > 0 && (
        <>
          <h2 className="font-heading text-lg text-navy mb-3">Clientes</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {clients.filter((c) => c.active).map((client) => (
              <button
                key={client.slug}
                onClick={() => setSelectedClient(client.slug)}
                className="rounded-lg border-[3px] border-ink bg-card p-4 shadow-comic-sm hover:shadow-comic transition-shadow text-left"
              >
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xl">{client.emoji || "🏢"}</span>
                  <span className="font-semibold">{client.name}</span>
                </div>
                <div className="text-xs text-muted-foreground">
                  Fase {client.phase} · {client.slug}
                </div>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function ClientDashboard({ slug }: { slug: string }) {
  const t = useTranslations("dashboard");
  const { data: stats, isLoading } = useClientStats(slug);

  return (
    <div>
      <h1 className="font-heading text-2xl text-navy mb-1">
        {stats?.brandSummary?.company_name || slug}
      </h1>
      <p className="text-sm text-muted-foreground mb-6">
        {stats?.brandSummary?.sector || t("title")}
      </p>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <StatCard
          value={isLoading ? "..." : `${stats?.approvedPillars ?? 0}/${stats?.totalPillars ?? 0}`}
          label={t("completedPillars")}
          color="text-sage"
        />
        <StatCard
          value={isLoading ? "..." : stats?.activeProjects ?? 0}
          label={t("activeProjects")}
          color="text-navy"
        />
        <StatCard
          value={isLoading ? "..." : stats?.pendingTasks ?? 0}
          label={t("pendingTasks")}
          color="text-rust"
        />
        <StatCard
          value={isLoading ? "..." : stats?.totalIdeas ?? 0}
          label="Ideas"
          color="text-rust"
        />
      </div>

      {/* Quick links */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <QuickLink href={`/dashboard/${slug}/foundation`} icon="📂" label="Foundation" />
        <QuickLink href={`/dashboard/${slug}/projects`} icon="📋" label="Proyectos" />
        <QuickLink href={`/dashboard/${slug}/ideas`} icon="💡" label="Idea Bank" />
        <QuickLink href={`/dashboard/${slug}/metrics`} icon="📈" label="Métricas" />
      </div>
    </div>
  );
}

function StatCard({
  value,
  label,
  color,
}: {
  value: string | number;
  label: string;
  color: string;
}) {
  return (
    <div className="rounded-lg border-[3px] border-ink bg-card p-4 shadow-comic text-center">
      <p className={`font-heading text-3xl ${color}`}>{value}</p>
      <p className="text-[11px] text-muted-foreground uppercase tracking-wide mt-1">
        {label}
      </p>
    </div>
  );
}

function QuickLink({ href, icon, label }: { href: string; icon: string; label: string }) {
  return (
    <Link
      href={href}
      className="flex items-center gap-2 px-4 py-3 rounded-lg border-2 border-border bg-card hover:border-rust hover:shadow-comic-sm transition-all text-sm font-medium"
    >
      <span>{icon}</span>
      {label}
    </Link>
  );
}
