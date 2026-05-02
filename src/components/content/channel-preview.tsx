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
  // Skip non-image entries (e.g. the carousel PDF that lives at media[0])
  // so the preview always renders the cover slide as the visual.
  const primaryMedia = media?.find((m) => m.type.startsWith("image/")) ?? null;
  const ch = channel.toLowerCase();
  const handle = `@${brandSlug}`;

  if (ch === "linkedin") {
    return (
      <PreviewCard headerLabel="Vista previa LinkedIn">
        <div className="bg-white border border-[#E0E0E0] rounded-lg overflow-hidden font-sans">
          <div className="flex items-center gap-3 px-4 py-3">
            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-[#0A66C2] to-[#004182] flex items-center justify-center text-white font-bold text-lg">
              {brandSlug.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-bold text-sm text-[#000000E6] truncate">{brandSlug}</div>
              <div className="text-xs text-[#00000099] truncate">CMO · Marketing</div>
              <div className="text-xs text-[#00000099]">12m · 🌐</div>
            </div>
            <span className="text-[#00000099] text-xl">⋯</span>
          </div>
          <div className="px-4 pb-3 text-sm text-[#000000E6] whitespace-pre-wrap leading-relaxed">
            {stripMarkdownLight(body)}
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
    return (
      <PreviewCard headerLabel="Vista previa X / Twitter">
        <div className="bg-white border border-[#E1E8ED] rounded-2xl overflow-hidden font-sans">
          <div className="flex gap-3 px-4 pt-3">
            <div className="w-10 h-10 rounded-full bg-black flex items-center justify-center text-white font-bold shrink-0">
              {brandSlug.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1 text-sm">
                <span className="font-bold text-[#0F1419]">{brandSlug}</span>
                <span className="text-[#536471]">{handle} · 12m</span>
              </div>
              <div className="text-sm text-[#0F1419] mt-0.5 whitespace-pre-wrap leading-snug">
                {stripMarkdownLight(body)}
              </div>
              {primaryMedia && (
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
                <span>💬 12</span>
                <span>🔁 34</span>
                <span>❤️ 256</span>
                <span>📊 1.2K</span>
                <span>🔗</span>
              </div>
            </div>
          </div>
          <div className="h-3" />
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
                {brandSlug.charAt(0).toUpperCase()}
              </div>
            </div>
            <span className="text-sm font-semibold text-[#262626] flex-1">{brandSlug}</span>
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
              <strong>{brandSlug}</strong> {stripMarkdownLight(body)}
            </div>
          </div>
        </div>
      </PreviewCard>
    );
  }

  if (ch === "blog" || ch === "seo") {
    return (
      <PreviewCard headerLabel="Vista previa Blog / SEO">
        <article className="prose prose-sm max-w-none bg-white border border-[#E8E2D9] rounded-lg p-6 prose-headings:font-heading prose-headings:text-[#2C3E50] prose-a:text-rust">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{body}</ReactMarkdown>
        </article>
      </PreviewCard>
    );
  }

  if (ch === "email" || ch === "newsletter") {
    return (
      <PreviewCard headerLabel="Vista previa Email">
        <div className="bg-white border border-[#E8E2D9] rounded-lg overflow-hidden font-sans">
          <div className="px-4 py-3 border-b border-[#E8E2D9] bg-[#FAFAF8]">
            <div className="text-xs text-[#7A7A7A]">De: {brandSlug}@brand.com</div>
            <div className="text-xs text-[#7A7A7A]">Para: tu@email.com</div>
            <div className="text-sm font-bold text-[#2C3E50] mt-1">
              {extractTitle(body) || "(sin asunto)"}
            </div>
          </div>
          <article className="prose prose-sm max-w-none p-6">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{body}</ReactMarkdown>
          </article>
        </div>
      </PreviewCard>
    );
  }

  return (
    <article className="prose prose-sm max-w-none dark:prose-invert prose-headings:font-heading prose-headings:text-rust prose-a:text-rust">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{body}</ReactMarkdown>
    </article>
  );
}

export function isPlaceholderBody(body: string): boolean {
  if (!body) return true;
  const trimmed = body.trim();
  if (trimmed.length === 0) return true;
  return /Pendiente:\s*Escudero Content ejecutará/.test(trimmed);
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
  return body
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
  const m = body.match(/^#\s+(.+)$/m);
  return m ? m[1].trim() : null;
}
