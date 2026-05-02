"use client";

import type { CSSProperties } from "react";

/**
 * CSS-only thumbnail of a carousel template. The picker calls it with the
 * template's `preview` shape + the brand's primary/accent colors so each
 * card "looks like" the real first slide without round-tripping Playwright.
 *
 * Lossy by design: title lines render as solid bars, badges as pills, etc.
 * The real PNG/PDF rendering still happens at publish time.
 */

interface PreviewShape {
  ratio?: number;
  variant: "gradient-navy" | "white-card" | "split-cover";
  lines: Array<{ kind: "badge" | "title" | "text" | "footer"; width?: number }>;
}

export function TemplateThumbnail({
  preview,
  width,
  height,
  primaryColor,
  accentColor,
}: {
  preview: PreviewShape | null | undefined;
  width: number;
  height: number;
  primaryColor: string | null;
  accentColor: string | null;
}) {
  const ratio = preview?.ratio ?? width / height;
  const aspectClass = ratio > 1 ? "aspect-video" : ratio < 1 ? "aspect-[3/4]" : "aspect-square";

  const accent = accentColor || "#3ECDA5";
  const ink = primaryColor || "#032149";

  if (!preview) {
    return (
      <div
        className={`${aspectClass} w-full rounded border-2 grid place-items-center text-[10px]`}
        style={{
          background: "var(--sc-paper-2)",
          borderColor: "var(--sc-ink)",
          color: "var(--sc-fg-muted)",
        }}
      >
        {width}×{height}
      </div>
    );
  }

  const variantStyles: Record<PreviewShape["variant"], CSSProperties> = {
    "gradient-navy": {
      background: `linear-gradient(155deg, ${darken(ink)}, ${ink})`,
    },
    "white-card": { background: "#ffffff" },
    "split-cover": {
      background: `linear-gradient(90deg, ${ink} 60%, ${accent} 60%)`,
    },
  };

  return (
    <div
      className={`${aspectClass} w-full rounded border-2 relative overflow-hidden`}
      style={{
        ...variantStyles[preview.variant],
        borderColor: "var(--sc-ink)",
        boxShadow: "var(--pop-xs)",
      }}
    >
      {/* Accent stripe (left edge) — mimics the SC visual signature */}
      <div
        className="absolute left-0 top-0 bottom-0"
        style={{ width: "4%", background: accent }}
      />

      {/* Content stack */}
      <div className="absolute inset-0 px-3 py-2.5 flex flex-col gap-1.5 justify-between">
        {preview.lines.map((line, idx) => (
          <PreviewLine key={idx} line={line} accent={accent} variant={preview.variant} />
        ))}
      </div>

      {/* Slide number ghost (top-right) — common in 9-slide template */}
      {preview.variant === "gradient-navy" && (
        <div
          className="absolute top-1.5 right-2 font-bold text-[14px]"
          style={{
            color: "transparent",
            WebkitTextStroke: `1px ${withAlpha(accent, 0.55)}`,
          }}
        >
          01
        </div>
      )}
    </div>
  );
}

function PreviewLine({
  line,
  accent,
  variant,
}: {
  line: { kind: "badge" | "title" | "text" | "footer"; width?: number };
  accent: string;
  variant: PreviewShape["variant"];
}) {
  const dark = variant === "gradient-navy";
  const titleColor = dark ? "rgba(255,255,255,0.92)" : "rgba(15,23,42,0.92)";
  const textColor = dark ? "rgba(255,255,255,0.55)" : "rgba(15,23,42,0.55)";
  const widthPct = line.width != null ? `${line.width}%` : "100%";

  if (line.kind === "badge") {
    return (
      <span
        className="inline-block rounded-full px-1.5 py-0.5 text-[6px] font-bold uppercase tracking-wider self-start"
        style={{
          width: widthPct,
          maxWidth: "fit-content",
          background: withAlpha(accent, 0.15),
          color: accent,
          border: `1px solid ${withAlpha(accent, 0.4)}`,
        }}
      >
        ●
      </span>
    );
  }

  if (line.kind === "footer") {
    return (
      <div className="flex items-center gap-1.5 mt-auto">
        <span
          className="block h-1 rounded"
          style={{ width: "30%", background: textColor, opacity: 0.5 }}
        />
        <span className="flex-1" />
        <span
          className="block h-1 rounded"
          style={{ width: "20%", background: accent }}
        />
      </div>
    );
  }

  if (line.kind === "title") {
    return (
      <span
        className="block rounded h-2"
        style={{ width: widthPct, background: titleColor }}
      />
    );
  }

  return (
    <span
      className="block rounded h-1"
      style={{ width: widthPct, background: textColor }}
    />
  );
}

function darken(hex: string): string {
  // Drop ~20% lightness using a CSS color-mix-ish trick: just blend with #000.
  if (!/^#[0-9A-Fa-f]{6}$/.test(hex)) return hex;
  const r = Math.max(0, parseInt(hex.slice(1, 3), 16) - 20);
  const g = Math.max(0, parseInt(hex.slice(3, 5), 16) - 20);
  const b = Math.max(0, parseInt(hex.slice(5, 7), 16) - 20);
  return `rgb(${r}, ${g}, ${b})`;
}

function withAlpha(hex: string, a: number): string {
  if (!/^#[0-9A-Fa-f]{6}$/.test(hex)) return hex;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}
