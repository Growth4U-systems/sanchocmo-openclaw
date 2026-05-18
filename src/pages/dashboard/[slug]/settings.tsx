import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import Head from "next/head";
import { useTranslations } from "next-intl";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { TabGroup } from "@/components/shared/tab-group";
import { ApisConnectorsPanel } from "@/components/settings/ApisConnectorsPanel";
import { AgentsPanel } from "@/components/settings/agents-panel";
import { SkillsPanel } from "@/components/settings/skills-panel";
import { DispatchPanel } from "@/components/settings/dispatch-panel";
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
  "dispatch",
  "strategies",
  "recurring",
  "task-index",
] as const;
type TabKey = (typeof TAB_KEYS)[number];

const TAB_ICONS: Record<TabKey, string> = {
  apis: "🔌",
  agents: "🤖",
  skills: "🧰",
  dispatch: "📡",
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
      <h1 className="font-heading text-2xl text-navy mb-1">⚙️ {t("title")}</h1>
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

      {activeTab === "apis" && <ApisConnectorsPanel />}
      {activeTab === "agents" && <AgentsPanel />}
      {activeTab === "skills" && <SkillsPanel slug={slug} />}
      {activeTab === "dispatch" && <DispatchPanel />}
      {activeTab === "strategies" && <StrategiesPanel />}
      {activeTab === "recurring" && <RecurringPanel slug={slug} />}
      {activeTab === "task-index" && <TaskIndexPanel slug={slug} />}
    </DashboardLayout>
  );
}
