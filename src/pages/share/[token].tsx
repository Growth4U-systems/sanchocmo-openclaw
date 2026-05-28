/**
 * /share/[token] — Public document viewer with comments (SAN-15).
 *
 * Unauthenticated. Renders any document whose share token validates.
 * Layout: minimal header + content area (markdown or HTML iframe) +
 * comments list below the doc.
 *
 * Comment UX (markdown):
 *  - Select text → floating "Comentar" button → form modal with anchor.
 *  - Anchored comments render inline as yellow-highlighted spans in the doc.
 *  - Hover an anchor mark → tooltip with author + body snippet.
 *  - Click an anchor mark (or a comment in the list) → detail modal with
 *    full body + full anchor context.
 *  - Edit/Delete in the detail modal, ONLY for comments whose id is in
 *    localStorage on this browser (the commenter's own browser).
 *
 * HTML docs: the iframe sandbox blocks selection forwarding to parent, so
 * only the header "Comentar" button (whole-doc, no anchor) is offered.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Head from "next/head";
import { useRouter } from "next/router";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  type AnchorPayload,
  buildAnchorPayload,
  formatCommentDate,
  validateCommentForm,
} from "@/lib/comments-client";
import {
  isMyComment,
  markCommentAsMine,
  unmarkCommentAsMine,
} from "@/lib/comments-ownership";

interface ShareResponse {
  ok: boolean;
  slug?: string;
  path?: string;
  filename?: string;
  content?: string;
  iat?: number;
  error?: string;
}

interface PublicComment {
  id: string;
  author: string;
  body: string;
  anchorText: string | null;
  anchorContext: string | null;
  anchorDocOffset: number | null;
  docVersion: number | null;
  createdAt: string;
}

interface CommentsResponse {
  ok: boolean;
  comments?: PublicComment[];
  error?: string;
}

interface SelectionPopup {
  top: number;
  left: number;
  text: string;
}

interface FormState {
  open: boolean;
  anchor: AnchorPayload | null;
  author: string;
  email: string;
  body: string;
  submitting: boolean;
  errors: Record<string, string>;
  submitError: string | null;
}

const EMPTY_FORM: FormState = {
  open: false,
  anchor: null,
  author: "",
  email: "",
  body: "",
  submitting: false,
  errors: {},
  submitError: null,
};

interface HoverTooltip {
  comment: PublicComment;
  top: number;
  left: number;
}

interface DetailState {
  comment: PublicComment;
  editing: boolean;
  editBody: string;
  saving: boolean;
  deleting: boolean;
  saveError: string | null;
}

export default function SharePage() {
  const router = useRouter();
  const { token } = router.query;
  const [data, setData] = useState<ShareResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [comments, setComments] = useState<PublicComment[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentsError, setCommentsError] = useState<string | null>(null);

  const [popup, setPopup] = useState<SelectionPopup | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [tooltip, setTooltip] = useState<HoverTooltip | null>(null);
  const [detail, setDetail] = useState<DetailState | null>(null);

  const articleRef = useRef<HTMLElement | null>(null);
  const tooltipHideTimer = useRef<number | null>(null);

  const tokenStr = typeof token === "string" ? token : "";

  const commentsById = useMemo(() => {
    const m = new Map<string, PublicComment>();
    for (const c of comments) m.set(c.id, c);
    return m;
  }, [comments]);

  // Fetch the document.
  useEffect(() => {
    if (!tokenStr) return;
    setLoading(true);
    setError(null);
    fetch(`/api/share/${tokenStr}`)
      .then((res) => res.json().then((j) => ({ status: res.status, body: j })))
      .then(({ status, body }) => {
        if (status !== 200 || !body.ok) {
          setError(body.error || `HTTP ${status}`);
          return;
        }
        setData(body);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [tokenStr]);

  const fetchComments = useCallback(async () => {
    if (!tokenStr) return;
    setCommentsLoading(true);
    setCommentsError(null);
    try {
      const res = await fetch(`/api/share/${tokenStr}/comments`);
      const body = (await res.json()) as CommentsResponse;
      if (res.status !== 200 || !body.ok) {
        setCommentsError(body.error || `HTTP ${res.status}`);
        return;
      }
      setComments(body.comments ?? []);
    } catch (e) {
      setCommentsError(e instanceof Error ? e.message : "Error de red");
    } finally {
      setCommentsLoading(false);
    }
  }, [tokenStr]);

  useEffect(() => {
    if (!tokenStr) return;
    void fetchComments();
  }, [tokenStr, fetchComments]);

  const isHtml =
    !!data?.content &&
    (data.path?.endsWith(".html") ||
      data.content.trimStart().startsWith("<!DOCTYPE") ||
      data.content.trimStart().startsWith("<html"));

  // Selection → popup. Markdown only (iframe sandbox blocks this for HTML).
  useEffect(() => {
    if (!data || isHtml) {
      setPopup(null);
      return;
    }

    const handleMouseUp = () => {
      const sel = typeof window !== "undefined" ? window.getSelection() : null;
      if (!sel || sel.isCollapsed) {
        setPopup(null);
        return;
      }
      const selectedText = sel.toString();
      if (!selectedText.trim()) {
        setPopup(null);
        return;
      }
      const article = articleRef.current;
      if (!article) return;
      const range = sel.getRangeAt(0);
      if (!article.contains(range.commonAncestorContainer)) {
        setPopup(null);
        return;
      }
      const rect = range.getBoundingClientRect();
      setPopup({
        top: Math.max(8, rect.top - 40),
        left: rect.left + rect.width / 2,
        text: selectedText,
      });
    };

    const handleMouseDown = (e: MouseEvent) => {
      const target = e.target as Element | null;
      if (target && target.closest?.("[data-comment-popup]")) {
        return;
      }
      setPopup(null);
    };

    document.addEventListener("mouseup", handleMouseUp);
    document.addEventListener("mousedown", handleMouseDown);
    return () => {
      document.removeEventListener("mouseup", handleMouseUp);
      document.removeEventListener("mousedown", handleMouseDown);
    };
  }, [data, isHtml]);

  // Inject inline anchor highlights once the article is rendered.
  useEffect(() => {
    const article = articleRef.current;
    if (!article || !data?.content || isHtml || comments.length === 0) return;

    const inserted: HTMLSpanElement[] = [];
    for (const c of comments) {
      if (!c.anchorText) continue;
      injectAnchor(article, c.anchorText, c.id, inserted);
    }

    return () => {
      for (const span of inserted) {
        const parent = span.parentNode;
        if (!parent) continue;
        const text = document.createTextNode(span.textContent ?? "");
        parent.replaceChild(text, span);
      }
      // Merge adjacent text nodes after un-wrapping.
      try {
        article.normalize?.();
      } catch {
        // ignore — best-effort cleanup
      }
    };
  }, [data?.content, comments, isHtml]);

  // Hover/click delegation on the article: tooltip on mouseenter,
  // detail modal on click. Bound once per article render.
  useEffect(() => {
    const article = articleRef.current;
    if (!article || isHtml) return;

    const onOver = (e: MouseEvent) => {
      const target = e.target as Element | null;
      const span = target?.closest?.(".comment-anchor") as HTMLElement | null;
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
      const target = e.target as Element | null;
      const span = target?.closest?.(".comment-anchor");
      if (!span) return;
      if (tooltipHideTimer.current) window.clearTimeout(tooltipHideTimer.current);
      tooltipHideTimer.current = window.setTimeout(() => setTooltip(null), 120);
    };

    const onClick = (e: MouseEvent) => {
      const target = e.target as Element | null;
      const span = target?.closest?.(".comment-anchor") as HTMLElement | null;
      if (!span) return;
      e.preventDefault();
      const id = span.dataset.cmtId ?? "";
      const c = commentsById.get(id);
      if (!c) return;
      setTooltip(null);
      openDetail(c);
    };

    article.addEventListener("mouseover", onOver);
    article.addEventListener("mouseout", onOut);
    article.addEventListener("click", onClick);
    return () => {
      article.removeEventListener("mouseover", onOver);
      article.removeEventListener("mouseout", onOut);
      article.removeEventListener("click", onClick);
    };
  }, [commentsById, isHtml]);

  const openFormFromSelection = () => {
    if (!popup || !data?.content) return;
    const anchor = buildAnchorPayload(data.content, popup.text);
    setForm({ ...EMPTY_FORM, open: true, anchor });
    setPopup(null);
  };

  const openFormForDoc = () => {
    setForm({ ...EMPTY_FORM, open: true, anchor: null });
  };

  const closeForm = () => setForm(EMPTY_FORM);

  const openDetail = (c: PublicComment) =>
    setDetail({
      comment: c,
      editing: false,
      editBody: c.body,
      saving: false,
      deleting: false,
      saveError: null,
    });

  const closeDetail = () => setDetail(null);

  const submitComment = async () => {
    const v = validateCommentForm({
      author: form.author,
      email: form.email,
      body: form.body,
      anchor: form.anchor,
    });
    if (!v.ok) {
      setForm((f) => ({ ...f, errors: v.errors }));
      return;
    }
    setForm((f) => ({ ...f, submitting: true, errors: {}, submitError: null }));
    try {
      const res = await fetch(`/api/share/${tokenStr}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          author: form.author.trim(),
          email: form.email.trim() || undefined,
          body: form.body.trim(),
          anchorText: form.anchor?.anchorText ?? undefined,
          anchorContext: form.anchor?.anchorContext ?? undefined,
          anchorDocOffset: form.anchor?.anchorDocOffset ?? undefined,
        }),
      });
      const body = await res.json();
      if (res.status !== 201 || !body.ok) {
        setForm((f) => ({
          ...f,
          submitting: false,
          submitError: body.error || `HTTP ${res.status}`,
        }));
        return;
      }
      markCommentAsMine(body.id);
      closeForm();
      await fetchComments();
    } catch (e) {
      setForm((f) => ({
        ...f,
        submitting: false,
        submitError: e instanceof Error ? e.message : "Error de red",
      }));
    }
  };

  const saveEdit = async () => {
    if (!detail) return;
    const newBody = detail.editBody.trim();
    if (!newBody) {
      setDetail({ ...detail, saveError: "El comentario no puede estar vacío" });
      return;
    }
    setDetail({ ...detail, saving: true, saveError: null });
    try {
      const res = await fetch(
        `/api/share/${tokenStr}/comments/${detail.comment.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ body: newBody }),
        },
      );
      const body = await res.json();
      if (res.status !== 200 || !body.ok) {
        setDetail((d) =>
          d ? { ...d, saving: false, saveError: body.error || `HTTP ${res.status}` } : d,
        );
        return;
      }
      await fetchComments();
      setDetail((d) =>
        d
          ? {
              ...d,
              editing: false,
              editBody: newBody,
              saving: false,
              comment: { ...d.comment, body: newBody },
            }
          : d,
      );
    } catch (e) {
      setDetail((d) =>
        d
          ? {
              ...d,
              saving: false,
              saveError: e instanceof Error ? e.message : "Error de red",
            }
          : d,
      );
    }
  };

  const deleteCurrent = async () => {
    if (!detail) return;
    if (typeof window !== "undefined" && !window.confirm("¿Borrar este comentario?")) return;
    setDetail({ ...detail, deleting: true, saveError: null });
    try {
      const res = await fetch(
        `/api/share/${tokenStr}/comments/${detail.comment.id}`,
        { method: "DELETE" },
      );
      const body = await res.json();
      if (res.status !== 200 || !body.ok) {
        setDetail((d) =>
          d ? { ...d, deleting: false, saveError: body.error || `HTTP ${res.status}` } : d,
        );
        return;
      }
      unmarkCommentAsMine(detail.comment.id);
      closeDetail();
      await fetchComments();
    } catch (e) {
      setDetail((d) =>
        d
          ? {
              ...d,
              deleting: false,
              saveError: e instanceof Error ? e.message : "Error de red",
            }
          : d,
      );
    }
  };

  const displayTitle = data?.filename
    ? data.filename
        .replace(/\.(md|html|txt)$/i, "")
        .replace(/[-_]/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase())
    : "Documento";

  return (
    <>
      <Head>
        <title>{displayTitle} — Shared Document</title>
        <meta name="robots" content="noindex,nofollow" />
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

      <div className="min-h-screen bg-[#FAFAF8] dark:bg-[#1E1E2E] flex flex-col">
        <header className="bg-white dark:bg-[#181825] border-b border-[#E5E2DC] dark:border-[#313244] px-6 py-3 flex items-center gap-3">
          <span className="text-xl">📄</span>
          <div className="flex-1 min-w-0">
            <h1 className="text-sm font-bold text-[#1A1A1A] dark:text-[#cdd6f4] truncate">
              {displayTitle}
            </h1>
            {data?.slug && (
              <p className="text-[10px] text-[#7A7A7A] dark:text-[#6c7086] truncate">
                {data.slug} · shared via Mission Control
              </p>
            )}
          </div>
          {data?.ok && (
            <button
              type="button"
              onClick={openFormForDoc}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[12px] bg-transparent border border-[#E5E2DC] dark:border-[#313244] rounded-md text-[#7A7A7A] dark:text-[#6c7086] hover:bg-[#E5E2DC] dark:hover:bg-[#313244] hover:text-[#1A1A1A] dark:hover:text-[#cdd6f4] transition-colors"
            >
              💬 Comentar
            </button>
          )}
          {tokenStr && data?.ok && (
            <a
              href={`/api/share/${tokenStr}?download=1`}
              download
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[12px] bg-transparent border border-[#E5E2DC] dark:border-[#313244] rounded-md text-[#7A7A7A] dark:text-[#6c7086] hover:bg-[#E5E2DC] dark:hover:bg-[#313244] hover:text-[#1A1A1A] dark:hover:text-[#cdd6f4] transition-colors no-underline"
            >
              ⬇ Descargar
            </a>
          )}
        </header>

        <main className="flex-1 overflow-y-auto">
          {loading && (
            <p className="text-sm text-muted-foreground text-center py-20">Cargando documento...</p>
          )}

          {error && (
            <div className="max-w-2xl mx-auto px-6 py-20 text-center">
              <p className="text-2xl mb-2">🔒</p>
              <p className="text-sm text-red-500 font-medium mb-1">No se pudo cargar el documento</p>
              <p className="text-xs text-muted-foreground">{error}</p>
              <p className="text-xs text-muted-foreground mt-4">
                El link puede haber expirado o ser inválido. Pide al remitente que genere uno nuevo.
              </p>
            </div>
          )}

          {data?.content && !error && (
            <>
              {isHtml ? (
                <iframe
                  srcDoc={data.content}
                  className="w-full border-0 bg-white"
                  style={{ minHeight: "calc(100vh - 60px)" }}
                  sandbox="allow-same-origin"
                  title={displayTitle}
                />
              ) : (
                <article
                  ref={articleRef}
                  className="max-w-3xl mx-auto px-6 py-8 prose prose-sm dark:prose-invert prose-headings:font-heading prose-headings:text-rust prose-a:text-rust prose-table:border-collapse prose-th:border prose-th:border-border prose-th:px-3 prose-th:py-2 prose-th:bg-muted/30 prose-th:text-left prose-th:text-xs prose-th:font-bold prose-td:border prose-td:border-border prose-td:px-3 prose-td:py-2 prose-td:text-xs"
                >
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{data.content}</ReactMarkdown>
                </article>
              )}

              <CommentsSection
                comments={comments}
                loading={commentsLoading}
                error={commentsError}
                onOpen={openDetail}
              />
            </>
          )}
        </main>

        <footer className="border-t border-[#E5E2DC] dark:border-[#313244] bg-white dark:bg-[#181825] px-6 py-2 text-[10px] text-muted-foreground text-center">
          Powered by Mission Control · Read-only public link
        </footer>
      </div>

      {popup && (
        <button
          type="button"
          data-comment-popup="true"
          onMouseDown={(e) => e.preventDefault()}
          onClick={openFormFromSelection}
          className="fixed z-50 px-3 py-1.5 text-[12px] bg-[#1A1A1A] text-white rounded-md shadow-lg hover:bg-[#333] transition-colors"
          style={{
            top: popup.top,
            left: popup.left,
            transform: "translateX(-50%)",
          }}
        >
          💬 Comentar
        </button>
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

      {form.open && (
        <CommentFormModal
          form={form}
          onChange={(patch) => setForm((f) => ({ ...f, ...patch }))}
          onCancel={closeForm}
          onSubmit={submitComment}
        />
      )}

      {detail && (
        <CommentDetailModal
          state={detail}
          onChange={(patch) => setDetail((d) => (d ? { ...d, ...patch } : d))}
          onClose={closeDetail}
          onSave={saveEdit}
          onDelete={deleteCurrent}
        />
      )}
    </>
  );
}

/**
 * Walk text nodes inside `article` and wrap the first occurrence of
 * `anchorText` with a span. The span is pushed into `inserted` so the
 * effect can unwrap it on cleanup. Multiple comments anchoring the same
 * string overlap onto a single span (we skip text already inside a
 * comment-anchor to avoid nesting), so the first comment "wins" the
 * mark; the other comments are still visible in the comments list and
 * detail modal via the shared anchor.
 */
function injectAnchor(
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

function CommentsSection({
  comments,
  loading,
  error,
  onOpen,
}: {
  comments: PublicComment[];
  loading: boolean;
  error: string | null;
  onOpen: (c: PublicComment) => void;
}) {
  return (
    <section className="max-w-3xl mx-auto px-6 pb-12 pt-2">
      <h2 className="text-sm font-bold text-[#1A1A1A] dark:text-[#cdd6f4] mb-3 border-t border-[#E5E2DC] dark:border-[#313244] pt-6">
        Comentarios{comments.length > 0 && ` (${comments.length})`}
      </h2>
      {loading && <p className="text-xs text-muted-foreground">Cargando comentarios...</p>}
      {error && !loading && (
        <p className="text-xs text-red-500">No se pudieron cargar los comentarios: {error}</p>
      )}
      {!loading && !error && comments.length === 0 && (
        <p className="text-xs text-muted-foreground italic">
          Aún no hay comentarios. Selecciona texto del documento o usa el botón "Comentar" del encabezado.
        </p>
      )}
      <ul className="flex flex-col gap-3">
        {comments.map((c) => (
          <li
            key={c.id}
            onClick={() => onOpen(c)}
            className="bg-white dark:bg-[#181825] border border-[#E5E2DC] dark:border-[#313244] rounded-md p-3 cursor-pointer hover:border-rust transition-colors"
          >
            <div className="flex items-center justify-between gap-2 mb-1">
              <span className="text-[12px] font-bold text-[#1A1A1A] dark:text-[#cdd6f4]">
                {c.author}
                {isMyComment(c.id) && (
                  <span className="ml-1 text-[10px] font-normal text-rust">(tuyo)</span>
                )}
              </span>
              <span className="text-[10px] text-muted-foreground">
                {formatCommentDate(c.createdAt)}
              </span>
            </div>
            {c.anchorText && (
              <blockquote className="text-[11px] text-muted-foreground border-l-2 border-[#E5E2DC] dark:border-[#313244] pl-2 mb-2 italic">
                "{c.anchorText.length > 200 ? c.anchorText.slice(0, 200) + "…" : c.anchorText}"
              </blockquote>
            )}
            <p className="text-[12px] text-[#1A1A1A] dark:text-[#cdd6f4] whitespace-pre-wrap line-clamp-3">
              {c.body}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}

function CommentFormModal({
  form,
  onChange,
  onCancel,
  onSubmit,
}: {
  form: FormState;
  onChange: (patch: Partial<FormState>) => void;
  onCancel: () => void;
  onSubmit: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
      onClick={onCancel}
    >
      <div
        className="bg-white dark:bg-[#181825] rounded-lg shadow-xl max-w-md w-full p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-sm font-bold text-[#1A1A1A] dark:text-[#cdd6f4] mb-3">
          Dejar comentario
        </h2>

        {form.anchor?.anchorText && (
          <blockquote className="text-[11px] text-muted-foreground border-l-2 border-[#E5E2DC] dark:border-[#313244] pl-2 mb-3 italic">
            Comentando sobre: "
            {form.anchor.anchorText.length > 120
              ? form.anchor.anchorText.slice(0, 120) + "…"
              : form.anchor.anchorText}
            "
          </blockquote>
        )}

        <div className="flex flex-col gap-3">
          <div>
            <label className="block text-[11px] font-medium text-[#1A1A1A] dark:text-[#cdd6f4] mb-1">
              Tu nombre *
            </label>
            <input
              type="text"
              value={form.author}
              onChange={(e) => onChange({ author: e.target.value })}
              maxLength={120}
              className="w-full px-2 py-1.5 text-[12px] bg-transparent border border-[#E5E2DC] dark:border-[#313244] rounded text-[#1A1A1A] dark:text-[#cdd6f4]"
            />
            {form.errors.author && (
              <p className="text-[10px] text-red-500 mt-1">{form.errors.author}</p>
            )}
          </div>

          <div>
            <label className="block text-[11px] font-medium text-[#1A1A1A] dark:text-[#cdd6f4] mb-1">
              Email (opcional)
            </label>
            <input
              type="email"
              value={form.email}
              onChange={(e) => onChange({ email: e.target.value })}
              className="w-full px-2 py-1.5 text-[12px] bg-transparent border border-[#E5E2DC] dark:border-[#313244] rounded text-[#1A1A1A] dark:text-[#cdd6f4]"
            />
            {form.errors.email && (
              <p className="text-[10px] text-red-500 mt-1">{form.errors.email}</p>
            )}
          </div>

          <div>
            <label className="block text-[11px] font-medium text-[#1A1A1A] dark:text-[#cdd6f4] mb-1">
              Comentario *
            </label>
            <textarea
              value={form.body}
              onChange={(e) => onChange({ body: e.target.value })}
              maxLength={5000}
              rows={5}
              className="w-full px-2 py-1.5 text-[12px] bg-transparent border border-[#E5E2DC] dark:border-[#313244] rounded text-[#1A1A1A] dark:text-[#cdd6f4] resize-y"
            />
            {form.errors.body && (
              <p className="text-[10px] text-red-500 mt-1">{form.errors.body}</p>
            )}
          </div>

          {form.submitError && (
            <p className="text-[11px] text-red-500">{form.submitError}</p>
          )}

          <div className="flex justify-end gap-2 mt-2">
            <button
              type="button"
              onClick={onCancel}
              disabled={form.submitting}
              className="px-3 py-1.5 text-[12px] bg-transparent border border-[#E5E2DC] dark:border-[#313244] rounded-md text-[#7A7A7A] dark:text-[#6c7086] hover:bg-[#E5E2DC] dark:hover:bg-[#313244] transition-colors"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={onSubmit}
              disabled={form.submitting}
              className="px-3 py-1.5 text-[12px] bg-[#1A1A1A] text-white rounded-md hover:bg-[#333] transition-colors disabled:opacity-50"
            >
              {form.submitting ? "Enviando..." : "Enviar"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function CommentDetailModal({
  state,
  onChange,
  onClose,
  onSave,
  onDelete,
}: {
  state: DetailState;
  onChange: (patch: Partial<DetailState>) => void;
  onClose: () => void;
  onSave: () => void;
  onDelete: () => void;
}) {
  const c = state.comment;
  const owned = isMyComment(c.id);
  const busy = state.saving || state.deleting;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-[#181825] rounded-lg shadow-xl max-w-lg w-full p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-2 mb-3">
          <div>
            <h2 className="text-sm font-bold text-[#1A1A1A] dark:text-[#cdd6f4]">
              {c.author}
              {owned && (
                <span className="ml-2 text-[10px] font-normal text-rust">(tuyo)</span>
              )}
            </h2>
            <p className="text-[10px] text-muted-foreground">
              {formatCommentDate(c.createdAt)}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            aria-label="Cerrar"
            className="text-xl text-muted-foreground hover:text-[#1A1A1A] dark:hover:text-[#cdd6f4] disabled:opacity-50"
          >
            ×
          </button>
        </div>

        {c.anchorText && (
          <blockquote className="text-[11px] text-muted-foreground border-l-2 border-rust pl-2 mb-3 italic whitespace-pre-wrap">
            "{c.anchorText}"
          </blockquote>
        )}

        {state.editing ? (
          <div className="flex flex-col gap-2">
            <textarea
              value={state.editBody}
              onChange={(e) => onChange({ editBody: e.target.value })}
              maxLength={5000}
              rows={6}
              className="w-full px-2 py-1.5 text-[12px] bg-transparent border border-[#E5E2DC] dark:border-[#313244] rounded text-[#1A1A1A] dark:text-[#cdd6f4] resize-y"
            />
            {state.saveError && (
              <p className="text-[11px] text-red-500">{state.saveError}</p>
            )}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => onChange({ editing: false, editBody: c.body, saveError: null })}
                disabled={busy}
                className="px-3 py-1.5 text-[12px] bg-transparent border border-[#E5E2DC] dark:border-[#313244] rounded-md text-[#7A7A7A] dark:text-[#6c7086] hover:bg-[#E5E2DC] dark:hover:bg-[#313244] transition-colors disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={onSave}
                disabled={busy}
                className="px-3 py-1.5 text-[12px] bg-[#1A1A1A] text-white rounded-md hover:bg-[#333] transition-colors disabled:opacity-50"
              >
                {state.saving ? "Guardando..." : "Guardar"}
              </button>
            </div>
          </div>
        ) : (
          <>
            <p className="text-[13px] text-[#1A1A1A] dark:text-[#cdd6f4] whitespace-pre-wrap mb-4">
              {c.body}
            </p>
            {state.saveError && (
              <p className="text-[11px] text-red-500 mb-2">{state.saveError}</p>
            )}
            {owned && (
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={onDelete}
                  disabled={busy}
                  className="px-3 py-1.5 text-[12px] bg-transparent border border-red-500/50 rounded-md text-red-500 hover:bg-red-500/10 transition-colors disabled:opacity-50"
                >
                  {state.deleting ? "Borrando..." : "Borrar"}
                </button>
                <button
                  type="button"
                  onClick={() => onChange({ editing: true, editBody: c.body, saveError: null })}
                  disabled={busy}
                  className="px-3 py-1.5 text-[12px] bg-[#1A1A1A] text-white rounded-md hover:bg-[#333] transition-colors disabled:opacity-50"
                >
                  Editar
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
