"use client";

import { useState, useMemo, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface ApiConnectPanelProps {
  slug: string;
  apiId: string;
  onClose: () => void;
}

interface ApiCatalogEntry {
  id: string;
  name: string;
  description?: string;
  docsUrl?: string;
  credentials?: CredentialField[];
  config?: CredentialField[];
  ownership?: "system" | "client";
  authType?: string; // "oauth" | "api_key" | etc.
}

interface CredentialField {
  key: string;
  label: string;
  help?: string;
  sensitive?: boolean;
  required?: boolean;
  placeholder?: string;
}

interface GuideStep {
  title: string;
  instructions: string;
}

interface SetupGuide {
  difficulty: string;
  time: string;
  warning?: string;
  steps: GuideStep[];
}

interface ApiStatus {
  status: "connected" | "error" | "pending" | "not_configured";
  config: Record<string, string>;
  lastTestedAt: string | null;
  lastError: string | null;
  notes: string | null;
  guide: SetupGuide | null;
}

interface ConnectResult {
  ok: boolean;
  testResult?: {
    status: string;
    output?: string;
    error?: string;
  };
  error?: string;
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const OAUTH_API_IDS = ["ga4", "gsc", "google_ads"];

const STATUS_CONFIG: Record<string, { label: string; bg: string; text: string }> = {
  connected:      { label: "Conectado",      bg: "bg-green-500/10",  text: "text-green-700" },
  error:          { label: "Error",          bg: "bg-red-500/10",    text: "text-red-700" },
  pending:        { label: "Pendiente",      bg: "bg-yellow-500/10", text: "text-yellow-700" },
  not_configured: { label: "Sin configurar", bg: "bg-gray-500/10",   text: "text-gray-500" },
};

const DIFFICULTY_CONFIG: Record<string, { bg: string; text: string }> = {
  baja:  { bg: "bg-green-500/10",  text: "text-green-700" },
  media: { bg: "bg-yellow-500/10", text: "text-yellow-700" },
  alta:  { bg: "bg-red-500/10",    text: "text-red-700" },
};

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function ApiConnectPanel({ slug, apiId, onClose }: ApiConnectPanelProps) {
  /* ----- State ----- */
  const [formValues, setFormValues] = useState<Record<string, string>>({});
  const [visibleFields, setVisibleFields] = useState<Set<string>>(new Set());
  const [expandedSteps, setExpandedSteps] = useState<Set<number>>(new Set());
  const [allExpanded, setAllExpanded] = useState(false);
  const [connectResult, setConnectResult] = useState<ConnectResult | null>(null);

  /* ----- Fetch API catalog ----- */
  const { data: catalogData } = useQuery<{ categories: Record<string, { apis: ApiCatalogEntry[] }> }>({
    queryKey: ["system", "api-catalog"],
    queryFn: async () => {
      const res = await fetch("/api/system/api-catalog");
      if (!res.ok) throw new Error("Failed to load catalog");
      return res.json();
    },
  });

  /* ----- Find the specific API in the catalog ----- */
  const apiMeta = useMemo<ApiCatalogEntry | null>(() => {
    if (!catalogData?.categories) return null;
    for (const cat of Object.values(catalogData.categories)) {
      const apis = cat.apis || {};
      if (apiId in apis) return (apis as unknown as Record<string, ApiCatalogEntry>)[apiId];
    }
    return null;
  }, [catalogData, apiId]);

  /* ----- Fetch status + guide ----- */
  const { data: statusData, isLoading: statusLoading } = useQuery<ApiStatus>({
    queryKey: ["system", "api-connect", slug, apiId],
    queryFn: async () => {
      const res = await fetch(`/api/system/api-connect?slug=${slug}&apiId=${apiId}`);
      if (!res.ok) throw new Error("Failed to load status");
      return res.json();
    },
  });

  /* ----- Initialize form from existing config ----- */
  const allFields = useMemo(() => {
    return [...(apiMeta?.credentials || []), ...(apiMeta?.config || [])];
  }, [apiMeta]);

  // Populate form with existing config values (once)
  const initializedRef = useState(false);
  if (statusData?.config && !initializedRef[0]) {
    const initial: Record<string, string> = {};
    for (const field of allFields) {
      if (statusData.config[field.key]) {
        initial[field.key] = statusData.config[field.key];
      }
    }
    if (Object.keys(initial).length > 0) {
      setFormValues((prev) => ({ ...initial, ...prev }));
    }
    initializedRef[1](true);
  }

  /* ----- Mutations ----- */
  const connectMutation = useMutation<ConnectResult, Error, { testOnly?: boolean }>({
    mutationFn: async ({ testOnly }) => {
      const secrets: Record<string, string> = {};
      const config: Record<string, string> = {};

      if (!testOnly) {
        for (const field of allFields) {
          const val = formValues[field.key];
          if (val !== undefined && val !== "") {
            if (field.sensitive) {
              secrets[field.key] = val;
            } else {
              config[field.key] = val;
            }
          }
        }
      }

      const body: Record<string, unknown> = { slug, apiId };
      if (testOnly) {
        body.testOnly = true;
      } else {
        body.config = config;
        body.secrets = secrets;
      }

      const res = await fetch("/api/system/api-connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Request failed" }));
        throw new Error(err.error || "Request failed");
      }
      return res.json();
    },
    onSuccess: (data) => setConnectResult(data),
    onError: (err) => setConnectResult({ ok: false, error: err.message }),
  });

  /* ----- Handlers ----- */
  const updateField = useCallback((key: string, value: string) => {
    setFormValues((prev) => ({ ...prev, [key]: value }));
  }, []);

  const toggleFieldVisibility = useCallback((key: string) => {
    setVisibleFields((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const toggleStep = useCallback((idx: number) => {
    setExpandedSteps((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  }, []);

  const toggleAllSteps = useCallback(() => {
    const guide = statusData?.guide;
    if (!guide) return;
    if (allExpanded) {
      setExpandedSteps(new Set());
    } else {
      setExpandedSteps(new Set(guide.steps.map((_, i) => i)));
    }
    setAllExpanded(!allExpanded);
  }, [allExpanded, statusData?.guide]);

  /* ----- Render helpers ----- */
  const status = statusData?.status || "not_configured";
  const statusCfg = STATUS_CONFIG[status] || STATUS_CONFIG.not_configured;
  const ownership = apiMeta?.ownership || "system";
  const isOAuth = OAUTH_API_IDS.includes(apiId);
  const guide = statusData?.guide;

  /* ----- Loading ----- */
  if (statusLoading) {
    return (
      <div className="p-6 space-y-4">
        <p className="text-sm text-muted-foreground">Cargando configuracion...</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* ---- Status Row ---- */}
      <div className="flex items-center flex-wrap gap-2">
        <span className={cn("text-[11px] px-2.5 py-1 rounded-full font-bold", statusCfg.bg, statusCfg.text)}>
          {statusCfg.label}
        </span>
        <span
          className={cn(
            "text-[11px] px-2.5 py-1 rounded-full font-bold",
            ownership === "client"
              ? "bg-rust/10 text-rust"
              : "bg-blue-500/10 text-blue-600"
          )}
        >
          {ownership === "client" ? "CLIENTE" : "SISTEMA"}
        </span>
        {apiMeta?.docsUrl && (
          <a
            href={apiMeta.docsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[11px] text-blue-600 underline hover:text-blue-800"
          >
            Documentacion
          </a>
        )}
      </div>

      {/* ---- Last test / error ---- */}
      {statusData?.lastTestedAt && (
        <p className="text-[11px] text-muted-foreground">
          Ultimo test: {new Date(statusData.lastTestedAt).toLocaleString("es-ES")}
        </p>
      )}

      {statusData?.lastError && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
          <strong>Error:</strong> {statusData.lastError}
        </div>
      )}

      {/* ---- OAuth note ---- */}
      {isOAuth && (
        <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-700">
          <strong>Nota:</strong> Esta API usa autenticacion OAuth. Necesitas una cuenta de servicio de Google
          o credenciales OAuth configuradas. Consulta la guia de setup para detalles.
        </div>
      )}

      {/* ---- Setup Guide ---- */}
      {guide && guide.steps.length > 0 && (
        <div className="border-2 border-ink rounded-lg bg-card overflow-hidden">
          <div className="p-4 border-b border-ink bg-background">
            <div className="flex items-center justify-between">
              <h3 className="font-heading text-sm text-navy">Instrucciones paso a paso</h3>
              <div className="flex items-center gap-2">
                {guide.difficulty && (
                  <span
                    className={cn(
                      "text-[10px] px-2 py-0.5 rounded font-bold",
                      DIFFICULTY_CONFIG[guide.difficulty]?.bg || "bg-gray-100",
                      DIFFICULTY_CONFIG[guide.difficulty]?.text || "text-gray-600"
                    )}
                  >
                    {guide.difficulty}
                  </span>
                )}
                {guide.time && (
                  <span className="text-[10px] text-muted-foreground font-medium">
                    ~{guide.time}
                  </span>
                )}
              </div>
            </div>
          </div>

          {guide.warning && (
            <div
              className="mx-4 mt-3 p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-xs text-yellow-800 [&_a]:text-blue-600 [&_a]:underline [&_strong]:font-semibold"
              dangerouslySetInnerHTML={{ __html: `<strong>Aviso:</strong> ${guide.warning}` }}
            />
          )}

          <div className="p-4 space-y-2">
            <button
              onClick={toggleAllSteps}
              className="text-[11px] text-blue-600 hover:text-blue-800 font-medium mb-2"
            >
              {allExpanded ? "Colapsar todo" : "Expandir todo"}
            </button>

            {guide.steps.map((step, idx) => (
              <div key={idx} className="border border-ink/30 rounded-lg overflow-hidden">
                <button
                  onClick={() => toggleStep(idx)}
                  className="w-full flex items-center gap-3 p-3 text-left hover:bg-muted/50 transition-colors"
                >
                  <span className="shrink-0 w-6 h-6 rounded-full bg-rust text-white text-[11px] font-bold flex items-center justify-center">
                    {idx + 1}
                  </span>
                  <span className="text-sm font-medium text-navy flex-1">{step.title}</span>
                  <span className="text-muted-foreground text-xs">
                    {expandedSteps.has(idx) ? "▲" : "▼"}
                  </span>
                </button>
                {expandedSteps.has(idx) && (
                  <div
                    className="px-4 pb-3 pl-12 text-xs text-muted-foreground leading-relaxed [&_a]:text-blue-600 [&_a]:underline [&_strong]:text-foreground [&_strong]:font-semibold [&_code]:bg-muted [&_code]:px-1 [&_code]:rounded [&_ol]:list-decimal [&_ol]:pl-4 [&_ul]:list-disc [&_ul]:pl-4 [&_li]:my-0.5"
                    dangerouslySetInnerHTML={{ __html: step.instructions }}
                  />
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ---- Credentials Form ---- */}
      {allFields.length > 0 && (
        <div className="border-2 border-ink rounded-lg bg-card overflow-hidden">
          <div className="p-4 border-b border-ink bg-background">
            <h3 className="font-heading text-sm text-navy">Credenciales</h3>
          </div>

          <div className="p-4 space-y-4">
            {allFields.map((field) => {
              const isSensitive = field.sensitive === true;
              const isVisible = visibleFields.has(field.key);

              return (
                <div key={field.key}>
                  <label className="block text-sm font-bold text-navy mb-0.5">
                    {field.label}
                    {field.required && <span className="text-rust ml-1">*</span>}
                  </label>
                  {field.help && (
                    <p className="text-[11px] text-muted-foreground mb-1.5">{field.help}</p>
                  )}
                  <div className="relative">
                    <input
                      type={isSensitive && !isVisible ? "password" : "text"}
                      value={formValues[field.key] || ""}
                      onChange={(e) => updateField(field.key, e.target.value)}
                      placeholder={field.placeholder || ""}
                      className="w-full px-3 py-2 border-2 border-ink rounded-lg text-sm bg-background focus:outline-none focus:border-rust pr-10"
                    />
                    {isSensitive && (
                      <button
                        type="button"
                        onClick={() => toggleFieldVisibility(field.key)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-navy text-sm"
                        title={isVisible ? "Ocultar" : "Mostrar"}
                      >
                        {isVisible ? "🙈" : "👁️"}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}

            {/* Action buttons */}
            <div className="flex gap-3 pt-2">
              <button
                onClick={() => connectMutation.mutate({ testOnly: false })}
                disabled={connectMutation.isPending}
                className="px-4 py-2 bg-gradient-to-br from-rust to-[#D4734F] text-white border-2 border-ink rounded-lg text-sm font-bold shadow-comic cursor-pointer hover:opacity-90 disabled:opacity-50 transition-opacity"
              >
                {connectMutation.isPending ? "Conectando..." : "Conectar y testear"}
              </button>
              <button
                onClick={() => connectMutation.mutate({ testOnly: true })}
                disabled={connectMutation.isPending}
                className="px-4 py-2 border-2 border-ink rounded-lg text-sm font-medium bg-card hover:border-rust cursor-pointer disabled:opacity-50 transition-colors"
              >
                {connectMutation.isPending ? "Testeando..." : "Solo testear"}
              </button>
            </div>

            {/* Result */}
            {connectResult && (
              <div
                className={cn(
                  "p-3 rounded-lg border text-xs",
                  connectResult.ok
                    ? "bg-green-50 border-green-200 text-green-700"
                    : "bg-red-50 border-red-200 text-red-700"
                )}
              >
                {connectResult.ok ? (
                  <>
                    <strong>Conexion exitosa.</strong>
                    {connectResult.testResult?.output && (
                      <pre className="mt-1 whitespace-pre-wrap text-[11px]">{connectResult.testResult.output}</pre>
                    )}
                  </>
                ) : (
                  <>
                    <strong>Error:</strong>{" "}
                    {connectResult.error || connectResult.testResult?.error || "Error desconocido"}
                    {connectResult.testResult?.output && (
                      <pre className="mt-1 whitespace-pre-wrap text-[11px]">{connectResult.testResult.output}</pre>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ---- Security footer ---- */}
      <p className="text-[11px] text-muted-foreground text-center">
        Las credenciales se guardan en brand/{slug}/.env
      </p>
    </div>
  );
}
