"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface Props {
  icon: ReactNode;
  title: ReactNode;
  /** Subtitle / summary line. */
  sub?: ReactNode;
  /** Right-aligned slot — typically an EditButton or a group of buttons/toggles. */
  right?: ReactNode;
  /** Optional content rendered below the main row (e.g. flash messages, expanded info). */
  footer?: ReactNode;
  /** Visually mark the row as inactive (still readable, but dimmed). */
  inactive?: boolean;
  className?: string;
}

export function ConfigRow({ icon, title, sub, right, footer, inactive, className }: Props) {
  return (
    <div
      className={cn(
        "rounded-sc-md border-[2px] overflow-hidden",
        className,
      )}
      style={{
        background: "var(--sc-paper-3)",
        borderColor: "var(--sc-ink)",
        boxShadow: "var(--pop-xs)",
        opacity: inactive ? 0.7 : 1,
      }}
    >
      <div className="grid grid-cols-[40px_1fr_auto] gap-3 items-center px-4 py-3">
        <span
          className="grid place-items-center w-10 h-10 rounded-md border-2 text-base flex-shrink-0"
          style={{ background: "var(--sc-paper-2)", borderColor: "var(--sc-ink)" }}
        >
          {icon}
        </span>
        <div className="min-w-0">
          <div className="font-semibold text-[15px] leading-tight" style={{ color: "var(--sc-ink)" }}>
            {title}
          </div>
          {sub && (
            <div className="text-xs mt-1" style={{ color: "var(--sc-fg-muted)" }}>
              {sub}
            </div>
          )}
        </div>
        {right && <div className="flex items-center gap-2 flex-shrink-0">{right}</div>}
      </div>
      {footer && <div className="px-4 pb-3">{footer}</div>}
    </div>
  );
}
