import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import Head from "next/head";
import { useTranslations } from "next-intl";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { TabGroup } from "@/components/shared/tab-group";
import { SkillsPanel } from "@/components/settings/skills-panel";
import { RecurringPanel } from "@/components/settings/recurring-panel";

/**
 * /dashboard/[slug]/settings — per-client configuration.
 *
 * Only tabs that operate on a single client live here. Global settings
 * (agents, APIs catalog, dispatch, strategies, clients CRUD, preferences)
 * stay on /dashboard/admin/settings.
 */

const TAB_KEYS = ["skills", "recurring"] as const;
type TabKey = (typeof TAB_KEYS)[number];
const TAB_ICONS: Record<TabKey, string> = { skills: "🧰", recurring: "🔄" };
const DEFAULT_TAB: TabKey = "skills";

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

      {activeTab === "skills" && <SkillsPanel slug={slug} />}
      {activeTab === "recurring" && <RecurringPanel slug={slug} />}
    </DashboardLayout>
  );
}
