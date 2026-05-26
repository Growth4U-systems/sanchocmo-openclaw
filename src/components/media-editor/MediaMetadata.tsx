"use client";

import type { MediaAsset } from "@/lib/data/drafts";

/** Compact metadata table reused by both image sidebars. */
export function MediaMetadata({ media }: { media: MediaAsset }) {
  return (
    <dl className="text-[11px] text-[#5C6470] space-y-1 pt-3 border-t border-[#E8E2D9]">
      <div className="flex justify-between gap-2">
        <dt>Source</dt>
        <dd className="font-mono text-[#2C3E50]">{media.source}</dd>
      </div>
      {media.model && (
        <div className="flex justify-between gap-2">
          <dt>Modelo</dt>
          <dd className="font-mono text-[#2C3E50] truncate">{media.model}</dd>
        </div>
      )}
      {media.aspect_ratio && (
        <div className="flex justify-between gap-2">
          <dt>Ratio</dt>
          <dd className="font-mono text-[#2C3E50]">{media.aspect_ratio}</dd>
        </div>
      )}
      <div className="flex justify-between gap-2">
        <dt>Tipo</dt>
        <dd className="font-mono text-[#2C3E50]">{media.type}</dd>
      </div>
      <div className="flex justify-between gap-2">
        <dt>Creada</dt>
        <dd className="font-mono text-[#2C3E50]">
          {new Date(media.created_at).toLocaleString()}
        </dd>
      </div>
    </dl>
  );
}
