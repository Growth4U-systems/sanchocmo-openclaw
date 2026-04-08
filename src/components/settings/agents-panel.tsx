"use client";

import { useState, useMemo, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ComicCard } from "@/components/shared/comic-card";
import { cn } from "@/lib/utils";
import { SettingsSlideOver } from "./settings-slideover";

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
/*  Component                                                          */
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

  // Header content for SlideOver: agent metadata
  const slideHeaderContent = selected ? (
    <div className="flex flex-wrap gap-2">
      <span className="text-[10px] px-2 py-0.5 rounded bg-blue-500/10 text-blue-600 font-semibold border border-blue-500/20">
        {selected.channel}
      </span>
      <span className="text-[10px] px-2 py-0.5 rounded bg-muted text-muted-foreground font-semibold">
        {selected.model}
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
          {agents?.length ?? 0} agentes — {agents?.map((a) => a.name).join(", ")}
        </p>
      </div>

      {/* Agent rows */}
      <div className="space-y-2">
        {agents?.map((agent) => (
          <ComicCard
            key={agent.slug}
            hover
            onClick={() => setSelectedSlug(agent.slug)}
            className={cn(
              "cursor-pointer",
              selectedSlug === agent.slug && "ring-2 ring-rust"
            )}
          >
            <div className="flex items-center gap-3">
              {/* Status dot */}
              <span className="h-2.5 w-2.5 rounded-full bg-green-500 shrink-0" />

              {/* Name */}
              <span className="font-bold min-w-[130px] text-[14px]">
                {agent.emoji} {agent.name}
              </span>

              {/* Channel */}
              <span className="text-[13px] text-blue-600">{agent.channel}</span>

              {/* Model + role + file count */}
              <span className="ml-auto text-[12px] text-muted-foreground text-right">
                {agent.model} · {agent.role} · {agent.files.length} archivos
              </span>
            </div>
          </ComicCard>
        ))}
      </div>

      {/* SlideOver detail panel */}
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
