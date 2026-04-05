/** Centered modal overlay with backdrop, title, and configurable size. */

"use client";

import { type ReactNode, useEffect } from "react";
import { cn } from "@/lib/utils";

const SIZE_MAP = {
  sm: "max-w-sm",
  md: "max-w-md",
  lg: "max-w-lg",
} as const;

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  size?: keyof typeof SIZE_MAP;
}

export function Modal({ open, onClose, title, children, size = "md" }: ModalProps) {
  // Close on Escape key
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center">
      {/* Backdrop click */}
      <div
        className="absolute inset-0"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Content */}
      <div
        className={cn(
          "relative w-full bg-card border-[3px] border-ink rounded-lg shadow-comic p-6 mx-4",
          SIZE_MAP[size],
        )}
      >
        {/* Header */}
        {title && (
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-foreground">{title}</h2>
            <button
              type="button"
              onClick={onClose}
              className="text-muted-foreground hover:text-foreground transition-colors text-xl leading-none"
              aria-label="Close modal"
            >
              ✕
            </button>
          </div>
        )}

        {!title && (
          <button
            type="button"
            onClick={onClose}
            className="absolute top-4 right-4 text-muted-foreground hover:text-foreground transition-colors text-xl leading-none"
            aria-label="Close modal"
          >
            ✕
          </button>
        )}

        {children}
      </div>
    </div>
  );
}
