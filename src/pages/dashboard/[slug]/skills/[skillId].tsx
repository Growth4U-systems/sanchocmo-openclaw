"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { useRouter } from "next/router";
import Head from "next/head";
import dynamic from "next/dynamic";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useQuery } from "@tanstack/react-query";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { useOpenChat } from "@/hooks/useChat";
import { buildSkillEditorThread } from "@/lib/chat-openers";
import { useAppStore } from "@/stores/app";
import { cn } from "@/lib/utils";

const MarkdownEditor = dynamic(
  () => import("@/components/foundation/markdown-editor").then((m) => m.MarkdownEditor),
  { ssr: false, loading: () => <p className="text-sm text-muted-foreground p-6">Cargando editor...</p> }
);

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

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
    "0": "Company Brief", "1": "Research", "2": "Synthesis",
    "3": "Discovery", "4": "Activation", "5": "Brand",
    "6": "Metrics", "7": "Strategy",
  };
  return labels[layer] || `L${layer}`;
}

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export default function SkillEditorPage() {
  const router = useRouter();
  const skillId = typeof router.query.skillId === "string" ? router.query.skillId : "";
  const slug = useAppStore((s) => s.selectedClient) || "";
  const openChat = useOpenChat();

  const [activeTab, setActiveTab] = useState<string>("");
  const [editing, setEditing] = useState(false);
  const [docContent, setDocContent] = useState<string | null>(null);
  const [docLoading, setDocLoading] = useState(false);
  const [chatOpened, setChatOpened] = useState(false);

  // ── Fetch skill detail (file list + metadata) ──
  const { data: skill } = useQuery<SkillDetail>({
    queryKey: ["system", "skill", skillId],
    queryFn: async () => {
      const res = await fetch(`/api/system/skills?id=${skillId}`);
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!skillId,
  });

  // ── Build file list with display names ──
  const allFiles = useMemo(() => {
    if (!skill) return [];
    const label = displayName(skill.id);
    const files = [{ name: label, filePath: "SKILL.md", content: skill.skillMd }];
    for (const ref of skill.references) {
      files.push({ name: ref.name.replace(/\.md$/, ""), filePath: `references/${ref.name}`, content: ref.content });
    }
    return files;
  }, [skill]);

  // Set initial tab when skill loads
  useEffect(() => {
    if (allFiles.length > 0 && !activeTab) {
      setActiveTab(allFiles[0].name);
    }
  }, [allFiles, activeTab]);

  const activeFileObj = allFiles.find((f) => f.name === activeTab);
  const activeFilePath = activeFileObj?.filePath ?? "SKILL.md";

  // ── Fetch file content via docs API ──
  useEffect(() => {
    if (!skillId || !activeFilePath) return;
    setDocLoading(true);
    setDocContent(null);
    setEditing(false);

    const docPath = `skills/${skillId}/${activeFilePath}`;
    fetch(`/api/docs/${docPath}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.ok && data.content) setDocContent(data.content);
      })
      .catch(() => {})
      .finally(() => setDocLoading(false));
  }, [skillId, activeFilePath]);

  // ── Open chat automatically on first load ──
  useEffect(() => {
    if (!skill || !slug || chatOpened) return;
    const docPath = `skills/${skillId}/SKILL.md`;
    openChat(slug, buildSkillEditorThread(slug, skillId, displayName(skillId), docPath));
    setChatOpened(true);
  }, [skill, slug, skillId, openChat, chatOpened]);

  // ── Handlers ──
  const handleOpenChat = useCallback(() => {
    if (!slug || !skillId) return;
    const docPath = `skills/${skillId}/${activeFilePath}`;
    openChat(slug, buildSkillEditorThread(slug, skillId, displayName(skillId), docPath));
  }, [slug, skillId, activeFilePath, openChat]);

  const handleSave = useCallback(async (content: string) => {
    const docPath = `skills/${skillId}/${activeFilePath}`;
    const res = await fetch(`/api/docs/${docPath}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    });
    if (!res.ok) throw new Error("Save failed");
    setDocContent(content);
    setEditing(false);
  }, [skillId, activeFilePath]);

  const handleBack = useCallback(() => {
    router.push("/dashboard/admin/settings?tab=skills");
  }, [router]);

  const btnClass = "inline-flex items-center gap-1.5 px-2.5 py-1 text-[13px] bg-transparent border border-[#E5E2DC] dark:border-[#313244] rounded-md cursor-pointer text-[#7A7A7A] dark:text-[#6c7086] hover:bg-[#E5E2DC] dark:hover:bg-[#313244] hover:text-[#1A1A1A] dark:hover:text-[#cdd6f4] transition-colors";

  const skillTitle = skill ? displayName(skill.id) : displayName(skillId);

  return (
    <DashboardLayout>
      <Head>
        <title>{skillTitle} — Skills — Mission Control</title>
      </Head>

      {/* Header bar */}
      <div className="flex items-center gap-2.5 mb-4 flex-wrap">
        <button
          type="button"
          onClick={handleBack}
          className="text-xs text-muted-foreground hover:text-rust"
        >
          ← Skills
        </button>

        <span className="text-sm font-bold text-foreground truncate">
          {skillTitle}
        </span>

        {/* Metadata badges */}
        {skill?.metadata.layer && (
          <span className="text-[9px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-600 font-semibold">
            L{skill.metadata.layer} {layerLabel(skill.metadata.layer)}
          </span>
        )}
        {skill?.metadata.pillar && (
          <span className="text-[9px] px-1.5 py-0.5 rounded bg-rust/10 text-rust font-semibold">
            {skill.metadata.pillar}
          </span>
        )}

        <div className="ml-auto flex items-center gap-2">
          {/* Chat */}
          <button type="button" onClick={handleOpenChat} className={btnClass}>
            💬 Chat
          </button>

          {/* Edit toggle */}
          <button
            type="button"
            onClick={() => setEditing(!editing)}
            disabled={!docContent}
            className={btnClass}
          >
            {editing ? "👁 Ver" : "✏️ Editar"}
          </button>
        </div>
      </div>

      {/* File tabs */}
      {allFiles.length > 1 && (
        <div className="flex flex-wrap gap-1.5 mb-4">
          {allFiles.map((f) => (
            <button
              key={f.name}
              onClick={() => setActiveTab(f.name)}
              className={cn(
                "px-2.5 py-1 text-[11px] rounded border border-ink font-medium transition-colors",
                activeTab === f.name
                  ? "bg-rust text-white border-rust"
                  : "bg-card hover:bg-muted"
              )}
            >
              {f.name}
            </button>
          ))}
        </div>
      )}

      {/* Description */}
      {skill?.description && !editing && (
        <p className="text-xs text-muted-foreground mb-4 max-w-3xl leading-snug">
          {skill.description}
        </p>
      )}

      {/* Context reads/writes */}
      {!editing && skill && (skill.context_required.length > 0 || skill.context_writes.length > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-[11px] mb-4 max-w-3xl">
          {skill.context_required.length > 0 && (
            <div className="p-2.5 bg-blue-50 border border-blue-200 rounded-lg">
              <div className="font-bold text-blue-700 mb-1">📥 Lee (context_required)</div>
              {skill.context_required.map((cr, i) => (
                <div key={i} className="text-blue-600 truncate text-[10px]">{cr}</div>
              ))}
            </div>
          )}
          {skill.context_writes.length > 0 && (
            <div className="p-2.5 bg-green-50 border border-green-200 rounded-lg">
              <div className="font-bold text-green-700 mb-1">📤 Escribe (context_writes)</div>
              {skill.context_writes.map((cw, i) => (
                <div key={i} className="text-green-600 truncate text-[10px]">{cw}</div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Doc content — toggle between viewer and editor */}
      {docLoading && (
        <p className="text-sm text-muted-foreground text-center py-20">Cargando documento...</p>
      )}

      {!docLoading && editing && docContent ? (
        <div className="min-h-[60vh]">
          <MarkdownEditor
            initialContent={docContent}
            onSave={handleSave}
            onCancel={() => setEditing(false)}
          />
        </div>
      ) : !docLoading && docContent ? (
        <article className={cn(
          "prose prose-sm max-w-none dark:prose-invert",
          "prose-headings:font-heading prose-headings:text-rust prose-a:text-rust",
          "prose-table:border-collapse prose-th:border prose-th:border-border prose-th:px-3 prose-th:py-2 prose-th:bg-muted/30 prose-th:text-left prose-th:text-xs prose-th:font-bold",
          "prose-td:border prose-td:border-border prose-td:px-3 prose-td:py-2 prose-td:text-xs",
        )}>
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{docContent}</ReactMarkdown>
        </article>
      ) : !docLoading ? (
        <p className="text-sm text-red-500 text-center py-20">Documento no encontrado</p>
      ) : null}
    </DashboardLayout>
  );
}
