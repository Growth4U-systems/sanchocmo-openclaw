"use client";

import { useState, useMemo, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ComicCard } from "@/components/shared/comic-card";
import { cn } from "@/lib/utils";
import { SettingsSlideOver } from "./settings-slideover";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface Strategy {
  id: string;
  name: string;
  quadrant: string;
  objetivo: string;
  prerequisitos: string;
  tiempoResultado: string;
  b2b: string;
  b2c: string;
  velocidad: string;
  sectores: string[];
  skills: string[];
  objetivos: string[];
  workflow?: Record<string, string>;
  cuandoUsar?: string[];
  cuandoNoUsar?: string[];
}

interface Quadrant {
  id: string;
  label: string;
  icon: string;
}

interface ClientStrategy {
  id: string;
  score: number;
  justification: string;
}

interface StrategiesData {
  strategies: Strategy[];
  quadrants: Quadrant[];
  clientStrategies?: Record<string, ClientStrategy[]>;
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

type FilterKey =
  | "all"
  | "1to1-organic"
  | "1toN-organic"
  | "1to1-paid"
  | "1toN-paid"
  | "transversal"
  | "rapido"
  | "medio"
  | "lento"
  | "active";

const QUADRANT_FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "Todas" },
  { key: "1to1-organic", label: "🤝 1:1 Organic" },
  { key: "1toN-organic", label: "📢 1:Many Organic" },
  { key: "1to1-paid", label: "💰 1:1 Paid" },
  { key: "1toN-paid", label: "💳 1:Many Paid" },
  { key: "transversal", label: "⚙️ Transversal" },
];

const SPEED_FILTERS: { key: FilterKey; label: string }[] = [
  { key: "rapido", label: "⚡ Rápido" },
  { key: "medio", label: "🕐 Medio" },
  { key: "lento", label: "🐢 Lento" },
];

const QUADRANT_ICONS: Record<string, string> = {
  "1to1-organic": "🤝",
  "1toN-organic": "📢",
  "1to1-paid": "💰",
  "1toN-paid": "💳",
  transversal: "⚙️",
};

const SPEED_ICONS: Record<string, string> = {
  rapido: "⚡",
  medio: "🕐",
  lento: "🐢",
};

const WORKFLOW_SECTIONS: { key: string; label: string }[] = [
  { key: "objetivo", label: "🎯 Objetivo" },
  { key: "ideacion", label: "💡 Ideación" },
  { key: "creacion", label: "🔨 Creación" },
  { key: "ejecucion", label: "🚀 Ejecución" },
  { key: "medicion", label: "📊 Medición" },
];

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function getActiveIds(
  clientStrategies?: Record<string, ClientStrategy[]>,
): Set<string> {
  if (!clientStrategies) return new Set();
  const ids = new Set<string>();
  Object.values(clientStrategies).forEach((arr) =>
    arr.forEach((cs) => ids.add(cs.id)),
  );
  return ids;
}

function getClientScore(
  id: string,
  clientStrategies?: Record<string, ClientStrategy[]>,
): { score: number; justification: string } | null {
  if (!clientStrategies) return null;
  for (const arr of Object.values(clientStrategies)) {
    const found = arr.find((cs) => cs.id === id);
    if (found) return { score: found.score, justification: found.justification };
  }
  return null;
}

/* ------------------------------------------------------------------ */
/*  Sub-components                                                     */
/* ------------------------------------------------------------------ */

function StrategyBadge({
  strategy,
  isActive,
  onClick,
}: {
  strategy: Strategy;
  isActive: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "text-xs px-2 py-0.5 rounded border border-ink font-medium transition-colors cursor-pointer",
        isActive
          ? "bg-green-100 text-green-800 border-green-600"
          : "bg-card hover:bg-muted",
      )}
    >
      #{strategy.id}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/*  Strategy Detail (SlideOver content)                                */
/* ------------------------------------------------------------------ */

function StrategyDetailContent({
  strategy,
  clientStrategies,
}: {
  strategy: Strategy;
  clientStrategies?: Record<string, ClientStrategy[]>;
}) {
  const clientInfo = getClientScore(strategy.id, clientStrategies);

  return (
    <div className="space-y-4">
      {/* Properties grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
        <div>
          <span className="text-muted-foreground text-xs block">Objetivo</span>
          <span>{strategy.objetivo}</span>
        </div>
        <div>
          <span className="text-muted-foreground text-xs block">Cuadrante</span>
          <span>{QUADRANT_ICONS[strategy.quadrant]} {strategy.quadrant}</span>
        </div>
        <div>
          <span className="text-muted-foreground text-xs block">Prerequisitos</span>
          <span>{strategy.prerequisitos}</span>
        </div>
        <div>
          <span className="text-muted-foreground text-xs block">Tiempo resultado</span>
          <span>{strategy.tiempoResultado}</span>
        </div>
        <div>
          <span className="text-muted-foreground text-xs block">B2B / B2C</span>
          <span>{strategy.b2b} / {strategy.b2c}</span>
        </div>
        <div>
          <span className="text-muted-foreground text-xs block">Sectores</span>
          <span>{strategy.sectores.join(", ")}</span>
        </div>
      </div>

      {/* Metadata badges */}
      <div className="flex flex-wrap gap-2">
        <span className="text-[10px] px-2 py-0.5 rounded bg-rust/10 text-rust font-semibold border border-rust/20">
          {QUADRANT_ICONS[strategy.quadrant]} {strategy.quadrant}
        </span>
        <span className="text-[10px] px-2 py-0.5 rounded bg-blue-500/10 text-blue-600 font-semibold border border-blue-500/20">
          {SPEED_ICONS[strategy.velocidad]} {strategy.velocidad}
        </span>
        {strategy.b2b !== "no" && (
          <span className="text-[10px] px-2 py-0.5 rounded bg-blue-100 text-blue-800 border border-blue-300">
            B2B
          </span>
        )}
        {strategy.b2c !== "no" && (
          <span className="text-[10px] px-2 py-0.5 rounded bg-purple-100 text-purple-800 border border-purple-300">
            B2C
          </span>
        )}
      </div>

      {/* Skills */}
      {strategy.skills.length > 0 && (
        <div>
          <span className="text-muted-foreground text-xs block mb-1">Skills</span>
          <div className="flex flex-wrap gap-1">
            {strategy.skills.map((s, i) => (
              <span key={s} className="flex items-center gap-1">
                <code className="text-xs bg-background border border-ink rounded px-1.5 py-0.5">
                  {s}
                </code>
                {i < strategy.skills.length - 1 && (
                  <span className="text-muted-foreground text-xs">→</span>
                )}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Objetivos */}
      {strategy.objetivos.length > 0 && (
        <div>
          <span className="text-muted-foreground text-xs block mb-1">Objetivos</span>
          <div className="flex flex-wrap gap-1">
            {strategy.objetivos.map((o) => (
              <span
                key={o}
                className="text-xs px-2 py-0.5 rounded-full bg-muted border border-ink"
              >
                {o}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Workflow */}
      {strategy.workflow && Object.keys(strategy.workflow).length > 0 && (
        <div className="space-y-2">
          <span className="text-muted-foreground text-xs block">Workflow</span>
          {WORKFLOW_SECTIONS.map(({ key, label }) => {
            const content = strategy.workflow?.[key];
            if (!content) return null;
            return (
              <details key={key} className="group">
                <summary className="cursor-pointer text-sm font-medium hover:text-rust transition-colors">
                  {label}
                </summary>
                <p className="text-sm text-muted-foreground mt-1 ml-4 whitespace-pre-wrap">
                  {content}
                </p>
              </details>
            );
          })}
        </div>
      )}

      {/* When to use */}
      {strategy.cuandoUsar && strategy.cuandoUsar.length > 0 && (
        <div className="border-l-4 border-green-500 bg-green-50 rounded p-3">
          <span className="text-xs font-bold text-green-800 block mb-1">
            ✅ Cuándo usar
          </span>
          <ul className="text-xs text-green-900 space-y-0.5 list-disc list-inside">
            {strategy.cuandoUsar.map((item, i) => (
              <li key={i}>{item}</li>
            ))}
          </ul>
        </div>
      )}

      {/* When NOT to use */}
      {strategy.cuandoNoUsar && strategy.cuandoNoUsar.length > 0 && (
        <div className="border-l-4 border-red-500 bg-red-50 rounded p-3">
          <span className="text-xs font-bold text-red-800 block mb-1">
            ❌ Cuándo NO usar
          </span>
          <ul className="text-xs text-red-900 space-y-0.5 list-disc list-inside">
            {strategy.cuandoNoUsar.map((item, i) => (
              <li key={i}>{item}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Client score */}
      {clientInfo && (
        <div className="border-l-4 border-green-500 bg-card rounded p-3">
          <span className="text-xs font-bold text-green-700 block">
            🌟 Activa para cliente - Score: {clientInfo.score}
          </span>
          <p className="text-xs text-muted-foreground mt-1">
            {clientInfo.justification}
          </p>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main component                                                     */
/* ------------------------------------------------------------------ */

export function StrategiesPanel() {
  const qc = useQueryClient();

  const { data, isLoading } = useQuery<StrategiesData>({
    queryKey: ["system", "strategies"],
    queryFn: async () => {
      const res = await fetch("/api/system/strategies");
      if (!res.ok) throw new Error("Failed to fetch strategies");
      return res.json();
    },
  });

  const [filter, setFilter] = useState<FilterKey>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const strategies = data?.strategies ?? [];
  const clientStrategies = data?.clientStrategies;
  const activeIds = useMemo(
    () => getActiveIds(clientStrategies),
    [clientStrategies],
  );

  const selectedStrategy = useMemo(
    () => strategies.find((s) => s.id === selectedId) ?? null,
    [strategies, selectedId],
  );

  // ── Fetch strategy markdown for editing ──
  const { data: strategyDetail } = useQuery<{ id: string; name: string; markdown: string }>({
    queryKey: ["system", "strategy", selectedId],
    queryFn: async () => {
      const res = await fetch(`/api/system/strategies?id=${selectedId}`);
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!selectedId,
  });

  // ── Save mutation ──
  const saveMutation = useMutation({
    mutationFn: async (body: { strategyId: string; content: string }) => {
      const res = await fetch("/api/system/strategies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["system", "strategies"] });
      if (selectedId) {
        qc.invalidateQueries({ queryKey: ["system", "strategy", selectedId] });
      }
    },
  });

  const handleSave = useCallback(async (_fileName: string, content: string) => {
    if (!selectedId) return;
    await saveMutation.mutateAsync({ strategyId: selectedId, content });
  }, [selectedId, saveMutation]);

  // ── Files for SlideOver ──
  const slideFiles = useMemo(() => {
    if (!strategyDetail?.markdown) return [];
    return [{ name: `strategy-${strategyDetail.id}.md`, content: strategyDetail.markdown }];
  }, [strategyDetail]);

  /* ---- Filtering ---- */
  const filtered = useMemo(() => {
    if (filter === "all") return strategies;
    if (filter === "active")
      return strategies.filter((s) => activeIds.has(s.id));
    if (["rapido", "medio", "lento"].includes(filter))
      return strategies.filter((s) => s.velocidad === filter);
    return strategies.filter((s) => s.quadrant === filter);
  }, [strategies, filter, activeIds]);

  /* ---- Hormozi grid helpers ---- */
  function strategiesInQuadrant(q: string) {
    return strategies.filter((s) => s.quadrant === q);
  }

  const handleSelectStrategy = useCallback((id: string) => {
    setSelectedId(id);
  }, []);

  if (isLoading) {
    return (
      <section className="space-y-4">
        <div>
          <h2 className="font-heading text-xl text-navy">🎯 Estrategias GTM</h2>
          <p className="text-sm text-muted-foreground">Cargando...</p>
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="font-heading text-xl text-navy">🎯 Estrategias GTM</h2>
        <p className="text-sm text-muted-foreground">
          Catálogo Hormozi Core Four — {strategies.length} estrategias
        </p>
      </div>

      {/* Hormozi Grid (Core Four Matrix) */}
      <ComicCard className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-ink">
              <th className="text-left p-2 font-heading text-navy" />
              <th className="text-left p-2 font-heading text-navy">
                Organic (tiempo)
              </th>
              <th className="text-left p-2 font-heading text-navy">
                Paid (dinero)
              </th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-ink/30">
              <td className="p-2 font-heading text-navy text-xs whitespace-nowrap">
                ONE-TO-ONE
              </td>
              <td className="p-2">
                <div className="flex flex-wrap gap-1">
                  {strategiesInQuadrant("1to1-organic").map((s) => (
                    <StrategyBadge
                      key={s.id}
                      strategy={s}
                      isActive={activeIds.has(s.id)}
                      onClick={() => handleSelectStrategy(s.id)}
                    />
                  ))}
                </div>
              </td>
              <td className="p-2">
                <div className="flex flex-wrap gap-1">
                  {strategiesInQuadrant("1to1-paid").map((s) => (
                    <StrategyBadge
                      key={s.id}
                      strategy={s}
                      isActive={activeIds.has(s.id)}
                      onClick={() => handleSelectStrategy(s.id)}
                    />
                  ))}
                </div>
              </td>
            </tr>
            <tr className="border-b border-ink/30">
              <td className="p-2 font-heading text-navy text-xs whitespace-nowrap">
                ONE-TO-MANY
              </td>
              <td className="p-2">
                <div className="flex flex-wrap gap-1">
                  {strategiesInQuadrant("1toN-organic").map((s) => (
                    <StrategyBadge
                      key={s.id}
                      strategy={s}
                      isActive={activeIds.has(s.id)}
                      onClick={() => handleSelectStrategy(s.id)}
                    />
                  ))}
                </div>
              </td>
              <td className="p-2">
                <div className="flex flex-wrap gap-1">
                  {strategiesInQuadrant("1toN-paid").map((s) => (
                    <StrategyBadge
                      key={s.id}
                      strategy={s}
                      isActive={activeIds.has(s.id)}
                      onClick={() => handleSelectStrategy(s.id)}
                    />
                  ))}
                </div>
              </td>
            </tr>
          </tbody>
        </table>

        {/* Transversal row */}
        {strategiesInQuadrant("transversal").length > 0 && (
          <div className="border-t border-ink/30 p-2 flex items-center gap-2 flex-wrap">
            <span className="font-heading text-navy text-xs">Transversal:</span>
            {strategiesInQuadrant("transversal").map((s) => (
              <StrategyBadge
                key={s.id}
                strategy={s}
                isActive={activeIds.has(s.id)}
                onClick={() => handleSelectStrategy(s.id)}
              />
            ))}
          </div>
        )}
      </ComicCard>

      {/* Filter buttons */}
      <div className="flex flex-wrap items-center gap-1.5">
        {QUADRANT_FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={cn(
              "px-3 py-1 text-xs rounded border border-ink font-medium transition-colors cursor-pointer",
              filter === f.key
                ? "bg-rust text-white"
                : "bg-card hover:bg-muted",
            )}
          >
            {f.label}
          </button>
        ))}

        <span className="w-px h-5 bg-ink/30 mx-1" />

        {SPEED_FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={cn(
              "px-3 py-1 text-xs rounded border border-ink font-medium transition-colors cursor-pointer",
              filter === f.key
                ? "bg-rust text-white"
                : "bg-card hover:bg-muted",
            )}
          >
            {f.label}
          </button>
        ))}

        <span className="w-px h-5 bg-ink/30 mx-1" />

        <button
          onClick={() => setFilter("active")}
          className={cn(
            "px-3 py-1 text-xs rounded border border-ink font-medium transition-colors cursor-pointer",
            filter === "active"
              ? "bg-rust text-white"
              : "bg-card hover:bg-muted",
          )}
        >
          🟢 Activas cliente
        </button>
      </div>

      {/* Strategy list */}
      <div className="space-y-2">
        {filtered.length === 0 && (
          <p className="text-sm text-muted-foreground py-4 text-center">
            No hay estrategias con este filtro.
          </p>
        )}
        {filtered.map((s) => {
          const isActive = activeIds.has(s.id);
          const clientInfo = getClientScore(s.id, clientStrategies);

          return (
            <ComicCard
              key={s.id}
              hover
              onClick={() => handleSelectStrategy(s.id)}
              className={cn(
                "cursor-pointer",
                selectedId === s.id && "ring-2 ring-rust"
              )}
            >
              <div className="flex items-center gap-3">
                <span className="text-sm font-mono text-rust">#{s.id}</span>
                <span className="font-bold text-sm">{s.name}</span>

                <span className="ml-auto flex items-center gap-2">
                  <span className="text-xs" title={s.quadrant}>
                    {QUADRANT_ICONS[s.quadrant] ?? s.quadrant}
                  </span>
                  <span className="text-xs" title={s.velocidad}>
                    {SPEED_ICONS[s.velocidad] ?? s.velocidad}
                  </span>

                  {s.b2b !== "no" && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-800 border border-blue-300">
                      B2B
                    </span>
                  )}
                  {s.b2c !== "no" && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-100 text-purple-800 border border-purple-300">
                      B2C
                    </span>
                  )}

                  {clientInfo && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-100 text-green-800 border border-green-400 font-bold">
                      {clientInfo.score}
                    </span>
                  )}
                </span>
              </div>
            </ComicCard>
          );
        })}
      </div>

      {/* SlideOver detail panel */}
      <SettingsSlideOver
        open={!!selectedStrategy && slideFiles.length > 0}
        onClose={() => setSelectedId(null)}
        title={selectedStrategy ? `#${selectedStrategy.id} ${selectedStrategy.name}` : ""}
        files={slideFiles}
        editable
        onSave={handleSave}
        copyPathPrefix={selectedId ? `strategies-catalog.json#${selectedId}` : undefined}
        headerContent={
          selectedStrategy ? (
            <StrategyDetailContent
              strategy={selectedStrategy}
              clientStrategies={clientStrategies}
            />
          ) : null
        }
      />
    </section>
  );
}
