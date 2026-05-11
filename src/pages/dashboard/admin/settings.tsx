"use client";

import { useState, useEffect, useMemo } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/router";
import Head from "next/head";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { ComicCard } from "@/components/shared/comic-card";
import { SlackIntegrationCard } from "@/components/admin/slack-integration-card";
import { TabGroup } from "@/components/shared/tab-group";
import { StatusPill } from "@/components/shared/status-pill";
import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";
import { useAppStore } from "@/stores/app";
import { AgentsPanel } from "@/components/settings/agents-panel";
import { DispatchPanel } from "@/components/settings/dispatch-panel";
import { StrategiesPanel } from "@/components/settings/strategies-panel";
import { RecurringPanel } from "@/components/settings/recurring-panel";
import { ApiConnectPanel } from "@/components/settings/api-connect-panel";

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

const TAB_KEYS = ["apis", "agents", "dispatch", "strategies", "recurring", "clients", "admins", "preferences"] as const;
const TAB_ICONS: Record<string, string> = {
  apis: "🔌", agents: "🤖", dispatch: "📡",
  strategies: "🎯", recurring: "🔄", clients: "👥", admins: "🔐", preferences: "⚙️",
};

export default function SettingsPage() {
  const t = useTranslations("settings");
  const tCommon = useTranslations("common");
  const { data: session, status: sessionStatus } = useSession();
  const router = useRouter();
  const slug = useAppStore((s) => s.selectedClient) || "";
  const queryTab = typeof router.query.tab === "string" ? router.query.tab : null;
  const [activeTab, setActiveTab] = useState("apis");

  const role = (session?.user as { role?: string } | undefined)?.role;
  const isAdmin = role === "admin";

  // Tabs filtered by role — the "admins" tab only renders for admins.
  // The API also enforces this server-side, so a hand-crafted URL can't
  // bypass the gate.
  const visibleTabs = useMemo(
    () => TAB_KEYS.filter((key) => (key === "admins" ? isAdmin : true)),
    [isAdmin]
  );

  const TABS = useMemo(
    () => visibleTabs.map((key) => {
      // "admins" not in translation files; hardcode label for it.
      const label = key === "admins" ? "Admins" : t(`tabs.${key}` as Parameters<typeof t>[0]);
      return { key, label: `${TAB_ICONS[key]} ${label}` };
    }),
    [t, visibleTabs]
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

      {activeTab === "apis" && <ApisPanel />}
      {activeTab === "agents" && <AgentsPanel />}
      {activeTab === "dispatch" && <DispatchPanel />}
      {activeTab === "strategies" && <StrategiesPanel />}
      {activeTab === "recurring" && <RecurringPanel />}
      {activeTab === "clients" && <ClientsPanel />}
      {activeTab === "admins" && isAdmin && <AdminsPanel currentEmail={session?.user?.email || ""} />}
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
// APIs Panel — faithful port of legacy renderClientApisView()
// ============================================================

interface ApiHealth {
  lastCheck: string | null;
  services: Record<string, {
    status: string;
    error?: string;
    details?: { account?: string; username?: string; botName?: string; error?: string };
    lastCheck?: string;
  }>;
}

interface ApiMeta {
  provider: string;
  icon: string;
  desc?: string;
  ownership?: string;
  docs?: string;
  credentials?: Array<{ key: string; label: string }>;
}

interface CatalogCategory {
  label: string;
  apis: Record<string, ApiMeta>;
}

interface ApiCatalog {
  categories: Record<string, CatalogCategory>;
}

function useStatusBadge() {
  const t = useTranslations("settings.apiStatus");
  return (healthStatus: string, ownership: string) => {
    if (ownership === "system") {
      if (healthStatus === "ok") return { dot: "bg-blue-500", label: t("systemKey"), color: "text-blue-600", border: "border-l-blue-500" };
      if (healthStatus === "error") return { dot: "bg-red-500", label: t("error"), color: "text-red-500", border: "border-l-red-500" };
      return { dot: "bg-blue-500", label: t("systemKey"), color: "text-blue-600", border: "border-l-blue-500" };
    }
    if (healthStatus === "ok") return { dot: "bg-green-500", label: t("connected"), color: "text-green-600", border: "border-l-green-500" };
    if (healthStatus === "error") return { dot: "bg-red-500", label: t("error"), color: "text-red-500", border: "border-l-red-500" };
    if (healthStatus === "not-configured") return { dot: "bg-muted-foreground/30", label: t("notConfigured"), color: "text-muted-foreground", border: "border-l-border" };
    return { dot: "bg-muted-foreground/30", label: t("notConfigured"), color: "text-muted-foreground", border: "border-l-border" };
  };
}

function ApisPanel() {
  const statusBadge = useStatusBadge();
  const slug = useAppStore((s) => s.selectedClient) || "";
  const [checking, setChecking] = useState(false);
  const [checkStatus, setCheckStatus] = useState("");
  const [connectSlider, setConnectSlider] = useState<{ apiId: string; provider: string } | null>(null);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const qc = useQueryClient();

  const [checkingService, setCheckingService] = useState<string | null>(null);

  const handleSingleCheck = async (serviceId: string) => {
    setCheckingService(serviceId);
    try {
      const res = await fetch(`/api/system/health-check-all?service=${serviceId}`);
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        console.error(`Health check failed for ${serviceId}:`, data?.error || res.statusText);
      }
      qc.invalidateQueries({ queryKey: ["api-health"] });
    } catch (e) {
      console.error(`Health check error for ${serviceId}:`, e);
    } finally {
      setCheckingService(null);
    }
  };

  const { data: health, isLoading: healthLoading } = useQuery<ApiHealth>({
    queryKey: ["api-health"],
    queryFn: async () => {
      const res = await fetch("/api/system/api-health");
      if (!res.ok) return { lastCheck: null, services: {} };
      return res.json();
    },
    staleTime: 30_000,
  });

  const { data: catalog, isLoading: catalogLoading } = useQuery<ApiCatalog>({
    queryKey: ["api-catalog"],
    queryFn: async () => {
      const res = await fetch("/api/system/api-catalog");
      if (!res.ok) return { categories: {} };
      return res.json();
    },
    staleTime: 120_000,
  });

  const services = health?.services || {};

  // Count statuses from catalog
  let connected = 0, pending = 0, errored = 0, notConfigured = 0;
  if (catalog?.categories) {
    for (const catData of Object.values(catalog.categories)) {
      for (const [apiId, apiMeta] of Object.entries(catData.apis || {})) {
        const svc = services[apiId];
        const st = svc?.status;
        if (st === "ok") connected++;
        else if (st === "error") errored++;
        else notConfigured++;
      }
    }
  }

  // Flatten all APIs with their category for filtering
  const allApis = useMemo(() => {
    if (!catalog?.categories) return [];
    const result: Array<{ apiId: string; meta: ApiMeta; catKey: string; catLabel: string }> = [];
    for (const [catKey, catData] of Object.entries(catalog.categories)) {
      for (const [apiId, apiMeta] of Object.entries(catData.apis || {})) {
        result.push({ apiId, meta: apiMeta, catKey, catLabel: catData.label });
      }
    }
    return result;
  }, [catalog]);

  // Category options for filter
  const categoryOptions = useMemo(() => {
    if (!catalog?.categories) return [];
    return Object.entries(catalog.categories).map(([key, cat]) => ({ key, label: cat.label }));
  }, [catalog]);

  // Resolve status for an API item
  const getApiStatus = (apiId: string, ownership: string) => {
    const svc = services[apiId];
    const st = svc?.status;
    if (ownership === "system") return st === "error" ? "error" : "system";
    if (st === "ok") return "ok";
    if (st === "error") return "error";
    return "not-configured";
  };

  // Filtered APIs
  const filteredApis = useMemo(() => {
    const q = search.toLowerCase().trim();
    return allApis.filter((item) => {
      if (categoryFilter !== "all" && item.catKey !== categoryFilter) return false;
      if (statusFilter !== "all") {
        const resolved = getApiStatus(item.apiId, item.meta.ownership || "system");
        if (statusFilter !== resolved) return false;
      }
      if (!q) return true;
      return (
        item.meta.provider.toLowerCase().includes(q) ||
        (item.meta.desc || "").toLowerCase().includes(q) ||
        item.apiId.toLowerCase().includes(q) ||
        item.catLabel.toLowerCase().includes(q)
      );
    });
  }, [allApis, search, categoryFilter, statusFilter, services]);

  const handleVerifyAll = async () => {
    setChecking(true);
    setCheckStatus("Verificando APIs del sistema...");
    try {
      const res = await fetch("/api/system/health-check-all");
      const data = await res.json();
      if (!data.error) {
        setCheckStatus("✅ Verificación completa");
        qc.invalidateQueries({ queryKey: ["api-health"] });
      } else {
        setCheckStatus("❌ " + data.error);
      }
    } catch (e) {
      setCheckStatus("❌ " + (e instanceof Error ? e.message : "Error"));
    }
    setChecking(false);
  };

  const isLoading = healthLoading || catalogLoading;

  return (
    <div>
      {/* Title + actions */}
      <h2 className="font-heading text-lg text-navy mb-3">🔌 APIs & Servicios</h2>

      <SlackIntegrationCard slug={slug} />

      <div className="flex items-center gap-2 flex-wrap mb-4">
        <button
          onClick={handleVerifyAll}
          disabled={checking}
          className="px-4 py-2 bg-gradient-to-br from-rust to-[#D4734F] text-white border-2 border-ink rounded-md text-[13px] font-bold shadow-comic cursor-pointer hover:shadow-comic-hover hover:-translate-x-px hover:-translate-y-px active:shadow-[1px_1px_0_var(--ink)] active:translate-x-px active:translate-y-px transition-all disabled:opacity-50"
        >
          {checking ? "⏳ Verificando..." : "🔄 Verificar Todo"}
        </button>
        {checkStatus && (
          <span className="text-xs text-muted-foreground">{checkStatus}</span>
        )}
      </div>

      {/* Summary counters */}
      <div className="grid grid-cols-4 gap-3 mb-5">
        <ComicCard className="text-center py-3">
          <div className="text-2xl font-extrabold text-green-600">{connected}</div>
          <div className="text-[11px] text-muted-foreground uppercase tracking-wider">🟢 Conectados</div>
        </ComicCard>
        <ComicCard className="text-center py-3">
          <div className="text-2xl font-extrabold text-yellow-500">{pending}</div>
          <div className="text-[11px] text-muted-foreground uppercase tracking-wider">🟡 Pendientes</div>
        </ComicCard>
        <ComicCard className="text-center py-3">
          <div className="text-2xl font-extrabold text-red-500">{errored}</div>
          <div className="text-[11px] text-muted-foreground uppercase tracking-wider">🔴 Errores</div>
        </ComicCard>
        <ComicCard className="text-center py-3">
          <div className="text-2xl font-extrabold text-muted-foreground">{notConfigured}</div>
          <div className="text-[11px] text-muted-foreground uppercase tracking-wider">⚫ Sin configurar</div>
        </ComicCard>
      </div>

      {/* Search + Category Filter */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div className="relative flex-1 min-w-[220px] max-w-md">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">🔍</span>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar integración..."
            className="w-full pl-9 pr-3 py-2 border-2 border-ink rounded-lg text-sm bg-background focus:border-rust focus:outline-none transition-colors"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground text-xs"
            >
              ✕
            </button>
          )}
        </div>
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="px-3 py-2 border-2 border-ink rounded-lg text-sm bg-background focus:border-rust focus:outline-none transition-colors"
        >
          <option value="all">Todas las categorías</option>
          {categoryOptions.map((cat) => (
            <option key={cat.key} value={cat.key}>{cat.label}</option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-2 border-2 border-ink rounded-lg text-sm bg-background focus:border-rust focus:outline-none transition-colors"
        >
          <option value="all">Todos los estados</option>
          <option value="ok">🟢 Conectado</option>
          <option value="system">🔵 System key</option>
          <option value="error">🔴 Error</option>
          <option value="not-configured">⚫ Sin configurar</option>
        </select>
        {(search || categoryFilter !== "all" || statusFilter !== "all") && (
          <span className="text-xs text-muted-foreground">
            {filteredApis.length} de {allApis.length} integraciones
          </span>
        )}
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Cargando...</p>}

      {/* API Table */}
      {!isLoading && filteredApis.length > 0 && (
        <div className="border-2 border-ink rounded-lg overflow-hidden shadow-comic">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-navy/5 border-b-2 border-ink">
                  <th className="text-left px-3 py-2.5 font-heading text-navy text-xs uppercase tracking-wider">Integración</th>
                  <th className="text-left px-3 py-2.5 font-heading text-navy text-xs uppercase tracking-wider">Categoría</th>
                  <th className="text-left px-3 py-2.5 font-heading text-navy text-xs uppercase tracking-wider">Propiedad</th>
                  <th className="text-left px-3 py-2.5 font-heading text-navy text-xs uppercase tracking-wider">Estado</th>
                  <th className="text-left px-3 py-2.5 font-heading text-navy text-xs uppercase tracking-wider">Última verificación</th>
                  <th className="text-right px-3 py-2.5 font-heading text-navy text-xs uppercase tracking-wider">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filteredApis.map(({ apiId, meta: apiMeta, catLabel }) => {
                  const svc = services[apiId];
                  const healthStatus = svc?.status || "not-configured";
                  const ownership = apiMeta.ownership || "system";
                  const badge = statusBadge(healthStatus, ownership);
                  const isSystem = ownership === "system";
                  const ownerBadgeColor = isSystem ? "bg-blue-600" : "bg-rust";
                  const ownerLabel = isSystem ? "SISTEMA" : "CLIENTE";

                  const lastTested = svc?.lastCheck
                    ? new Date(svc.lastCheck).toLocaleString("es-ES", {
                        hour: "2-digit", minute: "2-digit", day: "2-digit", month: "short",
                      })
                    : "—";

                  const errorMsg = svc?.details?.error || (svc?.status === "error" ? svc?.error : "");

                  return (
                    <tr
                      key={apiId}
                      className={cn(
                        "border-b border-border hover:bg-navy/[0.03] transition-colors",
                        healthStatus === "not-configured" && !isSystem && "opacity-60"
                      )}
                    >
                      {/* Integration name */}
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-2">
                          <span className="text-base">{apiMeta.icon}</span>
                          <div>
                            <div className="font-bold text-sm">{apiMeta.provider}</div>
                            {apiMeta.desc && (
                              <div className="text-[11px] text-muted-foreground leading-tight">{apiMeta.desc}</div>
                            )}
                            {errorMsg && (
                              <div className="text-[11px] text-red-500 leading-tight mt-0.5">
                                ❌ {String(errorMsg).slice(0, 80)}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Category */}
                      <td className="px-3 py-2.5">
                        <span className="text-xs text-muted-foreground">{catLabel}</span>
                      </td>

                      {/* Ownership */}
                      <td className="px-3 py-2.5">
                        <span className={cn("text-[10px] text-white px-1.5 py-0.5 rounded font-semibold", ownerBadgeColor)}>
                          {ownerLabel}
                        </span>
                      </td>

                      {/* Status */}
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-1.5">
                          <span className={cn("w-2 h-2 rounded-full flex-shrink-0", badge.dot)} />
                          <span className={cn("text-xs font-semibold", badge.color)}>{badge.label}</span>
                        </div>
                      </td>

                      {/* Last check */}
                      <td className="px-3 py-2.5">
                        <span className="text-xs text-muted-foreground">{lastTested}</span>
                      </td>

                      {/* Actions */}
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-1.5 justify-end flex-wrap">
                          {slug && (
                            <button
                              onClick={() => setConnectSlider({ apiId, provider: apiMeta.provider })}
                              className="text-[11px] px-2.5 py-1 bg-background border border-border rounded-md cursor-pointer hover:border-rust hover:bg-rust hover:text-white transition-all whitespace-nowrap"
                            >
                              {isSystem ? "🔑 Key propia" : (healthStatus === "not-configured" ? "⚙️ Configurar" : "⚙️ Editar")}
                            </button>
                          )}
                          <button
                            onClick={() => handleSingleCheck(apiId)}
                            disabled={checkingService === apiId}
                            className="text-[11px] px-2.5 py-1 bg-background border border-border rounded-md cursor-pointer hover:border-rust hover:bg-rust hover:text-white transition-all whitespace-nowrap disabled:opacity-50 disabled:cursor-wait"
                          >
                            {checkingService === apiId ? "⏳..." : "🔄 Verificar"}
                          </button>
                          {apiMeta.docs && (
                            <a
                              href={apiMeta.docs}
                              target="_blank"
                              rel="noreferrer"
                              className="text-[11px] px-2.5 py-1 bg-background border border-border rounded-md hover:border-rust hover:text-rust transition-all whitespace-nowrap"
                            >
                              📖 Docs
                            </a>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!isLoading && filteredApis.length === 0 && search && (
        <div className="text-center py-8 text-muted-foreground">
          <p className="text-sm">No se encontraron integraciones para &quot;{search}&quot;</p>
          <button
            onClick={() => { setSearch(""); setCategoryFilter("all"); setStatusFilter("all"); }}
            className="text-xs text-rust hover:underline mt-1"
          >
            Limpiar filtros
          </button>
        </div>
      )}

      {/* Connect Slider — native React panel */}
      {connectSlider && slug && (
        <div
          className="fixed inset-0 z-50 flex justify-end"
          onClick={() => { setConnectSlider(null); qc.invalidateQueries({ queryKey: ["api-health"] }); }}
        >
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/30" />

          {/* Slider panel */}
          <div
            className="relative w-full max-w-[640px] h-full bg-card shadow-2xl flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
              <h3 className="font-heading text-base text-navy">
                🔌 Conectar {connectSlider.provider}
              </h3>
              <button
                onClick={() => { setConnectSlider(null); qc.invalidateQueries({ queryKey: ["api-health"] }); }}
                className="text-muted-foreground hover:text-foreground text-lg leading-none px-1"
              >
                ✕
              </button>
            </div>

            {/* Native connect panel */}
            <div className="flex-1 overflow-y-auto">
              <ApiConnectPanel
                slug={slug}
                apiId={connectSlider.apiId}
                onClose={() => { setConnectSlider(null); qc.invalidateQueries({ queryKey: ["api-health"] }); }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// Admins Panel — manage external admin allowlist (adminEmails)
// ============================================================

function AdminsPanel({ currentEmail }: { currentEmail: string }) {
  const qc = useQueryClient();
  const [newEmail, setNewEmail] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const { data, isLoading } = useQuery<{ emails: string[] }>({
    queryKey: ["admin-emails"],
    queryFn: async () => {
      const res = await fetch("/api/admin/admins");
      if (!res.ok) throw new Error("Failed to load admins");
      return res.json();
    },
  });

  const addMutation = useMutation({
    mutationFn: async (email: string) => {
      const res = await fetch("/api/admin/admins", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "Failed");
      return json;
    },
    onSuccess: () => {
      setNewEmail("");
      setErrorMsg(null);
      qc.invalidateQueries({ queryKey: ["admin-emails"] });
    },
    onError: (e: Error) => setErrorMsg(e.message),
  });

  const removeMutation = useMutation({
    mutationFn: async (email: string) => {
      const res = await fetch("/api/admin/admins", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "Failed");
      return json;
    },
    onSuccess: () => {
      setErrorMsg(null);
      qc.invalidateQueries({ queryKey: ["admin-emails"] });
    },
    onError: (e: Error) => setErrorMsg(e.message),
  });

  const emails = data?.emails || [];

  function handleAdd() {
    const e = newEmail.trim();
    if (!e) return;
    addMutation.mutate(e);
  }

  function handleRemove(email: string) {
    // Guard: don't let user remove themselves
    if (email.toLowerCase() === currentEmail.toLowerCase()) {
      setErrorMsg("No puedes quitarte a ti mismo de la lista de admins.");
      return;
    }
    if (!confirm(`¿Quitar ${email} de la lista de admins?`)) return;
    removeMutation.mutate(email);
  }

  return (
    <div>
      <h2 className="font-heading text-lg text-navy mb-1">🔐 Administradores</h2>
      <p className="text-xs text-muted-foreground mb-5">
        Personas externas con acceso de administrador. Las cuentas <code className="text-rust">@growth4u.io</code> son admin automáticamente y no necesitan estar en esta lista.
      </p>

      {/* Add form */}
      <ComicCard className="mb-4">
        <div>
          <label className="block text-[10px] font-bold uppercase text-muted-foreground mb-1">
            Agregar admin externo
          </label>
          <div className="flex gap-2">
            <input
              type="email"
              value={newEmail}
              onChange={(e) => { setNewEmail(e.target.value); setErrorMsg(null); }}
              onKeyDown={(e) => { if (e.key === "Enter") handleAdd(); }}
              placeholder="email@dominio.com"
              className="flex-1 px-3 py-1.5 border-2 border-ink rounded-lg text-sm bg-background"
              disabled={addMutation.isPending}
            />
            <button
              onClick={handleAdd}
              disabled={addMutation.isPending || !newEmail.trim()}
              className="px-4 py-1.5 bg-rust text-white border-2 border-ink rounded-md text-sm font-bold shadow-comic hover:shadow-comic-hover hover:-translate-x-px hover:-translate-y-px active:shadow-[1px_1px_0_var(--ink)] active:translate-x-px active:translate-y-px transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-comic disabled:translate-x-0 disabled:translate-y-0"
            >
              {addMutation.isPending ? "⏳..." : "➕ Agregar"}
            </button>
          </div>
          {errorMsg && (
            <p className="text-xs text-red-500 mt-2">⚠️ {errorMsg}</p>
          )}
        </div>
      </ComicCard>

      {/* List */}
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Cargando...</p>
      ) : emails.length === 0 ? (
        <ComicCard>
          <p className="text-sm text-muted-foreground text-center py-3">
            No hay admins externos. Solo los <code>@growth4u.io</code> tienen acceso de admin.
          </p>
        </ComicCard>
      ) : (
        <div className="space-y-2">
          {emails.map((email) => {
            const isSelf = email.toLowerCase() === currentEmail.toLowerCase();
            return (
              <ComicCard key={email}>
                <div className="flex items-center gap-3">
                  <span className="text-base">🔐</span>
                  <div className="flex-1 min-w-0">
                    <div className="font-mono text-sm truncate">{email}</div>
                    {isSelf && (
                      <div className="text-[10px] text-muted-foreground mt-0.5">(tú mismo)</div>
                    )}
                  </div>
                  <button
                    onClick={() => handleRemove(email)}
                    disabled={isSelf || removeMutation.isPending}
                    className="text-xs px-3 py-1 rounded border border-border hover:border-red-500 hover:text-red-500 text-muted-foreground disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:border-border disabled:hover:text-muted-foreground"
                    title={isSelf ? "No puedes quitarte a ti mismo" : "Quitar admin"}
                  >
                    🗑 Quitar
                  </button>
                </div>
              </ComicCard>
            );
          })}
        </div>
      )}
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
