/** Reusable card wrapper with Comic UI border + shadow styling. */

import { type ReactNode } from "react";
import { cn } from "@/lib/utils";

interface ComicCardProps {
  children: ReactNode;
  className?: string;
  hover?: boolean;
  onClick?: () => void;
  full?: boolean;
}

export function ComicCard({ children, className, hover, onClick, full }: ComicCardProps) {
  return (
    <div
      onClick={onClick}
      className={cn(
        "border-[3px] border-ink rounded-lg shadow-comic bg-card p-5",
        hover && "hover:-translate-y-0.5 hover:shadow-comic transition-all cursor-pointer",
        full && "col-span-full",
        className,
      )}
    >
      {children}
    </div>
  );
}
