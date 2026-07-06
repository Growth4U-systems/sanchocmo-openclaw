/** Expandable section with chevron toggle and optional count badge. */

"use client";

import { type ReactNode, useState } from "react";
import { cn } from "@/lib/utils";

interface CollapsibleSectionProps {
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
  icon?: string;
  count?: number;
}

export function CollapsibleSection({
  title,
  children,
  defaultOpen = false,
  icon,
  count,
}: CollapsibleSectionProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 py-2 text-left"
      >
        <svg
          className={cn(
            "h-4 w-4 shrink-0 transition-transform duration-200",
            open && "rotate-90",
          )}
          viewBox="0 0 16 16"
          fill="currentColor"
        >
          <path d="M6 3l5 5-5 5V3z" />
        </svg>

        {icon && <span className="text-base">{icon}</span>}

        <span className="text-sm font-semibold">{title}</span>

        {count != null && (
          <span className="ml-auto rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
            {count}
          </span>
        )}
      </button>

      <div
        className={cn(
          "overflow-hidden transition-[max-height] duration-300 ease-in-out",
          open ? "max-h-[2000px]" : "max-h-0",
        )}
      >
        <div className="pb-2">{children}</div>
      </div>
    </div>
  );
}
