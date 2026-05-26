"use client";

import { useCallback, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { ComicCard } from "@/components/shared/comic-card";
import { ApiConnectPanel } from "@/components/settings/api-connect-panel";
import { useAppStore } from "@/stores/app";
import { cn } from "@/lib/utils";

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
    queryKey: ["api-catalog"],
    queryFn: async () => {
      const res = await fetch("/api/system/api-catalog");
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
        result.push({ apiId, meta: apiMeta, catKey, catLabel: catData.label });
      }
    }
    return result;
  }, [catalog, categories]);

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
    return Object.entries(catalog.categories).map(([key, cat]) => ({ key, label: cat.label }));
  }, [catalog, categories]);

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
              <strong>ℹ️ Vista read-only.</strong> Las keys de <strong>sistema</strong>{" "}
              (Anthropic, OpenAI, etc.) se editan a mano en{" "}
              <code className="text-[11px] px-1 py-0.5 rounded bg-amber-100">~/.openclaw/.env</code>{" "}
              por SSH. Las credenciales <strong>por brand</strong> (Metricool, GHL, Meta Ads, …) viven en{" "}
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
