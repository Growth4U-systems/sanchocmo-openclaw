"use client";

import type { ReactNode } from "react";

/**
 * Sancho Comic v2 building blocks shared by the Content Setup panels.
 * Mirrors the patterns used in `ConfigurationPipeline.tsx` so the whole
 * `Engine > Configuración` page reads as a single visual surface.
 *
 * Tokens (defined in `globals.css`):
 *   --sc-ink, --sc-paper-3, --sc-fg-{soft,muted,subtle},
 *   --sc-rust-{100,500,...}, --sc-sage-{100,500}, --sc-sun-{50,100,300},
 *   --pop-{xs,sm,md,lg}  (offset shadows that read as "comic" on parchment)
 */

const SC_INK = "var(--sc-ink)";
const SC_PAPER_3 = "var(--sc-paper-3)";

/** Outer panel wrapper — same look as the cards inside ConfigurationPipeline. */
export function ScCard({ children }: { children: ReactNode }) {
  return (
    <div
      className="rounded-sc-lg border-[3px] p-5"
      style={{
        background: SC_PAPER_3,
        borderColor: SC_INK,
        boxShadow: "var(--pop-md)",
      }}
    >
      {children}
    </div>
  );
}

/** Section header with icon + title + optional right slot. Uses a dashed
 *  divider underneath, matching the doc-card headers in ConfigurationPipeline. */
export function ScHeader({
  icon,
  title,
  subtitle,
  right,
}: {
  icon: string;
  title: string;
  subtitle?: ReactNode;
  right?: ReactNode;
}) {
  return (
    <div
      className="flex items-start gap-3 mb-5 pb-4 border-b-2 border-dashed"
      style={{ borderColor: SC_INK }}
    >
      <span className="text-2xl shrink-0 mt-0.5">{icon}</span>
      <div className="flex-1 min-w-0">
        <h3 className="font-heading font-bold text-lg leading-tight" style={{ color: SC_INK }}>
          {title}
        </h3>
        {subtitle && (
          <p className="text-xs mt-1 leading-relaxed" style={{ color: "var(--sc-fg-soft)" }}>
            {subtitle}
          </p>
        )}
      </div>
      {right && <div className="shrink-0">{right}</div>}
    </div>
  );
}

/** Small uppercase label — used for "Modo", "Provider", "Plantillas", etc. */
export function ScLabel({ children }: { children: ReactNode }) {
  return (
    <span
      className="font-heading uppercase text-[11px] tracking-wider font-bold block"
      style={{ color: "var(--sc-fg-muted)" }}
    >
      {children}
    </span>
  );
}

/** Native select styled to match the SC v2 inputs in IdeaQueueTab. */
export function ScSelect({
  value,
  onChange,
  disabled,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      className="w-full px-3 py-2 rounded-sc-md border-2 text-sm focus:outline-none disabled:opacity-50"
      style={{
        background: SC_PAPER_3,
        borderColor: SC_INK,
        color: SC_INK,
        boxShadow: "var(--pop-xs)",
      }}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}

/** Brick-red error box for inline mutation failures. */
export function ScErrorBox({ children }: { children: ReactNode }) {
  return (
    <div
      className="text-xs px-3 py-2 rounded-sc-md border-2"
      style={{
        background: "var(--sc-brick-bg)",
        borderColor: "var(--sc-brick-500)",
        color: "var(--sc-brick-500)",
      }}
    >
      {children}
    </div>
  );
}

/** Two-state toggle button used in modes / template selectors. */
export function ScToggleCard({
  active,
  title,
  description,
  onClick,
  disabled,
  badge,
  meta,
}: {
  active: boolean;
  title: ReactNode;
  description?: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  badge?: ReactNode;
  meta?: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="text-left p-3 rounded-sc-md border-[2px] sc-pop-hover disabled:opacity-50 disabled:cursor-not-allowed w-full"
      style={{
        background: active ? "var(--sc-sun-100)" : SC_PAPER_3,
        borderColor: SC_INK,
        boxShadow: "var(--pop-sm)",
      }}
    >
      <div className="flex items-center gap-2 mb-0.5">
        <span className="font-heading font-bold text-sm flex-1" style={{ color: SC_INK }}>
          {title}
        </span>
        {badge && <span className="shrink-0">{badge}</span>}
      </div>
      {description && (
        <div className="text-xs" style={{ color: "var(--sc-fg-muted)" }}>
          {description}
        </div>
      )}
      {meta && (
        <div className="text-[10px] mt-1 font-mono" style={{ color: "var(--sc-fg-subtle)" }}>
          {meta}
        </div>
      )}
    </button>
  );
}
