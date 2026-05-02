"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { SlideOver } from "@/components/shared/slide-over";
import { DocSlideOver } from "@/components/shared/doc-slideover";
import { DraftCards } from "@/components/content/DraftCards";

export interface IdeaForDetail {
  id: string;
  title?: string;
  pillar_id: string;
  content_type: string;
  target_channel: string;
  signal: { summary: string; source: string; url?: string; date: string };
  angle_draft: string;
  pov_confidence: number;
  status: string;
  approved_at?: string;
  dispatch_date?: string;
  dispatch_slot?: string;
  published_at?: string;
  project_task_id?: string;
  project_id?: string;
  content_task_id?: string;
  content_task_channels?: string[];
}

interface Props {
  slug: string;
  idea: IdeaForDetail | null;
  onClose: () => void;
  onUpdate: () => void;
}

const CHANNEL_VISUAL: Record<string, { label: string; emoji: string; bg: string; fg: string }> = {
  linkedin:   { label: "LinkedIn",   emoji: "💼", bg: "#DCE6F2", fg: "#0A66C2" },
  twitter:    { label: "Twitter",    emoji: "🐦", bg: "#E8F1FA", fg: "#1B2C5B" },
  blog:       { label: "Blog",       emoji: "📝", bg: "var(--sc-rust-100)", fg: "var(--sc-rust-700)" },
  newsletter: { label: "Newsletter", emoji: "📧", bg: "var(--sc-sun-100)",  fg: "var(--sc-rust-700)" },
};

const CONTENT_TYPE_VISUAL: Record<string, { label: string; bg: string; emoji: string }> = {
  "Hot Take":       { label: "HOT TAKE",  bg: "bg-rust    text-white", emoji: "🔥" },
  "Proof Post":     { label: "PROOF",     bg: "bg-sage    text-white", emoji: "📚" },
  Framework:        { label: "FRAMEWORK", bg: "bg-navy    text-white", emoji: "🧩" },
  "Personal Story": { label: "PERSONAL",  bg: "bg-yellow  text-ink",   emoji: "💬" },
  Listicle:         { label: "LISTICLE",  bg: "bg-aged    text-ink",   emoji: "📋" },
};

function stripPovPrefix(text: string): string {
  return (text || "")
    .replace(/^\s*(nuestro\s+pov|our\s+pov|pov)\s*:\s*/i, "")
    .trim();
}

function getIdeaTitle(idea: { title?: string; angle_draft?: string; signal?: { summary?: string }; id: string }): string {
  if (idea.title && idea.title.trim()) return idea.title.trim();
  const cleanAngle = stripPovPrefix(idea.angle_draft || "");
  const candidate = cleanAngle || (idea.signal?.summary || "").trim();
  if (!candidate) return idea.id;
  const m = candidate.match(/^([^.!?\n]{12,160}[.!?])/);
  const out = m ? m[1] : candidate.split("\n")[0];
  return out.length > 140 ? out.slice(0, 137).trimEnd() + "…" : out;
}

export function IdeaDetailSlideOver({ slug, idea, onClose, onUpdate }: Props) {
  const [busy, setBusy] = useState(false);
  const [openDocPath, setOpenDocPath] = useState<string | null>(null);

  const patch = useCallback(async (fields: Record<string, unknown>) => {
    if (!idea) return;
    setBusy(true);
    try {
      await fetch("/api/content-engine/ideas", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, ideaId: idea.id, fields }),
      });
      onUpdate();
    } finally {
      setBusy(false);
    }
  }, [idea, slug, onUpdate]);

  const saveDraft = useCallback(async (ideaId: string, channel: string, body: string, status?: string) => {
    await fetch("/api/content-engine/drafts", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug, ideaId, channel, body, meta: status ? { status } : undefined }),
    });
    onUpdate();
  }, [slug, onUpdate]);

  const openDoc = useCallback((ideaId: string, channel: string) => {
    setOpenDocPath(`brand/${slug}/content/drafts/${ideaId}/${channel}.md`);
  }, [slug]);

  if (!idea) {
    return (
      <SlideOver open={false} onClose={onClose}>
        <div />
      </SlideOver>
    );
  }

  const cv = CHANNEL_VISUAL[idea.target_channel] || CHANNEL_VISUAL.blog;
  const tv = CONTENT_TYPE_VISUAL[idea.content_type] || { label: idea.content_type?.toUpperCase() || "—", bg: "bg-aged text-ink", emoji: "📄" };
  const conf = Math.round((idea.pov_confidence || 0) * 100);
  const isNew = idea.status === "New";
  const isApproved = idea.status === "Approved";
  const isPublished = idea.status === "Published";

  const statusBg =
    idea.status === "New" ? "var(--sc-sage-100)"
    : idea.status === "Approved" ? "var(--sc-navy-500)"
    : idea.status === "Discarded" ? "var(--sc-brick-bg)"
    : idea.status === "Published" ? "var(--sc-sage-500)"
    : "var(--sc-sun-100)";
  const statusFg = (idea.status === "Approved" || idea.status === "Published") ? "var(--sc-paper-3)" : idea.status === "Discarded" ? "var(--sc-brick-500)" : "var(--sc-ink)";

  const title = (
    <span className="flex items-center gap-2 min-w-0">
      <span
        className="grid place-items-center w-7 h-7 rounded-md border-2 text-base flex-shrink-0"
        style={{ background: cv.bg, color: cv.fg, borderColor: "var(--sc-ink)" }}
      >{cv.emoji}</span>
      <span className="font-heading uppercase text-sm tracking-wider truncate" style={{ color: "var(--sc-ink)" }}>
        {cv.label}
      </span>
      <span
        className="font-heading uppercase text-[10px] tracking-wider px-1.5 py-0.5 rounded-sc-pill border inline-flex items-center flex-shrink-0"
        style={{ background: statusBg, color: statusFg, borderColor: "var(--sc-ink)" }}
      >{idea.status}</span>
    </span>
  );

  return (
    <>
      <SlideOver open={true} onClose={onClose} width="w-[640px] max-w-[95vw]" title="" >
        {/* Custom header (we passed empty title to avoid default style) */}
        <div className="flex items-start justify-between gap-3 mb-4">
          {title}
        </div>

        {/* Idea title */}
        <h2
          className="font-heading font-extrabold leading-tight mb-3"
          style={{ fontSize: 22, color: "var(--sc-ink)", textWrap: "balance" }}
        >
          {getIdeaTitle(idea)}
        </h2>

        {/* Meta strip */}
        <div className="flex flex-wrap gap-1.5 items-center mb-4">
          <span
            className="font-mono text-[10.5px] font-bold inline-flex items-center px-1.5 py-0.5 rounded-sc-pill border"
            style={{ background: "var(--sc-rust-100)", color: "var(--sc-rust-700)", borderColor: "var(--sc-rust-500)" }}
          >{idea.pillar_id}</span>
          <span
            className={cn("font-heading uppercase text-[9.5px] tracking-wider px-1.5 py-0.5 rounded-sc-pill border-[1.5px] inline-flex items-center gap-1", tv.bg)}
            style={{ borderColor: "var(--sc-ink)" }}
          >
            <span>{tv.emoji}</span>{tv.label}
          </span>
          <span className="inline-flex items-center gap-1.5" title={`Confianza ${conf}%`}>
            <span
              className="inline-block h-2 w-12 rounded-sc-pill border overflow-hidden"
              style={{ borderColor: "var(--sc-ink)", background: "var(--sc-paper-3)" }}
            >
              <span
                className="block h-full"
                style={{
                  width: `${conf}%`,
                  background: conf >= 80 ? "var(--sc-sage-500)" : conf >= 60 ? "var(--sc-sun-300)" : "var(--sc-brick-500)",
                }}
              />
            </span>
            <span className="font-mono text-[10.5px] font-bold">{conf}%</span>
          </span>
        </div>

        {/* Signal */}
        {idea.signal?.summary && (
          <section className="mb-4">
            <div className="font-heading uppercase text-[10px] tracking-widest mb-1.5" style={{ color: "var(--sc-fg-muted)" }}>
              🌐 Señal
            </div>
            <p className="text-[13px] leading-relaxed mb-2" style={{ color: "var(--sc-fg-soft)" }}>
              {idea.signal.summary}
            </p>
            <div className="flex flex-wrap gap-1.5 items-center text-xs" style={{ color: "var(--sc-fg-muted)" }}>
              <span>Fuente:</span>
              {idea.signal.source && <b style={{ color: "var(--sc-fg-soft)" }}>{idea.signal.source}</b>}
              {idea.signal.url && (
                <a
                  href={idea.signal.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono text-[11px] underline"
                  style={{ color: "var(--sc-navy-500)", textUnderlineOffset: 3 }}
                  title={idea.signal.url}
                >{idea.signal.url.replace(/^https?:\/\/(www\.)?/, "").slice(0, 50)}{idea.signal.url.length > 57 ? "…" : ""} ↗</a>
              )}
              {idea.signal.date && <span>· 📅 {idea.signal.date}</span>}
            </div>
          </section>
        )}

        {/* Angle */}
        {idea.angle_draft && (
          <section className="mb-4">
            <div className="font-heading uppercase text-[10px] tracking-widest mb-1.5" style={{ color: "var(--sc-fg-muted)" }}>
              ✍️ Nuestro ángulo
            </div>
            <div className="flex gap-2 items-stretch">
              <span style={{ width: 3, alignSelf: "stretch", background: "var(--sc-rust-500)", borderRadius: 1.5, flexShrink: 0 }} />
              <span className="text-[13px] leading-relaxed italic" style={{ color: "var(--sc-ink)", textWrap: "pretty" }}>
                {stripPovPrefix(idea.angle_draft)}
              </span>
            </div>
          </section>
        )}

        {/* Dispatch date */}
        <section className="mb-4">
          <div className="font-heading uppercase text-[10px] tracking-widest mb-1.5" style={{ color: "var(--sc-fg-muted)" }}>
            📅 Fecha de publicación
          </div>
          <div className="flex flex-wrap gap-2 items-center">
            <input
              type="date"
              value={idea.dispatch_date?.slice(0, 10) || ""}
              disabled={busy}
              onChange={(e) => patch({ dispatch_date: e.target.value || null })}
              className="font-mono text-[12px] px-2 py-1.5 rounded-sc-md border-2"
              style={{ background: "var(--sc-paper-3)", borderColor: "var(--sc-ink)", boxShadow: "var(--pop-xs)" }}
            />
            {idea.dispatch_date && (
              <button
                type="button"
                disabled={busy}
                onClick={() => patch({ dispatch_date: null })}
                className="font-heading uppercase text-[11px] tracking-wider px-2.5 py-1.5 rounded-sc-md border-2 sc-pop-hover disabled:opacity-50"
                style={{ background: "var(--sc-paper-3)", borderColor: "var(--sc-ink)", boxShadow: "var(--pop-xs)" }}
              >Quitar fecha</button>
            )}
            {!idea.dispatch_date && (
              <span className="text-xs italic" style={{ color: "var(--sc-fg-muted)" }}>
                Sin asignar — la idea está en la bandeja
              </span>
            )}
          </div>
        </section>

        {/* Drafts (only if approved/published) */}
        {(isApproved || isPublished) && (
          <section className="mb-4">
            <DraftCards
              idea={{ id: idea.id, target_channel: idea.target_channel }}
              slug={slug}
              onSaveDraft={saveDraft}
              onOpenDoc={openDoc}
              onRefresh={onUpdate}
              hideIteration
            />
          </section>
        )}

        {/* Footer actions */}
        <div
          className="sticky bottom-0 -mx-6 -mb-6 px-6 py-3 flex flex-wrap gap-2 border-t-2"
          style={{ background: "var(--sc-paper-2)", borderColor: "var(--sc-ink)" }}
        >
          {isNew && (
            <>
              <button
                type="button"
                disabled={busy}
                onClick={() => patch({ status: "Approved", approved_at: new Date().toISOString(), approved_via: "mc-ui" })}
                className="font-heading uppercase text-[12px] tracking-wider px-3 py-2 rounded-sc-md border-2 sc-pop-hover disabled:opacity-50"
                style={{ background: "var(--sc-sage-500)", color: "var(--sc-paper-3)", borderColor: "var(--sc-ink)", boxShadow: "var(--pop-xs)" }}
              >✓ Aprobar</button>
              <button
                type="button"
                disabled={busy}
                onClick={() => patch({ status: "Deferred", deferred_at: new Date().toISOString(), deferred_by: "mc-ui" })}
                className="font-heading uppercase text-[12px] tracking-wider px-3 py-2 rounded-sc-md border-2 sc-pop-hover disabled:opacity-50"
                style={{ background: "var(--sc-sun-300)", color: "var(--sc-ink)", borderColor: "var(--sc-ink)", boxShadow: "var(--pop-xs)" }}
              >🕒 Más tarde</button>
              <button
                type="button"
                disabled={busy}
                onClick={() => patch({ status: "Discarded", archived_at: new Date().toISOString(), archived_via: "mc-ui" })}
                className="font-heading uppercase text-[12px] tracking-wider px-3 py-2 rounded-sc-md border-2 sc-pop-hover disabled:opacity-50"
                style={{ background: "var(--sc-paper-3)", color: "var(--sc-ink)", borderColor: "var(--sc-ink)", boxShadow: "var(--pop-xs)" }}
              >✗ Descartar</button>
            </>
          )}
          {idea.status === "Deferred" && (
            <button
              type="button"
              disabled={busy}
              onClick={() => patch({ status: "New", deferred_at: null, deferred_by: null })}
              className="font-heading uppercase text-[12px] tracking-wider px-3 py-2 rounded-sc-md border-2 sc-pop-hover disabled:opacity-50"
              style={{ background: "var(--sc-sage-100)", color: "var(--sc-ink)", borderColor: "var(--sc-ink)", boxShadow: "var(--pop-xs)" }}
            >↺ Volver a la queue</button>
          )}
          {isApproved && idea.project_id && idea.project_task_id && idea.content_task_id && (
            <Link
              href={`/dashboard/${slug}/projects/${idea.project_id}/tasks/${idea.project_task_id}/content/${idea.content_task_id}/draft/${idea.content_task_channels?.[0] || idea.target_channel}`}
              className="font-heading uppercase text-[12px] tracking-wider px-3 py-2 rounded-sc-md border-2 sc-pop-hover no-underline inline-flex items-center"
              style={{ background: "var(--sc-rust-500)", color: "var(--sc-paper-3)", borderColor: "var(--sc-ink)", boxShadow: "var(--pop-xs)" }}
            >💬 Abrir draft</Link>
          )}
          {isApproved && idea.project_id && idea.project_task_id && (
            <Link
              href={`/dashboard/${slug}/projects/${idea.project_id}/tasks/${idea.project_task_id}`}
              className="font-heading uppercase text-[11px] tracking-wider px-2.5 py-2 rounded-sc-md border-2 sc-pop-hover no-underline inline-flex items-center"
              style={{ background: "var(--sc-paper-3)", color: "var(--sc-ink)", borderColor: "var(--sc-ink)", boxShadow: "var(--pop-xs)" }}
            >📋 Tarea</Link>
          )}
          {(isApproved || isPublished) && !isPublished && (
            <button
              type="button"
              disabled={busy}
              onClick={() => patch({ status: "Published", published_at: new Date().toISOString() })}
              className="font-heading uppercase text-[11px] tracking-wider px-2.5 py-2 rounded-sc-md border-2 sc-pop-hover disabled:opacity-50"
              style={{ background: "var(--sc-paper-3)", color: "var(--sc-ink)", borderColor: "var(--sc-ink)", boxShadow: "var(--pop-xs)" }}
            >✓ Marcar publicada</button>
          )}
        </div>
      </SlideOver>

      {/* Nested doc viewer for draft markdown */}
      <DocSlideOver slug={slug} docPath={openDocPath} onClose={() => setOpenDocPath(null)} />
    </>
  );
}
