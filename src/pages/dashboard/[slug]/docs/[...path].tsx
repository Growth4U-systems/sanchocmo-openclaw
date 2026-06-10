/**
 * Internal doc viewer used by staff inside Mission Control.
 *
 * When the path points at a `*.commented.<ext>` sibling we surface the
 * comments the same way the public share view does: yellow inline
 * highlights anchored to the original text + hover tooltip + click
 * detail modal. The HTML cmt markers are scrubbed from the markdown
 * before render so they don't show as basura. Read-only here — staff
 * edit/delete tooling is a follow-up PR.
 *
 * Tools / agents that read brand docs and need to see the cliente's
 * feedback should request the `*.commented.<ext>` path explicitly
 * (e.g. `market-and-us/market/current.commented.md` instead of the
 * clean `current.md`). The commented sibling exists only while there
 * is at least one comment; otherwise the share/cleanup loop will have
 * removed it and only the original is on disk.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/router";
import { useQuery } from "@tanstack/react-query";
import Head from "next/head";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { useSlugSync } from "@/hooks/useSlugSync";
import {
  deriveDocTitle,
  formatCommentDate,
  stripCommentMarkers,
} from "@/lib/comments-client";

interface DocComment {
  id: string;
  author: string;
  email?: string | null;
  body: string;
  anchorText: string | null;
  anchorContext: string | null;
  anchorDocOffset: number | null;
  docVersion: number | null;
  createdAt: string;
}

interface ClientCommentsResponse {
  ok: boolean;
  documents?: Array<{
    docPath: string;
    count: number;
    comments: DocComment[];
  }>;
  error?: string;
}

interface HoverTooltip {
  comment: DocComment;
  top: number;
  left: number;
}

function isCommentedPath(p: string): boolean {
  return /\.commented(\.[a-z0-9]+)?$/i.test(p);
}

export default function DocViewerPage() {
  const slug = useSlugSync();
  const router = useRouter();
  const pathParts = router.query.path;
  const docPath = Array.isArray(pathParts) ? pathParts.join("/") : pathParts || "";
  const fullPath = slug ? `${slug}/${docPath}` : docPath;

  const articleRef = useRef<HTMLElement | null>(null);
  const tooltipHideTimer = useRef<number | null>(null);
  const [tooltip, setTooltip] = useState<HoverTooltip | null>(null);
  const [detail, setDetail] = useState<DocComment | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeMsg, setAnalyzeMsg] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ["doc", fullPath],
    queryFn: async () => {
      const res = await fetch(`/api/chat/doc/${fullPath}`);
      if (!res.ok) throw new Error("Document not found");
      return res.json();
    },
    enabled: !!fullPath && !!slug,
  });

  const showCommentOverlay = isCommentedPath(docPath);
  const brandRelativeDocPath = `brand/${slug}/${docPath}`;

  // Fetch the client's comments only when we're viewing a commented sibling.
  const { data: commentsData } = useQuery({
    queryKey: ["client-comments", slug],
    queryFn: async () => {
      const res = await fetch(`/api/clients/${slug}/comments`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return (await res.json()) as ClientCommentsResponse;
    },
    enabled: !!slug && showCommentOverlay,
  });

  const docComments: DocComment[] = useMemo(() => {
    if (!commentsData?.documents) return [];
    const match = commentsData.documents.find((d) => d.docPath === brandRelativeDocPath);
    return match?.comments ?? [];
  }, [commentsData, brandRelativeDocPath]);

  const commentsById = useMemo(() => {
    const m = new Map<string, DocComment>();
    for (const c of docComments) m.set(c.id, c);
    return m;
  }, [docComments]);

  const rawContent: string = data?.content || "";
  const renderedContent = showCommentOverlay ? stripCommentMarkers(rawContent) : rawContent;
  const fileName = deriveDocTitle(docPath.split("/").pop(), undefined);

  // Inject inline anchor highlights once article + comments are ready.
  useEffect(() => {
    const article = articleRef.current;
    if (!article || !showCommentOverlay || docComments.length === 0) return;

    const inserted: HTMLSpanElement[] = [];
    for (const c of docComments) {
      if (!c.anchorText) continue;
      injectAnchorInline(article, c.anchorText, c.id, inserted);
    }
    return () => {
      for (const span of inserted) {
        const parent = span.parentNode;
        if (!parent) continue;
        const text = document.createTextNode(span.textContent ?? "");
        parent.replaceChild(text, span);
      }
      try {
        article.normalize?.();
      } catch {
        // best-effort
      }
    };
  }, [renderedContent, docComments, showCommentOverlay]);

  // Hover / click event delegation for tooltip + detail modal.
  const closeDetail = useCallback(() => setDetail(null), []);

  // Manual trigger (option C): ask Sansón to triage this doc's client feedback.
  const analyzeFeedback = useCallback(async () => {
    const originalRel = `brand/${slug}/${docPath.replace(/\.commented(\.[a-z0-9]+)?$/i, (_m, ext) => ext ?? "")}`;
    setAnalyzing(true);
    setAnalyzeMsg(null);
    try {
      const res = await fetch(`/api/clients/${slug}/analyze-feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ docPath: originalRel }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || "No se pudo disparar el análisis");
      setAnalyzeMsg(
        d.forwardedToGateway
          ? "Análisis disparado — Sansón está procesando. Revisá en Mejoras."
          : `No se disparó: ${d.error || "sin comentarios"}`,
      );
    } catch (e) {
      setAnalyzeMsg(e instanceof Error ? e.message : "Error");
    } finally {
      setAnalyzing(false);
    }
  }, [slug, docPath]);

  useEffect(() => {
    const article = articleRef.current;
    if (!article || !showCommentOverlay) return;

    const onOver = (e: MouseEvent) => {
      const span = (e.target as Element | null)?.closest?.(".comment-anchor") as HTMLElement | null;
      if (!span) return;
      const id = span.dataset.cmtId ?? "";
      const c = commentsById.get(id);
      if (!c) return;
      if (tooltipHideTimer.current) {
        window.clearTimeout(tooltipHideTimer.current);
        tooltipHideTimer.current = null;
      }
      const rect = span.getBoundingClientRect();
      setTooltip({
        comment: c,
        top: rect.bottom + 8,
        left: rect.left + rect.width / 2,
      });
    };
    const onOut = (e: MouseEvent) => {
      const span = (e.target as Element | null)?.closest?.(".comment-anchor");
      if (!span) return;
      if (tooltipHideTimer.current) window.clearTimeout(tooltipHideTimer.current);
      tooltipHideTimer.current = window.setTimeout(() => setTooltip(null), 120);
    };
    const onClick = (e: MouseEvent) => {
      const span = (e.target as Element | null)?.closest?.(".comment-anchor") as HTMLElement | null;
      if (!span) return;
      e.preventDefault();
      const id = span.dataset.cmtId ?? "";
      const c = commentsById.get(id);
      if (!c) return;
      setTooltip(null);
      setDetail(c);
    };

    article.addEventListener("mouseover", onOver);
    article.addEventListener("mouseout", onOut);
    article.addEventListener("click", onClick);
    return () => {
      article.removeEventListener("mouseover", onOver);
      article.removeEventListener("mouseout", onOut);
      article.removeEventListener("click", onClick);
    };
  }, [commentsById, showCommentOverlay]);

  return (
    <DashboardLayout>
      <Head>
        <title>{fileName} — {slug} — Mission Control</title>
      </Head>
      <style jsx global>{`
        .comment-anchor {
          background-color: rgba(255, 235, 59, 0.45);
          border-bottom: 1px dotted rgba(180, 130, 0, 0.7);
          cursor: pointer;
          padding: 0 1px;
          border-radius: 2px;
          transition: background-color 120ms ease;
        }
        .comment-anchor:hover {
          background-color: rgba(255, 200, 0, 0.65);
        }
        .dark .comment-anchor {
          background-color: rgba(255, 220, 100, 0.25);
          border-bottom-color: rgba(255, 220, 100, 0.6);
        }
        .dark .comment-anchor:hover {
          background-color: rgba(255, 220, 100, 0.4);
        }
      `}</style>

      <div className="flex items-center gap-1 text-xs text-muted-foreground mb-4">
        <span>brand</span>
        <span>/</span>
        <span>{slug}</span>
        {docPath.split("/").map((part, i) => (
          <span key={i} className="flex items-center gap-1">
            <span>/</span>
            <span className={i === docPath.split("/").length - 1 ? "text-foreground font-medium" : ""}>
              {part}
            </span>
          </span>
        ))}
        {showCommentOverlay && (
          <span className="ml-3 inline-flex items-center gap-1 rounded-full bg-yellow-200/40 dark:bg-yellow-300/20 px-2 py-0.5 text-[10px] font-semibold text-yellow-900 dark:text-yellow-200">
            💬 con comentarios{docComments.length > 0 && ` (${docComments.length})`}
          </span>
        )}
        {showCommentOverlay && docComments.length > 0 && (
          <button
            type="button"
            onClick={analyzeFeedback}
            disabled={analyzing}
            className="ml-2 inline-flex items-center gap-1 rounded-full border border-rust/40 bg-rust/10 px-2 py-0.5 text-[10px] font-semibold text-rust hover:bg-rust/15 disabled:opacity-50"
          >
            🛡️ {analyzing ? "Analizando…" : "Analizar feedback"}
          </button>
        )}
        {analyzeMsg && (
          <span className="ml-2 text-[10px] text-muted-foreground">{analyzeMsg}</span>
        )}
      </div>

      {isLoading && (
        <div className="rounded-lg border-[3px] border-ink bg-card p-8 shadow-comic text-center">
          <p className="text-muted-foreground">Cargando documento...</p>
        </div>
      )}

      {error && (
        <div className="rounded-lg border-[3px] border-destructive bg-destructive/10 p-8 text-center">
          <p className="text-destructive font-semibold">Documento no encontrado</p>
          <p className="text-sm text-muted-foreground mt-2">{fullPath}</p>
        </div>
      )}

      {renderedContent && (
        <div className="rounded-lg border-[3px] border-ink bg-card p-8 shadow-comic">
          <article
            ref={articleRef}
            className="prose prose-sm max-w-none dark:prose-invert prose-headings:font-heading prose-headings:text-navy prose-a:text-rust"
          >
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{renderedContent}</ReactMarkdown>
          </article>
        </div>
      )}

      {tooltip && !detail && (
        <div
          className="fixed z-40 max-w-xs px-3 py-2 bg-[#1A1A1A] text-white text-[11px] rounded-md shadow-lg pointer-events-none"
          style={{
            top: tooltip.top,
            left: tooltip.left,
            transform: "translateX(-50%)",
          }}
        >
          <div className="flex items-center justify-between gap-2 mb-1">
            <span className="font-bold">{tooltip.comment.author}</span>
            <span className="opacity-70 text-[10px]">
              {formatCommentDate(tooltip.comment.createdAt)}
            </span>
          </div>
          <p className="whitespace-pre-wrap break-words">
            {tooltip.comment.body.length > 200
              ? tooltip.comment.body.slice(0, 200) + "…"
              : tooltip.comment.body}
          </p>
          <p className="mt-1 text-[10px] opacity-60 italic">Click para ver detalle</p>
        </div>
      )}

      {detail && (
        <div
          className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
          onClick={closeDetail}
        >
          <div
            className="bg-white dark:bg-[#181825] rounded-lg shadow-xl max-w-lg w-full p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-2 mb-3">
              <div>
                <h2 className="text-sm font-bold">{detail.author}</h2>
                <p className="text-[10px] text-muted-foreground">
                  {formatCommentDate(detail.createdAt)}
                  {detail.email && <span className="ml-2">· {detail.email}</span>}
                </p>
              </div>
              <button
                type="button"
                onClick={closeDetail}
                aria-label="Cerrar"
                className="text-xl text-muted-foreground hover:text-foreground"
              >
                ×
              </button>
            </div>
            {detail.anchorText && (
              <blockquote className="text-[11px] text-muted-foreground border-l-2 border-rust pl-2 mb-3 italic whitespace-pre-wrap">
                &quot;{detail.anchorText}&quot;
              </blockquote>
            )}
            <p className="text-[13px] whitespace-pre-wrap">{detail.body}</p>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}

/**
 * Walk text nodes inside `article` and wrap the first occurrence of
 * `anchorText` with a span. Mirrors the implementation in the public
 * share view — see `src/pages/share/[token].tsx`. Refactor target:
 * extract into a shared `comments-dom.ts` once the third caller lands.
 */
function injectAnchorInline(
  article: HTMLElement,
  anchorText: string,
  commentId: string,
  inserted: HTMLSpanElement[],
): void {
  if (!anchorText) return;
  const walker = document.createTreeWalker(article, NodeFilter.SHOW_TEXT);
  let node: Node | null = walker.nextNode();
  while (node) {
    const text = node as Text;
    const parent = text.parentNode as HTMLElement | null;
    if (!parent || parent.closest?.(".comment-anchor")) {
      node = walker.nextNode();
      continue;
    }
    const value = text.nodeValue ?? "";
    const idx = value.indexOf(anchorText);
    if (idx < 0) {
      node = walker.nextNode();
      continue;
    }
    const before = value.slice(0, idx);
    const after = value.slice(idx + anchorText.length);
    const span = document.createElement("span");
    span.className = "comment-anchor";
    span.dataset.cmtId = commentId;
    span.textContent = anchorText;
    if (before) parent.insertBefore(document.createTextNode(before), text);
    parent.insertBefore(span, text);
    if (after) parent.insertBefore(document.createTextNode(after), text);
    parent.removeChild(text);
    inserted.push(span);
    return;
  }
}
