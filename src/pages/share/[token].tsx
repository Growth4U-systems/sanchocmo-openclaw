/**
 * /share/[token] — Public document viewer with comments (SAN-15, v2 SAN-148).
 *
 * Unauthenticated. Renders any document whose share token validates.
 *
 * Comments UX (unified, SAN-148): BOTH markdown and HTML deliverables use
 * the same g4u-comments layer (public/comments-embed.js — selection bubble,
 * floating FAB + side panel, name-only identity, threads, resolve/reopen,
 * TextQuoteSelector anchoring with CSS Custom Highlight API):
 *
 *  - HTML docs render in an iframe pointing at /api/share/[token]/view,
 *    which serves the deliverable with the embed script injected.
 *  - Markdown docs render as a React article and the SAME embed script is
 *    mounted on this page, pointed at the same comments API.
 *
 * No accounts, no email — the commenter just types their name (remembered
 * in localStorage). Anti-abuse lives server-side (honeypot + rate limit +
 * unguessable tokens).
 */

import { useEffect, useState } from "react";
import Head from "next/head";
import { useRouter } from "next/router";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { deriveDocTitle, stripCommentMarkers } from "@/lib/comments-client";

interface ShareResponse {
  ok: boolean;
  slug?: string;
  path?: string;
  filename?: string;
  content?: string;
  iat?: number;
  /** True when the server swapped to the `*.commented.<ext>` sibling. */
  isCommentedView?: boolean;
  /** Original (clean) brand-relative path — present when isCommentedView. */
  originalDocPath?: string;
  error?: string;
}

/**
 * Strip the appended `## Comentarios` transcript section from a commented
 * markdown sibling before rendering. The transcript exists for git/skill
 * consumption — on the share page the live comments panel (embed) is the
 * reader-facing representation, so showing both would duplicate them.
 * Only strips when the section actually holds comment blocks, so a doc
 * whose own content has a "## Comentarios" heading is left alone.
 */
function stripCommentsTranscript(content: string): string {
  const idx = content.indexOf("\n## Comentarios");
  if (idx < 0) return content;
  if (!content.slice(idx).includes("<!-- cmt:")) return content;
  const before = content.slice(0, idx);
  const hr = before.lastIndexOf("\n---");
  const cut = hr >= 0 && before.slice(hr).trim() === "---" ? hr : idx;
  return content.slice(0, cut).trimEnd() + "\n";
}

export default function SharePage() {
  const router = useRouter();
  const { token } = router.query;
  const [data, setData] = useState<ShareResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  const isHtml =
    !!data?.content &&
    (data.path?.endsWith(".html") ||
      data.content.trimStart().startsWith("<!DOCTYPE") ||
      data.content.trimStart().startsWith("<html"));

  // Mount the comments layer over the rendered markdown (SAN-148). HTML
  // docs get the same script injected server-side by /view, inside the
  // iframe — never mount it twice on this page.
  useEffect(() => {
    if (!data?.content || error || !tokenStr || isHtml) return;
    if (document.getElementById("mcc-embed-script") || document.getElementById("mcc-fab")) return;
    const s = document.createElement("script");
    s.id = "mcc-embed-script";
    s.src = "/comments-embed.js";
    s.dataset.api = `/api/share/${tokenStr}/comments`;
    document.body.appendChild(s);
    return () => {
      s.remove();
      // The embed mounts FAB/panel/bubble/style tagged with data-mcc-ui.
      document.querySelectorAll("[data-mcc-ui]").forEach((el) => el.remove());
    };
  }, [data?.content, error, tokenStr, isHtml]);

  const displayTitle = deriveDocTitle(data?.filename, data?.originalDocPath);

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
            isHtml ? (
              // SAN-148: served by /view with the comments embed injected —
              // selection → anchored comments work inside the iframe.
              // allow-scripts + allow-same-origin on same-origin first-party
              // content: sandbox isolation is void by design here
              // (deliverables are agent-generated, not user uploads).
              <iframe
                src={`/api/share/${tokenStr}/view`}
                className="w-full border-0 bg-white"
                style={{ minHeight: "calc(100vh - 60px)" }}
                sandbox="allow-scripts allow-same-origin"
                title={displayTitle}
              />
            ) : (
              <article className="max-w-3xl mx-auto px-6 py-8 pb-24 prose prose-sm dark:prose-invert prose-headings:font-heading prose-headings:text-rust prose-a:text-rust prose-table:border-collapse prose-th:border prose-th:border-border prose-th:px-3 prose-th:py-2 prose-th:bg-muted/30 prose-th:text-left prose-th:text-xs prose-th:font-bold prose-td:border prose-td:border-border prose-td:px-3 prose-td:py-2 prose-td:text-xs">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {stripCommentMarkers(stripCommentsTranscript(data.content))}
                </ReactMarkdown>
              </article>
            )
          )}
        </main>

        <footer className="border-t border-[#E5E2DC] dark:border-[#313244] bg-white dark:bg-[#181825] px-6 py-2 text-[10px] text-muted-foreground text-center">
          Powered by Mission Control · Read-only public link
        </footer>
      </div>
    </>
  );
}
