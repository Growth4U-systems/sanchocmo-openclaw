"use client";

import type { ReactNode } from "react";
import Image from "next/image";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { MediaAsset } from "@/lib/data/drafts";

/**
 * Channel-native preview for a draft body. Renders the markdown wrapped in
 * the visual chrome of the target channel (LinkedIn post card, X tweet,
 * Instagram square, blog typography, email envelope) so the user can see
 * roughly how the piece will look once published.
 */
export function ChannelPreview({
  channel,
  body,
  brandSlug,
  media,
}: {
  channel: string;
  body: string;
  brandSlug: string;
  media?: MediaAsset[];
}) {
  const safeBody = typeof body === "string" ? body : "";
  const safeBrandSlug = typeof brandSlug === "string" && brandSlug.trim() ? brandSlug : "brand";
  const safeMedia = Array.isArray(media) ? media : [];
  // Skip non-image entries (e.g. the carousel PDF that lives at media[0])
  // so the preview always renders the cover slide as the visual.
  const primaryMedia = safeMedia.find((m) => m && typeof m.type === "string" && typeof m.url === "string" && m.type.startsWith("image/")) ?? null;
  const ch = typeof channel === "string" ? channel.toLowerCase() : "";
  const handle = `@${safeBrandSlug}`;

  if (ch === "linkedin") {
    return (
      <PreviewCard headerLabel="Vista previa LinkedIn">
        <div className="bg-white border border-[#E0E0E0] rounded-lg overflow-hidden font-sans">
          <div className="flex items-center gap-3 px-4 py-3">
            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-[#0A66C2] to-[#004182] flex items-center justify-center text-white font-bold text-lg">
              {safeBrandSlug.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-bold text-sm text-[#000000E6] truncate">{safeBrandSlug}</div>
              <div className="text-xs text-[#00000099] truncate">CMO · Marketing</div>
              <div className="text-xs text-[#00000099]">12m · 🌐</div>
            </div>
            <span className="text-[#00000099] text-xl">⋯</span>
          </div>
          <div className="px-4 pb-3 text-sm text-[#000000E6] whitespace-pre-wrap leading-relaxed">
            {stripMarkdownLight(safeBody)}
          </div>
          {primaryMedia && (
            <div className="relative w-full aspect-[1.91/1] bg-black">
              <Image
                src={primaryMedia.url}
                alt={primaryMedia.prompt || "Post media"}
                fill
                sizes="(max-width: 768px) 100vw, 600px"
                className="object-cover"
                unoptimized
              />
            </div>
          )}
          <div className="border-t border-[#E0E0E0] flex items-center justify-around py-1">
            {["👍 Recomendar", "💬 Comentar", "🔁 Compartir", "📨 Enviar"].map((label) => (
              <span key={label} className="text-xs text-[#00000099] font-semibold py-2">
                {label}
              </span>
            ))}
          </div>
        </div>
      </PreviewCard>
    );
  }

  if (ch === "twitter" || ch === "x") {
    const tweets = splitTwitterThread(safeBody);
    const isThread = tweets.length > 1;
    const headerLabel = isThread
      ? `Vista previa X / Twitter · Thread (${tweets.length} tweets)`
      : "Vista previa X / Twitter";
    return (
      <PreviewCard headerLabel={headerLabel}>
        <div className="space-y-2 relative">
          {tweets.map((tweet, i) => (
            <div
              key={i}
              className="bg-white border border-[#E1E8ED] rounded-2xl overflow-hidden font-sans relative"
            >
              {isThread && i > 0 && (
                <div className="absolute left-[35px] -top-2 w-0.5 h-4 bg-[#CFD9E0]" />
              )}
              <div className="flex gap-3 px-4 pt-3">
                <div className="w-10 h-10 rounded-full bg-black flex items-center justify-center text-white font-bold shrink-0">
                  {safeBrandSlug.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1 text-sm">
                    <span className="font-bold text-[#0F1419]">{safeBrandSlug}</span>
                    <span className="text-[#536471]">{handle} · 12m</span>
                    {isThread && (
                      <span className="ml-auto text-[10px] text-[#536471] bg-[#F1F2F4] px-2 py-0.5 rounded-full">
                        {i + 1}/{tweets.length}
                      </span>
                    )}
                  </div>
                  <div className="text-sm text-[#0F1419] mt-0.5 whitespace-pre-wrap leading-snug">
                    {tweet}
                  </div>
                  {i === 0 && primaryMedia && (
                    <div className="relative w-full aspect-[16/9] mt-2 rounded-2xl overflow-hidden border border-[#E1E8ED]">
                      <Image
                        src={primaryMedia.url}
                        alt={primaryMedia.prompt || "Post media"}
                        fill
                        sizes="(max-width: 768px) 100vw, 500px"
                        className="object-cover"
                        unoptimized
                      />
                    </div>
                  )}
                  <div className="flex items-center justify-between mt-3 max-w-md text-[#536471] text-xs">
                    <span>💬</span>
                    <span>🔁</span>
                    <span>❤️</span>
                    <span>📊</span>
                    <span>🔗</span>
                  </div>
                </div>
              </div>
              <div className="h-3" />
            </div>
          ))}
        </div>
      </PreviewCard>
    );
  }

  if (ch === "instagram" || ch === "ig") {
    return (
      <PreviewCard headerLabel="Vista previa Instagram">
        <div className="bg-white border border-[#DBDBDB] rounded-lg overflow-hidden font-sans max-w-sm mx-auto">
          <div className="flex items-center gap-2 px-3 py-2.5 border-b border-[#EFEFEF]">
            <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-[#FEDA75] via-[#D62976] to-[#4F5BD5] p-0.5">
              <div className="w-full h-full rounded-full bg-white flex items-center justify-center text-xs font-bold">
                {safeBrandSlug.charAt(0).toUpperCase()}
              </div>
            </div>
            <span className="text-sm font-semibold text-[#262626] flex-1">{safeBrandSlug}</span>
            <span className="text-[#262626] text-lg">⋯</span>
          </div>
          <div className="relative aspect-square bg-gradient-to-br from-[#F5F5F5] to-[#E8E8E8] flex items-center justify-center">
            {primaryMedia ? (
              <Image
                src={primaryMedia.url}
                alt={primaryMedia.prompt || "Post media"}
                fill
                sizes="(max-width: 768px) 100vw, 384px"
                className="object-cover"
                unoptimized
              />
            ) : (
              <span className="text-[#999] text-sm">[Imagen / Carrusel]</span>
            )}
          </div>
          <div className="px-3 py-2 space-y-1">
            <div className="flex gap-3 text-xl">❤️ 💬 ✈️</div>
            <div className="text-sm text-[#262626] whitespace-pre-wrap leading-snug">
              <strong>{safeBrandSlug}</strong> {stripMarkdownLight(safeBody)}
            </div>
          </div>
        </div>
      </PreviewCard>
    );
  }

  if (ch === "blog" || ch === "seo") {
    const title = extractTitle(safeBody);
    const sections = splitBlogSections(safeBody);
    const namedSections = sections.filter((s) => s.title);
    const minutes = readingTimeMinutes(safeBody);
    return (
      <PreviewCard headerLabel="Vista previa Blog / SEO">
        <div className="space-y-3">
          {/* Hero */}
          <div className="bg-white border border-[#E8E2D9] rounded-[10px] p-6">
            <h1 className="text-2xl font-heading font-bold text-[#2C3E50] m-0 leading-tight">
              {title || "(sin título)"}
            </h1>
            <div className="flex items-center gap-2 text-xs text-[#7A7A7A] mt-3">
              <span className="inline-flex items-center gap-1">
                <span className="w-5 h-5 rounded-full bg-gradient-to-br from-[#2F7D3B] to-[#065F46] text-white text-[10px] font-bold flex items-center justify-center">
                  {safeBrandSlug.charAt(0).toUpperCase()}
                </span>
                <span className="font-medium text-[#2C3E50]">{safeBrandSlug}</span>
              </span>
              <span>·</span>
              <span>{minutes} min de lectura</span>
              {namedSections.length > 0 && (
                <>
                  <span>·</span>
                  <span>{namedSections.length} secciones</span>
                </>
              )}
            </div>
          </div>

          {/* TOC — only when there are 2+ named sections */}
          {namedSections.length >= 2 && (
            <div className="bg-[#FAFAF8] border border-[#E8E2D9] rounded-[10px] p-4">
              <div className="text-[10px] uppercase tracking-[0.5px] text-[#7F8C8D] font-semibold mb-2">
                Índice
              </div>
              <ol className="text-sm text-[#2C3E50] space-y-1 list-decimal list-inside marker:text-[#7F8C8D]">
                {namedSections.map((s, i) => (
                  <li key={i} className="leading-snug">
                    {s.title}
                  </li>
                ))}
              </ol>
            </div>
          )}

          {/* Sections */}
          {sections.map((s, i) => (
            <article
              key={i}
              className="bg-white border border-[#E8E2D9] rounded-[10px] p-6 prose prose-sm max-w-none prose-headings:font-heading prose-headings:text-[#2C3E50] prose-a:text-rust"
            >
              {s.title && (
                <h2 className="text-xl font-heading font-semibold text-[#2C3E50] mt-0 mb-3">
                  {s.title}
                </h2>
              )}
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{s.content}</ReactMarkdown>
            </article>
          ))}

          {/* Hero image — show once after the first section if media exists */}
          {primaryMedia && (
            <div className="relative w-full aspect-[16/9] rounded-[10px] overflow-hidden border border-[#E8E2D9]">
              <Image
                src={primaryMedia.url}
                alt={primaryMedia.prompt || "Cover"}
                fill
                sizes="(max-width: 768px) 100vw, 800px"
                className="object-cover"
                unoptimized
              />
            </div>
          )}
        </div>
      </PreviewCard>
    );
  }

  if (ch === "email" || ch === "newsletter") {
    return (
      <PreviewCard headerLabel="Vista previa Email">
        <div className="bg-white border border-[#E8E2D9] rounded-lg overflow-hidden font-sans">
          <div className="px-4 py-3 border-b border-[#E8E2D9] bg-[#FAFAF8]">
            <div className="text-xs text-[#7A7A7A]">De: {safeBrandSlug}@brand.com</div>
            <div className="text-xs text-[#7A7A7A]">Para: tu@email.com</div>
            <div className="text-sm font-bold text-[#2C3E50] mt-1">
              {extractTitle(safeBody) || "(sin asunto)"}
            </div>
          </div>
          <article className="prose prose-sm max-w-none p-6">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{safeBody}</ReactMarkdown>
          </article>
        </div>
      </PreviewCard>
    );
  }

  return (
    <article className="prose prose-sm max-w-none dark:prose-invert prose-headings:font-heading prose-headings:text-rust prose-a:text-rust">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{safeBody}</ReactMarkdown>
    </article>
  );
}

export function isPlaceholderBody(body: string): boolean {
  const text = typeof body === "string" ? body : "";
  if (!text) return true;
  const trimmed = text.trim();
  if (trimmed.length === 0) return true;
  return /Pendiente:\s*(?:Dulcinea|Escudero Content) ejecutará/.test(trimmed);
}

function PreviewCard({ headerLabel, children }: { headerLabel: string; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <div className="text-[10px] uppercase tracking-[0.5px] text-[#7F8C8D] font-semibold">
        {headerLabel}
      </div>
      {children}
    </div>
  );
}

function stripMarkdownLight(body: string): string {
  let out = (typeof body === "string" ? body : "").replace(/<!--[\s\S]*?-->/g, "");

  // Drop a leading H1/H2 line entirely (the model sometimes prepends a draft
  // title that duplicates the task name). Only the first non-empty block —
  // mid-body H3+ subheaders are preserved (just stripped of their #).
  out = out.replace(/^\s*\n*#{1,2}\s+.*\n+/, "");

  return out
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/_([^_]+)_/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/^>\s+/gm, "")
    .replace(/^---+$/gm, "")
    .trim();
}

function extractTitle(body: string): string | null {
  const m = (typeof body === "string" ? body : "").match(/^#\s+(.+)$/m);
  return m ? m[1].trim() : null;
}

function stripInlineMarks(s: string): string {
  return (typeof s === "string" ? s : "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/_([^_]+)_/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/^>\s+/gm, "")
    .replace(/^---+$/gm, "")
    .trim();
}

// Split a Twitter draft body into individual tweets when it's a thread.
// Detection rules (in order):
//   1. 2+ lines starting with `\d+/\d+` (e.g. `1/5`, `2/5`) → numbered thread
//   2. Body separated by `---` lines into 2+ chunks where every chunk is short
//      enough to plausibly be a tweet (≤320 chars) → hr-separated thread
//   3. Otherwise → single tweet (or long-form), return [body]
export function splitTwitterThread(body: string): string[] {
  const text = typeof body === "string" ? body : "";
  let cleaned = text.replace(/<!--[\s\S]*?-->/g, "");
  cleaned = cleaned.replace(/^\s*\n*#{1,2}\s+.*\n+/, "");

  const numberedMatches = cleaned.match(/^\s*\d+\/\d+\b/gm) || [];
  if (numberedMatches.length >= 2) {
    const parts = cleaned
      .split(/(?=^\s*\d+\/\d+\b)/gm)
      .map((p) => stripInlineMarks(p))
      .filter((p) => p.length > 0);
    if (parts.length >= 2) return parts;
  }

  // Fallback for legacy drafts that used `**Tweet N (label)**` headers
  // instead of x/n numbering. Drop any "Hilo (N tweets)" preamble heading.
  const tweetHeaderRe = /^\s*\*\*Tweet\s+\d+(?:\s*\([^)]*\))?\*\*\s*$/gim;
  const tweetHeaderMatches = cleaned.match(tweetHeaderRe) || [];
  if (tweetHeaderMatches.length >= 2) {
    const withoutPreamble = cleaned.replace(/^\s*##\s+Hilo[^\n]*\n+/m, "");
    const parts = withoutPreamble
      .split(/^\s*\*\*Tweet\s+\d+(?:\s*\([^)]*\))?\*\*\s*$/im)
      .map((p) => stripInlineMarks(p))
      .filter((p) => p.length > 0);
    if (parts.length >= 2) return parts;
  }

  const hrParts = cleaned
    .split(/^\s*---+\s*$/m)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
  if (
    hrParts.length >= 2 &&
    hrParts.every((p) => p.length <= 320)
  ) {
    return hrParts.map((p) => stripInlineMarks(p));
  }

  return [stripMarkdownLight(text)];
}

export interface BlogSection {
  /** Section heading (`##` text). Empty string for the intro before the first H2. */
  title: string;
  content: string;
}

// Split a blog/SEO body into intro + sections by H2. The H1 (if present) is
// stripped — the caller renders it in a hero card. H3+ subheaders stay inside
// their section so ReactMarkdown can render them.
export function splitBlogSections(body: string): BlogSection[] {
  const cleaned = (typeof body === "string" ? body : "").replace(/<!--[\s\S]*?-->/g, "").replace(/^#\s+.+$/m, "");
  const parts = cleaned.split(/^##\s+/m);

  const sections: BlogSection[] = [];
  const intro = parts[0]?.trim();
  if (intro) sections.push({ title: "", content: intro });

  for (let i = 1; i < parts.length; i++) {
    const part = parts[i];
    const newlineIdx = part.indexOf("\n");
    const title = (newlineIdx === -1 ? part : part.slice(0, newlineIdx)).trim();
    const content = newlineIdx === -1 ? "" : part.slice(newlineIdx + 1).trim();
    sections.push({ title, content });
  }

  if (sections.length === 0) {
    sections.push({ title: "", content: cleaned.trim() });
  }
  return sections;
}

function readingTimeMinutes(body: string): number {
  const words = (typeof body === "string" ? body : "").split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
}
