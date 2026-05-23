"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import Head from "next/head";
import Link from "next/link";
import dynamic from "next/dynamic";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { useSlugSync } from "@/hooks/useSlugSync";
import { useDraft, useSaveDraft } from "@/hooks/useDraft";
import {
  useContentTask,
  useUpdateContentTask,
  useUpdateContentTaskStatus,
  useDetachDocumentFromContentTask,
  useApproveDraft,
  useApproveMedia,
  useDiscardContentTask,
  useDeferContentTask,
} from "@/hooks/useContentTasks";
import { useOpenChat } from "@/hooks/useChat";
import { useContentEngineEvents } from "@/hooks/useContentEngineEvents";
import { buildContentTaskThread } from "@/lib/chat-openers";
import { ChannelPreview, isPlaceholderBody } from "@/components/content/channel-preview";
import { MediaGallery } from "@/components/content/MediaGallery";
import { MediaSummaryWidget } from "@/components/content/MediaSummaryWidget";
import { SelfQAPanel } from "@/components/content/self-qa-panel";
import type { ContentTaskStatus } from "@/types";
import { EditorHeader } from "@/components/content/editor-v2/EditorHeader";
import { StatusStepper, STEPS } from "@/components/content/editor-v2/StatusStepper";
import { DocRail, type RailDoc, type RailOutput } from "@/components/content/editor-v2/DocRail";
import { QAInline } from "@/components/content/editor-v2/QAInline";
import { DocHeader } from "@/components/content/editor-v2/DocHeader";
import { extractQaSummary, parseQaReportBody } from "@/lib/data/qa-reports";
import styles from "@/components/content/editor-v2/editor-v2.module.css";

const MarkdownEditor = dynamic(
  () => import("@/components/brand-brain/markdown-editor").then((m) => m.MarkdownEditor),
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

const SPECIAL_DOCS: { key: string; label: string; alwaysOn?: boolean }[] = [
  { key: "proposal", label: "Propuesta" },
  { key: "research", label: "Research" },
  { key: "clarify", label: "Clarify" },
  // `media` is virtual — there's no markdown doc on disk. Always shown so the
  // user can manage assets for any channel from a single place.
  { key: "media", label: "Media", alwaysOn: true },
];

const RAIL_STORAGE_KEY = "mc.editor.railCollapsed";

function ownerInitials(owner?: string | null): string | undefined {
  if (!owner) return undefined;
  const parts = owner.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return undefined;
  return (parts[0][0] + (parts[1]?.[0] || "")).toUpperCase();
}

function previousStatus(s: ContentTaskStatus): ContentTaskStatus | null {
  const idx = STEPS.findIndex((x) => x.id === s);
  if (idx <= 0) return null;
  return STEPS[idx - 1].id;
}

export default function DraftFullScreenPage() {
  const slug = useSlugSync() || "";
  const router = useRouter();
  // This component is rendered for two URL patterns (the unified
  // /tasks/[taskId]/sub/[subTaskId]/... route re-exports it). Under the legacy
  // /projects/[projectId]/tasks/[taskId]/... pattern `taskId` is the parent
  // task; under the unified one `taskId` is the project and `subTaskId` is the
  // parent task. Detect `subTaskId` and remap so `useContentTask` gets the
  // actual parent task id either way — otherwise the API 404s with
  // "ContentTask no encontrada".
  const subTaskIdRaw = (router.query.subTaskId as string | undefined) || undefined;
  const projectId = subTaskIdRaw
    ? ((router.query.taskId as string) || "")
    : ((router.query.projectId as string) || "");
  const taskId = subTaskIdRaw || ((router.query.taskId as string) || "");
  const contentTaskId = (router.query.contentTaskId as string) || "";
  const channel = (router.query.channel as string) || "";

  const { data: ct, isLoading: ctLoading } = useContentTask(
    slug || null,
    taskId || null,
    contentTaskId || null,
  );
  const ideaId = ct?.idea_id || null;

  // The "media" tab is virtual — no markdown doc on disk. Skip the draft
  // fetch so we don't generate a noisy 404.
  const draftChannel = channel === "media" ? null : channel || null;
  const { data: draft, isLoading, error } = useDraft(slug, ideaId, draftChannel);
  const { data: qaReport } = useDraft(slug, ideaId, ideaId ? "QA-REPORT-research" : null);
  // Always fetch research/clarify/proposal so QAInline can tell stub from
  // real research, and DocRail can show the right done-state per doc —
  // independent of which tab the user is on.
  const { data: researchDoc } = useDraft(slug, ideaId, ideaId ? "research" : null);
  const { data: clarifyDoc } = useDraft(slug, ideaId, ideaId ? "clarify" : null);
  const { data: proposalDoc } = useDraft(slug, ideaId, ideaId ? "proposal" : null);
  const saveDraft = useSaveDraft();
  const updateContentTask = useUpdateContentTask();
  const updateContentTaskStatus = useUpdateContentTaskStatus();
  const detachDoc = useDetachDocumentFromContentTask();
  const approveDraft = useApproveDraft();
  const approveMedia = useApproveMedia();
  const discardContentTask = useDiscardContentTask();
  const deferContentTask = useDeferContentTask();
  const openChat = useOpenChat();
  // Live updates: agent-driven status moves (e.g. Draft → Pending Media)
  // arrive via SSE so the UI doesn't show stale "Aprobar texto" buttons.
  useContentEngineEvents(slug || null);

  const [editingBody, setEditingBody] = useState(false);
  const [railCollapsed, setRailCollapsed] = useState(false);
  const [channelEditorOpen, setChannelEditorOpen] = useState(false);
  const [draftChannels, setDraftChannels] = useState<string[]>([]);
  const [toast, setToast] = useState<string | null>(null);


  // Restore rail collapsed state once.
  useEffect(() => {
    try {
      const saved = localStorage.getItem(RAIL_STORAGE_KEY);
      if (saved === "1") setRailCollapsed(true);
    } catch { /* ignore */ }
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(RAIL_STORAGE_KEY, railCollapsed ? "1" : "0");
    } catch { /* ignore */ }
  }, [railCollapsed]);

  // Sync chat sidebar to the Content Task thread.
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

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  }

  async function handleSaveBody(body: string) {
    if (!ideaId || !channel) return;
    await saveDraft.mutateAsync({ slug, ideaId, channel, body });
    setEditingBody(false);
    showToast("Draft guardado.");
  }

  function switchChannel(nextChannel: string) {
    if (nextChannel === channel) return;
    router.push(
      `/dashboard/${slug}/tasks/${projectId}/sub/${taskId}/content/${contentTaskId}/draft/${nextChannel}`,
    );
  }

  // ── Stepper handlers ─────────────────────────────────────────────────────
  // Pull the QA summary from the QA-REPORT, then top up missing fields from
  // research.md (its HTML marker `<!-- ... | fuentes: N | búsquedas: M -->`
  // is the canonical source for those counts when qa-bot's frontmatter
  // omits `sources:` / `searches:`).
  const qaParsed = useMemo(() => {
    const summary = extractQaSummary(qaReport?.meta, qaReport?.body);
    if (!summary) return null;
    if (summary.sources != null && summary.searches != null) return summary;
    const fromResearch = parseQaReportBody(researchDoc?.body) || {};
    return {
      ...summary,
      sources: summary.sources ?? fromResearch.sources,
      searches: summary.searches ?? fromResearch.searches,
    };
  }, [qaReport?.meta, qaReport?.body, researchDoc?.body]);

  const approveCurrent = useCallback(() => {
    if (!ct) return;
    if (ct.status === "New") {
      updateContentTaskStatus.mutate(
        { slug, parentTaskId: taskId, id: contentTaskId, status: "Approved" },
        {
          onSuccess: () => showToast("Idea aprobada. Sancho arrancando…"),
          onError: (e) => showToast(`Error: ${(e as Error).message}`),
        },
      );
    } else if (ct.status === "Draft") {
      approveDraft.mutate(
        { slug, parentTaskId: taskId, id: contentTaskId },
        {
          onSuccess: () => showToast("Texto aprobado. Adjunta o genera media."),
          onError: (e) => showToast(`Error: ${(e as Error).message}`),
        },
      );
    } else if (ct.status === "Pending Media") {
      approveMedia.mutate(
        { slug, parentTaskId: taskId, id: contentTaskId },
        {
          onSuccess: () => showToast("Media aprobada. Lista para publicar."),
          onError: (e) => showToast(`Error: ${(e as Error).message}`),
        },
      );
    } else if (ct.status === "Ready") {
      // Programar = ir al calendario con foco en este draft. La operacion
      // real (drag-drop al dia + modal con fecha+hora+provider) vive ahi.
      // Antes este boton flipeaba el flag a Published sin despachar; era
      // engañoso. Ahora el unico despacho real es a traves del calendario.
      router.push(
        `/dashboard/${slug}/content-creation?tab=calendar&focus=${encodeURIComponent(`${ct.idea_id}:${channel}`)}`,
      );
    }
  }, [
    ct,
    slug,
    taskId,
    contentTaskId,
    updateContentTaskStatus,
    approveDraft,
    approveMedia,
    router,
    channel,
  ]);

  function revertCurrent() {
    if (!ct) return;
    const prev = previousStatus(ct.status);
    if (!prev) return;
    updateContentTaskStatus.mutate(
      { slug, parentTaskId: taskId, id: contentTaskId, status: prev },
      {
        onSuccess: () => showToast(`Estado revertido a ${prev}.`),
        onError: (e) => showToast(`Error: ${(e as Error).message}`),
      },
    );
  }

  // Approve button config per current status
  const approveConfig = useMemo(() => {
    if (!ct) return null;
    switch (ct.status) {
      case "New":
        return { fn: approveCurrent, label: "Aprobar", disabled: false } as const;
      case "Approved":
        // System-driven; no manual Aprobar.
        return null;
      case "Draft":
        return { fn: approveCurrent, label: "Aprobar texto", disabled: false } as const;
      case "Pending Media": {
        // The backend approve-media endpoint requires `hasMedia` (any channel),
        // not `pipeline_state === "media-review"`. We follow the same rule so
        // the button is clickable as soon as there's at least one asset, even
        // if the pipeline_state lagged (which used to happen silently when
        // `maybePromoteContentTaskFromMedia` was no-op due to a webpack
        // require bug — now fixed). The user-visible draft is the source of
        // truth here; pipeline_state is just a hint.
        const hasMedia =
          ct.pipeline_state === "media-review" ||
          (draft?.meta.media?.length ?? 0) > 0;
        return {
          fn: approveCurrent,
          label: "Aprobar media",
          disabled: !hasMedia,
          reason: hasMedia ? undefined : "Adjunta o genera media para aprobar",
        } as const;
      }
      case "Ready":
        return { fn: approveCurrent, label: "Programar", disabled: false } as const;
      default:
        return null;
    }
  }, [ct, approveCurrent, draft?.meta.media?.length]);

  // Volver button: hide when previous is "New" (first step, meaningless to go back)
  // and from terminal states.
  const showRevert = useMemo(() => {
    if (!ct) return false;
    const prev = previousStatus(ct.status);
    if (!prev || prev === "New") return false;
    return true;
  }, [ct]);

  const isPending =
    updateContentTaskStatus.isPending ||
    approveDraft.isPending ||
    approveMedia.isPending;

  // ── Rail data ────────────────────────────────────────────────────────────
  // The proposal/research/clarify docs are *all* attached to the ContentTask
  // at approval time as stubs (`status: pending`), so existence alone is not
  // a reliable "done" signal. Compute it per doc kind:
  //   - proposal: generated complete from idea data → done as soon as it exists.
  //   - research: done when frontmatter.status !== "pending" AND the body is
  //     no longer the placeholder ("Pendiente. Dulcinea rellenará…", or the
  //     legacy "Pendiente. Escudero rellenará…" for older content tasks).
  //   - clarify:  done when clarify_status === "answered" / "skipped". The
  //     stub shows the questions Sancho wrote, but the human still has to
  //     answer them — that's what "done" means for clarify.
  const railDocs: RailDoc[] = useMemo(() => {
    const have = new Set(
      (ct?.documents || [])
        .filter((d) => d.channel && SPECIAL_DOCS.some((s) => s.key === d.channel))
        .map((d) => d.channel as string),
    );
    const researchPlaceholderRe = /Pendiente\. (?:Dulcinea|Escudero) rellenará/i;
    // Research is "done" when the file exists with real body content. The
    // legacy status check on the .md frontmatter is gone — phase tracking
    // moved to ct.channel_phases (per-channel, in tasks.json) and special
    // docs are binary "exists with real content or not".
    const researchDone =
      have.has("research") &&
      typeof researchDoc?.body === "string" &&
      researchDoc.body.trim().length >= 200 &&
      !researchPlaceholderRe.test(researchDoc.body);
    const clarifyStatus = clarifyDoc?.meta?.clarify_status;
    const clarifyDone =
      have.has("clarify") &&
      (clarifyStatus === "answered" || clarifyStatus === "skipped");
    const proposalDone = have.has("proposal") && !!proposalDoc;
    const doneByKey: Record<string, boolean> = {
      proposal: proposalDone,
      research: !!researchDone,
      clarify: !!clarifyDone,
    };
    return SPECIAL_DOCS.filter((d) => d.alwaysOn || have.has(d.key)).map((d) => ({
      id: d.key,
      label: d.label,
      done: d.alwaysOn ? false : !!doneByKey[d.key],
    }));
  }, [ct, researchDoc, clarifyDoc, proposalDoc]);

  const railOutputs: RailOutput[] = useMemo(() => {
    const channels = ct?.target_channels ?? [];
    return channels.map((c) => ({
      id: c,
      label: c,
      active: c === channel,
      live: ct?.channel_phases?.[c] === "drafting",
    }));
  }, [ct, channel]);

  // ── Derived ──────────────────────────────────────────────────────────────
  const isSpecialChannel = SPECIAL_DOCS.some((s) => s.key === channel);
  const docLabel = useMemo(() => {
    const s = SPECIAL_DOCS.find((x) => x.key === channel);
    if (s) return s.label;
    return channel || "—";
  }, [channel]);

  const docPath =
    channel === "media"
      ? `content/drafts/${ideaId ?? "?"}/ (media assets)`
      : draft?.relPath || `content/drafts/${ideaId ?? "?"}/${channel}.md`;
  const placeholderBody = draft ? isPlaceholderBody(draft.body) : false;

  const attachments = useMemo(() => {
    if (!ct?.documents) return [];
    return ct.documents.filter((doc) => !doc.path.includes("content/drafts/"));
  }, [ct]);

  // ── Channel editor modal handlers ────────────────────────────────────────
  function openChannelEditor() {
    if (!ct) return;
    setDraftChannels([...ct.target_channels]);
    setChannelEditorOpen(true);
  }
  function toggleDraftChannel(c: string) {
    setDraftChannels((arr) => (arr.includes(c) ? arr.filter((x) => x !== c) : [...arr, c]));
  }
  function saveChannels() {
    if (!ct) return;
    updateContentTask.mutate(
      { slug, parentTaskId: taskId, id: contentTaskId, fields: { target_channels: draftChannels } },
      {
        onSuccess: () => {
          setChannelEditorOpen(false);
          showToast("Canales actualizados.");
          if (
            !draftChannels.includes(channel) &&
            !isSpecialChannel &&
            draftChannels.length > 0
          ) {
            switchChannel(draftChannels[0]);
          }
        },
        onError: (e) => showToast(`Error: ${(e as Error).message}`),
      },
    );
  }

  // ── Loading / not-found ──────────────────────────────────────────────────
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
            href={`/dashboard/${slug}/tasks/${taskId}`}
            className="text-sm text-rust hover:underline"
          >
            ← Volver a la task
          </Link>
          <p className="mt-4 text-sm text-muted-foreground">ContentTask no encontrada.</p>
        </div>
      </DashboardLayout>
    );
  }

  // ── Banner for Discarded / Deferred ──────────────────────────────────────
  let banner: React.ReactNode = null;
  if (ct.status === "Discarded") {
    banner = (
      <div className={`${styles.terminalBanner} ${styles.terminalBannerDiscarded}`}>
        🗑 ContentTask descartada
      </div>
    );
  } else if (ct.status === "Deferred") {
    banner = (
      <div className={`${styles.terminalBanner} ${styles.terminalBannerDeferred}`}>
        ⏸ ContentTask aplazada
      </div>
    );
  }

  const inTerminal =
    ct.status === "Published" || ct.status === "Discarded" || ct.status === "Deferred";

  return (
    <DashboardLayout>
      <Head>
        <title>{`${ct.name} · ${channel}`}</title>
      </Head>

      <div className={styles.app}>
        <EditorHeader
          backHref={`/dashboard/${slug}/tasks/${taskId}`}
          taskId={ct.id}
          skill={ct.skill}
          title={ct.name}
          ideaId={ct.idea_id}
          owner={ct.owner}
          ownerInitials={ownerInitials(ct.owner)}
          scheduledFor={draft?.meta.publishing?.scheduled_at}
          banner={banner}
          stepper={
            <StatusStepper
              current={ct.status}
              onApprove={approveConfig ? approveConfig.fn : null}
              approveDisabled={approveConfig?.disabled}
              approveDisabledReason={approveConfig?.reason}
              approveLabel={approveConfig?.label}
              onRevert={showRevert ? revertCurrent : null}
              isPending={isPending}
            />
          }
        />

        {/* Body — rail + workspace OR full-screen markdown editor */}
        {editingBody && draft ? (
          <div
            className="flex-1 min-h-0"
            key={`editor-${ideaId}-${channel}`}
          >
            <MarkdownEditor
              initialContent={draft.body}
              onSave={handleSaveBody}
              onCancel={() => setEditingBody(false)}
            />
          </div>
        ) : (
          <div className={`${styles.workspace} ${railCollapsed ? styles.workspaceCollapsed : ""}`}>
            <DocRail
              documents={railDocs}
              outputs={railOutputs}
              activeDocId={channel}
              collapsed={railCollapsed}
              onToggle={() => setRailCollapsed((v) => !v)}
              onDocClick={switchChannel}
              onOutputClick={switchChannel}
              onAddOutput={openChannelEditor}
            />

            <div className={styles.workspaceDoc}>
              <QAInline
                ct={ct}
                activeDoc={channel}
                qaReport={qaParsed}
                researchBody={researchDoc?.body}
                onSwitchDoc={switchChannel}
              />

              <DocHeader
                title={docLabel}
                path={docPath}
                onEdit={
                  channel === "media"
                    ? undefined
                    : () => {
                        if (draft) setEditingBody(true);
                      }
                }
                editLabel="Editar texto"
                onDefer={
                  inTerminal
                    ? undefined
                    : () =>
                        deferContentTask.mutate(
                          { slug, parentTaskId: taskId, id: contentTaskId },
                          {
                            onSuccess: () => showToast("Aplazado."),
                            onError: (e) => showToast(`Error: ${(e as Error).message}`),
                          },
                        )
                }
                onDiscard={
                  inTerminal
                    ? undefined
                    : () =>
                        discardContentTask.mutate(
                          { slug, parentTaskId: taskId, id: contentTaskId },
                          {
                            onSuccess: () => showToast("Descartado."),
                            onError: (e) => showToast(`Error: ${(e as Error).message}`),
                          },
                        )
                }
              />


              {/* Body */}
              <div className={styles.docInner}>
                {channel === "media" && ideaId ? (
                  <MediaGallery
                    slug={slug}
                    ideaId={ideaId}
                    contentTaskId={ct.id}
                    targetChannels={ct.target_channels}
                    initialChannel={(router.query.from as string) || undefined}
                  />
                ) : (
                  <>
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
                    <strong>Este draft aún no se ha redactado.</strong> Dulcinea
                    todavía no ha terminado. Puedes editarlo manualmente o pedirle a Sancho
                    que lo redacte por el chat lateral →
                  </div>
                )}

                {/* Render the body only when there's real content. Placeholder
                    drafts (the stub from generate-drafts.ts that just echoes
                    the proposal/angle) are intentionally hidden — the banner
                    above already says nothing has been written yet. */}
                {draft && !placeholderBody && (
                  <ChannelPreview
                    channel={channel}
                    body={draft.body}
                    brandSlug={slug}
                    media={draft.meta.media}
                  />
                )}

                {draft && !isSpecialChannel && ideaId && (
                  <MediaSummaryWidget
                    media={draft.meta.media || []}
                    href={`/dashboard/${slug}/tasks/${projectId}/sub/${taskId}/content/${contentTaskId}/draft/media?from=${channel}`}
                  />
                )}

                {draft?.meta.self_qa && (
                  <SelfQAPanel
                    verdict={draft.meta.self_qa}
                    notes={draft.meta.self_qa_notes}
                  />
                )}

                {channel === "research" && qaReport && (
                  <details
                    className="bg-white border border-[#E8E2D9] rounded-[10px] overflow-hidden"
                    open
                  >
                    <summary className="px-4 py-2.5 border-b border-[#E8E2D9] flex items-center gap-2 cursor-pointer select-none">
                      <span className="text-base">🧪</span>
                      <span className="font-semibold text-sm text-[#2C3E50]">QA Report</span>
                      <span className="text-[10px] text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                        qa-bot
                      </span>
                      <span className="ml-auto text-[10px] text-muted-foreground font-mono truncate">
                        {qaReport.relPath}
                      </span>
                    </summary>
                    <div className="prose prose-sm max-w-none px-5 py-4">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{qaReport.body}</ReactMarkdown>
                    </div>
                  </details>
                )}

                {/* PublishBar retirado: la programacion vive en la pestana
                    Calendar (drag-drop + modal con fecha/hora/provider).
                    El stepper "Programar" navega alli con foco al draft. */}

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
                        const docName =
                          doc.name ||
                          doc.path.split("/").pop()?.replace(".md", "") ||
                          "doc";
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
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        {draft && !editingBody && (
          <div className={styles.footer}>
            <span className={styles.footerPath}>{draft.relPath}</span>
            {(() => {
              const raw = draft.meta.updated_at;
              const d = raw ? new Date(raw) : null;
              if (!d || Number.isNaN(d.getTime())) return null;
              return (
                <span>
                  Editado:{" "}
                  {d.toLocaleDateString("es-ES", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              );
            })()}
          </div>
        )}

        {toast && <div className={styles.toast}>{toast}</div>}

        {channelEditorOpen && (
          <div
            className={styles.modalBackdrop}
            onClick={(e) => {
              if (e.target === e.currentTarget) setChannelEditorOpen(false);
            }}
          >
            <div className={styles.modalCard}>
              <h3 className={styles.modalTitle}>Canales objetivo</h3>
              <div className={styles.modalChips}>
                {TARGET_CHANNEL_OPTIONS.map((c) => {
                  const active = draftChannels.includes(c);
                  return (
                    <button
                      key={c}
                      type="button"
                      className={`${styles.modalChip} ${active ? styles.modalChipActive : ""}`}
                      onClick={() => toggleDraftChannel(c)}
                    >
                      {c}
                    </button>
                  );
                })}
              </div>
              <div className={styles.modalActions}>
                <button
                  type="button"
                  className={styles.actBtn}
                  onClick={() => setChannelEditorOpen(false)}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  className={styles.actBtn}
                  onClick={saveChannels}
                  disabled={updateContentTask.isPending}
                >
                  Guardar
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
