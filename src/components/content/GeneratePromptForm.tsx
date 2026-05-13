"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useGenerateImage } from "@/hooks/useMedia";
import { useImageProviders } from "@/hooks/useContentConfig";

const FALLBACK_RATIOS = [
  { value: "1.91:1", label: "1.91:1 (LinkedIn feed)" },
  { value: "1:1", label: "1:1 (cuadrado)" },
  { value: "9:16", label: "9:16 (vertical)" },
  { value: "16:9", label: "16:9 (paisaje)" },
];

interface GeneratePromptFormProps {
  slug: string;
  ideaId: string;
  channel: string;
  initialPrompt?: string;
  initialAspectRatio?: string;
  initialProviderId?: string;
  initialModel?: string;
  submitLabel?: string;
  onGenerated?: (url: string | undefined) => void;
}

export function GeneratePromptForm({
  slug,
  ideaId,
  channel,
  initialPrompt,
  initialAspectRatio,
  initialProviderId,
  initialModel,
  submitLabel = "✨ Generar",
  onGenerated,
}: GeneratePromptFormProps) {
  const [prompt, setPrompt] = useState(initialPrompt ?? "");
  const [aspectRatio, setAspectRatio] = useState(
    initialAspectRatio ?? FALLBACK_RATIOS[0].value,
  );
  const [providerId, setProviderId] = useState(initialProviderId ?? "");
  const [modelId, setModelId] = useState(initialModel ?? "");

  const generate = useGenerateImage();
  const providersQ = useImageProviders(slug);

  const config = providersQ.data?.config;
  const isFixed = config?.mode === "fixed";
  const configured = useMemo(
    () => (providersQ.data?.providers || []).filter((p) => p.configured),
    [providersQ.data],
  );

  // Resolve which provider drives the form when no explicit override.
  useEffect(() => {
    if (!config || configured.length === 0) return;
    if (initialProviderId) return;
    if (isFixed && config.provider) {
      setProviderId(config.provider);
      const provider = configured.find((p) => p.id === config.provider);
      const model =
        config.model ||
        provider?.models.find((m) => m.default)?.id ||
        provider?.models[0]?.id ||
        "";
      setModelId(model);
    } else if (!providerId) {
      const first = configured[0];
      setProviderId(first.id);
      setModelId(first.models.find((m) => m.default)?.id || first.models[0]?.id || "");
    }
  }, [config, configured, isFixed, providerId, initialProviderId]);

  const selectedProvider = configured.find((p) => p.id === providerId);
  const ratiosForProvider =
    selectedProvider?.capabilities.aspectRatios || FALLBACK_RATIOS.map((r) => r.value);
  const ratioOptions = useMemo(() => {
    return ratiosForProvider.map((r) => ({
      value: r,
      label: FALLBACK_RATIOS.find((f) => f.value === r)?.label || r,
    }));
  }, [ratiosForProvider]);

  // Keep aspectRatio in-bounds when provider changes.
  useEffect(() => {
    if (selectedProvider && !ratiosForProvider.includes(aspectRatio)) {
      setAspectRatio(ratiosForProvider[0]);
    }
  }, [selectedProvider, ratiosForProvider, aspectRatio]);

  function handleGenerate() {
    if (!prompt.trim()) return;
    generate.mutate(
      {
        slug,
        ideaId,
        channel,
        prompt: prompt.trim(),
        aspectRatio,
        providerId: providerId || undefined,
        model: modelId || undefined,
      },
      {
        onSuccess: (data) => {
          if (!initialPrompt) setPrompt("");
          onGenerated?.(data.url);
        },
      },
    );
  }

  return (
    <div className="border border-[#E8E2D9] rounded-lg p-3 space-y-2 bg-[#FAFAF8]">
      <label className="block text-[11px] text-muted-foreground">Prompt</label>
      <textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder="Describe la imagen que quieres generar..."
        rows={3}
        className="w-full border border-[#E8E2D9] rounded-md px-2 py-1.5 text-sm bg-white focus:outline-none focus:border-rust resize-y"
      />

      <div className="flex flex-wrap items-end gap-2">
        {!isFixed && configured.length > 1 && (
          <div className="flex flex-col">
            <label className="text-[10px] text-muted-foreground mb-0.5">Provider</label>
            <select
              value={providerId}
              onChange={(e) => {
                const id = e.target.value;
                setProviderId(id);
                const def =
                  configured.find((p) => p.id === id)?.models.find((m) => m.default)?.id || "";
                setModelId(def);
              }}
              className="border border-[#E8E2D9] rounded-md px-2 py-1 text-xs bg-white"
            >
              {configured.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {!isFixed && selectedProvider && selectedProvider.models.length > 1 && (
          <div className="flex flex-col">
            <label className="text-[10px] text-muted-foreground mb-0.5">Modelo</label>
            <select
              value={modelId}
              onChange={(e) => setModelId(e.target.value)}
              className="border border-[#E8E2D9] rounded-md px-2 py-1 text-xs bg-white"
            >
              {selectedProvider.models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="flex flex-col">
          <label className="text-[10px] text-muted-foreground mb-0.5">Aspect ratio</label>
          <select
            value={aspectRatio}
            onChange={(e) => setAspectRatio(e.target.value)}
            className="border border-[#E8E2D9] rounded-md px-2 py-1 text-xs bg-white"
          >
            {ratioOptions.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </div>

        <div className="flex-1" />
        <button
          type="button"
          onClick={handleGenerate}
          disabled={!prompt.trim() || generate.isPending}
          className="text-xs px-3 py-1.5 bg-gradient-to-br from-[#6E4EF5] to-rust text-white rounded-lg font-medium disabled:opacity-50"
        >
          {generate.isPending ? "Generando..." : submitLabel}
        </button>
      </div>

      <p className="text-[10px] text-muted-foreground flex flex-wrap gap-x-3">
        <span>
          Provider: <strong>{selectedProvider?.name || "—"}</strong>
          {isFixed && <span className="ml-1">(fijado en Setup)</span>}
        </span>
        <span>
          Brand voice de <code>brand-book/visual-identity.md</code> aplicado.
        </span>
        <Link
          href={`/dashboard/${slug}/content-creation?tab=engine`}
          className="text-rust hover:underline ml-auto"
        >
          Cambiar default ↗
        </Link>
      </p>

      {generate.error && (
        <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
          {generate.error instanceof Error
            ? generate.error.message
            : String(generate.error)}
        </div>
      )}
    </div>
  );
}
