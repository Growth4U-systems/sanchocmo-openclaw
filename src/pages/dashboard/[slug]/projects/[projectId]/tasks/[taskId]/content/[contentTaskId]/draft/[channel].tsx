"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import Head from "next/head";
import Link from "next/link";
import dynamic from "next/dynamic";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { useSlugSync } from "@/hooks/useSlugSync";
import { useDraft, useSaveDraft } from "@/hooks/useDraft";
import {
  useContentTask,
  useUpdateContentTask,
  useUpdateContentTaskStatus,
  useDetachDocumentFromContentTask,
} from "@/hooks/useContentTasks";
import { useOpenChat } from "@/hooks/useChat";
import { useChatStore } from "@/stores/chat";
import { buildContentTaskThread } from "@/lib/chat-openers";
import { ChannelPreview, isPlaceholderBody } from "@/components/content/channel-preview";
import { SkillPicker } from "@/components/shared/skill-picker";
import { cn } from "@/lib/utils";
import {
  VALID_CONTENT_TASK_STATUSES,
  type ContentTask,
  type ContentTaskStatus,
} from "@/types";
const MarkdownEditor = dynamic(
  () => import("@/components/foundation/markdown-editor").then((m) => m.MarkdownEditor),
  { ssr: false, loading: () => <p className="text-sm text-muted-foreground p-6">Cargando editor...</p> },
);

const TARGET_CHANNEL_OPTIONS = [
  "linkedin",
  "twitter",
  "instagram",
  "blog",
  "email",
  "youtube",
  "tiktok",
];

const CT_STATUS_STYLES: Record<string, string> = {
  New: "bg-[#F1F2F4] text-[#5C6470] border-[#D8DCE0]",
  Approved: "bg-[#FEF3C7] text-[#92400E] border-[#FCD34D]",
  Draft: "bg-[#DBEAFE] text-[#1E40AF] border-[#93C5FD]",
  Media: "bg-[#FCE7F3] text-[#9D174D] border-[#F9A8D4]",
  Review: "bg-[#EDE9FE] text-[#5B21B6] border-[#C4B5FD]",
  Ready: "bg-[#D1FAE5] text-[#065F46] border-[#6EE7B7]",
  Published: "bg-[#A7F3D0] text-[#064E3B] border-[#34D399]",
  Discarded: "bg-[#E5E7EB] text-[#6B7280] border-[#D1D5DB]",
  Deferred: "bg-[#FFEDD5] text-[#9A3412] border-[#FDBA74]",
};

export default function DraftFullScreenPage() {
  const slug = useSlugSync() || "";
  const router = useRouter();
  const projectId = (router.query.projectId as string) || "";
  const taskId = (router.query.taskId as string) || "";
  const contentTaskId = (router.query.contentTaskId as string) || "";
  const channel = (router.query.channel as string) || "";

  const { data: ct, isLoading: ctLoading } = useContentTask(
    slug || null,
    taskId || null,
    contentTaskId || null,
  );
  const ideaId = ct?.idea_id || null;

  const { data: draft, isLoading, error } = useDraft(slug, ideaId, channel || null);
  const saveDraft = useSaveDraft();
  const updateContentTask = useUpdateContentTask();
  const updateContentTaskStatus = useUpdateContentTaskStatus();
  const detachDoc = useDetachDocumentFromContentTask();
  const openChat = useOpenChat();
  const sidebarOpen = useChatStore((s) => s.sidebarOpen);

  const [editingBody, setEditingBody] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [editingMeta, setEditingMeta] = useState(false);
  const [metaDraft, setMetaDraft] = useState<Partial<ContentTask>>({});
  const [ctStatusOpen, setCtStatusOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // Sync chat sidebar to the Content Task thread on mount and when CT changes.
  useEffect(() => {
    if (!slug || !ct) return;
    const config = buildContentTaskThread(slug, taskId, ct.id, ct.name, projectId, {
      skill: ct.skill,
      status: ct.status,
      docPath: draft?.relPath,
    });
    openChat(slug, config);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, ct?.id]);

  function handleReopenChat() {
    if (!slug || !ct) return;
    const config = buildContentTaskThread(slug, taskId, ct.id, ct.name, projectId, {
      skill: ct.skill,
      status: ct.status,
      docPath: draft?.relPath,
    });
    openChat(slug, config);
  }

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  }

  // ── Body (markdown draft) handlers ───────────────────────────────────────
  async function handleSaveBody(body: string) {
    if (!ideaId || !channel) return;
    await saveDraft.mutateAsync({ slug, ideaId, channel, body });
    setEditingBody(false);
    showToast("Draft guardado.");
  }

  function handleSwitchChannel(nextChannel: string) {
    if (nextChannel === channel) return;
    router.push(
      `/dashboard/${slug}/projects/${projectId}/tasks/${taskId}/content/${contentTaskId}/draft/${nextChannel}`,
    );
  }

  // ── Metadata edit handlers ───────────────────────────────────────────────
  function startEditMeta() {
    if (!ct) return;
    setMetaDraft({
      name: ct.name,
      skill: ct.skill,
      target_channels: [...ct.target_channels],
      owner: ct.owner,
      scheduled_for: ct.scheduled_for,
    });
    setEditingMeta(true);
    setDetailsOpen(true);
  }

  function toggleMetaChannel(ch: string) {
    setMetaDraft((d) => {
      const cur = new Set(d.target_channels || []);
      if (cur.has(ch)) cur.delete(ch);
      else cur.add(ch);
      return { ...d, target_channels: Array.from(cur) };
    });
  }

  function saveMeta() {
    if (!ct || !slug) return;
    const fields: Partial<ContentTask> = {};
    if (metaDraft.name !== undefined && metaDraft.name !== ct.name) fields.name = metaDraft.name;
    if (metaDraft.skill !== undefined && metaDraft.skill !== ct.skill) fields.skill = metaDraft.skill;
    if (metaDraft.target_channels !== undefined) fields.target_channels = metaDraft.target_channels;
    if (metaDraft.owner !== undefined && metaDraft.owner !== ct.owner) fields.owner = metaDraft.owner;
    if (metaDraft.scheduled_for !== undefined && metaDraft.scheduled_for !== ct.scheduled_for) {
      fields.scheduled_for = metaDraft.scheduled_for;
    }
    if (Object.keys(fields).length === 0) {
      setEditingMeta(false);
      return;
    }
    updateContentTask.mutate(
      { slug, parentTaskId: taskId, id: contentTaskId, fields },
      {
        onSuccess: () => {
          setEditingMeta(false);
          showToast("Detalles guardados.");
          // If the current channel was removed from target_channels, jump to
          // the first remaining channel so the URL stays valid.
          if (
            fields.target_channels &&
            !fields.target_channels.includes(channel) &&
            fields.target_channels.length > 0
          ) {
            handleSwitchChannel(fields.target_channels[0]);
          }
        },
      },
    );
  }

  // ── Derived state ────────────────────────────────────────────────────────
  const iteration = draft?.meta.iteration ?? 0;
  const placeholderBody = draft ? isPlaceholderBody(draft.body) : false;
  const channels = ct?.target_channels ?? [];
  const ctStatusClass = useMemo(() => {
    if (!ct) return "";
    return CT_STATUS_STYLES[ct.status] || "bg-muted text-muted-foreground border-border";
  }, [ct]);

  // Documents: split between drafts (already shown via channel switcher) and
  // attachments (research, sources, anything Escudero attached as subproducts).
  const attachments = useMemo(() => {
    if (!ct?.documents) return [];
    return ct.documents.filter((doc) => !doc.path.includes("content/drafts/"));
  }, [ct]);

  const btnGhost =
    "inline-flex items-center gap-1.5 px-2.5 py-1 text-[13px] bg-transparent border border-[#E5E2DC] rounded-md cursor-pointer text-[#7A7A7A] hover:bg-[#E5E2DC] hover:text-[#1A1A1A] transition-colors";

  if (ctLoading) {
    return (
      <DashboardLayout>
        <div className="p-6 text-sm text-muted-foreground">Cargando...</div>
      </DashboardLayout>
    );
  }

  if (!ct) {
    return (
      <DashboardLayout>
        <div className="p-6">
          <Link
            href={`/dashboard/${slug}/projects/${projectId}/tasks/${taskId}`}
            className="text-sm text-rust hover:underline"
          >
            ← Volver a la task
          </Link>
          <p className="mt-4 text-sm text-muted-foreground">ContentTask no encontrada.</p>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <Head>
        <title>{`${ct.name} · ${channel}`}</title>
      </Head>

      <div className="flex flex-col h-[calc(100vh-3rem)]">
        {/* Top header: parent breadcrumb + ct.id + name + status + actions */}
        <div className="flex items-center gap-3 px-4 py-2.5 border-b border-[#E5E2DC] bg-[#FAFAF8] shrink-0">
          <Link
            href={`/dashboard/${slug}/projects/${projectId}/tasks/${taskId}`}
            className="text-sm text-rust hover:underline shrink-0"
          >
            ← Volver a la task
          </Link>
          <span className="text-[10px] font-mono bg-[#F1F2F4] text-[#5C6470] px-2 py-1 rounded shrink-0">
            {ct.id}
          </span>
          <span className="text-[13px] font-bold text-[#1A1A1A] truncate">
            {ct.name} · {channel}
          </span>

          <div className="ml-auto flex items-center gap-2">
            {/* ContentTask status (Approved/Draft/Review/Ready/Published) */}
            <div className="relative">
              <button
                type="button"
                className="appearance-none bg-white border border-[#E8E2D9] rounded-lg cursor-pointer px-2.5 py-1 flex items-center gap-1.5 hover:border-[#2C3E50] transition-colors"
                onClick={() => setCtStatusOpen(!ctStatusOpen)}
              >
                <span className={cn("text-[11px] font-medium border rounded-full px-2 py-0.5", ctStatusClass)}>
                  {ct.status}
                </span>
                <span className="text-[10px] text-[#7F8C8D]">▾</span>
              </button>
              {ctStatusOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setCtStatusOpen(false)} />
                  <div className="absolute top-full right-0 mt-1 bg-white border-2 border-[#2C3E50] rounded-lg shadow-lg z-50 min-w-[170px] py-1">
                    {VALID_CONTENT_TASK_STATUSES.map((opt) => (
                      <button
                        key={opt}
                        className={cn(
                          "w-full text-left px-3 py-2 text-xs hover:bg-[#F0EDE8] transition-colors",
                          ct.status === opt && "bg-[#F0EDE8] font-semibold",
                        )}
                        onClick={() => {
                          setCtStatusOpen(false);
                          if (ct.status === opt) return;
                          updateContentTaskStatus.mutate({
                            slug,
                            parentTaskId: taskId,
                            id: contentTaskId,
                            status: opt as ContentTaskStatus,
                          });
                        }}
                      >
                        {opt}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
            <button
              type="button"
              onClick={() => {
                if (editingBody) setEditingBody(false);
                else if (draft) setEditingBody(true);
              }}
              disabled={!draft}
              className={btnGhost}
            >
              {editingBody ? "👁 Ver" : "✏️ Editar texto"}
            </button>

            {!sidebarOpen && (
              <button
                type="button"
                onClick={handleReopenChat}
                className={btnGhost}
                title="Reabrir el chat con Sancho"
              >
                💬 Abrir chat
              </button>
            )}
          </div>
        </div>

        {/* Channel switcher */}
        {channels.length > 1 && (
          <div className="flex items-center gap-2 px-4 py-2 border-b border-[#E5E2DC] bg-white shrink-0">
            <span className="text-[10px] uppercase tracking-[0.5px] text-[#7F8C8D] mr-1">
              Canal
            </span>
            {channels.map((ch) => {
              const active = ch === channel;
              return (
                <button
                  key={ch}
                  type="button"
                  onClick={() => handleSwitchChannel(ch)}
                  className={cn(
                    "text-xs px-3 py-1 rounded-full border transition-colors",
                    active
                      ? "bg-[#2C3E50] text-white border-[#2C3E50]"
                      : "bg-white text-[#5C6470] border-[#E8E2D9] hover:border-[#2C3E50]",
                  )}
                >
                  {ch}
                </button>
              );
            })}
            {iteration > 0 && (
              <span className="ml-auto text-[10px] text-muted-foreground font-mono">
                v{iteration}
              </span>
            )}
          </div>
        )}

        {/* Body */}
        {editingBody && draft ? (
          <div className="flex-1 min-h-0" key={`editor-${ideaId}-${channel}`}>
            <MarkdownEditor
              initialContent={draft.body}
              onSave={handleSaveBody}
              onCancel={() => setEditingBody(false)}
            />
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto px-6 py-6 space-y-5 max-w-3xl mx-auto w-full">
            {/* Detalles colapsable — todos los campos editables del CT */}
            <DetailsSection
              ct={ct}
              open={detailsOpen}
              onToggle={() => setDetailsOpen((v) => !v)}
              editing={editingMeta}
              draft={metaDraft}
              setDraft={setMetaDraft}
              onStartEdit={startEditMeta}
              onSave={saveMeta}
              onCancel={() => setEditingMeta(false)}
              onToggleChannel={toggleMetaChannel}
              saving={updateContentTask.isPending}
            />

            {/* Banner placeholder + body preview */}
            {isLoading && (
              <p className="text-sm text-muted-foreground text-center py-20">Cargando draft...</p>
            )}
            {error && (
              <p className="text-sm text-red-500 text-center py-20">Error al cargar el draft.</p>
            )}
            {!isLoading && !error && !draft && (
              <p className="text-sm text-muted-foreground text-center py-20">
                Draft no encontrado para el canal <code>{channel}</code>.
              </p>
            )}

            {draft && placeholderBody && (
              <div className="border border-[#FCD34D] bg-[#FFFBEB] rounded-lg px-4 py-3 text-sm text-[#92400E]">
                <strong>Este draft aún no se ha redactado.</strong> Escudero Content todavía
                no ha terminado. Puedes editarlo manualmente o pedirle a Sancho que lo
                redacte por el chat lateral →
              </div>
            )}

            {draft && (
              <ChannelPreview channel={channel} body={draft.body} brandSlug={slug} />
            )}

            {/* Adjuntos (subproductos: research, fuentes, etc.) */}
            {attachments.length > 0 && (
              <section className="bg-white border border-[#E8E2D9] rounded-[10px] overflow-hidden">
                <div className="px-4 py-2.5 border-b border-[#E8E2D9] flex items-center gap-2">
                  <span className="text-base">📎</span>
                  <span className="font-semibold text-sm text-[#2C3E50]">Adjuntos</span>
                  <span className="text-[10px] text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                    {attachments.length}
                  </span>
                </div>
                <ul className="p-3 space-y-1.5">
                  {attachments.map((doc) => {
                    const docName = doc.name || doc.path.split("/").pop()?.replace(".md", "") || "doc";
                    return (
                      <li
                        key={doc.path}
                        className="flex items-center gap-2 border border-[#E8E2D9] rounded-lg px-3 py-2"
                      >
                        <span className="text-base">📄</span>
                        <a
                          href={`/docs/${doc.path}`}
                          target="_blank"
                          rel="noreferrer"
                          className="flex-1 min-w-0 text-sm font-medium text-[#2C3E50] hover:text-rust hover:underline truncate"
                        >
                          {docName}
                        </a>
                        {doc.channel && (
                          <span className="text-[10px] bg-[#F1F2F4] text-[#5C6470] border border-[#D8DCE0] rounded px-1.5 py-0.5">
                            {doc.channel}
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={() =>
                            detachDoc.mutate({
                              slug,
                              parentTaskId: taskId,
                              id: contentTaskId,
                              path: doc.path,
                            })
                          }
                          title="Quitar adjunto (no borra el archivo)"
                          className="text-[12px] text-[#7A7A7A] hover:text-rust transition-colors"
                        >
                          ✕
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            )}
          </div>
        )}

        {/* Footer */}
        {draft && !editingBody && (
          <div className="flex items-center justify-between px-4 py-2 border-t border-[#E5E2DC] bg-[#FAFAF8] text-[10px] text-muted-foreground shrink-0">
            <span className="truncate font-mono">{draft.relPath}</span>
            <span className="flex-shrink-0 ml-3">
              Editado:{" "}
              {new Date(draft.meta.updated_at).toLocaleDateString("es-ES", {
                day: "numeric",
                month: "short",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          </div>
        )}

        {toast && (
          <div className="fixed bottom-12 left-1/2 -translate-x-1/2 z-[20] bg-[#2C3E50] text-white text-xs px-4 py-2 rounded-full shadow-lg">
            {toast}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Detalles section — collapsible CT metadata + edit mode.
// ─────────────────────────────────────────────────────────────────────────────

function DetailsSection({
  ct,
  open,
  onToggle,
  editing,
  draft,
  setDraft,
  onStartEdit,
  onSave,
  onCancel,
  onToggleChannel,
  saving,
}: {
  ct: ContentTask;
  open: boolean;
  onToggle: () => void;
  editing: boolean;
  draft: Partial<ContentTask>;
  setDraft: (
    update: Partial<ContentTask> | ((prev: Partial<ContentTask>) => Partial<ContentTask>),
  ) => void;
  onStartEdit: () => void;
  onSave: () => void;
  onCancel: () => void;
  onToggleChannel: (ch: string) => void;
  saving: boolean;
}) {
  const summary = useMemo(() => {
    const parts: string[] = [];
    if (ct.idea_id) parts.push(`Idea: ${ct.idea_id}`);
    if (ct.skill) parts.push(`Skill: ${ct.skill}`);
    if (ct.owner) parts.push(`Owner: ${ct.owner}`);
    if (ct.scheduled_for) {
      parts.push(
        `Scheduled: ${new Date(ct.scheduled_for).toLocaleDateString("es-ES", {
          day: "numeric",
          month: "short",
        })}`,
      );
    }
    return parts.join(" · ");
  }, [ct]);

  return (
    <section className="bg-white border border-[#E8E2D9] rounded-[10px] overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center gap-2 px-4 py-2.5 text-left hover:bg-[#FAFAF8] transition-colors"
      >
        <span className="text-base">📋</span>
        <span className="font-semibold text-sm text-[#2C3E50]">Detalles</span>
        <span className="text-xs text-muted-foreground truncate flex-1">{summary}</span>
        <span className="text-[10px] text-[#7F8C8D]">{open ? "▴" : "▾"}</span>
      </button>

      {open && (
        <div className="border-t border-[#E8E2D9] p-4 space-y-3">
          {/* Name */}
          <Field label="Nombre">
            {editing ? (
              <input
                value={draft.name || ""}
                onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                className="w-full border border-[#E8E2D9] rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-none focus:border-[#2C3E50]"
              />
            ) : (
              <div className="text-sm font-semibold text-[#2C3E50]">{ct.name}</div>
            )}
          </Field>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Field label="Skill">
              {editing ? (
                <SkillPicker
                  value={draft.skill ? [draft.skill] : []}
                  onChange={(arr) => setDraft((d) => ({ ...d, skill: arr[0] || "" }))}
                />
              ) : (
                <div className="text-sm font-semibold text-[#2C3E50]">
                  {ct.skill || <span className="text-muted-foreground italic">Sin skill</span>}
                </div>
              )}
            </Field>

            <Field label="Owner">
              {editing ? (
                <input
                  value={draft.owner || ""}
                  onChange={(e) => setDraft((d) => ({ ...d, owner: e.target.value }))}
                  className="w-full border border-[#E8E2D9] rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-none focus:border-[#2C3E50]"
                  placeholder="Escudero Content"
                />
              ) : (
                <div className="text-sm font-semibold text-[#2C3E50]">
                  {ct.owner || <span className="text-muted-foreground italic">—</span>}
                </div>
              )}
            </Field>

            <Field label="Idea fuente">
              <div className="text-sm font-mono text-[#2C3E50]">{ct.idea_id || "—"}</div>
            </Field>

            <Field label="Scheduled for">
              {editing ? (
                <input
                  type="date"
                  value={draft.scheduled_for ? draft.scheduled_for.slice(0, 10) : ""}
                  onChange={(e) =>
                    setDraft((d) => ({
                      ...d,
                      scheduled_for: e.target.value ? new Date(e.target.value).toISOString() : undefined,
                    }))
                  }
                  className="w-full border border-[#E8E2D9] rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-none focus:border-[#2C3E50]"
                />
              ) : (
                <div className="text-sm font-semibold text-[#2C3E50]">
                  {ct.scheduled_for ? (
                    new Date(ct.scheduled_for).toLocaleDateString("es-ES", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })
                  ) : (
                    <span className="text-muted-foreground italic">Sin fecha</span>
                  )}
                </div>
              )}
            </Field>
          </div>

          <Field label="Target channels">
            <div className="flex gap-2 flex-wrap">
              {TARGET_CHANNEL_OPTIONS.map((ch) => {
                const active = (editing ? draft.target_channels : ct.target_channels)?.includes(ch);
                return (
                  <button
                    key={ch}
                    type="button"
                    disabled={!editing}
                    onClick={() => editing && onToggleChannel(ch)}
                    className={cn(
                      "text-xs px-3 py-1 rounded-full border transition-colors",
                      active
                        ? "bg-[#2C3E50] text-white border-[#2C3E50]"
                        : "bg-white text-[#5C6470] border-[#E8E2D9]",
                      editing ? "cursor-pointer hover:border-[#2C3E50]" : "cursor-default",
                    )}
                  >
                    {ch}
                  </button>
                );
              })}
            </div>
          </Field>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#E8E2D9]">
            {editing ? (
              <>
                <button
                  type="button"
                  onClick={onCancel}
                  disabled={saving}
                  className="text-xs px-3 py-1.5 bg-white border border-[#E8E2D9] rounded-lg hover:border-[#2C3E50] transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={onSave}
                  disabled={saving}
                  className="text-xs px-3 py-1.5 bg-[#2C3E50] text-white rounded-lg hover:bg-[#1A252F] transition-colors disabled:opacity-50"
                >
                  {saving ? "Guardando..." : "Guardar"}
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={onStartEdit}
                className="text-xs px-3 py-1.5 bg-white border border-[#E8E2D9] rounded-lg hover:border-[#2C3E50] transition-colors"
              >
                ✏️ Editar detalles
              </button>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] text-[#7F8C8D] uppercase tracking-[0.5px] mb-1">{label}</div>
      {children}
    </div>
  );
}
