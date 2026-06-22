"use client";

import { useState, useMemo, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ComicCard } from "@/components/shared/comic-card";
import { SettingsSlideOver } from "./settings-slideover";
import { DefaultModelSection, AgentModelControl } from "./models-panel";
import { useAgentsList, useDefaultModel, type RichAgent } from "@/hooks/useModels";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface AgentFile {
  name: string;
  content: string;
}

interface Agent {
  slug: string;
  name: string;
  emoji: string;
  channel: string;
  model: string;
  role: string;
  files: AgentFile[];
}

/* ------------------------------------------------------------------ */
/*  Component — identity + per-agent model (the "motor concreto") in   */
/*  one place. Crons live in Recurrentes; auth routes in Conexiones.   */
/* ------------------------------------------------------------------ */

export function AgentsPanel() {
  const qc = useQueryClient();

  const { data: agents, isLoading } = useQuery<Agent[]>({
    queryKey: ["system", "agents"],
    queryFn: async () => {
      const res = await fetch("/api/system/agents");
      if (!res.ok) throw new Error("Failed to fetch agents");
      return res.json();
    },
  });

  // Per-agent model data (override/resolved/recommended) — joined to the
  // identity list by id === slug.
  const { data: richData } = useAgentsList();
  const { data: defaultModel } = useDefaultModel();
  const globalDefault = defaultModel?.model ?? null;
  const richById = useMemo(() => {
    const m = new Map<string, RichAgent>();
    for (const a of richData?.agents || []) m.set(a.id, a);
    return m;
  }, [richData]);

  const saveMutation = useMutation({
    mutationFn: async (body: { slug: string; fileName: string; content: string }) => {
      const res = await fetch("/api/system/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("Failed to save");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["system", "agents"] });
    },
  });

  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);

  const selected = agents?.find((a) => a.slug === selectedSlug) ?? null;

  const slideFiles = useMemo(() => {
    if (!selected) return [];
    return selected.files;
  }, [selected]);

  const handleSave = useCallback(async (fileName: string, content: string) => {
    if (!selected) return;
    await saveMutation.mutateAsync({ slug: selected.slug, fileName, content });
  }, [selected, saveMutation]);

  const slideHeaderContent = selected ? (
    <div className="flex flex-wrap gap-2">
      <span className="text-[10px] px-2 py-0.5 rounded bg-blue-500/10 text-blue-600 font-semibold border border-blue-500/20">
        {selected.channel}
      </span>
      <span className="text-[10px] px-2 py-0.5 rounded bg-rust/10 text-rust font-semibold border border-rust/20">
        {selected.role}
      </span>
      <span className="text-[10px] px-2 py-0.5 rounded bg-green-500/10 text-green-600 font-semibold border border-green-500/20">
        {selected.files.length} archivos
      </span>
    </div>
  ) : null;

  if (isLoading) {
    return (
      <div>
        <h2 className="font-heading text-xl text-navy">🤖 Agentes</h2>
        <p className="text-sm text-muted-foreground mt-1">Cargando...</p>
      </div>
    );
  }

  return (
    <section className="space-y-4">
      {/* Header */}
      <div>
        <h2 className="font-heading text-xl text-navy">🤖 Agentes</h2>
        <p className="text-sm text-muted-foreground">
          {agents?.length ?? 0} agentes — su <strong>modelo</strong> (motor) y sus ficheros, en un sitio.
        </p>
      </div>

      {/* Global default model — agents inherit this unless overridden */}
      <DefaultModelSection />

      {/* Agent cards: identity + per-agent model + file editor */}
      <div className="space-y-3">
        {agents?.map((agent) => {
          const rich = richById.get(agent.slug);
          return (
            <ComicCard key={agent.slug} className="p-4">
              <div className="flex flex-wrap items-center gap-3">
                <span className="h-2.5 w-2.5 rounded-full bg-green-500 shrink-0" />
                <span className="font-bold text-[14px]">
                  {agent.emoji} {agent.name}
                </span>
                <span className="text-[12px] text-muted-foreground">{agent.role}</span>
                <span className="text-[12px] text-blue-600">{agent.channel}</span>
                <span className="ml-auto flex items-center gap-3">
                  <span className="text-[11px] text-muted-foreground">{agent.files.length} archivos</span>
                  <button
                    type="button"
                    onClick={() => setSelectedSlug(agent.slug)}
                    className="text-[11px] px-2.5 py-1 bg-background border border-border rounded-md cursor-pointer hover:border-rust hover:bg-rust hover:text-white transition-all whitespace-nowrap"
                  >
                    📝 editar ficheros
                  </button>
                </span>
              </div>

              {/* Per-agent model (motor concreto) */}
              <div className="mt-3 border-t border-dashed border-border pt-3">
                {rich ? (
                  <AgentModelControl agent={rich} globalDefault={globalDefault} />
                ) : (
                  <span className="text-xs text-muted-foreground">
                    Modelo: <code>{agent.model}</code> — sin datos de override (agente no registrado en el motor).
                  </span>
                )}
              </div>
            </ComicCard>
          );
        })}
      </div>

      {/* SlideOver detail panel — agent files */}
      <SettingsSlideOver
        open={!!selected}
        onClose={() => setSelectedSlug(null)}
        title={selected ? `${selected.emoji} ${selected.name}` : ""}
        files={slideFiles}
        editable
        onSave={handleSave}
        copyPathPrefix={selected ? `~/.openclaw/workspace-${selected.slug}` : undefined}
        headerContent={slideHeaderContent}
      />
    </section>
  );
}
