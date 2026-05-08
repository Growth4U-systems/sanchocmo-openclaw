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

const DEFAULT_WIDTH = "min(96vw, 820px)";

export function ConfigSheet({ open, onOpenChange, icon, title, description, width, children }: Props) {
  const w = width || DEFAULT_WIDTH;
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        className="!max-w-[96vw] overflow-y-auto overflow-x-hidden"
        style={{ width: w }}
        side="right"
      >
        <SheetHeader
          className="sticky top-0 z-10 bg-popover border-b pr-12"
          style={{ borderColor: "var(--sc-ink)" }}
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
        <div className="px-5 pb-8">{children}</div>
      </SheetContent>
    </Sheet>
  );
}
