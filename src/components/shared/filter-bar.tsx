/** Flex row wrapper for filter controls with consistent spacing. */

import { type ReactNode } from "react";
import { cn } from "@/lib/utils";

interface FilterBarProps {
  children: ReactNode;
  className?: string;
}

export function FilterBar({ children, className }: FilterBarProps) {
  return (
    <div className={cn("flex flex-wrap items-center gap-3 mb-4", className)}>
      {children}
    </div>
  );
}
