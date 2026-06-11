"use client";

import type { ReactNode } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  /** Override default width (820px). Pass a CSS value e.g. "min(96vw, 1100px)". */
  width?: string;
  children: ReactNode;
}

const DEFAULT_WIDTH = "min(92vw, 820px)";

export function ConfigSheet({ open, onOpenChange, icon, title, description, width, children }: Props) {
  const w = width || DEFAULT_WIDTH;
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        // Floating comic drawer: margin off the window edges, ink border and
        // flat offset shadow instead of the flush full-height default.
        className="!max-w-[94vw] !inset-y-3 !right-3 !h-auto overflow-y-auto overflow-x-hidden rounded-2xl border-[3px] border-ink"
        style={{ width: w, boxShadow: "6px 6px 0 var(--sc-ink)" }}
        side="right"
      >
        <SheetHeader
          className="sticky top-0 z-10 border-b-2 pr-12"
          style={{ borderColor: "var(--sc-ink)", background: "var(--sc-paper-2)" }}
        >
          <SheetTitle className="flex items-center gap-2.5 font-heading font-bold text-xl" style={{ color: "var(--sc-ink)" }}>
            {icon && (
              <span
                className="grid place-items-center w-9 h-9 rounded-md border-2 text-base flex-shrink-0"
                style={{ background: "var(--sc-paper-2)", borderColor: "var(--sc-ink)" }}
              >
                {icon}
              </span>
            )}
            <span className="leading-tight">{title}</span>
          </SheetTitle>
          {description && (
            <p className="text-sm mt-1" style={{ color: "var(--sc-fg-muted)" }}>
              {description}
            </p>
          )}
        </SheetHeader>
        {/* The embedded forms repeat their own <h2> title next to Guardar —
            redundant under the sheet header, so hide it and keep the action
            right-aligned. */}
        <div className="px-5 pb-8 pt-1 [&_h2]:hidden [&_h2+button]:ml-auto">{children}</div>
      </SheetContent>
    </Sheet>
  );
}
