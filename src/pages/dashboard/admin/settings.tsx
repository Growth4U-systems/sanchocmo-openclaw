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
import { AdminRecurringPanel } from "@/components/settings/admin-recurring-panel";
import { ApisConnectorsPanel } from "@/components/settings/ApisConnectorsPanel";
import { CronModelsSection } from "@/components/settings/models-panel";
import { DataSyncPanel } from "@/components/settings/data-sync-panel";
import { McpTokensPanel } from "@/components/settings/mcp-tokens-panel";

/**
 * /dashboard/admin/settings — global ("all clients") configuration.
 *
 * Shows things that span every brand: the agents catalog, skills
 * catalog, cross-brand recurring task view, and a read-only APIs
 * panel for the global system keys (Anthropic, OpenAI, …). The
 * panel reuses `ApisConnectorsPanel` — without a `selectedClient`
 * it reads from `/api/system/api-health` (no brand overrides) and
 * hides the per-brand "Configurar / Key propia" action.
 *
 * Brand-scoped settings (per-brand overrides, dispatch, strategies,
 * task index) live in /dashboard/[slug]/settings. Clients CRUD and
 * admin allowlist have their own dedicated routes:
 *   - /dashboard/admin/clients
 *   - /dashboard/admin/users
 */

const TAB_KEYS = ["apis", "mcp", "agents", "skills", "recurring", "datasync", "preferences"] as const;
type TabKey = (typeof TAB_KEYS)[number];

const TAB_ICONS: Record<TabKey, string> = {
  apis: "🔌",
  mcp: "🔐",
  agents: "🤖",
  skills: "🧰",
  recurring: "🔄",
  datasync: "⬇️",
  preferences: "⚙️",
};
const DEFAULT_TAB: TabKey = "apis";

// The "Sync with Prod" tab only exists on staging. Prod ships
// NEXT_PUBLIC_ENV_LABEL empty; staging sets it (e.g. "STAGING").
const ENV_LABEL = (process.env.NEXT_PUBLIC_ENV_LABEL || "").trim();
const IS_STAGING = !!ENV_LABEL && !ENV_LABEL.toUpperCase().includes("PROD");

function isTabKey(v: unknown): v is TabKey {
  return typeof v === "string" && (TAB_KEYS as readonly string[]).includes(v);
}

export default function SettingsPage() {
  const t = useTranslations("settings");
  const router = useRouter();
  const queryTab = router.query.tab;
  const [activeTab, setActiveTab] = useState<TabKey>(DEFAULT_TAB);

  const TABS = useMemo(
    () => TAB_KEYS
      .filter((key) => key !== "datasync" || IS_STAGING)
      .map((key) => ({
        key,
        label: `${TAB_ICONS[key]} ${t(`tabs.${key}` as Parameters<typeof t>[0])}`,
      })),
    [t]
  );

  useEffect(() => {
    // Honor ?tab=… but never activate the staging-only datasync tab on prod:
    // it's filtered out of TABS there, so activating it would blank the body.
    if (isTabKey(queryTab) && (queryTab !== "datasync" || IS_STAGING)) {
      setActiveTab(queryTab);
    }
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

      {activeTab === "apis" && <ApisConnectorsPanel />}
      {activeTab === "mcp" && <McpTokensPanel />}
      {activeTab === "agents" && <AgentsPanel />}
      {activeTab === "skills" && <SkillsPanel />}
      {activeTab === "recurring" && (
        <div className="space-y-4">
          <AdminRecurringPanel />
          <CronModelsSection />
        </div>
      )}
      {activeTab === "datasync" && IS_STAGING && <DataSyncPanel />}
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
