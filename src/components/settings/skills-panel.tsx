"use client";

import { useState, useMemo, useCallback, type ReactNode } from "react";
import { useRouter } from "next/router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { useOpenChat } from "@/hooks/useChat";
import { buildSkillCreatorThread } from "@/lib/chat-openers";
import { useAppStore } from "@/stores/app";
import { SettingsSlideOver } from "./settings-slideover";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface SkillSummary {
  id: string;
  name: string;
  description: string;
  pillar?: string;
  layer?: string;
  phase?: string;
  agent?: string;
  refCount: number;
  hasScripts: boolean;
  workspace?: string;
  file_path?: string;
}

interface SkillDetail {
  id: string;
  name: string;
  description: string;
  metadata: Record<string, string>;
  context_required: string[];
  context_writes: string[];
  body: string;
  skillMd: string;
  references: { name: string; content: string }[];
  scripts: string[];
  workspace?: string;
  file_path?: string;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function displayName(id: string): string {
  return id.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function layerLabel(layer: string | undefined): string | null {
  if (!layer) return null;
  const labels: Record<string, string> = {
    "0": "Company Brief",
    "1": "Research",
    "2": "Synthesis",
    "3": "Discovery",
    "4": "Activation",
    "5": "Brand",
    "6": "Metrics",
    "7": "Strategy",
  };
  return labels[layer] || `L${layer}`;
}

/* ------------------------------------------------------------------ */
/*  Skills Panel                                                       */
/* ------------------------------------------------------------------ */

export function SkillsPanel() {
  const qc = useQueryClient();
  const router = useRouter();
  const openChat = useOpenChat();
  const slug = useAppStore((s) => s.selectedClient) || "";

  const { data, isLoading } = useQuery<{ skills: SkillSummary[] }>({
    queryKey: ["system", "skills"],
    queryFn: async () => {
      const res = await fetch("/api/system/skills");
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const skills = data?.skills ?? [];
  const [filter, setFilter] = useState<string>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  // ── Detail query for selected skill ──
  // Para resolver workspace al abrir detail/POST/DELETE: lo conocemos del summary.
  const selectedSummary = selectedId ? skills.find((s) => s.id === selectedId) : null;
  const selectedWorkspace = selectedSummary?.workspace;

  const { data: skillDetail } = useQuery<SkillDetail>({
    queryKey: ["system", "skill", selectedId, selectedWorkspace],
    queryFn: async () => {
      const qs = new URLSearchParams({ id: selectedId as string });
      if (selectedWorkspace) qs.set("workspace", selectedWorkspace);
      const res = await fetch(`/api/system/skills?${qs}`);
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!selectedId,
  });

  // ── Save mutation ──
  const saveMutation = useMutation({
    mutationFn: async (body: { skillId: string; fileName: string; content: string; workspace?: string }) => {
      const res = await fetch("/api/system/skills", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: () => {
      if (selectedId) {
        qc.invalidateQueries({ queryKey: ["system", "skill", selectedId] });
      }
      qc.invalidateQueries({ queryKey: ["system", "skills"] });
    },
  });

  // ── Delete mutation ──
  const deleteMutation = useMutation({
    mutationFn: async (body: { skillId: string; workspace?: string }) => {
      const res = await fetch("/api/system/skills", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: () => {
      setSelectedId(null);
      qc.invalidateQueries({ queryKey: ["system", "skills"] });
    },
  });

  // ── Filter logic ──
  const layerGroups = useMemo(() => {
    const groups: Record<string, number> = {};
    for (const s of skills) {
      const lbl = s.layer ? `L${s.layer}` : "other";
      groups[lbl] = (groups[lbl] || 0) + 1;
    }
    return groups;
  }, [skills]);

  const filtered = useMemo(() => {
    let list = skills;
    if (filter !== "all") {
      if (filter === "other") {
        list = list.filter((s) => !s.layer);
      } else {
        list = list.filter((s) => `L${s.layer}` === filter);
      }
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (s) =>
          s.id.toLowerCase().includes(q) ||
          s.name.toLowerCase().includes(q) ||
          s.description.toLowerCase().includes(q)
      );
    }
    return list;
  }, [skills, filter, searchQuery]);

  const filterButtons = useMemo(() => {
    const btns = [{ key: "all", label: `All (${skills.length})` }];
    const layerOrder = ["L0", "L1", "L2", "L3", "L4", "L5", "L6", "L7"];
    for (const l of layerOrder) {
      if (layerGroups[l]) {
        btns.push({ key: l, label: `${l} ${layerLabel(l.slice(1)) || ""} (${layerGroups[l]})` });
      }
    }
    if (layerGroups["other"]) {
      btns.push({ key: "other", label: `Otros (${layerGroups["other"]})` });
    }
    return btns;
  }, [skills.length, layerGroups]);

  // ── SlideOver data ──
  const slideFiles = useMemo(() => {
    if (!skillDetail) return [];
    const label = displayName(skillDetail.id);
    const files = [{ name: label, content: skillDetail.skillMd, fileName: "SKILL.md" }];
    for (const ref of skillDetail.references) {
      files.push({ name: ref.name.replace(/\.md$/, ""), content: ref.content, fileName: `references/${ref.name}` });
    }
    return files;
  }, [skillDetail]);

  const handleSave = useCallback(async (fileName: string, content: string) => {
    if (!selectedId) return;
    await saveMutation.mutateAsync({ skillId: selectedId, fileName, content, workspace: selectedWorkspace });
  }, [selectedId, selectedWorkspace, saveMutation]);

  const handleDelete = useCallback(() => {
    if (!selectedId) return;
    if (confirm(`¿Eliminar la skill "${displayName(selectedId)}"? Esta acción no se puede deshacer.`)) {
      deleteMutation.mutate({ skillId: selectedId, workspace: selectedWorkspace });
    }
  }, [selectedId, selectedWorkspace, deleteMutation]);

  const handleCreateSkill = useCallback(() => {
    openChat(slug, buildSkillCreatorThread(slug));
  }, [openChat, slug]);

  // ── Header content for SlideOver ──
  const slideHeaderContent: ReactNode = skillDetail ? (
    <div className="space-y-3">
      {/* Description */}
      {skillDetail.description && (
        <p className="text-xs text-muted-foreground leading-snug max-w-2xl">
          {skillDetail.description}
        </p>
      )}

      {/* Metadata badges */}
      <div className="flex flex-wrap gap-2">
        {skillDetail.metadata.pillar && (
          <span className="text-[10px] px-2 py-0.5 rounded bg-rust/10 text-rust font-semibold border border-rust/20">
            Pillar: {skillDetail.metadata.pillar}
          </span>
        )}
        {skillDetail.metadata.layer && (
          <span className="text-[10px] px-2 py-0.5 rounded bg-blue-500/10 text-blue-600 font-semibold border border-blue-500/20">
            Layer {skillDetail.metadata.layer} — {layerLabel(skillDetail.metadata.layer)}
          </span>
        )}
        {skillDetail.metadata.phase && (
          <span className="text-[10px] px-2 py-0.5 rounded bg-green-500/10 text-green-600 font-semibold border border-green-500/20">
            Fase {skillDetail.metadata.phase}
          </span>
        )}
        {skillDetail.metadata.version && (
          <span className="text-[10px] px-2 py-0.5 rounded bg-muted text-muted-foreground font-semibold">
            v{skillDetail.metadata.version}
          </span>
        )}
        {skillDetail.scripts.length > 0 && (
          <span className="text-[10px] px-2 py-0.5 rounded bg-yellow-500/10 text-yellow-700 font-semibold border border-yellow-500/20">
            {skillDetail.scripts.length} scripts: {skillDetail.scripts.join(", ")}
          </span>
        )}
      </div>

      {/* Context reads/writes */}
      {(skillDetail.context_required.length > 0 || skillDetail.context_writes.length > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-[11px]">
          {skillDetail.context_required.length > 0 && (
            <div className="p-2.5 bg-blue-50 border border-blue-200 rounded-lg">
              <div className="font-bold text-blue-700 mb-1">📥 Lee (context_required)</div>
              {skillDetail.context_required.map((cr, i) => (
                <div key={i} className="text-blue-600 truncate text-[10px]">{cr}</div>
              ))}
            </div>
          )}
          {skillDetail.context_writes.length > 0 && (
            <div className="p-2.5 bg-green-50 border border-green-200 rounded-lg">
              <div className="font-bold text-green-700 mb-1">📤 Escribe (context_writes)</div>
              {skillDetail.context_writes.map((cw, i) => (
                <div key={i} className="text-green-600 truncate text-[10px]">{cw}</div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  ) : null;

  if (isLoading) {
    return (
      <div>
        <h2 className="font-heading text-xl text-navy">🧰 Skills</h2>
        <p className="text-sm text-muted-foreground mt-1">Cargando skills del workspace...</p>
      </div>
    );
  }

  return (
    <section className="space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="font-heading text-xl text-navy">🧰 Skills</h2>
          <p className="text-sm text-muted-foreground">
            {skills.length} skills total
            {(() => {
              const byWs = new Map<string, number>();
              for (const s of skills) byWs.set(s.workspace ?? "?", (byWs.get(s.workspace ?? "?") ?? 0) + 1);
              const parts = [...byWs.entries()].map(([ws, n]) => `${n} ${ws.replace("workspace-", "")}`);
              return parts.length > 0 ? ` · ${parts.join(" · ")}` : "";
            })()}
          </p>
        </div>
        <button
          onClick={handleCreateSkill}
          className="px-4 py-2 bg-gradient-to-br from-rust to-[#D4734F] text-white border-2 border-ink rounded-md text-[13px] font-bold shadow-comic cursor-pointer hover:shadow-comic-hover hover:-translate-x-px hover:-translate-y-px active:shadow-[1px_1px_0_var(--ink)] active:translate-x-px active:translate-y-px transition-all"
        >
          ➕ Nueva Skill
        </button>
      </div>

      {/* Search */}
      <input
        type="text"
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        placeholder="Buscar skill..."
        className="w-full max-w-sm px-3 py-1.5 border-2 border-ink rounded-lg text-sm bg-background focus:outline-none focus:border-rust"
      />

      {/* Filters */}
      <div className="flex gap-1.5 flex-wrap">
        {filterButtons.map((fb) => (
          <button
            key={fb.key}
            onClick={() => setFilter(fb.key)}
            className={cn(
              "px-3 py-1.5 text-[11px] font-semibold rounded-lg border border-ink transition-colors cursor-pointer",
              filter === fb.key
                ? "bg-rust text-white border-rust"
                : "bg-card hover:border-rust"
            )}
          >
            {fb.label}
          </button>
        ))}
      </div>

      {/* Grid */}
      <div
        className="grid gap-2"
        style={{ gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))" }}
      >
        {filtered.map((skill) => (
          <div
            key={skill.id}
            onClick={() => setSelectedId(skill.id)}
            className={cn(
              "border-2 border-ink rounded-lg p-3 bg-card cursor-pointer hover:border-rust transition-all",
              selectedId === skill.id && "ring-2 ring-rust border-rust"
            )}
          >
            <div className="font-semibold text-sm">{displayName(skill.id)}</div>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              {skill.workspace && skill.workspace !== "workspace-sancho" && (
                <span className="text-[9px] px-1.5 py-0.5 rounded bg-pink-500/10 text-pink-700 font-semibold">
                  {skill.agent ?? skill.workspace.replace("workspace-", "")}
                </span>
              )}
              {skill.layer && (
                <span className="text-[9px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-600 font-semibold">
                  L{skill.layer} {layerLabel(skill.layer)}
                </span>
              )}
              {skill.pillar && skill.pillar !== skill.id && (
                <span className="text-[9px] px-1.5 py-0.5 rounded bg-rust/10 text-rust font-semibold">
                  {skill.pillar}
                </span>
              )}
              <span className="text-[10px] text-muted-foreground">
                {skill.refCount} refs{skill.hasScripts ? " · scripts" : ""}
              </span>
            </div>
            {skill.description && (
              <p className="text-[11px] text-muted-foreground mt-1.5 line-clamp-2 leading-snug">
                {skill.description}
              </p>
            )}
            {skill.file_path && (
              <a
                href={`vscode://file${skill.file_path}`}
                onClick={(e) => e.stopPropagation()}
                className="text-[10px] text-rust hover:underline truncate block mt-1.5 font-mono"
                title={skill.file_path}
              >
                {skill.file_path.replace(/^.*\.openclaw\//, "~/.openclaw/")}
              </a>
            )}
          </div>
        ))}
      </div>

      {filtered.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-6">
          No se encontraron skills.
        </p>
      )}

      {/* SlideOver detail panel */}
      <SettingsSlideOver
        open={!!selectedId && !!skillDetail}
        onClose={() => setSelectedId(null)}
        title={selectedId ? displayName(selectedId) : ""}
        files={slideFiles}
        editable
        onSave={handleSave}
        onDelete={handleDelete}
        onOpen={() => {
          const id = selectedId;
          setSelectedId(null);
          router.push(`/dashboard/${slug}/skills/${id}`);
        }}
        copyPathPrefix={
          selectedId
            ? `~/.openclaw/${selectedWorkspace ?? "workspace-sancho"}/skills/${selectedId}`
            : undefined
        }
        headerContent={slideHeaderContent}
      />
    </section>
  );
}
