"use client";

import { useState, useEffect, useMemo } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/router";
import Head from "next/head";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { ComicCard } from "@/components/shared/comic-card";
import { TabGroup } from "@/components/shared/tab-group";
import { StatusPill } from "@/components/shared/status-pill";
import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";
import { useAppStore } from "@/stores/app";
import { AgentsPanel } from "@/components/settings/agents-panel";
import { SkillsPanel } from "@/components/settings/skills-panel";
import { DispatchPanel } from "@/components/settings/dispatch-panel";
import { StrategiesPanel } from "@/components/settings/strategies-panel";
import { RecurringPanel } from "@/components/settings/recurring-panel";
import { ApisConnectorsPanel } from "@/components/settings/ApisConnectorsPanel";
import { TaskIndexPanel } from "@/components/settings/TaskIndexPanel";

interface ClientFull {
  slug: string;
  name: string;
  emoji: string;
  phase: number;
  active: boolean;
  language: string;
  url: string;
  enabledFeatures: string[];
}

const TAB_KEYS = ["apis", "agents", "skills", "dispatch", "strategies", "recurring", "task-index", "clients", "preferences"] as const;
const TAB_ICONS: Record<string, string> = {
  apis: "🔌", agents: "🤖", skills: "🧰", dispatch: "📡",
  strategies: "🎯", recurring: "🔄", "task-index": "📋", clients: "👥", preferences: "⚙️",
};

export default function SettingsPage() {
  const t = useTranslations("settings");
  const tCommon = useTranslations("common");
  const { status: sessionStatus } = useSession();
  const router = useRouter();
  const slug = useAppStore((s) => s.selectedClient) || "";
  const queryTab = typeof router.query.tab === "string" ? router.query.tab : null;
  const [activeTab, setActiveTab] = useState("apis");

  const TABS = useMemo(
    () => TAB_KEYS.map((key) => ({
      key,
      label: `${TAB_ICONS[key]} ${t(`tabs.${key}` as Parameters<typeof t>[0])}`,
    })),
    [t]
  );

  // Sync tab from URL query param (only when queryTab changes)
  useEffect(() => {
    if (queryTab && TAB_KEYS.includes(queryTab as typeof TAB_KEYS[number])) {
      setActiveTab(queryTab);
    }
  }, [queryTab]);

  // Wait for session to load
  if (sessionStatus === "loading") {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center py-20">
          <p className="text-muted-foreground">{tCommon("loading")}</p>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <Head><title>{t("title")} — Mission Control</title></Head>

      <h1 className="font-heading text-2xl text-navy mb-1">⚙️ {t("title")}</h1>
      <p className="text-sm text-muted-foreground mb-6">{slug ? `${slug} — ` : ""}{t("subtitle")}</p>

      <TabGroup tabs={TABS} activeTab={activeTab} onChange={(key) => {
        setActiveTab(key);
        router.replace({ query: { ...router.query, tab: key } }, undefined, { shallow: true });
      }} />

      {activeTab === "apis" && <ApisConnectorsPanel />}
      {activeTab === "agents" && <AgentsPanel />}
      {activeTab === "skills" && <SkillsPanel />}
      {activeTab === "dispatch" && <DispatchPanel />}
      {activeTab === "strategies" && <StrategiesPanel />}
      {activeTab === "recurring" && <RecurringPanel />}
      {activeTab === "task-index" && slug && <TaskIndexPanel slug={slug} />}
      {activeTab === "clients" && <ClientsPanel />}
      {activeTab === "preferences" && <PreferencesPanel />}
    </DashboardLayout>
  );
}

// ============================================================
// Clients Panel — CRUD for clients
// ============================================================

function ClientsPanel() {
  const t = useTranslations("settings");
  const tCommon = useTranslations("common");
  const qc = useQueryClient();
  const { data: clients, isLoading } = useQuery<ClientFull[]>({
    queryKey: ["clients"],
    queryFn: async () => {
      const res = await fetch("/api/clients");
      if (!res.ok) return [];
      const d = await res.json();
      return d.clients || [];
    },
  });

  const toggleActive = useMutation({
    mutationFn: async ({ slug, active }: { slug: string; active: boolean }) => {
      const res = await fetch("/api/clients/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, updates: { active } }),
      });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["clients"] }),
  });

  const updateClient = useMutation({
    mutationFn: async ({ slug, updates }: { slug: string; updates: Record<string, unknown> }) => {
      const res = await fetch("/api/clients/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, updates }),
      });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["clients"] }),
  });

  const [editSlug, setEditSlug] = useState<string | null>(null);

  if (isLoading) return <p className="text-muted-foreground">{t("loadingClients")}</p>;

  const allClients = clients || [];

  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center mb-2">
        <p className="text-sm text-muted-foreground">
          {allClients.filter((c) => c.active).length} activos de {allClients.length} totales
        </p>
      </div>

      {allClients.map((client) => (
        <ComicCard
          key={client.slug}
          className={cn(!client.active && "opacity-50")}
        >
          <div className="flex items-center gap-4">
            {/* Toggle */}
            <button
              onClick={() => toggleActive.mutate({ slug: client.slug, active: !client.active })}
              className={cn(
                "w-11 h-6 rounded-full transition-colors flex-shrink-0 relative",
                client.active ? "bg-sage" : "bg-border"
              )}
              title={client.active ? t("deactivate") : t("activate")}
            >
              <div
                className={cn(
                  "w-5 h-5 rounded-full bg-white border border-ink absolute top-0.5 transition-all",
                  client.active ? "left-5" : "left-0.5"
                )}
              />
            </button>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-lg">{client.emoji || "🏢"}</span>
                <span className="font-heading font-bold text-base">{client.name}</span>
                <StatusPill status={client.active ? "active" : "inactive"} />
              </div>
              <div className="text-xs text-muted-foreground mt-0.5 flex gap-3">
                <span>{client.slug}</span>
                <span>{tCommon("phase")} {client.phase}</span>
                <span>🌐 {client.language || "es"}</span>
                {client.url && <span className="truncate max-w-[200px]">{client.url}</span>}
              </div>
            </div>

            {/* Edit button */}
            <button
              onClick={() => setEditSlug(editSlug === client.slug ? null : client.slug)}
              className="text-xs px-3 py-1 rounded border border-border hover:border-rust text-muted-foreground"
            >
              ✏️ {tCommon("edit")}
            </button>
          </div>

          {/* Inline edit form */}
          {editSlug === client.slug && (
            <ClientEditForm
              client={client}
              onSave={(updates) => {
                updateClient.mutate({ slug: client.slug, updates });
                setEditSlug(null);
              }}
              onCancel={() => setEditSlug(null)}
            />
          )}
        </ComicCard>
      ))}
    </div>
  );
}

function ClientEditForm({
  client,
  onSave,
  onCancel,
}: {
  client: ClientFull;
  onSave: (updates: Record<string, unknown>) => void;
  onCancel: () => void;
}) {
  const t = useTranslations("settings");
  const tCommon = useTranslations("common");
  const [name, setName] = useState(client.name);
  const [emoji, setEmoji] = useState(client.emoji || "");
  const [url, setUrl] = useState(client.url || "");
  const [language, setLanguage] = useState(client.language || "es");
  const [phase, setPhase] = useState(client.phase);

  return (
    <div className="mt-4 pt-4 border-t border-border">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-[10px] font-bold uppercase text-muted-foreground">{t("name")}</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full mt-1 px-3 py-1.5 border-2 border-ink rounded-lg text-sm bg-background"
          />
        </div>
        <div>
          <label className="text-[10px] font-bold uppercase text-muted-foreground">{t("emoji")}</label>
          <input
            value={emoji}
            onChange={(e) => setEmoji(e.target.value)}
            className="w-full mt-1 px-3 py-1.5 border-2 border-ink rounded-lg text-sm bg-background"
          />
        </div>
        <div>
          <label className="text-[10px] font-bold uppercase text-muted-foreground">{t("url")}</label>
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            className="w-full mt-1 px-3 py-1.5 border-2 border-ink rounded-lg text-sm bg-background"
          />
        </div>
        <div>
          <label className="text-[10px] font-bold uppercase text-muted-foreground">{t("clientLanguage")}</label>
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            className="w-full mt-1 px-3 py-1.5 border-2 border-ink rounded-lg text-sm bg-background"
          >
            <option value="es">Español</option>
            <option value="en">English</option>
          </select>
        </div>
        <div>
          <label className="text-[10px] font-bold uppercase text-muted-foreground">{tCommon("phase")}</label>
          <input
            type="number"
            value={phase}
            onChange={(e) => setPhase(Number(e.target.value))}
            className="w-full mt-1 px-3 py-1.5 border-2 border-ink rounded-lg text-sm bg-background"
          />
        </div>
      </div>
      <div className="flex gap-2 mt-3">
        <button
          onClick={() => onSave({ name, emoji, url, language, phase })}
          className="px-4 py-1.5 bg-rust text-white rounded-lg text-sm font-semibold"
        >
          {tCommon("save")}
        </button>
        <button
          onClick={onCancel}
          className="px-4 py-1.5 border border-border rounded-lg text-sm text-muted-foreground"
        >
          {tCommon("cancel")}
        </button>
      </div>
    </div>
  );
}


// ============================================================
// Preferences Panel
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
