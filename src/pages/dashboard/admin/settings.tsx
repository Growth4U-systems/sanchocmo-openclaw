"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/router";
import Head from "next/head";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { ComicCard } from "@/components/shared/comic-card";
import { TabGroup } from "@/components/shared/tab-group";
import { useTranslations } from "next-intl";
import { AgentsPanel } from "@/components/settings/agents-panel";
import { SkillsPanel } from "@/components/settings/skills-panel";
import { RecurringPanel } from "@/components/settings/recurring-panel";

/**
 * /dashboard/admin/settings — global ("all clients") configuration.
 *
 * Only shows things that make sense across every brand: the agents
 * catalog, the skills catalog, and the cross-brand recurring task view.
 * User-level preferences (theme/language/display name) also live here
 * because they apply regardless of the currently selected brand.
 *
 * Brand-scoped settings (APIs, dispatch, strategies, task index) live
 * in /dashboard/[slug]/settings. The clients CRUD and the admin
 * allowlist have their own dedicated routes:
 *   - /dashboard/admin/clients
 *   - /dashboard/admin/users
 */

const TAB_KEYS = ["agents", "skills", "recurring", "preferences"] as const;
type TabKey = (typeof TAB_KEYS)[number];

const TAB_ICONS: Record<TabKey, string> = {
  agents: "🤖",
  skills: "🧰",
  recurring: "🔄",
  preferences: "⚙️",
};
const DEFAULT_TAB: TabKey = "agents";

function isTabKey(v: unknown): v is TabKey {
  return typeof v === "string" && (TAB_KEYS as readonly string[]).includes(v);
}

export default function SettingsPage() {
  const t = useTranslations("settings");
  const router = useRouter();
  const queryTab = router.query.tab;
  const [activeTab, setActiveTab] = useState<TabKey>(DEFAULT_TAB);

  const TABS = useMemo(
    () => TAB_KEYS.map((key) => ({
      key,
      label: `${TAB_ICONS[key]} ${t(`tabs.${key}` as Parameters<typeof t>[0])}`,
    })),
    [t]
  );

  useEffect(() => {
    if (isTabKey(queryTab)) setActiveTab(queryTab);
  }, [queryTab]);

  return (
    <DashboardLayout>
      <Head><title>{t("title")} — Mission Control</title></Head>

      <h1 className="font-heading text-2xl text-navy mb-1">⚙️ {t("title")}</h1>
      <p className="text-sm text-muted-foreground mb-6">{t("subtitle")}</p>

      <TabGroup
        tabs={TABS}
        activeTab={activeTab}
        onChange={(key) => {
          if (!isTabKey(key)) return;
          setActiveTab(key);
          router.replace({ query: { ...router.query, tab: key } }, undefined, { shallow: true });
        }}
      />

      {activeTab === "agents" && <AgentsPanel />}
      {activeTab === "skills" && <SkillsPanel />}
      {activeTab === "recurring" && <RecurringPanel />}
      {activeTab === "preferences" && <PreferencesPanel />}
    </DashboardLayout>
  );
}

// ============================================================
// Preferences Panel — browser-local user preferences
// ============================================================

function PreferencesPanel() {
  const [username, setUsername] = useState(() =>
    typeof window !== "undefined" ? localStorage.getItem("mc-user-name") || "" : ""
  );
  const [lang, setLang] = useState(() =>
    typeof window !== "undefined" ? localStorage.getItem("mc-lang") || "es" : "es"
  );
  const [theme, setTheme] = useState(() =>
    typeof window !== "undefined" ? localStorage.getItem("mc-theme") || "auto" : "auto"
  );

  const savePref = (key: string, value: string) => {
    localStorage.setItem(key, value);
  };

  const applyTheme = (val: string) => {
    setTheme(val);
    savePref("mc-theme", val);
    if (val === "dark") document.documentElement.dataset.theme = "dark";
    else if (val === "light") document.documentElement.dataset.theme = "";
    else document.documentElement.removeAttribute("data-theme");
  };

  return (
    <div>
      <h2 className="font-heading text-lg text-navy mb-3">⚙️ Preferencias</h2>
      <ComicCard>
        <div className="space-y-4">
          <div>
            <label className="block text-[10px] font-bold uppercase text-muted-foreground mb-1">
              Nombre de usuario
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => {
                setUsername(e.target.value);
                savePref("mc-user-name", e.target.value);
              }}
              placeholder="Tu nombre"
              className="w-full max-w-sm px-3 py-1.5 border-2 border-ink rounded-lg text-sm bg-background"
            />
          </div>
          <div>
            <label className="block text-[10px] font-bold uppercase text-muted-foreground mb-1">
              Idioma
            </label>
            <select
              value={lang}
              onChange={(e) => {
                setLang(e.target.value);
                savePref("mc-lang", e.target.value);
              }}
              className="w-full max-w-sm px-3 py-1.5 border-2 border-ink rounded-lg text-sm bg-background"
            >
              <option value="es">🇪🇸 Español</option>
              <option value="en">🇬🇧 English</option>
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-bold uppercase text-muted-foreground mb-1">
              Tema
            </label>
            <select
              value={theme}
              onChange={(e) => applyTheme(e.target.value)}
              className="w-full max-w-sm px-3 py-1.5 border-2 border-ink rounded-lg text-sm bg-background"
            >
              <option value="auto">🌗 Auto (sistema)</option>
              <option value="light">☀️ Claro</option>
              <option value="dark">🌙 Oscuro</option>
            </select>
          </div>
          <p className="text-xs text-muted-foreground mt-4">
            Las preferencias se guardan localmente en el navegador.
          </p>
        </div>
      </ComicCard>
    </div>
  );
}
