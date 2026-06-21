"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { ComicCard } from "@/components/shared/comic-card";
import { ApiConnectPanel } from "@/components/settings/api-connect-panel";
import { RuntimeMotorSection } from "@/components/settings/runtime-motor-section";
import { useAppStore } from "@/stores/app";
import { cn } from "@/lib/utils";
import { isYalcProviderApiId } from "@/lib/yalc/provider-catalog";

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
  /** Global infra credential with no per-client override (e.g. R2). Always uses
   * the system store, even when a client is selected. */
  systemOnly?: boolean;
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

interface SystemEnvField {
  label: string;
  placeholder?: string;
  help?: string;
  masked: string;
  hasValue: boolean;
}

const GATEWAY_ENV_SERVICES = new Set(["anthropic", "openai", "openrouter", "gemini", "xai"]);

function useStatusBadge() {
  const t = useTranslations("settings.apiStatus");
  return (healthStatus: string, ownership: string) => {
    if (ownership === "system") {
      if (healthStatus === "ok") return { dot: "bg-blue-500", label: t("systemKey"), color: "text-blue-600", border: "border-l-blue-500" };
      if (healthStatus === "error") return { dot: "bg-red-500", label: t("error"), color: "text-red-500", border: "border-l-red-500" };
      if (healthStatus === "pending") return { dot: "bg-yellow-500", label: t("pending"), color: "text-yellow-600", border: "border-l-yellow-500" };
      return { dot: "bg-muted-foreground/30", label: t("notConfigured"), color: "text-muted-foreground", border: "border-l-border" };
    }
    if (healthStatus === "ok") return { dot: "bg-green-500", label: t("connected"), color: "text-green-600", border: "border-l-green-500" };
    if (healthStatus === "error") return { dot: "bg-red-500", label: t("error"), color: "text-red-500", border: "border-l-red-500" };
    if (healthStatus === "pending") return { dot: "bg-yellow-500", label: t("pending"), color: "text-yellow-600", border: "border-l-yellow-500" };
    if (healthStatus === "not-configured") return { dot: "bg-muted-foreground/30", label: t("notConfigured"), color: "text-muted-foreground", border: "border-l-border" };
    return { dot: "bg-muted-foreground/30", label: t("notConfigured"), color: "text-muted-foreground", border: "border-l-border" };
  };
}

interface ApisConnectorsPanelProps {
  /**
   * If provided, only APIs whose catalog category key matches this list are shown,
   * and the category selector is hidden. Used by the calendar publishing panel to
   * scope the table to publishing tools (e.g. `["social"]`).
   */
  categories?: string[];
  /**
   * Hide the "🔌 APIs & Servicios" header + "Verificar Todo" button when the
   * panel is embedded inside a sheet that already provides its own header.
   * Defaults to true (Settings preserves its current header).
   */
  showHeader?: boolean;
}

export function ApisConnectorsPanel({ categories, showHeader = true }: ApisConnectorsPanelProps = {}) {
  const statusBadge = useStatusBadge();
  const selectedClient = useAppStore((s) => s.selectedClient);
  const setSelectedClient = useAppStore((s) => s.setSelectedClient);
  const slug = selectedClient || "";
  const [checking, setChecking] = useState(false);
  const [checkStatus, setCheckStatus] = useState("");
  const [connectSlider, setConnectSlider] = useState<{ apiId: string; provider: string } | null>(null);
  const [systemKeySlider, setSystemKeySlider] = useState<{ apiId: string; provider: string } | null>(null);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const qc = useQueryClient();
  const router = useRouter();

  // Deep-link support: `?cat=...` (from the chat error modal / models panel)
  // preselects a category. Only honored on the standalone panel, not embedded
  // scoped views. The Runtime/Motor category is system-scoped, so landing on it
  // forces "all clients" scope — its links target the admin global settings page,
  // and without this the section is gated off (`!slug`) and the panel renders blank.
  useEffect(() => {
    if (categories) return;
    const cat = router.query.cat;
    if (typeof cat !== "string" || !cat) return;
    if (cat === "runtime") setSelectedClient(null);
    setCategoryFilter(cat);
  }, [router.query.cat, categories, setSelectedClient]);

  // Safety net: "runtime" is only valid in system scope. If a client gets selected
  // while it's active, fall back to "all" so the category <select> never holds a
  // value with no matching <option> (which would blank the table area).
  useEffect(() => {
    if (slug && categoryFilter === "runtime") setCategoryFilter("all");
  }, [slug, categoryFilter]);

  const [checkingService, setCheckingService] = useState<string | null>(null);

  const handleSingleCheck = async (serviceId: string) => {
    setCheckingService(serviceId);
    try {
      const res = isYalcProviderApiId(serviceId) && slug
        ? await fetch("/api/system/api-connect", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ slug, apiId: serviceId, testOnly: true }),
          })
        : await fetch(`/api/system/health-check-all?service=${serviceId}`);
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
    queryKey: ["api-health", slug],
    queryFn: async () => {
      const url = slug ? `/api/system/api-health?slug=${slug}` : "/api/system/api-health";
      const res = await fetch(url);
      if (!res.ok) return { lastCheck: null, services: {} };
      return res.json();
    },
    staleTime: 30_000,
  });

  const { data: catalog, isLoading: catalogLoading } = useQuery<ApiCatalog>({
    queryKey: ["api-catalog", slug],
    queryFn: async () => {
      const url = slug ? `/api/system/api-catalog?slug=${encodeURIComponent(slug)}` : "/api/system/api-catalog";
      const res = await fetch(url);
      if (!res.ok) return { categories: {} };
      return res.json();
    },
    staleTime: 120_000,
  });

  const services = useMemo(() => health?.services ?? {}, [health?.services]);

  // Flatten all APIs with their category for filtering. If a categories prop is
  // provided, restrict to that scope up-front so counters + table both reflect
  // only the in-scope APIs.
  const allApis = useMemo(() => {
    if (!catalog?.categories) return [];
    const result: Array<{ apiId: string; meta: ApiMeta; catKey: string; catLabel: string }> = [];
    for (const [catKey, catData] of Object.entries(catalog.categories)) {
      if (categories && !categories.includes(catKey)) continue;
      for (const [apiId, apiMeta] of Object.entries(catData.apis || {})) {
        // The engine providers (anthropic/openai/openrouter/gemini/xai) move into
        // the dedicated "Runtime / Motor" category in system scope, so they don't
        // also show as plain api-key rows there.
        if (!slug && !categories && GATEWAY_ENV_SERVICES.has(apiId)) continue;
        result.push({ apiId, meta: apiMeta, catKey, catLabel: catData.label });
      }
    }
    return result;
  }, [catalog, categories, slug]);

  // Counters scoped to the (potentially filtered) set
  let connected = 0, pending = 0, errored = 0, notConfigured = 0;
  for (const { apiId } of allApis) {
    const svc = services[apiId];
    const st = svc?.status;
    if (st === "ok") connected++;
    else if (st === "pending") pending++;
    else if (st === "error") errored++;
    else notConfigured++;
  }

  // Category options for filter — only when no fixed scope is forced
  const categoryOptions = useMemo(() => {
    if (categories) return [];
    if (!catalog?.categories) return [];
    const opts = Object.entries(catalog.categories).map(([key, cat]) => ({ key, label: cat.label }));
    // Admin/system scope gets a synthetic "Runtime / Motor" category (the chat engine).
    if (!slug) return [{ key: "runtime", label: "🚂 Runtime / Motor" }, ...opts];
    return opts;
  }, [catalog, categories, slug]);

  // The catalog category that holds the engine providers — used to point admins
  // to the Runtime/Motor category, since those rows are moved out of it in system scope.
  const engineCatKey = useMemo(() => {
    if (!catalog?.categories) return null;
    for (const [key, cat] of Object.entries(catalog.categories)) {
      if (Object.keys(cat.apis || {}).some((id) => GATEWAY_ENV_SERVICES.has(id))) return key;
    }
    return null;
  }, [catalog]);

  const getApiStatus = useCallback((apiId: string, ownership: string) => {
    const svc = services[apiId];
    const st = svc?.status;
    if (ownership === "system") {
      if (st === "ok") return "system";
      if (st === "error") return "error";
      if (st === "pending") return "pending";
      return "not-configured";
    }
    if (st === "ok") return "ok";
    if (st === "error") return "error";
    if (st === "pending") return "pending";
    return "not-configured";
  }, [services]);

  const filteredApis = useMemo(() => {
    const q = search.toLowerCase().trim();
    // The "runtime" category is rendered by <RuntimeMotorSection/>, not the
    // generic table — so the generic list is empty under that filter.
    if (categoryFilter === "runtime") return [];
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
  }, [allApis, search, categoryFilter, statusFilter, getApiStatus]);

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
      {showHeader && (
        <>
          <h2 className="font-heading text-lg text-navy mb-3">🔌 APIs & Servicios</h2>

          {!slug && (
            <div className="mb-4 px-3 py-2 rounded-md border border-amber-300 bg-amber-50 text-[12px] text-amber-900 leading-relaxed">
              <strong>ℹ️ APIs de sistema.</strong> Usa <strong>Key sistema</strong>{" "}
              para cargar o rotar claves globales sin mostrar el valor completo. Las credenciales{" "}
              <strong> por brand</strong> (Metricool, GHL, Meta Ads, etc.) viven en{" "}
              <code className="text-[11px] px-1 py-0.5 rounded bg-amber-100">brand/&lt;slug&gt;/.env</code>{" "}
              y se configuran desde la página del brand correspondiente.
            </div>
          )}

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
        </>
      )}

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
        {!categories && (
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
        )}
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-2 border-2 border-ink rounded-lg text-sm bg-background focus:border-rust focus:outline-none transition-colors"
        >
          <option value="all">Todos los estados</option>
          <option value="ok">🟢 Conectado</option>
          <option value="system">🔵 API sistema</option>
          <option value="pending">🟡 Pendiente</option>
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

      {/* Runtime / Motor — engine accounts + primary-model selector (admin/system only) */}
      {categoryFilter === "runtime" && !slug && (
        <RuntimeMotorSection
          onOpenSystemKey={(apiId, provider) => setSystemKeySlider({ apiId, provider })}
        />
      )}

      {/* The engine providers moved to Runtime/Motor — point admins there from their old category. */}
      {!slug && categoryFilter !== "runtime" && (categoryFilter === "all" || categoryFilter === engineCatKey) && (
        <div className="mb-4 px-3 py-2 rounded-md border border-sage/40 bg-sage/5 text-[12px] text-foreground/80 flex items-center gap-2">
          <span>🚂</span>
          <span>
            Los proveedores del motor (Anthropic, OpenAI, OpenRouter, Gemini, xAI) viven en{" "}
            <button
              type="button"
              onClick={() => setCategoryFilter("runtime")}
              className="font-semibold text-rust hover:underline"
            >
              Runtime / Motor
            </button>
            .
          </span>
        </div>
      )}

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
                          {slug && !apiMeta.systemOnly ? (
                            <button
                              onClick={() => setConnectSlider({ apiId, provider: apiMeta.provider })}
                              className="text-[11px] px-2.5 py-1 bg-background border border-border rounded-md cursor-pointer hover:border-rust hover:bg-rust hover:text-white transition-all whitespace-nowrap"
                            >
                              {isSystem ? "🔑 Key propia" : (healthStatus === "not-configured" ? "⚙️ Configurar" : "⚙️ Editar")}
                            </button>
                          ) : isSystem ? (
                            <button
                              onClick={() => setSystemKeySlider({ apiId, provider: apiMeta.provider })}
                              className="text-[11px] px-2.5 py-1 bg-background border border-border rounded-md cursor-pointer hover:border-rust hover:bg-rust hover:text-white transition-all whitespace-nowrap"
                            >
                              🔑 Key sistema
                            </button>
                          ) : null}
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

      {!isLoading && filteredApis.length === 0 && search && categoryFilter !== "runtime" && (
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

      {/* System Key Slider — global admin credentials */}
      {systemKeySlider && !slug && (
        <div
          className="fixed inset-0 z-50 flex justify-end"
          onClick={() => {
            setSystemKeySlider(null);
            qc.invalidateQueries({ queryKey: ["api-health"] });
          }}
        >
          <div className="absolute inset-0 bg-black/30" />

          <div
            className="relative w-full max-w-[560px] h-full bg-card shadow-2xl flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
              <h3 className="font-heading text-base text-navy">
                🔑 Key sistema: {systemKeySlider.provider}
              </h3>
              <button
                onClick={() => {
                  setSystemKeySlider(null);
                  qc.invalidateQueries({ queryKey: ["api-health"] });
                }}
                className="text-muted-foreground hover:text-foreground text-lg leading-none px-1"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 overflow-y-auto">
              <SystemEnvPanel
                apiId={systemKeySlider.apiId}
                provider={systemKeySlider.provider}
                onSaved={() => {
                  qc.invalidateQueries({ queryKey: ["api-health"] });
                  qc.invalidateQueries({ queryKey: ["models-catalog"] });
                }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SystemEnvPanel({
  apiId,
  provider,
  onSaved,
}: {
  apiId: string;
  provider: string;
  onSaved: () => void;
}) {
  const [formValues, setFormValues] = useState<Record<string, string>>({});
  const [visibleFields, setVisibleFields] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  const { data, isLoading, error, refetch } = useQuery<Record<string, SystemEnvField>>({
    queryKey: ["system-env", apiId],
    queryFn: async () => {
      const res = await fetch(`/api/env?service=${encodeURIComponent(apiId)}`);
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload.error || "No se pudo cargar la key");
      return payload;
    },
    staleTime: 10_000,
  });

  const fields = useMemo(() => Object.entries(data || {}), [data]);

  const toggleFieldVisibility = useCallback((key: string) => {
    setVisibleFields((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const handleSave = async () => {
    const vars: Record<string, string> = {};
    for (const [key] of fields) {
      const value = formValues[key]?.trim();
      if (value) vars[key] = value;
    }

    if (Object.keys(vars).length === 0) {
      setResult({ ok: false, message: "Pega una key nueva antes de guardar." });
      return;
    }

    setSaving(true);
    setResult(null);
    try {
      const saveRes = await fetch("/api/env", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ service: apiId, vars }),
      });
      const savePayload = await saveRes.json().catch(() => ({}));
      if (!saveRes.ok) throw new Error(savePayload.error || "No se pudo guardar");

      let restartNote = "";
      if (GATEWAY_ENV_SERVICES.has(apiId)) {
        const restartRes = await fetch("/api/system/restart-gateway");
        const restartPayload = await restartRes.json().catch(() => ({}));
        if (restartRes.ok && restartPayload.ok) {
          restartNote = " Gateway reiniciado para aplicar la credencial.";
        } else {
          restartNote = " Guardado, pero no se pudo reiniciar el gateway; puede requerir deploy o restart.";
        }
      }

      await fetch(`/api/system/health-check-all?service=${encodeURIComponent(apiId)}`).catch(() => null);
      setFormValues({});
      await refetch();
      onSaved();
      setResult({ ok: true, message: `Key guardada sin mostrar el valor completo.${restartNote}` });
    } catch (e) {
      setResult({ ok: false, message: e instanceof Error ? e.message : "Error guardando la key" });
    } finally {
      setSaving(false);
    }
  };

  const anyConfigured = fields.some(([, field]) => field.hasValue);

  const handleRemove = async () => {
    if (
      typeof window !== "undefined" &&
      !window.confirm(
        `¿Quitar la(s) credencial(es) de ${provider}? Se borran del .env del sistema y, si aplica, se reinicia el gateway para dejar de usarlas.`,
      )
    ) {
      return;
    }

    setRemoving(true);
    setResult(null);
    try {
      const delRes = await fetch(`/api/env?service=${encodeURIComponent(apiId)}`, { method: "DELETE" });
      const delPayload = await delRes.json().catch(() => ({}));
      if (!delRes.ok) throw new Error(delPayload.error || "No se pudo quitar la key");

      let restartNote = "";
      if (GATEWAY_ENV_SERVICES.has(apiId)) {
        const restartRes = await fetch("/api/system/restart-gateway");
        const restartPayload = await restartRes.json().catch(() => ({}));
        if (restartRes.ok && restartPayload.ok) {
          restartNote = " Gateway reiniciado para dejar de usar la credencial.";
        } else {
          restartNote = " Quitada, pero no se pudo reiniciar el gateway; puede requerir restart/deploy.";
        }
      }

      await fetch(`/api/system/health-check-all?service=${encodeURIComponent(apiId)}`).catch(() => null);
      setFormValues({});
      await refetch();
      onSaved();
      setResult({ ok: true, message: `Credencial quitada del sistema.${restartNote}` });
    } catch (e) {
      setResult({ ok: false, message: e instanceof Error ? e.message : "Error quitando la key" });
    } finally {
      setRemoving(false);
    }
  };

  return (
    <div className="p-5 space-y-5">
      <div className="rounded-lg border-2 border-ink bg-background p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h4 className="font-heading text-sm text-navy">{provider}</h4>
            <p className="text-xs text-muted-foreground mt-1">
              El valor completo no se muestra. Para rotarla, pega una nueva key y guarda.
            </p>
          </div>
          <span className="text-[10px] text-white px-2 py-1 rounded font-semibold bg-blue-600">
            SISTEMA
          </span>
        </div>
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Cargando key actual...</p>}

      {error instanceof Error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
          {error.message}
        </div>
      )}

      {!isLoading && fields.length === 0 && (
        <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-xs text-yellow-800">
          No hay variables de entorno mapeadas para <strong>{apiId}</strong>.
        </div>
      )}

      {fields.length > 0 && (
        <div className="border-2 border-ink rounded-lg bg-card overflow-hidden">
          <div className="p-4 border-b border-ink bg-background">
            <h4 className="font-heading text-sm text-navy">Credenciales</h4>
          </div>

          <div className="p-4 space-y-4">
            {fields.map(([key, field]) => {
              const isVisible = visibleFields.has(key);
              return (
                <div key={key} className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <label className="block text-sm font-bold text-navy">{field.label || key}</label>
                    <span className="text-[11px] text-muted-foreground font-mono">
                      {field.hasValue ? field.masked : "sin valor"}
                    </span>
                  </div>
                  {field.help && (
                    <p className="text-[11px] leading-snug text-muted-foreground">{field.help}</p>
                  )}
                  <div className="relative">
                    <input
                      type={isVisible ? "text" : "password"}
                      value={formValues[key] || ""}
                      onChange={(e) => setFormValues((prev) => ({ ...prev, [key]: e.target.value }))}
                      placeholder={field.hasValue ? "Pegar nueva key para reemplazar" : field.placeholder || "Pegar key"}
                      autoComplete="off"
                      className="w-full px-3 py-2 border-2 border-ink rounded-lg text-sm bg-background focus:outline-none focus:border-rust pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => toggleFieldVisibility(key)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-navy text-sm"
                      title={isVisible ? "Ocultar" : "Mostrar"}
                    >
                      {isVisible ? "🙈" : "👁️"}
                    </button>
                  </div>
                </div>
              );
            })}

            <div className="flex flex-wrap gap-3">
              <button
                onClick={handleSave}
                disabled={saving || removing}
                className="px-4 py-2 bg-gradient-to-br from-rust to-[#D4734F] text-white border-2 border-ink rounded-lg text-sm font-bold shadow-comic cursor-pointer hover:opacity-90 disabled:opacity-50 transition-opacity"
              >
                {saving ? "Guardando..." : "Guardar y aplicar"}
              </button>
              {anyConfigured && (
                <button
                  onClick={handleRemove}
                  disabled={saving || removing}
                  className="px-4 py-2 border-2 border-red-500 text-red-600 rounded-lg text-sm font-bold bg-card cursor-pointer hover:bg-red-50 disabled:opacity-50 transition-colors"
                  title="Borra la credencial del .env del sistema"
                >
                  {removing ? "Quitando..." : "Quitar key"}
                </button>
              )}
            </div>

            {result && (
              <div
                className={cn(
                  "p-3 rounded-lg border text-xs",
                  result.ok
                    ? "bg-green-50 border-green-200 text-green-700"
                    : "bg-red-50 border-red-200 text-red-700"
                )}
              >
                {result.message}
              </div>
            )}
          </div>
        </div>
      )}

      <p className="text-[11px] text-muted-foreground text-center">
        Se guarda en el entorno del sistema. En staging/prod, sincroniza también el secret del deploy si quieres que sobreviva futuros redeploys.
      </p>
    </div>
  );
}
