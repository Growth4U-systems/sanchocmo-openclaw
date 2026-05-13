"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  useImageProviders,
  useUpdateContentConfig,
} from "@/hooks/useContentConfig";
import {
  ScErrorBox,
  ScLabel,
  ScSelect,
  ScToggleCard,
} from "@/components/content/setup/sc-primitives";

/**
 * Contenido editable del panel de "Generación de imagen". Diseñado para
 * vivir DENTRO de un slide-over abierto desde el row resumen, no como
 * sección inline. Por eso no incluye ScCard ni ScHeader — el Sheet provee
 * su propio chrome.
 */
export function ImageGenSetupEditor({ slug }: { slug: string }) {
  const { data, isLoading } = useImageProviders(slug);
  const update = useUpdateContentConfig();
  const [mode, setMode] = useState<"ask" | "fixed">("ask");
  const [providerId, setProviderId] = useState<string>("");
  const [modelId, setModelId] = useState<string>("");

  useEffect(() => {
    if (!data) return;
    setMode(data.config.mode);
    setProviderId(data.config.provider || "");
    setModelId(data.config.model || "");
  }, [data]);

  if (isLoading || !data) {
    return <p className="text-sm" style={{ color: "var(--sc-fg-muted)" }}>Cargando providers...</p>;
  }

  const configured = data.providers.filter((p) => p.configured);
  const selectedProvider = data.providers.find((p) => p.id === providerId);

  function save(next: { mode: "ask" | "fixed"; provider: string | null; model: string | null }) {
    update.mutate({ slug, image_generation: next });
  }

  function handleModeChange(next: "ask" | "fixed") {
    setMode(next);
    if (next === "ask") {
      save({ mode: "ask", provider: null, model: null });
    } else {
      const fallback = providerId || configured[0]?.id || "";
      const fallbackModel =
        modelId || data?.providers.find((p) => p.id === fallback)?.models.find((m) => m.default)?.id || null;
      setProviderId(fallback);
      setModelId(fallbackModel || "");
      if (fallback) save({ mode: "fixed", provider: fallback, model: fallbackModel });
    }
  }

  function handleProviderChange(id: string) {
    setProviderId(id);
    const def = data?.providers.find((p) => p.id === id)?.models.find((m) => m.default)?.id || null;
    setModelId(def || "");
    save({ mode: "fixed", provider: id, model: def });
  }

  function handleModelChange(id: string) {
    setModelId(id);
    save({ mode: "fixed", provider: providerId, model: id });
  }

  return (
    <div className="space-y-5">
      <p className="text-sm" style={{ color: "var(--sc-fg-soft)" }}>
        Por defecto MC usa el provider que elijas. Si lo dejas en &ldquo;preguntar&rdquo;, te lo pregunta cada vez que generes una imagen.
        Para conectar más providers, ve a{" "}
        <Link
          href={`/dashboard/${slug}/settings`}
          className="font-bold underline"
          style={{ color: "var(--sc-rust-500)" }}
        >
          Ajustes → APIs ↗
        </Link>.
      </p>

      <fieldset className="space-y-2">
        <ScLabel>Modo</ScLabel>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <ScToggleCard
            active={mode === "ask"}
            title="Preguntar cada vez"
            description="El usuario elige provider/modelo en el momento."
            onClick={() => handleModeChange("ask")}
          />
          <ScToggleCard
            active={mode === "fixed"}
            title="Usar siempre"
            description="MC genera con el provider fijado, sin preguntar."
            onClick={() => handleModeChange("fixed")}
            disabled={configured.length === 0}
          />
        </div>
      </fieldset>

      {mode === "fixed" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <ScLabel>Provider</ScLabel>
            <ScSelect
              value={providerId}
              onChange={handleProviderChange}
              disabled={update.isPending}
              options={[
                ...(configured.length === 0 ? [{ value: "", label: "— ningún provider conectado —" }] : []),
                ...configured.map((p) => ({ value: p.id, label: p.name })),
              ]}
            />
          </div>
          <div className="space-y-1.5">
            <ScLabel>Modelo</ScLabel>
            <ScSelect
              value={modelId}
              onChange={handleModelChange}
              disabled={!selectedProvider || update.isPending}
              options={(selectedProvider?.models || []).map((m) => ({ value: m.id, label: m.label }))}
            />
          </div>
        </div>
      )}

      <div>
        <ScLabel>Providers disponibles</ScLabel>
        <ul className="space-y-1.5 mt-2">
          {data.providers.map((p) => (
            <li key={p.id} className="flex items-center gap-2.5 text-sm">
              <span
                className="w-2.5 h-2.5 rounded-full border shrink-0"
                style={{
                  background: p.configured ? "var(--sc-sage-500)" : "var(--sc-fg-subtle)",
                  borderColor: "var(--sc-ink)",
                }}
              />
              <span className="font-bold" style={{ color: "var(--sc-ink)" }}>{p.name}</span>
              <span className="text-xs" style={{ color: "var(--sc-fg-muted)" }}>
                {p.configured ? "Conectado" : p.missing || "No configurado"}
              </span>
            </li>
          ))}
        </ul>
      </div>

      {update.isError && <ScErrorBox>{update.error.message}</ScErrorBox>}
    </div>
  );
}
