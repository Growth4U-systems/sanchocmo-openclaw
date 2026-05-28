/**
 * /share/[token] — Public document viewer with comments (SAN-15).
 *
 * Unauthenticated. Renders any document whose share token validates.
 * Layout: minimal header (filename + brand) + content area (markdown or
 * HTML iframe) + inline comments list. No DashboardLayout, no auth guard.
 *
 * Comment UX:
 *  - Markdown: select text → floating "Comentar" button appears → click
 *    opens form with selection captured as the anchor.
 *  - HTML: iframe sandbox blocks selection forwarding to parent, so
 *    instead a "Comentar" button in the header opens a doc-level form
 *    (no anchor).
 *  - Below the doc: list of existing comments with the anchor quoted.
 */

import { useCallback, useEffect, useRef, useState } from "react";
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

  const articleRef = useRef<HTMLElement | null>(null);

  const tokenStr = typeof token === "string" ? token : "";

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
      // Only show popup if the selection is inside our article.
      const range = sel.getRangeAt(0);
      if (!article.contains(range.commonAncestorContainer)) {
        setPopup(null);
        return;
      }
      const rect = range.getBoundingClientRect();
      // position: fixed coords are viewport-relative — do NOT add scrollY/X.
      setPopup({
        top: Math.max(8, rect.top - 40),
        left: rect.left + rect.width / 2,
        text: selectedText,
      });
    };

    const handleMouseDown = (e: MouseEvent) => {
      // Don't dismiss the popup if the user is clicking the popup itself.
      // The native document listener fires after React's onMouseDown bubble
      // path; checking the target via `closest` works for nested children too.
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

      {form.open && (
        <CommentFormModal
          form={form}
          onChange={(patch) => setForm((f) => ({ ...f, ...patch }))}
          onCancel={closeForm}
          onSubmit={submitComment}
        />
      )}
    </>
  );
}

function CommentsSection({
  comments,
  loading,
  error,
}: {
  comments: PublicComment[];
  loading: boolean;
  error: string | null;
}) {
  return (
    <section className="max-w-3xl mx-auto px-6 pb-12 pt-2">
      <h2 className="text-sm font-bold text-[#1A1A1A] dark:text-[#cdd6f4] mb-3 border-t border-[#E5E2DC] dark:border-[#313244] pt-6">
        Comentarios{comments.length > 0 && ` (${comments.length})`}
      </h2>
      {loading && (
        <p className="text-xs text-muted-foreground">Cargando comentarios...</p>
      )}
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
            className="bg-white dark:bg-[#181825] border border-[#E5E2DC] dark:border-[#313244] rounded-md p-3"
          >
            <div className="flex items-center justify-between gap-2 mb-1">
              <span className="text-[12px] font-bold text-[#1A1A1A] dark:text-[#cdd6f4]">
                {c.author}
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
            <p className="text-[12px] text-[#1A1A1A] dark:text-[#cdd6f4] whitespace-pre-wrap">
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
