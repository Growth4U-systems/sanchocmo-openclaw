import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import Head from "next/head";
import { useTranslations } from "next-intl";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { TitleIcon } from "@/components/layout/title-icon";
import { TabGroup } from "@/components/shared/tab-group";
import { ApisConnectorsPanel } from "@/components/settings/ApisConnectorsPanel";
import { SURFACE_API_PROVIDERS, getSurface } from "@/lib/metrics/surfaces";
import type { SurfaceKey } from "@/lib/metrics/surfaces";
import { AgentsPanel } from "@/components/settings/agents-panel";
import { SkillsPanel } from "@/components/settings/skills-panel";
import { StrategiesPanel } from "@/components/settings/strategies-panel";
import { RecurringPanel } from "@/components/settings/recurring-panel";
import { TaskIndexPanel } from "@/components/settings/TaskIndexPanel";

/**
 * /dashboard/[slug]/settings — per-client configuration.
 *
 * Shows every tab that makes sense scoped to a single brand.
 * Cross-brand admin tabs (clients CRUD, admin allowlist) live in their
 * own routes under /dashboard/admin/.
 */

const TAB_KEYS = [
  "apis",
  "agents",
  "skills",
  "strategies",
  "recurring",
  "task-index",
] as const;
type TabKey = (typeof TAB_KEYS)[number];

const TAB_ICONS: Record<TabKey, string> = {
  apis: "🔌",
  agents: "🤖",
  skills: "🧰",
  strategies: "🎯",
  recurring: "🔄",
  "task-index": "📋",
};
const DEFAULT_TAB: TabKey = "apis";

function isTabKey(v: unknown): v is TabKey {
  return typeof v === "string" && (TAB_KEYS as readonly string[]).includes(v);
}

export default function ClientSettingsPage() {
  const t = useTranslations("settings");
  const router = useRouter();
  const slug = router.query.slug as string | undefined;
  const queryTab = router.query.tab;

  // ?surface=<key> deep-link from Métricas Conexiones rows — scopes the APIs panel to that
  // surface's providers. reputation resolves to [] → activeProviders collapses to no filter
  // (it's automatic and never deep-linked); an unknown key → undefined → no filter.
  const surfaceParam = typeof router.query.surface === "string" ? router.query.surface : undefined;
  const surfaceProviders =
    surfaceParam && surfaceParam in SURFACE_API_PROVIDERS
      ? SURFACE_API_PROVIDERS[surfaceParam as SurfaceKey]
      : undefined;
  const surfaceLabel = surfaceParam ? getSurface(surfaceParam as SurfaceKey)?.name : undefined;
  const clearSurfaceFilter = () => {
    const q = { ...router.query };
    delete q.surface;
    router.replace({ pathname: router.pathname, query: q }, undefined, { shallow: true });
  };

  const TABS = useMemo(
    () => TAB_KEYS.map((key) => ({
      key,
      label: `${TAB_ICONS[key]} ${t(`tabs.${key}` as Parameters<typeof t>[0])}`,
    })),
    [t]
  );

  const [activeTab, setActiveTab] = useState<TabKey>(DEFAULT_TAB);
  useEffect(() => {
    if (isTabKey(queryTab)) setActiveTab(queryTab);
  }, [queryTab]);

  if (!slug) return <DashboardLayout>{null}</DashboardLayout>;

  return (
    <DashboardLayout>
      <Head><title>{t("title")} — {slug} — Mission Control</title></Head>
      <h1 className="font-heading text-2xl text-navy mb-1"><TitleIcon name="settings" />{t("title")}</h1>
      <p className="text-sm text-muted-foreground mb-6">{slug} — {t("subtitle")}</p>

      <TabGroup
        tabs={TABS}
        activeTab={activeTab}
        onChange={(key) => {
          if (!isTabKey(key)) return;
          setActiveTab(key);
          router.replace({ query: { ...router.query, tab: key } }, undefined, { shallow: true });
        }}
      />

      {activeTab === "apis" && (
        <ApisConnectorsPanel
          providers={surfaceProviders}
          filterLabel={surfaceLabel}
          onClearProviders={clearSurfaceFilter}
        />
      )}
      {activeTab === "agents" && <AgentsPanel />}
      {activeTab === "skills" && <SkillsPanel slug={slug} />}
      {activeTab === "strategies" && <StrategiesPanel />}
      {activeTab === "recurring" && <RecurringPanel slug={slug} />}
      {activeTab === "task-index" && <TaskIndexPanel slug={slug} />}
    </DashboardLayout>
  );
}
